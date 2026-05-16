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
    FriendRequestSerializer, UserSerializer, SnapSerializer
)
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import Course, Week, Exam, Assignment, Friend, Snap, SnapAudience
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
                
        return models.Friend.objects.filter(id__in=unique_friendship_ids)

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
        if visibility not in (Snap.VIS_ALL_FRIENDS, Snap.VIS_SELECTED):
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
                if visibility == Snap.VIS_SELECTED:
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

        qs = Snap.objects.filter(is_removed=False, expires_at__gt=now).filter(
            Q(uploader=me)
            | (Q(visibility=Snap.VIS_ALL_FRIENDS) & Q(uploader_id__in=friend_ids))
            | (Q(visibility=Snap.VIS_SELECTED) & Q(id__in=selected_snap_ids))
        ).select_related("uploader", "course").order_by("course_id", "-created_at")

        snaps = list(qs)
        viewed_ids = set(
            SnapAudience.objects.filter(
                viewer=me, has_viewed=True, snap_id__in=[s.id for s in snaps]
            ).values_list("snap_id", flat=True)
        )

        ctx = {"request": request, "viewed_snap_ids": viewed_ids}
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

        # Authorization: uploader, allowlisted (selected), or a current friend (all_friends).
        if snap.uploader_id != me.id:
            allowed = False
            if snap.visibility == Snap.VIS_ALL_FRIENDS:
                allowed = snap.uploader_id in _friend_user_ids(me)
            else:
                allowed = SnapAudience.objects.filter(snap=snap, viewer=me).exists()
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
