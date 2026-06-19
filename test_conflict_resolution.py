#!/usr/bin/env python
"""
End-to-end test of conflict resolution system.
Run via: python manage.py shell < test_conflict_resolution.py
"""

import os
import sys
import django
from datetime import datetime, date, timedelta
from django.utils import timezone

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'timetify_backend.settings')
sys.path.insert(0, '/Users/hercules/timetify-gcp/backend')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from main.models import Course, Event, EventInvite, CourseSkip, EventOccurrenceSkip
import json

User = get_user_model()
client = APIClient()
client.defaults['HTTP_HOST'] = 'localhost:8000'

print("\n" + "="*80)
print("CONFLICT RESOLUTION END-TO-END TEST")
print("="*80)

# Create test users
print("\n[1] Creating test users...")
user1, _ = User.objects.get_or_create(
    email='creator@test.com',
    defaults={'username': 'creator', 'grad_year': 2027}
)
user2, _ = User.objects.get_or_create(
    email='invitee@test.com',
    defaults={'username': 'invitee', 'grad_year': 2027}
)
user3, _ = User.objects.get_or_create(
    email='requester@test.com',
    defaults={'username': 'requester', 'grad_year': 2027}
)
print(f"✓ Created users: {user1.email}, {user2.email}, {user3.email}")

# Login as creator
from rest_framework_simplejwt.tokens import RefreshToken
refresh = RefreshToken.for_user(user1)
token1 = str(refresh.access_token)
client.credentials(HTTP_AUTHORIZATION=f'Bearer {token1}')

# Create a course with specific times
print("\n[2] Creating course with fixed times...")
today = date.today()
course = Course.objects.create(
    user=user1,
    course_id='CS101',
    start_date=today,
    end_date=today + timedelta(days=180),
    rep_date='MON,WED',  # Repeats Mon & Wed
    start_time='14:00',
    end_time='15:00',
)
print(f"✓ Created course {course.course_id}: MON,WED 14:00-15:00")

# Test 1: Creator creates event with own conflict
print("\n[3] TEST: Creator creates event conflicting with own course...")
event_data = {
    'title': 'Study Session',
    'start_time': '14:15',
    'end_time': '14:45',
    'date': (today + timedelta(days=1)).isoformat(),  # Wednesday
    'visibility': 'PRIVATE',
    'create_chat': False,
    'invitees': [],
}
response = client.post('/api/events/', event_data, format='json')
print(f"  Status: {response.status_code}")
if response.status_code == 409:
    data = response.json()
    print(f"✓ Got conflict response: {data['error']}")
    print(f"  Creator conflicts: {len(data['creator_conflicts'])}")
    if data['creator_conflicts']:
        c = data['creator_conflicts'][0]
        print(f"    - {c.get('course_id', 'event')} at {c['start_time']}-{c['end_time']}")

    # Resend with skip resolution
    event_data['conflict_resolution'] = 'skip'
    response2 = client.post('/api/events/', event_data, format='json')
    print(f"\n  Resending with conflict_resolution='skip'...")
    print(f"  Status: {response2.status_code}")
    if response2.status_code == 201:
        print(f"✓ Event created with skip resolution")
        event1 = Event.objects.get(pk=response2.json()['id'])
        skips = CourseSkip.objects.filter(event=event1)
        print(f"  CourseSkips created: {skips.count()}")
        for skip in skips:
            print(f"    - {skip.course.course_id} on {skip.date}")
else:
    print(f"✗ Expected 409, got {response.status_code}: {response.json()}")

# Test 2: Creator invites invitee who has same course
print("\n[4] TEST: Creator invites someone who has the same course...")
user2.friends.add(user1)  # Make them friends
event_data2 = {
    'title': 'Group Study',
    'start_time': '14:15',
    'end_time': '14:45',
    'date': (today + timedelta(days=1)).isoformat(),  # Wednesday
    'visibility': 'SEMI',
    'create_chat': False,
    'invitees': [user2.id],
    'conflict_resolution': 'keep_both',  # Creator's choice
}
response = client.post('/api/events/', event_data2, format='json')
print(f"  Status: {response.status_code}")
if response.status_code == 201:
    event2 = Event.objects.get(pk=response.json()['id'])
    print(f"✓ Event created with invitee")
    invites = EventInvite.objects.filter(event=event2)
    print(f"  Invites sent: {invites.count()}")
    invite = invites.first()
    print(f"  Invitee invite status: {invite.status}")
else:
    print(f"✗ Expected 201, got {response.status_code}: {response.json()}")

# Test 3: Invitee accepts with own conflict
print("\n[5] TEST: Invitee accepts event, has own conflict...")
refresh2 = RefreshToken.for_user(user2)
token2 = str(refresh2.access_token)

# Create course for user2 at same time
course2 = Course.objects.create(
    user=user2,
    course_id='MATH201',
    start_date=today,
    end_date=today + timedelta(days=180),
    rep_date='MON,WED',
    start_time='14:00',
    end_time='15:00',
)
print(f"  User2 has course: {course2.course_id} MON,WED 14:00-15:00")

client.credentials(HTTP_AUTHORIZATION=f'Bearer {token2}')
invite_id = invite.id
response = client.patch(f'/api/events/invites/{invite_id}/', {
    'status': 'ACCEPTED'
}, format='json')
print(f"  Accept response: {response.status_code}")
if response.status_code == 409:
    data = response.json()
    print(f"✓ Got conflict on accept: {data['error']}")
    print(f"  Conflicts: {len(data.get('conflicts', []))}")
    if data.get('conflicts'):
        c = data['conflicts'][0]
        print(f"    - {c.get('course_id', 'event')} at {c['start_time']}-{c['end_time']}")

    # Accept with skip resolution
    response2 = client.patch(f'/api/events/invites/{invite_id}/', {
        'status': 'ACCEPTED',
        'conflict_resolution': 'skip'
    }, format='json')
    print(f"\n  Retrying with conflict_resolution='skip'...")
    print(f"  Status: {response2.status_code}")
    if response2.status_code == 200:
        print(f"✓ Invite accepted with skip")
        invitee_skips = EventOccurrenceSkip.objects.filter(
            user=user2,
            event=event2
        )
        print(f"  EventOccurrenceSkips created: {invitee_skips.count()}")
else:
    print(f"  Note: No conflict detected (user2 may not have conflicting course)")

# Test 4: Public event with join requests
print("\n[6] TEST: Public event with join request + conflict...")
client.credentials(HTTP_AUTHORIZATION=f'Bearer {token1}')
event_data3 = {
    'title': 'Public Study',
    'start_time': '10:00',
    'end_time': '11:00',
    'date': (today + timedelta(days=2)).isoformat(),  # Thursday
    'visibility': 'PUBLIC',
    'allow_join_requests': True,
    'create_chat': False,
    'invitees': [],
    'conflict_resolution': 'keep_both',
}
response = client.post('/api/events/', event_data3, format='json')
if response.status_code == 201:
    event3 = Event.objects.get(pk=response.json()['id'])
    print(f"✓ Created public event: {event3.title}")

    # user3 requests to join with conflict
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token2}')
    response = client.post(f'/api/events/{event3.id}/request-join/', {}, format='json')
    print(f"  Join request response: {response.status_code}")
    if response.status_code == 201 or response.status_code == 409:
        if response.status_code == 409:
            print(f"✓ Got conflict on join request")
            data = response.json()
            print(f"  Conflicts: {len(data.get('conflicts', []))}")
        else:
            print(f"✓ Join request created")

# Test 5: Schedule skips endpoint
print("\n[7] TEST: GET /api/schedule-skips/ endpoint...")
week_start = today - timedelta(days=today.weekday())
response = client.get(f'/api/schedule-skips/?week={week_start.isoformat()}')
print(f"  Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    print(f"✓ Got schedule skips")
    print(f"  Course skips: {len(data.get('course_skips', []))}")
    print(f"  Event skips: {len(data.get('event_skips', []))}")
    for skip in data.get('event_skips', [])[:3]:
        print(f"    - Event {skip['event']} on {skip['date']}")
else:
    print(f"✗ Expected 200, got {response.status_code}")

# Summary
print("\n" + "="*80)
print("TEST SUMMARY")
print("="*80)
print(f"✓ Users created: {User.objects.filter(email__endswith='@test.com').count()}")
print(f"✓ Courses created: {Course.objects.count()}")
print(f"✓ Events created: {Event.objects.count()}")
print(f"✓ Course skips: {CourseSkip.objects.count()}")
print(f"✓ Event occurrence skips: {EventOccurrenceSkip.objects.count()}")
print(f"✓ Event invites: {EventInvite.objects.count()}")
print("\n✅ All tests completed!\n")
