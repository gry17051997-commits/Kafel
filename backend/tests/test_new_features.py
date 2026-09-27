"""
Backend regression tests for NEW Grafik Pracy features:
- Multi-week generation (POST /api/schedule/generate-multi)
- Settings times & personColors (PUT /api/settings + /api/people + /api/summary)
- Vehicle location (POST/GET /api/location*)
- Shift swaps (POST/GET/accept/cancel /api/swaps)
"""
import os
import uuid
from datetime import datetime, timedelta

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


@pytest.fixture(scope="module")
def employee(s):
    email = f"test_emp_{uuid.uuid4().hex[:8]}@test.pl"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "displayName": "TEST Emp"})
    assert r.status_code == 201, r.text
    d = r.json()
    return {"email": email, "token": d["access_token"], "user": d["user"],
            "headers": {"Authorization": f"Bearer {d['access_token']}", "Content-Type": "application/json"}}


def _admin_create_user(s, admin_h, person_key):
    email = f"test_swap_{person_key}_{uuid.uuid4().hex[:8]}@test.pl"
    r = s.post(f"{API}/users", headers=admin_h, json={
        "email": email, "password": "pass1234",
        "displayName": f"TEST {person_key}", "personKey": person_key, "role": "employee",
    })
    assert r.status_code == 201, r.text
    # login as this user to obtain a token
    r2 = s.post(f"{API}/auth/login", json={"email": email, "password": "pass1234"})
    assert r2.status_code == 200, r2.text
    tok = r2.json()["access_token"]
    return {
        "id": r.json()["id"], "email": email, "personKey": person_key,
        "token": tok, "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
    }


# -------------------- Multi-week generation --------------------
class TestMultiGenerate:
    START = _monday_iso(offset_weeks=1200 + (int(datetime.utcnow().timestamp()) % 200))

    def test_non_admin_forbidden(self, s, employee):
        r = s.post(f"{API}/schedule/generate-multi", headers=employee["headers"], json={
            "startWeek": self.START, "count": 2, "hours": 10, "rotation": "P",
            "warehouse": "PNT B", "alternateRotation": True,
        })
        assert r.status_code == 403

    def test_generate_multi_admin(self, s, admin_h):
        r = s.post(f"{API}/schedule/generate-multi", headers=admin_h, json={
            "startWeek": self.START, "count": 4, "hours": 10, "rotation": "P",
            "warehouse": "PNT B", "alternateRotation": True,
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["count"] == 4
        assert len(j["created"]) == 4
        # verify consecutive weeks
        d0 = datetime.fromisoformat(self.START).date()
        for i, wk in enumerate(j["created"]):
            expected = (d0 + timedelta(weeks=i)).isoformat()
            assert wk == expected

        # verify each week via GET and rotation alternation
        for i, wk in enumerate(j["created"]):
            r2 = s.get(f"{API}/schedule/{wk}")
            assert r2.status_code == 200
            wj = r2.json()
            assert wj["exists"] is True
            # Rotation alternates: i even -> "P", odd -> "M"
            expected_rot = "P" if i % 2 == 0 else "M"
            assert wj["rotation"] == expected_rot, f"week {wk} rotation {wj['rotation']} != {expected_rot}"
            # Mon-Sat filled, Sun empty
            for di in range(6):
                for sh in wj["days"][di]["shifts"]:
                    assert sh["person"] in ("P", "M")
            for sh in wj["days"][6]["shifts"]:
                assert sh["person"] is None
            # Day 0 shift 1: alternating weeks flip P<->M on Monday
            monday_first = wj["days"][0]["shifts"][0]["person"]
            assert monday_first == expected_rot

    def test_count_clamp(self, s, admin_h):
        # count > 12 clamps to 12
        start = _monday_iso(offset_weeks=1700 + (int(datetime.utcnow().timestamp()) % 100))
        r = s.post(f"{API}/schedule/generate-multi", headers=admin_h, json={
            "startWeek": start, "count": 999, "hours": 10, "rotation": "P",
            "warehouse": "PNT B", "alternateRotation": False,
        })
        assert r.status_code == 200
        assert r.json()["count"] == 12


# -------------------- Settings times & colors --------------------
class TestSettingsExt:
    def test_settings_roundtrip_and_people(self, s, admin_h):
        payload = {
            "times": {"s1": "07:00", "e1": "17:00", "s2": "17:00", "e2": "03:00"},
            "personColors": {"P": "#111111", "M": "#222222", "L": "#333333"},
            "autoGenerateWeeks": True,
            "vehicleRegistration": "WX-TEST-1",
            "reportGroupLink": "https://example.test/report",
        }
        r = s.put(f"{API}/settings", headers=admin_h, json=payload)
        assert r.status_code == 200
        got = r.json()
        assert got["times"]["s1"] == "07:00"
        assert got["personColors"]["P"] == "#111111"
        assert got["autoGenerateWeeks"] is True
        assert got["vehicleRegistration"] == "WX-TEST-1"
        assert got["reportGroupLink"] == "https://example.test/report"

        # /api/settings public GET reflects
        r = s.get(f"{API}/settings")
        assert r.json()["personColors"]["M"] == "#222222"

        # /api/people returns updated colors
        r = s.get(f"{API}/people")
        p = r.json()
        assert p["P"]["color"] == "#111111"
        assert p["M"]["color"] == "#222222"
        assert p["L"]["color"] == "#333333"

        # /api/summary reflects new colors
        wk = _monday_iso(offset_weeks=2000 + (int(datetime.utcnow().timestamp()) % 50))
        s.post(f"{API}/schedule/{wk}/generate", headers=admin_h, json={"hours": 10, "rotation": "P", "warehouse": "PNT B"})
        r = s.get(f"{API}/summary/{wk}")
        sum_ = r.json()
        by_key = {p["key"]: p for p in sum_["people"]}
        assert by_key["P"]["color"] == "#111111"

        # Restore defaults
        default_payload = {
            "times": {"s1": "06:00", "e1": "16:00", "s2": "16:00", "e2": "02:00"},
            "personColors": {"P": "#4F8CFF", "M": "#8F6CFF", "L": "#35C98A"},
            "autoGenerateWeeks": False, "vehicleRegistration": "", "reportGroupLink": "",
        }
        s.put(f"{API}/settings", headers=admin_h, json=default_payload)

    def test_non_admin_put_forbidden(self, s, employee):
        r = s.put(f"{API}/settings", headers=employee["headers"], json={
            "times": {}, "personColors": {}, "autoGenerateWeeks": False,
            "vehicleRegistration": "", "reportGroupLink": "",
        })
        assert r.status_code == 403


# -------------------- Vehicle location --------------------
class TestLocation:
    def test_post_requires_auth(self, s):
        r = s.post(f"{API}/location", json={"lat": 52.2, "lng": 21.0, "accuracy": 5, "speed": 0})
        assert r.status_code == 401

    def test_post_and_read(self, s, employee):
        # Push two points
        r1 = s.post(f"{API}/location", headers=employee["headers"], json={
            "lat": 52.1, "lng": 21.0, "accuracy": 8, "speed": 12.5,
        })
        assert r1.status_code == 201, r1.text
        d1 = r1.json()
        assert d1["lat"] == 52.1

        r2 = s.post(f"{API}/location", headers=employee["headers"], json={
            "lat": 52.2, "lng": 21.1, "accuracy": 6, "speed": 9.9,
        })
        assert r2.status_code == 201

        # latest (public)
        r = s.get(f"{API}/location/latest")
        assert r.status_code == 200
        j = r.json()
        assert j["exists"] is True
        assert j["lat"] == 52.2
        assert j["lng"] == 21.1

        # history (public)
        r = s.get(f"{API}/location/history?limit=200")
        assert r.status_code == 200
        hist = r.json()
        assert isinstance(hist, list)
        assert len(hist) >= 2
        # chronological (oldest first)
        for i in range(1, len(hist)):
            assert hist[i - 1]["ts"] <= hist[i]["ts"]

    def test_history_limit_clamp(self, s):
        r = s.get(f"{API}/location/history?limit=9999")
        assert r.status_code == 200
        assert len(r.json()) <= 500


# -------------------- Shift swaps --------------------
class TestSwaps:
    WEEK = _monday_iso(offset_weeks=1500 + (int(datetime.utcnow().timestamp()) % 100))

    @pytest.fixture(scope="class")
    def env(self, s, admin_h):
        # Ensure week exists with P/M assigned
        r = s.post(f"{API}/schedule/{self.WEEK}/generate", headers=admin_h, json={
            "hours": 10, "rotation": "P", "warehouse": "PNT B",
        })
        assert r.status_code == 200
        wk = r.json()
        # Find day/shift where person == "P" and where person == "M"
        p_slot = None
        m_slot = None
        for day in wk["days"]:
            for sh in day["shifts"]:
                if sh["person"] == "P" and p_slot is None:
                    p_slot = (day["dayIndex"], sh["shift"])
                if sh["person"] == "M" and m_slot is None:
                    m_slot = (day["dayIndex"], sh["shift"])
        assert p_slot and m_slot
        # Create two employees with distinct personKeys
        e_p = _admin_create_user(s, admin_h, "P")
        e_m = _admin_create_user(s, admin_h, "M")
        return {"p_slot": p_slot, "m_slot": m_slot, "e_p": e_p, "e_m": e_m}

    def test_propose_not_yours(self, s, env):
        # E_M proposes swap on P's slot -> 403
        d, sh = env["p_slot"]
        r = s.post(f"{API}/swaps", headers=env["e_m"]["headers"], json={
            "weekStart": self.WEEK, "dayIndex": d, "shift": sh, "note": "TEST not mine",
        })
        assert r.status_code == 403

    def test_propose_and_duplicate_and_accept(self, s, env, admin_h):
        d, sh = env["p_slot"]
        # E_P proposes -> 201
        r = s.post(f"{API}/swaps", headers=env["e_p"]["headers"], json={
            "weekStart": self.WEEK, "dayIndex": d, "shift": sh, "note": "TEST swap",
        })
        assert r.status_code == 201, r.text
        swap = r.json()
        assert swap["status"] == "pending"
        assert swap["fromPersonKey"] == "P"
        swap_id = swap["id"]

        # Duplicate pending on same shift -> 409
        r = s.post(f"{API}/swaps", headers=env["e_p"]["headers"], json={
            "weekStart": self.WEEK, "dayIndex": d, "shift": sh, "note": "dup",
        })
        assert r.status_code == 409

        # Accept own -> 400
        r = s.post(f"{API}/swaps/{swap_id}/accept", headers=env["e_p"]["headers"])
        assert r.status_code == 400

        # GET list contains it
        r = s.get(f"{API}/swaps", headers=env["e_m"]["headers"])
        assert r.status_code == 200
        assert any(x["id"] == swap_id and x["status"] == "pending" for x in r.json())

        # E_M accepts -> shift becomes M
        r = s.post(f"{API}/swaps/{swap_id}/accept", headers=env["e_m"]["headers"])
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "accepted"
        assert j["toPersonKey"] == "M"

        # Verify week's shift is now M
        r = s.get(f"{API}/schedule/{self.WEEK}")
        wk = r.json()
        s_person = None
        for day in wk["days"]:
            if day["dayIndex"] == d:
                for x in day["shifts"]:
                    if x["shift"] == sh:
                        s_person = x["person"]
        assert s_person == "M"

    def test_cancel_own(self, s, env):
        # Propose new one on M's slot as E_M, cancel it
        d, sh = env["m_slot"]
        # Re-generate the week to reset any prior swaps' effect on this slot? Not needed — M slot untouched.
        r = s.post(f"{API}/swaps", headers=env["e_m"]["headers"], json={
            "weekStart": self.WEEK, "dayIndex": d, "shift": sh, "note": "TEST cancel",
        })
        assert r.status_code == 201, r.text
        sid = r.json()["id"]
        r = s.post(f"{API}/swaps/{sid}/cancel", headers=env["e_m"]["headers"])
        assert r.status_code == 200
        # Cancelled swaps excluded from GET
        r = s.get(f"{API}/swaps", headers=env["e_m"]["headers"])
        assert not any(x["id"] == sid for x in r.json())

    def test_list_swaps_requires_auth(self, s):
        r = s.get(f"{API}/swaps")
        assert r.status_code == 401
