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
from django.http import Http404, HttpResponseRedirect
from django.urls import re_path
from django.views.static import serve as static_serve

from main.admin import site as admin_site


def serve_media(request, path, document_root=None, show_indexes=False):
    """Local dev media serving. Falls back to the public GCS bucket for files
    that exist in prod (e.g. from a synced DB) but never landed on local disk."""
    try:
        return static_serve(request, path, document_root=document_root, show_indexes=show_indexes)
    except Http404:
        if settings.GS_BUCKET_NAME:
            return HttpResponseRedirect(f"https://storage.googleapis.com/{settings.GS_BUCKET_NAME}/{path}")
        raise


urlpatterns = [
    # Project sets APPEND_SLASH=False (for SPA API parity), so bare /admin and
    # /admin/login 404 by default. Redirect them explicitly so admin URL UX still works.
    path("admin", RedirectView.as_view(url="/admin/", query_string=True, permanent=False)),
    path("admin/login", RedirectView.as_view(url="/admin/login/", query_string=True, permanent=False)),
    path("admin/", admin_site.urls),
    path("", include("main.urls")),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]

if settings.DEBUG:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve_media, {'document_root': settings.MEDIA_ROOT}),
    ]
