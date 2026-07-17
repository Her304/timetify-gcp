import json
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
    FriendRequestSerializer, UserSerializer, PublicUserSerializer, SnapSerializer,
    MessageSerializer, ChatRoomListSerializer, ChatRoomDetailSerializer,
    EventSerializer, EventInviteSerializer, EventCreateSerializer,
    PasswordResetConfirmSerializer,
    BlogPostListSerializer, BlogPostDetailSerializer,
)
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import Course, Week, Exam, Assignment, Friend, Snap, SnapAudience, ChatRoom, ChatRoomMember, Message, SnapGroup, SnapGroupMember, ReparseLog, ExternalCalendarEvent, UserBlock, Event, EventInvite, CourseSkip, EventOccurrenceSkip, BlogPost
from datetime import datetime, timedelta, time as dt_time
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.shortcuts import render
from main.utils import send_email
from main.account_email import send_welcome_email, send_password_reset_email, send_email_change_verification

# Salt + lifetime for the signed email-change token. The token itself carries
# {uid, email}, so no DB token row is needed — signing.loads() with this salt
# and max_age both authenticates and expires the link.
EMAIL_CHANGE_SALT = "email-change"
EMAIL_CHANGE_MAX_AGE = 60 * 60 * 24  # 24 hours

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

    # Honor UserBlock on the dashboard: a blocked friend's schedule must not
    # leak through here even though the underlying friendship still exists.
    blocked_ids = _blocked_user_ids(user)

    my_class_tuples = set(my_classes.values_list('course_id', 'classroom', 'start_time'))

    for fship in friendships:
        friend = fship.friend if fship.user == user else fship.user
        if friend.id in blocked_ids:
            continue
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
            send_welcome_email(user)
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


class RegistrationAvailabilityView(APIView):
    """Pre-flight check for sign-up step 1: reports whether a username / email is
    already taken so the client can catch it on 'next' instead of after the whole
    flow. Matched case-insensitively to mirror how login resolves usernames
    (username__iexact) and normal email semantics. Never authoritative — the
    RegisterView serializer still enforces uniqueness on final submit."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        errors = {}
        username = (request.data.get('username') or '').strip()
        email = (request.data.get('email') or '').strip()
        if username and User.objects.filter(username__iexact=username).exists():
            errors['username'] = ["that username is already taken."]
        if email and User.objects.filter(email__iexact=email).exists():
            errors['email'] = ["an account with this email already exists."]
        return Response(errors)


def _user_from_uidb64(uidb64):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        return User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None


class PasswordResetRequestView(APIView):
    """Kicks off the SPA password-reset flow: emails a link to the React
    confirm page (build_password_reset_link) instead of a Django view, so the
    backend's Cloud Run hostname never shows up in the browser."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip()
        user = User.objects.filter(email=email).first()
        if not user:
            return Response(
                {'email': ["There is no user registered with this email address."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        send_password_reset_email(user)
        return Response({'detail': 'Password reset email sent.'})


class PasswordResetConfirmView(APIView):
    """GET checks link validity up front so the React page can show an
    'expired link' state before rendering the password form; POST performs
    the actual reset and re-validates the token regardless."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, uidb64, token):
        user = _user_from_uidb64(uidb64)
        valid = bool(user and default_token_generator.check_token(user, token))
        return Response({'valid': valid})

    def post(self, request, uidb64, token):
        user = _user_from_uidb64(uidb64)
        if not user or not default_token_generator.check_token(user, token):
            return Response({'detail': 'This reset link is invalid or has expired.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data['new_password1'])
        user.save()
        return Response({'detail': 'Password reset successfully.'})


class ChangeEmailRequestView(APIView):
    """Start an email change: validate the new address and email a signed
    confirmation link to it. The account's live email is left untouched — it's
    only swapped once the user clicks through VerifyEmailChangeView, proving they
    control the new inbox. Per product decision, no password re-auth is required;
    control of the new mailbox is the gate."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        new_email = (request.data.get('email') or '').strip()

        if not new_email:
            return Response({'email': ["email can't be blank."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_email(new_email)
        except DjangoValidationError:
            return Response({'email': ["enter a valid email address."]}, status=status.HTTP_400_BAD_REQUEST)
        if new_email.lower() == (user.email or '').lower():
            return Response({'email': ["that's already your email."]}, status=status.HTTP_400_BAD_REQUEST)
        # Case-insensitive uniqueness against confirmed emails, excluding self.
        if User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
            return Response({'email': ["an account with this email already exists."]}, status=status.HTTP_400_BAD_REQUEST)

        # Stage the pending value (drives the "pending confirmation" UI hint) and
        # mint a token that carries the address itself, so a stale/tampered link
        # can't retarget the change.
        user.pending_email = new_email
        user.save(update_fields=['pending_email'])

        token = signing.dumps({'uid': user.id, 'email': new_email}, salt=EMAIL_CHANGE_SALT)
        if settings.DEBUG:
            scheme = 'https' if request.is_secure() else 'http'
            domain = request.get_host()
        else:
            # Match CustomPasswordResetForm: never leak the Cloud Run hostname.
            scheme = 'https'
            domain = settings.CANONICAL_DOMAIN
        verify_url = f"{scheme}://{domain}/verify-email/{token}/"

        send_email_change_verification(user, new_email, verify_url)
        return Response({'message': 'verification link sent', 'pending_email': new_email})


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def verify_email_change(request, token):
    """Server-rendered landing for the emailed confirmation link. No session
    required — the signed token carries identity — because the user often opens
    the link on a different device. Applies pending_email -> email on success."""
    ctx = {'frontend_url': settings.FRONTEND_URL}
    try:
        data = signing.loads(token, salt=EMAIL_CHANGE_SALT, max_age=EMAIL_CHANGE_MAX_AGE)
    except signing.SignatureExpired:
        ctx['error'] = "This link has expired. Request a new email change from your profile."
        return render(request, 'registration/email_change_result.html', ctx)
    except signing.BadSignature:
        ctx['error'] = "This link is invalid or has already been used."
        return render(request, 'registration/email_change_result.html', ctx)

    user = User.objects.filter(pk=data.get('uid')).first()
    new_email = data.get('email')
    if not user or not new_email:
        ctx['error'] = "This link is invalid or has already been used."
        return render(request, 'registration/email_change_result.html', ctx)

    # Re-check uniqueness at confirm time — someone else may have registered the
    # address in the window between request and click.
    if User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
        user.pending_email = None
        user.save(update_fields=['pending_email'])
        ctx['error'] = "That address is now in use by another account. No change was made."
        return render(request, 'registration/email_change_result.html', ctx)

    user.email = new_email
    user.pending_email = None
    user.save(update_fields=['email', 'pending_email'])
    ctx['new_email'] = new_email
    return render(request, 'registration/email_change_result.html', ctx)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        # Username should not be case sensitive
        username = attrs.get("username")
        if username:
            user = User.objects.filter(username__iexact=username).first()
            if user:
                attrs["username"] = user.username
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user, context={'request': self.context.get('request')}).data
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
                    
                    # `or default` instead of `.get(key, default)` because pdf.py now
                    # returns `None` for fields the syllabus omits (so the model isn't
                    # forced to invent). `.get(key, default)` only fires the fallback
                    # when the KEY is missing, not when its value is None.
                    classroom = course_data.get('classroom') or 'TBD'
                    start_time = course_data.get('start_time') or '09:00'
                    end_time = course_data.get('end_time') or '17:00'
                    rep_date = course_data.get('rep_date') or 'Monday'
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


REPARSE_DAILY_LIMIT = 3
REPARSE_WINDOW = timedelta(hours=24)


def _reparse_count_remaining(user):
    cutoff = timezone.now() - REPARSE_WINDOW
    used = ReparseLog.objects.filter(user=user, created_at__gte=cutoff).count()
    return max(0, REPARSE_DAILY_LIMIT - used)


class CourseAnalyzeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if 'course_outline' not in request.FILES:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        # First analyze is free. "Reparse" (try again from the confirmation page)
        # counts against the daily cap so users can't burn LLM budget infinitely.
        is_reparse = str(request.data.get('is_reparse', '')).lower() in ('true', '1', 'yes')
        if is_reparse:
            remaining = _reparse_count_remaining(request.user)
            if remaining <= 0:
                return Response(
                    {
                        "error": "reparse_limit_reached",
                        "details": f"You've used your {REPARSE_DAILY_LIMIT} AI reparses for today. Try again in 24 hours.",
                        "reparse_remaining": 0,
                    },
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

        # Optional "refine" context: once the student confirms a term start date
        # on the review page, we pass it back so the model can resolve
        # week-relative deadlines into concrete dates. Untrusted input — only the
        # start/end dates are extracted and normalised.
        user_context = None
        raw_context = request.data.get('context')
        if raw_context:
            try:
                parsed_ctx = json.loads(raw_context) if isinstance(raw_context, str) else raw_context
            except (ValueError, TypeError):
                parsed_ctx = None
            if isinstance(parsed_ctx, dict) and parsed_ctx.get('start_date'):
                user_context = {
                    'start_date': convert_date(parsed_ctx.get('start_date')),
                    'end_date': convert_date(parsed_ctx.get('end_date')),
                }

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

            result = process_course_outline(temp_path, user_context=user_context)
            # Only log a reparse AFTER a successful analysis. Failed attempts
            # shouldn't burn the user's daily quota.
            if is_reparse:
                ReparseLog.objects.create(user=request.user)
            result['reparse_remaining'] = _reparse_count_remaining(request.user)
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

def _slot_to_minutes(t):
    if not t:
        return None
    s = str(t).strip()
    try:
        parts = s.split(':')
        return int(parts[0]) * 60 + (int(parts[1]) if len(parts) > 1 else 0)
    except (ValueError, IndexError):
        return None


def _parse_rep_days(rep):
    if not rep:
        return set()
    return {d.strip().capitalize() for d in str(rep).split(',') if d.strip()}


_WEEKDAY_INDEX = {
    'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
    'friday': 4, 'saturday': 5, 'sunday': 6,
}


def _weekly_occurrences(start_str, end_str, weekday, max_count=40):
    """Every date on `weekday` between start and end (inclusive), as ISO strings.

    Used to expand a recurring weekly assignment (e.g. homework due each Sunday)
    into one dated instance per week. Bounded by max_count as a safety cap.
    """
    if not start_str or not end_str or not weekday:
        return []
    idx = _WEEKDAY_INDEX.get(str(weekday).strip().lower())
    if idx is None:
        return []
    try:
        start = datetime.strptime(start_str, '%Y-%m-%d')
        end = datetime.strptime(end_str, '%Y-%m-%d')
    except (ValueError, TypeError):
        return []
    if end < start:
        return []
    cur = start + timedelta(days=(idx - start.weekday()) % 7)
    out = []
    while cur <= end and len(out) < max_count:
        out.append(cur.strftime('%Y-%m-%d'))
        cur += timedelta(days=7)
    return out


def _find_overlap_day(days_a, sa, ea, days_b, sb, eb):
    shared = days_a & days_b
    if shared and sa < eb and sb < ea:
        return sorted(shared)[0]
    return None


class CourseFinalizeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        courses_data = request.data.get('courses', [])
        if not courses_data:
            return Response({"error": "No course data provided"}, status=status.HTTP_400_BAD_REQUEST)

        # Build the slot view from incoming course data, but remember the full
        # `cd` so the overlap response can carry the human-readable fields the
        # frontend's conflict screen renders (course_name, classroom, etc.).
        def _slot_summary(cd, source):
            return {
                'source': source,  # 'incoming' or 'existing'
                'course_id': cd.get('course_id') or '(unnamed)',
                'course_name': cd.get('course_name') or '',
                'classroom': cd.get('classroom') or '',
                'start_time': cd.get('start_time') or '',
                'end_time': cd.get('end_time') or '',
                'rep_date': cd.get('rep_date') or '',
            }

        incoming_slots = []
        for cd in courses_data:
            s = _slot_to_minutes(cd.get('start_time'))
            e = _slot_to_minutes(cd.get('end_time'))
            days = _parse_rep_days(cd.get('rep_date'))
            if s is None or e is None or s >= e or not days:
                continue
            incoming_slots.append({
                'cd': cd, 'days': days, 's': s, 'e': e,
            })

        for i, a in enumerate(incoming_slots):
            for b in incoming_slots[i + 1:]:
                day = _find_overlap_day(a['days'], a['s'], a['e'], b['days'], b['s'], b['e'])
                if day:
                    a_sum = _slot_summary(a['cd'], 'incoming')
                    b_sum = _slot_summary(b['cd'], 'incoming')
                    return Response({
                        'error': 'overlap',
                        'kind': 'incoming_vs_incoming',
                        'detail': f"{a_sum['course_id']} and {b_sum['course_id']} overlap on {day}.",
                        'day': day,
                        'a': a_sum, 'b': b_sum,
                    }, status=status.HTTP_400_BAD_REQUEST)

        for ex in Course.objects.filter(user=request.user):
            ex_s = (ex.start_time.hour * 60 + ex.start_time.minute) if ex.start_time else None
            ex_e = (ex.end_time.hour * 60 + ex.end_time.minute) if ex.end_time else None
            ex_days = _parse_rep_days(ex.rep_date)
            if ex_s is None or ex_e is None or ex_s >= ex_e or not ex_days:
                continue
            for inc in incoming_slots:
                day = _find_overlap_day(inc['days'], inc['s'], inc['e'], ex_days, ex_s, ex_e)
                if day:
                    a_sum = _slot_summary(inc['cd'], 'incoming')
                    b_sum = _slot_summary({
                        'course_id': ex.course_id,
                        'course_name': ex.course_name,
                        'classroom': ex.classroom,
                        'start_time': ex.start_time.strftime('%H:%M') if ex.start_time else '',
                        'end_time': ex.end_time.strftime('%H:%M') if ex.end_time else '',
                        'rep_date': ex.rep_date,
                    }, 'existing')
                    return Response({
                        'error': 'overlap',
                        'kind': 'incoming_vs_existing',
                        'detail': f"{a_sum['course_id']} overlaps with your existing course {b_sum['course_id']} on {day}.",
                        'day': day,
                        'a': a_sum, 'b': b_sum,
                    }, status=status.HTTP_400_BAD_REQUEST)

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
                    course_end_date = convert_date(course_data.get('end_date')) or convert_date(main_course_data.get('end_date'))
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

                    # Create assignments for THIS course. A weekly recurring
                    # assignment (e.g. homework due each Sunday) has no single
                    # due date, so expand it into one instance per week across
                    # the term; everything else stays a single dated assignment.
                    for a_item in course_data.get("assignments", []):
                        topic = a_item.get("assignment_topic", "")
                        detail = a_item.get("assignment_detail", "")
                        is_weekly = str(a_item.get("recurrence") or "").strip().lower() == "weekly"
                        occurrences = []
                        if is_weekly:
                            occurrences = _weekly_occurrences(
                                course_start_date, course_end_date, a_item.get("recurrence_weekday")
                            )
                        if occurrences:
                            for occ in occurrences:
                                Assignment.objects.create(
                                    user=request.user,
                                    course=current_course,
                                    assignment_due=f"{occ}T00:00:00Z",
                                    assignment_topic=topic,
                                    assignment_detail=detail,
                                )
                        else:
                            due_date = convert_date(a_item.get('assignment_due')) or course_start_date
                            if due_date:
                                Assignment.objects.create(
                                    user=request.user,
                                    course=current_course,
                                    assignment_due=f"{due_date}T00:00:00Z",
                                    assignment_topic=topic,
                                    assignment_detail=detail,
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

class WeekDetailView(generics.RetrieveUpdateDestroyAPIView):
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

class ExamDetailView(generics.RetrieveUpdateDestroyAPIView):
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

class AssignmentDetailView(generics.RetrieveUpdateDestroyAPIView):
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


def _friend_users(a, b):
    """Idempotently record an accepted (both-directions) friendship between two
    users. Mirrors the reciprocal-row shape the friend-request accept flow uses."""
    for x, y in ((a, b), (b, a)):
        Friend.objects.update_or_create(
            user=x, friend=y, defaults={'status': Friend.ACCEPTED},
        )


class InviteInfoView(APIView):
    """GET /api/invite/<code>/ — public lookup so the invite landing page can show
    '@user invited you to Timetify!'. Exposes only the inviter's public fields."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, code):
        inviter = User.objects.filter(invite_code=code).first()
        if not inviter:
            return Response({'detail': 'invite not found'}, status=status.HTTP_404_NOT_FOUND)
        data = PublicUserSerializer(inviter, context={'request': request}).data
        # The invite is an explicit share (the person handed over their QR/link),
        # so surfacing university here is fine even though stranger-search hides it.
        data['university'] = inviter.university
        return Response({'inviter': data})


class InviteAcceptView(APIView):
    """POST /api/invite/<code>/accept/ — for an already-logged-in user who opens
    an invite link: friend them with the inviter immediately (idempotent)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, code):
        inviter = User.objects.filter(invite_code=code).first()
        if not inviter:
            return Response({'detail': 'invite not found'}, status=status.HTTP_404_NOT_FOUND)
        if inviter.id == request.user.id:
            return Response({'detail': "that's your own invite link."}, status=status.HTTP_400_BAD_REQUEST)
        _friend_users(inviter, request.user)
        return Response({'message': 'connected', 'inviter_username': inviter.username})


class InviteQRView(APIView):
    """GET /api/invite/qr/ — PNG QR of the caller's personal invite link. Rendered
    server-side (qrcode lib); the client fetches it as a blob and shows it inline."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        import io
        import qrcode
        from django.http import HttpResponse

        code = request.user.get_or_create_invite_code()
        base = settings.FRONTEND_URL.rstrip('/')
        link = f"{base}/invite/{code}"
        img = qrcode.make(link, box_size=10, border=2)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return HttpResponse(buf.getvalue(), content_type='image/png')


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


class FriendDeleteView(APIView):
    """DELETE /api/friends/<pk>/ — unfriend, where `pk` is the OTHER user's id
    (the friends list flattens to user objects, so that's what the client has).
    Friendships are stored as two reciprocal rows, so delete BOTH directions
    (idempotent — returns 204 even if there was no friendship)."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        me = request.user
        models.Friend.objects.filter(
            Q(user=me, friend_id=pk) | Q(user_id=pk, friend=me),
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SearchFriend(generics.ListAPIView):
    # Use the stripped PublicUserSerializer so search results never disclose
    # `email` or `university` for strangers. `read_only=True` on a serializer
    # field only blocks writes — it does NOT exclude the field from the
    # output, which is how the bug existed in the first place.
    serializer_class = PublicUserSerializer
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

            # Search by username only — searching by email substring would
            # leak every user's email address to any authenticated attacker.
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
            # Two flavors of group: a saved SnapGroup (audience preset owned by
            # the caller) OR a chat group (ChatRoom the caller is a member of).
            # Frontend picks one or the other; we accept either field. In both
            # cases the audience is intersected with the caller's current
            # friend set so a stale roster never leaks content to ex-friends.
            from .models import SnapGroup as _SG
            chat_room_id_raw = request.data.get("chat_room_id")
            group_id_raw = request.data.get("group_id")
            my_friends = _friend_user_ids(request.user)
            if chat_room_id_raw not in (None, "", "null"):
                try:
                    chat_room_id = int(chat_room_id_raw)
                except (TypeError, ValueError):
                    return Response({"error": "chat_room_id must be an integer."},
                                    status=status.HTTP_400_BAD_REQUEST)
                try:
                    chat = ChatRoom.objects.get(
                        pk=chat_room_id, is_active=True,
                        room_type=ChatRoom.ROOM_GROUP,
                    )
                except ChatRoom.DoesNotExist:
                    return Response({"error": "Group chat not found."},
                                    status=status.HTTP_404_NOT_FOUND)
                if not ChatRoomMember.objects.filter(room=chat, user=request.user).exists():
                    return Response({"error": "Not a member of this group."},
                                    status=status.HTTP_403_FORBIDDEN)
                member_ids = list(
                    ChatRoomMember.objects.filter(room=chat)
                    .exclude(user=request.user)
                    .values_list('user_id', flat=True)
                )
                audience_ids = [uid for uid in member_ids if uid in my_friends]
            elif group_id_raw not in (None, "", "null"):
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
                audience_ids = [m.user_id for m in group.members.all() if m.user_id in my_friends]
            else:
                return Response(
                    {"error": "group_id or chat_room_id is required for visibility='group'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
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
                # SnapAudience rows are written at upload time from a snapshot
                # of friendship + group membership. If the friendship is later
                # severed (block, or a future unfriend endpoint), the stale row
                # would otherwise still grant access — so we re-verify current
                # friendship in addition to the audience row.
                allowed = (
                    SnapAudience.objects.filter(snap=snap, viewer=me).exists()
                    and snap.uploader_id in _friend_user_ids(me)
                )
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
        # User-initiated delete: purge the blob now to honor the user's intent.
        # Anyone who cached the public URL loses access immediately, not in 30
        # days. Moderation-initiated removal goes through a different path and
        # keeps the file for retention.
        try:
            if snap.media_file:
                snap.media_file.delete(save=False)
        except Exception:
            logger.warning("Eager blob delete failed for snap_id=%s", snap.pk, exc_info=True)
        snap.save(update_fields=["is_removed", "media_file"])
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

        # Absolute URL for a user's profile photo, or None. Shared by every
        # section below so avatars fall back to a real picture when present.
        def _abs_pic(user):
            if not user or not getattr(user, 'profile_picture', None):
                return None
            try:
                return request.build_absolute_uri(user.profile_picture.url)
            except Exception:
                return None

        # 1. Pending friend requests (me = recipient)
        pending = Friend.objects.filter(
            friend=me, status=Friend.PENDING
        ).select_related("user")
        friend_requests_data = [
            {
                "id": req.id,
                "user_id": req.user.id,
                "username": req.user.username,
                "profile_picture_url": _abs_pic(req.user),
                "major": req.user.major,
                "grad_year": req.user.grad_year,
            }
            for req in pending
        ]

        # 2. Unseen snaps from friends (not viewed by me, not expired).
        # Gate: prefs.snaps_from_friends=False → return [] without querying.
        friend_ids = _friend_user_ids(me)
        blocked_ids = _blocked_user_ids(me)
        new_snaps_data = []
        if prefs.snaps_from_friends:
            selected_snap_ids = list(
                SnapAudience.objects.filter(viewer=me).values_list("snap_id", flat=True)
            )
            feed_snaps_qs = (
                Snap.objects.filter(is_removed=False, expires_at__gt=now)
                .filter(
                    (Q(visibility=Snap.VIS_ALL_FRIENDS) & Q(uploader_id__in=friend_ids))
                    | (Q(visibility__in=[Snap.VIS_SELECTED, Snap.VIS_GROUP]) & Q(id__in=selected_snap_ids))
                )
                .select_related("uploader", "course")
            )
            # Mirror SnapFeedView: blocked uploaders shouldn't ring the bell.
            if blocked_ids:
                feed_snaps_qs = feed_snaps_qs.exclude(uploader_id__in=blocked_ids)
            feed_snaps = list(feed_snaps_qs)
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
                    "uploader_profile_picture_url": _abs_pic(snap.uploader),
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
        # Blocks honored: a blocked friend shouldn't tip me off that they're in
        # the same live class.
        live_class_alerts = []
        visible_friend_ids = friend_ids - blocked_ids if blocked_ids else friend_ids
        if visible_friend_ids and prefs.class_is_live:
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
                        user_id__in=visible_friend_ids,
                        course_id__in=live_course_ids,
                        start_date__lte=today,
                        end_date__gte=today,
                    ).select_related("user")
                )
                # Group by course_id → {user_id: user}, filtered to live right now
                course_to_friends: dict = {}
                for fc in friend_courses:
                    days = [d.strip().upper()[:3] for d in fc.rep_date.split(",")]
                    if current_day in days and fc.start_time.strftime("%H:%M") <= current_time_str < fc.end_time.strftime("%H:%M"):
                        bucket = course_to_friends.setdefault(fc.course_id, {})
                        bucket[fc.user.id] = fc.user

                for course in my_live:
                    friends_map = course_to_friends.get(course.course_id, {})
                    if len(friends_map) >= 3:
                        live_class_alerts.append({
                            "course_id": course.course_id,
                            "course_name": course.course_name,
                            "friend_count": len(friends_map),
                            "friends": [
                                {
                                    "id": u.id,
                                    "username": u.username,
                                    "profile_picture_url": _abs_pic(u),
                                }
                                for u in list(friends_map.values())[:5]
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

        # 5. Pending event invites addressed to me.

        event_invites_data = []
        event_invite_qs = (
            EventInvite.objects
            .filter(invitee=me, status=EventInvite.STATUS_PENDING)
            .select_related('event__creator')
            .order_by('-created_at')[:20]
        )
        for inv in event_invite_qs:
            evt = inv.event
            event_invites_data.append({
                "id": inv.id,
                "event_id": evt.id,
                "event_name": evt.name,
                "event_date": evt.date.isoformat(),
                "event_start_time": evt.start_time.strftime("%H:%M"),
                "event_end_time": evt.end_time.strftime("%H:%M"),
                "event_location": evt.location,
                "event_creator_username": evt.creator.username,
                "event_creator_profile_picture_url": _abs_pic(evt.creator),
                "created_at": inv.created_at.isoformat(),
            })

        # 6b. Pending join requests — non-invited friends asking to join one of
        #     my PUBLIC events (allow_join_requests=True).
        event_join_requests_data = []
        join_request_qs = (
            EventInvite.objects
            .filter(event__creator=me, status=EventInvite.STATUS_REQUESTED)
            .select_related('invitee', 'event')
            .order_by('-created_at')[:20]
        )
        for inv in join_request_qs:
            evt = inv.event
            event_join_requests_data.append({
                "id": inv.id,
                "event_id": evt.id,
                "event_name": evt.name,
                "event_date": evt.date.isoformat(),
                "event_start_time": evt.start_time.strftime("%H:%M"),
                "event_end_time": evt.end_time.strftime("%H:%M"),
                "event_location": evt.location,
                "requester_id": inv.invitee_id,
                "requester_username": inv.invitee.username,
                "requester_profile_picture_url": _abs_pic(inv.invitee),
                "created_at": inv.created_at.isoformat(),
            })

        # 7. Event invite responses — invites on events I created that were
        #    recently accepted or declined, so I know who's coming.
        event_invite_responses_data = []
        responded_invite_qs = (
            EventInvite.objects
            .filter(
                event__creator=me,
                status__in=[EventInvite.STATUS_ACCEPTED, EventInvite.STATUS_DECLINED],
                responded_at__isnull=False,
            )
            .select_related('invitee', 'event')
            .order_by('-responded_at')[:20]
        )
        for inv in responded_invite_qs:
            evt = inv.event
            event_invite_responses_data.append({
                "id": inv.id,
                "event_id": evt.id,
                "event_name": evt.name,
                "invitee_username": inv.invitee.username,
                "invitee_profile_picture_url": _abs_pic(inv.invitee),
                "status": inv.status,
                "responded_at": inv.responded_at.isoformat(),
            })

        # 8. Pending study invites — messages addressed to me in rooms I'm in.
        study_invites_data = []
        study_invite_qs = (
            Message.objects
            .filter(
                message_type=Message.MSG_STUDY_INVITE,
                room__members__user=me,
                metadata__status='pending',
            )
            .exclude(sender=me)
            .select_related('sender', 'room')
            .order_by('-created_at')[:20]
        )
        for msg in study_invite_qs:
            md = msg.metadata or {}
            study_invites_data.append({
                "id": msg.id,
                "room_id": msg.room_id,
                "sender_id": msg.sender_id,
                "sender_username": msg.sender.username,
                "sender_profile_picture_url": _abs_pic(msg.sender),
                "proposed_start": md.get('proposed_start'),
                "proposed_end": md.get('proposed_end'),
                "suggested_course_id": md.get('suggested_course_id'),
                "created_at": msg.created_at.isoformat(),
            })

        return Response({
            "friend_requests": friend_requests_data,
            "new_snaps": new_snaps_data,
            "live_class_alerts": live_class_alerts,
            "reports_received": reports_received_data,
            "reports_filed": reports_filed_data,
            "event_invites": event_invites_data,
            "event_invite_responses": event_invite_responses_data,
            "event_join_requests": event_join_requests_data,
            "study_invites": study_invites_data,
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
            .filter(id__in=room_ids, is_active=True)
            .order_by('-created_at')
        )

        # Group all member rows once; reused for DM peer resolution and group
        # preview avatars.
        member_rows = list(
            ChatRoomMember.objects
            .filter(room_id__in=room_ids)
            .select_related('user')
        )
        members_by_room = {}
        for mr in member_rows:
            members_by_room.setdefault(mr.room_id, []).append(mr.user)

        # DM peers (single other user per DM room).
        other_user_by_room = {}
        for r in rooms:
            if r.room_type != ChatRoom.ROOM_DM:
                continue
            peer = next(
                (u for u in members_by_room.get(r.id, []) if u.id != me.id),
                None,
            )
            if peer:
                other_user_by_room[r.id] = peer

        # Block filtering:
        #   DMs   → drop the room outright if the peer is blocked either way.
        #   Group → keep the room; block-side filtering happens per-message.
        blocked_ids = _blocked_user_ids(me)
        if blocked_ids:
            keep_room_ids = set()
            for r in rooms:
                if r.room_type == ChatRoom.ROOM_DM:
                    peer = other_user_by_room.get(r.id)
                    if peer and peer.id not in blocked_ids:
                        keep_room_ids.add(r.id)
                else:
                    keep_room_ids.add(r.id)
            room_ids = [r for r in room_ids if r in keep_room_ids]
            rooms = [r for r in rooms if r.id in keep_room_ids]
            other_user_by_room = {
                rid: u for rid, u in other_user_by_room.items() if rid in keep_room_ids
            }
            if not room_ids:
                return Response({"chats": []})

        # Last message per room. Skip blocked senders in groups so the inbox
        # preview doesn't show their text.
        last_message_by_room = {}
        for room_id in room_ids:
            qs = Message.objects.filter(room_id=room_id)
            # Group rooms: blocked sender messages stay hidden.
            room = next((r for r in rooms if r.id == room_id), None)
            if room and room.room_type == ChatRoom.ROOM_GROUP and blocked_ids:
                qs = qs.exclude(sender_id__in=blocked_ids)
            msg = qs.order_by('-created_at').first()
            if msg:
                last_message_by_room[room_id] = msg

        # Unread per room: messages newer than my last_read_at and not from me
        # (and not from a blocked user, mirrors the preview rule).
        unread_by_room = {}
        for room_id in room_ids:
            lr = last_read_by_room.get(room_id)
            qs = Message.objects.filter(room_id=room_id).exclude(sender=me).filter(is_removed=False)
            if blocked_ids:
                qs = qs.exclude(sender_id__in=blocked_ids)
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
            'members_by_room': members_by_room,
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

        blocked_ids = _blocked_user_ids(me)
        # DM rooms: ChatListCreateView already hides them from the inbox when
        # the peer is on either side of a UserBlock, but a stale link or direct
        # URL still routes here — refuse the read so blocked DM history can't
        # be exfiltrated by guessing the room id.
        if room.room_type == ChatRoom.ROOM_DM and blocked_ids:
            peer_id = next(
                (m.user_id for m in room.members.all() if m.user_id != me.id),
                None,
            )
            if peer_id is not None and peer_id in blocked_ids:
                return Response({"detail": "blocked"}, status=status.HTTP_403_FORBIDDEN)

        msg_qs = Message.objects.filter(room=room).select_related('sender', 'reply_to__sender')
        # Group rooms: hide messages from users on either side of a UserBlock
        # so blocked-uploader messages don't render as ghost bubbles. DMs
        # already short-circuit above.
        if room.room_type == ChatRoom.ROOM_GROUP and blocked_ids:
            msg_qs = msg_qs.exclude(sender_id__in=blocked_ids)
        msgs = list(msg_qs.order_by('-created_at')[:INITIAL_MESSAGE_PAGE])
        ctx = {
            'request': request,
            'initial_messages': msgs,
            'my_rsvp_by_event_id': _rsvp_map_for_messages(me, msgs),
        }
        return Response(ChatRoomDetailSerializer(room, context=ctx).data)


def _rsvp_map_for_messages(user, messages):
    """event_id → the user's EventInvite status, for every event_card message in
    `messages`. Feeds MessageSerializer's per-viewer `my_rsvp_status` injection
    so an event card renders the viewer's RSVP after a reload (the stored
    metadata blob is shared and carries no per-viewer status)."""
    event_ids = [
        (m.metadata or {}).get('event_id')
        for m in messages
        if m.message_type == Message.MSG_EVENT_CARD
    ]
    event_ids = [eid for eid in event_ids if eid]
    if not event_ids:
        return {}
    return dict(
        EventInvite.objects.filter(invitee=user, event_id__in=event_ids)
        .values_list('event_id', 'status')
    )


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
        except (TypeError, ValueError):
            limit = OLDER_MESSAGE_PAGE

        # Coerce `before` up front so non-numeric input returns a clean 400
        # instead of Django's PK-cast raising ValueError → 500.
        before_raw = request.query_params.get('before')
        before_id = None
        if before_raw not in (None, '', 'null'):
            try:
                before_id = int(before_raw)
            except (TypeError, ValueError):
                return Response({"detail": "before must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        blocked_ids = _blocked_user_ids(me)
        # DM: refuse the read if the peer is blocked, mirrors ChatDetailView.
        if room.room_type == ChatRoom.ROOM_DM and blocked_ids:
            peer_id = (
                ChatRoomMember.objects.filter(room=room).exclude(user=me)
                .values_list('user_id', flat=True).first()
            )
            if peer_id is not None and peer_id in blocked_ids:
                return Response({"detail": "blocked"}, status=status.HTTP_403_FORBIDDEN)

        qs = Message.objects.filter(room=room).select_related('sender', 'reply_to__sender').order_by('-created_at')
        # Group rooms: hide messages from blocked users (mirrors ChatDetailView).
        if room.room_type == ChatRoom.ROOM_GROUP and blocked_ids:
            qs = qs.exclude(sender_id__in=blocked_ids)
        if before_id is not None:
            try:
                anchor = Message.objects.get(pk=before_id, room=room)
                qs = qs.filter(created_at__lt=anchor.created_at)
            except Message.DoesNotExist:
                return Response({"detail": "anchor not found"}, status=status.HTTP_400_BAD_REQUEST)

        msgs = list(qs[:limit])
        ctx = {'request': request, 'my_rsvp_by_event_id': _rsvp_map_for_messages(me, msgs)}
        data = MessageSerializer(msgs, many=True, context=ctx).data
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

        # UserBlock:
        #   DM    → if either direction blocks the peer, refuse the send.
        #   Group → membership already authorized the user; per-bubble filtering
        #           happens on read so the block hides messages without
        #           preventing the rest of the conversation from happening.
        if room.room_type == ChatRoom.ROOM_DM:
            other_member_ids = list(
                ChatRoomMember.objects.filter(room=room).exclude(user=me)
                .values_list('user_id', flat=True)
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

        # Reply-to-message: same forgiveness pattern as replied_snap above.
        # Only accept if the parent lives in the same room (cross-room targeting
        # is silently dropped, not 400'd). Soft-deleted parents are still valid
        # references — the serializer blanks their content_preview for the UI.
        reply_to = None
        reply_to_id_raw = request.data.get('reply_to_id')
        if reply_to_id_raw not in (None, '', 'null'):
            try:
                reply_to_id = int(reply_to_id_raw)
            except (TypeError, ValueError):
                reply_to_id = None
            if reply_to_id:
                try:
                    parent = Message.objects.get(pk=reply_to_id, room=room)
                    reply_to = parent
                except Message.DoesNotExist:
                    pass

        msg = Message.objects.create(
            room=room, sender=me, content=content,
            replied_snap=replied_snap, reply_to=reply_to,
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
    """GET /api/chats/unread/ — total unread messages across all my rooms (DM
       + group). Used by App.jsx's 30s global poll to drive nav badges."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        me = request.user
        memberships = list(
            ChatRoomMember.objects.filter(user=me).select_related('room')
            .values('room_id', 'last_read_at', 'room__room_type', 'room__is_active')
        )
        blocked_ids = _blocked_user_ids(me)
        total = 0
        for m in memberships:
            if not m['room__is_active']:
                continue
            qs = Message.objects.filter(room_id=m['room_id'], is_removed=False).exclude(sender=me)
            # Group: blocked sender messages don't render → don't ring the badge.
            # DM: rooms with blocked peers are already hidden from the inbox,
            # but we still skip their counts here for parity.
            if blocked_ids:
                qs = qs.exclude(sender_id__in=blocked_ids)
            if m['last_read_at']:
                qs = qs.filter(created_at__gt=m['last_read_at'])
            total += qs.count()
        return Response({"total": total})


# ---------------------------------------------------------------------------
# Phase 11 — Group chat
# Endpoints live under /api/chats/groups/. Group rooms are the source of truth
# for snap-audience too: snap upload accepts chat_room_id, see SnapUploadView.
# ---------------------------------------------------------------------------

GROUP_NAME_MAX_LEN = 80
GROUP_MEMBER_MIN = 2  # creator + ≥2 others


def _is_group_admin(room, user):
    return ChatRoomMember.objects.filter(
        room=room, user=user, is_admin=True
    ).exists()


def _group_room_payload(room, me):
    """Shape returned by group-chat endpoints. Includes member list with
    is_admin flags; mirrors what the chat thread UI needs to render header,
    member list, and per-message sender attribution.
    """
    members = list(
        room.members.select_related('user').order_by('joined_at')
    )
    member_data = [{
        'id': m.user_id,
        'username': m.user.username,
        'is_admin': m.is_admin,
        'joined_at': m.joined_at.isoformat(),
    } for m in members]
    return {
        'id': room.id,
        'room_type': room.room_type,
        'name': room.name,
        'created_by': room.created_by_id,
        'created_at': room.created_at.isoformat(),
        'is_active': room.is_active,
        'members': member_data,
        'member_count': len(member_data),
        'is_admin': any(m.user_id == me.id and m.is_admin for m in members),
    }


class GroupChatListCreateView(APIView):
    """POST /api/chats/groups/ — create a group chat.
       Body: { name, member_ids: [int, ...] }
       Creator becomes the first admin; member_ids are friend-gated."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        me = request.user

        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({"detail": "name required"}, status=status.HTTP_400_BAD_REQUEST)
        if len(name) > GROUP_NAME_MAX_LEN:
            return Response(
                {"detail": f"name exceeds {GROUP_NAME_MAX_LEN} chars"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_ids = request.data.get('member_ids') or []
        if hasattr(request.data, 'getlist') and not raw_ids:
            raw_ids = request.data.getlist('member_ids')
        try:
            member_ids = list({int(x) for x in raw_ids if str(x).strip()})
        except (TypeError, ValueError):
            return Response({"detail": "member_ids must be integers"},
                            status=status.HTTP_400_BAD_REQUEST)
        member_ids = [uid for uid in member_ids if uid != me.id]
        if len(member_ids) < GROUP_MEMBER_MIN:
            return Response(
                {"detail": f"add at least {GROUP_MEMBER_MIN} friends"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Friend-gate every member up-front (no stranger seeding) and reject
        # blocks against the creator (auto-blocks shouldn't get backdoored
        # into a chat via a group invite).
        my_friends = _friend_user_ids(me)
        stranger_ids = [uid for uid in member_ids if uid not in my_friends]
        if stranger_ids:
            return Response(
                {"detail": "not_friends", "stranger_ids": stranger_ids},
                status=status.HTTP_403_FORBIDDEN,
            )
        blocked_ids = _blocked_user_ids(me)
        blocked_in_group = [uid for uid in member_ids if uid in blocked_ids]
        if blocked_in_group:
            return Response(
                {"detail": "blocked", "blocked_ids": blocked_in_group},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            room = ChatRoom.objects.create(
                room_type=ChatRoom.ROOM_GROUP,
                name=name,
                created_by=me,
            )
            ChatRoomMember.objects.create(room=room, user=me, is_admin=True)
            ChatRoomMember.objects.bulk_create([
                ChatRoomMember(room=room, user_id=uid, is_admin=False)
                for uid in member_ids
            ])
            snap_group = SnapGroup.objects.create(owner=me, name=name, chat_room=room)
            SnapGroupMember.objects.bulk_create([
                SnapGroupMember(group=snap_group, user_id=uid)
                for uid in member_ids
            ])

        room = ChatRoom.objects.prefetch_related('members__user').get(pk=room.pk)
        return Response(_group_room_payload(room, me), status=status.HTTP_201_CREATED)


class GroupChatDetailView(APIView):
    """GET /api/chats/groups/<id>/ — group room + member list.
       PATCH { name } — rename (admin-only).
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, request, pk):
        try:
            return ChatRoom.objects.prefetch_related('members__user').get(
                pk=pk, is_active=True, room_type=ChatRoom.ROOM_GROUP,
            )
        except ChatRoom.DoesNotExist:
            return None

    def get(self, request, pk):
        room = self._get(request, pk)
        if not room:
            return Response({"detail": "group not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _user_membership(room, request.user):
            return Response({"detail": "not a member"}, status=status.HTTP_403_FORBIDDEN)
        return Response(_group_room_payload(room, request.user))

    def patch(self, request, pk):
        room = self._get(request, pk)
        if not room:
            return Response({"detail": "group not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _is_group_admin(room, request.user):
            return Response({"detail": "admin only"}, status=status.HTTP_403_FORBIDDEN)
        if 'name' in request.data:
            name = (request.data.get('name') or '').strip()
            if not name:
                return Response({"detail": "name required"}, status=status.HTTP_400_BAD_REQUEST)
            if len(name) > GROUP_NAME_MAX_LEN:
                return Response(
                    {"detail": f"name exceeds {GROUP_NAME_MAX_LEN} chars"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            room.name = name
            room.save(update_fields=['name'])
            SnapGroup.objects.filter(chat_room=room).update(name=name)
        room = ChatRoom.objects.prefetch_related('members__user').get(pk=room.pk)
        return Response(_group_room_payload(room, request.user))


class GroupChatMemberAddView(APIView):
    """POST /api/chats/groups/<id>/members/ — body { user_id }.
       Admin-only. Friend-gated against the admin (not every existing member).
       Idempotent."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            room = ChatRoom.objects.get(
                pk=pk, is_active=True, room_type=ChatRoom.ROOM_GROUP,
            )
        except ChatRoom.DoesNotExist:
            return Response({"detail": "group not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _is_group_admin(room, request.user):
            return Response({"detail": "admin only"}, status=status.HTTP_403_FORBIDDEN)
        try:
            user_id = int(request.data.get('user_id'))
        except (TypeError, ValueError):
            return Response({"detail": "user_id required"}, status=status.HTTP_400_BAD_REQUEST)
        if user_id == request.user.id:
            return Response({"detail": "cannot add self"}, status=status.HTTP_400_BAD_REQUEST)
        if user_id not in _friend_user_ids(request.user):
            return Response({"detail": "not_friends"}, status=status.HTTP_403_FORBIDDEN)
        if user_id in _blocked_user_ids(request.user):
            return Response({"detail": "blocked"}, status=status.HTTP_403_FORBIDDEN)
        ChatRoomMember.objects.get_or_create(
            room=room, user_id=user_id, defaults={'is_admin': False},
        )
        snap_group = SnapGroup.objects.filter(chat_room=room).first()
        if snap_group:
            SnapGroupMember.objects.get_or_create(group=snap_group, user_id=user_id)
        room = ChatRoom.objects.prefetch_related('members__user').get(pk=room.pk)
        return Response(_group_room_payload(room, request.user))


class GroupChatMemberRemoveView(APIView):
    """DELETE /api/chats/groups/<id>/members/<user_id>/ —
       admin can remove anyone (including self → counts as leaving).
       Non-admin members can only remove themselves (= leave).
       If the last admin leaves and other members remain, the oldest member
       is promoted. If the last member leaves, the room is soft-deleted."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk, user_id):
        try:
            room = ChatRoom.objects.get(
                pk=pk, is_active=True, room_type=ChatRoom.ROOM_GROUP,
            )
        except ChatRoom.DoesNotExist:
            return Response({"detail": "group not found"}, status=status.HTTP_404_NOT_FOUND)

        me = request.user
        target_membership = ChatRoomMember.objects.filter(
            room=room, user_id=user_id,
        ).first()
        if not target_membership:
            return Response({"detail": "not a member"}, status=status.HTTP_404_NOT_FOUND)

        is_self = (user_id == me.id)
        if not is_self and not _is_group_admin(room, me):
            return Response({"detail": "admin only"}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            target_membership.delete()
            remaining = list(
                ChatRoomMember.objects.filter(room=room).order_by('joined_at')
            )
            if not remaining:
                room.is_active = False
                room.save(update_fields=['is_active'])
                SnapGroup.objects.filter(chat_room=room).delete()
            else:
                if not any(m.is_admin for m in remaining):
                    # Last admin left; promote the oldest member.
                    oldest = remaining[0]
                    oldest.is_admin = True
                    oldest.save(update_fields=['is_admin'])
                snap_group = SnapGroup.objects.filter(chat_room=room).first()
                if snap_group:
                    SnapGroupMember.objects.filter(
                        group=snap_group, user_id=user_id
                    ).delete()
                    # If the removed user was the snap group owner, reassign.
                    if snap_group.owner_id == user_id:
                        new_owner = remaining[0].user
                        snap_group.owner = new_owner
                        snap_group.save(update_fields=['owner'])

        if not room.is_active:
            return Response(status=status.HTTP_204_NO_CONTENT)
        room = ChatRoom.objects.prefetch_related('members__user').get(pk=room.pk)
        return Response(_group_room_payload(room, me))


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


def _visible_friend_ids(user):
    """`_friend_user_ids` minus everyone who has a block in either direction
    with `user`. Use this everywhere a feature should treat blocked friends as
    "not friends" — Events, Notifications, SharedGaps, the home dashboard. Raw
    `_friend_user_ids` is reserved for places that need the unfiltered roster
    (e.g. invite-target validation in SnapUploadView's audience check)."""
    return _friend_user_ids(user) - _blocked_user_ids(user)


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

        # Visibility gate: the reporter must actually have access to the
        # content. Otherwise the endpoint becomes (a) an ID-enumeration oracle
        # — 201 vs 403 reveals whether a given snap/message PK exists — and
        # (b) a harassment vector that lets a stranger flood a victim's
        # `reports_received` notifications with reports about content they
        # never could see. Returns 404 (not 403) to avoid disclosing whether
        # the PK exists.
        if ct == Report.CONTENT_SNAP:
            can_see = (
                target.uploader_id == me.id
                or (target.visibility == Snap.VIS_ALL_FRIENDS and target.uploader_id in _friend_user_ids(me))
                or SnapAudience.objects.filter(snap=target, viewer=me).exists()
            )
        else:
            can_see = ChatRoomMember.objects.filter(room_id=target.room_id, user=me).exists()
        if not can_see or _is_blocked_between(me, reported_user):
            return Response({'detail': 'not_found'}, status=status.HTTP_404_NOT_FOUND)

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
        return Response({'blocks': UserBlockSerializer(qs, many=True, context={'request': request}).data})

    def post(self, request):
        """POST /api/blocks/ {user_id} — manually block a user. Also severs the
        friendship in both directions (a block implies you're no longer friends)."""
        me = request.user
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'detail': 'user_id required'}, status=status.HTTP_400_BAD_REQUEST)
        if str(user_id) == str(me.id):
            return Response({'detail': "you can't block yourself."}, status=status.HTTP_400_BAD_REQUEST)
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response({'detail': 'user_not_found'}, status=status.HTTP_404_NOT_FOUND)
        block, _ = UserBlock.objects.get_or_create(
            blocker=me, blocked=target,
            defaults={'reason': UserBlock.REASON_MANUAL},
        )
        # A block implies severing any existing friendship (both directions).
        models.Friend.objects.filter(
            Q(user=me, friend=target) | Q(user=target, friend=me),
        ).delete()
        return Response(
            UserBlockSerializer(block, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


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
        import hmac
        expected = getattr(settings, 'MODERATION_RUN_SECRET', None)
        if not expected:
            return Response({'detail': 'moderation_disabled'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        got = request.headers.get('X-Moderation-Secret') or ''
        # Constant-time compare so the header check doesn't leak the secret
        # one byte at a time via response timing.
        if not hmac.compare_digest(got, expected):
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


# ──────────────────────────────────────────────────────────────────────────────
# Availability & Study Coordination
# ──────────────────────────────────────────────────────────────────────────────

def _get_day_window(day):
    """Return (day_start, day_end) as UTC-aware datetimes for an 8am-10pm window."""
    from datetime import timezone as dt_tz
    return (
        datetime.combine(day, dt_time(8, 0)).replace(tzinfo=dt_tz.utc),
        datetime.combine(day, dt_time(22, 0)).replace(tzinfo=dt_tz.utc),
    )


def _fetch_events_for_day(user_ids, day):
    """Return ExternalCalendarEvent rows for given users on the given day."""
    from datetime import timezone as dt_tz
    day_start = datetime.combine(day, dt_time(0, 0)).replace(tzinfo=dt_tz.utc)
    day_end   = datetime.combine(day, dt_time(23, 59, 59)).replace(tzinfo=dt_tz.utc)
    return ExternalCalendarEvent.objects.filter(
        user_id__in=user_ids,
        is_blocking=True,
        starts_at__lt=day_end,
        ends_at__gt=day_start,
    )


class AvailabilityMeView(APIView):
    """GET /api/availability/me/
    Returns the current user's free/busy status for today plus free slots."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .availability import get_busy_blocks, get_current_status, get_free_slots
        user = request.user
        today = timezone.now().date()
        now   = timezone.now()

        has_courses = Course.objects.filter(user=user).exists()

        active_courses = Course.objects.filter(
            user=user, start_date__lte=today, end_date__gte=today,
        ) if has_courses else []

        events = _fetch_events_for_day([user.id], today).filter(user=user)
        busy   = get_busy_blocks(active_courses, events, today)
        status_data = get_current_status(busy, now, has_courses=has_courses)

        window_start, window_end = _get_day_window(today)
        free_slots = get_free_slots(busy, window_start, window_end, min_duration_minutes=30)

        return Response({
            **status_data,
            "free_slots_today": [
                {"start": s.isoformat(), "end": e.isoformat()}
                for s, e in free_slots
            ],
        })


class AvailabilityFriendsView(APIView):
    """GET /api/availability/friends/
    Returns current free/busy status for all accepted friends.
    Respects UserBlock — blocked users are excluded from the result.
    Never exposes calendar event titles, only free/busy status."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .availability import get_busy_blocks, get_current_status
        user  = request.user
        today = timezone.now().date()
        now   = timezone.now()

        # Accepted friends (bidirectional)
        rows = Friend.objects.filter(
            Q(user=user) | Q(friend=user), status=Friend.ACCEPTED
        ).values_list('user_id', 'friend_id')
        friend_ids = {uid if uid != user.id else fid for uid, fid in rows}

        # Remove blocked users
        blocked = set(
            UserBlock.objects.filter(Q(blocker=user) | Q(blocked=user))
            .values_list('blocker_id', 'blocked_id')
        )
        blocked_flat = {uid for pair in blocked for uid in pair} - {user.id}
        friend_ids -= blocked_flat

        if not friend_ids:
            return Response({})

        friends = User.objects.filter(id__in=friend_ids)

        # Prefetch courses + events for all friends in two queries
        courses_qs = Course.objects.filter(
            user_id__in=friend_ids, start_date__lte=today, end_date__gte=today,
        )
        events_qs = _fetch_events_for_day(friend_ids, today)

        courses_by_user: dict = {}
        for c in courses_qs:
            courses_by_user.setdefault(c.user_id, []).append(c)

        events_by_user: dict = {}
        for ev in events_qs:
            events_by_user.setdefault(ev.user_id, []).append(ev)

        result = {}
        for friend in friends:
            has_courses = friend.id in courses_by_user
            busy = get_busy_blocks(
                courses_by_user.get(friend.id, []),
                events_by_user.get(friend.id, []),
                today,
            )
            status_data = get_current_status(busy, now, has_courses=has_courses)
            result[str(friend.id)] = {"username": friend.username, **status_data}

        return Response(result)


class SharedGapsView(APIView):
    """POST /api/availability/shared-gaps/
    Returns free slots shared by the requesting user + specified friends."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from .availability import get_busy_blocks, get_shared_free_slots
        user = request.user

        try:
            user_ids      = [int(i) for i in (request.data.get('user_ids') or [])]
            days_ahead    = min(int(request.data.get('days_ahead', 7)), 14)
            min_duration  = max(15, int(request.data.get('min_duration_minutes', 30)))
        except (TypeError, ValueError):
            return Response({"error": "Invalid parameters."}, status=status.HTTP_400_BAD_REQUEST)

        # Optional single-day mode: the event wizard passes a specific `date`
        # (which may be further out than the 14-day days_ahead cap) and wants
        # free slots for just that day.
        single_date = request.data.get('date')
        if single_date:
            try:
                target = datetime.strptime(single_date, "%Y-%m-%d").date()
            except (TypeError, ValueError):
                return Response({"error": "Invalid date."}, status=status.HTTP_400_BAD_REQUEST)
            days = [target]
        else:
            today = timezone.now().date()
            days = [today + timedelta(days=offset) for offset in range(days_ahead)]

        # Always include self; validate the rest are accepted friends, and
        # subtract anyone on either side of a UserBlock so a blocked friend's
        # busy/free pattern can't be inferred by listing them in user_ids.
        visible_friends = _visible_friend_ids(user)
        valid_ids = list({user.id} | (set(user_ids) & visible_friends))

        all_gaps = []

        for day in days:
            window_start, window_end = _get_day_window(day)

            courses_qs = Course.objects.filter(
                user_id__in=valid_ids, start_date__lte=day, end_date__gte=day,
            )
            events_qs = _fetch_events_for_day(valid_ids, day)

            courses_by_user: dict = {}
            for c in courses_qs:
                courses_by_user.setdefault(c.user_id, []).append(c)
            events_by_user: dict = {}
            for ev in events_qs:
                events_by_user.setdefault(ev.user_id, []).append(ev)

            all_busy = [
                get_busy_blocks(
                    courses_by_user.get(uid, []),
                    events_by_user.get(uid, []),
                    day,
                )
                for uid in valid_ids
            ]
            shared = get_shared_free_slots(all_busy, window_start, window_end, min_duration)

            for s, e in shared:
                all_gaps.append({
                    "start": s.isoformat(),
                    "end":   e.isoformat(),
                    "duration_minutes": int((e - s).total_seconds() / 60),
                    "users_free": valid_ids,
                })

        all_gaps.sort(key=lambda g: g["start"])

        # Suggested course: shared course with the soonest upcoming exam
        suggested_course = None
        if len(valid_ids) > 1:
            user_cids = [
                set(Course.objects.filter(user_id=uid).values_list('course_id', flat=True))
                for uid in valid_ids
            ]
            shared_cids = set.intersection(*user_cids) if user_cids else set()
            if shared_cids:
                upcoming = (
                    Exam.objects.filter(
                        user=user,
                        course__course_id__in=shared_cids,
                        exam_date__gte=timezone.now(),
                        is_completed=False,
                    )
                    .order_by('exam_date')
                    .select_related('course')
                    .first()
                )
                if upcoming:
                    suggested_course = {
                        "id": upcoming.course.id,
                        "name": upcoming.course.course_name,
                        "course_id": upcoming.course.course_id,
                    }

        if suggested_course:
            for gap in all_gaps:
                gap["suggested_course"] = suggested_course

        return Response({"gaps": all_gaps[:20]})


class StudyInviteView(APIView):
    """POST /api/study-invites/
    Creates a study_invite message in the given chat room."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        room_id          = request.data.get('room_id')
        proposed_start   = request.data.get('proposed_start')
        proposed_end     = request.data.get('proposed_end')
        suggested_course_id = request.data.get('suggested_course_id')

        if not room_id or not proposed_start or not proposed_end:
            return Response(
                {"error": "room_id, proposed_start, proposed_end are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate datetimes BEFORE writing the invite. Accepting the invite
        # later creates an ExternalCalendarEvent that blocks the responder's
        # availability forever, so a malformed/inverted/wildly-future range
        # would pollute their calendar.
        from django.utils.dateparse import parse_datetime
        s = parse_datetime(proposed_start) if isinstance(proposed_start, str) else None
        e = parse_datetime(proposed_end) if isinstance(proposed_end, str) else None
        if not s or not e:
            return Response(
                {"error": "proposed_start and proposed_end must be ISO 8601 datetimes."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if e <= s:
            return Response(
                {"error": "proposed_end must be after proposed_start."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # 30-day horizon mirrors the snap retention window and bounds the
        # accept-path's calendar-write to a sane range.
        if (s - timezone.now()) > timedelta(days=30):
            return Response(
                {"error": "proposed_start must be within 30 days."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            room = ChatRoom.objects.get(pk=room_id, is_active=True)
            ChatRoomMember.objects.get(room=room, user=request.user)
        except ChatRoom.DoesNotExist:
            return Response({"error": "Room not found."}, status=status.HTTP_404_NOT_FOUND)
        except ChatRoomMember.DoesNotExist:
            return Response({"error": "Not a member of this room."}, status=status.HTTP_403_FORBIDDEN)

        metadata = {
            "proposed_start":      proposed_start,
            "proposed_end":        proposed_end,
            "suggested_course_id": suggested_course_id,
            "status":              "pending",
        }

        msg = Message.objects.create(
            room=room,
            sender=request.user,
            content="study invite",
            message_type=Message.MSG_STUDY_INVITE,
            metadata=metadata,
        )
        return Response(
            MessageSerializer(msg, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class StudyInviteRespondView(APIView):
    """PATCH /api/chats/<pk>/messages/<msg_id>/invite/
    Accept or decline a study invite. Accepting creates an ExternalCalendarEvent
    for the responding user to block that time in future gap searches."""
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk, msg_id):
        try:
            msg = Message.objects.select_related('room').get(
                pk=msg_id, room_id=pk, message_type=Message.MSG_STUDY_INVITE
            )
            ChatRoomMember.objects.get(room_id=pk, user=request.user)
        except Message.DoesNotExist:
            return Response({"error": "Invite not found."}, status=status.HTTP_404_NOT_FOUND)
        except ChatRoomMember.DoesNotExist:
            return Response({"error": "Not a member of this room."}, status=status.HTTP_403_FORBIDDEN)
        # Refuse responses in soft-deleted rooms — the accept path would
        # otherwise create an ExternalCalendarEvent for a dead conversation.
        if not msg.room.is_active:
            return Response({"error": "Room is no longer active."}, status=status.HTTP_410_GONE)

        action = request.data.get('action')
        if action not in ('accept', 'decline'):
            return Response(
                {"error": "action must be 'accept' or 'decline'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        metadata = dict(msg.metadata or {})
        metadata['status'] = 'accepted' if action == 'accept' else 'declined'
        msg.metadata = metadata
        msg.save(update_fields=['metadata'])

        if action == 'accept':
            proposed_start = metadata.get('proposed_start')
            proposed_end   = metadata.get('proposed_end')
            if proposed_start and proposed_end:
                try:
                    from django.utils.dateparse import parse_datetime
                    s = parse_datetime(proposed_start)
                    e = parse_datetime(proposed_end)
                    # Defense-in-depth: StudyInviteView validates on create,
                    # but reject inverted/missing ranges here too so a
                    # tampered metadata blob can't pollute the calendar.
                    if s and e and e > s:
                        ExternalCalendarEvent.objects.create(
                            user=request.user,
                            title='Study session (Timetify)',
                            starts_at=s,
                            ends_at=e,
                            is_blocking=True,
                            source=ExternalCalendarEvent.SOURCE_STUDY_INVITE,
                        )
                except Exception:
                    logger.warning(
                        "Failed to create calendar event for study invite accept user_id=%s",
                        request.user.id, exc_info=True,
                    )

        return Response(MessageSerializer(msg, context={'request': request}).data)


_WEEKDAY_ABBR = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']


def _parse_iso_date(s, default):
    if not s:
        return default
    try:
        return datetime.strptime(s, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None


def _week_start_for(d):
    # Monday of the week containing d.
    return d - timedelta(days=d.weekday())


def _expand_event_occurrences(evt, week_start, week_end):
    """Yield (occurrence_date) for evt within [week_start, week_end)."""
    if not evt.is_repeating:
        if week_start <= evt.date < week_end:
            yield evt.date
        return
    repeat_set = {t.strip().upper() for t in (evt.repeat_days or '').split(',') if t.strip()}
    if not repeat_set:
        return
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        if day < evt.date:
            continue  # series hasn't started yet on this day
        if _WEEKDAY_ABBR[day.weekday()] in repeat_set:
            yield day


def _norm_day(d):
    """Normalize a weekday token from any source (e.g. Course.rep_date 'Mon',
    Event.repeat_days 'MON') to the canonical 3-letter UPPERCASE form."""
    return (d or '').strip().upper()[:3]


def _target_event_days(date_, is_repeating, repeat_days):
    """Days-of-week this candidate event occurs on."""
    if is_repeating:
        return {_norm_day(t) for t in (repeat_days or '').split(',') if t.strip()}
    return {_WEEKDAY_ABBR[date_.weekday()]}


def _conflict_for_user(user, target_days, target_start, target_end, target_date, ignore_event_id=None):
    """Strict-< overlap check (matches CourseFinalizeView's rule) of a candidate
    event time against `user`'s active courses and committed events (created or
    ACCEPTED). Returns a list of every clashing block (may be empty).

    Each conflict dict is tagged with `kind` and carries the DB pk needed to
    later record a skip: courses use `course_pk`, events use `event_id`.

    target_date is the specific date for single-instance events, or None for
    repeating events.
    """
    today = timezone.localdate()
    conflicts = []

    # Courses — narrow to ones active on the relevant date(s).
    courses_qs = Course.objects.filter(user=user)
    if target_date is not None:
        courses_qs = courses_qs.filter(start_date__lte=target_date, end_date__gte=target_date)
    else:
        courses_qs = courses_qs.filter(end_date__gte=today)

    for c in courses_qs:
        c_days = {_norm_day(d) for d in (c.rep_date or '').split(',') if d.strip()}
        shared = c_days & target_days
        if shared and target_start < c.end_time and c.start_time < target_end:
            conflicts.append({
                "kind": "course",
                "course_pk": c.pk,
                "course_id": c.course_id,
                "course_name": c.course_name,
                "day": sorted(shared)[0],
                "start_time": c.start_time.strftime("%H:%M"),
                "end_time": c.end_time.strftime("%H:%M"),
            })

    # Events — those I'm creator OR ACCEPTED invitee of.
    events_qs = Event.objects.filter(
        Q(creator=user) | Q(invites__invitee=user, invites__status=EventInvite.STATUS_ACCEPTED)
    ).distinct()
    if ignore_event_id is not None:
        events_qs = events_qs.exclude(pk=ignore_event_id)

    for evt in events_qs:
        evt_days = _target_event_days(evt.date, evt.is_repeating, evt.repeat_days)
        shared = evt_days & target_days
        if not shared:
            continue
        # Two single-instance events only clash on the exact same date.
        if target_date is not None and not evt.is_repeating and evt.date != target_date:
            continue
        if target_start < evt.end_time and evt.start_time < target_end:
            conflicts.append({
                "kind": "event",
                "event_id": evt.id,
                "event_name": evt.name,
                "day": sorted(shared)[0],
                "start_time": evt.start_time.strftime("%H:%M"),
                "end_time": evt.end_time.strftime("%H:%M"),
            })

    return conflicts


# How far ahead to materialize skip rows for a repeating attending event whose
# clashing target has no natural end (event-vs-event). Courses are bounded by
# their own end_date, so this only caps the open-ended event case.
_SKIP_HORIZON_DAYS = 365


def _co_occurrence_dates(target_days, target_date, anchor_date, end_bound):
    """Concrete dates on which both the attending event and the clashing block
    occur, within [max(today, anchor_date), end_bound]. For a single-instance
    attending event (target_date set) this is just [target_date]."""
    if target_date is not None:
        return [target_date]
    today = timezone.localdate()
    start = max(today, anchor_date)
    horizon = today + timedelta(days=_SKIP_HORIZON_DAYS)
    stop = min(end_bound, horizon) if end_bound else horizon
    dates = []
    day = start
    while day <= stop:
        if _WEEKDAY_ABBR[day.weekday()] in target_days:
            dates.append(day)
        day += timedelta(days=1)
    return dates


def _apply_skips(user, conflicts, attending_event, target_days, target_date):
    """Record CourseSkip / EventOccurrenceSkip rows so the clashing blocks in
    `conflicts` are hidden for `user` on every date they co-occur with
    `attending_event`. Idempotent via get_or_create."""
    anchor = attending_event.date
    for c in conflicts:
        if c.get("kind") == "course":
            try:
                course = Course.objects.get(pk=c["course_pk"], user=user)
            except Course.DoesNotExist:
                continue
            for d in _co_occurrence_dates(target_days, target_date, anchor, course.end_date):
                CourseSkip.objects.get_or_create(
                    user=user, course=course, date=d,
                    defaults={"event": attending_event},
                )
        elif c.get("kind") == "event":
            try:
                skipped = Event.objects.get(pk=c["event_id"])
            except Event.DoesNotExist:
                continue
            end_bound = None if skipped.is_repeating else skipped.date
            for d in _co_occurrence_dates(target_days, target_date, anchor, end_bound):
                EventOccurrenceSkip.objects.get_or_create(
                    user=user, skipped_event=skipped, date=d,
                    defaults={"attending_event": attending_event},
                )


def _redact_event_payload(evt, request):
    """Shape for an event from an accepted friend that the viewer isn't entitled
    to see in full (PRIVATE + not invited). Keeps time/creator avatar so the
    viewer can see *that* the friend is busy without leaking name/location/etc.
    Frontend treats `is_redacted: True` as non-clickable."""
    pic = None
    if evt.creator and getattr(evt.creator, 'profile_picture', None):
        try:
            url = evt.creator.profile_picture.url
            pic = request.build_absolute_uri(url) if request is not None else url
        except Exception:
            pic = None
    return {
        "id": evt.id,
        "is_redacted": True,
        "creator": evt.creator_id,
        "creator_username": evt.creator.username,
        "creator_profile_picture_url": pic,
        "name": None,
        "location": "",
        "date": evt.date.isoformat(),
        "start_time": evt.start_time.strftime("%H:%M:%S"),
        "end_time": evt.end_time.strftime("%H:%M:%S"),
        "is_repeating": evt.is_repeating,
        "repeat_days": evt.repeat_days if evt.is_repeating else "",
        "visibility": Event.VISIBILITY_PRIVATE,
        "chat_room": None,
        "is_mine": False,
        "my_invite_status": None,
        "invites": None,
    }


def _collect_event_conflicts(creator, invitee_ids, data, ignore_event_id=None):
    """Run the overlap check for the creator and every invitee. Returns a list
    of conflict dicts (each tagged with user_id/username); empty if clear."""
    target_days = _target_event_days(data['date'], data.get('is_repeating', False), data.get('repeat_days', ''))
    target_date = data['date'] if not data.get('is_repeating', False) else None
    start = data['start_time']
    end = data['end_time']

    checked = []
    checked.append(creator)
    if invitee_ids:
        checked.extend(User.objects.filter(pk__in=invitee_ids))

    conflicts = []
    for u in checked:
        for c in _conflict_for_user(u, target_days, start, end, target_date, ignore_event_id=ignore_event_id):
            conflicts.append({**c, "user_id": u.id, "username": u.username})
    return conflicts


class EventListCreateView(APIView):
    """GET  /api/events/?week=YYYY-MM-DD — events visible to me within the
            7-day window starting at `week` (Monday). Repeating events are
            expanded into one entry per occurrence.
       POST /api/events/ — create an event with optional invites."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        me = request.user
        today = timezone.localdate()
        week_param = request.query_params.get('week')
        week_start = _parse_iso_date(week_param, _week_start_for(today))
        if week_start is None:
            return Response({"detail": "week must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)
        week_end = week_start + timedelta(days=7)

        # Use _visible_friend_ids so blocked friends' events (both PUBLIC and
        # the redacted PRIVATE busy-block) drop out. Direct invites still flow
        # through `invites__invitee=me` regardless of friendship status.
        friend_ids = _visible_friend_ids(me)
        friend_set = set(friend_ids)

        # Candidate events:
        #  - mine
        #  - any event I've been invited to (any status)
        #  - any event from a visible friend (full if PUBLIC, redacted if PRIVATE)
        # Date filter: either evt.date < week_end (non-repeating) OR is_repeating
        # (repeating series may have started before week_start and still apply).
        visible = (
            Event.objects.filter(
                Q(creator=me)
                | Q(invites__invitee=me)
                | Q(creator_id__in=friend_ids)
            )
            .filter(Q(is_repeating=True) | Q(date__lt=week_end))
            .select_related('creator')
            .distinct()
        )

        # Prefetch my-invite status for the visible set; presence in this dict
        # means I was invited (any status) → full details. Absence + PRIVATE +
        # friend's event → redacted busy-block.
        my_invite_rows = list(
            EventInvite.objects.filter(event__in=visible, invitee=me)
            .values_list('event_id', 'status', 'id')
        )
        my_statuses = {eid: status for eid, status, _ in my_invite_rows}
        my_invite_ids = {eid: inv_id for eid, _, inv_id in my_invite_rows}
        invited_event_ids = set(my_statuses.keys())
        ctx = {'request': request, 'my_invite_status_by_event_id': my_statuses, 'my_invite_id_by_event_id': my_invite_ids}

        payload = []
        for evt in visible:
            full = (
                evt.creator_id == me.id
                or evt.id in invited_event_ids
                or (evt.visibility == Event.VISIBILITY_PUBLIC and evt.creator_id in friend_set)
            )
            base = (
                EventSerializer(evt, context=ctx).data if full
                else _redact_event_payload(evt, request)
            )
            for occ in _expand_event_occurrences(evt, week_start, week_end):
                payload.append({**base, 'occurrence_date': occ.isoformat()})
        payload.sort(key=lambda e: (e['occurrence_date'], e['start_time']))
        return Response(payload)

    def post(self, request):
        me = request.user
        serializer = EventCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        invite_user_ids = data.pop('invite_user_ids', [])
        create_chat = data.pop('create_chat', True)

        # Optional: post an event_card system message into an existing chat room
        # after creation. Used by the /create slash command in chat.
        source_chat_room_id = request.data.get('source_chat_room_id')
        source_room = None
        if source_chat_room_id:
            try:
                source_room = ChatRoom.objects.get(pk=int(source_chat_room_id), is_active=True)
                if not _user_membership(source_room, me):
                    source_room = None
            except (ChatRoom.DoesNotExist, TypeError, ValueError):
                source_room = None

        if invite_user_ids:
            my_friends = _friend_user_ids(me)
            strangers = [uid for uid in invite_user_ids if uid not in my_friends]
            if strangers:
                return Response(
                    {"detail": "not_friends", "stranger_ids": strangers},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Overlap check against creator + every invitee's courses and committed
        # events. Strict-< (boundary-touch is allowed) — matches CourseFinalize.
        # The creator resolves their OWN clash (skip the clashing block, or keep
        # both visible); they can't decide for an invitee, so an invitee clash
        # only needs the host's acknowledgement ("let them decide") to proceed —
        # the invitee makes the real skip/keep choice when they accept.
        creator_resolution = request.data.get('conflict_resolution')  # 'skip'|'keep_both'|None
        proceed_invitee = bool(request.data.get('proceed_invitee_conflicts', False))

        conflicts = _collect_event_conflicts(me, invite_user_ids, data)
        creator_conflicts = [c for c in conflicts if c['user_id'] == me.id]
        invitee_conflicts = [c for c in conflicts if c['user_id'] != me.id]

        needs_creator_decision = bool(creator_conflicts) and creator_resolution not in (
            EventInvite.SKIP_SKIP, EventInvite.SKIP_KEEP_BOTH,
        )
        needs_invitee_ack = bool(invitee_conflicts) and not proceed_invitee
        if needs_creator_decision or needs_invitee_ack:
            return Response(
                {
                    "error": "overlap",
                    "conflicts": conflicts,
                    "creator_conflicts": creator_conflicts,
                    "invitee_conflicts": invitee_conflicts,
                },
                status=status.HTTP_409_CONFLICT,
            )

        target_days = _target_event_days(data['date'], data.get('is_repeating', False), data.get('repeat_days', ''))
        target_date = data['date'] if not data.get('is_repeating', False) else None

        with transaction.atomic():
            event = Event.objects.create(creator=me, **data)

            # Creator chose to skip their own clashing blocks → record them.
            if creator_conflicts and creator_resolution == EventInvite.SKIP_SKIP:
                _apply_skips(me, creator_conflicts, event, target_days, target_date)

            if create_chat:
                room = ChatRoom.objects.create(
                    room_type=ChatRoom.ROOM_GROUP,
                    name=event.name[:80],
                    created_by=me,
                )
                ChatRoomMember.objects.create(room=room, user=me, is_admin=True)
                event.chat_room = room
                event.save(update_fields=['chat_room'])

            if invite_user_ids:
                EventInvite.objects.bulk_create([
                    EventInvite(event=event, invitee_id=uid) for uid in invite_user_ids
                ])

            if source_room:
                loc = data.get('location', '') or ''
                Message.objects.create(
                    room=source_room,
                    sender=me,
                    content=event.name,
                    message_type=Message.MSG_EVENT_CARD,
                    metadata={
                        'event_id': event.id,
                        'name': event.name,
                        'date': str(event.date),
                        'start_time': str(event.start_time),
                        'end_time': str(event.end_time),
                        'location': loc,
                        'creator_username': me.username,
                    },
                )

        event = Event.objects.select_related('creator').prefetch_related('invites__invitee').get(pk=event.pk)
        return Response(
            EventSerializer(event, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class EventDetailView(APIView):
    """GET    /api/events/<pk>/ — event detail, visibility-gated.
       PATCH  /api/events/<pk>/ — edit (creator only).
       DELETE /api/events/<pk>/ — delete (creator only)."""
    permission_classes = [permissions.IsAuthenticated]

    def _get_visible(self, request, pk):
        me = request.user
        try:
            evt = Event.objects.select_related('creator').prefetch_related('invites__invitee').get(pk=pk)
        except Event.DoesNotExist:
            return None, Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)

        if evt.creator_id == me.id:
            return evt, None

        # Anyone with an invite row (PENDING/ACCEPTED/DECLINED) can read full
        # detail — they need it to decide. Non-invitees only see PUBLIC events
        # in detail; PRIVATE events surface as a redacted busy-block on the
        # list view only and aren't reachable here.
        if EventInvite.objects.filter(event=evt, invitee=me).exists():
            return evt, None

        # `_visible_friend_ids` excludes blocked friends so a blocked friend's
        # PUBLIC event isn't reachable by direct ID lookup.
        if evt.visibility == Event.VISIBILITY_PUBLIC and evt.creator_id in _visible_friend_ids(me):
            return evt, None

        return None, Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)

    def get(self, request, pk):
        evt, err = self._get_visible(request, pk)
        if err:
            return err
        return Response(EventSerializer(evt, context={'request': request}).data)

    def patch(self, request, pk):
        me = request.user
        try:
            evt = Event.objects.get(pk=pk)
        except Event.DoesNotExist:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
        if evt.creator_id != me.id:
            return Response({"detail": "creator only"}, status=status.HTTP_403_FORBIDDEN)

        # Reuse the create serializer's validators for field-level rules; only
        # mutate the fields actually present in the request body.
        partial_data = {**EventSerializer(evt).data, **request.data}
        partial_data['invite_user_ids'] = []  # not editable via this endpoint
        s = EventCreateSerializer(data=partial_data, context={'request': request})
        s.is_valid(raise_exception=True)
        data = s.validated_data
        data.pop('invite_user_ids', None)

        # Re-check overlap if the schedule fields changed. Pass the event's pk
        # so we don't conflict with our own row. Accepted invitees' schedules
        # are re-validated because the new time may invalidate their commitment.
        schedule_changed = any(
            getattr(evt, f) != data[f]
            for f in ('date', 'start_time', 'end_time', 'is_repeating', 'repeat_days')
            if f in data
        )
        creator_conflicts = []
        if schedule_changed:
            accepted_ids = list(
                EventInvite.objects.filter(event=evt, status=EventInvite.STATUS_ACCEPTED)
                .values_list('invitee_id', flat=True)
            )
            conflicts = _collect_event_conflicts(me, accepted_ids, data, ignore_event_id=evt.pk)
            creator_conflicts = [c for c in conflicts if c['user_id'] == me.id]
            invitee_conflicts = [c for c in conflicts if c['user_id'] != me.id]

            creator_resolution = request.data.get('conflict_resolution')
            proceed_invitee = bool(request.data.get('proceed_invitee_conflicts', False))
            needs_creator_decision = bool(creator_conflicts) and creator_resolution not in (
                EventInvite.SKIP_SKIP, EventInvite.SKIP_KEEP_BOTH,
            )
            needs_invitee_ack = bool(invitee_conflicts) and not proceed_invitee
            if needs_creator_decision or needs_invitee_ack:
                return Response(
                    {
                        "error": "overlap",
                        "conflicts": conflicts,
                        "creator_conflicts": creator_conflicts,
                        "invitee_conflicts": invitee_conflicts,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        for field, value in data.items():
            setattr(evt, field, value)
        evt.save()

        # The event moved; any prior skips for it are stale (wrong dates). Clear
        # and re-create the creator's skips if they chose to skip again.
        if schedule_changed:
            CourseSkip.objects.filter(user=me, event=evt).delete()
            EventOccurrenceSkip.objects.filter(user=me, attending_event=evt).delete()
            if creator_conflicts and request.data.get('conflict_resolution') == EventInvite.SKIP_SKIP:
                target_days = _target_event_days(
                    data['date'], data.get('is_repeating', False), data.get('repeat_days', '')
                )
                target_date = data['date'] if not data.get('is_repeating', False) else None
                _apply_skips(me, creator_conflicts, evt, target_days, target_date)
        evt = Event.objects.select_related('creator').prefetch_related('invites__invitee').get(pk=evt.pk)
        return Response(EventSerializer(evt, context={'request': request}).data)

    def delete(self, request, pk):
        me = request.user
        try:
            evt = Event.objects.get(pk=pk)
        except Event.DoesNotExist:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
        if evt.creator_id != me.id:
            return Response({"detail": "creator only"}, status=status.HTTP_403_FORBIDDEN)
        evt.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EventInviteRespondView(APIView):
    """PATCH /api/events/invites/<pk>/ — accept or decline.

    Two flows share this endpoint:
      • Normal invite (PENDING): the **invitee** responds. Accept adds them to
        the event's chat_room if one exists.
      • Join request (REQUESTED): the event **creator** responds. Accept flips
        the row to ACCEPTED and adds the requester to chat_room; decline flips
        to DECLINED.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        me = request.user
        try:
            invite = EventInvite.objects.select_related('event', 'event__creator', 'invitee').get(pk=pk)
        except EventInvite.DoesNotExist:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get('action')
        if action not in ('accept', 'decline'):
            return Response(
                {"detail": "action must be 'accept' or 'decline'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        evt = invite.event
        # Determine who is allowed to act, based on the row's current status.
        # is_requester_flow distinguishes the two accept paths: a PENDING invitee
        # resolves their OWN clash now; a host accepting a REQUESTED row applies
        # the requester's stored skip_preference on the requester's behalf.
        if invite.status == EventInvite.STATUS_PENDING:
            if invite.invitee_id != me.id:
                return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
            joiner = invite.invitee
            is_requester_flow = False
        elif invite.status == EventInvite.STATUS_REQUESTED:
            if evt.creator_id != me.id:
                return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
            joiner = invite.invitee
            is_requester_flow = True
        else:
            return Response(
                {"detail": "invite already responded"},
                status=status.HTTP_409_CONFLICT,
            )

        target_days = _target_event_days(evt.date, evt.is_repeating, evt.repeat_days)
        target_date = evt.date if not evt.is_repeating else None

        # Compute the joiner's clashes ONCE, before flipping the row to ACCEPTED —
        # afterwards `evt` would count as the joiner's own commitment and match
        # itself. We reuse this list both to gate the accept and to record skips.
        clashes = []
        skip_resolution = None
        if action == 'accept':
            clashes = _conflict_for_user(joiner, target_days, evt.start_time, evt.end_time, target_date)
            # A PENDING invitee resolves their own clash now; the host accepting a
            # REQUESTED row relies on the requester's already-stored preference.
            if not is_requester_flow and clashes:
                skip_resolution = request.data.get('conflict_resolution')
                if skip_resolution not in (EventInvite.SKIP_SKIP, EventInvite.SKIP_KEEP_BOTH):
                    tagged = [{**c, "user_id": joiner.id, "username": joiner.username} for c in clashes]
                    return Response(
                        {"error": "overlap", "conflicts": tagged},
                        status=status.HTTP_409_CONFLICT,
                    )

        with transaction.atomic():
            if action == 'accept':
                invite.status = EventInvite.STATUS_ACCEPTED
                invite.responded_at = timezone.now()
                # For the host-accepts-request flow, honor the requester's stored
                # preference; for the invitee flow, persist their fresh choice.
                if not is_requester_flow and skip_resolution is not None:
                    invite.skip_preference = skip_resolution
                invite.save(update_fields=['status', 'responded_at', 'skip_preference'])

                if evt.chat_room_id is not None:
                    ChatRoomMember.objects.get_or_create(
                        room_id=evt.chat_room_id, user=joiner,
                        defaults={'is_admin': False},
                    )

                # Materialize skips if whoever's joining chose to skip clashes.
                if invite.skip_preference == EventInvite.SKIP_SKIP and clashes:
                    _apply_skips(joiner, clashes, evt, target_days, target_date)
            else:
                invite.status = EventInvite.STATUS_DECLINED
                invite.responded_at = timezone.now()
                invite.save(update_fields=['status', 'responded_at'])

        evt = Event.objects.select_related('creator').prefetch_related('invites__invitee').get(pk=evt.pk)
        return Response(EventSerializer(evt, context={'request': request}).data)


class EventJoinRequestView(APIView):
    """POST /api/events/<pk>/request-join/ — current user asks the host to join
    a PUBLIC event with allow_join_requests=True. Creates an EventInvite row
    with status=REQUESTED that surfaces in the host's notifications.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        me = request.user
        try:
            evt = Event.objects.select_related('creator').get(pk=pk)
        except Event.DoesNotExist:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)

        if evt.creator_id == me.id:
            return Response({"detail": "creator cannot request to join"}, status=status.HTTP_400_BAD_REQUEST)
        if evt.visibility != Event.VISIBILITY_PUBLIC or not evt.allow_join_requests:
            return Response({"detail": "join requests not allowed"}, status=status.HTTP_403_FORBIDDEN)
        # `_visible_friend_ids` treats blocked friends as not-friends so a
        # block in either direction also closes off join requests.
        if evt.creator_id not in _visible_friend_ids(me):
            return Response({"detail": "not_friends"}, status=status.HTTP_403_FORBIDDEN)

        existing = EventInvite.objects.filter(event=evt, invitee=me).first()
        if existing:
            return Response(
                {"detail": "already_invited", "status": existing.status},
                status=status.HTTP_409_CONFLICT,
            )

        # Schedule clash check. Unlike a firm commitment, a join request isn't
        # binding yet, so a clash doesn't refuse — instead the requester states
        # how they'd handle it (skip / keep both) and we stash that preference.
        # It's applied as skip records only if the host later accepts.
        my_conflicts = _conflict_for_user(
            me,
            _target_event_days(evt.date, evt.is_repeating, evt.repeat_days),
            evt.start_time, evt.end_time,
            evt.date if not evt.is_repeating else None,
        )
        resolution = request.data.get('conflict_resolution')
        if my_conflicts and resolution not in (EventInvite.SKIP_SKIP, EventInvite.SKIP_KEEP_BOTH):
            tagged = [{**c, "user_id": me.id, "username": me.username} for c in my_conflicts]
            return Response(
                {"error": "overlap", "conflicts": tagged},
                status=status.HTTP_409_CONFLICT,
            )

        skip_pref = resolution if (my_conflicts and resolution in (
            EventInvite.SKIP_SKIP, EventInvite.SKIP_KEEP_BOTH)) else EventInvite.SKIP_NONE
        EventInvite.objects.create(
            event=evt, invitee=me, status=EventInvite.STATUS_REQUESTED, skip_preference=skip_pref,
        )
        evt = Event.objects.select_related('creator').prefetch_related('invites__invitee').get(pk=evt.pk)
        return Response(
            EventSerializer(evt, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class EventRSVPView(APIView):
    """POST /api/events/<pk>/rsvp/ — accept or decline from an event card in chat.
    Finds the current user's PENDING invite and responds. Returns the updated
    event payload so the card can refresh its button state."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        me = request.user
        new_status = request.data.get('status', '')
        if new_status not in (EventInvite.STATUS_ACCEPTED, EventInvite.STATUS_DECLINED):
            return Response({"detail": "status must be 'ACCEPTED' or 'DECLINED'"}, status=status.HTTP_400_BAD_REQUEST)

        invite = EventInvite.objects.select_related('event', 'event__creator').filter(
            event_id=pk, invitee=me,
            status__in=[EventInvite.STATUS_PENDING, EventInvite.STATUS_ACCEPTED, EventInvite.STATUS_DECLINED],
        ).first()
        if not invite:
            return Response({"detail": "no invite found"}, status=status.HTTP_404_NOT_FOUND)

        if invite.status == new_status:
            return Response({"status": new_status})

        invite.status = new_status
        invite.responded_at = timezone.now()
        invite.save(update_fields=['status', 'responded_at'])

        if new_status == EventInvite.STATUS_ACCEPTED and invite.event.chat_room_id:
            ChatRoomMember.objects.get_or_create(
                room_id=invite.event.chat_room_id, user=me,
                defaults={'is_admin': False},
            )

        return Response({"status": new_status})


class ScheduleSkipView(APIView):
    """GET /api/schedule-skips/?week=YYYY-MM-DD — the requesting user's skip
    records (courses + events they chose to skip in favor of an event) whose
    date falls in the 7-day window starting at `week`. The schedule renderer
    uses these to hide the corresponding blocks for that week."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        me = request.user
        today = timezone.localdate()
        week_start = _parse_iso_date(request.query_params.get('week'), _week_start_for(today))
        if week_start is None:
            return Response({"detail": "week must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)
        week_end = week_start + timedelta(days=7)

        course_skips = (
            CourseSkip.objects
            .filter(user=me, date__gte=week_start, date__lt=week_end)
            .select_related('course')
        )
        event_skips = (
            EventOccurrenceSkip.objects
            .filter(user=me, date__gte=week_start, date__lt=week_end)
        )
        return Response({
            "course_skips": [
                {"course": s.course_id, "course_code": s.course.course_id, "date": s.date.isoformat()}
                for s in course_skips
            ],
            "event_skips": [
                {"event": s.skipped_event_id, "date": s.date.isoformat()}
                for s in event_skips
            ],
        })


class BlogPostListView(generics.ListAPIView):
    """GET /api/blog/ — published posts, newest first. Public, no auth."""
    serializer_class = BlogPostListSerializer
    permission_classes = [permissions.AllowAny]
    queryset = BlogPost.objects.filter(is_published=True)


class BlogPostDetailView(generics.RetrieveAPIView):
    """GET /api/blog/<slug>/ — a single published post. Public, no auth."""
    serializer_class = BlogPostDetailSerializer
    permission_classes = [permissions.AllowAny]
    queryset = BlogPost.objects.filter(is_published=True)
    lookup_field = 'slug'
