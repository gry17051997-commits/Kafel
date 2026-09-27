# Grafik Pracy — PRD

## Original problem statement
"napraw i zbuduj aplikacje na bazie repozytorium https://github.com/gry17051997-commits/GrafikPracyApp"
Rebuild/fix a Polish work-scheduling app for a small warehouse/logistics crew. The original was an
Expo + Firebase monolith (App.js/AppRuntime.js). Rebuilt on the Emergent stack.

## Architecture
- Frontend: Expo Router (SDK 57, React Native 0.86), @tanstack/react-query, @gorhom/bottom-sheet,
  react-native-reanimated, MDI vector icons. Dark-only theme in `src/theme.ts`.
- Backend: FastAPI + MongoDB (motor). JWT auth (bcrypt). Routes prefixed `/api`.
- Auth: email/password + roles (admin/employee/locator) + guest read-only mode. Admin seeded on startup.

## User personas
- Administrator: edits the shared weekly schedule, manages user accounts/roles/person-keys.
- Pracownik (employee): views schedule, sees own current/next shift + earnings, uses chat.
- Lokalizator (locator): limited role (no Grafik tab) — GPS role kept for future.
- Gość (guest): read-only preview, no chat/admin.

## Core requirements (static)
- Shared weekly schedule (Mon–Sun, 2 shifts/day) with worker color-coding (P/M/L).
- Rotation generator (10h/12h systems; rates 10h=300, 12h=360 PLN).
- Now dashboard, earnings summary, team chat, admin user panel, guest mode.

## Implemented (2026-06)
- [x] JWT auth: register/login/me, role protection, seeded admin (admin@grafik.pl / admin123)
- [x] Admin user CRUD (create/list/update/soft-delete, self-delete blocked)
- [x] Schedule: get/generate/save/clear-shift; week navigator + today highlight
- [x] Teraz dashboard (current/next shift, weekly hours & pay metrics, today crew, quick actions)
- [x] Zarobki summary (stack screen) with per-person filter chips + totals
- [x] Czat team chat (5s polling)
- [x] Ustawienia (account + logout + admin panel)
- [x] Dark theme, role-aware bottom tabs, toasts (no Alerts), bottom-sheet editors
- [x] Godziny & kolory: admin edits shift times + person colors + vehicle reg in Settings (whole team)
- [x] Auto-generowanie: admin generates 1/2/4/8 weeks ahead in one tap (alternating rotation)
- [x] Auto / GPS tab: live vehicle location map (native) + web fallback, foreground sharing with
      permission handling (granted/denied/blocked + Open Settings), route history
- [x] Zamiany zmian: employees propose swaps on their own shift; teammates accept (reassigns shift)
- [x] Verified: 37/37 backend tests pass; all frontend flows pass

## Tabs (5): Teraz · Grafik · Auto · Czat · Ustawienia
Zarobki + Zamiany are stack screens opened from Teraz/Grafik.

## Backlog / remaining
- P1: GPS / live vehicle location dashboard (Auto/GPS tab) — deferred by user
- P1: Configurable shift times & person colors UI in Settings (backend supports it)
- P2: Auto-generate next weeks (admin option), locked/approved schedule
- P2: WhatsApp-style hourly reports, payout history, shift swaps
- P2: Push notifications for shift/report changes (build-only feature)
- P2: Multi-company architecture

## Next tasks
- Add GPS/Auto tab if user wants live tracking.
- Expose shift-times editor in Settings.
