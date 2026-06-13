import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from main.models import User, Event, EventInvite
from django.db.models import Q

me = User.objects.get(username='test_carol')
friend_ids = [u.id for u in me.friends.all()]

visible = (
    Event.objects.filter(
        Q(creator=me)
        | Q(invites__invitee=me)
        | Q(creator_id__in=friend_ids)
    )
    .select_related('creator')
    .distinct()
)

print(f"Visible count: {visible.count()}")
for evt in visible:
    print(f"ID: {evt.id}, Name: {evt.name}, Creator: {evt.creator.username}")

