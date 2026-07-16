# CLAUDE.md

Index. Full detail for each topic lives in `CLAUDE/<file>.md` — read the linked file before touching that area.

- [Commands](CLAUDE/commands.md) — dev/build/lint commands for frontend and backend.
- [Stack](CLAUDE/stack.md) — React+Vite+Tailwind frontend, Django backend, state/auth/routing shape.
- [Navigation](CLAUDE/navigation.md) — desktop/mobile nav layout, the "+" menu, unread polling.
- [Sign-up & Onboarding](CLAUDE/signup-onboarding.md) — register flow, consent gate, coach-mark tour.
- [Email & Password Reset](CLAUDE/email-password-reset.md) — Anymail senders, branded templates, canonical reset domain.
- [Key Gotchas](CLAUDE/key-gotchas.md) — non-obvious feed/chat/snap/camera/overlap behaviors.
- [Models (non-obvious)](CLAUDE/models.md) — field semantics on CustomUser, Snap, Message, Event, etc.
- [Availability & Study Coordination](CLAUDE/availability-study-coordination.md) — free/busy computation and endpoints.
- [Events](CLAUDE/events.md) — event CRUD, RSVP, chat slash-command creation, conflict resolution, skips.
- [AI course parse](CLAUDE/ai-course-parse.md) — PDF/docx parsing, reparse/refine-with-dates, recurring assignments, editing saved courses, add-page layout.
- [Static Pages / Content Voice](CLAUDE/static-pages.md) — about/help/community/terms/privacy voice differences, help-page FAQ structure and screenshot slots.
- [Deploy / Infra](CLAUDE/deploy-infra.md) — GCS media, Cloud Run/Dockerfile specifics, moderation cron.
- [Security / Work Style](CLAUDE/security-work-style.md) — logging rules, gitignored files, collaboration style.

# Security / Work Style

Use `logger = logging.getLogger(__name__)`, never `print()`. `start_local.md` is gitignored, never include anyinfo that belongs to gitignore files . Work style: show thinking before acting, plan before changes (wait for go-ahead), explain *why* not *what*.
