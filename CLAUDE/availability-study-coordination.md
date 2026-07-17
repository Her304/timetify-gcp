# Availability & Study Coordination

- `backend/main/availability.py` — pure Python, no ORM. Key fns: `get_busy_blocks`, `get_free_slots`, `get_shared_free_slots`, `get_current_status`.
- Endpoints: `/api/availability/{me,friends}/`, `/api/availability/shared-gaps/`, `/api/study-invites/`. Friends endpoint: friend-gated, blocks respected, **no event titles leaked**.
- `shared-gaps` (POST): default multi-day mode uses `days_ahead` (capped 14). Optional `date` (`YYYY-MM-DD`) param switches to single-day mode (no cap) — used by the `/event` wizard's free-time picker to fetch slots for the chosen event day.
- Frontend: `components/study/{FindTimeSheet,StudyInviteBubble}.jsx`. Feed polls every 60 s.
