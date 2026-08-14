# Stack

`frontend/` React + Vite + Tailwind · `backend/` Django, single `main/` app. State lives in `App.jsx` → props; `AppShell` wraps router. JWT in localStorage via `authenticatedFetch`. React Router v7 (`react-router-dom` ^7, used in library mode — no framework/SSR config); `/feed` and `/chat/:roomId` protected. Route components are `lazy()`-split behind one `<Suspense>` in `App.jsx`, except the logged-out entry points — see [SEO](seo.md) before making Landing/Login/Register lazy. Body bg `cream` when logged in.
