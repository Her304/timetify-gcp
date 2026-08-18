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

import os

from django.contrib.sitemaps.views import sitemap
from django.urls import path, include
from django.views.generic import RedirectView

from main.sitemaps import SITEMAPS
from rest_framework_simplejwt.views import TokenRefreshView
# The hardened login view — throttled, case-insensitive, and generic about why
# a login failed. /api/token/ below routes here rather than to SimpleJWT's stock
# TokenObtainPairView, which has none of that.
from main.views import LoginView

from django.conf import settings
from django.http import Http404, HttpResponseRedirect
from django.urls import re_path
from django.views.static import serve as static_serve

from main.admin import site as admin_site


def serve_media(request, path, document_root=None, show_indexes=False):
    """Local dev media serving. Falls back to GCS for files that exist in prod
    (e.g. from a synced DB) but never landed on local disk."""
    try:
        return static_serve(request, path, document_root=document_root, show_indexes=show_indexes)
    except Http404:
        if settings.GS_BUCKET_NAME:
            # Was a bare storage.googleapis.com URL, which only worked while the
            # bucket was world-readable. Now that it is private, go through the
            # storage backend so the redirect carries a signature.
            from django.core.files.storage import default_storage

            return HttpResponseRedirect(default_storage.url(path))
        raise


# Where the Django admin is mounted. Overridable so production can move it off
# the default path: obscurity is not access control, but it does take the admin
# login form out of reach of the untargeted scanners that try /admin/ on every
# host they find. Set ADMIN_URL_PATH to something unguessable in prod.
ADMIN_PATH = os.environ.get("ADMIN_URL_PATH", "admin").strip("/")

urlpatterns = [
    # Project sets APPEND_SLASH=False (for SPA API parity), so bare /admin and
    # /admin/login 404 by default. Redirect them explicitly so admin URL UX still works.
    path(ADMIN_PATH, RedirectView.as_view(url=f"/{ADMIN_PATH}/", query_string=True, permanent=False)),
    path(f"{ADMIN_PATH}/login", RedirectView.as_view(url=f"/{ADMIN_PATH}/login/", query_string=True, permanent=False)),
    path(f"{ADMIN_PATH}/", admin_site.urls),
    # Served from the backend but advertised at https://timetify.net/sitemap.xml,
    # which nginx proxies through to here. See main/sitemaps.py for why the
    # <loc> entries point at the frontend origin rather than this one.
    path("sitemap.xml", sitemap, {"sitemaps": SITEMAPS}, name="sitemap"),
    path("", include("main.urls")),
    # Same view as /api/login/. This used to be SimpleJWT's stock
    # TokenObtainPairView, which meant every protection on /api/login/ — rate
    # limiting, the generic "Incorrect username or password" message, and
    # canonical_username() case-folding — could be skipped simply by posting
    # here instead. Kept as an alias because clients may already use it.
    path('api/token/', LoginView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]

if settings.DEBUG:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve_media, {'document_root': settings.MEDIA_ROOT}),
    ]
