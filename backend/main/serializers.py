from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import Course, Week, Exam, Assignment, Friend, Snap, SnapAudience, ChatRoom, ChatRoomMember, Message

User = get_user_model()

from django.db.models import Q

class UserSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    shared_courses = serializers.SerializerMethodField()
    last_snap_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'university', 'major', 'grad_year',
            'status', 'shared_courses', 'last_seen', 'last_snap_at',
        ]
        # username and email cannot be PATCHed via this serializer — they are identity
        # fields and require a dedicated flow (e.g. email verification) to change.
        read_only_fields = ['id', 'username', 'email', 'status', 'shared_courses', 'last_seen', 'last_snap_at']

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
    moderation use)."""
    sender_id = serializers.IntegerField(read_only=True)
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    content = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'room', 'sender_id', 'sender_username', 'content',
                  'is_removed', 'created_at']
        read_only_fields = fields

    def get_content(self, obj):
        return '' if obj.is_removed else obj.content


class ChatRoomListSerializer(serializers.ModelSerializer):
    """DM row for the inbox list. Flattens "other_user" so the client
    doesn't have to filter members and bundles the last message preview
    + my unread count (annotated upstream in the view via context)."""
    other_user = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = ['id', 'room_type', 'other_user', 'last_message',
                  'unread_count', 'created_at']
        read_only_fields = fields

    def _other_user(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        cache = self.context.get('other_user_by_room') or {}
        return cache.get(obj.id)

    def get_other_user(self, obj):
        other = self._other_user(obj)
        if not other:
            return None
        return {
            'id': other.id,
            'username': other.username,
            'last_seen': other.last_seen.isoformat() if other.last_seen else None,
        }

    def get_last_message(self, obj):
        last_by_room = self.context.get('last_message_by_room') or {}
        msg = last_by_room.get(obj.id)
        if not msg:
            return None
        return {
            'id': msg.id,
            'sender_id': msg.sender_id,
            'content': '' if msg.is_removed else msg.content,
            'is_removed': msg.is_removed,
            'created_at': msg.created_at.isoformat(),
        }

    def get_unread_count(self, obj):
        unread_by_room = self.context.get('unread_by_room') or {}
        return int(unread_by_room.get(obj.id, 0))


class ChatRoomDetailSerializer(serializers.ModelSerializer):
    """Room detail with the latest 50 messages (descending). Client
    reverses to render bottom-up."""
    other_user = serializers.SerializerMethodField()
    messages = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = ['id', 'room_type', 'other_user', 'messages', 'created_at']
        read_only_fields = fields

    def get_other_user(self, obj):
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

    def get_messages(self, obj):
        msgs = self.context.get('initial_messages') or []
        return MessageSerializer(msgs, many=True, context=self.context).data