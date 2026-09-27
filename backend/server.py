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
locations = db.locations
swaps = db.swaps
notifications = db.notifications

DAYS_PL = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]

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


async def add_notification(kind: str, text: str, actor: dict) -> None:
    await notifications.insert_one({
        "id": str(ObjectId()),
        "type": kind,
        "text": text,
        "actorId": actor.get("id", ""),
        "actorName": actor.get("displayName") or actor.get("email", ""),
        "createdAt": now_utc().isoformat(),
    })


def haversine_km(a: dict, b: dict) -> float:
    import math
    r = 6371.0
    dlat = math.radians(b["lat"] - a["lat"])
    dlng = math.radians(b["lng"] - a["lng"])
    lat1 = math.radians(a["lat"])
    lat2 = math.radians(b["lat"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


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


class MultiGenerateIn(BaseModel):
    startWeek: str
    count: int = 4
    hours: int = 10
    rotation: str = "P"
    warehouse: str = "PNT B"
    alternateRotation: bool = True


class LocationIn(BaseModel):
    lat: float
    lng: float
    accuracy: float = 0
    speed: float = 0


class SwapIn(BaseModel):
    weekStart: str
    dayIndex: int
    shift: int
    note: str = ""


class LockIn(BaseModel):
    locked: bool = True


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
        "locked": doc.get("locked", False),
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
    await locations.create_index([("ts", ASCENDING)])
    await swaps.create_index([("status", ASCENDING)])
    await notifications.create_index([("createdAt", ASCENDING)])

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
    settings_doc = await get_settings_doc()
    person_colors = settings_doc.get("personColors", WORKER_COLORS)
    result = {}
    for k in PERSON_KEYS:
        result[k] = {"name": DEFAULT_PEOPLE[k], "color": person_colors.get(k, WORKER_COLORS[k])}
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
            "locked": False,
            "exists": False,
        }
    return {**serialize_week(doc), "exists": True}


async def ensure_week_unlocked(week_start: str) -> None:
    doc = await weeks.find_one({"weekStart": week_start})
    if doc and doc.get("locked"):
        raise HTTPException(423, "Tydzień jest zatwierdzony (zablokowany). Odblokuj, aby edytować.")


@app.put("/api/schedule/{week_start}")
async def save_week(week_start: str, body: WeekIn, user: Annotated[dict, Depends(require_roles("admin"))]):
    await ensure_week_unlocked(week_start)
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
    saved = await weeks.find_one({"weekStart": week_start})
    return {**serialize_week(saved), "exists": True}


@app.post("/api/schedule/{week_start}/generate")
async def generate(week_start: str, body: GenerateIn, user: Annotated[dict, Depends(require_roles("admin"))]):
    await ensure_week_unlocked(week_start)
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
    await ensure_week_unlocked(week_start)
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


@app.post("/api/schedule/{week_start}/lock")
async def lock_week(week_start: str, body: LockIn, user: Annotated[dict, Depends(require_roles("admin"))]):
    existing = await weeks.find_one({"weekStart": week_start})
    if not existing:
        raise HTTPException(404, "Brak grafiku dla tego tygodnia")
    await weeks.update_one({"weekStart": week_start}, {"$set": {"locked": body.locked}})
    label = week_start
    await add_notification(
        "lock",
        f"Grafik na tydzień {label} został {'zatwierdzony' if body.locked else 'odblokowany'}.",
        user,
    )
    doc = await weeks.find_one({"weekStart": week_start})
    return {**serialize_week(doc), "exists": True}


@app.get("/api/summary/{week_start}")
async def summary(week_start: str, _: Annotated[Optional[dict], Depends(optional_user)]):
    doc = await weeks.find_one({"weekStart": week_start})
    people_map = {k: {"key": k, "name": DEFAULT_PEOPLE[k], "color": WORKER_COLORS[k], "shifts": 0, "hours": 0, "pay": 0} for k in PERSON_KEYS}
    settings_doc = await get_settings_doc()
    person_colors = settings_doc.get("personColors", WORKER_COLORS)
    for k in PERSON_KEYS:
        people_map[k]["color"] = person_colors.get(k, WORKER_COLORS[k])
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


# ----------------------------- multi-week generation -----------------------------
def add_weeks_iso(week_start: str, n: int) -> str:
    y, m, d = map(int, week_start.split("-"))
    base = datetime(y, m, d)
    base = base + timedelta(days=7 * n)
    return f"{base.year}-{base.month:02d}-{base.day:02d}"


@app.post("/api/schedule/generate-multi")
async def generate_multi(body: MultiGenerateIn, user: Annotated[dict, Depends(require_roles("admin"))]):
    count = max(1, min(body.count, 12))
    created = []
    skipped = []
    for i in range(count):
        wk = add_weeks_iso(body.startWeek, i)
        existing = await weeks.find_one({"weekStart": wk})
        if existing and existing.get("locked"):
            skipped.append(wk)
            continue
        rotation = body.rotation
        if body.alternateRotation and i % 2 == 1:
            rotation = "M" if body.rotation == "P" else "P"
        days = generate_week(rotation, body.warehouse)
        doc = {
            "weekStart": wk,
            "hours": body.hours,
            "rotation": rotation,
            "warehouse": body.warehouse,
            "days": days,
            "updatedAt": now_utc().isoformat(),
            "updatedBy": user.get("displayName") or user["email"],
        }
        await weeks.update_one({"weekStart": wk}, {"$set": doc}, upsert=True)
        created.append(wk)
    return {"created": created, "count": len(created), "skipped": skipped}


# ----------------------------- vehicle location -----------------------------
@app.post("/api/location", status_code=201)
async def push_location(body: LocationIn, user: Annotated[dict, Depends(current_user)]):
    doc = {
        "id": str(ObjectId()),
        "userId": user["id"],
        "displayName": user.get("displayName") or user["email"],
        "lat": body.lat,
        "lng": body.lng,
        "accuracy": body.accuracy,
        "speed": body.speed,
        "ts": now_utc().isoformat(),
    }
    await locations.insert_one(dict(doc))
    return doc


@app.get("/api/location/latest")
async def latest_location(_: Annotated[Optional[dict], Depends(optional_user)]):
    doc = await locations.find_one({}, sort=[("ts", -1)])
    if not doc:
        return {"exists": False}
    doc.pop("_id", None)
    return {**doc, "exists": True}


@app.get("/api/location/history")
async def location_history(limit: int = 100, _: Annotated[Optional[dict], Depends(optional_user)] = None):
    limit = max(1, min(limit, 500))
    docs = await locations.find({}, {"_id": 0}).sort("ts", -1).to_list(limit)
    docs.reverse()
    return docs


# ----------------------------- shift swaps -----------------------------
def serialize_swap(d: dict) -> dict:
    return {
        "id": d["id"],
        "fromUserId": d["fromUserId"],
        "fromName": d.get("fromName", ""),
        "fromPersonKey": d.get("fromPersonKey", ""),
        "weekStart": d["weekStart"],
        "dayIndex": d["dayIndex"],
        "shift": d["shift"],
        "note": d.get("note", ""),
        "status": d.get("status", "pending"),
        "toUserId": d.get("toUserId"),
        "toName": d.get("toName", ""),
        "toPersonKey": d.get("toPersonKey", ""),
        "createdAt": d.get("createdAt"),
        "resolvedAt": d.get("resolvedAt"),
    }


@app.get("/api/swaps")
async def list_swaps(user: Annotated[dict, Depends(current_user)]):
    docs = await swaps.find({"status": {"$ne": "cancelled"}}).sort("createdAt", -1).to_list(200)
    return [serialize_swap(d) for d in docs]


@app.post("/api/swaps", status_code=201)
async def create_swap(body: SwapIn, user: Annotated[dict, Depends(current_user)]):
    if not user.get("personKey"):
        raise HTTPException(400, "Nie masz przypisanej osoby (P/M/L) — poproś administratora")
    week = await weeks.find_one({"weekStart": body.weekStart})
    if not week:
        raise HTTPException(404, "Brak grafiku dla tego tygodnia")
    if week.get("locked"):
        raise HTTPException(423, "Ten tydzień jest zatwierdzony — brak zamian")
    shift = None
    for day in week["days"]:
        if day["dayIndex"] == body.dayIndex:
            for s in day["shifts"]:
                if s["shift"] == body.shift:
                    shift = s
    if not shift:
        raise HTTPException(404, "Nie znaleziono zmiany")
    if shift.get("person") != user["personKey"]:
        raise HTTPException(403, "To nie jest Twoja zmiana")
    existing = await swaps.find_one({
        "weekStart": body.weekStart, "dayIndex": body.dayIndex,
        "shift": body.shift, "status": "pending",
    })
    if existing:
        raise HTTPException(409, "Ta zmiana już czeka na zamianę")
    doc = {
        "id": str(ObjectId()),
        "fromUserId": user["id"],
        "fromName": user.get("displayName") or user["email"],
        "fromPersonKey": user["personKey"],
        "weekStart": body.weekStart,
        "dayIndex": body.dayIndex,
        "shift": body.shift,
        "note": body.note,
        "status": "pending",
        "toUserId": None,
        "toName": "",
        "toPersonKey": "",
        "createdAt": now_utc().isoformat(),
        "resolvedAt": None,
    }
    await swaps.insert_one(dict(doc))
    await add_notification(
        "swap_new",
        f"{doc['fromName']} wystawił zmianę do przejęcia: {DAYS_PL[body.dayIndex]} · Zmiana {'I' if body.shift == 1 else 'II'}",
        user,
    )
    return serialize_swap(doc)


@app.post("/api/swaps/{swap_id}/accept")
async def accept_swap(swap_id: str, user: Annotated[dict, Depends(current_user)]):
    swap = await swaps.find_one({"id": swap_id})
    if not swap or swap["status"] != "pending":
        raise HTTPException(404, "Propozycja niedostępna")
    if not user.get("personKey"):
        raise HTTPException(400, "Nie masz przypisanej osoby (P/M/L)")
    if swap["fromUserId"] == user["id"]:
        raise HTTPException(400, "Nie możesz przejąć własnej zmiany")
    week = await weeks.find_one({"weekStart": swap["weekStart"]})
    if not week:
        raise HTTPException(404, "Brak grafiku dla tego tygodnia")
    if week.get("locked"):
        raise HTTPException(423, "Ten tydzień jest zatwierdzony — brak zamian")
    for day in week["days"]:
        if day["dayIndex"] == swap["dayIndex"]:
            for s in day["shifts"]:
                if s["shift"] == swap["shift"]:
                    s["person"] = user["personKey"]
                    s["manual"] = True
    await weeks.update_one(
        {"weekStart": swap["weekStart"]},
        {"$set": {"days": week["days"], "updatedAt": now_utc().isoformat(),
                  "updatedBy": user.get("displayName") or user["email"]}},
    )
    await swaps.update_one(
        {"id": swap_id},
        {"$set": {"status": "accepted", "toUserId": user["id"],
                  "toName": user.get("displayName") or user["email"],
                  "toPersonKey": user["personKey"], "resolvedAt": now_utc().isoformat()}},
    )
    doc = await swaps.find_one({"id": swap_id})
    await add_notification(
        "swap_accepted",
        f"{user.get('displayName') or user['email']} przejął zmianę od {swap.get('fromName', '')}: {DAYS_PL[swap['dayIndex']]} · Zmiana {'I' if swap['shift'] == 1 else 'II'}",
        user,
    )
    return serialize_swap(doc)


@app.post("/api/swaps/{swap_id}/cancel")
async def cancel_swap(swap_id: str, user: Annotated[dict, Depends(current_user)]):
    swap = await swaps.find_one({"id": swap_id})
    if not swap:
        raise HTTPException(404, "Propozycja niedostępna")
    if swap["fromUserId"] != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "Możesz anulować tylko własną propozycję")
    await swaps.update_one({"id": swap_id}, {"$set": {"status": "cancelled", "resolvedAt": now_utc().isoformat()}})
    return {"ok": True}


# ----------------------------- notifications -----------------------------
@app.get("/api/notifications")
async def list_notifications(user: Annotated[dict, Depends(current_user)]):
    docs = await notifications.find({}, {"_id": 0}).sort("createdAt", -1).to_list(50)
    return docs


# ----------------------------- route summary -----------------------------
def _monday_of(date_iso: str) -> tuple[str, int]:
    y, m, d = map(int, date_iso.split("-"))
    dt = datetime(y, m, d)
    day_index = dt.weekday()  # Mon=0
    monday = dt - timedelta(days=day_index)
    return f"{monday.year}-{monday.month:02d}-{monday.day:02d}", day_index


@app.get("/api/location/route-summary")
async def route_summary(date: str, _: Annotated[Optional[dict], Depends(optional_user)] = None):
    docs = await locations.find({"ts": {"$regex": f"^{date}"}}, {"_id": 0}).sort("ts", ASCENDING).to_list(1000)
    km = 0.0
    for i in range(1, len(docs)):
        km += haversine_km(docs[i - 1], docs[i])
    duration_min = 0
    if len(docs) >= 2:
        t0 = datetime.fromisoformat(docs[0]["ts"])
        t1 = datetime.fromisoformat(docs[-1]["ts"])
        duration_min = int((t1 - t0).total_seconds() // 60)
    avg_speed = round(km / (duration_min / 60), 1) if duration_min > 0 else 0
    # Scheduled warehouses for that day (from the schedule)
    warehouses_visited = []
    try:
        wk, di = _monday_of(date)
        week = await weeks.find_one({"weekStart": wk})
        if week:
            for day in week.get("days", []):
                if day["dayIndex"] == di:
                    for s in day["shifts"]:
                        if s.get("warehouse") and s["warehouse"] not in warehouses_visited:
                            warehouses_visited.append(s["warehouse"])
    except Exception:
        pass
    return {
        "date": date,
        "km": round(km, 2),
        "durationMinutes": duration_min,
        "points": len(docs),
        "avgSpeed": avg_speed,
        "startTs": docs[0]["ts"] if docs else None,
        "endTs": docs[-1]["ts"] if docs else None,
        "warehouses": warehouses_visited,
    }


# ----------------------------- monthly summary -----------------------------
@app.get("/api/summary/month/{year}/{month}")
async def monthly_summary(year: int, month: int, _: Annotated[Optional[dict], Depends(optional_user)] = None):
    import calendar
    settings_doc = await get_settings_doc()
    person_colors = settings_doc.get("personColors", WORKER_COLORS)
    people_map = {
        k: {"key": k, "name": DEFAULT_PEOPLE[k], "color": person_colors.get(k, WORKER_COLORS[k]),
            "shifts": 0, "hours": 0, "pay": 0}
        for k in PERSON_KEYS
    }
    udocs = await users.find({"deleted_at": None, "personKey": {"$in": PERSON_KEYS}}).to_list(100)
    for d in udocs:
        pk = d.get("personKey")
        if pk in people_map and d.get("displayName"):
            people_map[pk]["name"] = d["displayName"]

    days_in_month = calendar.monthrange(year, month)[1]
    week_cache: dict = {}
    total_shifts = total_hours = total_pay = 0
    for day_num in range(1, days_in_month + 1):
        date_iso = f"{year}-{month:02d}-{day_num:02d}"
        wk, di = _monday_of(date_iso)
        if wk not in week_cache:
            week_cache[wk] = await weeks.find_one({"weekStart": wk})
        week = week_cache[wk]
        if not week:
            continue
        hours = str(week.get("hours", 10))
        rate = RATES.get(hours, 300)
        for day in week.get("days", []):
            if day["dayIndex"] != di:
                continue
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
        "year": year,
        "month": month,
        "people": list(people_map.values()),
        "totals": {"shifts": total_shifts, "hours": total_hours, "pay": total_pay},
    }
