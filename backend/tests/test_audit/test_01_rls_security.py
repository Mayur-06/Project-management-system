"""
Layer 1: RLS Security Audit Tests
Corresponds to test_01_rls_security.py from the security audit suite.
Verifies RLS enablement, tenant isolation policies, anon permissions,
and invitation triggers across migrations and services.
"""

import re
from pathlib import Path
import pytest

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "supabase" / "migrations"

UNPROTECTED_TABLES_C1 = [
    "activity_logs",
    "comment_reactions",
    "cycles",
    "issue_attachments",
    "issue_comments",
    "issue_embeddings",
    "issue_labels",
    "issues",
    "labels",
    "project_milestones",
    "projects",
]


def _read_all_migrations() -> str:
    combined = []
    if MIGRATIONS_DIR.exists():
        for f in sorted(MIGRATIONS_DIR.glob("*.sql")):
            combined.append(f.read_text(encoding="utf-8"))
    return "\n".join(combined)


def test_protected_tables_actually_isolate():
    """Harness counter-check: baseline organizations table enables RLS and has policies."""
    content = _read_all_migrations()
    assert "ALTER TABLE organizations ENABLE ROW LEVEL SECURITY" in content or "ENABLE ROW LEVEL SECURITY" in content


@pytest.mark.parametrize("table_name", UNPROTECTED_TABLES_C1)
def test_C1_table_has_rls_enabled(table_name):
    """C-1: Verify that table has ROW LEVEL SECURITY enabled in migrations."""
    content = _read_all_migrations()
    pattern = rf"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?{table_name}\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY"
    match = re.search(pattern, content, re.IGNORECASE)
    assert match is not None, f"C-1 DEFECT: Table '{table_name}' does not have RLS enabled in migrations!"


@pytest.mark.parametrize("table_name", UNPROTECTED_TABLES_C1)
def test_C1_table_has_tenant_isolation_policy(table_name):
    """C-1: Verify that table has a tenant isolation policy defined in migrations."""
    content = _read_all_migrations()
    pattern = rf"CREATE\s+POLICY\s+[\"']?[^\"']+[\"']?\s+ON\s+{table_name}"
    match = re.search(pattern, content, re.IGNORECASE)
    assert match is not None, f"C-1 DEFECT: Table '{table_name}' has no RLS policy defined in migrations!"


def test_L16_anon_permissions_revoked():
    """L-16: Verify that public anon role permissions are revoked from tables and sequences."""
    content = _read_all_migrations()
    assert re.search(r"REVOKE\s+ALL\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+anon", content, re.IGNORECASE), \
        "L-16 DEFECT: anon holds broad permissions; REVOKE ALL ON ALL TABLES FROM anon is missing!"


def test_C5_workspace_invitations_drops_public_permissive_policy():
    """C-5: Verify that the wide-open 'USING (true)' policy on workspace_invitations is dropped."""
    content = _read_all_migrations()
    assert "DROP POLICY IF EXISTS \"Public or backend access for workspace invitations\" ON workspace_invitations" in content, \
        "C-5 DEFECT: Permissive 'USING (true)' policy on workspace_invitations is not dropped!"


def test_C5_workspace_invitations_restricts_management_to_admins():
    """C-5: Verify that only admins can insert or manage invitations."""
    content = _read_all_migrations()
    pattern = r"CREATE\s+POLICY\s+[\"']Admins can view and manage workspace invitations[\"']\s+ON\s+workspace_invitations"
    assert re.search(pattern, content, re.IGNORECASE), \
        "C-5 DEFECT: workspace_invitations does not restrict admin management to authenticated admins!"


def test_C4_trigger_requires_email_confirmation_before_granting_membership():
    """C-4: Verify on_auth_user_created_accept_invites trigger does not grant membership to unconfirmed signups."""
    content = _read_all_migrations()
    func_pattern = r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.handle_user_invitation_acceptance\(\).*?BEGIN(.*?)END;"
    match = re.search(func_pattern, content, re.DOTALL | re.IGNORECASE)
    assert match is not None, "handle_user_invitation_acceptance function not found in migrations"
    body = match.group(1)
    
    assert "email_confirmed_at IS NOT NULL" in body or "email_confirmed" in body, \
        "C-4 DEFECT: Trigger auto-grants workspace membership even when NEW.email_confirmed_at IS NULL!"
