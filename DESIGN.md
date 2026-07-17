# Timetify — Design System & UI Patterns

> Living reference for the visual language, component atoms, and UI patterns used across the app.
> Source of truth for tokens: `frontend/src/components/shared/brand.jsx`.

---

## 1. Brand Identity

**Name:** timetify — always lowercase  
**Voice:** casual, direct, low-caps. Buttons say "log out" not "Log Out". Labels say "going" not "Accepted".  
**App icon:** coral rounded-square with a white lowercase `t`, decorated with organic lime + lilac blobs.

---

## 2. Color Tokens

All tokens live in `T` (exported from `brand.jsx`). Use Tailwind utility classes where possible; fall back to `style={{ color: T.coral }}` for dynamic JS values.

| Token | Value | Role |
|---|---|---|
| `T.coral` | `#ED6A4A` | Primary CTA, active state fills, badges, unread dots |
| `T.coralDk` | `#C04A2E` | Coral pressed / dark variant |
| `T.coralLt` | `#F9D9CC` | Declined status chip background |
| `T.lilac` | `#C8B0DF` | Avatar default, event blocks, accent |
| `T.lilacDk` | `#7A5BA0` | Lilac dark (hover/emphasis) |
| `T.lime` | `#C9EE6F` | Decorative blobs, "going" status chip, dot accents |
| `T.ink` | `#1F1A22` | All body text, active nav pill background |
| `T.ink60` | `rgba(31,26,34,.6)` | Secondary / muted text |
| `T.ink40` | `rgba(31,26,34,.4)` | Placeholder text, disabled states |
| `T.ink15` | `rgba(31,26,34,.15)` | Borders, dividers |
| `T.ink08` | `rgba(31,26,34,.08)` | Hover overlays, subtle chip backgrounds |
| `T.cream` | `#F8F4ED` | App background (logged-in body) |
| `T.paper` | `#FCFAF5` | Card / panel surfaces |

### Semantic usage
- **Active / selected** → coral fill (`T.coral`)
- **Inactive / muted** → ink at reduced opacity (`T.ink60`)
- **Positive / confirmed** → lime (`T.lime`) — "going" badge, availability dot
- **Negative / declined** → coral-light + coral-dark pair (`T.coralLt` / `T.coralDk`)
- **Neutral pending** → `T.ink08` bg + `T.ink60` fg

---

## 3. Typography

Fonts defined in `FF` (exported from `brand.jsx`).

| Token | Stack | Use |
|---|---|---|
| `FF.serif` | Bricolage Grotesque → Inter → system sans | Headings, wordmark, avatar initials, AppMark letter |
| `FF.sans` | Geist → system sans | Body copy, buttons, labels, nav |
| `FF.mono` | Geist Mono → SF Mono → Menlo | Uppercase mono labels (course codes, time stamps, badge counts, section headers) |

### Rules
- **Letter-spacing:** `-0.1` to `-0.6` on large serif headings; `+1.0–1.2` on `FF.mono` uppercase labels.
- **Line-height:** `1` for display; `1.4–1.5` for body.
- **Casing:** UI labels are **lowercase** by convention. `text-transform: uppercase` is reserved for `MonoLabel` / section headers in `FF.mono`.
- **Font weights:** `400` for Bricolage display; `500–600` for Geist body/buttons; `500` for Geist Mono.

---

## 4. Brand Atoms

All exported from `frontend/src/components/shared/brand.jsx`.

### `AppMark`
Coral rounded square with white `t`. Lime + lilac `Blob` decorations appear when `size >= 20` (or `decor` prop is true). Optional `shadow` adds a coral drop shadow. Used in the desktop nav header and landing hero.

```jsx
<AppMark size={32} />          // nav header
<AppMark size={64} shadow />   // landing / onboarding
```

### `Wordmark`
"timetify" in Bricolage Grotesque, with a coral dot positioned over the `i`. `color` and `dotColor` are configurable.

### `Avatar`
Colored disc with initials. `bg` defaults to `T.lilac`, `fg` to `T.ink`. Optional `ring` adds a double-ring halo (coral ring + cream gap) — used for active profile tab on mobile.

### `ProfileAvatar`
Renders `<img>` when `profilePictureUrl` is present; falls back to `Avatar` initials. Use everywhere a user's face appears — never use `Avatar` directly for a person that may have a photo.

### `PillBtn`
Coral rounded-full button. `size` = `sm | md | lg`. Opacity `0.5` + `cursor: not-allowed` when disabled.

```jsx
<PillBtn size="lg" onClick={submit}>confirm & save</PillBtn>
<PillBtn bg={T.ink} onClick={cancel}>cancel</PillBtn>
```

### `MonoLabel`
Uppercase mono caps. Used for time labels, day headers, course codes, section dividers.

```jsx
<MonoLabel fs={10} ls={1.4}>mon</MonoLabel>
```

### `Chip`
Filter tag / toggle pill. `active` flips to ink fill + cream text. Optional `dot` renders a 7px colored indicator dot (used for availability status).

```jsx
<Chip active={filter === 'today'} onClick={() => setFilter('today')}>today</Chip>
<Chip dot={T.lime}>free now</Chip>
```

### `Toggle`
iOS-style switch. Coral when `checked`, `T.ink15` when off. Sliding white knob with transition.

### `Icon`
Single-path SVG icons (25+), lucide-style. `fill="none"` except `play`. Stroke inherits `color` prop.

Available names: `x chevL chevR chevD chevU plus search heart msg share bolt cam flash flip settings calendar filter sort user bell lock info up file check edit play home logout trash flag dots block`

### `Blob`
Organic wavy SVG shape. `seed` 0–3 selects path variant. Used at large size (280–320px) as decorative page backgrounds (landing hero, add-course page).

### `Squiggle`
Hand-drawn underline SVG — coral stroke, used for emphasis on landing page headings.

### `Star`
4-point star sticker in lime. Used as editorial decoration on landing.

---

## 5. Navigation

### Desktop Header (`header-nav-app.jsx`)
`hidden md:flex` — sticky, `z-30`, `h-16`, cream background, ink-15 bottom border.

```
[AppMark 32px + "timetify"] ── [feed] [schedule] [friends] ─────── [+] [🔔 n] [avatar]
```

- **Nav pills:** `px-4 py-2 rounded-full text-sm font-medium`. Active = `bg-ink text-cream`. Inactive = `text-ink-60 hover:text-ink`.
- **Badge on pill:** coral rounded-full, Geist Mono, shown on "feed" only when not currently on `/feed`.
- **`+` button:** 40×40px coral disc → `AddMenu variant="popover"`.
- **Bell button:** 40×40px white disc, ink-15 border → `NotificationsPanel` dropdown. Coral badge counts: friend requests + unseen snaps + event invites + join requests + study invites + appealable reports.
- **Avatar:** `ProfileAvatar size={40}` → `/profile`.

### Mobile Bottom Nav (`mobile-bottom-nav.jsx`)
`md:hidden` — fixed, bottom-4, `z-40`. Two **liquid-glass** pods spread edge-to-edge via `justify-between px-4`: a frosted pill on the left, a standalone coral `+` disc on the right.

Layout (left → right):
```
┌─ frosted pill ──────────────────┐        ┌──────┐
│ [icon feed] [icon schedule] [◍] │        │  +   │
└─────────────────────────────────┘        └──────┘
```

- **Liquid glass material (`GLASS` const):** `rgba(252,250,245,0.60)` fill + `backdrop-blur(22px) saturate(180%)`, bright hairline border (`rgba(255,255,255,0.55)`), one soft shadow (`0 4px 14px rgba(31,26,34,0.10)`) plus an inner top highlight for the sheen. Shadows are intentionally light — no heavy drop shadow. Degrades to a ~60%-opaque cream pill where `backdrop-filter` is unsupported.
- **Frosted pill:** `padding: 6` around a row of 40px-tall elements → 52px pill height.
  - **Feed / schedule tabs:** icon **+ text label always visible** (`FF.sans`, 13px, 600). Inactive = `T.ink60` on transparent. Active = coral "lens" capsule (`T.coral`) with white content.
  - **Profile avatar:** `ProfileAvatar size={40}` at the end of the pill → `/profile`; coral `ring` when `/profile` active.
- **Standalone `+` pod:** 52×52px coral disc (matches pill height) floating on the same light shadow → opens `AddMenu variant="sheet"` (bottom sheet).
- **Badge:** dot (not count) on feed tab when `unreadChatCount > 0` and not on `/feed`.
- All elements share a uniform 40px inner height so the pill and the `+` pod align.
- Hidden on `/chat/<id>` — chat page occupies full height.
- Scrollable pages that show this nav must add `pb-24`.
- `data-tour` anchors preserved: `feed`, `schedule`, `profile`, `add`.

### `AddMenu`
Two variants using the same component:
- `variant="popover"` — positioned dropdown (desktop), top-right anchored.
- `variant="sheet"` — full-width bottom sheet with backdrop (mobile).

Options: **add class** → `/Add` | **add event** → `AddEventModal`.

---

## 6. Layout Patterns

### App Shell
- **Public pages** (landing, login, register, about, legal): cream or ink background, `HeaderNavigationBase` or none, `Footer`.
- **Authenticated pages**: cream body, `HeaderNavApp` (desktop) + `MobileTopBar` + `MobileBottomNav`, no footer.
- `body` background switches to `T.cream` when logged in.

### Modal pattern
Modals use a fixed overlay (`inset-0 z-50`) with a dark backdrop (`rgba(0,0,0,0.45)`). Content panel is white (`T.paper`), `rounded-2xl`, max-width constrained, scrollable within the panel. Dismiss via close button or clicking backdrop.

Multi-step modals (e.g. `AddEventModal`) manage `step` state locally and render different form sections per step.

### Bottom Sheet pattern
Full-width panel sliding up from the bottom. Backdrop covers the rest. Used for `AddMenu` on mobile and `FindTimeSheet` (study coordination).

### Tap-to-confirm destructive actions
Destructive buttons (delete event) show a confirmation state before executing. First tap → button label changes to "tap to confirm delete"; second tap → fires the API call. No separate modal needed.

---

## 7. Week View Calendar

File: `frontend/src/components/home/week_view.jsx`

- 7-column grid (MON–SUN) with a scrollable time axis (vertical, 24h).
- **Course blocks:** positioned absolutely within the day column using `top` + `height` derived from `start_time` / `end_time` in minutes.
- **Stable color palette:** 6 tones (`coral, lime, lilac, peach, mint, ink`). Hashed from course ID with `hashStr(courseId) % 6` — same course always gets the same color across all users.
- **Event blocks** (`EventBlock`): lilac fill, `z-index: 10` — floats above course blocks on overlap.
- **Time label axis:** left column, `MonoLabel` format (`8 AM`, `12 PM`).
- **Today column** highlighted with a subtle indicator.

### Course Palette
| Tone | Block bg | Dot accent | Code color |
|---|---|---|---|
| coral | `#F4A28A` | lime | `#5F2614` |
| lime | `#DCF5A9` | coral | `#3F5E14` |
| lilac | `#E5D5F2` | lime | `#5A3A85` |
| peach | `#F6D9C1` | lime | `#7A4520` |
| mint | `#CDE6D2` | coral | `#2D5538` |
| ink | `#1F1A22` | coral | cream text |

---

## 8. Feed

File: `frontend/src/components/feed/feed.jsx` (orchestrator) + section components.

### Filter chips
Three tabs: `today | my_classes | friends`. `Chip active` pattern — ink fill when selected.

### Avatar row
Horizontal scroll of friend `ProfileAvatar` tiles. Snap indicator dot (coral) over avatar when the friend has a live snap for a shared course.

### Inbox sections
- **Group chats:** show `GroupChatList` with expand/collapse toggle.
- **DMs:** `DmInboxList` sorted by recency.
- Both sections show last-message preview + unread count badge.
- "N friends free now" `Chip dot={T.lime}` at the top — driven by availability polling every 60s.

---

## 9. Chat

File: `frontend/src/components/chat/ChatThread.jsx`

- Message list is `flex flex-col-reverse` over a DESC-sorted array → newest at bottom (index 0), natural scroll.
- **Mine:** right-aligned, coral-tinted bubble.
- **Theirs:** left-aligned, ink-08 bubble.
- **Snap reply card:** compact 4:5 thumbnail preview inline above the message. Shows "snap · expired" placeholder when snap is purged.
- **Study invite bubble:** rendered by `StudyInviteBubble` for `message_type = study_invite`.
- Character counter appears at 1800 / 2000.
- Group chat header shows member count + `GroupInfoModal` button.
- "Find a time" button in DM header opens `FindTimeSheet`.

---

## 10. Notifications Panel

File: `frontend/src/components/application/app-navigation/NotificationsPanel.jsx`

Dropdown anchored to the bell button. Sections (in order):
1. **Friend requests** — accept / decline buttons.
2. **Event invites** — date + time summary, accept / decline.
3. **Event join requests** (creator-side) — approve / deny.
4. **Study invites** — proposed time, accept / decline.
5. **Snaps** — new snaps from friends.
6. **Event invite responses** — passive read (within 7 days).
7. **Moderation reports** — status label + appeal button if `can_appeal`.

Section headers use `MonoLabel` (10px, ink-40, ls 1.0) with an optional coral count badge.

---

## 11. Events

Files: `AddEventModal.jsx`, `EventBlock.jsx`, `EventDetailsModal.jsx`

### AddEventModal — 2-step flow
**Step 1 — Details**
- Name, date, time range, location (optional)
- Repeat toggle → weekday multi-select (MON–SUN pill toggles)
- Visibility: PRIVATE / PUBLIC radio
- "create group chat" toggle (default on)
- "allow join requests" toggle (PUBLIC only)

**Step 2 — Invite friends**
- Search input filters `friendsList`
- Each friend row has a checkmark toggle; selected friends highlighted with coral border + check icon

**EventBlock** (in week view)
- Lilac (`T.lilac`) fill, `z-index: 10`, rounded corners.
- Shows event name + time range in `FF.sans` lowercase.

**EventDetailsModal**
- Creator sees: edit / delete (tap-to-confirm).
- Invitee sees: accept / decline.
- Guest list with `ProfileAvatar` + status chip (going / pending / declined / request sent).
- Status chips: lime bg = going; coral-lt = declined; ink-08 = pending.
- PUBLIC events with `allow_join_requests=True` show a "request to join" button for non-invitees.

---

## 12. Snaps

Files: `SnapCaptureModal.jsx`, `SnapViewerModal.jsx`

- **Aspect ratio:** 4:5 portrait (matches Instagram stories / reels).
- **Max video:** 5 seconds.
- **Photo quality:** JPEG 0.85.
- Visibility options: `all_friends | selected | group`.
- Caption: max 50 words, lowercase input.
- Snap expiry: display cliff at midnight next day (`expires_at`). GCS blob purged at 30 days.
- `is_removed` = moderation / user delete — natural expiry does not set it.
- "Snap expired" placeholder shown in snap reply cards when media is gone.

---

## 13. Add Course (AI Parse)

File: `frontend/src/components/add/add.jsx`

- Upload PDF or DOCX → AI extracts schedule fields via OpenAI.
- Missing required fields disable "confirm & save".
- Overlap conflict → dedicated conflict screen with two cards: `source: incoming | existing`, each showing course details side-by-side.
- Reparse cap: 3 / 24h per user. First analyze is free. `reparse_remaining` shown in UI.

---

## 14. Animation & Motion

- **Landing page entries:** `fadeUp` (opacity 0→1, translateY 32px→0) and `fadeIn` (opacity 0→1). Staggered delays via `.d-0` through `.d-8` (0.1s → 1.35s). Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (spring-like).
- **Toggle knob:** `left` transition `0.18s ease`.
- **Toggle background:** `background 0.18s ease`.
- **Nav pills / buttons:** `transition-colors`, `transition-opacity` (Tailwind).
- **Prefer no animation** for purely functional UI (modals, chat, notifications) — motion is editorial, not decorative throughout the app.

---

## 15. Responsive Strategy

| Breakpoint | Nav | Layout |
|---|---|---|
| `< md` (mobile) | `MobileTopBar` + `MobileBottomNav` (liquid-glass pill + coral `+` pod) | Single column; modals go full-screen or bottom sheet |
| `≥ md` (desktop) | `HeaderNavApp` sticky 64px | Multi-column; modals are centered overlays; AddMenu is a popover |

Tailwind classes: `hidden md:flex` (desktop-only), `md:hidden` (mobile-only).  
Chat page hides the mobile bottom nav entirely (`pb-0`, no bottom padding needed).

---

## 16. Accessibility Notes

- `role="switch"` + `aria-checked` on `Toggle`.
- `aria-label` on icon-only buttons (bell, `+`, close).
- `aria-expanded` on `+` button when `AddMenu` is open.
- `ProfileAvatar` `<img>` uses `alt=""` (decorative) — screen readers skip it.
- All interactive elements have `cursor: pointer` (or `not-allowed` when disabled).
