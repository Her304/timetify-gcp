/**
 * Single source of truth for public-route metadata and structured data.
 *
 * Imported by two very different consumers, which is the whole point:
 *   - src/components/shared/Seo.jsx, at runtime, for client-side navigation
 *   - scripts/prerender.mjs, at build time, to bake real tags into the HTML
 *
 * Consequently this module must stay plain JS with no JSX, no browser globals,
 * and no Vite-only syntax, so that bare Node can import it.
 */

// Explicit .js extension: Vite resolves either form, but scripts/prerender.mjs
// imports this module in bare Node, where the extension is mandatory.
import { FAQ_SECTIONS } from "../components/help/faqData.js";

export const SITE_URL = "https://timetify.net";
export const SITE_NAME = "Timetify";
export const DEFAULT_IMAGE = `${SITE_URL}/og-cover.png`;

export const DEFAULT_TITLE =
  "Timetify — share your class schedule and find free time with friends";
export const DEFAULT_DESCRIPTION =
  "Timetify puts you and your friends' class schedules side by side, so you can find a free timeslot everyone actually has. Free for students.";

const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.png`,
  email: "hello@timetify.net",
};

const WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: SITE_URL,
  publisher: { "@id": `${SITE_URL}/#organization` },
};

// Timetify is a free web app for students; SoftwareApplication is the schema
// type Google uses for app rich results, so the home page claims it explicitly.
const SOFTWARE_APPLICATION = {
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description: DEFAULT_DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export const HOME_SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [ORGANIZATION, WEBSITE, SOFTWARE_APPLICATION],
};

/** FAQPage built from the same array the help page renders. */
export const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  ),
};

// The two builders below deliberately omit "@context": they are always combined
// into a single "@graph" by the caller, which carries the context once.
export function blogPostingSchema(post) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || DEFAULT_DESCRIPTION,
    image: post.cover_image || DEFAULT_IMAGE,
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: post.author_username
      ? { "@type": "Person", name: post.author_username }
      : { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
  };
}

export function breadcrumbSchema(trail) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path}`,
    })),
  };
}

/** Complete structured data for a single blog post page. */
export function blogPostPageSchema(post) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      blogPostingSchema(post),
      breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Blog", path: "/blog" },
        { name: post.title, path: `/blog/${post.slug}` },
      ]),
    ],
  };
}

/**
 * Static public routes. Anything indexable and not driven by API data lives
 * here; /blog/<slug> is generated separately from the API at build time.
 *
 * Titles are kept near ~60 characters so they are not truncated in results.
 */
export const PAGE_SEO = {
  "/": {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    schema: HOME_SCHEMA,
  },
  "/about": {
    title: "About Timetify — why we built it for students",
    description:
      "Timetify started with a simple problem: nobody could find an hour that worked for everyone. Here is what we are building, and who we are building it for.",
  },
  "/blog": {
    title: "Timetify Blog — scheduling, study groups and student life",
    description:
      "Practical guides on class scheduling, finding study time that works for everyone, and getting more out of your semester.",
  },
  "/help": {
    title: "Timetify Help & FAQ — getting started and troubleshooting",
    description:
      "Answers to common questions about adding classes, importing a syllabus, finding free time with friends, creating events, and managing your privacy.",
    schema: FAQ_SCHEMA,
  },
  "/community": {
    title: "Community Guidelines — Timetify",
    description:
      "The standards we expect from everyone on Timetify, and what happens when they are not met.",
  },
  "/terms": {
    title: "Terms of Service — Timetify",
    description: "The terms that govern your use of Timetify.",
  },
  "/privacy": {
    title: "Privacy Policy — Timetify",
    description:
      "What Timetify collects, why we collect it, and the control you have over your data.",
  },
  "/register": {
    title: "Sign up for Timetify — free schedule sharing for students",
    description:
      "Create a free Timetify account, add your classes in a couple of minutes, and start finding time that works with your friends.",
  },
  // Indexing a login form gains nothing and competes with the home page, but it
  // stays crawlable so link equity still flows through it.
  "/login": {
    title: "Log in — Timetify",
    description: "Log in to your Timetify account.",
    noindex: true,
  },
};

/**
 * Authenticated routes. All noindex — they render nothing without a session —
 * but they still get real titles so browser tabs and history are legible.
 * Matched by prefix, longest first.
 */
export const APP_ROUTE_TITLES = [
  ["/feed", "Feed — Timetify"],
  ["/chat", "Chat — Timetify"],
  ["/class", "Your classes — Timetify"],
  ["/profile", "Your profile — Timetify"],
  ["/add-event", "New event — Timetify"],
  ["/Add", "Add to your schedule — Timetify"],
  ["/invite", "You have been invited to Timetify"],
  ["/reset-password", "Reset your password — Timetify"],
];
