# CLAUDE.md

Index. Full detail for each topic lives in `CLAUDE/<file>.md` — read the linked file before touching that area.

- [Commands](CLAUDE/commands.md) — dev/build/lint commands for frontend and backend.
- [Stack](CLAUDE/stack.md) — React+Vite+Tailwind frontend, Django backend, state/auth/routing shape.
- [Navigation](CLAUDE/navigation.md) — desktop/mobile nav layout, the "+" menu, unread polling.
- [Sign-up & Onboarding](CLAUDE/signup-onboarding.md) — register flow, consent gate, coach-mark tour.
- [Email & Password Reset](CLAUDE/email-password-reset.md) — Anymail senders, branded templates, canonical reset domain, username/email profile edits + email-change verification.
- [Key Gotchas](CLAUDE/key-gotchas.md) — non-obvious feed/chat/snap/camera/overlap/profile behaviors (friends, unfriend/block, archive course details+remove).
- [Models (non-obvious)](CLAUDE/models.md) — field semantics on CustomUser, Snap, Message, Event, etc.
- [Availability & Study Coordination](CLAUDE/availability-study-coordination.md) — free/busy computation and endpoints.
- [Events](CLAUDE/events.md) — event CRUD, RSVP, chat slash-command creation, conflict resolution, skips.
- [AI course parse](CLAUDE/ai-course-parse.md) — PDF/docx parsing, reparse/refine-with-dates, recurring assignments, editing saved courses, add-page layout.
- [Static Pages / Content Voice](CLAUDE/static-pages.md) — about/help/community/terms/privacy voice differences, help-page FAQ structure and screenshot slots.
- [SEO](CLAUDE/seo.md) — shared seo/config.js, build-time prerendered heads, Django sitemap, nginx canonical-host/404 rules, font + code-splitting constraints.
- [AI-Agent Bridge (MCP)](CLAUDE/agent-mcp.md) — `/mcp/v1/` server, agent access tokens, scopes, two-step confirm on write tools.
- [Deploy / Infra](CLAUDE/deploy-infra.md) — GCS media, Cloud Run/Dockerfile specifics, moderation cron.

# Security / Work Style

Use `logger = logging.getLogger(__name__)`, never `print()`. `start_local.md` is gitignored, never include anyinfo that belongs to gitignore files . Test scripts (`test_*.py`) and one-off PoC/exploit scripts (`poc_*.py`) are gitignored too — they are local-only, so write them freely but never commit them, and never assume one exists in a fresh clone or in CI. Work style: show thinking before acting, plan before changes (wait for go-ahead), explain *why* not *what*.
