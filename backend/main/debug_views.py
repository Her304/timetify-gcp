from django.contrib.auth import views as auth_views
from django.utils.http import urlsafe_base64_decode
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator

User = get_user_model()

class DebugPasswordResetConfirmView(auth_views.PasswordResetConfirmView):
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        uidb64 = self.kwargs.get('uidb64')
        token = self.kwargs.get('token')
        
        try:
            uid = urlsafe_base64_decode(uidb64).decode()
            user = User.objects.get(pk=uid)
            is_valid = default_token_generator.check_token(user, token)
            print(f"DEBUG: Checking token for {user.username} (id={uid})")
            print(f"DEBUG: Token from URL: {token}")
            print(f"DEBUG: Is Valid: {is_valid}")
            
            # Additional checks
            if not is_valid:
                # Let's see what a "fresh" token would look like for this user right now
                new_token = default_token_generator.make_token(user)
                print(f"DEBUG: New expected token part (not including timestamp): {new_token.split('-')[1]}")
                print(f"DEBUG: URL token part: {token.split('-')[1]}")
        except Exception as e:
            print(f"DEBUG: Error in debug view: {e}")
            
        return context
