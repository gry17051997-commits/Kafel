"""
Backend regression tests for Grafik Pracy API.
Covers: auth, users (RBAC), schedule, summary, settings, chat, meta.
"""
import os
import uuid
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # Fallback: read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@grafik.pl"
ADMIN_PASSWORD = "admin123"


def _monday_iso(offset_weeks: int = 0) -> str:
    today = datetime.utcnow().date()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=offset_weeks)
    return monday.isoformat()


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["access_token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def employee(s):
    email = f"test_emp_{uuid.uuid4().hex[:8]}@test.pl"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "displayName": "TEST Emp"})
    assert r.status_code == 201, r.text
    data = r.json()
    return {"email": email, "token": data["access_token"], "user": data["user"], "headers": {"Authorization": f"Bearer {data['access_token']}", "Content-Type": "application/json"}}


# -------------------- Health / Meta --------------------
class TestHealth:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_meta(self, s):
        r = s.get(f"{API}/meta")
        assert r.status_code == 200
        j = r.json()
        assert j["personKeys"] == ["P", "M", "L"]
        assert j["rates"] == {"10": 300, "12": 360}
        assert "PNT B" in j["warehouses"]
        assert "10" in j["defaultTimes"] and "12" in j["defaultTimes"]


# -------------------- Auth --------------------
class TestAuth:
    def test_admin_login(self, admin_token):
        assert admin_token

    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG"})
        assert r.status_code == 401

    def test_register_and_me(self, s, employee):
        r = s.get(f"{API}/auth/me", headers=employee["headers"])
        assert r.status_code == 200
        assert r.json()["email"] == employee["email"]
        assert r.json()["role"] == "employee"

    def test_duplicate_register(self, s, employee):
        r = s.post(f"{API}/auth/register", json={"email": employee["email"], "password": "pass1234"})
        assert r.status_code == 409

    def test_me_without_token(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401


# -------------------- Users (RBAC + CRUD) --------------------
class TestUsersRBAC:
    def test_list_users_requires_auth(self, s):
        r = s.get(f"{API}/users")
        assert r.status_code == 401

    def test_list_users_employee_forbidden(self, s, employee):
        r = s.get(f"{API}/users", headers=employee["headers"])
        assert r.status_code == 403

    def test_list_users_admin_ok(self, s, admin_h):
        r = s.get(f"{API}/users", headers=admin_h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert any(u["email"] == ADMIN_EMAIL for u in r.json())

    def test_create_update_delete_user(self, s, admin_h):
        email = f"test_crud_{uuid.uuid4().hex[:8]}@test.pl"
        # create
        r = s.post(f"{API}/users", headers=admin_h, json={
            "email": email, "password": "pass1234", "displayName": "TEST CRUD",
            "personKey": "P", "role": "employee",
        })
        assert r.status_code == 201, r.text
        u = r.json()
        assert u["email"] == email
        assert u["personKey"] == "P"
        uid = u["id"]

        # verify persisted via list
        r = s.get(f"{API}/users", headers=admin_h)
        assert any(x["id"] == uid for x in r.json())

        # update
        r = s.put(f"{API}/users/{uid}", headers=admin_h, json={
            "email": email, "password": "", "displayName": "TEST CRUD2",
            "personKey": "M", "role": "locator",
        })
        assert r.status_code == 200
        u2 = r.json()
        assert u2["displayName"] == "TEST CRUD2"
        assert u2["personKey"] == "M"
        assert u2["role"] == "locator"

        # delete
        r = s.delete(f"{API}/users/{uid}", headers=admin_h)
        assert r.status_code == 200
        # confirm gone from list
        r = s.get(f"{API}/users", headers=admin_h)
        assert not any(x["id"] == uid for x in r.json())

    def test_create_user_short_password(self, s, admin_h):
        r = s.post(f"{API}/users", headers=admin_h, json={
            "email": f"TEST_short_{uuid.uuid4().hex[:6]}@test.pl", "password": "123",
        })
        assert r.status_code == 400

    def test_admin_cannot_delete_self(self, s, admin_h, admin_token):
        # Get admin id via /me
        me = s.get(f"{API}/auth/me", headers=admin_h).json()
        r = s.delete(f"{API}/users/{me['id']}", headers=admin_h)
        assert r.status_code == 400


# -------------------- Schedule --------------------
class TestSchedule:
    WEEK = _monday_iso(offset_weeks=200 + (int(datetime.utcnow().timestamp()) % 500))  # unique week per run

    def test_get_week_empty(self, s):
        r = s.get(f"{API}/schedule/{self.WEEK}")
        assert r.status_code == 200
        j = r.json()
        assert j["weekStart"] == self.WEEK
        assert len(j["days"]) == 7
        assert all(len(d["shifts"]) == 2 for d in j["days"])
        assert j["exists"] is False

    def test_non_admin_cannot_generate(self, s, employee):
        r = s.post(f"{API}/schedule/{self.WEEK}/generate", headers=employee["headers"], json={"hours": 10, "rotation": "P", "warehouse": "PNT B"})
        assert r.status_code == 403

    def test_generate_admin(self, s, admin_h):
        r = s.post(f"{API}/schedule/{self.WEEK}/generate", headers=admin_h, json={"hours": 10, "rotation": "P", "warehouse": "PNT B"})
        assert r.status_code == 200, r.text
        j = r.json()
        # Mon-Sat filled, Sun empty
        for i in range(6):
            for sh in j["days"][i]["shifts"]:
                assert sh["person"] in ("P", "M"), f"day {i}: {sh}"
        for sh in j["days"][6]["shifts"]:
            assert sh["person"] is None
        # persisted via GET
        r = s.get(f"{API}/schedule/{self.WEEK}")
        assert r.json()["exists"] is True

    def test_save_week(self, s, admin_h):
        # Modify one shift then PUT
        r = s.get(f"{API}/schedule/{self.WEEK}")
        j = r.json()
        j["days"][0]["shifts"][0]["person"] = "L"
        payload = {"hours": j["hours"], "rotation": j["rotation"], "warehouse": j["warehouse"], "days": j["days"]}
        r = s.put(f"{API}/schedule/{self.WEEK}", headers=admin_h, json=payload)
        assert r.status_code == 200
        # verify
        r = s.get(f"{API}/schedule/{self.WEEK}")
        assert r.json()["days"][0]["shifts"][0]["person"] == "L"

    def test_non_admin_cannot_save(self, s, employee):
        r = s.put(f"{API}/schedule/{self.WEEK}", headers=employee["headers"], json={"hours": 10, "rotation": "P", "warehouse": "PNT B", "days": []})
        assert r.status_code == 403

    def test_clear_shift(self, s, admin_h):
        r = s.post(f"{API}/schedule/{self.WEEK}/clear-shift", headers=admin_h, json={"shift": 1})
        assert r.status_code == 200
        j = r.json()
        for day in j["days"]:
            for sh in day["shifts"]:
                if sh["shift"] == 1:
                    assert sh["person"] is None


# -------------------- Summary --------------------
class TestSummary:
    WEEK = _monday_iso(offset_weeks=800 + (int(datetime.utcnow().timestamp()) % 300))

    def test_summary_10h(self, s, admin_h):
        r = s.post(f"{API}/schedule/{self.WEEK}/generate", headers=admin_h, json={"hours": 10, "rotation": "P", "warehouse": "PNT B"})
        assert r.status_code == 200
        r = s.get(f"{API}/summary/{self.WEEK}")
        assert r.status_code == 200
        j = r.json()
        # 6 shifts each for P and M (12 total). 10h -> 300 pln
        totals = j["totals"]
        assert totals["shifts"] == 12
        assert totals["hours"] == 120
        assert totals["pay"] == 3600
        by_key = {p["key"]: p for p in j["people"]}
        assert by_key["P"]["shifts"] == 6
        assert by_key["P"]["pay"] == 1800
        assert by_key["L"]["shifts"] == 0


# -------------------- Settings --------------------
class TestSettings:
    def test_get_public(self, s):
        r = s.get(f"{API}/settings")
        assert r.status_code == 200
        assert "times" in r.json()

    def test_put_requires_admin(self, s, employee):
        r = s.put(f"{API}/settings", headers=employee["headers"], json={"times": {}, "personColors": {}})
        assert r.status_code == 403

    def test_put_admin(self, s, admin_h):
        payload = {
            "times": {"s1": "06:00", "e1": "16:00", "s2": "16:00", "e2": "02:00"},
            "personColors": {"P": "#4F8CFF", "M": "#8F6CFF", "L": "#35C98A"},
            "autoGenerateWeeks": False,
            "vehicleRegistration": "TEST-123",
            "reportGroupLink": "",
        }
        r = s.put(f"{API}/settings", headers=admin_h, json=payload)
        assert r.status_code == 200
        assert r.json()["vehicleRegistration"] == "TEST-123"


# -------------------- Chat --------------------
class TestChat:
    def test_chat_requires_auth(self, s):
        r = s.get(f"{API}/chat")
        assert r.status_code == 401
        r = s.post(f"{API}/chat", json={"text": "hi"})
        assert r.status_code == 401

    def test_chat_post_and_get(self, s, employee):
        text = f"TEST hello {uuid.uuid4().hex[:6]}"
        r = s.post(f"{API}/chat", headers=employee["headers"], json={"text": text})
        assert r.status_code == 201
        assert r.json()["text"] == text
        r = s.get(f"{API}/chat", headers=employee["headers"])
        assert r.status_code == 200
        assert any(m["text"] == text and m["mine"] for m in r.json())
