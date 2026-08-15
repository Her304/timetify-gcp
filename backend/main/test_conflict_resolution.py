"""
Comprehensive tests for conflict resolution system.
Run via: python manage.py test main.test_conflict_resolution
"""

from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from main.models import Course, Event, EventInvite, CourseSkip, EventOccurrenceSkip, Friend

User = get_user_model()


class ConflictResolutionTests(APITestCase):
    """Test conflict detection and resolution flows."""

    def setUp(self):
        """Create test users and authenticate."""
        self.user1 = User.objects.create_user(
            email='creator@test.com',
            username='creator',
            password='pass123',
            grad_year=2027
        )
        self.user2 = User.objects.create_user(
            email='invitee@test.com',
            username='invitee',
            password='pass123',
            grad_year=2027
        )
        self.user3 = User.objects.create_user(
            email='requester@test.com',
            username='requester',
            password='pass123',
            grad_year=2027
        )

        # Make users friends
        Friend.objects.create(user=self.user1, friend=self.user2, status=Friend.ACCEPTED)
        Friend.objects.create(user=self.user2, friend=self.user1, status=Friend.ACCEPTED)
        Friend.objects.create(user=self.user1, friend=self.user3, status=Friend.ACCEPTED)
        Friend.objects.create(user=self.user3, friend=self.user1, status=Friend.ACCEPTED)

        # Authenticate as user1
        refresh = RefreshToken.for_user(self.user1)
        self.token1 = str(refresh.access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token1}')

        # Set base date (use a Wednesday for testing)
        today = date.today()
        self.base_date = today + timedelta(days=(2 - today.weekday()))  # Next Wednesday
        self.prev_monday = self.base_date - timedelta(days=2)

    def test_1_creator_detects_own_conflict(self):
        """Creator creates event conflicting with own course."""
        # Create course
        course = Course.objects.create(
            user=self.user1,
            course_id='CS101',
            start_date=self.prev_monday,
            end_date=self.prev_monday + timedelta(days=180),
            rep_date='MON,WED',
            start_time='14:00',
            end_time='15:00',
        )

        # Create event that conflicts (same time on Wednesday)
        event_data = {
            'name': 'Study Session',
            'start_time': '14:15',
            'end_time': '14:45',
            'date': self.base_date.isoformat(),  # Wednesday
            'is_repeating': False,
            'visibility': 'PRIVATE',
            'create_chat': False,
            'invite_user_ids': [],
        }

        response = self.client.post('/api/events/', event_data, format='json')

        # Should get conflict response
        self.assertEqual(response.status_code, 409, f"Expected 409, got {response.status_code}: {response.json()}")
        data = response.json()
        self.assertEqual(data['error'], 'overlap')
        self.assertGreater(len(data['creator_conflicts']), 0)
        print(f"✓ TEST 1: Creator conflict detected: {data['creator_conflicts'][0]}")

    def test_2_creator_skip_resolution(self):
        """Creator resolves conflict with 'skip' - course hidden on that date."""
        course = Course.objects.create(
            user=self.user1,
            course_id='CS102',
            start_date=self.prev_monday,
            end_date=self.prev_monday + timedelta(days=180),
            rep_date='MON,WED',
            start_time='14:00',
            end_time='15:00',
        )

        event_data = {
            'name': 'Study Session',
            'start_time': '14:15',
            'end_time': '14:45',
            'date': self.base_date.isoformat(),
            'is_repeating': False,
            'visibility': 'PRIVATE',
            'create_chat': False,
            'invite_user_ids': [],
            'conflict_resolution': 'skip',
        }

        response = self.client.post('/api/events/', event_data, format='json')

        # Should succeed
        self.assertEqual(response.status_code, 201)
        event = Event.objects.get(pk=response.json()['id'])

        # Should create CourseSkip record
        skips = CourseSkip.objects.filter(user=self.user1, course=course, event=event)
        self.assertGreater(skips.count(), 0)
        print(f"✓ TEST 2: Event created with skip - {skips.count()} skip record(s) created")

    def test_3_creator_keep_both_resolution(self):
        """Creator resolves with 'keep_both' - no skip records."""
        course = Course.objects.create(
            user=self.user1,
            course_id='CS103',
            start_date=self.prev_monday,
            end_date=self.prev_monday + timedelta(days=180),
            rep_date='MON,WED',
            start_time='14:00',
            end_time='15:00',
        )

        event_data = {
            'name': 'Study Session',
            'start_time': '14:15',
            'end_time': '14:45',
            'date': self.base_date.isoformat(),
            'is_repeating': False,
            'visibility': 'PRIVATE',
            'create_chat': False,
            'invite_user_ids': [],
            'conflict_resolution': 'keep_both',
        }

        response = self.client.post('/api/events/', event_data, format='json')

        # Should succeed
        self.assertEqual(response.status_code, 201)
        event = Event.objects.get(pk=response.json()['id'])

        # Should NOT create skip records
        skips = CourseSkip.objects.filter(user=self.user1, course=course, event=event)
        self.assertEqual(skips.count(), 0)
        print(f"✓ TEST 3: Event created with keep_both - no skip records")

    def test_4_invitee_accepts_with_conflict(self):
        """Invitee accepts invite when they have conflicting course."""
        # Create event as user1
        event_data = {
            'name': 'Group Study',
            'start_time': '14:15',
            'end_time': '14:45',
            'date': self.base_date.isoformat(),
            'is_repeating': False,
            'visibility': 'PUBLIC',
            'create_chat': False,
            'invite_user_ids': [self.user2.id],
            'conflict_resolution': 'keep_both',
        }

        response = self.client.post('/api/events/', event_data, format='json')
        if response.status_code != 201:
            print(f"ERROR in test_4: {response.json()}")
        self.assertEqual(response.status_code, 201)
        event = Event.objects.get(pk=response.json()['id'])

        # Create conflicting course for user2
        course = Course.objects.create(
            user=self.user2,
            course_id='MATH201',
            start_date=self.prev_monday,
            end_date=self.prev_monday + timedelta(days=180),
            rep_date='MON,WED',
            start_time='14:00',
            end_time='15:00',
        )

        # Switch to user2 and accept
        refresh2 = RefreshToken.for_user(self.user2)
        token2 = str(refresh2.access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token2}')

        invite = EventInvite.objects.get(event=event, invitee=self.user2)
        response = self.client.patch(f'/api/events/invites/{invite.id}/', {
            'action': 'accept'
        }, format='json')

        # Should get conflict
        if response.status_code != 409:
            print(f"DEBUG test_4: Status {response.status_code}, Response: {response.json()}")
        self.assertEqual(response.status_code, 409)
        data = response.json()
        self.assertEqual(data['error'], 'overlap')
        self.assertGreater(len(data.get('conflicts', [])), 0)
        print(f"✓ TEST 4: Invitee detected conflict on accept: {data['conflicts'][0]}")

    def test_5_invitee_skip_on_accept(self):
        """Invitee accepts with skip resolution - event occurrence skip created."""
        # Create event as user1
        event_data = {
            'name': 'Group Study',
            'start_time': '14:15',
            'end_time': '14:45',
            'date': self.base_date.isoformat(),
            'is_repeating': False,
            'visibility': 'PUBLIC',
            'create_chat': False,
            'invite_user_ids': [self.user2.id],
            'conflict_resolution': 'keep_both',
        }

        response = self.client.post('/api/events/', event_data, format='json')
        if response.status_code != 201:
            print(f"ERROR in test_5: {response.json()}")
        event = Event.objects.get(pk=response.json()['id'])

        # Create conflicting course for user2
        course = Course.objects.create(
            user=self.user2,
            course_id='MATH202',
            start_date=self.prev_monday,
            end_date=self.prev_monday + timedelta(days=180),
            rep_date='MON,WED',
            start_time='14:00',
            end_time='15:00',
        )

        # Switch to user2 and accept with skip
        refresh2 = RefreshToken.for_user(self.user2)
        token2 = str(refresh2.access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token2}')

        invite = EventInvite.objects.get(event=event, invitee=self.user2)
        response = self.client.patch(f'/api/events/invites/{invite.id}/', {
            'action': 'accept',
            'conflict_resolution': 'skip'
        }, format='json')

        # Should succeed
        if response.status_code != 200:
            print(f"DEBUG test_5: Status {response.status_code}, Response: {response.json()}")
        self.assertEqual(response.status_code, 200)

        # Should create CourseSkip (conflict is with course, not event)
        skips = CourseSkip.objects.filter(user=self.user2, course=course, event=event)
        self.assertGreater(skips.count(), 0)
        print(f"✓ TEST 5: Invitee accepted with skip - {skips.count()} skip record(s) created")

    def test_6_schedule_skips_endpoint(self):
        """GET /api/schedule-skips/ returns correct skip data."""
        # Create course and event with skip
        course = Course.objects.create(
            user=self.user1,
            course_id='CS104',
            start_date=self.prev_monday,
            end_date=self.prev_monday + timedelta(days=180),
            rep_date='MON,WED',
            start_time='14:00',
            end_time='15:00',
        )

        event_data = {
            'name': 'Skip Test',
            'start_time': '14:15',
            'end_time': '14:45',
            'date': self.base_date.isoformat(),
            'is_repeating': False,
            'visibility': 'PRIVATE',
            'create_chat': False,
            'invite_user_ids': [],
            'conflict_resolution': 'skip',
        }

        response = self.client.post('/api/events/', event_data, format='json')
        event = Event.objects.get(pk=response.json()['id'])

        # Fetch schedule skips
        week_start = self.prev_monday.isoformat()
        response = self.client.get(f'/api/schedule-skips/?week={week_start}')

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('course_skips', data)
        self.assertIn('event_skips', data)

        # Should have course skips
        self.assertGreater(len(data['course_skips']), 0)
        print(f"✓ TEST 6: Schedule skips endpoint working - {len(data['course_skips'])} course skip(s)")

    def test_7_boundary_touch_no_conflict(self):
        """Boundary touch (10:00-11:00 vs 11:00-12:00) should NOT conflict."""
        course = Course.objects.create(
            user=self.user1,
            course_id='CS105',
            start_date=self.prev_monday,
            end_date=self.prev_monday + timedelta(days=180),
            rep_date='WED',
            start_time='10:00',
            end_time='11:00',
        )

        # Event starts exactly when course ends
        event_data = {
            'name': 'No Conflict',
            'start_time': '11:00',
            'end_time': '12:00',
            'date': self.base_date.isoformat(),
            'is_repeating': False,
            'visibility': 'PRIVATE',
            'create_chat': False,
            'invite_user_ids': [],
        }

        response = self.client.post('/api/events/', event_data, format='json')

        # Should succeed (no conflict)
        self.assertEqual(response.status_code, 201)
        print(f"✓ TEST 7: Boundary touch allowed - 10:00-11:00 vs 11:00-12:00")

    def test_8_repeating_event_creates_multiple_skips(self):
        """Repeating event creates skip record per occurrence."""
        course = Course.objects.create(
            user=self.user1,
            course_id='CS106',
            start_date=self.prev_monday,
            end_date=self.prev_monday + timedelta(days=90),
            rep_date='MON,WED',
            start_time='14:00',
            end_time='15:00',
        )

        # Create repeating event (Mon, Wed for 3 weeks)
        event_data = {
            'name': 'Weekly Study',
            'start_time': '14:15',
            'end_time': '14:45',
            'date': self.prev_monday.isoformat(),  # Monday
            'is_repeating': True,
            'repeat_days': 'MON,WED',
            'visibility': 'PRIVATE',
            'create_chat': False,
            'invite_user_ids': [],
            'conflict_resolution': 'skip',
        }

        response = self.client.post('/api/events/', event_data, format='json')

        if response.status_code != 201:
            print(f"ERROR in test_8: {response.json()}")
        self.assertEqual(response.status_code, 201)
        event = Event.objects.get(pk=response.json()['id'])

        # Should create multiple skips (one per occurrence)
        skips = CourseSkip.objects.filter(user=self.user1, event=event)
        self.assertGreater(skips.count(), 1)
        print(f"✓ TEST 8: Repeating event created {skips.count()} skip records")

    def test_9_blocked_friend_cannot_be_invited(self):
        """A block in either direction has to read as "not a friend" here.
        Validating against the raw roster left a blocked person invitable, and
        the invite would surface in their notifications."""
        from main.models import UserBlock
        UserBlock.objects.create(blocker=self.user1, blocked=self.user2)

        event_data = {
            'name': 'Study Session',
            'start_time': '09:00',
            'end_time': '10:00',
            'date': self.base_date.isoformat(),
            'is_repeating': False,
            'visibility': 'PRIVATE',
            'create_chat': False,
            'invite_user_ids': [self.user2.id],
        }

        response = self.client.post('/api/events/', event_data, format='json')

        self.assertEqual(response.status_code, 403, response.json())
        self.assertEqual(response.json()['detail'], 'not_friends')
        self.assertEqual(EventInvite.objects.count(), 0)
        print("✓ TEST 9: Blocked friend rejected as an invite target")


if __name__ == '__main__':
    import unittest
    unittest.main()
