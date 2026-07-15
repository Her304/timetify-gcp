# Availability & Study Coordination

- `backend/main/availability.py` — pure Python, no ORM. Key fns: `get_busy_blocks`, `get_free_slots`, `get_shared_free_slots`, `get_current_status`.
- Endpoints: `/api/availability/{me,friends}/`, `/api/availability/shared-gaps/`, `/api/study-invites/`. Friends endpoint: friend-gated, blocks respected, **no event titles leaked**.
- Frontend: `components/study/{FindTimeSheet,StudyInviteBubble}.jsx`. Feed polls every 60 s.
