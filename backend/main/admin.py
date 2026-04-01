from django.contrib import admin
from .models import CustomUser, Course, Week, Exam, Assignment, Friend, BackendLog, ErrorReport

# Register your models here.

@admin.register(CustomUser)
class CustomUserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'university', 'major', 'grad_year')
    search_fields = ('username', 'email', 'university')

@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ('course_id', 'course_name', 'user', 'start_time', 'end_time')
    list_filter = ('user', 'is_lab')
    search_fields = ('course_id', 'course_name')

@admin.register(Week)
class WeekAdmin(admin.ModelAdmin):
    list_display = ('course', 'week_number', 'week_date', 'is_completed')
    list_filter = ('course', 'is_completed')

@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ('exam_topic', 'course', 'exam_date', 'user', 'is_completed')
    list_filter = ('course', 'is_completed')

@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ('assignment_topic', 'course', 'assignment_due', 'user', 'is_completed')
    list_filter = ('course', 'is_completed')

@admin.register(Friend)
class FriendAdmin(admin.ModelAdmin):
    list_display = ('user', 'friend', 'status')
    list_filter = ('status',)

@admin.register(BackendLog)
class BackendLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'level', 'user', 'message')
    list_filter = ('level', 'user')
    ordering = ('-timestamp',)

@admin.register(ErrorReport)
class ErrorReportAdmin(admin.ModelAdmin):
    list_display = ('user', 'created_at')
    list_filter = ('user',)
    ordering = ('-created_at',)
