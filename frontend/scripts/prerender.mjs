/**
 * Bakes per-route metadata into the built HTML.
 *
 * Why this exists: the app is a client-rendered SPA served as static files.
 * Google will execute our JS and eventually see the runtime <Seo> tags, but
 * social scrapers (Slack, iMessage, X, LinkedIn, WhatsApp) never run JS at all
 * — they read the HTML as served. Without this step every shared link unfurls
 * with the generic site-wide title, and blog posts have no card whatsoever.
 *
 * Deliberately NOT server-side rendering: the component tree touches
 * localStorage, the camera, and import.meta.env throughout, so rendering it in
 * Node would mean auditing every component for browser-API access. This script
 * renders no React. It is string templating over the built index.html, which
 * cannot break the app at runtime — the worst failure mode is a stale <head>.
 *
 * Output: dist/<route>/index.html per route, which nginx resolves via
 * `try_files $uri $uri/index.html`.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";

import {
  PAGE_SEO,
  SITE_URL,
  SITE_NAME,
  DEFAULT_IMAGE,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  HOME_SCHEMA,
  blogPostPageSchema,
} from "../src/seo/config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const START = "<!-- SEO:START -->";
const END = "<!-- SEO:END -->";

/** Escape for use inside a double-quoted HTML attribute. */
function attr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * JSON-LD goes inside <script>, so the only character that can break out of
 * the element is "<". Escaping it keeps a post body containing "</script>"
 * from terminating the block early.
 */
function jsonLd(schema) {
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}

function buildHead({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  routePath = "/",
  image = DEFAULT_IMAGE,
  type = "website",
  noindex = false,
  schema = null,
}) {
  const url = `${SITE_URL}${routePath === "/" ? "/" : routePath}`;
  const absoluteImage = String(image).startsWith("http")
    ? image
    : `${SITE_URL}${image}`;

  const tags = [
    `<title>${attr(title)}</title>`,
    `<meta name="description" content="${attr(description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    noindex ? `<meta name="robots" content="noindex, follow" />` : null,
    ``,
    `<meta property="og:type" content="${attr(type)}" />`,
    `<meta property="og:site_name" content="${attr(SITE_NAME)}" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:image" content="${attr(absoluteImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    ``,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(title)}" />`,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    `<meta name="twitter:image" content="${attr(absoluteImage)}" />`,
    schema
      ? `<script type="application/ld+json">${jsonLd(schema)}</script>`
      : null,
  ].filter((line) => line !== null);

  return tags.join("\n    ");
}

function inject(shell, head) {
  const startAt = shell.indexOf(START);
  const endAt = shell.indexOf(END);
  if (startAt === -1 || endAt === -1) {
    throw new Error(
      `index.html is missing the ${START} / ${END} markers — prerendering cannot place metadata.`,
    );
  }
  return shell.slice(0, startAt + START.length) + "\n    " + head + "\n    " + shell.slice(endAt);
}

async function writeRoute(routePath, html) {
  // "/" is dist/index.html; every other route becomes a directory with an
  // index.html so extensionless URLs resolve without a rewrite.
  const outDir = routePath === "/" ? DIST : path.join(DIST, routePath);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), html, "utf8");
}

/**
 * Published posts, or an empty list if the API cannot be reached.
 *
 * A build must not fail because the API is briefly unavailable: the static
 * pages are the more valuable output, and a missing blog card degrades to the
 * site-wide default rather than breaking the deploy.
 */
async function fetchPosts(apiUrl) {
  if (!apiUrl) {
    console.warn("[prerender] VITE_API_URL is not set — skipping blog posts.");
    return [];
  }
  try {
    const res = await fetch(`${apiUrl}/api/blog/`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.results ?? []);
  } catch (err) {
    console.warn(
      `[prerender] could not fetch blog posts (${err.message}) — continuing without them.`,
    );
    return [];
  }
}

async function main() {
  const shell = await readFile(path.join(DIST, "index.html"), "utf8");
  const env = loadEnv("production", ROOT, "VITE_");
  const apiUrl = (env.VITE_API_URL || "").replace(/\/$/, "");

  let count = 0;

  for (const [routePath, page] of Object.entries(PAGE_SEO)) {
    await writeRoute(
      routePath,
      inject(
        shell,
        buildHead({
          routePath,
          title: page.title,
          description: page.description,
          noindex: page.noindex,
          schema: page.schema ?? (routePath === "/" ? HOME_SCHEMA : null),
        }),
      ),
    );
    count += 1;
  }

  const posts = await fetchPosts(apiUrl);
  for (const post of posts) {
    if (!post?.slug) continue;
    await writeRoute(
      `/blog/${post.slug}`,
      inject(
        shell,
        buildHead({
          routePath: `/blog/${post.slug}`,
          title: `${post.title} — Timetify Blog`,
          description: post.excerpt || DEFAULT_DESCRIPTION,
          image: post.cover_image || DEFAULT_IMAGE,
          type: "article",
          schema: blogPostPageSchema(post),
        }),
      ),
    );
    count += 1;
  }

  // nginx serves this shell for unmatched URLs with a real 404 status.
  await writeFile(
    path.join(DIST, "404.html"),
    inject(
      shell,
      buildHead({
        routePath: "/404",
        title: "Page not found — Timetify",
        description: "This page does not exist.",
        noindex: true,
      }),
    ),
    "utf8",
  );

  console.log(
    `[prerender] wrote ${count} route(s) + 404.html (${posts.length} blog post(s)).`,
  );
}

main().catch((err) => {
  console.error("[prerender] failed:", err);
  process.exit(1);
});
