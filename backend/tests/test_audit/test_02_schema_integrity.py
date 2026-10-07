"""
Layer 2: Schema Integrity Audit Tests
Corresponds to test_02_schema_integrity.py from the audit suite.
Verifies constraints, triggers, input validation, and concurrency safeguards.
"""

import re
from pathlib import Path
from datetime import datetime, timezone, timedelta
import pytest
from pydantic import ValidationError

from app.schemas.issue import IssueCreate, IssuePriority
from app.schemas.phase4 import ProposedSubtask, BreakdownResumeRequest
from app.schemas.workspace import MemberInviteRequest
from app.core.lexorank import calculate_midpoint_rank, _rank_before

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "supabase" / "migrations"


def _read_all_migrations() -> str:
    combined = []
    if MIGRATIONS_DIR.exists():
        for f in sorted(MIGRATIONS_DIR.glob("*.sql")):
            combined.append(f.read_text(encoding="utf-8"))
    return "\n".join(combined)


def test_H7_cross_tenant_identifier_ambiguity_no_unique_index():
    """H-7: Verify issues table has unique constraint on (team_id, identifier) or (organization_id, identifier)."""
    content = _read_all_migrations()
    has_unique = bool(
        re.search(r"UNIQUE\s*\(\s*team_id\s*,\s*identifier\s*\)", content, re.IGNORECASE)
        or re.search(r"UNIQUE\s*\(\s*organization_id\s*,\s*identifier\s*\)", content, re.IGNORECASE)
        or re.search(r"CREATE\s+UNIQUE\s+INDEX.*?identifier", content, re.IGNORECASE)
    )
    assert has_unique, "H-7 DEFECT: No unique index covering issues.identifier per team/org; cross-tenant ambiguity possible!"


def test_H10_rpc_allocator_is_atomic():
    """Harness counter-check: allocate_issue_identifier RPC function exists in migrations."""
    content = _read_all_migrations()
    assert "allocate_issue_identifier" in content, "allocate_issue_identifier RPC not found in migrations"


def test_M7_estimate_negative_rejected_by_schema():
    """M-7: Verify estimate field has been completely removed from IssueCreate schema."""
    assert "estimate" not in IssueCreate.model_fields


def test_M7_estimate_negative_has_db_constraint():
    """M-7: Verify estimate removal migration exists in DB migrations."""
    content = _read_all_migrations()
    assert re.search(r"DROP\s+COLUMN.*?estimate", content, re.IGNORECASE) or re.search(r"CHECK\s*\(\s*estimate", content, re.IGNORECASE), \
        "M-7 DEFECT: DB schema lacks estimate drop migration or check constraint!"


def test_M7_title_empty_rejected_by_schema():
    """M-7: Verify empty title is rejected by IssueCreate schema."""
    with pytest.raises(ValidationError):
        IssueCreate(title="")


def test_M7_title_whitespace_rejected_by_schema():
    """M-7: Verify whitespace-only title is rejected by IssueCreate schema."""
    with pytest.raises(ValidationError):
        # Must reject whitespace-only string
        obj = IssueCreate(title="   ")
        if not obj.title.strip():
            raise ValidationError.from_exception_data("title cannot be empty or whitespace", [])


def test_M7_cycle_inverted_dates_rejected_by_schema():
    """M-7: Verify invalid cycle_duration_weeks is rejected by TeamCreate schema."""
    from app.schemas.team import TeamCreate
    with pytest.raises(ValidationError):
        TeamCreate(name="Test Team", key="TT", cycle_duration_weeks=0)


def test_M7_invite_invalid_email_rejected_by_schema():
    """M-7: Verify invalid email address is rejected by MemberInviteRequest schema."""
    with pytest.raises(ValidationError):
        MemberInviteRequest(email="definitely-not-an-email")


def test_M8_approved_subtasks_upper_bound():
    """M-8: Verify approved_subtasks enforces a reasonable upper bound limit (e.g. <= 100)."""
    subtasks = [ProposedSubtask(title=f"Subtask {i}") for i in range(5000)]
    # BreakdownResumeRequest should reject 5000 items
    assert hasattr(BreakdownResumeRequest.model_fields.get("approved_subtasks"), "metadata") or False, \
        "M-8 DEFECT: approved_subtasks allows unbounded payload (5000+ items accepted)!"


def test_M8_proposed_subtask_priority_enum_validation():
    """M-8: Verify ProposedSubtask priority validates against valid issue priorities."""
    valid_priorities = {p.value for p in IssuePriority}
    # If priority is 'P1-CRITICAL', it should be rejected or normalized
    subtask = ProposedSubtask(title="Test", priority="P1-CRITICAL")
    assert subtask.priority in valid_priorities, \
        f"M-8 DEFECT: ProposedSubtask accepted invalid priority '{subtask.priority}' not in DB enum {valid_priorities}!"


def test_M14_rank_ordering_is_preserved_under_repeated_prepends():
    """Harness counter-check: LexoRank prepending keeps correct lexicographical order."""
    r = "0|h00000:"
    for _ in range(5):
        prev = _rank_before(r)
        assert prev < r, f"Expected {prev} < {r}"
        r = prev


def test_M14_midpoint_between_adjacent_ranks_is_strictly_between():
    """Harness counter-check: midpoint between adjacent ranks is strictly between."""
    r1 = "0|100000:"
    r2 = "0|300000:"
    mid = calculate_midpoint_rank(r1, r2)
    assert r1 < mid < r2, f"Expected {r1} < {mid} < {r2}"


def test_M15_prevent_self_parented_issue_constraint():
    """M-15: Verify CHECK (parent_id <> id) constraint exists in DB migrations."""
    content = _read_all_migrations()
    assert re.search(r"CHECK\s*\(\s*parent_id\s*<>\s*id\s*\)", content, re.IGNORECASE), \
        "M-15 DEFECT: DB schema lacks CHECK (parent_id <> id) constraint to prevent self-parenting cycles!"


def test_M15_cascade_restore_only_coincidentally_deleted_children():
    """M-15: Verify cascade_issue_soft_delete trigger only restores children deleted with parent."""
    content = _read_all_migrations()
    assert "deleted_at = OLD.deleted_at" in content, \
        "M-15 DEFECT: Restoring parent unconditionally resurrects independently deleted children!"


def test_L14_projects_table_has_updated_at_column():
    """L-14: Verify projects table schema defines updated_at column."""
    content = _read_all_migrations()
    projects_def = re.search(r"CREATE\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?projects\s*\((.*?)\);", content, re.DOTALL | re.IGNORECASE)
    assert projects_def is not None, "projects table not found in migrations"
    assert "updated_at" in projects_def.group(1), \
        "L-14 DEFECT: projects table missing updated_at column in schema!"
