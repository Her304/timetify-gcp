# Key Gotchas

- **Feed `friendsList`** — flatten via `.map(f => f.friend_details).filter(Boolean)`.
- **Feed = social hub** (`components/feed/`, friends page merged in): snaps strip (`AvatarRow`, snap-only) + requests banner + stacked group/DM lists. DM sort = unread → free now (`useFriendsAvailability`) → last active; unread = red dot, subtitle = shared classes. `PeopleSearch` = friends matched **locally** (search endpoint excludes friends) + strangers from `/api/friends/search/`. Snap-to-friend: `SnapCaptureModal presetAudience` → `selected` visibility, one recipient.
- **Chat list** — `flex flex-col-reverse` DESC (index 0 = newest).
- **Snap expiry** — `expires_at` is display cliff; `is_removed` is moderation-only, not set on natural expiry.
- **Camera release** — call `window.location.reload()` after clearing course or Chrome's camera indicator sticks.
- **Course overlap** — strict `<` only; 10:00-end / 10:00-start touch allowed.
- **Profile picture** — frontend downscales ≤1024 px + JPEG @ 0.7; `profile_picture` is write-only, clients read `profile_picture_url`.
