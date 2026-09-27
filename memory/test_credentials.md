# Test Credentials — Grafik Pracy

## Admin (seeded automatically on backend startup)
- Email: `admin@grafik.pl`
- Password: `admin123`
- Role: admin (can edit schedule, manage users)

## How to create more accounts
- Register a new EMPLOYEE via the app "Rejestracja" tab, or
- Log in as admin → Ustawienia → Pracownicy → "Dodaj" (can set role employee/locator/admin and person key P/M/L).

## Guest mode
- On the login screen tap "Kontynuuj jako gość" for read-only preview (no chat).

## Notes
- Backend: FastAPI on :8001, Mongo local. JWT auth (Authorization: Bearer <token>).
- Person keys: P = Paweł, M = Mateusz, L = Łukasz (assigned by admin).
