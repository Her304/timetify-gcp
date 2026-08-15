"""Weekday-token normalization.

`Course.rep_date` has two stored shapes in production — full names
("Monday,Wednesday") from the add-course UI and the syllabus parser, and
abbreviations ("MON,WED") from the agent bridge. Code that compared them
without normalizing silently matched neither, so these tests pin the rule
that everything must go through `norm_day`.
"""

from datetime import date, time
from types import SimpleNamespace

from django.test import SimpleTestCase

from .availability import (day_label, get_busy_blocks, norm_day,
                           parse_rep_days, sort_days)
from .views import _find_overlap_day, _parse_rep_days


def course(rep_date, start=time(10, 0), end=time(11, 0)):
    return SimpleNamespace(
        rep_date=rep_date, start_time=start, end_time=end,
        start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
    )


class NormalizationTests(SimpleTestCase):
    def test_both_stored_formats_normalize_to_the_same_token(self):
        for token in ('Monday', 'monday', 'MON', 'Mon', ' mon ', 'MONDAY'):
            self.assertEqual(norm_day(token), 'MON', token)

    def test_parse_rep_days_handles_either_format(self):
        self.assertEqual(parse_rep_days('Monday,Wednesday'), {'MON', 'WED'})
        self.assertEqual(parse_rep_days('MON,WED'), {'MON', 'WED'})
        self.assertEqual(parse_rep_days(''), set())
        self.assertEqual(parse_rep_days(None), set())

    def test_day_label_renders_the_full_name(self):
        self.assertEqual(day_label('MON'), 'Monday')
        self.assertEqual(day_label('Monday'), 'Monday')

    def test_sort_days_is_weekday_order_not_alphabetical(self):
        self.assertEqual(sort_days({'FRI', 'MON'}), ['MON', 'FRI'])

    def test_sort_days_keeps_unknown_tokens_instead_of_dropping_them(self):
        """Callers index [0] off a set they already checked is non-empty, so
        dropping an unrecognised token would turn that into an IndexError."""
        self.assertEqual(sort_days({'XYZ'}), ['XYZ'])
        self.assertEqual(sort_days({'XYZ', 'MON'}), ['MON', 'XYZ'])


class BusyBlockTests(SimpleTestCase):
    """get_busy_blocks backs AvailabilityMeView, friends' availability,
    SharedGapsView and the MCP free/busy tools — one missed match here reports
    a user as free during their own class."""

    def test_full_day_name_produces_a_block(self):
        monday = date(2026, 8, 17)
        self.assertEqual(len(get_busy_blocks([course('Monday,Wednesday')], [], monday)), 1)

    def test_abbreviation_produces_the_same_block(self):
        monday = date(2026, 8, 17)
        self.assertEqual(
            get_busy_blocks([course('MON,WED')], [], monday),
            get_busy_blocks([course('Monday,Wednesday')], [], monday),
        )

    def test_a_day_the_course_does_not_run_stays_free(self):
        tuesday = date(2026, 8, 18)
        self.assertEqual(get_busy_blocks([course('Monday')], [], tuesday), [])


class OverlapDayTests(SimpleTestCase):
    """_find_overlap_day drives CourseFinalizeView's conflict screen and the
    agent create_class preview."""

    def _clash(self, days_a, days_b):
        return _find_overlap_day(_parse_rep_days(days_a), 840, 900,
                                 _parse_rep_days(days_b), 870, 930)

    def test_mixed_formats_clash(self):
        """Regression: .capitalize() made 'MON' and 'Monday' different days."""
        self.assertEqual(self._clash('Monday,Wednesday', 'MON,WED'), 'Monday')

    def test_same_format_still_clashes(self):
        self.assertEqual(self._clash('MON', 'MON'), 'Monday')
        self.assertEqual(self._clash('Monday', 'Monday'), 'Monday')

    def test_reports_the_earliest_shared_day_not_the_alphabetical_one(self):
        self.assertEqual(self._clash('Monday,Friday', 'FRI,MON'), 'Monday')

    def test_renders_a_full_name_for_the_conflict_screen(self):
        """add.jsx prints `overlapInfo.day.toLowerCase()` straight into
        "both meet monday" — the API side of that string must stay a name."""
        self.assertEqual(self._clash('MON', 'MON'), 'Monday')

    def test_no_shared_day_is_no_conflict(self):
        self.assertIsNone(self._clash('Monday', 'Tuesday'))

    def test_non_overlapping_times_on_a_shared_day_are_fine(self):
        self.assertIsNone(
            _find_overlap_day(_parse_rep_days('Monday'), 540, 600,
                              _parse_rep_days('MON'), 600, 660)
        )
