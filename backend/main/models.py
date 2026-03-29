from django.db import models
from django.contrib.auth.models import AbstractUser

class CustomUser(AbstractUser):
    university = models.CharField(max_length=100, blank=False)
    major = models.CharField(max_length=30, blank=False)
    grad_year = models.PositiveIntegerField()
    email = models.EmailField(blank=False, unique=True)
    temp_password = models.CharField(max_length=128, null=True, blank=True)
    is_temp_password = models.BooleanField(default=False)

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