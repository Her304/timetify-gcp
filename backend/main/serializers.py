from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import Course, Week, Exam, Assignment, Friend

User = get_user_model()

from django.db.models import Q

class UserSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'university', 'major', 'grad_year', 'status']

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