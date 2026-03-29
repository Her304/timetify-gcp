import os
import django
from django.core.mail import EmailMessage
from django.conf import settings

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def test_send_email(to_email):
    print(f"--- Attempting to send email to {to_email} ---")
    print(f"Using Backend: {settings.EMAIL_BACKEND}")
    print(f"From Email: {settings.DEFAULT_FROM_EMAIL}")
    
    msg = EmailMessage(
        subject="Anymail/Resend Diagnostic Test",
        body="If you see this, your email configuration is working correctly with Anymail and Resend.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
    )
    
    try:
        sent_count = msg.send()
        print(f"Django reports {sent_count} email(s) sent.")
        
        # Check Anymail status
        if hasattr(msg, 'anymail_status'):
            status = msg.anymail_status
            print(f"Anymail Message ID: {status.message_id}")
            print(f"Anymail Status: {status.status}") # e.g., 'queued', 'sent', 'rejected'
            print(f"Anymail Recipient Status: {status.recipients}")
            
            if status.status == 'rejected':
                print("WARNING: Email was rejected by Resend API.")
            elif status.status == 'queued' or status.status == 'sent':
                print("SUCCESS: Email was accepted by Resend API.")
        else:
            print("ERROR: anymail_status not found on message object. Check if ANYMAIL_BACKEND is set.")
            
    except Exception as e:
        print(f"EXCEPTION RAISED: {type(e).__name__}: {e}")
        if hasattr(e, 'response') and hasattr(e.response, 'text'):
            print(f"API Response Body: {e.response.text}")

if __name__ == "__main__":
    import sys
    # Use hercules6024@gmail.com as default if no arg provided, since it's in the DB
    target = sys.argv[1] if len(sys.argv) > 1 else "hercules6024@gmail.com"
    test_send_email(target)
