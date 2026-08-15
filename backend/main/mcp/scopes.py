"""The single scope vocabulary for agent access.

Lives here rather than on the token model because a future OAuth consent screen
must grant exactly the same strings the PAT checkboxes grant — one list, one
place to audit.

VALID is a closed set and is the only thing tool lookup consults. A token whose
scopes JSON was hand-edited to something like ["*"] or ["messages:read"]
resolves to zero tools rather than to everything: unknown scope means no
access, never blanket access.
"""

SCHEDULE_READ    = 'schedule:read'
AVAILABILITY_READ = 'availability:read'
UNREAD_READ      = 'unread:read'
FRIENDS_READ     = 'friends:read'
SCHEDULE_WRITE   = 'schedule:write'
EVENTS_WRITE     = 'events:write'

VALID = frozenset({
    SCHEDULE_READ,
    AVAILABILITY_READ,
    UNREAD_READ,
    FRIENDS_READ,
    SCHEDULE_WRITE,
    EVENTS_WRITE,
})

# Offered by default when a user mints a token from Settings. Write scopes are
# never pre-checked — granting an agent the ability to change a schedule should
# be a deliberate act, not a default the user clicks past.
DEFAULT = (SCHEDULE_READ, AVAILABILITY_READ)

WRITE_SCOPES = frozenset({SCHEDULE_WRITE, EVENTS_WRITE})

# Shown next to each checkbox in the Settings card; keep in the app's low-caps
# voice since these strings render directly.
DESCRIPTIONS = {
    SCHEDULE_READ:     "read today's classes",
    AVAILABILITY_READ: "read your free/busy times",
    UNREAD_READ:       "read your unread message count",
    FRIENDS_READ:      "find free time you share with friends",
    SCHEDULE_WRITE:    "add classes to your timetable",
    EVENTS_WRITE:      "add events to your calendar",
}


def clean(raw):
    """Normalise a caller-supplied scope list to a sorted list of known scopes.

    Silently drops anything unrecognised — the mint API rejects bad input up
    front, so anything reaching here is either legacy or tampered-with, and in
    both cases dropping is the safe reading.
    """
    if not isinstance(raw, (list, tuple, set, frozenset)):
        return []
    return sorted({s for s in raw if s in VALID})
