# Navigation

Desktop nav = feed / schedule; mobile bottom nav = feed / schedule / `+` / profile. **No `/friend` route** — the friends page is merged into `/feed`. Desktop: sticky `header-nav-app.jsx` (bell, avatar). Mobile: `mobile-top-bar.jsx` + `mobile-bottom-nav.jsx` (hidden on `/chat/<id>`; add `pb-24` to scrollable pages). **"+" menu** (`AddMenu.jsx`) in desktop header right + mobile center tab. `AppShell` polls `/api/chats/unread/` every 30 s.
