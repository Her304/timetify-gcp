# SEO

The app is a client-rendered SPA served as static files by nginx, with Django on a separate Cloud Run service. That split drives every decision below.

## Single source of truth

`frontend/src/seo/config.js` holds all public-route titles/descriptions/schema. It is imported by **two** consumers — `src/components/shared/Seo.jsx` at runtime and `scripts/prerender.mjs` at build time — so it must stay plain JS: no JSX, no browser globals, no Vite-only syntax, and **relative imports need explicit `.js` extensions** (bare Node resolves them; Vite would tolerate either).

Same reason `help.jsx`'s FAQ array lives in `help/faqData.js`: the `FAQPage` schema is generated from the exact array the page renders, and Node cannot import `.jsx`.

## Why metadata is applied imperatively

`Seo.jsx` mutates existing `<head>` tags rather than using React 19's native `<title>`/`<meta>` hoisting. React *appends* hoisted metadata instead of replacing what the HTML already has, so on a prerendered page you would get two `<title>` elements — and browsers honour the **first**, leaving client-side navigation stuck on the prerendered title.

`RouteSeo.jsx` applies this centrally from the route table, so a new route cannot ship with no metadata: unknown paths fall through to a `noindex` default rather than inheriting the previous page's tags. `/blog/<slug>` is the one exception — `BlogPost.jsx` owns its own `<Seo>` because only it has the API data.

## Prerendering (`scripts/prerender.mjs`, runs as part of `npm run build`)

Google executes our JS, but social scrapers (Slack, iMessage, X, LinkedIn, WhatsApp) never do — without this step every shared link unfurls with the generic site-wide title. The script writes `dist/<route>/index.html` with real metadata + JSON-LD.

It **renders no React on purpose.** The component tree touches `localStorage`, the camera and `import.meta.env` throughout, so true SSR would mean auditing every component for browser-API access. This is string templating over the built `index.html`; the worst failure mode is a stale `<head>`, never a broken app.

- Metadata is swapped between the `<!-- SEO:START -->` / `<!-- SEO:END -->` markers in `frontend/index.html`. **Keep those markers, and keep route-independent tags (icons, fonts, scripts) outside them** or every prerendered page loses them.
- Blog posts are fetched from the API at build time. An unreachable API degrades to defaults rather than failing the build.
- **Publishing a post therefore needs a frontend redeploy for its social card.** The sitemap (below) picks it up immediately, so Google can still crawl and index it — only the unfurl lags.

## Sitemap lives in Django

`backend/main/sitemaps.py`, served at `/sitemap.xml` and proxied by nginx from the canonical host (a sitemap may only list URLs on its own origin). It is in Django, not the bundle, so a new post is crawlable without a redeploy.

`CanonicalSitemap` forces `settings.CANONICAL_DOMAIN` via a stub site object. Without it, and without `django.contrib.sites` installed, Django stamps the **backend's** Cloud Run hostname into every `<loc>` — advertising a host we explicitly noindex.

Django's sitemap view applies its own `@x_robots_tag` (`noindex, noodp, noarchive`); that is standard and does not suppress the listed URLs. `NoIndexMiddleware` exempts `/sitemap.xml` for that reason — adding `nofollow` there would ask crawlers not to follow the very URLs the file exists to advertise.

## nginx (`frontend/nginx.conf.template`)

Rendered by the nginx image's envsubst entrypoint (`${PORT}`, `${BACKEND_HOST}`), replacing the old inline `echo`-generated config.

- Uses **`$host`, not `$http_host`** — `$http_host` carries the port, so a local `docker run -p 8080:8080` arrives as `localhost:8080`, misses the canonical map and 301s to production.
- Unknown URLs return a **real 404** (`error_page 404 /404.html`) instead of a 200 SPA shell. Known route prefixes are listed explicitly; adding a route to `App.jsx` means adding it to that regex or it 404s.
- `try_files $uri $uri/index.html /index.html` is what resolves the prerendered per-route files.
- `^~ /assets/` and `^~ /fonts/` use the `^~` prefix so they beat the route regex.

## Performance constraints

- **Fonts are self-hosted** (`scripts/fetch-fonts.mjs`, latin-only variable woff2) with `@font-face` **inlined** into `index.html`. Regenerating fonts means re-pasting that block. Do not reintroduce the `fonts.googleapis.com` stylesheet — it was render-blocking against two third-party origins.
- **Route-level code splitting** in `App.jsx`. Landing, Login, Register and the password-reset screens stay *eagerly* imported on purpose: they are logged-out entry points, and lazy-loading them would add a round trip in front of LCP on exactly the pages search traffic lands on. Everything else is `lazy()` behind one `<Suspense>`.
- **AdSense loads only on `/blog`** (`AdSenseLoader.jsx`), not from `<head>`. Consequence: Auto ads cannot place ads anywhere else.
- `build.sourcemap` is `"hidden"` — maps still upload to Sentry, but production source is not one click away in devtools.

## Assets

`public/og-cover.png` is generated by `scripts/generate-og-cover.py` (Pillow, brand tokens) and is a **placeholder** — replace with a designed 1200×630 asset. `public/robots.txt` deliberately leaves `/invite/<code>` and `/login` crawlable: a `Disallow` would also stop scrapers reading the OG tags that make shared invite links unfurl, so they carry `noindex` instead.

## Not done

Blog/`about` copy expansion, and Search Console / Bing verification (needs account access). The nginx config has not been validated with `nginx -t`.
