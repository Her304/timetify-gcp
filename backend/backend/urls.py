"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.urls import path, include
from django.views.generic import RedirectView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from django.conf import settings
from django.conf.urls.static import static

from django.contrib.auth import views as auth_views

from main.admin import site as admin_site
from main.forms import CustomPasswordResetForm

urlpatterns = [
    # Project sets APPEND_SLASH=False (for SPA API parity), so bare /admin and
    # /admin/login 404 by default. Redirect them explicitly so admin URL UX still works.
    path("admin", RedirectView.as_view(url="/admin/", query_string=True, permanent=False)),
    path("admin/login", RedirectView.as_view(url="/admin/login/", query_string=True, permanent=False)),
    path("admin/", admin_site.urls),
    path("", include("main.urls")),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Password Reset URLs
    path('password_reset/', auth_views.PasswordResetView.as_view(
        form_class=CustomPasswordResetForm,
        html_email_template_name='registration/password_reset_email.html',
        email_template_name='registration/password_reset_email.txt',
        extra_context={'frontend_url': settings.FRONTEND_URL},
    ), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(
        extra_context={'frontend_url': settings.FRONTEND_URL},
    ), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(
        extra_context={'frontend_url': settings.FRONTEND_URL},
    ), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(
        extra_context={'frontend_url': settings.FRONTEND_URL},
    ), name='password_reset_complete'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
