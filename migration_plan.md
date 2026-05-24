# Timetify Migration Plan

## Goal
Move Cloud SQL → DigitalOcean Managed Postgres and GCS → DigitalOcean Spaces, while keeping Cloud Run on GCP. Add push notifications and real-time via Firebase/FCM alongside.

---

## Target Architecture

```
iOS App
  ├── Firebase SDK → Firestore (real-time, foreground)
  └── FCM / APNs (push, background)

Cloud Run (Django)
  ├── DigitalOcean Managed Postgres  (was Cloud SQL)
  ├── DigitalOcean Spaces            (was GCS, S3-compatible)
  ├── Firestore                      (new — real-time events)
  └── FCM                            (new — push sender)
```

---

## Phase 1 — Storage Migration

**Goal:** Move database and media files off GCP with no feature changes.

### 1a. DigitalOcean Managed Postgres
- [ ] Provision DO Managed Postgres (start: $15/month, 1GB)
- [ ] `pg_dump` Cloud SQL → restore into DO Postgres
- [ ] Update `DATABASE_URL` env var in Cloud Run
- [ ] Run `python manage.py migrate` against new DB
- [ ] Smoke test all endpoints
- [ ] Decommission Cloud SQL

### 1b. DigitalOcean Spaces (media files)
- [ ] Create DO Spaces bucket (S3-compatible)
- [ ] Copy existing media: `gsutil -m cp -r gs://<bucket>/* s3://do-spaces-bucket/` via `rclone`
- [ ] Update env vars in Cloud Run:
  - `GS_BUCKET_NAME` → remove
  - Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_ENDPOINT_URL`, `AWS_STORAGE_BUCKET_NAME`
- [ ] Switch `django-storages` backend from GCS to S3 in `settings.py`
- [ ] Verify media upload/download works
- [ ] Decommission GCS bucket

**Code change:** `settings.py` storage backend only — no model or view changes needed.

---

## Phase 2 — Push Notifications

**Goal:** Send FCM push to iOS when app is backgrounded (new message, snap, friend request).

### Prerequisites
- [ ] Apple Developer account ($99/year)
- [ ] Generate APNs `.p8` key in Apple Developer portal
- [ ] Create Firebase project → upload APNs key in Firebase console

### Backend
- [ ] `pip install firebase-admin` → add to `requirements.txt`
- [ ] Add `DeviceToken` model (user FK, token string, created_at)
- [ ] Migration for `DeviceToken`
- [ ] `POST /api/push/register/` endpoint — store token per user
- [ ] `DELETE /api/push/register/` endpoint — remove token on logout
- [ ] FCM send helper — called on: new chat message, new snap, new friend request
- [ ] Quiet hours gate — check `UserNotificationPreference` before sending

### iOS
- [ ] Add `firebase-ios-sdk` via Swift Package Manager
- [ ] `UNUserNotificationCenter` permission request on first launch
- [ ] Register FCM token → call `POST /api/push/register/` with JWT
- [ ] Handle foreground notification display
- [ ] Handle background notification tap → deep link to relevant screen

---

## Phase 3 — Real-time (Replace Polling)

**Goal:** Replace 5s chat polling and 30s unread polling with Firestore listeners.

### Backend
- [ ] Firestore write on new `Message` created → `/rooms/{roomId}/latest`
- [ ] Firestore write on new unread count change → `/users/{userId}/unread`
- [ ] Firestore write on new `Snap` → `/snaps/{userId}/feed`

### iOS
- [ ] Firestore listener on `/rooms/{roomId}/latest` → refresh chat view
- [ ] Firestore listener on `/users/{userId}/unread` → update badge count
- [ ] Remove polling timers from frontend (web)

### Web (frontend)
- [ ] Replace 30s `setInterval` unread poll in `AppShell` with Firestore listener
- [ ] Replace 5s chat poll with Firestore listener or keep SSE (TBD)

---

## Cost Summary

| Service | Monthly | Notes |
|---|---|---|
| Cloud Run | Same as now | No change |
| DO Managed Postgres | ~$15 | Replaces Cloud SQL |
| DO Spaces | ~$5 | Replaces GCS (250GB included) |
| Firestore | $0 | Free tier: 50K reads + 20K writes/day |
| FCM | $0 | Free |
| Apple Developer | ~$8 | $99/year billed annually |
| **Net new spend** | **~$28/month** | |

---

## Services Overview

| Service | Provider | Purpose |
|---|---|---|
| Cloud Run | GCP | Django backend host |
| Managed Postgres | DigitalOcean | Primary database |
| Spaces | DigitalOcean | Media file storage |
| Firestore | GCP / Firebase | Real-time event store |
| FCM | GCP / Firebase | Push notification router |
| APNs | Apple | iOS push delivery |
| `UNUserNotificationCenter` | Apple (iOS SDK) | Permission + display on device |

---

## Notes
- Spaces is S3-compatible — `django-storages` S3 backend works with endpoint URL swap only.
- FCM handles APNs routing — Django never talks to APNs directly.
- Firestore free tier is sufficient until significant scale; revisit when DAU > ~500.
- Phase 1 is zero-risk to users if done with a DB snapshot and short maintenance window.
- Phases 2 and 3 are independent — push can ship before real-time.
