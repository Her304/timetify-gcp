"""Calendar (.ics) export: which courses and items a link covers."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from main.models import Assignment, Course, Exam

User = get_user_model()


class CalendarExportSectionsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='chin', email='chin@example.com', password='pw-123456789', grad_year=2028)
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.main = self.course('CP213', 'Monday', '10:00', '11:20')
        self.lab = self.course('CP213 lab', 'Thursday', '14:30', '16:20', parent=self.main, is_lab=True)
        Exam.objects.create(user=self.user, course=self.main, exam_topic='Midterm', exam_date='2026-10-20T00:00:00Z')
        Assignment.objects.create(user=self.user, course=self.lab, assignment_topic='Lab 3',
                                  assignment_due='2026-10-01T00:00:00Z')

    def course(self, code, day, start, end, parent=None, is_lab=False, user=None):
        return Course.objects.create(
            user=user or self.user, course_id=code, course_name='Data Structures', start_date='2026-09-08',
            end_date='2026-12-05', start_time=start, end_time=end, rep_date=day, classroom='BA101',
            parent_course=parent, is_lab=is_lab)

    def export(self, pks):
        res = self.api.post(reverse('course-calendar-link'), {'course_pks': pks, 'tz': 'America/Toronto'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        ics = self.client.get(res.json()['url'])
        self.assertEqual(ics.status_code, 200)
        return ics.content.decode()

    def test_exporting_a_main_course_includes_its_sections(self):
        body = self.export([self.main.pk])
        self.assertIn(f'course-{self.main.pk}@', body)
        self.assertIn(f'course-{self.lab.pk}@', body)        # the lab's meetings
        self.assertIn('Midterm', body)
        self.assertIn('Lab 3', body)                          # item saved on the lab

    def test_exporting_a_section_alone_stays_just_that_section(self):
        body = self.export([self.lab.pk])
        self.assertIn(f'course-{self.lab.pk}@', body)
        self.assertNotIn(f'course-{self.main.pk}@', body)
        self.assertNotIn('Midterm', body)

    def test_main_plus_sections_is_unchanged(self):
        body = self.export([self.main.pk, self.lab.pk])
        self.assertEqual(body.count('BEGIN:VEVENT'), 4)

    def test_someone_elses_course_is_still_refused(self):
        other = User.objects.create_user(username='mallory', email='m@example.com', password='pw-123456789', grad_year=2028)
        theirs = self.course('CP213', 'Monday', '10:00', '11:20', user=other)
        res = self.api.post(reverse('course-calendar-link'), {'course_pks': [theirs.pk]}, format='json')
        self.assertEqual(res.status_code, 404)
