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
                type(user).objects.filter(pk=user.pk).update(last_seen=now)
        return response
