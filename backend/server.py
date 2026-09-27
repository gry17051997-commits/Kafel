import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal, Optional

import bcrypt
import jwt
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from pymongo import ASCENDING

load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.getenv("DB_NAME", "grafik_pracy")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "43200"))

Role = Literal["admin", "employee", "locator"]
PERSON_KEYS = ["P", "M", "L"]
DEFAULT_PEOPLE = {"P": "Paweł", "M": "Mateusz", "L": "Łukasz"}
WORKER_COLORS = {"P": "#4F8CFF", "M": "#8F6CFF", "L": "#35C98A"}
WAREHOUSES = ["PNT B", "PNT C", "UNICO", "SP3", "DC2", "DC1", "ECE", "PNT A", "GLP B", "GLP C"]
RATES = {"10": 300, "12": 360}
DEFAULT_TIMES = {
    "10": {"s1": "06:00", "e1": "16:00", "s2": "16:00", "e2": "02:00"},
    "12": {"s1": "06:00", "e1": "18:00", "s2": "18:00", "e2": "06:00"},
}

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
users = db.users
weeks = db.weeks
chat = db.chat
settings_col = db.settings

bearer = HTTPBearer(auto_error=False)


# ----------------------------- helpers -----------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, encoded: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], encoded.encode())
    except (ValueError, TypeError):
        return False


def make_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "role": user["role"],
        "iat": now_utc(),
        "exp": now_utc() + timedelta(minutes=JWT_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def public_user(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "email": doc["email"],
        "role": doc["role"],
        "displayName": doc.get("displayName", ""),
        "personKey": doc.get("personKey", ""),
    }


async def current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]
) -> dict:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Wymagane logowanie")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError()
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(401, "Sesja wygasła, zaloguj się ponownie")
    user = await users.find_one({"id": user_id, "deleted_at": None})
    if not user:
        raise HTTPException(401, "Konto nie istnieje")
    return user


async def optional_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]
) -> Optional[dict]:
    if not credentials:
        return None
    try:
        return await current_user(credentials)
    except HTTPException:
        return None


def require_roles(*allowed: str):
    async def dep(user: Annotated[dict, Depends(current_user)]) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(403, "Brak uprawnień do tej operacji")
        return user
    return dep


# ----------------------------- models -----------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    displayName: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AdminUserIn(BaseModel):
    email: EmailStr
    password: str = Field(default="", max_length=72)
    displayName: str = ""
    personKey: str = ""
    role: Role = "employee"


class ShiftModel(BaseModel):
    id: str
    shift: int
    person: Optional[str] = None
    warehouse: str = "PNT B"
    locked: bool = False
    manual: bool = False


class DayModel(BaseModel):
    dayIndex: int
    warehouse: str = "PNT B"
    shifts: list[ShiftModel]


class WeekIn(BaseModel):
    hours: int = 10
    rotation: str = "P"
    warehouse: str = "PNT B"
    days: list[DayModel]


class GenerateIn(BaseModel):
    hours: int = 10
    rotation: str = "P"
    warehouse: str = "PNT B"


class ClearShiftIn(BaseModel):
    shift: int


class SettingsIn(BaseModel):
    times: dict
    personColors: dict
    autoGenerateWeeks: bool = False
    vehicleRegistration: str = ""
    reportGroupLink: str = ""


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


# ----------------------------- schedule logic -----------------------------
def empty_week(warehouse: str = "PNT B") -> list:
    days = []
    for i in range(7):
        days.append({
            "dayIndex": i,
            "warehouse": warehouse,
            "shifts": [
                {"id": f"{i}-1", "shift": 1, "person": None, "warehouse": warehouse, "locked": False, "manual": False},
                {"id": f"{i}-2", "shift": 2, "person": None, "warehouse": warehouse, "locked": False, "manual": False},
            ],
        })
    return days


def generate_week(rotation: str = "P", warehouse: str = "PNT B") -> list:
    first = "P" if rotation == "P" else "M"
    second = "M" if first == "P" else "P"
    w = empty_week(warehouse)
    pairs = [
        (0, first, second), (1, second, first), (2, first, second),
        (3, second, first), (4, first, second), (5, second, first),
    ]
    for day, a, b in pairs:
        w[day]["shifts"][0]["person"] = a
        w[day]["shifts"][1]["person"] = b
    return w


async def get_settings_doc() -> dict:
    doc = await settings_col.find_one({"id": "shared"})
    if not doc:
        doc = {
            "id": "shared",
            "times": DEFAULT_TIMES["10"],
            "personColors": WORKER_COLORS,
            "autoGenerateWeeks": False,
            "vehicleRegistration": "",
            "reportGroupLink": "",
        }
        await settings_col.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


def serialize_week(doc: dict) -> dict:
    return {
        "weekStart": doc["weekStart"],
        "hours": doc.get("hours", 10),
        "rotation": doc.get("rotation", "P"),
        "warehouse": doc.get("warehouse", "PNT B"),
        "days": doc.get("days", empty_week()),
        "updatedAt": doc.get("updatedAt"),
        "updatedBy": doc.get("updatedBy", ""),
    }


# ----------------------------- lifespan -----------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await client.admin.command("ping")
    await users.create_index([("email", ASCENDING)], unique=True)
    await weeks.create_index([("weekStart", ASCENDING)], unique=True)
    await chat.create_index([("createdAt", ASCENDING)])

    email = os.environ["ADMIN_EMAIL"].lower()
    existing = await users.find_one({"email": email})
    if not existing:
        await users.insert_one({
            "id": str(ObjectId()),
            "email": email,
            "password_hash": hash_password(os.environ["ADMIN_PASSWORD"]),
            "role": "admin",
            "displayName": "Administrator",
            "personKey": "",
            "created_at": now_utc(),
            "deleted_at": None,
        })
    await get_settings_doc()
    yield
    client.close()


app = FastAPI(lifespan=lifespan, title="Grafik Pracy API")

origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------- auth routes -----------------------------
@app.get("/api/")
async def root():
    return {"status": "ok", "app": "Grafik Pracy"}


@app.post("/api/auth/register", status_code=201)
async def register(body: RegisterIn):
    email = str(body.email).lower()
    doc = {
        "id": str(ObjectId()),
        "email": email,
        "password_hash": hash_password(body.password),
        "role": "employee",
        "displayName": body.displayName or email.split("@")[0],
        "personKey": "",
        "created_at": now_utc(),
        "deleted_at": None,
    }
    if await users.find_one({"email": email}):
        raise HTTPException(409, "Ten e-mail jest już zarejestrowany")
    await users.insert_one(doc)
    token = make_token(doc)
    return {"access_token": token, "token_type": "bearer", "user": public_user(doc)}


@app.post("/api/auth/login")
async def login(body: LoginIn):
    doc = await users.find_one({"email": str(body.email).lower(), "deleted_at": None})
    if not doc or not verify_password(body.password, doc["password_hash"]):
        raise HTTPException(401, "Nieprawidłowy e-mail lub hasło")
    return {"access_token": make_token(doc), "token_type": "bearer", "user": public_user(doc)}


@app.get("/api/auth/me")
async def me(user: Annotated[dict, Depends(current_user)]):
    return public_user(user)


# ----------------------------- users (admin) -----------------------------
@app.get("/api/users")
async def list_users(_: Annotated[dict, Depends(require_roles("admin"))]):
    docs = await users.find({"deleted_at": None}).to_list(500)
    docs.sort(key=lambda d: (d.get("displayName") or d.get("email") or "").lower())
    return [public_user(d) for d in docs]


@app.post("/api/users", status_code=201)
async def create_user(body: AdminUserIn, _: Annotated[dict, Depends(require_roles("admin"))]):
    email = str(body.email).lower()
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "Hasło musi mieć min. 6 znaków")
    if await users.find_one({"email": email, "deleted_at": None}):
        raise HTTPException(409, "Ten e-mail jest już zarejestrowany")
    doc = {
        "id": str(ObjectId()),
        "email": email,
        "password_hash": hash_password(body.password),
        "role": body.role if body.role in ("admin", "employee", "locator") else "employee",
        "displayName": body.displayName or email.split("@")[0],
        "personKey": body.personKey if body.personKey in PERSON_KEYS else "",
        "created_at": now_utc(),
        "deleted_at": None,
    }
    await users.insert_one(doc)
    return public_user(doc)


@app.put("/api/users/{user_id}")
async def update_user(user_id: str, body: AdminUserIn, admin: Annotated[dict, Depends(require_roles("admin"))]):
    target = await users.find_one({"id": user_id, "deleted_at": None})
    if not target:
        raise HTTPException(404, "Nie znaleziono użytkownika")
    update = {
        "displayName": body.displayName or target.get("displayName", ""),
        "personKey": body.personKey if body.personKey in PERSON_KEYS else "",
        "email": str(body.email).lower(),
    }
    # An admin cannot demote themselves.
    if target["id"] == admin["id"]:
        update["role"] = "admin"
    else:
        update["role"] = body.role if body.role in ("admin", "employee", "locator") else target["role"]
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "Hasło musi mieć min. 6 znaków")
        update["password_hash"] = hash_password(body.password)
    await users.update_one({"id": user_id}, {"$set": update})
    doc = await users.find_one({"id": user_id})
    return public_user(doc)


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, admin: Annotated[dict, Depends(require_roles("admin"))]):
    if user_id == admin["id"]:
        raise HTTPException(400, "Nie możesz usunąć własnego konta")
    res = await users.update_one({"id": user_id}, {"$set": {"deleted_at": now_utc()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Nie znaleziono użytkownika")
    return {"ok": True}


@app.get("/api/people")
async def people(_: Annotated[Optional[dict], Depends(optional_user)]):
    """Person-key -> display name/color map, merged with any assigned users."""
    result = {}
    for k in PERSON_KEYS:
        result[k] = {"name": DEFAULT_PEOPLE[k], "color": WORKER_COLORS[k]}
    docs = await users.find({"deleted_at": None, "personKey": {"$in": PERSON_KEYS}}).to_list(100)
    for d in docs:
        pk = d.get("personKey")
        if pk in result and d.get("displayName"):
            result[pk]["name"] = d["displayName"]
    return result


# ----------------------------- schedule -----------------------------
@app.get("/api/schedule/{week_start}")
async def get_week(week_start: str, _: Annotated[Optional[dict], Depends(optional_user)]):
    doc = await weeks.find_one({"weekStart": week_start})
    if not doc:
        settings_doc = await get_settings_doc()
        return {
            "weekStart": week_start,
            "hours": 10,
            "rotation": "P",
            "warehouse": "PNT B",
            "days": empty_week(),
            "updatedAt": None,
            "updatedBy": "",
            "exists": False,
        }
    return {**serialize_week(doc), "exists": True}


@app.put("/api/schedule/{week_start}")
async def save_week(week_start: str, body: WeekIn, user: Annotated[dict, Depends(require_roles("admin"))]):
    doc = {
        "weekStart": week_start,
        "hours": body.hours,
        "rotation": body.rotation,
        "warehouse": body.warehouse,
        "days": [d.model_dump() for d in body.days],
        "updatedAt": now_utc().isoformat(),
        "updatedBy": user.get("displayName") or user["email"],
    }
    await weeks.update_one({"weekStart": week_start}, {"$set": doc}, upsert=True)
    return {**serialize_week(doc), "exists": True}


@app.post("/api/schedule/{week_start}/generate")
async def generate(week_start: str, body: GenerateIn, user: Annotated[dict, Depends(require_roles("admin"))]):
    days = generate_week(body.rotation, body.warehouse)
    doc = {
        "weekStart": week_start,
        "hours": body.hours,
        "rotation": body.rotation,
        "warehouse": body.warehouse,
        "days": days,
        "updatedAt": now_utc().isoformat(),
        "updatedBy": user.get("displayName") or user["email"],
    }
    await weeks.update_one({"weekStart": week_start}, {"$set": doc}, upsert=True)
    return {**serialize_week(doc), "exists": True}


@app.post("/api/schedule/{week_start}/clear-shift")
async def clear_shift(week_start: str, body: ClearShiftIn, user: Annotated[dict, Depends(require_roles("admin"))]):
    doc = await weeks.find_one({"weekStart": week_start})
    if not doc:
        raise HTTPException(404, "Brak grafiku dla tego tygodnia")
    for day in doc["days"]:
        for s in day["shifts"]:
            if s["shift"] == body.shift:
                s["person"] = None
    await weeks.update_one(
        {"weekStart": week_start},
        {"$set": {"days": doc["days"], "updatedAt": now_utc().isoformat(),
                  "updatedBy": user.get("displayName") or user["email"]}},
    )
    doc = await weeks.find_one({"weekStart": week_start})
    return {**serialize_week(doc), "exists": True}


@app.get("/api/summary/{week_start}")
async def summary(week_start: str, _: Annotated[Optional[dict], Depends(optional_user)]):
    doc = await weeks.find_one({"weekStart": week_start})
    people_map = {k: {"key": k, "name": DEFAULT_PEOPLE[k], "color": WORKER_COLORS[k], "shifts": 0, "hours": 0, "pay": 0} for k in PERSON_KEYS}
    udocs = await users.find({"deleted_at": None, "personKey": {"$in": PERSON_KEYS}}).to_list(100)
    for d in udocs:
        pk = d.get("personKey")
        if pk in people_map and d.get("displayName"):
            people_map[pk]["name"] = d["displayName"]
    total_shifts = total_hours = total_pay = 0
    if doc:
        hours = str(doc.get("hours", 10))
        rate = RATES.get(hours, 300)
        for day in doc.get("days", []):
            for s in day["shifts"]:
                p = s.get("person")
                if p in people_map:
                    people_map[p]["shifts"] += 1
                    people_map[p]["hours"] += int(hours)
                    people_map[p]["pay"] += rate
                    total_shifts += 1
                    total_hours += int(hours)
                    total_pay += rate
    return {
        "weekStart": week_start,
        "people": list(people_map.values()),
        "totals": {"shifts": total_shifts, "hours": total_hours, "pay": total_pay},
    }


# ----------------------------- settings -----------------------------
@app.get("/api/settings")
async def get_settings(_: Annotated[Optional[dict], Depends(optional_user)]):
    return await get_settings_doc()


@app.put("/api/settings")
async def update_settings(body: SettingsIn, _: Annotated[dict, Depends(require_roles("admin"))]):
    update = {
        "times": body.times,
        "personColors": body.personColors,
        "autoGenerateWeeks": body.autoGenerateWeeks,
        "vehicleRegistration": body.vehicleRegistration,
        "reportGroupLink": body.reportGroupLink,
    }
    await settings_col.update_one({"id": "shared"}, {"$set": update}, upsert=True)
    return await get_settings_doc()


# ----------------------------- chat -----------------------------
@app.get("/api/chat")
async def get_chat(user: Annotated[dict, Depends(current_user)]):
    docs = await chat.find({}).sort("createdAt", ASCENDING).to_list(300)
    return [
        {
            "id": d["id"],
            "userId": d["userId"],
            "displayName": d.get("displayName", ""),
            "text": d["text"],
            "createdAt": d["createdAt"],
            "mine": d["userId"] == user["id"],
        }
        for d in docs
    ]


@app.post("/api/chat", status_code=201)
async def post_chat(body: ChatIn, user: Annotated[dict, Depends(current_user)]):
    doc = {
        "id": str(ObjectId()),
        "userId": user["id"],
        "displayName": user.get("displayName") or user["email"],
        "text": body.text.strip(),
        "createdAt": now_utc().isoformat(),
    }
    await chat.insert_one(dict(doc))
    return {**doc, "mine": True}


@app.get("/api/meta")
async def meta(_: Annotated[Optional[dict], Depends(optional_user)]):
    return {
        "warehouses": WAREHOUSES,
        "personKeys": PERSON_KEYS,
        "rates": RATES,
        "defaultTimes": DEFAULT_TIMES,
    }
