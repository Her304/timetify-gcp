import os
import django
from django.conf import settings

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def diagnostic():
    print("--- Anymail/Resend Diagnostic ---")
    print(f"EMAIL_BACKEND: {settings.EMAIL_BACKEND}")
    print(f"DEFAULT_FROM_EMAIL: {settings.DEFAULT_FROM_EMAIL}")
    
    anymail_settings = getattr(settings, 'ANYMAIL', {})
    resend_key = anymail_settings.get('RESEND_API_KEY')
    
    if resend_key:
        print(f"RESEND_API_KEY found: Yes (Starts with: {resend_key[:5]}...)")
    else:
        print("RESEND_API_KEY found: No")
        
    print(f"Environment Resend_API_KEY: {'Set' if os.environ.get('Resend_API_KEY') else 'Not Set'}")
    print(f"Environment RESEND_API_KEY: {'Set' if os.environ.get('RESEND_API_KEY') else 'Not Set'}")
    
    # Check if anymail is in INSTALLED_APPS
    print(f"Anymail in INSTALLED_APPS: {'anymail' in settings.INSTALLED_APPS}")

if __name__ == "__main__":
    diagnostic()
