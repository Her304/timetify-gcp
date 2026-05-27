import logging
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import (
    Course, Week, Exam, Assignment, Friend, Snap, SnapAudience,
    ChatRoom, ChatRoomMember, Message,
    Report, AiReport, Appeal, UserBlock, FunctionRestriction,
    NotificationPreference, SnapGroup, SnapGroupMember,
)

User = get_user_model()
logger = logging.getLogger(__name__)

from django.db.models import Q

PROFILE_PICTURE_MAX_SIZE = 5 * 1024 * 1024  # 5 MB — matches DATA_UPLOAD_MAX_MEMORY_SIZE
PROFILE_PICTURE_ALLOWED_EXT = {'.jpg', '.jpeg', '.png', '.webp'}
_SIG_JPEG = b"\xff\xd8\xff"
_SIG_PNG = b"\x89PNG\r\n\x1a\n"
_SIG_RIFF = b"RIFF"
_SIG_WEBP = b"WEBP"

class UserSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    shared_courses = serializers.SerializerMethodField()
    last_snap_at = serializers.SerializerMethodField()
    profile_picture_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'university', 'major', 'grad_year',
            'status', 'shared_courses', 'last_seen', 'last_snap_at',
            'profile_picture', 'profile_picture_url',
        ]
        # username and email cannot be PATCHed via this serializer — they are identity
        # fields and require a dedicated flow (e.g. email verification) to change.
        read_only_fields = ['id', 'username', 'email', 'status', 'shared_courses', 'last_seen', 'last_snap_at', 'profile_picture_url']
        extra_kwargs = {
            # Raw field is upload-only; clients read profile_picture_url instead.
            'profile_picture': {'write_only': True, 'required': False},
        }

    def get_last_snap_at(self, obj):
        # Prefer the precomputed map FriendListView passes via context to avoid N+1s.
        precomputed = self.context.get('last_snap_by_user_id')
        if precomputed is not None:
            ts = precomputed.get(obj.id)
            return ts.isoformat() if ts else None
        return None

    def get_status(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            # Check if there is any friend relationship (pending or accepted)
            # Use Friend model to find relationship between request.user and obj
            friendship = Friend.objects.filter(
                (Q(user=request.user) & Q(friend=obj)) | (Q(user=obj) & Q(friend=request.user))
            ).first()
            if friendship:
                return friendship.status
        return None

    def get_shared_courses(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated or obj.id == request.user.id:
            return []
        my_ids = set(
            Course.objects.filter(user=request.user).values_list('course_id', flat=True)
        )
        if not my_ids:
            return []
        their_ids = list(
            Course.objects.filter(user=obj, course_id__in=my_ids)
            .values_list('course_id', flat=True)
            .distinct()
        )
        return their_ids

    def get_profile_picture_url(self, obj):
        if not obj.profile_picture:
            return None
        try:
            url = obj.profile_picture.url
        except Exception:
            # Storage backend missing the file, malformed name, etc.
            logger.warning("profile_picture.url failed for user_id=%s", obj.id, exc_info=True)
            return None
        request = self.context.get('request')
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def validate_profile_picture(self, value):
        if value is None:
            return value
        if value.size > PROFILE_PICTURE_MAX_SIZE:
            raise serializers.ValidationError("Image must be 5 MB or smaller.")
        name = (getattr(value, 'name', '') or '').lower()
        ext = name[name.rfind('.'):] if '.' in name else ''
        if ext not in PROFILE_PICTURE_ALLOWED_EXT:
            raise serializers.ValidationError("Only JPG, PNG, or WebP images are allowed.")
        head = value.read(16)
        value.seek(0)
        if ext in ('.jpg', '.jpeg'):
            ok = head.startswith(_SIG_JPEG)
        elif ext == '.png':
            ok = head.startswith(_SIG_PNG)
        elif ext == '.webp':
            ok = len(head) >= 12 and head.startswith(_SIG_RIFF) and head[8:12] == _SIG_WEBP
        else:
            ok = False
        if not ok:
            raise serializers.ValidationError("Image content does not match its extension.")
        return value

    def update(self, instance, validated_data):
        # Capture the previous file so we can purge it after a successful swap —
        # ImageField does not delete on overwrite, and GCS file_overwrite=False
        # means each upload otherwise leaves an orphan in the bucket.
        old_file = None
        if 'profile_picture' in validated_data and validated_data['profile_picture'] and instance.profile_picture:
            old_file = instance.profile_picture
        instance = super().update(instance, validated_data)
        if old_file and (not instance.profile_picture or old_file.name != instance.profile_picture.name):
            try:
                old_file.delete(save=False)
            except Exception:
                logger.warning("Failed to delete previous profile picture for user_id=%s", instance.id, exc_info=True)
        return instance

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ('username', 'password', 'password2', 'email', 'university', 'major', 'grad_year')

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        user = User.objects.create_user(**validated_data)
        return user
    
class WeekSerializer(serializers.ModelSerializer):
    class Meta:
        model = Week
        fields = '__all__'
        read_only_fields = ['id', 'user']

class ExamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exam
        fields = '__all__'
        read_only_fields = ['id', 'user']

class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = '__all__'
        read_only_fields = ['id', 'user']

class CourseSerializer(serializers.ModelSerializer):
    weeks = WeekSerializer(many=True, read_only=True)
    exams = ExamSerializer(many=True, read_only=True)
    assignments = AssignmentSerializer(many=True, read_only=True)
    child_courses = serializers.SerializerMethodField()
    
    class Meta:
        model = Course
        fields = '__all__'
        read_only_fields = ['id', 'user']
    
    def get_child_courses(self, obj):
        return [
            {
                'id': child.id,
                'course_id': child.course_id,
                'course_name': child.course_name,
                'start_time': child.start_time.strftime("%H:%M") if child.start_time else None,
                'end_time': child.end_time.strftime("%H:%M") if child.end_time else None,
                'rep_date': child.rep_date,
                'classroom': child.classroom,
                'is_lab': child.is_lab
            }
            for child in obj.child_courses.all()
        ]

class FriendSerializer(serializers.ModelSerializer):
    friend_details = serializers.SerializerMethodField()
    
    class Meta:
        model = Friend
        fields = ['id', 'user', 'friend', 'friend_details', 'status']
        read_only_fields = ['id', 'user']

    def get_friend_details(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        # The "friend" is the other user in the relationship
        other_user = obj.friend if obj.user == request.user else obj.user
        serializer = UserSerializer(other_user, context={'request': request})
        return serializer.data

class FriendRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Friend
        fields = ['friend']

    def validate_friend(self, value):
        if value == self.context['request'].user:
            raise serializers.ValidationError("Cannot send request to yourself")
        return value


class SnapSerializer(serializers.ModelSerializer):
    uploader_username = serializers.CharField(source='uploader.username', read_only=True)
    course_pk = serializers.IntegerField(source='course.id', read_only=True)
    course_code = serializers.CharField(source='course.course_id', read_only=True)
    course_name = serializers.CharField(source='course.course_name', read_only=True)
    media_url = serializers.SerializerMethodField()
    has_viewed = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    view_count = serializers.SerializerMethodField()

    class Meta:
        model = Snap
        fields = [
            'id', 'uploader', 'uploader_username',
            'course_pk', 'course_code', 'course_name',
            'media_url', 'media_type', 'caption',
            'visibility', 'has_viewed', 'is_mine',
            'view_count',
            'created_at', 'expires_at',
        ]
        read_only_fields = fields

    def get_media_url(self, obj):
        try:
            return obj.media_file.url
        except Exception:
            return None

    def get_has_viewed(self, obj):
        viewed = self.context.get('viewed_snap_ids') or set()
        return obj.id in viewed

    def get_is_mine(self, obj):
        request = self.context.get('request')
        return bool(request and request.user.is_authenticated and obj.uploader_id == request.user.id)

    def get_view_count(self, obj):
        counts = self.context.get('view_counts') or {}
        return int(counts.get(obj.id, 0))


class MessageSerializer(serializers.ModelSerializer):
    """One message row. `content` blanks out when soft-deleted so the
    frontend renders a `[message removed]` placeholder without leaking
    the original text (the column itself stays populated for future
    moderation use). `replied_snap` is the IG-style story-reply reference;
    once the snap is removed/expired/purged, the FK clears (SET_NULL) and
    the block becomes None — the frontend then renders a muted placeholder."""
    sender_id = serializers.IntegerField(read_only=True)
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    content = serializers.SerializerMethodField()
    replied_snap = serializers.SerializerMethodField()
    reply_to = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'room', 'sender_id', 'sender_username', 'content',
                  'replied_snap', 'reply_to', 'is_removed', 'created_at']
        read_only_fields = fields

    def get_content(self, obj):
        return '' if obj.is_removed else obj.content

    def get_reply_to(self, obj):
        parent = obj.reply_to
        if not parent:
            return None
        # Soft-deleted parents still render as context, but content is blanked
        # to avoid leaking moderated text (mirrors get_content's behavior).
        preview = '' if parent.is_removed else (parent.content or '')[:80]
        return {
            "id": parent.id,
            "sender_username": parent.sender.username,
            "content_preview": preview,
            "is_removed": parent.is_removed,
        }

    def get_replied_snap(self, obj):
        snap = obj.replied_snap
        if not snap:
            # FK is null → either bare message or the snap row itself was hard-
            # deleted (only happens manually; soft-delete keeps the row). Either
            # way, render as a normal bubble.
            return None
        try:
            thumb = snap.media_file.url if snap.media_file else None
        except Exception:
            thumb = None
        caption = (snap.caption or '')[:80]
        return {
            "id": snap.id,
            "uploader_username": snap.uploader.username,
            "course_code": snap.course.course_id if snap.course_id else None,
            "media_type": snap.media_type,
            "thumbnail_url": thumb,
            "caption_preview": caption,
            "is_expired": (snap.media_file is None) or snap.is_removed,
            "is_removed": snap.is_removed,
        }


class ChatRoomListSerializer(serializers.ModelSerializer):
    """Inbox row. For DMs: flattens `other_user`. For groups: emits
    `name`, `member_count`, and a 3-avatar `members_preview`. `last_message`
    includes `sender_username` so the group inbox can show 'alice: hi'."""
    other_user = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    members_preview = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = ['id', 'room_type', 'other_user', 'name', 'member_count',
                  'members_preview', 'last_message', 'unread_count',
                  'created_at']
        read_only_fields = fields

    def get_other_user(self, obj):
        if obj.room_type != ChatRoom.ROOM_DM:
            return None
        cache = self.context.get('other_user_by_room') or {}
        other = cache.get(obj.id)
        if not other:
            return None
        return {
            'id': other.id,
            'username': other.username,
            'last_seen': other.last_seen.isoformat() if other.last_seen else None,
        }

    def get_name(self, obj):
        return obj.name if obj.room_type == ChatRoom.ROOM_GROUP else None

    def _members(self, obj):
        cache = self.context.get('members_by_room') or {}
        return cache.get(obj.id, [])

    def get_member_count(self, obj):
        if obj.room_type != ChatRoom.ROOM_GROUP:
            return None
        return len(self._members(obj))

    def get_members_preview(self, obj):
        if obj.room_type != ChatRoom.ROOM_GROUP:
            return None
        # First 3 members; order is whatever the view passed in (joined order).
        return [{'id': u.id, 'username': u.username} for u in self._members(obj)[:3]]

    def get_last_message(self, obj):
        last_by_room = self.context.get('last_message_by_room') or {}
        msg = last_by_room.get(obj.id)
        if not msg:
            return None
        return {
            'id': msg.id,
            'sender_id': msg.sender_id,
            'sender_username': msg.sender.username,
            'content': '' if msg.is_removed else msg.content,
            'is_removed': msg.is_removed,
            'created_at': msg.created_at.isoformat(),
        }

    def get_unread_count(self, obj):
        unread_by_room = self.context.get('unread_by_room') or {}
        return int(unread_by_room.get(obj.id, 0))


class ChatRoomDetailSerializer(serializers.ModelSerializer):
    """Room detail with the latest 50 messages (descending). For DMs:
    emits `other_user`. For groups: emits `name` + `members` + `is_admin`."""
    other_user = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    messages = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = ['id', 'room_type', 'other_user', 'name', 'members',
                  'is_admin', 'messages', 'created_at']
        read_only_fields = fields

    def get_other_user(self, obj):
        if obj.room_type != ChatRoom.ROOM_DM:
            return None
        request = self.context.get('request')
        if not request:
            return None
        me_id = request.user.id
        other = next((m.user for m in obj.members.all() if m.user_id != me_id), None)
        if not other:
            return None
        return {
            'id': other.id,
            'username': other.username,
            'last_seen': other.last_seen.isoformat() if other.last_seen else None,
        }

    def get_name(self, obj):
        return obj.name if obj.room_type == ChatRoom.ROOM_GROUP else None

    def get_members(self, obj):
        if obj.room_type != ChatRoom.ROOM_GROUP:
            return None
        return [{
            'id': m.user_id,
            'username': m.user.username,
            'is_admin': m.is_admin,
            'last_seen': m.user.last_seen.isoformat() if m.user.last_seen else None,
        } for m in obj.members.all()]

    def get_is_admin(self, obj):
        if obj.room_type != ChatRoom.ROOM_GROUP:
            return None
        request = self.context.get('request')
        if not request:
            return False
        return any(m.user_id == request.user.id and m.is_admin for m in obj.members.all())

    def get_messages(self, obj):
        msgs = self.context.get('initial_messages') or []
        return MessageSerializer(msgs, many=True, context=self.context).data


# ──────────────────────────────────────────────────────────────────────────────
# Moderation serializers
# `AiReportSerializer` exposes `report_document` (the user-facing assessment)
# but never `raw_response` or `reasoning` — those are admin/internal-only and
# stay behind the staff endpoints.
# ──────────────────────────────────────────────────────────────────────────────

class AiReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = AiReport
        fields = [
            'id', 'version', 'report_document',
            'violation_likelihood', 'violation_categories',
            'recommended_action', 'generated_at',
        ]
        read_only_fields = fields


class AppealSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appeal
        fields = ['id', 'report', 'reason', 'status', 'created_at']
        read_only_fields = ['id', 'status', 'created_at']


class ReportSerializer(serializers.ModelSerializer):
    """Used by `/api/reports/my/` and `/api/reports/received/`. Both
    parties see the same `report_document` from each AiReport. The
    `appeal` block is exposed so the reported user knows whether
    they've already filed."""
    reporter_username = serializers.CharField(source='reporter.username', read_only=True)
    reported_username = serializers.CharField(source='reported_user.username', read_only=True)
    ai_reports = AiReportSerializer(many=True, read_only=True)
    appeal = AppealSerializer(read_only=True)
    can_appeal = serializers.SerializerMethodField()

    class Meta:
        model = Report
        fields = [
            'id', 'reporter', 'reporter_username',
            'reported_user', 'reported_username',
            'content_type', 'snap', 'chat_message',
            'template_reasons', 'free_text',
            'status', 'appeal_deadline',
            'ai_reports', 'appeal', 'can_appeal',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_can_appeal(self, obj):
        # The reported user can file an appeal exactly once, while the
        # report is still in 'ai_reported' and we're inside the deadline.
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        if request.user.id != obj.reported_user_id:
            return False
        if obj.status != Report.STATUS_AI_REPORTED:
            return False
        if not obj.appeal_deadline:
            return False
        from django.utils import timezone as _tz
        if _tz.now() >= obj.appeal_deadline:
            return False
        return not Appeal.objects.filter(report=obj).exists()


class ReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ['content_type', 'snap', 'chat_message', 'template_reasons', 'free_text']

    def validate(self, attrs):
        ct = attrs.get('content_type')
        snap = attrs.get('snap')
        chat_message = attrs.get('chat_message')
        if ct == Report.CONTENT_SNAP:
            if not snap or chat_message:
                raise serializers.ValidationError("Snap report requires `snap` and no chat_message.")
        elif ct == Report.CONTENT_CHAT:
            if not chat_message or snap:
                raise serializers.ValidationError("Chat report requires `chat_message` and no snap.")
        else:
            raise serializers.ValidationError("content_type must be 'snap' or 'chat_message'.")
        reasons = attrs.get('template_reasons') or []
        if not isinstance(reasons, list):
            raise serializers.ValidationError("template_reasons must be a list.")
        return attrs


class AppealCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appeal
        fields = ['report', 'reason']

    def validate_reason(self, value):
        v = (value or '').strip()
        if not v:
            raise serializers.ValidationError("Appeal reason is required.")
        if len(v) > 4000:
            raise serializers.ValidationError("Appeal reason must be ≤ 4000 chars.")
        return v


class UserBlockSerializer(serializers.ModelSerializer):
    blocked_username = serializers.CharField(source='blocked.username', read_only=True)

    class Meta:
        model = UserBlock
        fields = ['id', 'blocked', 'blocked_username', 'reason', 'created_at']
        read_only_fields = fields


class FunctionRestrictionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FunctionRestriction
        fields = [
            'id', 'restriction_type', 'offense_count',
            'expires_at', 'is_active', 'created_at',
        ]
        read_only_fields = fields


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            'snaps_from_friends', 'class_is_live', 'weekly_recap',
            'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end',
            'updated_at',
        ]
        read_only_fields = ['updated_at']


class SnapGroupMemberSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    major = serializers.CharField(source='user.major', read_only=True)
    grad_year = serializers.IntegerField(source='user.grad_year', read_only=True)

    class Meta:
        model = SnapGroupMember
        fields = ['id', 'username', 'major', 'grad_year', 'added_at']
        read_only_fields = fields


class SnapGroupSerializer(serializers.ModelSerializer):
    members = SnapGroupMemberSerializer(many=True, read_only=True)
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = SnapGroup
        fields = ['id', 'name', 'chat_room_id', 'members', 'member_count', 'created_at', 'updated_at']
        read_only_fields = fields

    def get_member_count(self, obj):
        return len(obj.members.all())