"""
Backend tests for v3 Grafik features:
- Notifications feed (GET /api/notifications) - swap posted/accepted, lock
- Week lock/unlock (POST /api/schedule/{week}/lock) + 423 on locked-week writes
- Multi-generate skips locked weeks
- Route summary (GET /api/location/route-summary)
- Monthly summary (GET /api/summary/month/{y}/{m})
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@grafik.pl"
ADMIN_PASSWORD = "admin123"


def _monday_iso(offset_weeks: int = 0) -> str:
    today = datetime.utcnow().date()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=offset_weeks)
    return monday.isoformat()


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_h(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _mk_user(s, admin_h, person_key):
    email = f"test_v3_{person_key}_{uuid.uuid4().hex[:8]}@test.pl"
    r = s.post(f"{API}/users", headers=admin_h, json={
        "email": email, "password": "pass1234",
        "displayName": f"TEST V3 {person_key}", "personKey": person_key, "role": "employee",
    })
    assert r.status_code == 201, r.text
    r2 = s.post(f"{API}/auth/login", json={"email": email, "password": "pass1234"})
    tok = r2.json()["access_token"]
    return {"id": r.json()["id"], "personKey": person_key, "token": tok,
            "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


# ------------------- Notifications -------------------
class TestNotifications:
    WEEK = _monday_iso(offset_weeks=2500 + (int(datetime.utcnow().timestamp()) % 100))

    def test_unauth_401(self, s):
        r = s.get(f"{API}/notifications")
        assert r.status_code == 401

    def test_swap_post_and_accept_create_notifs(self, s, admin_h):
        # Setup: generate week + P/M users
        r = s.post(f"{API}/schedule/{self.WEEK}/generate", headers=admin_h,
                   json={"hours": 10, "rotation": "P", "warehouse": "PNT B"})
        assert r.status_code == 200
        wk = r.json()
        p_slot = None
        for day in wk["days"]:
            for sh in day["shifts"]:
                if sh["person"] == "P":
                    p_slot = (day["dayIndex"], sh["shift"])
                    break
            if p_slot:
                break
        eP = _mk_user(s, admin_h, "P")
        eM = _mk_user(s, admin_h, "M")

        # Get baseline count
        r = s.get(f"{API}/notifications", headers=admin_h)
        base = len(r.json())

        # Post swap
        d, sh = p_slot
        r = s.post(f"{API}/swaps", headers=eP["headers"], json={
            "weekStart": self.WEEK, "dayIndex": d, "shift": sh, "note": "TEST v3",
        })
        assert r.status_code == 201, r.text
        sid = r.json()["id"]

        # Accept swap
        r = s.post(f"{API}/swaps/{sid}/accept", headers=eM["headers"])
        assert r.status_code == 200, r.text

        # Verify notifications
        r = s.get(f"{API}/notifications", headers=admin_h)
        assert r.status_code == 200
        notifs = r.json()
        assert len(notifs) >= base + 2
        # newest first
        for i in range(1, len(notifs)):
            assert notifs[i - 1]["createdAt"] >= notifs[i]["createdAt"]
        types = [n["type"] for n in notifs[:5]]
        assert "swap_new" in types
        assert "swap_accepted" in types
        # required fields
        for n in notifs[:5]:
            assert "type" in n and "text" in n and "actorName" in n and "createdAt" in n


# ------------------- Week Lock -------------------
class TestWeekLock:
    WEEK = _monday_iso(offset_weeks=2700 + (int(datetime.utcnow().timestamp()) % 100))

    @pytest.fixture(scope="class", autouse=True)
    def _setup(self, request, s):
        # Login admin
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        cls = request.cls
        cls.admin_h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
        # Generate the week
        s.post(f"{API}/schedule/{cls.WEEK}/generate", headers=cls.admin_h,
               json={"hours": 10, "rotation": "P", "warehouse": "PNT B"})
        yield
        # TEARDOWN: ensure week is UNLOCKED at the end
        s.post(f"{API}/schedule/{cls.WEEK}/lock", headers=cls.admin_h, json={"locked": False})

    def test_lock_nonexistent_404(self, s):
        wk = _monday_iso(offset_weeks=4000)
        r = s.post(f"{API}/schedule/{wk}/lock", headers=self.admin_h, json={"locked": True})
        assert r.status_code == 404

    def test_non_admin_lock_403(self, s, admin_h):
        emp = _mk_user(s, admin_h, "")
        r = s.post(f"{API}/schedule/{self.WEEK}/lock", headers=emp["headers"], json={"locked": True})
        assert r.status_code == 403

    def test_lock_then_writes_return_423(self, s, admin_h):
        # Create a P user before lock for swap test
        eP = _mk_user(s, admin_h, "P")

        # Lock
        r = s.post(f"{API}/schedule/{self.WEEK}/lock", headers=self.admin_h, json={"locked": True})
        assert r.status_code == 200
        assert r.json()["locked"] is True

        # GET reflects
        r = s.get(f"{API}/schedule/{self.WEEK}")
        assert r.json()["locked"] is True

        # PUT save -> 423
        r = s.put(f"{API}/schedule/{self.WEEK}", headers=self.admin_h, json={
            "hours": 10, "rotation": "P", "warehouse": "PNT B",
            "days": r.json()["days"],
        })
        assert r.status_code == 423

        # generate -> 423
        r = s.post(f"{API}/schedule/{self.WEEK}/generate", headers=self.admin_h,
                   json={"hours": 10, "rotation": "P", "warehouse": "PNT B"})
        assert r.status_code == 423

        # clear-shift -> 423
        r = s.post(f"{API}/schedule/{self.WEEK}/clear-shift", headers=self.admin_h, json={"shift": 1})
        assert r.status_code == 423

        # swap post -> 423
        r = s.post(f"{API}/swaps", headers=eP["headers"], json={
            "weekStart": self.WEEK, "dayIndex": 0, "shift": 1, "note": "TEST locked",
        })
        assert r.status_code == 423

        # Manually insert a pending swap via DB is complex. Instead we already validated post 423.
        # For accept test: unlock, create swap, re-lock, then try to accept
        s.post(f"{API}/schedule/{self.WEEK}/lock", headers=self.admin_h, json={"locked": False})
        # Find P slot
        wj = s.get(f"{API}/schedule/{self.WEEK}").json()
        p_slot = None
        for day in wj["days"]:
            for sh in day["shifts"]:
                if sh["person"] == "P":
                    p_slot = (day["dayIndex"], sh["shift"])
                    break
            if p_slot:
                break
        d, sh = p_slot
        rr = s.post(f"{API}/swaps", headers=eP["headers"], json={
            "weekStart": self.WEEK, "dayIndex": d, "shift": sh, "note": "TEST for accept-lock",
        })
        assert rr.status_code == 201, rr.text
        sid = rr.json()["id"]
        # Re-lock
        s.post(f"{API}/schedule/{self.WEEK}/lock", headers=self.admin_h, json={"locked": True})
        # Accept -> 423
        eM = _mk_user(s, admin_h, "M")
        r = s.post(f"{API}/swaps/{sid}/accept", headers=eM["headers"])
        assert r.status_code == 423

        # Notification for lock exists
        r = s.get(f"{API}/notifications", headers=self.admin_h)
        assert any(n["type"] == "lock" for n in r.json()[:20])

        # Unlock and confirm write works again
        r = s.post(f"{API}/schedule/{self.WEEK}/lock", headers=self.admin_h, json={"locked": False})
        assert r.status_code == 200
        assert r.json()["locked"] is False
        r = s.post(f"{API}/schedule/{self.WEEK}/generate", headers=self.admin_h,
                   json={"hours": 10, "rotation": "P", "warehouse": "PNT B"})
        assert r.status_code == 200


# ------------------- Multi-generate skips locked -------------------
class TestMultiSkipsLocked:
    def test_multi_generate_skips_locked(self, s, admin_h):
        base_start = _monday_iso(offset_weeks=3200 + (int(datetime.utcnow().timestamp()) % 200))
        # Generate then lock the first week
        r = s.post(f"{API}/schedule/{base_start}/generate", headers=admin_h,
                   json={"hours": 10, "rotation": "P", "warehouse": "PNT B"})
        assert r.status_code == 200
        r = s.post(f"{API}/schedule/{base_start}/lock", headers=admin_h, json={"locked": True})
        assert r.status_code == 200

        try:
            r = s.post(f"{API}/schedule/generate-multi", headers=admin_h, json={
                "startWeek": base_start, "count": 3, "hours": 10,
                "rotation": "P", "warehouse": "PNT B", "alternateRotation": True,
            })
            assert r.status_code == 200, r.text
            j = r.json()
            assert base_start in j.get("skipped", [])
            assert base_start not in j.get("created", [])
            assert len(j["created"]) == 2
        finally:
            # UNLOCK
            s.post(f"{API}/schedule/{base_start}/lock", headers=admin_h, json={"locked": False})


# ------------------- Route summary -------------------
class TestRouteSummary:
    def test_route_summary(self, s, admin_h):
        # Push several points today
        emp_email = f"test_route_{uuid.uuid4().hex[:8]}@test.pl"
        r = s.post(f"{API}/auth/register", json={"email": emp_email, "password": "pass1234", "displayName": "TEST Route"})
        assert r.status_code == 201
        h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}

        pts = [
            {"lat": 52.20, "lng": 21.00, "accuracy": 5, "speed": 10},
            {"lat": 52.21, "lng": 21.02, "accuracy": 5, "speed": 15},
            {"lat": 52.23, "lng": 21.05, "accuracy": 5, "speed": 20},
        ]
        for p in pts:
            rr = s.post(f"{API}/location", headers=h, json=p)
            assert rr.status_code == 201

        today_iso = datetime.now(timezone.utc).date().isoformat()

        # Public GET (no auth) works
        r = s.get(f"{API}/location/route-summary", params={"date": today_iso})
        assert r.status_code == 200
        j = r.json()
        assert j["date"] == today_iso
        assert j["km"] >= 0
        assert j["durationMinutes"] >= 0
        assert j["points"] >= 3
        assert "avgSpeed" in j
        assert "warehouses" in j
        assert isinstance(j["warehouses"], list)


# ------------------- Monthly summary -------------------
class TestMonthlySummary:
    def test_monthly_summary(self, s, admin_h):
        # Use a future month, generate a week inside
        target = datetime.utcnow().date() + timedelta(weeks=3600)
        year = target.year
        month = target.month
        # Find a Monday inside this month
        d = target.replace(day=15)
        monday = d - timedelta(days=d.weekday())
        wk = monday.isoformat()
        r = s.post(f"{API}/schedule/{wk}/generate", headers=admin_h,
                   json={"hours": 10, "rotation": "P", "warehouse": "PNT B"})
        assert r.status_code == 200

        r = s.get(f"{API}/summary/month/{year}/{month}")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["year"] == year
        assert j["month"] == month
        assert isinstance(j["people"], list)
        assert len(j["people"]) == 3
        totals = j["totals"]
        # Since generated week has 12 shifts (6 days * 2), all in-month days contribute
        assert totals["shifts"] > 0
        assert totals["hours"] == totals["shifts"] * 10
        assert totals["pay"] == totals["shifts"] * 300
        # per-person color from settings
        for p in j["people"]:
            assert "color" in p
            assert "shifts" in p
            assert "hours" in p
            assert "pay" in p
            # 10h -> 300 per shift
            if p["shifts"] > 0:
                assert p["pay"] == p["shifts"] * 300

    def test_hours_12_rate_360(self, s, admin_h):
        target = datetime.utcnow().date() + timedelta(weeks=3700)
        year = target.year
        month = target.month
        d = target.replace(day=15)
        monday = d - timedelta(days=d.weekday())
        wk = monday.isoformat()
        s.post(f"{API}/schedule/{wk}/generate", headers=admin_h,
               json={"hours": 12, "rotation": "P", "warehouse": "PNT B"})
        r = s.get(f"{API}/summary/month/{year}/{month}")
        j = r.json()
        # 12h rate = 360
        if j["totals"]["shifts"] > 0:
            assert j["totals"]["pay"] == j["totals"]["shifts"] * 360
            assert j["totals"]["hours"] == j["totals"]["shifts"] * 12
