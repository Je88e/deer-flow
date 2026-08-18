"""Constants shared by session and CSRF cookie handling."""

SESSION_COOKIE_ISSUED_STATE_ATTR = "deerflow_session_cookie_issued"
SESSION_COOKIE_MAX_AGE_STATE_ATTR = "deerflow_session_cookie_max_age"
SESSION_COOKIE_SECURE_STATE_ATTR = "deerflow_session_cookie_secure"
SKIP_AUTH_CSRF_COOKIE_STATE_ATTR = "deerflow_skip_auth_csrf_cookie"

# Static Path scope for the Gateway auth cookie family (access_token,
# csrf_token, session-persistence marker). Fixed to the WIT Shell iframe base
# path so the embedded and standalone deployments share one URL space and one
# cookie namespace (docs/dev/deerflow-shell-integration-plan.md §6.3).
# Deliberately static — no runtime per-request EMBED detection branch.
AUTH_COOKIE_PATH = "/leadagent"
