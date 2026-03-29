import logging
import threading

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
