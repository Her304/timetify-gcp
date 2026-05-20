import logging
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes

logger = logging.getLogger(__name__)
from rest_framework.response import Response
from rest_framework import status, generics, permissions, serializers
from . import models
from datetime import date
from django.utils import timezone
from django.db.models import Q
from .serializers import (
    RegisterSerializer, CourseSerializer, WeekSerializer,
    ExamSerializer, AssignmentSerializer, FriendSerializer,
    FriendRequestSerializer, UserSerializer, SnapSerializer,
    MessageSerializer, ChatRoomListSerializer, ChatRoomDetailSerializer,
)
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import Course, Week, Exam, Assignment, Friend, Snap, SnapAudience, ChatRoom, ChatRoomMember, Message
from datetime import datetime, timedelta
from django.contrib.auth import get_user_model
from main.utils import send_email

User = get_user_model()

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main.pdf import process_course_outline

def convert_date(date_str):
    """Convert date from 'Jan 13 2026' to '2026-01-13'"""
    if not date_str or date_str == '':
        return None
    try:
        for fmt in ['%b %d %Y', '%B %d %Y', '%Y-%m-%d']:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue
        return None
    except:
        return None

@api_view(['GET'])
def home(request):
    if not request.user.is_authenticated:
        return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
    
    user = request.user
    today = timezone.now().date()
    my_classes = models.Course.objects.filter(
        user=user,
        start_date__lte=today,
        end_date__gte=today
    )
    
    all_schedules = {"Me": {day: [] for day in ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]}}
    
    for cls in my_classes:
        days_list = cls.rep_date.split(',')
        for raw_day in days_list:
            normalized_day = raw_day.strip().upper()[:3]
            if normalized_day in all_schedules["Me"]:
                all_schedules["Me"][normalized_day].append({
                    "id": cls.id,
                    "course_id": cls.course_id,
                    "course_name": cls.course_name,
                    "classroom": cls.classroom,
                    "start_time": cls.start_time.strftime("%H:%M"),
                    "end_time": cls.end_time.strftime("%H:%M"),
                    "is_parent": cls.parent_course is None,
                    "parent_course_id": cls.parent_course.course_id if cls.parent_course else None,
                    "is_lab": cls.is_lab
                })
    
    shared_classes = set()
    friendships = models.Friend.objects.filter(status=1).filter(Q(user=user) | Q(friend=user)).select_related('user', 'friend')

    my_class_tuples = set(my_classes.values_list('course_id', 'classroom', 'start_time'))

    for fship in friendships:
        friend = fship.friend if fship.user == user else fship.user
        friend_name = friend.username
        friend_schedule = {day: [] for day in ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]}
        friend_classes = list(models.Course.objects.filter(
            user=friend,
            start_date__lte=today,
            end_date__gte=today
        ).select_related('parent_course').order_by("start_time"))

        friend_shared_keys = set()
        for f_cls in friend_classes:
            if (f_cls.course_id, f_cls.classroom, f_cls.start_time) in my_class_tuples:
                days_list = f_cls.rep_date.split(',')
                for raw_day in days_list:
                    normalized_day = raw_day.strip().upper()[:3]
                    key = (normalized_day, f_cls.course_id, f_cls.classroom, f_cls.start_time.strftime("%H:%M"))
                    friend_shared_keys.add(key)
                    shared_classes.add(key)

        for f_cls in friend_classes:
            days_list = f_cls.rep_date.split(',')
            for raw_day in days_list:
                normalized_day = raw_day.strip().upper()[:3]
                if normalized_day in friend_schedule:
                    class_key = (normalized_day, f_cls.course_id, f_cls.classroom, f_cls.start_time.strftime("%H:%M"))
                    entry_owner = f"{friend_name} & Me" if class_key in friend_shared_keys else friend_name
                    friend_schedule[normalized_day].append({
                        "id": f_cls.id,
                        "course_id": f_cls.course_id,
                        "course_name": f_cls.course_name,
                        "classroom": f_cls.classroom,
                        "start_time": f_cls.start_time.strftime("%H:%M"),
                        "end_time": f_cls.end_time.strftime("%H:%M"),
                        "is_lab": f_cls.is_lab,
                        "parent_course_id": f_cls.parent_course.course_id if f_cls.parent_course else None,
                        "_owner": entry_owner
                    })

        if friend_classes:
            all_schedules[friend_name] = friend_schedule
    
    combined_schedule = {day: [] for day in ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]}
    
    # Add the user's own classes
    for day, classes in all_schedules["Me"].items():
        for cls in classes:
            combined_schedule[day].append({
                "owner": "Me",
                **cls
            })
    
    # Add friend classes; shared ones use the per-entry _owner label (e.g. "Mary & Me");
    # non-shared ones use friend_name. Shared courses are NOT skipped — they appear
    # with the correct label. Remove the internal _owner key before appending.
    for owner, schedule in all_schedules.items():
        if owner != "Me":
            for day, classes in schedule.items():
                for cls in classes:
                    class_key = (day, cls["course_id"], cls["classroom"], cls["start_time"])
                    entry_owner = cls.pop("_owner", owner)
                    if class_key in shared_classes:
                        # Shared: show under friend's label (e.g. "Mary & Me"), skip from user's "Me" dupe
                        combined_schedule[day].append({
                            "owner": entry_owner,
                            **cls
                        })
                    else:
                        combined_schedule[day].append({
                            "owner": owner,
                            **cls
                        })
    
    for day in combined_schedule:
        combined_schedule[day].sort(key=lambda x: x["start_time"])
        
    return Response(combined_schedule)


@api_view(['GET', 'PATCH'])
@permission_classes([permissions.AllowAny])
def get_user(request):
    if not request.user.is_authenticated:
        if request.method == 'GET':
            return Response({'user': None})
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    
    if request.method == 'GET':
        serializer = UserSerializer(request.user, context={'request': request})
        return Response({'user': serializer.data})
    
    elif request.method == 'PATCH':
        serializer = UserSerializer(request.user, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response({'user': serializer.data})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response({
                'message': 'User created successfully',
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'university': user.university,
                    'major': user.major,
                    'grad_year': user.grad_year
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        # Username should not be case sensitive
        username = attrs.get("username")
        if username:
            user = User.objects.filter(username__iexact=username).first()
            if user:
                attrs["username"] = user.username
        data = super().validate(attrs)
        data['user'] = {
            'id': self.user.id,
            'username': self.user.username,
            'email': self.user.email,
            'university': self.user.university,
            'major': self.user.major,
            'grad_year': self.user.grad_year
        }
        data['is_temp_password'] = self.user.is_temp_password
        return data

class LoginView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]
    serializer_class = CustomTokenObtainPairSerializer

class CourseListCreateView(generics.ListCreateAPIView):
    serializer_class = CourseSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Course.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        course = serializer.save(user=self.request.user)
        main_course = None
        
        if course.course_outline:
            try:
                result = process_course_outline(course.course_outline.path)
                logger.debug("AI Response received")

                for course_data in result.get('courses', []):
                    start_date = convert_date(course_data.get('start_date'))
                    end_date = convert_date(course_data.get('end_date'))

                    if not start_date or not end_date:
                        logger.debug("Skipping course with invalid dates")
                        continue
                    
                    classroom = course_data.get('classroom', 'TBD')
                    start_time = course_data.get('start_time', '09:00')
                    end_time = course_data.get('end_time', '17:00')
                    rep_date = course_data.get('rep_date', 'Monday')
                    is_main = course_data.get('is_main', False)
                    is_lab = course_data.get('is_lab', False)
                    
                    if is_main:
                        course.course_name = course_data.get('course_name', course.course_name)
                        course.course_id = course_data.get('course_id', course.course_id)
                        course.classroom = classroom
                        course.start_time = start_time
                        course.end_time = end_time
                        course.start_date = start_date
                        course.end_date = end_date
                        course.rep_date = rep_date
                        course.is_lab = is_lab
                        course.has_ai_content = True
                        course.save()
                        main_course = course
                        logger.debug("Updated main course")
                        
                        start_datetime = datetime.strptime(start_date, '%Y-%m-%d')
                        for w in course_data.get("weeks", []):
                            week_num = w.get("week_number", 1)
                            week_date = start_datetime + timedelta(days=(week_num - 1) * 7)
                            Week.objects.create(
                                user=self.request.user,
                                course=course,
                                week_number=week_num,
                                week_date=week_date.strftime('%Y-%m-%d'),
                                week_topic=w.get("week_topic", "")
                            )
                        
                        for e_item in course_data.get("exams", []):
                            if e_item.get('exam_topic'):
                                Exam.objects.create(
                                    user=self.request.user,
                                    course=course,
                                    exam_date=f"{start_date}T00:00:00Z",
                                    exam_topic=e_item.get("exam_topic", ""),
                                    exam_details=e_item.get("exam_details", "")
                                )
                        
                        for a_item in course_data.get("assignments", []):
                            if a_item.get('assignment_topic'):
                                Assignment.objects.create(
                                    user=self.request.user,
                                    course=course,
                                    assignment_due=f"{start_date}T00:00:00Z",
                                    assignment_topic=a_item.get("assignment_topic", ""),
                                    assignment_detail=a_item.get("assignment_detail", "")
                                )
                    else:
                        secondary_course = Course.objects.create(
                            user=self.request.user,
                            course_id=course_data['course_id'],
                            course_name=course_data['course_name'],
                            classroom=classroom,
                            start_time=start_time,
                            end_time=end_time,
                            start_date=start_date,
                            end_date=end_date,
                            rep_date=rep_date,
                            has_ai_content=True,
                            parent_course=main_course,
                            is_lab=is_lab
                        )
                        logger.debug("Created secondary course")

            except Exception:
                logger.exception("Error parsing PDF")
            finally:
                # Delete the uploaded file after processing
                if course.course_outline:
                    try:
                        course.course_outline.delete(save=False)
                        course.course_outline = None
                        course.save()
                    except Exception:
                        logger.exception("Error deleting course outline file")


import uuid

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".docx"}
ALLOWED_UPLOAD_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
PDF_MAGIC = b"%PDF"
DOCX_MAGIC = b"PK\x03\x04"


class CourseAnalyzeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if 'course_outline' not in request.FILES:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        file_obj = request.FILES['course_outline']

        if file_obj.size > MAX_UPLOAD_SIZE:
            return Response(
                {"error": "File too large. Maximum size is 5 MB."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        ext = os.path.splitext(file_obj.name)[1].lower()
        if ext not in ALLOWED_UPLOAD_EXTENSIONS:
            return Response(
                {"error": "Unsupported file type. Upload a PDF or DOCX."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if file_obj.content_type and file_obj.content_type not in ALLOWED_UPLOAD_CONTENT_TYPES:
            return Response(
                {"error": "Unsupported file type. Upload a PDF or DOCX."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        head = file_obj.read(4)
        file_obj.seek(0)
        if ext == ".pdf" and not head.startswith(PDF_MAGIC):
            return Response({"error": "File is not a valid PDF."}, status=status.HTTP_400_BAD_REQUEST)
        if ext == ".docx" and not head.startswith(DOCX_MAGIC):
            return Response({"error": "File is not a valid DOCX."}, status=status.HTTP_400_BAD_REQUEST)

        # Use /tmp for Cloud Run compatibility (guaranteed writable).
        temp_dir = os.path.join('/tmp', 'course_analysis')
        os.makedirs(temp_dir, exist_ok=True)

        # Server-generated filename — never trust the client-supplied name.
        temp_path = os.path.join(temp_dir, f"{uuid.uuid4().hex}{ext}")

        try:
            with open(temp_path, 'wb+') as destination:
                for chunk in file_obj.chunks():
                    destination.write(chunk)

            result = process_course_outline(temp_path)
            return Response(result)
        except Exception as e:
            return Response(
                {"error": "Failed to analyze document.", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

class CourseFinalizeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        courses_data = request.data.get('courses', [])
        if not courses_data:
            return Response({"error": "No course data provided"}, status=status.HTTP_400_BAD_REQUEST)
        
        main_course = None
        created_courses = []

        try:
            # We process main course first to get the parent_course for others
            main_course_data = next((c for c in courses_data if c.get('is_main')), None)
            if not main_course_data and courses_data:
                main_course_data = courses_data[0] # Fallback
            
            if main_course_data:
                # Create main course
                main_course = Course.objects.create(
                    user=request.user,
                    course_id=main_course_data.get('course_id'),
                    course_name=main_course_data.get('course_name'),
                    classroom=main_course_data.get('classroom', 'TBD'),
                    start_time=main_course_data.get('start_time', '09:00'),
                    end_time=main_course_data.get('end_time', '17:00'),
                    start_date=convert_date(main_course_data.get('start_date')),
                    end_date=convert_date(main_course_data.get('end_date')),
                    rep_date=main_course_data.get('rep_date', 'Monday'),
                    is_lab=main_course_data.get('is_lab', False),
                    has_ai_content=True
                )
                created_courses.append(main_course)

                # Create other courses
                start_date_str = convert_date(main_course_data.get('start_date'))
                for course_data in courses_data:
                    if course_data == main_course_data:
                        current_course = main_course
                    else:
                        current_course = Course.objects.create(
                            user=request.user,
                            course_id=course_data.get('course_id'),
                            course_name=course_data.get('course_name'),
                            classroom=course_data.get('classroom', 'TBD'),
                            start_time=course_data.get('start_time', '09:00'),
                            end_time=course_data.get('end_time', '17:00'),
                            start_date=convert_date(course_data.get('start_date')),
                            end_date=convert_date(course_data.get('end_date')),
                            rep_date=course_data.get('rep_date', 'Monday'),
                            has_ai_content=True,
                            parent_course=main_course,
                            is_lab=course_data.get('is_lab', False)
                        )
                    
                    # Create details for THIS course (whether main or secondary)
                    course_start_date = convert_date(course_data.get('start_date')) or start_date_str
                    if course_start_date:
                        start_datetime = datetime.strptime(course_start_date, '%Y-%m-%d')
                        for w in course_data.get("weeks", []):
                            week_num = w.get("week_number", 1)
                            week_date = start_datetime + timedelta(days=(week_num - 1) * 7)
                            Week.objects.create(
                                user=request.user,
                                course=current_course,
                                week_number=week_num,
                                week_date=week_date.strftime('%Y-%m-%d'),
                                week_topic=w.get("week_topic", "")
                            )

                    # Create exams for THIS course
                    for e_item in course_data.get("exams", []):
                        exam_date = convert_date(e_item.get('exam_date')) or course_start_date
                        if exam_date:
                            Exam.objects.create(
                                user=request.user,
                                course=current_course,
                                exam_date=f"{exam_date}T00:00:00Z",
                                exam_topic=e_item.get("exam_topic", ""),
                                exam_details=e_item.get("exam_details", "")
                            )

                    # Create assignments for THIS course
                    for a_item in course_data.get("assignments", []):
                        due_date = convert_date(a_item.get('assignment_due')) or course_start_date
                        if due_date:
                            Assignment.objects.create(
                                user=request.user,
                                course=current_course,
                                assignment_due=f"{due_date}T00:00:00Z",
                                assignment_topic=a_item.get("assignment_topic", ""),
                                assignment_detail=a_item.get("assignment_detail", "")
                            )

            return Response({"success": True}, status=status.HTTP_201_CREATED)
        except Exception:
            logger.exception("Error finalizing course")
            return Response({"error": "Failed to finalize course"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class CourseDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CourseSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Course.objects.filter(user=self.request.user)
    
    def get_object(self):
        obj = super().get_object()
        if obj.parent_course:
            return obj.parent_course
        return obj

class WeekListCreateView(generics.ListCreateAPIView):
    serializer_class = WeekSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Week.objects.filter(course__user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class WeekDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = WeekSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Week.objects.filter(course__user=self.request.user)

class ExamListCreateView(generics.ListCreateAPIView):
    serializer_class = ExamSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Exam.objects.filter(course__user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class ExamDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ExamSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Exam.objects.filter(course__user=self.request.user)

class AssignmentListCreateView(generics.ListCreateAPIView):
    serializer_class = AssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Assignment.objects.filter(course__user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class AssignmentDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = AssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Assignment.objects.filter(course__user=self.request.user)
    
class FriendRequestView(generics.CreateAPIView):
    serializer_class = FriendRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user, status=0)

class FriendRequestListView(generics.ListAPIView):
    serializer_class = FriendSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Friend.objects.filter(friend=self.request.user, status=0)

class FriendRequestUpdateView(generics.UpdateAPIView):
    serializer_class = FriendSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Friend.objects.filter(friend=self.request.user, status=0)
    
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        action = request.data.get('action')
        
        if action == 'accept':
            instance.status = 1
            instance.save()
            
            reciprocal, created = models.Friend.objects.get_or_create(
                user=instance.friend,
                friend=instance.user
            )
            reciprocal.status = 1
            reciprocal.save()
            
            return Response({'message': 'Friend request accepted and connected'}, status=status.HTTP_200_OK)
        elif action == 'reject':
            instance.status = 2
            instance.save()
            return Response({'message': 'Friend request rejected'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)

class FriendListView(generics.ListAPIView):
    serializer_class = FriendSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        friendships = models.Friend.objects.filter(
            Q(user=user) | Q(friend=user),
            status=1
        )

        seen_friend_ids = set()
        unique_friendship_ids = []

        for f in friendships:
            other_user_id = f.friend_id if f.user_id == user.id else f.user_id
            if other_user_id not in seen_friend_ids:
                seen_friend_ids.add(other_user_id)
                unique_friendship_ids.append(f.id)

        self._friend_user_ids = list(seen_friend_ids)
        return models.Friend.objects.filter(id__in=unique_friendship_ids)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        # Precompute newest unexpired snap per friend so the friends page can
        # render "snapped Xm ago" without an N+1 lookup per row.
        friend_ids = getattr(self, "_friend_user_ids", None) or []
        last_snap_by_user_id = {}
        if friend_ids:
            now = timezone.now()
            rows = (
                Snap.objects.filter(
                    uploader_id__in=friend_ids,
                    is_removed=False,
                    expires_at__gt=now,
                )
                .values('uploader_id')
                .order_by('uploader_id', '-created_at')
            )
            for r in rows:
                uid = r['uploader_id']
                if uid not in last_snap_by_user_id:
                    last_snap_by_user_id[uid] = None  # placeholder
            # second pass to grab the max created_at per uploader
            from django.db.models import Max
            agg = (
                Snap.objects.filter(
                    uploader_id__in=friend_ids,
                    is_removed=False,
                    expires_at__gt=now,
                )
                .values('uploader_id')
                .annotate(latest=Max('created_at'))
            )
            last_snap_by_user_id = {row['uploader_id']: row['latest'] for row in agg}
        ctx['last_snap_by_user_id'] = last_snap_by_user_id
        return ctx

class SearchFriend(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        query = self.request.query_params.get('q', '')
        if query:
            existing_friends = Friend.objects.filter(
                Q(user=self.request.user) | Q(friend=self.request.user)
            ).values_list('user', 'friend')
            
            friend_ids = set()
            for u, f in existing_friends:
                friend_ids.add(u)
                friend_ids.add(f)
            
            # Search by username only — searching by email substring leaks
            # every user's email address to any authenticated attacker.
            return User.objects.filter(
                username__icontains=query
            ).exclude(id__in=friend_ids).exclude(id=self.request.user.id)
        return User.objects.none()

class TestEmailView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        to_email = request.user.email
        subject = "Test Email from Timetify"
        message = "This is a test email to verify your email service is working."
        
        if send_email(to_email, subject, message):
            return Response({'message': 'Test email sent successfully'})
        return Response({'error': 'Failed to send test email'}, status=500)

class ErrorReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        description = request.data.get('description')
        frontend_logs = request.data.get('frontend_logs')
        user = request.user
        
        # Fetch backend logs for today for this user
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        backend_logs_query = models.BackendLog.objects.filter(
            user=user,
            timestamp__gte=today_start
        ).order_by('timestamp')
        
        backend_logs_text = "\n".join([
            f"[{log.timestamp}] {log.level}: {log.message}" 
            for log in backend_logs_query
        ])
        
        # Save Error Report
        report = models.ErrorReport.objects.create(
            user=user,
            description=description,
            frontend_logs=frontend_logs,
            backend_logs=backend_logs_text
        )
        
        # Send Email
        subject = f"Error Report from {user.username}"
        message = f"""
User ID: {user.id}
Username: {user.username}
Email: {user.email}

Problem Description:
{description}

--- FRONTEND LOGS ---
{frontend_logs}

--- BACKEND LOGS ---
{backend_logs_text}
"""
        # Sending to the provided DEFAULT_FROM_EMAIL as a placeholder for "timetify" support
        support_email = settings.DEFAULT_FROM_EMAIL
        
        from main.utils import send_email
        if send_email(support_email, subject, message):
            return Response({'message': 'Error report submitted successfully', 'report_id': report.id}, status=status.HTTP_201_CREATED)
        else:
            return Response({'message': 'Report saved but email failed', 'report_id': report.id}, status=status.HTTP_201_CREATED)

# ---------------------------------------------------------------------------
# Snap feature
# ---------------------------------------------------------------------------
from django.db import transaction
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from .models import Snap, SnapAudience

SNAP_MAX_SIZE = 20 * 1024 * 1024  # 20 MB
SNAP_ALLOWED_EXT_PHOTO = {".jpg", ".jpeg", ".png"}
SNAP_ALLOWED_EXT_VIDEO = {".mp4", ".mov", ".webm"}
SNAP_ALLOWED_CT_PHOTO = {"image/jpeg", "image/png"}
SNAP_ALLOWED_CT_VIDEO = {"video/mp4", "video/quicktime", "video/webm"}

SIG_JPEG = b"\xff\xd8\xff"
SIG_PNG = b"\x89PNG\r\n\x1a\n"
SIG_WEBM = b"\x1a\x45\xdf\xa3"


def _friend_user_ids(user):
    """Return the set of user_ids of `user`'s accepted friends (either direction)."""
    rows = Friend.objects.filter(status=Friend.ACCEPTED).filter(
        Q(user=user) | Q(friend=user)
    ).values_list("user_id", "friend_id")
    ids = set()
    for u_id, f_id in rows:
        if u_id != user.id:
            ids.add(u_id)
        if f_id != user.id:
            ids.add(f_id)
    return ids


def _check_magic(head_bytes, ext, media_type):
    if media_type == Snap.MEDIA_PHOTO:
        if ext in (".jpg", ".jpeg"):
            return head_bytes.startswith(SIG_JPEG)
        if ext == ".png":
            return head_bytes.startswith(SIG_PNG)
        return False
    if media_type == Snap.MEDIA_VIDEO:
        if ext in (".mp4", ".mov"):
            # ISO BMFF: bytes 4..8 == 'ftyp'
            return len(head_bytes) >= 8 and head_bytes[4:8] == b"ftyp"
        if ext == ".webm":
            return head_bytes.startswith(SIG_WEBM)
        return False
    return False


def _compute_expires_at(tz_name):
    """Midnight of the *next* day in the user's IANA TZ, converted to UTC."""
    try:
        tz = ZoneInfo(tz_name) if tz_name else ZoneInfo("UTC")
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    now_local = timezone.now().astimezone(tz)
    tomorrow_local = (now_local + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return tomorrow_local.astimezone(ZoneInfo("UTC"))


from rest_framework.parsers import MultiPartParser, FormParser


class SnapUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        restriction = _active_restriction(request.user, 'snap_posting')
        if restriction:
            return Response(_restriction_403_payload(restriction), status=status.HTTP_403_FORBIDDEN)

        file_obj = request.FILES.get("media")
        if not file_obj:
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        media_type = (request.data.get("media_type") or "").strip().lower()
        if media_type not in (Snap.MEDIA_PHOTO, Snap.MEDIA_VIDEO):
            return Response({"error": "media_type must be 'photo' or 'video'."},
                            status=status.HTTP_400_BAD_REQUEST)

        course_pk = request.data.get("course_pk")
        if not course_pk:
            return Response({"error": "course_pk is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            course = Course.objects.get(pk=course_pk, user=request.user)
        except Course.DoesNotExist:
            return Response({"error": "Course not found or not yours."},
                            status=status.HTTP_404_NOT_FOUND)

        if file_obj.size > SNAP_MAX_SIZE:
            return Response({"error": "File too large. Maximum size is 20 MB."},
                            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        ext = os.path.splitext(file_obj.name)[1].lower()
        allowed_ext = SNAP_ALLOWED_EXT_PHOTO if media_type == Snap.MEDIA_PHOTO else SNAP_ALLOWED_EXT_VIDEO
        allowed_ct = SNAP_ALLOWED_CT_PHOTO if media_type == Snap.MEDIA_PHOTO else SNAP_ALLOWED_CT_VIDEO
        if ext not in allowed_ext:
            return Response({"error": f"Unsupported file extension for {media_type}."},
                            status=status.HTTP_400_BAD_REQUEST)
        if file_obj.content_type and file_obj.content_type.split(";")[0].strip() not in allowed_ct:
            return Response({"error": f"Unsupported content type for {media_type}."},
                            status=status.HTTP_400_BAD_REQUEST)

        head = file_obj.read(16)
        file_obj.seek(0)
        if not _check_magic(head, ext, media_type):
            return Response({"error": "File contents do not match the declared type."},
                            status=status.HTTP_400_BAD_REQUEST)

        visibility = (request.data.get("visibility") or Snap.VIS_ALL_FRIENDS).strip().lower()
        if visibility not in (Snap.VIS_ALL_FRIENDS, Snap.VIS_SELECTED, Snap.VIS_GROUP):
            return Response({"error": "Invalid visibility."}, status=status.HTTP_400_BAD_REQUEST)

        audience_ids = []
        if visibility == Snap.VIS_SELECTED:
            raw = request.data.getlist("audience_user_ids") if hasattr(request.data, "getlist") else request.data.get("audience_user_ids", [])
            try:
                audience_ids = [int(x) for x in (raw or []) if str(x).strip()]
            except (TypeError, ValueError):
                return Response({"error": "audience_user_ids must be integers."},
                                status=status.HTTP_400_BAD_REQUEST)
            if not audience_ids:
                return Response({"error": "Select at least one friend."},
                                status=status.HTTP_400_BAD_REQUEST)
            my_friends = _friend_user_ids(request.user)
            if not set(audience_ids).issubset(my_friends):
                return Response({"error": "Audience must contain only your friends."},
                                status=status.HTTP_403_FORBIDDEN)
        elif visibility == Snap.VIS_GROUP:
            # Resolve the saved group → current member ids, intersected with the
            # caller's current friend set. Non-friends at send time are silently
            # dropped so a stale group doesn't leak content to ex-friends.
            from .models import SnapGroup as _SG
            group_id_raw = request.data.get("group_id")
            try:
                group_id = int(group_id_raw)
            except (TypeError, ValueError):
                return Response({"error": "group_id is required for visibility='group'."},
                                status=status.HTTP_400_BAD_REQUEST)
            try:
                group = _SG.objects.prefetch_related('members').get(pk=group_id, owner=request.user)
            except _SG.DoesNotExist:
                return Response({"error": "Snap group not found."},
                                status=status.HTTP_404_NOT_FOUND)
            my_friends = _friend_user_ids(request.user)
            audience_ids = [m.user_id for m in group.members.all() if m.user_id in my_friends]
            if not audience_ids:
                return Response({"error": "This group has no current friends to share with."},
                                status=status.HTTP_400_BAD_REQUEST)

        raw_caption = (request.data.get("caption") or "").strip()
        caption_words = raw_caption.split()
        if len(caption_words) > 50:
            caption_words = caption_words[:50]
        caption = " ".join(caption_words)[:1000]
        tz_name = (request.data.get("timezone") or "").strip()
        expires_at = _compute_expires_at(tz_name)

        try:
            with transaction.atomic():
                snap = Snap.objects.create(
                    uploader=request.user,
                    course=course,
                    media_file=file_obj,
                    media_type=media_type,
                    caption=caption,
                    visibility=visibility,
                    expires_at=expires_at,
                )
                if visibility in (Snap.VIS_SELECTED, Snap.VIS_GROUP):
                    SnapAudience.objects.bulk_create([
                        SnapAudience(snap=snap, viewer_id=uid, has_viewed=False)
                        for uid in audience_ids
                    ])
        except Exception:
            logger.exception("Snap upload failed")
            return Response({"error": "Failed to save snap."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(
            SnapSerializer(snap, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class SnapFeedView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        me = request.user
        now = timezone.now()
        friend_ids = _friend_user_ids(me)
        selected_snap_ids = list(
            SnapAudience.objects.filter(viewer=me).values_list("snap_id", flat=True)
        )
        blocked_ids = _blocked_user_ids(me)

        qs = Snap.objects.filter(is_removed=False, expires_at__gt=now).filter(
            Q(uploader=me)
            | (Q(visibility=Snap.VIS_ALL_FRIENDS) & Q(uploader_id__in=friend_ids))
            | (Q(visibility__in=[Snap.VIS_SELECTED, Snap.VIS_GROUP]) & Q(id__in=selected_snap_ids))
        ).select_related("uploader", "course").order_by("course_id", "-created_at")
        if blocked_ids:
            qs = qs.exclude(uploader_id__in=blocked_ids)

        snaps = list(qs)
        snap_ids = [s.id for s in snaps]
        viewed_ids = set(
            SnapAudience.objects.filter(
                viewer=me, has_viewed=True, snap_id__in=snap_ids
            ).values_list("snap_id", flat=True)
        )

        from django.db.models import Count
        view_count_rows = (
            SnapAudience.objects
            .filter(snap_id__in=snap_ids, has_viewed=True)
            .values('snap_id')
            .annotate(c=Count('id'))
        )
        view_counts = {row['snap_id']: row['c'] for row in view_count_rows}

        ctx = {"request": request, "viewed_snap_ids": viewed_ids, "view_counts": view_counts}
        grouped = {}
        for snap in snaps:
            key = str(snap.course_id)
            grouped.setdefault(key, []).append(SnapSerializer(snap, context=ctx).data)

        return Response({"snaps_by_course": grouped})


class SnapViewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        me = request.user
        try:
            snap = Snap.objects.select_related("uploader").get(
                pk=pk, is_removed=False, expires_at__gt=timezone.now()
            )
        except Snap.DoesNotExist:
            return Response({"error": "Snap not found."}, status=status.HTTP_404_NOT_FOUND)

        # Authorization: uploader, allowlisted (selected/group), or current friend (all_friends).
        if snap.uploader_id != me.id:
            allowed = False
            if snap.visibility == Snap.VIS_ALL_FRIENDS:
                allowed = snap.uploader_id in _friend_user_ids(me)
            else:
                allowed = SnapAudience.objects.filter(snap=snap, viewer=me).exists()
            # A block in either direction overrides any otherwise-allowed access.
            if allowed and _is_blocked_between(me, snap.uploader):
                allowed = False
            if not allowed:
                return Response({"error": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

            SnapAudience.objects.update_or_create(
                snap=snap, viewer=me,
                defaults={"has_viewed": True, "viewed_at": timezone.now()},
            )
        # uploader viewing their own snap: no-op (don't create a self audience row).
        return Response({"ok": True})


class SnapDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        try:
            snap = Snap.objects.get(pk=pk, uploader=request.user, is_removed=False)
        except Snap.DoesNotExist:
            return Response({"error": "Snap not found."}, status=status.HTTP_404_NOT_FOUND)
        snap.is_removed = True
        snap.save(update_fields=["is_removed"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        me = request.user
        # Per-user preferences gate which sections we surface. The row is
        # auto-created with defaults on first read so existing users still
        # get the usual payload until they explicitly opt out.
        # NOTE: weekly_recap and quiet_hours_* persist only — no push/email
        # pipeline yet, so they don't influence what comes back here.
        from .models import NotificationPreference as _NP
        prefs, _ = _NP.objects.get_or_create(user=me)
        now = timezone.now()
        today = now.date()
        day_map = {0: "MON", 1: "TUE", 2: "WED", 3: "THU", 4: "FRI", 5: "SAT", 6: "SUN"}
        current_day = day_map[now.weekday()]
        current_time_str = now.strftime("%H:%M")

        # 1. Pending friend requests (me = recipient)
        pending = Friend.objects.filter(
            friend=me, status=Friend.PENDING
        ).select_related("user")
        friend_requests_data = [
            {
                "id": req.id,
                "user_id": req.user.id,
                "username": req.user.username,
                "major": req.user.major,
                "grad_year": req.user.grad_year,
            }
            for req in pending
        ]

        # 2. Unseen snaps from friends (not viewed by me, not expired).
        # Gate: prefs.snaps_from_friends=False → return [] without querying.
        friend_ids = _friend_user_ids(me)
        new_snaps_data = []
        if prefs.snaps_from_friends:
            selected_snap_ids = list(
                SnapAudience.objects.filter(viewer=me).values_list("snap_id", flat=True)
            )
            feed_snaps = list(
                Snap.objects.filter(is_removed=False, expires_at__gt=now)
                .filter(
                    (Q(visibility=Snap.VIS_ALL_FRIENDS) & Q(uploader_id__in=friend_ids))
                    | (Q(visibility__in=[Snap.VIS_SELECTED, Snap.VIS_GROUP]) & Q(id__in=selected_snap_ids))
                )
                .select_related("uploader", "course")
            )
            viewed_ids = set(
                SnapAudience.objects.filter(
                    viewer=me, has_viewed=True, snap_id__in=[s.id for s in feed_snaps]
                ).values_list("snap_id", flat=True)
            )
            new_snaps_data = [
                {
                    "id": snap.id,
                    "uploader_id": snap.uploader_id,
                    "uploader_username": snap.uploader.username,
                    "course_code": snap.course.course_id,
                    "course_name": snap.course.course_name,
                    "media_type": snap.media_type,
                    "created_at": snap.created_at.isoformat(),
                }
                for snap in feed_snaps
                if snap.id not in viewed_ids
            ]

        # 3. Live class alerts — courses happening right now with 3+ friends enrolled.
        # Gate: prefs.class_is_live=False → return [].
        live_class_alerts = []
        if friend_ids and prefs.class_is_live:
            my_courses_today = list(
                Course.objects.filter(user=me, start_date__lte=today, end_date__gte=today)
            )
            my_live = [
                c for c in my_courses_today
                if current_day in [d.strip().upper()[:3] for d in c.rep_date.split(",")]
                and c.start_time.strftime("%H:%M") <= current_time_str < c.end_time.strftime("%H:%M")
            ]
            if my_live:
                live_course_ids = [c.course_id for c in my_live]
                friend_courses = list(
                    Course.objects.filter(
                        user_id__in=friend_ids,
                        course_id__in=live_course_ids,
                        start_date__lte=today,
                        end_date__gte=today,
                    ).select_related("user")
                )
                # Group by course_id → {user_id: username}, filtered to live right now
                course_to_friends: dict = {}
                for fc in friend_courses:
                    days = [d.strip().upper()[:3] for d in fc.rep_date.split(",")]
                    if current_day in days and fc.start_time.strftime("%H:%M") <= current_time_str < fc.end_time.strftime("%H:%M"):
                        bucket = course_to_friends.setdefault(fc.course_id, {})
                        bucket[fc.user.id] = fc.user.username

                for course in my_live:
                    friends_map = course_to_friends.get(course.course_id, {})
                    if len(friends_map) >= 3:
                        live_class_alerts.append({
                            "course_id": course.course_id,
                            "course_name": course.course_name,
                            "friend_count": len(friends_map),
                            "friends": [
                                {"id": uid, "username": uname}
                                for uid, uname in list(friends_map.items())[:5]
                            ],
                        })

        # 4. Reports against me that are still appealable, plus a short summary
        # of reports I've filed so the user can track the moderation flow from
        # the bell. We import here so this stays optional — pre-Phase-7 deploys
        # that don't have the moderation tables would still serve a payload.
        reports_received_data = []
        reports_filed_data = []
        try:
            from .models import Report as _Report, Appeal as _Appeal
            received_qs = (
                _Report.objects
                .filter(reported_user=me)
                .exclude(status__in=[
                    _Report.STATUS_ENFORCED,
                    _Report.STATUS_APPEAL_UPHELD,
                    _Report.STATUS_ADMIN_REMOVED,
                    _Report.STATUS_ADMIN_DISMISSED,
                ])
                .prefetch_related('ai_reports', 'appeal')
                .order_by('-created_at')[:10]
            )
            for rep in received_qs:
                latest_ai = max(rep.ai_reports.all(), key=lambda a: a.version, default=None)
                has_appeal = bool(getattr(rep, 'appeal', None))
                can_appeal = (
                    rep.status == _Report.STATUS_AI_REPORTED
                    and rep.appeal_deadline is not None
                    and now < rep.appeal_deadline
                    and not has_appeal
                )
                reports_received_data.append({
                    "id": rep.id,
                    "content_type": rep.content_type,
                    "status": rep.status,
                    "appeal_deadline": rep.appeal_deadline.isoformat() if rep.appeal_deadline else None,
                    "created_at": rep.created_at.isoformat(),
                    "report_document": latest_ai.report_document if latest_ai else None,
                    "recommended_action": latest_ai.recommended_action if latest_ai else None,
                    "can_appeal": can_appeal,
                })

            filed_qs = (
                _Report.objects
                .filter(reporter=me)
                .prefetch_related('ai_reports')
                .order_by('-created_at')[:10]
            )
            for rep in filed_qs:
                latest_ai = max(rep.ai_reports.all(), key=lambda a: a.version, default=None)
                reports_filed_data.append({
                    "id": rep.id,
                    "content_type": rep.content_type,
                    "status": rep.status,
                    "created_at": rep.created_at.isoformat(),
                    "report_document": latest_ai.report_document if latest_ai else None,
                })
        except Exception:
            # Moderation tables not present (pre-Phase-7 deploys) — silently skip
            # so the rest of the panel still renders.
            logger.exception("notifications: moderation summary failed")

        return Response({
            "friend_requests": friend_requests_data,
            "new_snaps": new_snaps_data,
            "live_class_alerts": live_class_alerts,
            "reports_received": reports_received_data,
            "reports_filed": reports_filed_data,
        })


# ---------------------------------------------------------------------------
# Phase 10A — Chat v1 (DM only)
# ---------------------------------------------------------------------------

MESSAGE_MAX_LEN = 2000
INITIAL_MESSAGE_PAGE = 50
OLDER_MESSAGE_PAGE = 50


def _are_friends(user_a, user_b):
    if not user_a or not user_b or user_a.id == user_b.id:
        return False
    return Friend.objects.filter(status=Friend.ACCEPTED).filter(
        (Q(user=user_a) & Q(friend=user_b)) | (Q(user=user_b) & Q(friend=user_a))
    ).exists()


def _find_existing_dm(user_a, user_b):
    """Return the active DM room between two users, or None."""
    return (
        ChatRoom.objects
        .filter(room_type=ChatRoom.ROOM_DM, is_active=True,
                members__user=user_a)
        .filter(members__user=user_b)
        .first()
    )


def _user_membership(room, user):
    return ChatRoomMember.objects.filter(room=room, user=user).first()


class ChatListCreateView(APIView):
    """GET → list my DMs with denormalized other_user + last_message + unread_count.
       POST { friend_id } → create-or-get DM with a friend (friend-gated, deduped)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        me = request.user
        my_memberships = ChatRoomMember.objects.filter(user=me).values_list('room_id', 'last_read_at')
        room_ids = [r for r, _ in my_memberships]
        last_read_by_room = {r: lr for r, lr in my_memberships}
        if not room_ids:
            return Response({"chats": []})

        rooms = list(
            ChatRoom.objects
            .filter(id__in=room_ids, is_active=True, room_type=ChatRoom.ROOM_DM)
            .order_by('-created_at')
        )

        # Resolve the "other user" per room in a single query.
        other_user_by_room = {}
        member_rows = (
            ChatRoomMember.objects
            .filter(room_id__in=room_ids)
            .exclude(user=me)
            .select_related('user')
        )
        for mr in member_rows:
            other_user_by_room[mr.room_id] = mr.user

        # Filter out rooms whose only-other peer (DM) is blocked in either direction.
        blocked_ids = _blocked_user_ids(me)
        if blocked_ids:
            keep_room_ids = {
                rid for rid, other in other_user_by_room.items()
                if other.id not in blocked_ids
            }
            room_ids = [r for r in room_ids if r in keep_room_ids]
            rooms = [r for r in rooms if r.id in keep_room_ids]
            other_user_by_room = {
                rid: u for rid, u in other_user_by_room.items() if rid in keep_room_ids
            }
            if not room_ids:
                return Response({"chats": []})

        # Last message per room (one extra query; small N).
        last_message_by_room = {}
        for room_id in room_ids:
            msg = (
                Message.objects
                .filter(room_id=room_id)
                .order_by('-created_at')
                .first()
            )
            if msg:
                last_message_by_room[room_id] = msg

        # Unread per room: messages newer than my last_read_at and not from me.
        unread_by_room = {}
        for room_id in room_ids:
            lr = last_read_by_room.get(room_id)
            qs = Message.objects.filter(room_id=room_id).exclude(sender=me).filter(is_removed=False)
            if lr:
                qs = qs.filter(created_at__gt=lr)
            unread_by_room[room_id] = qs.count()

        # Sort: unread desc, then last_message.created_at desc, then room.created_at desc.
        def sort_key(r):
            unread = unread_by_room.get(r.id, 0)
            lm = last_message_by_room.get(r.id)
            ts = lm.created_at if lm else r.created_at
            return (1 if unread > 0 else 0, ts)
        rooms.sort(key=sort_key, reverse=True)

        ctx = {
            'request': request,
            'other_user_by_room': other_user_by_room,
            'last_message_by_room': last_message_by_room,
            'unread_by_room': unread_by_room,
        }
        data = ChatRoomListSerializer(rooms, many=True, context=ctx).data
        return Response({"chats": data})

    def post(self, request):
        me = request.user
        friend_id = request.data.get('friend_id')
        if not friend_id:
            return Response({"detail": "friend_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            other = User.objects.get(pk=friend_id)
        except User.DoesNotExist:
            return Response({"detail": "user not found"}, status=status.HTTP_404_NOT_FOUND)
        if other.id == me.id:
            return Response({"detail": "cannot DM yourself"}, status=status.HTTP_400_BAD_REQUEST)
        if not _are_friends(me, other):
            return Response({"detail": "not_friends"}, status=status.HTTP_403_FORBIDDEN)
        if _is_blocked_between(me, other):
            return Response({"detail": "blocked"}, status=status.HTTP_403_FORBIDDEN)

        existing = _find_existing_dm(me, other)
        if existing:
            return Response({"id": existing.id, "created": False}, status=status.HTTP_200_OK)

        from django.db import transaction
        with transaction.atomic():
            room = ChatRoom.objects.create(
                room_type=ChatRoom.ROOM_DM,
                created_by=me,
            )
            ChatRoomMember.objects.create(room=room, user=me)
            ChatRoomMember.objects.create(room=room, user=other)

        return Response({"id": room.id, "created": True}, status=status.HTTP_201_CREATED)


class ChatDetailView(APIView):
    """GET → room detail + last 50 messages (descending; client reverses for ascending render)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        me = request.user
        try:
            room = (
                ChatRoom.objects
                .prefetch_related('members__user')
                .get(pk=pk, is_active=True)
            )
        except ChatRoom.DoesNotExist:
            return Response({"detail": "room not found"}, status=status.HTTP_404_NOT_FOUND)

        if not _user_membership(room, me):
            return Response({"detail": "not a member"}, status=status.HTTP_403_FORBIDDEN)

        msgs = list(
            Message.objects
            .filter(room=room)
            .select_related('sender')
            .order_by('-created_at')[:INITIAL_MESSAGE_PAGE]
        )
        ctx = {'request': request, 'initial_messages': msgs}
        return Response(ChatRoomDetailSerializer(room, context=ctx).data)


class MessageListCreateView(APIView):
    """GET ?before=<msg_id>&limit=50 → older messages, descending.
       POST { content } → send a message (text only, ≤2000 chars trimmed)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        me = request.user
        try:
            room = ChatRoom.objects.get(pk=pk, is_active=True)
        except ChatRoom.DoesNotExist:
            return Response({"detail": "room not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _user_membership(room, me):
            return Response({"detail": "not a member"}, status=status.HTTP_403_FORBIDDEN)

        try:
            limit = min(int(request.query_params.get('limit', OLDER_MESSAGE_PAGE)), 100)
        except ValueError:
            limit = OLDER_MESSAGE_PAGE
        before = request.query_params.get('before')

        qs = Message.objects.filter(room=room).select_related('sender').order_by('-created_at')
        if before:
            try:
                anchor = Message.objects.get(pk=before, room=room)
                qs = qs.filter(created_at__lt=anchor.created_at)
            except Message.DoesNotExist:
                return Response({"detail": "anchor not found"}, status=status.HTTP_400_BAD_REQUEST)

        msgs = list(qs[:limit])
        data = MessageSerializer(msgs, many=True, context={'request': request}).data
        return Response({"messages": data})

    def post(self, request, pk):
        me = request.user
        try:
            room = ChatRoom.objects.get(pk=pk, is_active=True)
        except ChatRoom.DoesNotExist:
            return Response({"detail": "room not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _user_membership(room, me):
            return Response({"detail": "not a member"}, status=status.HTTP_403_FORBIDDEN)

        # FunctionRestriction: chat_messaging / both → 403 with payload.
        restriction = _active_restriction(me, 'chat_messaging')
        if restriction:
            return Response(_restriction_403_payload(restriction), status=status.HTTP_403_FORBIDDEN)

        # UserBlock: if either direction blocks any other member, refuse to send.
        # For DMs this is just the single peer; the loop is forward-compatible
        # with groups landing later.
        other_member_ids = list(
            ChatRoomMember.objects.filter(room=room).exclude(user=me).values_list('user_id', flat=True)
        )
        if other_member_ids:
            blocked = UserBlock.objects.filter(
                Q(blocker=me, blocked_id__in=other_member_ids)
                | Q(blocked=me, blocker_id__in=other_member_ids)
            ).exists()
            if blocked:
                return Response({'detail': 'blocked'}, status=status.HTTP_403_FORBIDDEN)

        content = (request.data.get('content') or '').strip()
        if not content:
            return Response({"detail": "content required"}, status=status.HTTP_400_BAD_REQUEST)
        if len(content) > MESSAGE_MAX_LEN:
            return Response(
                {"detail": f"content exceeds {MESSAGE_MAX_LEN} chars"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # IG-style snap-reply: optional FK that the recipient sees as a
        # thumbnail card above the bubble. We accept the snap_id if the caller
        # can actually view the snap — re-uses the same authorization the
        # SnapViewView already enforces (uploader / all_friends-via-friendship
        # / explicit audience). Invalid/forbidden snaps silently drop the
        # reference rather than 400ing the send.
        replied_snap = None
        snap_id_raw = request.data.get('replied_snap_id')
        if snap_id_raw not in (None, '', 'null'):
            try:
                snap_id = int(snap_id_raw)
            except (TypeError, ValueError):
                snap_id = None
            if snap_id:
                try:
                    candidate = Snap.objects.select_related('uploader').get(pk=snap_id)
                except Snap.DoesNotExist:
                    candidate = None
                if candidate:
                    is_uploader = candidate.uploader_id == me.id
                    in_audience = SnapAudience.objects.filter(snap=candidate, viewer=me).exists()
                    is_friend_all = (
                        candidate.visibility == Snap.VIS_ALL_FRIENDS
                        and candidate.uploader_id in _friend_user_ids(me)
                    )
                    if is_uploader or in_audience or is_friend_all:
                        replied_snap = candidate

        msg = Message.objects.create(
            room=room, sender=me, content=content, replied_snap=replied_snap,
        )
        return Response(
            MessageSerializer(msg, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class MessageDeleteView(APIView):
    """DELETE /api/chats/<pk>/messages/<msg_id>/ — soft-delete own message.
       Content stays in DB (future moderation); `is_removed=True` flips the
       serializer to return empty content."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk, msg_id):
        me = request.user
        try:
            msg = Message.objects.select_related('room').get(pk=msg_id, room_id=pk)
        except Message.DoesNotExist:
            return Response({"detail": "message not found"}, status=status.HTTP_404_NOT_FOUND)
        if msg.sender_id != me.id:
            return Response({"detail": "not your message"}, status=status.HTTP_403_FORBIDDEN)
        if msg.is_removed:
            return Response(status=status.HTTP_204_NO_CONTENT)
        msg.is_removed = True
        msg.removed_at = timezone.now()
        msg.save(update_fields=['is_removed', 'removed_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChatReadView(APIView):
    """POST /api/chats/<pk>/read/ — bump my last_read_at to now."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        me = request.user
        try:
            room = ChatRoom.objects.get(pk=pk, is_active=True)
        except ChatRoom.DoesNotExist:
            return Response({"detail": "room not found"}, status=status.HTTP_404_NOT_FOUND)
        membership = _user_membership(room, me)
        if not membership:
            return Response({"detail": "not a member"}, status=status.HTTP_403_FORBIDDEN)
        membership.last_read_at = timezone.now()
        membership.save(update_fields=['last_read_at'])
        return Response({"ok": True})


class UnreadCountView(APIView):
    """GET /api/chats/unread/ — total unread messages across all my DM rooms.
       Used by App.jsx's 30s global poll to drive nav badges."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        me = request.user
        memberships = ChatRoomMember.objects.filter(user=me).values_list('room_id', 'last_read_at')
        total = 0
        for room_id, lr in memberships:
            qs = Message.objects.filter(room_id=room_id, is_removed=False).exclude(sender=me)
            if lr:
                qs = qs.filter(created_at__gt=lr)
            total += qs.count()
        return Response({"total": total})


# ---------------------------------------------------------------------------
# Moderation: Report, Appeal, UserBlock, FunctionRestriction
# ---------------------------------------------------------------------------
from .models import (
    Report, AiReport, Appeal, FunctionRestriction, UserBlock,
)
from .serializers import (
    ReportSerializer, ReportCreateSerializer,
    AppealCreateSerializer, AppealSerializer,
    UserBlockSerializer, FunctionRestrictionSerializer,
)


def _active_restriction(user, kind):
    """Return the first active restriction blocking `kind` for `user`, else None.
    `kind` is 'snap_posting' or 'chat_messaging'. A 'both' restriction blocks
    either kind. Restrictions auto-deactivate when expires_at < now (the cron
    is the canonical lifter, but we treat expired rows as inactive here too)."""
    now = timezone.now()
    qs = FunctionRestriction.objects.filter(
        user=user,
        is_active=True,
        restriction_type__in=[kind, FunctionRestriction.TYPE_BOTH],
    ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
    return qs.order_by('-created_at').first()


def _restriction_403_payload(restriction):
    return {
        'detail': 'restricted',
        'restriction_type': restriction.restriction_type,
        'expires_at': restriction.expires_at.isoformat() if restriction.expires_at else None,
        'offense_count': restriction.offense_count,
    }


def _is_blocked_between(user_a, user_b):
    """True iff either direction of UserBlock exists between two users."""
    return UserBlock.objects.filter(
        Q(blocker=user_a, blocked=user_b) | Q(blocker=user_b, blocked=user_a)
    ).exists()


def _blocked_user_ids(me):
    """All user_ids that have a block in either direction with `me`. Used to
    filter SnapFeedView so blocked uploaders disappear and `me` doesn't
    appear in their feed either."""
    rows = UserBlock.objects.filter(Q(blocker=me) | Q(blocked=me)).values_list(
        'blocker_id', 'blocked_id'
    )
    ids = set()
    for blocker_id, blocked_id in rows:
        ids.add(blocker_id if blocker_id != me.id else blocked_id)
    return ids


class ReportCreateView(APIView):
    """POST /api/reports/ — user files a report.
       Body: { content_type, snap?, chat_message?, template_reasons[], free_text }"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        me = request.user
        ser = ReportCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        ct = data['content_type']

        # Resolve the reported user from the target content, and reject self-reports.
        if ct == Report.CONTENT_SNAP:
            target = data['snap']
            reported_user = target.uploader
        else:
            target = data['chat_message']
            reported_user = target.sender
        if reported_user.id == me.id:
            return Response({'detail': 'cannot_report_self'}, status=status.HTTP_400_BAD_REQUEST)

        # Dedup: same reporter on the same content with an in-flight report.
        in_flight_statuses = [
            Report.STATUS_PENDING, Report.STATUS_AI_REPORTED,
            Report.STATUS_APPEAL_PENDING, Report.STATUS_APPEAL_ANALYZED,
            Report.STATUS_THIRD_LOOP,
        ]
        dedup_q = Report.objects.filter(reporter=me, content_type=ct, status__in=in_flight_statuses)
        if ct == Report.CONTENT_SNAP:
            dedup_q = dedup_q.filter(snap=target)
        else:
            dedup_q = dedup_q.filter(chat_message=target)
        existing = dedup_q.first()
        if existing:
            return Response(
                {'detail': 'duplicate', 'report_id': existing.id},
                status=status.HTTP_409_CONFLICT,
            )

        report = Report.objects.create(
            reporter=me,
            reported_user=reported_user,
            content_type=ct,
            snap=target if ct == Report.CONTENT_SNAP else None,
            chat_message=target if ct == Report.CONTENT_CHAT else None,
            template_reasons=data.get('template_reasons', []),
            free_text=(data.get('free_text') or '').strip(),
        )
        return Response(
            ReportSerializer(report, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class ReportMyListView(APIView):
    """GET /api/reports/my/ — reports I filed, with all AI reports + appeal status."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = (
            Report.objects.filter(reporter=request.user)
            .prefetch_related('ai_reports', 'appeal')
        )
        data = ReportSerializer(qs, many=True, context={'request': request}).data
        return Response({'reports': data})


class ReportReceivedListView(APIView):
    """GET /api/reports/received/ — reports filed against me; the reported user's
    view, used by the notification center to surface appeal buttons."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = (
            Report.objects.filter(reported_user=request.user)
            .prefetch_related('ai_reports', 'appeal')
        )
        data = ReportSerializer(qs, many=True, context={'request': request}).data
        return Response({'reports': data})


class AppealCreateView(APIView):
    """POST /api/appeals/ — the reported user contests an AI report. Allowed
    only while `status='ai_reported'` and `now < appeal_deadline`."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ser = AppealCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        report = ser.validated_data['report']
        reason = ser.validated_data['reason']
        me = request.user

        if report.reported_user_id != me.id:
            return Response({'detail': 'not_your_report'}, status=status.HTTP_403_FORBIDDEN)
        if report.status != Report.STATUS_AI_REPORTED:
            return Response({'detail': 'appeal_not_allowed'}, status=status.HTTP_400_BAD_REQUEST)
        if not report.appeal_deadline or timezone.now() >= report.appeal_deadline:
            return Response({'detail': 'appeal_window_closed'}, status=status.HTTP_400_BAD_REQUEST)
        if Appeal.objects.filter(report=report).exists():
            return Response({'detail': 'already_appealed'}, status=status.HTTP_409_CONFLICT)

        with transaction.atomic():
            appeal = Appeal.objects.create(report=report, reported_user=me, reason=reason)
            report.status = Report.STATUS_APPEAL_PENDING
            report.save(update_fields=['status', 'updated_at'])

        return Response(AppealSerializer(appeal).data, status=status.HTTP_201_CREATED)


class AppealMyListView(APIView):
    """GET /api/appeals/my/ — appeals I have filed."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Appeal.objects.filter(reported_user=request.user).select_related('report')
        return Response({'appeals': AppealSerializer(qs, many=True).data})


class BlockListView(APIView):
    """GET /api/blocks/ — the users I have blocked (one row per outbound block;
    appeal_upheld() creates rows in both directions and they all surface here)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = UserBlock.objects.filter(blocker=request.user).select_related('blocked')
        return Response({'blocks': UserBlockSerializer(qs, many=True).data})


class BlockDeleteView(APIView):
    """DELETE /api/blocks/<id>/ — manual unblock. `reason='appeal_auto'` rows
    can also be lifted manually; the partner row (other direction) stays unless
    they unblock too. Symmetric appeal-block lift is a manual choice per user."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        try:
            block = UserBlock.objects.get(pk=pk, blocker=request.user)
        except UserBlock.DoesNotExist:
            return Response({'detail': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        block.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyRestrictionsView(APIView):
    """GET /api/restrictions/my/ — my active restrictions. Used by the frontend
    to pre-disable snap capture / chat input without waiting for the 403."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        qs = FunctionRestriction.objects.filter(
            user=request.user, is_active=True
        ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).order_by('-created_at')
        return Response({'restrictions': FunctionRestrictionSerializer(qs, many=True).data})


# --- Admin / cron endpoints ---------------------------------------------------

class AdminReportListView(APIView):
    """GET /api/admin/reports/ — staff-only list of all reports."""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        qs = Report.objects.all().prefetch_related('ai_reports', 'appeal')
        data = ReportSerializer(qs, many=True, context={'request': request}).data
        return Response({'reports': data})


class AdminReportActView(APIView):
    """POST /api/admin/reports/<id>/act/ — staff override. Body: { action }.
       action: 'remove' soft-deletes the content + restricts the reported user
               (using the same offense ladder as the AI pipeline);
               'dismiss' marks the report as admin_dismissed with no effects."""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        try:
            report = Report.objects.get(pk=pk)
        except Report.DoesNotExist:
            return Response({'detail': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        action = (request.data.get('action') or '').strip().lower()
        if action not in ('remove', 'dismiss'):
            return Response({'detail': 'action must be remove|dismiss'}, status=status.HTTP_400_BAD_REQUEST)

        # Reuse the cron pipeline's helpers so admin actions and AI outcomes share
        # logic: soft-delete + restriction + emails.
        from .moderation_pipeline import admin_remove, admin_dismiss
        if action == 'remove':
            admin_remove(report)
        else:
            admin_dismiss(report)
        report.refresh_from_db()
        return Response(ReportSerializer(report, context={'request': request}).data)


class AdminRunModerationView(APIView):
    """POST /api/admin/run-moderation/ — Cloud Scheduler trigger.
       Authenticates via the `X-Moderation-Secret` header against
       settings.MODERATION_RUN_SECRET. The endpoint runs the same code as the
       `run_moderation` management command so it can be invoked either way."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        expected = getattr(settings, 'MODERATION_RUN_SECRET', None)
        if not expected:
            return Response({'detail': 'moderation_disabled'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        got = request.headers.get('X-Moderation-Secret') or ''
        if got != expected:
            return Response({'detail': 'forbidden'}, status=status.HTTP_403_FORBIDDEN)

        from .moderation_pipeline import run_moderation_tick
        summary = run_moderation_tick()
        return Response(summary)


# ---------------------------------------------------------------------------
# Notification preferences + Snap groups
# Read by /api/notifications/ (gating) and SnapUploadView (group expansion).
# ---------------------------------------------------------------------------
from .models import NotificationPreference, SnapGroup, SnapGroupMember
from .serializers import (
    NotificationPreferenceSerializer, SnapGroupSerializer,
)


class NotificationPreferenceView(APIView):
    """GET / PATCH /api/notifications/preferences/.
       Auto-creates the row with defaults on first read."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return Response(NotificationPreferenceSerializer(prefs).data)

    def patch(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(user=request.user)
        ser = NotificationPreferenceSerializer(prefs, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class SnapGroupListCreateView(APIView):
    """GET /api/snap-groups/ — caller's groups (with members).
       POST {name, member_ids[]} — friend-gated, dedups members."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        groups = (
            SnapGroup.objects.filter(owner=request.user)
            .prefetch_related('members__user')
        )
        return Response({"groups": SnapGroupSerializer(groups, many=True).data})

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({"error": "Group name is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(name) > 50:
            return Response({"error": "Group name must be ≤ 50 chars."}, status=status.HTTP_400_BAD_REQUEST)

        raw_ids = request.data.get('member_ids') or []
        if hasattr(request.data, 'getlist') and not raw_ids:
            raw_ids = request.data.getlist('member_ids')
        try:
            member_ids = list({int(x) for x in raw_ids if str(x).strip()})
        except (TypeError, ValueError):
            return Response({"error": "member_ids must be integers."}, status=status.HTTP_400_BAD_REQUEST)

        # Friend-gate every member up-front so a malformed payload can't seed
        # the group with strangers.
        if member_ids:
            my_friends = _friend_user_ids(request.user)
            stranger_ids = [uid for uid in member_ids if uid not in my_friends]
            if stranger_ids:
                return Response(
                    {"error": "Members must be your friends.", "stranger_ids": stranger_ids},
                    status=status.HTTP_403_FORBIDDEN,
                )

        with transaction.atomic():
            group = SnapGroup.objects.create(owner=request.user, name=name)
            if member_ids:
                SnapGroupMember.objects.bulk_create([
                    SnapGroupMember(group=group, user_id=uid) for uid in member_ids
                ])
        group = SnapGroup.objects.prefetch_related('members__user').get(pk=group.pk)
        return Response(SnapGroupSerializer(group).data, status=status.HTTP_201_CREATED)


class SnapGroupDetailView(APIView):
    """GET / PATCH / DELETE /api/snap-groups/<id>/.
       PATCH currently only renames. Membership lives on its own endpoint."""
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, request, pk):
        try:
            return SnapGroup.objects.prefetch_related('members__user').get(pk=pk, owner=request.user)
        except SnapGroup.DoesNotExist:
            return None

    def get(self, request, pk):
        group = self._get(request, pk)
        if not group:
            return Response({"error": "Group not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(SnapGroupSerializer(group).data)

    def patch(self, request, pk):
        group = self._get(request, pk)
        if not group:
            return Response({"error": "Group not found."}, status=status.HTTP_404_NOT_FOUND)
        name = request.data.get('name')
        if name is None:
            return Response({"error": "Nothing to update."}, status=status.HTTP_400_BAD_REQUEST)
        name = name.strip()
        if not name:
            return Response({"error": "Group name is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(name) > 50:
            return Response({"error": "Group name must be ≤ 50 chars."}, status=status.HTTP_400_BAD_REQUEST)
        group.name = name
        group.save(update_fields=['name', 'updated_at'])
        return Response(SnapGroupSerializer(group).data)

    def delete(self, request, pk):
        group = self._get(request, pk)
        if not group:
            return Response({"error": "Group not found."}, status=status.HTTP_404_NOT_FOUND)
        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SnapGroupMemberAddView(APIView):
    """POST /api/snap-groups/<id>/members/ — body {user_id}.
       Idempotent: re-adding an existing member is a no-op."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            group = SnapGroup.objects.get(pk=pk, owner=request.user)
        except SnapGroup.DoesNotExist:
            return Response({"error": "Group not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            user_id = int(request.data.get('user_id'))
        except (TypeError, ValueError):
            return Response({"error": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if user_id not in _friend_user_ids(request.user):
            return Response({"error": "Member must be a friend."}, status=status.HTTP_403_FORBIDDEN)
        SnapGroupMember.objects.get_or_create(group=group, user_id=user_id)
        # Touch updated_at so the group sorts to the top of the list.
        group.save(update_fields=['updated_at'])
        group = SnapGroup.objects.prefetch_related('members__user').get(pk=group.pk)
        return Response(SnapGroupSerializer(group).data, status=status.HTTP_200_OK)


class SnapGroupMemberRemoveView(APIView):
    """DELETE /api/snap-groups/<id>/members/<user_id>/."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk, user_id):
        try:
            group = SnapGroup.objects.get(pk=pk, owner=request.user)
        except SnapGroup.DoesNotExist:
            return Response({"error": "Group not found."}, status=status.HTTP_404_NOT_FOUND)
        SnapGroupMember.objects.filter(group=group, user_id=user_id).delete()
        group.save(update_fields=['updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)
