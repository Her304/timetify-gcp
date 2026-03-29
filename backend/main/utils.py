import os
from django.conf import settings
from django.core.mail import send_mail
import logging

class DatabaseLogHandler(logging.Handler):
    def emit(self, record):
        from .models import BackendLog
        from django.contrib.auth import get_user_model
        
        # Try to get the user from the record if available
        user = getattr(record, 'user', None)
        
        message = self.format(record)
        BackendLog.objects.create(
            user=user if user and user.is_authenticated else None,
            level=record.levelname,
            message=message
        )

def send_email(to_email, subject, message):
    """Send email using configured backend"""
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )
        return True
    except Exception as e:
        print(f"Email error: {e}")
        return False