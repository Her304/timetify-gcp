from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('api/register/', views.RegisterView.as_view(), name='register'),
    path('api/login/', views.LoginView.as_view(), name='login'),
    path('api/courses/', views.CourseListCreateView.as_view(), name='course-list'),
    path('api/courses/<int:pk>/', views.CourseDetailView.as_view(), name='course-detail'),
    path('api/weeks/', views.WeekListCreateView.as_view(), name='week-list'),
    path('api/weeks/<int:pk>/', views.WeekDetailView.as_view(), name='week-detail'),
    path('api/exams/', views.ExamListCreateView.as_view(), name='exam-list'),
    path('api/exams/<int:pk>/', views.ExamDetailView.as_view(), name='exam-detail'),
    path('api/assignments/', views.AssignmentListCreateView.as_view(), name='assignment-list'),
    path('api/assignments/<int:pk>/', views.AssignmentDetailView.as_view(), name='assignment-detail'),
    path('api/friend-requests/', views.FriendRequestView.as_view(), name='friend-request-create'),
    path('api/friend-requests/pending/', views.FriendRequestListView.as_view(), name='friend-requests-pending'),
    path('api/friend-requests/<int:pk>/', views.FriendRequestUpdateView.as_view(), name='friend-request-update'),
    path('api/friends/', views.FriendListView.as_view(), name='friends-list'),
    path('api/friends/search/', views.SearchFriend.as_view(), name='search-friend'), 
    path('api/user/', views.get_user, name='user'), 
    path('api/test-email/', views.TestEmailView.as_view(), name='test-email'),
    path('api/forgot-password/', views.ForgotPasswordView.as_view(), name='forgot-password'),
    path('api/reset-password/', views.ResetPasswordView.as_view(), name='reset-password'),
    path('api/report-error/', views.ErrorReportView.as_view(), name='report-error'),
]