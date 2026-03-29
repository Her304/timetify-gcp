from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status, generics, permissions, serializers
from . import models
from datetime import date
from django.utils import timezone
from django.db.models import Q
from .serializers import (
    RegisterSerializer, CourseSerializer, WeekSerializer, 
    ExamSerializer, AssignmentSerializer, FriendSerializer, 
    FriendRequestSerializer, UserSerializer
)
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import Course, Week, Exam, Assignment, Friend
from datetime import datetime, timedelta
from django.contrib.auth import get_user_model
from main.utils import send_email
import secrets, string

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
    friendships = models.Friend.objects.filter(status=1).filter(Q(user=user) | Q(friend=user))
    
    for fship in friendships:
        friend = fship.friend if fship.user == user else fship.user
        friend_name = friend.username
        friend_schedule = {day: [] for day in ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]}
        friend_classes = models.Course.objects.filter(
            user=friend,
            start_date__lte=today,
            end_date__gte=today
        ).order_by("start_time")
        
        for f_cls in friend_classes:
            is_shared_with_me = models.Course.objects.filter(
                course_id=f_cls.course_id,
                classroom=f_cls.classroom,
                start_time=f_cls.start_time,
                user=user
            ).exists()
            
            display_name = friend_name
            if is_shared_with_me:
                display_name = f"{friend_name} & Me"
                days_list = f_cls.rep_date.split(',')
                for raw_day in days_list:
                    normalized_day = raw_day.strip().upper()[:3]
                    shared_classes.add((normalized_day, f_cls.course_id, f_cls.classroom, f_cls.start_time.strftime("%H:%M")))
            
            days_list = f_cls.rep_date.split(',')
            for raw_day in days_list:
                normalized_day = raw_day.strip().upper()[:3]
                if normalized_day in friend_schedule:
                    friend_schedule[normalized_day].append({
                        "course_id": f_cls.course_id,
                        "course_name": f_cls.course_name,
                        "classroom": f_cls.classroom,
                        "start_time": f_cls.start_time.strftime("%H:%M"),
                        "end_time": f_cls.end_time.strftime("%H:%M"),
                        "is_lab": f_cls.is_lab,
                        "parent_course_id": f_cls.parent_course.course_id if f_cls.parent_course else None
                    })
        
        if friend_classes.exists():
            all_schedules[display_name] = friend_schedule
    
    combined_schedule = {day: [] for day in ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]}
    
    for day, classes in all_schedules["Me"].items():
        for cls in classes:
            class_key = (day, cls["course_id"], cls["classroom"], cls["start_time"])
            if class_key not in shared_classes:
                combined_schedule[day].append({
                    "owner": "Me",
                    **cls
                })
    
    for owner, schedule in all_schedules.items():
        if owner != "Me":
            for day, classes in schedule.items():
                for cls in classes:
                    combined_schedule[day].append({
                        "owner": owner,
                        **cls
                    })
    
    for day in combined_schedule:
        combined_schedule[day].sort(key=lambda x: x["start_time"])
        
    return Response(combined_schedule)


@api_view(['GET', 'PATCH'])
def get_user(request):
    if not request.user.is_authenticated:
        return Response({'user': None})
    
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
    serializer_class = CustomTokenObtainPairSerializer

class ForgotPasswordView(APIView):
    def post(self, request):
        email = request.data.get('email')
        user = User.objects.filter(email=email).first()
        if user:
            alphabet = string.ascii_letters + string.digits
            temp_pass = ''.join(secrets.choice(alphabet) for _ in range(10))
            user.set_password(temp_pass)
            user.is_temp_password = True
            user.save()
            from main.utils import send_email
            send_email(user.email, "Temporary Password", f"Your temporary password is: {temp_pass}\n\nPlease login and reset your password.")
            return Response({'message': 'Temporary password sent'})
        return Response({'error': 'Email not found'}, status=404)

class ResetPasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        new_password = request.data.get('new_password')
        user = request.user
        if user.is_temp_password:
            user.set_password(new_password)
            user.is_temp_password = False
            user.save()
            return Response({'message': 'Password reset successful'})
        return Response({'error': 'Not authorized'}, status=400)

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
                print("AI Response:", result)
                
                for course_data in result.get('courses', []):
                    start_date = convert_date(course_data.get('start_date'))
                    end_date = convert_date(course_data.get('end_date'))
                    
                    if not start_date or not end_date:
                        print(f"Skipping course {course_data.get('course_id')} - invalid dates")
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
                        print(f"Updated main course: {course.course_id}")
                        
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
                        print(f"Created secondary course: {course_data['course_id']}")
                                
            except Exception as e:
                print(f"Error parsing PDF: {e}")
            finally:
                # Delete the uploaded file after processing
                if course.course_outline:
                    try:
                        course.course_outline.delete(save=False)
                        course.course_outline = None
                        course.save()
                        print(f"Deleted course outline file for {course.course_id}")
                    except Exception as delete_error:
                        print(f"Error deleting file: {delete_error}")


class CourseAnalyzeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if 'course_outline' not in request.FILES:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)
        
        file_obj = request.FILES['course_outline']
        # Create a temporary file to process
        temp_path = os.path.join(settings.MEDIA_ROOT, 'temp_' + file_obj.name)
        with open(temp_path, 'wb+') as destination:
            for chunk in file_obj.chunks():
                destination.write(chunk)
        
        try:
            result = process_course_outline(temp_path)
            return Response(result)
        except Exception as e:
            print(f"Error analyzing course: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

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
        except Exception as e:
            print(f"Error finalizing course: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
            
            return User.objects.filter(
                Q(username__icontains=query) | Q(email__icontains=query)
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