from unittest.mock import MagicMock
from fastapi import status
from supabase_auth.errors import AuthApiError


def test_signin_success(client, mock_db):
    """Verify /auth/signin returns user info and session tokens on successful credentials."""
    mock_user = MagicMock()
    mock_user.id = "user-1234-uuid"
    mock_user.email = "test@example.com"
    mock_user.user_metadata = {"full_name": "Test Tester"}

    mock_session = MagicMock()
    mock_session.access_token = "access-token-xyz"
    mock_session.refresh_token = "refresh-token-abc"
    mock_session.token_type = "bearer"
    mock_session.expires_in = 3600
    mock_session.expires_at = 1700003600

    mock_auth_res = MagicMock()
    mock_auth_res.user = mock_user
    mock_auth_res.session = mock_session

    mock_db.auth.sign_in_with_password.return_value = mock_auth_res

    res = client.post(
        "/api/v1/auth/signin",
        json={"email": "test@example.com", "password": "password123"},
    )

    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["user"]["id"] == "user-1234-uuid"
    assert data["user"]["email"] == "test@example.com"
    assert data["user"]["user_metadata"]["full_name"] == "Test Tester"
    assert data["session"]["access_token"] == "access-token-xyz"
    assert data["session"]["refresh_token"] == "refresh-token-abc"
    assert data["session"]["token_type"] == "bearer"


def test_signin_invalid_credentials_returns_401(client, mock_db):
    """Verify /auth/signin returns HTTP 401 with sanitized message for invalid credentials."""
    mock_db.auth.sign_in_with_password.side_effect = AuthApiError(
        message="Invalid login credentials",
        status=400,
        code="invalid_credentials",
    )

    res = client.post(
        "/api/v1/auth/signin",
        json={"email": "wrong@example.com", "password": "incorrect_password"},
    )

    assert res.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Invalid email or password" in res.json()["detail"]


def test_signin_email_not_confirmed_returns_401(client, mock_db):
    """Verify /auth/signin returns HTTP 401 informing the user to check verification email."""
    mock_db.auth.sign_in_with_password.side_effect = AuthApiError(
        message="Email not confirmed",
        status=400,
        code="email_not_confirmed",
    )

    res = client.post(
        "/api/v1/auth/signin",
        json={"email": "unconfirmed@example.com", "password": "password123"},
    )

    assert res.status_code == status.HTTP_401_UNAUTHORIZED
    assert "not verified yet" in res.json()["detail"]


def test_signin_invalid_email_format_returns_422(client):
    """Verify /auth/signin rejects invalid email schemas with 422."""
    res = client.post(
        "/api/v1/auth/signin",
        json={"email": "not-a-valid-email", "password": "some_password"},
    )
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
