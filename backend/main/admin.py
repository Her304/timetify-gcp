from datetime import timedelta

from django.contrib import admin
from django.contrib.admin import AdminSite
from django.contrib.auth.admin import GroupAdmin
from django.contrib.auth.models import Group
from django.db.models import Count
from django.db.models.functions import TruncDate, TruncMonth
from django.http import JsonResponse, HttpResponseBadRequest, HttpResponsePermanentRedirect, Http404
from django.urls import path, resolve, Resolver404
from django.utils import timezone

from .models import (
    CustomUser, Course, Week, Exam, Assignment, Friend, BackendLog, ErrorReport,
    Snap, SnapAudience, ChatRoom, ChatRoomMember, Message,
    Report, AiReport, SimilarityCheck, Appeal, FunctionRestriction, UserBlock,
)
from .moderation_pipeline import admin_remove, admin_dismiss


class TimetifyAdminSite(AdminSite):
    site_header = "Timetify Admin"
    site_title = "Timetify Admin Portal"
    index_title = "Dashboard"
    index_template = "admin/index.html"
    login_template = "admin/timetify_login.html"

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                "users/growth.json",
                self.admin_view(self.user_growth_json),
                name="user_growth_json",
            ),
        ]
        return custom + urls

    def catch_all_view(self, request, url):
        """Redirect no-slash admin paths to their trailing-slash form.

        Why: the project sets APPEND_SLASH=False globally (for SPA API parity), which
        disables the default redirect inside Django's admin catch_all_view. Without
        this override, hitting /admin/login (no slash) would silently 404 after login.
        """
        if not url.endswith("/"):
            urlconf = getattr(request, "urlconf", None)
            try:
                match = resolve(f"{request.path_info}/", urlconf)
            except Resolver404:
                pass
            else:
                if getattr(match.func, "should_append_slash", True):
                    target = f"{request.path}/"
                    if request.META.get("QUERY_STRING"):
                        target = f"{target}?{request.META['QUERY_STRING']}"
                    return HttpResponsePermanentRedirect(target)
        raise Http404

    def index(self, request, extra_context=None):
        now = timezone.now()
        day_ago = now - timedelta(hours=24)

        total_users = CustomUser.objects.count()
        total_courses = Course.objects.count()
        active_snaps = Snap.objects.filter(is_removed=False, expires_at__gt=now).count()
        snaps_24h = Snap.objects.filter(created_at__gte=day_ago).count()

        recent_users = CustomUser.objects.order_by("-date_joined")[:5]
        recent_snaps = (
            Snap.objects.select_related("uploader", "course")
            .order_by("-created_at")[:5]
        )

        context = {
            "kpis": {
                "total_users": total_users,
                "total_courses": total_courses,
                "active_snaps": active_snaps,
                "snaps_24h": snaps_24h,
            },
            "recent_users": recent_users,
            "recent_snaps": recent_snaps,
        }
        if extra_context:
            context.update(extra_context)
        return super().index(request, extra_context=context)

    def user_growth_json(self, request):
        range_key = request.GET.get("range", "month")
        now = timezone.now()

        if range_key == "week":
            start = now - timedelta(days=6)
            qs = (
                CustomUser.objects.filter(date_joined__date__gte=start.date())
                .annotate(bucket=TruncDate("date_joined"))
                .values("bucket")
                .annotate(c=Count("id"))
                .order_by("bucket")
            )
            by_bucket = {row["bucket"]: row["c"] for row in qs}
            baseline = CustomUser.objects.filter(date_joined__date__lt=start.date()).count()
            labels, values = [], []
            running = baseline
            for i in range(7):
                d = (start + timedelta(days=i)).date()
                running += by_bucket.get(d, 0)
                labels.append(d.strftime("%b %-d"))
                values.append(running)
            return JsonResponse({"labels": labels, "values": values})

        if range_key == "month":
            start = now - timedelta(days=29)
            qs = (
                CustomUser.objects.filter(date_joined__date__gte=start.date())
                .annotate(bucket=TruncDate("date_joined"))
                .values("bucket")
                .annotate(c=Count("id"))
                .order_by("bucket")
            )
            by_bucket = {row["bucket"]: row["c"] for row in qs}
            baseline = CustomUser.objects.filter(date_joined__date__lt=start.date()).count()
            labels, values = [], []
            running = baseline
            for i in range(30):
                d = (start + timedelta(days=i)).date()
                running += by_bucket.get(d, 0)
                labels.append(d.strftime("%b %-d"))
                values.append(running)
            return JsonResponse({"labels": labels, "values": values})

        if range_key == "all":
            first = CustomUser.objects.order_by("date_joined").values_list("date_joined", flat=True).first()
            if not first:
                return JsonResponse({"labels": [], "values": []})
            qs = (
                CustomUser.objects.annotate(bucket=TruncMonth("date_joined"))
                .values("bucket")
                .annotate(c=Count("id"))
                .order_by("bucket")
            )
            labels, values = [], []
            running = 0
            for row in qs:
                running += row["c"]
                labels.append(row["bucket"].strftime("%b %Y"))
                values.append(running)
            return JsonResponse({"labels": labels, "values": values})

        return HttpResponseBadRequest("invalid range")


site = TimetifyAdminSite(name="admin")
site.register(Group, GroupAdmin)


@admin.register(CustomUser, site=site)
class CustomUserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'university', 'major', 'grad_year', 'date_joined')
    search_fields = ('username', 'email', 'university')
    ordering = ('-date_joined',)


@admin.register(Course, site=site)
class CourseAdmin(admin.ModelAdmin):
    list_display = ('course_id', 'course_name', 'user', 'start_time', 'end_time')
    list_filter = ('user', 'is_lab')
    search_fields = ('course_id', 'course_name')


@admin.register(Week, site=site)
class WeekAdmin(admin.ModelAdmin):
    list_display = ('course', 'week_number', 'week_date', 'is_completed')
    list_filter = ('course', 'is_completed')


@admin.register(Exam, site=site)
class ExamAdmin(admin.ModelAdmin):
    list_display = ('exam_topic', 'course', 'exam_date', 'user', 'is_completed')
    list_filter = ('course', 'is_completed')


@admin.register(Assignment, site=site)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ('assignment_topic', 'course', 'assignment_due', 'user', 'is_completed')
    list_filter = ('course', 'is_completed')


@admin.register(Friend, site=site)
class FriendAdmin(admin.ModelAdmin):
    list_display = ('user', 'friend', 'status')
    list_filter = ('status',)


@admin.register(BackendLog, site=site)
class BackendLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'level', 'user', 'message')
    list_filter = ('level', 'user')
    ordering = ('-timestamp',)


@admin.register(ErrorReport, site=site)
class ErrorReportAdmin(admin.ModelAdmin):
    list_display = ('user', 'created_at')
    list_filter = ('user',)
    ordering = ('-created_at',)


@admin.register(Snap, site=site)
class SnapAdmin(admin.ModelAdmin):
    list_display = ('id', 'uploader', 'course', 'media_type', 'visibility', 'is_removed', 'created_at', 'expires_at')
    list_filter = ('media_type', 'visibility', 'is_removed')
    search_fields = ('uploader__username', 'course__course_id')
    readonly_fields = ('created_at',)


@admin.register(SnapAudience, site=site)
class SnapAudienceAdmin(admin.ModelAdmin):
    list_display = ('snap', 'viewer', 'has_viewed', 'viewed_at')
    list_filter = ('has_viewed',)
    search_fields = ('viewer__username',)


class ChatRoomMemberInline(admin.TabularInline):
    model = ChatRoomMember
    extra = 0
    readonly_fields = ('joined_at',)


@admin.register(ChatRoom, site=site)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ('id', 'room_type', 'name', 'created_by', 'is_active', 'created_at')
    list_filter = ('room_type', 'is_active')
    search_fields = ('name', 'created_by__username')
    readonly_fields = ('created_at',)
    inlines = [ChatRoomMemberInline]


@admin.register(ChatRoomMember, site=site)
class ChatRoomMemberAdmin(admin.ModelAdmin):
    list_display = ('id', 'room', 'user', 'is_admin', 'last_read_at', 'joined_at')
    list_filter = ('is_admin',)
    search_fields = ('user__username',)


@admin.register(Message, site=site)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'room', 'sender', 'preview', 'is_removed', 'created_at')
    list_filter = ('is_removed',)
    search_fields = ('sender__username', 'content')
    readonly_fields = ('created_at',)

    def preview(self, obj):
        return (obj.content or '')[:60]
    preview.short_description = 'content'


# --- Moderation admin --------------------------------------------------------

class AiReportInline(admin.TabularInline):
    model = AiReport
    extra = 0
    can_delete = False
    fields = ('version', 'provider', 'recommended_action', 'violation_likelihood', 'report_document', 'generated_at')
    readonly_fields = fields
    ordering = ('version',)


class SimilarityCheckInline(admin.StackedInline):
    model = SimilarityCheck
    extra = 0
    can_delete = False
    fields = ('similarity_score', 'provider', 'ai_report_v1', 'ai_report_v2', 'checked_at')
    readonly_fields = fields


class AppealInline(admin.StackedInline):
    model = Appeal
    extra = 0
    can_delete = False
    fields = ('reported_user', 'reason', 'status', 'created_at')
    readonly_fields = ('reported_user', 'created_at')


@admin.register(Report, site=site)
class ReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'reporter', 'reported_user', 'content_type', 'status', 'appeal_deadline', 'created_at')
    list_filter = ('status', 'content_type', 'created_at')
    search_fields = ('reporter__username', 'reported_user__username', 'free_text')
    readonly_fields = (
        'reporter', 'reported_user', 'content_type',
        'snap', 'chat_message', 'template_reasons', 'free_text',
        'created_at', 'updated_at',
    )
    inlines = [AiReportInline, SimilarityCheckInline, AppealInline]
    actions = ['action_remove_content', 'action_dismiss_report']

    def action_remove_content(self, request, queryset):
        # Reuses the same pipeline as POST /api/admin/reports/<id>/act/ so the
        # restriction ladder + emails stay consistent across surfaces.
        for r in queryset:
            admin_remove(r)
        self.message_user(request, f"Removed content for {queryset.count()} report(s).")
    action_remove_content.short_description = "Remove reported content + restrict user"

    def action_dismiss_report(self, request, queryset):
        for r in queryset:
            admin_dismiss(r)
        self.message_user(request, f"Dismissed {queryset.count()} report(s).")
    action_dismiss_report.short_description = "Dismiss report (no action)"


@admin.register(AiReport, site=site)
class AiReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'report', 'version', 'provider', 'recommended_action', 'violation_likelihood', 'generated_at')
    list_filter = ('version', 'recommended_action', 'provider')
    readonly_fields = ('report', 'version', 'provider', 'raw_response', 'report_document',
                       'violation_likelihood', 'violation_categories', 'recommended_action', 'generated_at')


@admin.register(SimilarityCheck, site=site)
class SimilarityCheckAdmin(admin.ModelAdmin):
    list_display = ('id', 'report', 'similarity_score', 'provider', 'checked_at')
    readonly_fields = ('report', 'ai_report_v1', 'ai_report_v2', 'similarity_score', 'provider', 'raw_response', 'checked_at')


@admin.register(Appeal, site=site)
class AppealAdmin(admin.ModelAdmin):
    list_display = ('id', 'report', 'reported_user', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('reported_user__username',)
    readonly_fields = ('report', 'reported_user', 'reason', 'created_at')


@admin.register(FunctionRestriction, site=site)
class FunctionRestrictionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'restriction_type', 'offense_count', 'expires_at', 'is_active', 'created_at')
    list_filter = ('restriction_type', 'is_active', 'offense_count')
    search_fields = ('user__username',)
    actions = ['action_lift_restriction']

    def action_lift_restriction(self, request, queryset):
        count = queryset.update(is_active=False)
        self.message_user(request, f"Lifted {count} restriction(s).")
    action_lift_restriction.short_description = "Lift selected restrictions"


@admin.register(UserBlock, site=site)
class UserBlockAdmin(admin.ModelAdmin):
    list_display = ('id', 'blocker', 'blocked', 'reason', 'created_at')
    list_filter = ('reason', 'created_at')
    search_fields = ('blocker__username', 'blocked__username')
