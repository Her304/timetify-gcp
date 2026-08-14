import logging
import threading

from django.utils import timezone

_thread_locals = threading.local()

class LoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _thread_locals.user = request.user
        response = self.get_response(request)
        return response

class UserLogFilter(logging.Filter):
    def filter(self, record):
        record.user = getattr(_thread_locals, 'user', None)
        return True


class NoIndexMiddleware:
    """Tell crawlers not to index anything served by the backend service.

    The API and /admin are reachable on a public *.run.app hostname. Nothing
    there should ever appear in search results, and any that did would compete
    with the canonical timetify.net pages for the same content.

    sitemap.xml is exempt from *this* header because Django's sitemap view
    already applies its own (@x_robots_tag -> "noindex, noodp, noarchive").
    Layering "nofollow" on top would be actively wrong: it would ask crawlers
    not to follow the very URLs the sitemap exists to advertise.
    """

    EXEMPT_PATHS = frozenset({"/sitemap.xml"})

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path not in self.EXEMPT_PATHS:
            response["X-Robots-Tag"] = "noindex, nofollow"
        return response


class LastSeenMiddleware:
    """Stamp last_seen on authenticated users at most once per THROTTLE seconds.

    Why: powers the "recently active" sort + "in class now" pills on the friends
    page. Without throttling every request would issue an UPDATE; throttling keeps
    the cost ~1 write/min/user even under chatty SPA polling.
    """
    THROTTLE_SECONDS = 60

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            now = timezone.now()
            prev = getattr(user, "last_seen", None)
            if prev is None or (now - prev).total_seconds() >= self.THROTTLE_SECONDS:
                user.__class__.objects.filter(pk=user.pk).update(last_seen=now)
        return response
