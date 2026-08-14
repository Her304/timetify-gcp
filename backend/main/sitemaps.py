"""Sitemaps for the public marketing/content surface.

These live in Django rather than as a static file in the frontend bundle so that
publishing a blog post shows up in the sitemap immediately, without a frontend
redeploy.

The URLs describe the *frontend* origin (timetify.net), not the origin this code
is served from. The backend runs on its own Cloud Run hostname, and Django's
sitemap framework would otherwise stamp that hostname into every <loc> — which
would advertise a host we explicitly do not want indexed. CanonicalSitemap
forces settings.CANONICAL_DOMAIN instead.
"""

import logging

from django.conf import settings
from django.contrib.sitemaps import Sitemap

from .models import BlogPost

logger = logging.getLogger(__name__)


class _CanonicalSite:
    """Stand-in for a django.contrib.sites Site.

    The sitemap framework only ever reads ``.domain`` and ``.name`` off the site
    it is handed, so this avoids pulling in the whole sites framework (and its
    migration + DB row) just to hard-code one domain.
    """

    def __init__(self, domain):
        self.domain = domain
        self.name = domain


class CanonicalSitemap(Sitemap):
    protocol = "https"

    def get_urls(self, page=1, site=None, protocol=None):
        return super().get_urls(
            page=page,
            site=_CanonicalSite(settings.CANONICAL_DOMAIN),
            protocol=protocol,
        )


class StaticViewSitemap(CanonicalSitemap):
    """The hand-written public pages. These are React routes, not Django views,
    so the paths are listed literally — there is no reverse() target for them.
    """

    changefreq = "monthly"

    # (path, priority). Home outranks the rest; legal pages are listed so they
    # are discoverable but are not competing for crawl budget.
    PAGES = [
        ("/", 1.0),
        ("/about", 0.7),
        ("/blog", 0.8),
        ("/help", 0.7),
        ("/community", 0.6),
        ("/terms", 0.3),
        ("/privacy", 0.3),
    ]

    def items(self):
        return self.PAGES

    def location(self, item):
        return item[0]

    def priority(self, item):
        return item[1]


class BlogPostSitemap(CanonicalSitemap):
    changefreq = "weekly"
    priority = 0.9

    def items(self):
        return BlogPost.objects.filter(is_published=True).order_by("-published_at")

    def location(self, obj):
        return f"/blog/{obj.slug}"

    def lastmod(self, obj):
        # updated_at, not published_at: a post edited after publication should
        # signal that it is worth recrawling.
        return obj.updated_at


SITEMAPS = {
    "static": StaticViewSitemap,
    "blog": BlogPostSitemap,
}
