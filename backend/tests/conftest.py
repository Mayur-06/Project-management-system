import pytest
import jwt
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.dependencies import get_current_user, get_admin_db
from app.core.security import AuthenticatedUser

# Set environment to test
settings.ENVIRONMENT = "test"

MOCK_USER_ID = "00000000-0000-0000-0000-000000000001"
MOCK_ORG_ID = "11111111-1111-1111-1111-111111111111"
MOCK_TEAM_ID = "22222222-2222-2222-2222-222222222222"
MOCK_STATE_ID_1 = "33333333-3333-3333-3333-333333333331"
MOCK_STATE_ID_2 = "33333333-3333-3333-3333-333333333332"


@pytest.fixture
def mock_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=MOCK_USER_ID,
        email="testuser@example.com",
        role="authenticated",
        raw_token="fake.mock.token",
        user_metadata={"full_name": "Test User"},
    )


@pytest.fixture
def auth_headers() -> dict:
    # Generate test token
    payload = {
        "sub": MOCK_USER_ID,
        "email": "testuser@example.com",
        "role": "authenticated",
        "aud": "authenticated",
    }
    token = jwt.encode(payload, "dummy-secret-key-for-tests-12345678", algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_db():
    db = MagicMock()
    return db


@pytest.fixture
def client(mock_user, mock_db) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_admin_db] = lambda: mock_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
