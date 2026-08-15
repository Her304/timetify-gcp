from django.urls import path
from . import views
from .mcp import oauth as mcp_oauth
from .mcp.views import McpEndpointView

urlpatterns = [
    path('', views.home, name='home'),
    # OAuth 2.1 for MCP clients that sign in rather than paste a token
    # (claude.ai, ChatGPT). Discovery paths are spec-fixed — they must sit at
    # the root of the same origin the client reached the resource on, which is
    # why nginx proxies them from the canonical domain.
    path('.well-known/oauth-protected-resource', mcp_oauth.protected_resource_metadata),
    path('.well-known/oauth-protected-resource/mcp/v1', mcp_oauth.protected_resource_metadata),
    path('.well-known/oauth-authorization-server', mcp_oauth.authorization_server_metadata),
    path('oauth/register', mcp_oauth.register, name='oauth-register'),
    path('oauth/authorize', mcp_oauth.authorize, name='oauth-authorize'),
    path('oauth/token', mcp_oauth.token, name='oauth-token'),
    path('oauth/revoke', mcp_oauth.revoke, name='oauth-revoke'),
    # AI-agent bridge (MCP). Registered under both spellings because the project
    # sets APPEND_SLASH=False, so the slashless form would otherwise hard-404
    # with no redirect for anyone who typed the URL by hand.
    path('mcp/v1/', McpEndpointView.as_view(), name='mcp-endpoint'),
    path('mcp/v1', McpEndpointView.as_view()),
    path('api/agent-tokens/', views.AgentTokenListCreateView.as_view(), name='agent-token-list-create'),
    path('api/agent-tokens/<int:pk>/', views.AgentTokenRevokeView.as_view(), name='agent-token-revoke'),
    # Connected apps (the OAuth half). client_id is the natural key here: the
    # user is disconnecting an app, not one of its rotating tokens.
    path('api/agent-connections/', views.AgentConnectionListView.as_view(), name='agent-connection-list'),
    path('api/agent-connections/<str:client_id>/', views.AgentConnectionRevokeView.as_view(), name='agent-connection-revoke'),
    path('api/register/', views.RegisterView.as_view(), name='register'),
    path('api/register/check/', views.RegistrationAvailabilityView.as_view(), name='register-check'),
    path('api/login/', views.LoginView.as_view(), name='login'),
    path('api/password-reset/', views.PasswordResetRequestView.as_view(), name='password-reset-request'),
    path('api/password-reset/confirm/<str:uidb64>/<str:token>/', views.PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
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
    path('api/friends/<int:pk>/', views.FriendDeleteView.as_view(), name='friend-delete'),
    path('api/invite/qr/', views.InviteQRView.as_view(), name='invite-qr'),
    path('api/invite/<str:code>/', views.InviteInfoView.as_view(), name='invite-info'),
    path('api/invite/<str:code>/accept/', views.InviteAcceptView.as_view(), name='invite-accept'),
    path('api/user/', views.get_user, name='user'),
    path('api/user/change-email/', views.ChangeEmailRequestView.as_view(), name='user-change-email'),
    path('verify-email/<str:token>/', views.verify_email_change, name='verify-email-change'),
    path('api/test-email/', views.TestEmailView.as_view(), name='test-email'),
    path('api/report-error/', views.ErrorReportView.as_view(), name='report-error'),
    path('api/courses/analyze/', views.CourseAnalyzeView.as_view(), name='course-analyze'),
    path('api/courses/finalize/', views.CourseFinalizeView.as_view(), name='course-finalize'),
    path('api/snaps/', views.SnapUploadView.as_view(), name='snap-upload'),
    path('api/snaps/feed/', views.SnapFeedView.as_view(), name='snap-feed'),
    path('api/snaps/<int:pk>/view/', views.SnapViewView.as_view(), name='snap-view'),
    path('api/snaps/<int:pk>/', views.SnapDeleteView.as_view(), name='snap-delete'),
    path('api/notifications/', views.NotificationsView.as_view(), name='notifications'),
    path('api/notifications/preferences/', views.NotificationPreferenceView.as_view(), name='noti-prefs'),
    path('api/snap-groups/', views.SnapGroupListCreateView.as_view(), name='snap-group-list'),
    path('api/snap-groups/<int:pk>/', views.SnapGroupDetailView.as_view(), name='snap-group-detail'),
    path('api/snap-groups/<int:pk>/members/', views.SnapGroupMemberAddView.as_view(), name='snap-group-add-member'),
    path('api/snap-groups/<int:pk>/members/<int:user_id>/', views.SnapGroupMemberRemoveView.as_view(), name='snap-group-remove-member'),
    path('api/chats/', views.ChatListCreateView.as_view(), name='chat-list-create'),
    path('api/chats/unread/', views.UnreadCountView.as_view(), name='chat-unread'),
    path('api/chats/groups/', views.GroupChatListCreateView.as_view(), name='group-chat-create'),
    path('api/chats/groups/<int:pk>/', views.GroupChatDetailView.as_view(), name='group-chat-detail'),
    path('api/chats/groups/<int:pk>/members/', views.GroupChatMemberAddView.as_view(), name='group-chat-add-member'),
    path('api/chats/groups/<int:pk>/members/<int:user_id>/', views.GroupChatMemberRemoveView.as_view(), name='group-chat-remove-member'),
    path('api/chats/<int:pk>/', views.ChatDetailView.as_view(), name='chat-detail'),
    path('api/chats/<int:pk>/read/', views.ChatReadView.as_view(), name='chat-read'),
    path('api/chats/<int:pk>/messages/', views.MessageListCreateView.as_view(), name='chat-messages'),
    path('api/chats/<int:pk>/messages/<int:msg_id>/', views.MessageDeleteView.as_view(), name='chat-message-delete'),
    # Moderation: user-facing
    path('api/reports/', views.ReportCreateView.as_view(), name='report-create'),
    path('api/reports/my/', views.ReportMyListView.as_view(), name='reports-my'),
    path('api/reports/received/', views.ReportReceivedListView.as_view(), name='reports-received'),
    path('api/appeals/', views.AppealCreateView.as_view(), name='appeal-create'),
    path('api/appeals/my/', views.AppealMyListView.as_view(), name='appeals-my'),
    path('api/blocks/', views.BlockListView.as_view(), name='blocks-list'),
    path('api/blocks/<int:pk>/', views.BlockDeleteView.as_view(), name='block-delete'),
    path('api/restrictions/my/', views.MyRestrictionsView.as_view(), name='restrictions-my'),
    # Availability & study coordination
    path('api/availability/me/', views.AvailabilityMeView.as_view(), name='availability-me'),
    path('api/availability/friends/', views.AvailabilityFriendsView.as_view(), name='availability-friends'),
    path('api/availability/shared-gaps/', views.SharedGapsView.as_view(), name='shared-gaps'),
    path('api/study-invites/', views.StudyInviteView.as_view(), name='study-invite-create'),
    path('api/chats/<int:pk>/messages/<int:msg_id>/invite/', views.StudyInviteRespondView.as_view(), name='study-invite-respond'),
    # Events
    path('api/events/', views.EventListCreateView.as_view(), name='event-list-create'),
    path('api/events/invites/<int:pk>/', views.EventInviteRespondView.as_view(), name='event-invite-respond'),
    path('api/events/<int:pk>/request-join/', views.EventJoinRequestView.as_view(), name='event-request-join'),
    path('api/events/<int:pk>/rsvp/', views.EventRSVPView.as_view(), name='event-rsvp'),
    path('api/schedule-skips/', views.ScheduleSkipView.as_view(), name='schedule-skips'),
    # Blog
    path('api/blog/', views.BlogPostListView.as_view(), name='blog-list'),
    path('api/blog/<slug:slug>/', views.BlogPostDetailView.as_view(), name='blog-detail'),
    path('api/events/<int:pk>/', views.EventDetailView.as_view(), name='event-detail'),
    # Moderation: admin + cron
    path('api/admin/reports/', views.AdminReportListView.as_view(), name='admin-reports'),
    path('api/admin/reports/<int:pk>/act/', views.AdminReportActView.as_view(), name='admin-report-act'),
    path('api/admin/run-moderation/', views.AdminRunModerationView.as_view(), name='admin-run-moderation'),
]