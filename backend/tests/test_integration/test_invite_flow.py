import requests
import uuid
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest
from app.core.database import get_supabase_admin
from app.core.config import settings
from supabase import create_client

BASE_URL = "http://127.0.0.1:8000/api/v1"

@pytest.mark.integration
def test_supabase_invite_flow():
    try:
        health = requests.get("http://127.0.0.1:8000/docs", timeout=2)
    except Exception:
        pytest.skip("Local FastAPI server at http://127.0.0.1:8000 is not reachable; skipping live integration test.")

    admin_db = get_supabase_admin()
    anon_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

    print("=" * 70)
    print("TESTING REAL SUPABASE INVITATION & MEMBER ACCEPT/LOGIN FLOW")
    print("=" * 70)

    # 1. Admin creates a new workspace
    admin_email = f"lead.{uuid.uuid4().hex[:6]}@apexcorp.com"
    admin_pass = "Password123!"
    admin_user = admin_db.auth.admin.create_user({
        "email": admin_email,
        "password": admin_pass,
        "email_confirm": True,
        "user_metadata": {"full_name": "Apex Admin"},
    })
    admin_session = anon_client.auth.sign_in_with_password({"email": admin_email, "password": admin_pass})
    admin_token = admin_session.session.access_token
    admin_headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

    org_slug = f"apex-{uuid.uuid4().hex[:4]}"
    res_org = requests.post(f"{BASE_URL}/workspaces", headers=admin_headers, json={
        "name": "Apex Technologies",
        "slug": org_slug,
    })
    assert res_org.status_code == 201
    print(f"[1] Workspace created: Apex Technologies ({org_slug}) by {admin_email}")

    res_tm = requests.post(f"{BASE_URL}/workspaces/{org_slug}/teams", headers=admin_headers, json={
        "name": "Frontend Guild",
        "key": "FE",
    })
    assert res_tm.status_code == 201
    print(f"[2] Team created: Frontend Guild [FE]")

    # 2. Admin invites a new member via Supabase invitation endpoint
    invitee_email = f"dev.{uuid.uuid4().hex[:6]}@apexcorp.com"
    res_invite = requests.post(f"{BASE_URL}/workspaces/{org_slug}/members/invite", headers=admin_headers, json={
        "email": invitee_email,
        "role": "member",
    })
    assert res_invite.status_code == 201
    print(f"[3] Admin sent invitation to: {invitee_email}")
    print(f"    -> Invite status: {res_invite.json().get('status')}")

    # Check that the member listing shows 'pending invite' before user registers
    res_members_before = requests.get(f"{BASE_URL}/workspaces/{org_slug}/members", headers=admin_headers)
    inv_found = any(m.get("user", {}).get("email") == invitee_email and m.get("status") == "invited" for m in res_members_before.json())
    assert inv_found, "Pending invite must be visible in members list!"
    print(f"[4] Verified invite is pending in workspace directory.")

    # 3. Invitee accepts/registers on Supabase Auth
    invitee_pass = "Password123!"
    invitee_name = "Alex Dev"
    try:
        invitee_auth = admin_db.auth.admin.create_user({
            "email": invitee_email,
            "password": invitee_pass,
            "email_confirm": True,
            "user_metadata": {"full_name": invitee_name},
        })
        invitee_id = invitee_auth.user.id
    except Exception:
        u_list = admin_db.auth.admin.list_users()
        u = next(u for u in u_list if u.email == invitee_email)
        admin_db.auth.admin.update_user_by_id(u.id, {"password": invitee_pass, "email_confirm": True})
        invitee_id = u.id
    print(f"[5] Invitee accepted & registered user account: {invitee_name} <{invitee_email}> [ID: {invitee_id}]")

    # 4. Invitee signs in (Login flow)
    invitee_session = anon_client.auth.sign_in_with_password({"email": invitee_email, "password": invitee_pass})
    invitee_token = invitee_session.session.access_token
    invitee_headers = {"Authorization": f"Bearer {invitee_token}", "Content-Type": "application/json"}
    print(f"[6] Invitee logged in and received Supabase Bearer token.")

    # 5. Invitee calls /workspaces/me (which triggers reconciliation of pending invitations)
    res_me = requests.get(f"{BASE_URL}/workspaces/me", headers=invitee_headers)
    assert res_me.status_code == 200
    my_workspaces = res_me.json()["workspaces"]
    print(f"[7] Invitee's /workspaces/me returned {len(my_workspaces)} workspace(s):")
    for w in my_workspaces:
        print(f"    * Workspace: {w['organization']['name']} (slug: {w['organization']['slug']}) | Role: {w['role']}")
        print(f"      Teams: {[t['name'] + ' [' + t['key'] + ']' for t in w['teams']]}")

    # Verify that the invitee automatically became a member of Apex Technologies
    apex_ws = next((w for w in my_workspaces if w["organization"]["slug"] == org_slug), None)
    assert apex_ws is not None, "Invitee must now have access to Apex Technologies!"
    assert apex_ws["role"] == "member", "Invitee role must be 'member'!"
    assert len(apex_ws["teams"]) >= 1, "Invitee must have access to workspace teams!"
    print("[8] Verified invitee is successfully reconciled as 'member' with team access!")

    # 6. Check workspace directory now: status should be 'active' (not pending), with real name & email
    res_members_after = requests.get(f"{BASE_URL}/workspaces/{org_slug}/members", headers=invitee_headers)
    assert res_members_after.status_code == 200
    reconciled_member = next((m for m in res_members_after.json() if m.get("user", {}).get("email") == invitee_email), None)
    assert reconciled_member is not None
    print(f"[9] Member Directory Render Check:")
    print(f"    * Name: {reconciled_member['user']['name']}")
    print(f"    * Email: {reconciled_member['user']['email']}")
    print(f"    * Role: {reconciled_member['role']}")
    print(f"    * Status: {reconciled_member['status']}")
    assert reconciled_member["status"] == "active"
    assert reconciled_member["role"] == "member"

    # 7. Member can create an issue in this workspace
    res_issue = requests.post(f"{BASE_URL}/issues", headers=invitee_headers, json={
        "organization_id": apex_ws["organization"]["id"],
        "team_id": apex_ws["teams"][0]["id"],
        "title": "Setup responsive Navbar component",
        "description_text": "Implement mobile drawer and desktop nav.",
        "priority": "medium",
        "estimate": 3,
    })
    assert res_issue.status_code == 201
    issue_data = res_issue.json()
    print(f"[10] Reconciled member created issue: {issue_data['identifier']} - \"{issue_data['title']}\"")
    assert issue_data["identifier"] == "FE-1"

    print("\n" + "=" * 70)
    print("SUCCESS: SUPABASE INVITE -> ACCEPT -> LOGIN -> MEMBER RENDER VERIFIED!")
    print("=" * 70)

if __name__ == "__main__":
    test_supabase_invite_flow()
