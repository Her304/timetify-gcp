import { useEffect } from "react";

/**
 * Per-route document metadata.
 *
 * Why this mutates tags imperatively instead of using React 19's native
 * <title>/<meta> hoisting: scripts/prerender.mjs bakes real metadata into the
 * HTML for each public route (crawlers and social scrapers never run our JS, so
 * that part is not optional). React hoists rendered metadata by *appending* to
 * <head> rather than replacing what is already there, which would leave two
 * <title> elements on every prerendered page — and browsers honour the first
 * one. Client-side navigation would then be stuck showing the prerendered
 * title. Updating the existing tags in place keeps the two mechanisms in sync.
 */

import {
  SITE_URL,
  SITE_NAME,
  DEFAULT_IMAGE,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
} from "@/seo/config";

const MANAGED = "data-seo-managed";

function upsertMeta(key, keyAttr, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${keyAttr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(keyAttr, key);
    el.setAttribute(MANAGED, "");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    el.setAttribute(MANAGED, "");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setRobots(noindex) {
  const existing = document.head.querySelector('meta[name="robots"]');
  if (noindex) {
    upsertMeta("robots", "name", "noindex, follow");
  } else if (existing) {
    // Prerendered noindex pages hand off to client-side routes that may well be
    // indexable, so a stale directive has to be cleared rather than left behind.
    existing.remove();
  }
}

function setJsonLd(schema) {
  document.head
    .querySelectorAll('script[type="application/ld+json"][data-seo-jsonld]')
    .forEach((n) => n.remove());
  if (!schema) return;
  const el = document.createElement("script");
  el.type = "application/ld+json";
  el.setAttribute("data-seo-jsonld", "");
  el.textContent = JSON.stringify(schema);
  document.head.appendChild(el);
}

const Seo = ({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image = DEFAULT_IMAGE,
  type = "website",
  noindex = false,
  schema = null,
}) => {
  useEffect(() => {
    const url = `${SITE_URL}${path}`;
    const absoluteImage = image?.startsWith("http") ? image : `${SITE_URL}${image}`;

    document.title = title;
    upsertMeta("description", "name", description);
    upsertCanonical(url);
    setRobots(noindex);

    upsertMeta("og:type", "property", type);
    upsertMeta("og:site_name", "property", SITE_NAME);
    upsertMeta("og:url", "property", url);
    upsertMeta("og:title", "property", title);
    upsertMeta("og:description", "property", description);
    upsertMeta("og:image", "property", absoluteImage);

    upsertMeta("twitter:card", "name", "summary_large_image");
    upsertMeta("twitter:title", "name", title);
    upsertMeta("twitter:description", "name", description);
    upsertMeta("twitter:image", "name", absoluteImage);

    setJsonLd(schema);
  }, [title, description, path, image, type, noindex, schema]);

  return null;
};

export default Seo;
