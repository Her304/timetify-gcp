"""The tool registry.

Two invariants matter here and are covered by tests:

1. No tool takes a user identifier. Cross-user access isn't a permission check
   that could be forgotten, it's simply not expressible — every handler reads
   from `principal.user`.
2. `REGISTRY` is a closed dict keyed by known scopes. An unrecognised scope on a
   token yields no tools, so a tampered scopes list fails closed.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone

from ..models import Course, CourseSkip
from . import scopes as scope_defs

logger = logging.getLogger(__name__)

MAX_DAYS_AHEAD = 14


class ToolError(Exception):
    """A tool failed in a way the agent should see verbatim (bad arguments,
    a schedule clash, an expired confirmation). Distinct from an unexpected
    exception, which becomes a generic internal error."""


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    scope: str
    input_schema: dict
    handler: object
    is_write: bool = False
    annotations: dict = field(default_factory=dict)

    def describe(self):
        return {
            'name': self.name,
            'description': self.description,
            'inputSchema': self.input_schema,
            # Advisory only — a client may honour these when deciding whether to
            # prompt its user, and a self-hosted agent may ignore them entirely.
            # The real guarantee for writes is the two-step confirmation in
            # AgentPendingWrite, not these hints.
            'annotations': {
                'title': self.name.replace('_', ' '),
                'readOnlyHint': not self.is_write,
                'destructiveHint': False,
                'idempotentHint': not self.is_write,
                'openWorldHint': False,
                **self.annotations,
            },
        }


# ---------------------------------------------------------------------------
# Shared argument handling
# ---------------------------------------------------------------------------

def _resolve_tz(arguments):
    """Return the caller's tzinfo, defaulting to UTC.

    The app stores course times as naive wall-clock and treats them as UTC
    (see availability.py). That's invisible inside the app, but a tool called
    "today's schedule" makes it visible: for a student in UTC-5 at 8pm, UTC has
    already rolled over to tomorrow. Letting the agent state a timezone makes
    the answer right; defaulting to UTC keeps parity with the app.
    """
    name = arguments.get('timezone')
    if not name:
        # datetime.timezone.utc, not django.utils.timezone.utc — the latter was
        # removed in Django 5.0 and this project runs 6.0.
        return dt_timezone.utc
    try:
        return ZoneInfo(str(name))
    except (ZoneInfoNotFoundError, ValueError):
        raise ToolError(f"Unknown timezone: {name}")


def _resolve_day(arguments):
    raw = arguments.get('date')
    if raw:
        try:
            return datetime.strptime(str(raw), '%Y-%m-%d').date()
        except (TypeError, ValueError):
            raise ToolError('date must be in YYYY-MM-DD format')
    return timezone.now().astimezone(_resolve_tz(arguments)).date()


def _courses_on(user, day):
    """The user's courses that actually run on `day`.

    Mirrors get_busy_blocks' weekday matching, then drops occurrences the user
    has explicitly skipped for an event. The app's schedule renderer hides those
    (ScheduleSkipView); a tool that didn't would confidently tell someone to
    attend a class they already opted out of.
    """
    from ..availability import _DAY_ABBR

    abbr = _DAY_ABBR[day.weekday()]
    active = Course.objects.filter(user=user, start_date__lte=day, end_date__gte=day)
    skipped = set(
        CourseSkip.objects.filter(user=user, date=day).values_list('course_id', flat=True)
    )
    out = []
    for c in active:
        if c.pk in skipped:
            continue
        rep_days = [x.strip().upper() for x in (c.rep_date or '').split(',')]
        if abbr in rep_days:
            out.append(c)
    return out


def _hhmm(t):
    return t.strftime('%H:%M') if t else None


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------

def _get_today_schedule(principal, arguments):
    day = _resolve_day(arguments)
    courses = sorted(_courses_on(principal.user, day), key=lambda c: (c.start_time, c.course_id))
    return {
        'date': day.isoformat(),
        'classes': [
            {
                'course_id': c.course_id,
                'course_name': c.course_name,
                'start_time': _hhmm(c.start_time),
                'end_time': _hhmm(c.end_time),
                'classroom': c.classroom,
                'is_lab': c.is_lab,
            }
            for c in courses
        ],
    }


def _get_free_busy(principal, arguments):
    from ..availability import get_busy_blocks, get_current_status, get_free_slots
    from ..views import _fetch_events_for_day, _get_day_window

    user = principal.user
    day = _resolve_day(arguments)
    now = timezone.now()

    try:
        min_duration = max(15, int(arguments.get('min_duration_minutes', 30)))
    except (TypeError, ValueError):
        raise ToolError('min_duration_minutes must be a number')

    has_courses = Course.objects.filter(user=user).exists()
    active = Course.objects.filter(user=user, start_date__lte=day, end_date__gte=day) if has_courses else []
    events = _fetch_events_for_day([user.id], day).filter(user=user)

    busy = get_busy_blocks(active, events, day)
    status_data = get_current_status(busy, now, has_courses=has_courses)
    window_start, window_end = _get_day_window(day)
    free = get_free_slots(busy, window_start, window_end, min_duration_minutes=min_duration)

    return {
        'date': day.isoformat(),
        **status_data,
        # Intervals only, never titles — the same rule the friends availability
        # endpoint enforces, kept here so no later scope change can leak a
        # calendar subject line through this tool.
        'free_slots': [{'start': s.isoformat(), 'end': e.isoformat()} for s, e in free],
    }


def _get_unread_count(principal, arguments):
    from ..models import ChatRoomMember, Message
    from ..views import _blocked_user_ids

    me = principal.user
    memberships = list(
        ChatRoomMember.objects.filter(user=me)
        .select_related('room')
        .values('room_id', 'last_read_at', 'room__is_active')
    )
    blocked = _blocked_user_ids(me)
    total = 0
    for m in memberships:
        if not m['room__is_active']:
            continue
        qs = Message.objects.filter(room_id=m['room_id'], is_removed=False).exclude(sender=me)
        if blocked:
            qs = qs.exclude(sender_id__in=blocked)
        if m['last_read_at']:
            qs = qs.filter(created_at__gt=m['last_read_at'])
        total += qs.count()
    # Count only. No room names, no senders, no previews — an agent has no
    # business reading message content through this bridge.
    return {'total': total}


def _get_shared_free_slots(principal, arguments):
    from ..availability import get_busy_blocks, get_shared_free_slots
    from ..views import _fetch_events_for_day, _get_day_window, _visible_friend_ids

    from django.contrib.auth import get_user_model
    User = get_user_model()

    me = principal.user
    raw_names = arguments.get('usernames') or []
    if not isinstance(raw_names, list):
        raise ToolError('usernames must be a list of strings')

    try:
        min_duration = max(15, int(arguments.get('min_duration_minutes', 30)))
    except (TypeError, ValueError):
        raise ToolError('min_duration_minutes must be a number')

    visible = _visible_friend_ids(me)

    # Unknown usernames and non-friends are both silently dropped, and the
    # response never says which happened. Distinguishing them would turn this
    # tool into a username-existence oracle and a friendship-status probe for
    # anyone holding a token.
    matched = {
        u.id: u.username
        for u in User.objects.filter(username__in=[str(n) for n in raw_names])
        if u.id in visible
    }
    valid_ids = list({me.id} | set(matched.keys()))

    single = arguments.get('date')
    if single:
        days = [_resolve_day(arguments)]
    else:
        try:
            days_ahead = min(int(arguments.get('days_ahead', 7)), MAX_DAYS_AHEAD)
        except (TypeError, ValueError):
            raise ToolError('days_ahead must be a number')
        days_ahead = max(1, days_ahead)
        start = timezone.now().astimezone(_resolve_tz(arguments)).date()
        days = [start + timedelta(days=i) for i in range(days_ahead)]

    slots = []
    for day in days:
        window_start, window_end = _get_day_window(day)
        courses = Course.objects.filter(user_id__in=valid_ids, start_date__lte=day, end_date__gte=day)
        events = _fetch_events_for_day(valid_ids, day)

        courses_by_user = {}
        for c in courses:
            courses_by_user.setdefault(c.user_id, []).append(c)
        events_by_user = {}
        for ev in events:
            events_by_user.setdefault(ev.user_id, []).append(ev)

        all_busy = [
            get_busy_blocks(courses_by_user.get(uid, []), events_by_user.get(uid, []), day)
            for uid in valid_ids
        ]
        for s, e in get_shared_free_slots(all_busy, window_start, window_end, min_duration):
            slots.append({'date': day.isoformat(), 'start': s.isoformat(), 'end': e.isoformat()})

    return {
        'matched_usernames': sorted(matched.values()),
        'shared_free_slots': slots,
    }


# ---------------------------------------------------------------------------
# Write tools
#
# Both are two-step: no confirmation_token means preview-and-return, a valid one
# means commit. See confirm.py for why that's enforced here rather than left to
# the client's own confirmation prompt.
# ---------------------------------------------------------------------------

def _normalised_for_hash(arguments, keys):
    """The subset of arguments that the confirmation token is bound to.

    confirmation_token itself is excluded, everything else that affects what
    gets written is included — so an agent can't preview one thing and commit
    another.
    """
    return {k: arguments.get(k) for k in keys if k in arguments}


_CLASS_KEYS = ('course_id', 'course_name', 'start_date', 'end_date', 'start_time',
               'end_time', 'rep_date', 'classroom', 'is_lab', 'sections')


def _validated_course(payload):
    from ..serializers import AgentCourseCreateSerializer
    from rest_framework import serializers as drf_serializers

    ser = AgentCourseCreateSerializer(data=payload)
    try:
        ser.is_valid(raise_exception=True)
    except drf_serializers.ValidationError as exc:
        raise ToolError(f'Invalid class details: {exc.detail}')
    return ser.validated_data


def _class_overlaps(user, candidates):
    """Overlap check reusing the add-page's rule so an agent-created class and a
    hand-added one behave identically. Strict-< (touching boundaries are fine)."""
    from ..views import _slot_to_minutes, _parse_rep_days, _find_overlap_day

    slots = []
    for cd in candidates:
        s = _slot_to_minutes(cd['start_time'].strftime('%H:%M'))
        e = _slot_to_minutes(cd['end_time'].strftime('%H:%M'))
        slots.append({'cd': cd, 'days': _parse_rep_days(cd['rep_date']), 's': s, 'e': e})

    found = []
    for i, a in enumerate(slots):
        for b in slots[i + 1:]:
            day = _find_overlap_day(a['days'], a['s'], a['e'], b['days'], b['s'], b['e'])
            if day:
                found.append({
                    'kind': 'incoming_vs_incoming', 'day': day,
                    'a': a['cd']['course_id'], 'b': b['cd']['course_id'],
                })

    for ex in Course.objects.filter(user=user):
        ex_s = (ex.start_time.hour * 60 + ex.start_time.minute) if ex.start_time else None
        ex_e = (ex.end_time.hour * 60 + ex.end_time.minute) if ex.end_time else None
        if ex_s is None or ex_e is None:
            continue
        ex_days = _parse_rep_days(ex.rep_date)
        for a in slots:
            day = _find_overlap_day(a['days'], a['s'], a['e'], ex_days, ex_s, ex_e)
            if day:
                found.append({
                    'kind': 'incoming_vs_existing', 'day': day,
                    'a': a['cd']['course_id'], 'b': ex.course_id,
                })
    return found


def _create_class(principal, arguments):
    from django.db import transaction
    from . import confirm

    user = principal.user
    raw_sections = arguments.get('sections') or []
    if not isinstance(raw_sections, list):
        raise ToolError('sections must be a list of objects')

    parent_payload = {k: arguments.get(k) for k in
                      ('course_id', 'course_name', 'start_date', 'end_date',
                       'start_time', 'end_time', 'rep_date', 'classroom')}
    parent_payload['is_lab'] = bool(arguments.get('is_lab', False))
    parent = _validated_course(parent_payload)

    children = []
    for sec in raw_sections:
        if not isinstance(sec, dict):
            raise ToolError('each section must be an object')
        merged = {**parent_payload, **sec}
        merged['is_lab'] = bool(sec.get('is_lab', True))
        children.append(_validated_course(merged))

    candidates = [parent] + children
    overlaps = _class_overlaps(user, candidates)

    def _shape(cd):
        return {
            'course_id': cd['course_id'], 'course_name': cd['course_name'],
            'start_date': cd['start_date'].isoformat(), 'end_date': cd['end_date'].isoformat(),
            'start_time': _hhmm(cd['start_time']), 'end_time': _hhmm(cd['end_time']),
            'rep_date': cd['rep_date'], 'classroom': cd['classroom'], 'is_lab': cd['is_lab'],
        }

    preview = {'course': _shape(parent), 'sections': [_shape(c) for c in children]}
    bound = _normalised_for_hash(arguments, _CLASS_KEYS)
    token = arguments.get('confirmation_token')

    if not token:
        if overlaps:
            # Surfaced in the preview rather than blocking: the user may well
            # want both blocks. They just shouldn't find out after the fact.
            preview['overlaps'] = overlaps
        return {
            'status': 'preview',
            'confirmation_token': confirm.issue(user, 'create_class', bound),
            'preview': preview,
            'message': 'Nothing has been saved yet. Show these details to the user, '
                       'then call create_class again with the confirmation_token.',
        }

    try:
        row, previous = confirm.redeem(user, 'create_class', str(token), bound)
    except confirm.ConfirmationError as exc:
        raise ToolError(str(exc))
    if previous is not None:
        return previous

    with transaction.atomic():
        # has_ai_content stays False: it gates the weeks/exams/assignments panels
        # in class.jsx, and an agent-created course has none of that content.
        created = Course.objects.create(user=user, **parent)
        for child in children:
            # Parented to the row we just made — never to a caller-supplied id.
            Course.objects.create(user=user, parent_course=created, **child)

    result = {
        'status': 'created',
        'course': {'id': created.pk, **_shape(parent)},
        'sections_created': len(children),
    }
    confirm.mark_consumed(row, created.pk, result)
    logger.info('mcp.create_class user_id=%s course_id=%s sections=%s',
                user.id, created.pk, len(children))
    return result


_EVENT_KEYS = ('name', 'date', 'start_time', 'end_time', 'location',
               'is_repeating', 'repeat_days', 'on_conflict')


def _create_event(principal, arguments):
    from django.db import transaction
    from rest_framework import serializers as drf_serializers

    from ..models import Event, EventInvite
    from ..serializers import EventCreateSerializer
    from ..views import (_active_restriction, _apply_skips, _collect_event_conflicts,
                         _target_event_days)
    from . import confirm

    user = principal.user

    # The app's own event POST never checks this, but an agent path is new
    # surface and a muted user shouldn't gain a way around the restriction.
    for kind in ('snap_posting', 'chat_messaging'):
        restriction = _active_restriction(user, kind)
        if restriction:
            raise ToolError('Your account is currently restricted from creating content.')

    on_conflict = str(arguments.get('on_conflict') or 'fail').lower()
    if on_conflict not in ('fail', 'skip', 'keep_both'):
        raise ToolError("on_conflict must be one of: fail, skip, keep_both")

    payload = {k: arguments.get(k) for k in
               ('name', 'date', 'start_time', 'end_time', 'location', 'is_repeating', 'repeat_days')
               if arguments.get(k) is not None}
    # Forced, not defaulted. An agent creates events on the user's own calendar:
    # no invites (no notification blast), no chat room, and never public. Each is
    # a one-line change if that decision is ever revisited.
    payload['visibility'] = Event.VISIBILITY_PRIVATE
    payload['allow_join_requests'] = False

    if arguments.get('invite_usernames') or arguments.get('source_chat_room_id'):
        raise ToolError(
            'This tool cannot invite people or post to a chat. Create the event, '
            'then invite from the app.'
        )

    ser = EventCreateSerializer(data={**payload, 'invite_user_ids': [], 'create_chat': False},
                                context={'request': None})
    try:
        ser.is_valid(raise_exception=True)
    except drf_serializers.ValidationError as exc:
        raise ToolError(f'Invalid event details: {exc.detail}')

    data = dict(ser.validated_data)
    data.pop('invite_user_ids', None)
    data.pop('create_chat', None)

    conflicts = [c for c in _collect_event_conflicts(user, [], data) if c['user_id'] == user.id]

    preview = {
        'name': data['name'],
        'date': data['date'].isoformat(),
        'start_time': _hhmm(data['start_time']),
        'end_time': _hhmm(data['end_time']),
        'location': data.get('location', ''),
        'is_repeating': data.get('is_repeating', False),
        'repeat_days': data.get('repeat_days', ''),
        'visibility': 'PRIVATE',
        'invites': [],
        'chat_room': None,
    }
    bound = _normalised_for_hash(arguments, _EVENT_KEYS)
    token = arguments.get('confirmation_token')

    if not token:
        if conflicts:
            preview['conflicts'] = conflicts
        return {
            'status': 'preview',
            'confirmation_token': confirm.issue(user, 'create_event', bound),
            'preview': preview,
            'message': 'Nothing has been saved yet. Show these details to the user, '
                       'then call create_event again with the confirmation_token.',
        }

    if conflicts and on_conflict == 'fail':
        raise ToolError(
            'This clashes with something already on the schedule. Ask the user whether '
            'to skip the clashing block (on_conflict="skip") or keep both '
            '(on_conflict="keep_both"), then call again.'
        )

    try:
        row, previous = confirm.redeem(user, 'create_event', str(token), bound)
    except confirm.ConfirmationError as exc:
        raise ToolError(str(exc))
    if previous is not None:
        return previous

    with transaction.atomic():
        event = Event.objects.create(creator=user, **data)
        if conflicts and on_conflict == 'skip':
            target_days = _target_event_days(data['date'], data.get('is_repeating', False),
                                             data.get('repeat_days', ''))
            target_date = data['date'] if not data.get('is_repeating', False) else None
            _apply_skips(user, conflicts, event, target_days, target_date)

    result = {'status': 'created', 'event': {'id': event.pk, **preview}}
    confirm.mark_consumed(row, event.pk, result)
    logger.info('mcp.create_event user_id=%s event_id=%s on_conflict=%s',
                user.id, event.pk, on_conflict)
    return result


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_DATE_ARG = {'type': 'string', 'description': 'Target date as YYYY-MM-DD. Defaults to today.'}
_TZ_ARG = {
    'type': 'string',
    'description': "IANA timezone (e.g. 'America/Toronto') used to decide what "
                   "'today' means. Defaults to UTC.",
}

REGISTRY = {}


def register(tool):
    REGISTRY[tool.name] = tool
    return tool


register(Tool(
    name='get_today_schedule',
    description=(
        "Get the user's classes for a given day, in their own timetable. "
        "Skipped occurrences are already excluded."
    ),
    scope=scope_defs.SCHEDULE_READ,
    input_schema={
        'type': 'object',
        'properties': {'date': _DATE_ARG, 'timezone': _TZ_ARG},
        'additionalProperties': False,
    },
    handler=_get_today_schedule,
))

register(Tool(
    name='get_free_busy',
    description=(
        "Get the user's current free/busy status and their free time slots for a "
        "day. Returns time intervals only — never the names of calendar entries."
    ),
    scope=scope_defs.AVAILABILITY_READ,
    input_schema={
        'type': 'object',
        'properties': {
            'date': _DATE_ARG,
            'timezone': _TZ_ARG,
            'min_duration_minutes': {'type': 'integer', 'description': 'Smallest gap to report. Default 30.'},
        },
        'additionalProperties': False,
    },
    handler=_get_free_busy,
))

register(Tool(
    name='get_unread_count',
    description="Get the total number of unread chat messages. Returns a count only, never message content.",
    scope=scope_defs.UNREAD_READ,
    input_schema={'type': 'object', 'properties': {}, 'additionalProperties': False},
    handler=_get_unread_count,
))

register(Tool(
    name='get_shared_free_slots',
    description=(
        "Find time slots where the user and the named friends are all free — "
        "useful for suggesting when a group could meet. Usernames that are not "
        "the user's friends are ignored."
    ),
    scope=scope_defs.FRIENDS_READ,
    input_schema={
        'type': 'object',
        'properties': {
            'usernames': {
                'type': 'array',
                'items': {'type': 'string'},
                'description': "Friends' usernames to intersect availability with.",
            },
            'date': {'type': 'string', 'description': 'Single day as YYYY-MM-DD. Omit to scan forward from today.'},
            'days_ahead': {'type': 'integer', 'description': f'Days to scan when no date is given. Max {MAX_DAYS_AHEAD}, default 7.'},
            'min_duration_minutes': {'type': 'integer', 'description': 'Smallest shared gap to report. Default 30.'},
            'timezone': _TZ_ARG,
        },
        'additionalProperties': False,
    },
    handler=_get_shared_free_slots,
))


_CONFIRM_ARG = {
    'type': 'string',
    'description': 'Token from a previous preview call. Omit on the first call: '
                   'you will get a preview and a token back, and nothing is saved '
                   'until you call again with it.',
}

_COURSE_FIELDS = {
    'course_id': {'type': 'string', 'description': "Course code, e.g. 'CHEM 101'."},
    'course_name': {'type': 'string'},
    'start_date': {'type': 'string', 'description': 'First day of term, YYYY-MM-DD.'},
    'end_date': {'type': 'string', 'description': 'Last day of term, YYYY-MM-DD.'},
    'start_time': {'type': 'string', 'description': 'HH:MM, 24-hour.'},
    'end_time': {'type': 'string', 'description': 'HH:MM, 24-hour.'},
    'rep_date': {'type': 'string', 'description': 'Comma-separated weekdays, e.g. MON,WED,FRI.'},
    'classroom': {'type': 'string'},
    'is_lab': {'type': 'boolean', 'description': 'True for a lab or tutorial section.'},
}

register(Tool(
    name='create_class',
    description=(
        "Add a class to the user's timetable. Two-step: call without a "
        "confirmation_token to get a preview (including any clashes with existing "
        "classes) and a token, show that to the user, then call again with the "
        "token to save. Pass `sections` for lab or tutorial sections of the same "
        "course. If you parsed these details from a syllabus, show the user what "
        "you extracted before confirming."
    ),
    scope=scope_defs.SCHEDULE_WRITE,
    is_write=True,
    input_schema={
        'type': 'object',
        'properties': {
            **_COURSE_FIELDS,
            'sections': {
                'type': 'array',
                'description': 'Lab/tutorial sections. Each may override any field above.',
                'items': {'type': 'object', 'properties': _COURSE_FIELDS},
            },
            'confirmation_token': _CONFIRM_ARG,
        },
        'required': ['course_id', 'course_name', 'start_date', 'end_date',
                     'start_time', 'end_time', 'rep_date', 'classroom'],
    },
    handler=_create_class,
))

register(Tool(
    name='create_event',
    description=(
        "Add an event to the user's own calendar. Two-step: call without a "
        "confirmation_token to get a preview and a token, show that to the user, "
        "then call again with the token to save. This tool cannot invite anyone, "
        "cannot create a chat, and always creates a private event — inviting "
        "people is done in the app."
    ),
    scope=scope_defs.EVENTS_WRITE,
    is_write=True,
    input_schema={
        'type': 'object',
        'properties': {
            'name': {'type': 'string'},
            'date': {'type': 'string', 'description': 'YYYY-MM-DD. For a repeating event, the first occurrence.'},
            'start_time': {'type': 'string', 'description': 'HH:MM, 24-hour.'},
            'end_time': {'type': 'string', 'description': 'HH:MM, 24-hour.'},
            'location': {'type': 'string'},
            'is_repeating': {'type': 'boolean'},
            'repeat_days': {'type': 'string', 'description': 'Comma-separated weekdays when is_repeating is true.'},
            'on_conflict': {
                'type': 'string',
                'enum': ['fail', 'skip', 'keep_both'],
                'description': "What to do if it clashes with the user's schedule. "
                               "Default 'fail' — ask the user rather than choosing for them.",
            },
            'confirmation_token': _CONFIRM_ARG,
        },
        'required': ['name', 'date', 'start_time', 'end_time'],
    },
    handler=_create_event,
))


def for_scopes(granted):
    """Tools reachable with `granted`. Unknown scopes match nothing."""
    return [t for t in REGISTRY.values() if t.scope in granted]


def get(name, granted):
    tool = REGISTRY.get(name)
    if tool is None or tool.scope not in granted:
        # Same answer for "no such tool" and "not in scope": knowing which
        # tools exist beyond a token's grant isn't useful to a caller.
        return None
    return tool
