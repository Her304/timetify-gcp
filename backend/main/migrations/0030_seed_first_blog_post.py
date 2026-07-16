from django.db import migrations
from django.utils import timezone
from django.utils.text import slugify

TITLE = "5 ways timetify keeps your study squad in sync this semester"

EXCERPT = (
    "juggling classes, group projects, and an actual social life is chaos. "
    "here's how timetify turns everyone's calendars into one shared rhythm."
)

CONTENT = """staying on top of your own schedule is hard enough. staying on top of it \
alongside a whole group of friends — who all have different classes, different \
labs, and different ideas of what "free time" means — is another thing entirely. \
that's the gap timetify was built to close.

upload once, done. drop in your syllabus or course outline and timetify's ai \
parses out your lectures, labs, assignments, and exam dates automatically. no more \
manually typing every class into a calendar app by hand, and no more missed \
deadlines because a due date got buried in a pdf you forgot to reread.

see who's actually free. the whole point of a shared schedule is knowing when \
you can grab coffee, cram for a midterm together, or just hang out. timetify's \
availability view lines up your schedule against your friends' so you can spot \
overlapping free blocks instantly, instead of the usual ten-message group chat \
back-and-forth of "wait what are you doing thursday."

plan events without the chaos. create a study session or a hangout, invite \
whoever's coming, and timetify automatically flags anyone whose schedule clashes — \
so you can sort it out before it becomes a no-show. accepted events show up right \
on everyone's week view, so nothing gets forgotten.

snap your day, not just your notes. class dragging? exam over? timetify's snap \
feature lets you share quick photo or video updates with friends taking the same \
course, so the group stays connected around the classes you actually share, not \
just a generic feed.

one shared rhythm, not five different apps. the real win isn't any single \
feature — it's having your classes, your friends' classes, your events, and your \
group's plans all living in one place. less app-switching, less confusion, more \
time actually spent with the people you're trying to sync up with.

that's timetify: less "when are you free" texting, more actually being free \
together. give it a try and see what your week looks like when everyone's \
finally on the same page."""


def seed_post(apps, schema_editor):
    BlogPost = apps.get_model('main', 'BlogPost')
    if BlogPost.objects.filter(slug='5-ways-timetify-keeps-your-study-squad-in-sync-this-semester').exists():
        return
    BlogPost.objects.create(
        title=TITLE,
        slug=slugify(TITLE)[:220],
        excerpt=EXCERPT,
        content=CONTENT,
        is_published=True,
        published_at=timezone.now(),
    )


def remove_post(apps, schema_editor):
    BlogPost = apps.get_model('main', 'BlogPost')
    BlogPost.objects.filter(slug=slugify(TITLE)[:220]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0029_blogpost'),
    ]

    operations = [
        migrations.RunPython(seed_post, remove_post),
    ]
