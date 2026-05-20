from django.db import models
from django.contrib.auth.models import AbstractUser

class CustomUser(AbstractUser):
    university = models.CharField(max_length=100, blank=False)
    major = models.CharField(max_length=30, blank=False)
    grad_year = models.PositiveIntegerField()
    email = models.EmailField(blank=False, unique=True)
    temp_password = models.CharField(max_length=128, null=True, blank=True)
    is_temp_password = models.BooleanField(default=False)
    # Throttled (~60s) on every authenticated request by LastSeenMiddleware.
    # Indexed so the friends page can sort/filter by recency cheaply.
    last_seen = models.DateTimeField(null=True, blank=True, db_index=True)

    REQUIRED_FIELDS = ['email', 'university', 'major', 'grad_year']

    def __str__(self):
        return self.username

# Course Model
class Course(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='courses')
    course_id = models.CharField(max_length=20)
    course_name = models.CharField(max_length=200)
    start_date = models.DateField()
    end_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    rep_date = models.CharField(max_length=100)
    classroom = models.CharField(max_length=100)
    course_outline = models.FileField(upload_to='course_outlines/', null=True, blank=True)
    has_ai_content = models.BooleanField(default=False)
    parent_course = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='child_courses')
    is_lab = models.BooleanField(default=False)
    
    def __str__(self):
        return f"{self.course_id} - {self.course_name}"

# Week Model
class Week(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='weeks')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='weeks')
    week_number = models.IntegerField()
    week_date = models.DateField()
    week_topic = models.TextField()
    is_completed = models.BooleanField(default=False)
    
    def __str__(self):
        return f"Week {self.week_number}: {self.course.course_id}"

# Exam Model
class Exam(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='exams')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='exams')
    exam_date = models.DateTimeField()
    exam_topic = models.CharField(max_length=200)
    exam_details = models.TextField(blank=True, null=True)
    is_completed = models.BooleanField(default=False)
    
    def __str__(self):
        return f"{self.exam_topic} - {self.course.course_id}"

# Assignment Model
class Assignment(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='assignments')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='assignments')
    assignment_due = models.DateTimeField()
    assignment_topic = models.CharField(max_length=200)
    assignment_detail = models.TextField(blank=True, null=True)
    is_completed = models.BooleanField(default=False)
    
    def __str__(self):
        return f"{self.assignment_topic} - {self.course.course_id}"

# Friend Model
class Friend(models.Model):
    PENDING = 0
    ACCEPTED = 1
    REJECTED = 2

    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (ACCEPTED, 'Accepted'),
        (REJECTED, 'Rejected'),
    ]
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='friends')
    friend = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='befriended_by')
    status = models.IntegerField(default=1)

    class Meta:
        unique_together = ('user', 'friend')

    def __str__(self):
        return f"{self.user.username} -> {self.friend.username} ({self.status})"

# Backend Log Model
class BackendLog(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, null=True, blank=True)
    level = models.CharField(max_length=20)
    message = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.timestamp}] {self.level}: {self.message[:50]}"

# Error Report Model
class ErrorReport(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    description = models.TextField()
    frontend_logs = models.TextField()
    backend_logs = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Report by {self.user.username} at {self.created_at}"


def snap_upload_path(instance, filename):
    import uuid, os
    ext = os.path.splitext(filename)[1].lower()
    return f"snaps/{instance.uploader_id}/{uuid.uuid4().hex}{ext}"


class Snap(models.Model):
    MEDIA_PHOTO = 'photo'
    MEDIA_VIDEO = 'video'
    MEDIA_CHOICES = [(MEDIA_PHOTO, 'Photo'), (MEDIA_VIDEO, 'Video')]

    VIS_ALL_FRIENDS = 'all_friends'
    VIS_SELECTED = 'selected'
    VIS_CHOICES = [(VIS_ALL_FRIENDS, 'All friends'), (VIS_SELECTED, 'Selected friends')]

    uploader = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='snaps')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='snaps')
    media_file = models.FileField(upload_to=snap_upload_path)
    media_type = models.CharField(max_length=10, choices=MEDIA_CHOICES)
    caption = models.TextField(blank=True)
    visibility = models.CharField(max_length=16, choices=VIS_CHOICES, default=VIS_ALL_FRIENDS)
    is_removed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        indexes = [
            models.Index(fields=['course', 'expires_at', 'is_removed']),
            models.Index(fields=['uploader', 'created_at']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"Snap #{self.pk} by {self.uploader.username} on {self.course.course_id}"


class SnapAudience(models.Model):
    """
    Dual purpose:
      - For Snap.visibility == 'selected': pre-created rows act as the allowlist.
      - For Snap.visibility == 'all_friends': rows are created lazily on first view to
        track `has_viewed` per viewer; absence of a row simply means the viewer hasn't
        opened the snap yet.
    """
    snap = models.ForeignKey(Snap, on_delete=models.CASCADE, related_name='audience')
    viewer = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='snap_views')
    has_viewed = models.BooleanField(default=False)
    viewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('snap', 'viewer')
        indexes = [models.Index(fields=['viewer', 'has_viewed'])]

    def __str__(self):
        return f"{self.viewer.username} → snap #{self.snap_id} viewed={self.has_viewed}"


class ChatRoom(models.Model):
    ROOM_DM = 'dm'
    ROOM_GROUP = 'group'
    ROOM_TYPE_CHOICES = [(ROOM_DM, 'DM'), (ROOM_GROUP, 'Group')]

    room_type = models.CharField(max_length=8, choices=ROOM_TYPE_CHOICES, default=ROOM_DM)
    name = models.CharField(max_length=80, null=True, blank=True)
    created_by = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='chat_rooms_created')
    # Reserved for future snap→DM continuation; unused in v1 UI.
    linked_snap = models.ForeignKey(Snap, on_delete=models.SET_NULL, null=True, blank=True, related_name='chat_rooms')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [models.Index(fields=['room_type', 'is_active'])]

    def __str__(self):
        return f"ChatRoom #{self.pk} ({self.room_type})"


class ChatRoomMember(models.Model):
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='chat_memberships')
    # Group-only flag; ignored in v1 DM flows.
    is_admin = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('room', 'user')
        indexes = [models.Index(fields=['user', 'room'])]

    def __str__(self):
        return f"{self.user.username} in room #{self.room_id}"


class Message(models.Model):
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='messages_sent')
    content = models.TextField()
    reply_to = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replies')
    is_removed = models.BooleanField(default=False)
    removed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['room', '-created_at'])]
        ordering = ['-created_at']

    def __str__(self):
        preview = (self.content or '')[:30]
        return f"Msg #{self.pk} by {self.sender.username}: {preview}"


# ──────────────────────────────────────────────────────────────────────────────
# Moderation: Report / AiReport / SimilarityCheck / Appeal / FunctionRestriction
# / UserBlock.  Pipeline lives in main/management/commands/run_moderation.py.
# ──────────────────────────────────────────────────────────────────────────────

class Report(models.Model):
    CONTENT_SNAP = 'snap'
    CONTENT_CHAT = 'chat_message'
    CONTENT_CHOICES = [(CONTENT_SNAP, 'Snap'), (CONTENT_CHAT, 'Chat message')]

    STATUS_PENDING = 'pending'
    STATUS_AI_REPORTED = 'ai_reported'
    STATUS_APPEAL_PENDING = 'appeal_pending'
    STATUS_APPEAL_ANALYZED = 'appeal_analyzed'
    STATUS_THIRD_LOOP = 'third_loop'
    STATUS_ENFORCED = 'enforced'
    STATUS_APPEAL_UPHELD = 'appeal_upheld'
    STATUS_WARNED = 'warned'
    STATUS_ADMIN_REMOVED = 'admin_removed'
    STATUS_ADMIN_DISMISSED = 'admin_dismissed'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_AI_REPORTED, 'AI reported'),
        (STATUS_APPEAL_PENDING, 'Appeal pending'),
        (STATUS_APPEAL_ANALYZED, 'Appeal analyzed'),
        (STATUS_THIRD_LOOP, 'Third loop'),
        (STATUS_ENFORCED, 'Enforced'),
        (STATUS_APPEAL_UPHELD, 'Appeal upheld'),
        (STATUS_WARNED, 'Warned'),
        (STATUS_ADMIN_REMOVED, 'Admin removed'),
        (STATUS_ADMIN_DISMISSED, 'Admin dismissed'),
    ]

    reporter = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='reports_filed')
    reported_user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='reports_received')
    content_type = models.CharField(max_length=16, choices=CONTENT_CHOICES)
    snap = models.ForeignKey(Snap, on_delete=models.SET_NULL, null=True, blank=True, related_name='reports')
    chat_message = models.ForeignKey(Message, on_delete=models.SET_NULL, null=True, blank=True, related_name='reports')
    template_reasons = models.JSONField(default=list)
    free_text = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    appeal_deadline = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['reported_user', 'status']),
            models.Index(fields=['reporter', 'created_at']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"Report #{self.pk} {self.reporter.username}→{self.reported_user.username} [{self.status}]"


class AiReport(models.Model):
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name='ai_reports')
    version = models.PositiveSmallIntegerField()
    provider = models.CharField(max_length=40)
    raw_response = models.JSONField(default=dict)
    report_document = models.TextField()
    violation_likelihood = models.FloatField()
    violation_categories = models.JSONField(default=dict)
    recommended_action = models.CharField(max_length=12)  # remove | warn | dismiss
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('report', 'version')
        ordering = ['report_id', 'version']

    def __str__(self):
        return f"AiReport v{self.version} for Report #{self.report_id}"


class SimilarityCheck(models.Model):
    report = models.OneToOneField(Report, on_delete=models.CASCADE, related_name='similarity_check')
    ai_report_v1 = models.ForeignKey(AiReport, on_delete=models.CASCADE, related_name='similarity_as_v1')
    ai_report_v2 = models.ForeignKey(AiReport, on_delete=models.CASCADE, related_name='similarity_as_v2')
    similarity_score = models.FloatField()
    provider = models.CharField(max_length=40, default='text-embedding-3-small')
    raw_response = models.JSONField(default=dict, blank=True)
    checked_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Similarity {self.similarity_score:.3f} on Report #{self.report_id}"


class Appeal(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_ENFORCED = 'enforced'
    STATUS_UPHELD = 'upheld'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_ENFORCED, 'Enforced'),
        (STATUS_UPHELD, 'Upheld'),
    ]

    report = models.OneToOneField(Report, on_delete=models.CASCADE, related_name='appeal')
    reported_user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='appeals')
    reason = models.TextField()
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Appeal on Report #{self.report_id} [{self.status}]"


class FunctionRestriction(models.Model):
    """A user's posting privileges are revoked for a window. Read by
    SnapUploadView (snap_posting/both) and MessageCreateView
    (chat_messaging/both); rows from `enforce()` set is_active=True and
    a duration based on prior offense count."""
    TYPE_SNAP = 'snap_posting'
    TYPE_CHAT = 'chat_messaging'
    TYPE_BOTH = 'both'
    TYPE_CHOICES = [
        (TYPE_SNAP, 'Snap posting'),
        (TYPE_CHAT, 'Chat messaging'),
        (TYPE_BOTH, 'Both'),
    ]

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='restrictions')
    restriction_type = models.CharField(max_length=16, choices=TYPE_CHOICES)
    report = models.ForeignKey(Report, on_delete=models.SET_NULL, null=True, blank=True, related_name='restrictions')
    offense_count = models.PositiveSmallIntegerField()
    expires_at = models.DateTimeField(null=True, blank=True)  # null = permanent until lifted
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'is_active', 'expires_at'])]

    def __str__(self):
        return f"Restriction {self.user.username} {self.restriction_type} offense#{self.offense_count}"


class UserBlock(models.Model):
    REASON_APPEAL = 'appeal_auto'
    REASON_MANUAL = 'manual'
    REASON_CHOICES = [
        (REASON_APPEAL, 'Appeal auto-block'),
        (REASON_MANUAL, 'Manual'),
    ]

    blocker = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='blocks_made')
    blocked = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='blocks_received')
    reason = models.CharField(max_length=16, choices=REASON_CHOICES, default=REASON_MANUAL)
    report = models.ForeignKey(Report, on_delete=models.SET_NULL, null=True, blank=True, related_name='blocks')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('blocker', 'blocked')
        indexes = [models.Index(fields=['blocker', 'blocked'])]

    def __str__(self):
        return f"{self.blocker.username} ⛔ {self.blocked.username}"