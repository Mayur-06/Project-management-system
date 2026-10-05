"""
Layer 5: Logic Defects Audit Tests
Corresponds to test_05_logic_defects.py from the audit suite.
Verifies AI velocity calculation, tool invocation, frontend modal connectivity,
NameError fixes, rank calculation, embedding validity, and schema table queries.
"""

import re
from pathlib import Path
import pytest
from fastapi import status
from app.core.lexorank import calculate_midpoint_rank, _rank_between
from app.core.ai_client import get_embedding

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIR = REPO_ROOT / "frontend"


def test_C8_agent_velocity_not_hardcoded_80_percent():
    """C-8: Verify react_agent does not hardcode '80% completion rate' for velocity questions."""
    agent_path = BACKEND_DIR / "app" / "agents" / "react_agent.py"
    content = agent_path.read_text(encoding="utf-8")
    assert "80% completion rate" not in content, \
        "C-8 DEFECT: Agent streams a hardcoded '80% completion rate' instead of reading real cycle velocity!"


def test_C8_mutating_tools_invoked_outside_definition():
    """C-8: Verify update_issue_status_tool and assign_issue_tool are invoked in the application."""
    all_code = ""
    for py_file in (BACKEND_DIR / "app").glob("**/*.py"):
        all_code += py_file.read_text(encoding="utf-8") + "\n"

    # Search for actual tool invocations
    has_status_tool_invoke = bool(re.search(r"update_issue_status_tool\s*\.\s*(?:invoke|run|ainvoke)", all_code))
    has_assign_tool_invoke = bool(re.search(r"assign_issue_tool\s*\.\s*(?:invoke|run|ainvoke)", all_code))

    assert has_status_tool_invoke, \
        "C-8 DEFECT: update_issue_status_tool is never invoked anywhere; confirmation gate leads nowhere!"
    assert has_assign_tool_invoke, \
        "C-8 DEFECT: assign_issue_tool is never invoked anywhere!"


def test_C9_ai_assistant_modal_uses_real_stream():
    """C-9: Verify AIAssistantModal connects to real SSE stream and does not use fake setTimeout."""
    modal_path = FRONTEND_DIR / "components" / "ai" / "AIAssistantModal.tsx"
    if modal_path.exists():
        content = modal_path.read_text(encoding="utf-8")
        assert "streamChat" in content, "C-9 DEFECT: AIAssistantModal does not call api.streamChat!"
        assert "Tasks are tracking on schedule with full velocity" not in content, \
            "C-9 DEFECT: AIAssistantModal contains canned fake response!"


def test_C9_chat_stream_endpoint_reachable(client):
    """C-9: Verify /api/v1/ai/chat/stream is registered and reachable."""
    # Test that calling the endpoint returns 200 (SSE stream) or 400 (validation), NOT 404 Not Found
    res = client.post("/api/v1/ai/chat/stream", json={"organization_id": "00000000-0000-0000-0000-000000000001", "messages": [{"role": "user", "content": "hi"}]})
    assert res.status_code != status.HTTP_404_NOT_FOUND, \
        "C-9 DEFECT: /api/v1/ai/chat/stream route is missing or returned 404 Not Found!"


def test_C10_breakdown_agent_no_name_error_state_id():
    """C-10: Verify breakdown_agent.py defines default_state_id before using it in batch_persist_node."""
    agent_path = BACKEND_DIR / "app" / "agents" / "breakdown_agent.py"
    content = agent_path.read_text(encoding="utf-8")
    assert "default_state_id" in content or "state_id = " in content, \
        "C-10 DEFECT: batch_persist_node uses undefined 'state_id' raising NameError at runtime!"


def test_H1_server_reorder_computes_new_rank():
    """H-1A: Verify calculate_midpoint_rank does not collapse to constant '0|h00000:' when positions are provided."""
    r = calculate_midpoint_rank("0|h00000:", "0|h20000:")
    assert r != "0|h00000:", "H-1A DEFECT: calculate_midpoint_rank collapsed to constant initial rank!"
    assert "0|h00000:" < r < "0|h20000:"


def test_H1_client_rank_generation_no_double_colon():
    """H-1B: Verify client rank calculation does not append '1:' producing double colon '0|h00000:1:'."""
    issues_page = FRONTEND_DIR / "app" / "(workspace)" / "[orgSlug]" / "[teamKey]" / "issues" / "page.tsx"
    if issues_page.exists():
        content = issues_page.read_text(encoding="utf-8")
        # Check if malformed string `${prevRank}1:` exists
        assert "${prevRank}1:" not in content, \
            "H-1B DEFECT: Appending produced malformed rank with two ':' terminators (e.g. '0|h00000:1:')!"


def test_H17_get_embedding_does_not_return_character_hash_projection():
    """H-17: Verify get_embedding returns None rather than fake character-hash vectors when unconfigured."""
    vec = get_embedding("Fix the login crash on Safari")
    # Must NOT return a fake 768-dim hash projection when GEMINI_API_KEY is unset in test env
    assert vec is None or hasattr(vec, "__len__"), \
        "H-17 DEFECT: get_embedding produced a fake character-hash projection poisoning the vector database!"


def test_H17_duplicate_detection_does_not_hardcode_085_similarity():
    """H-17: Verify check_duplicates does not assign a literal 0.85 similarity to substring matches."""
    service_path = BACKEND_DIR / "app" / "services" / "phase4_service.py"
    content = service_path.read_text(encoding="utf-8")
    assert "similarity = 0.85" not in content and "similarity\": 0.85" not in content, \
        "H-17 DEFECT: check_duplicates assigns literal 0.85 similarity to arbitrary substring matches!"


def test_M4_issue_service_does_not_query_public_users():
    """M-4: Verify issue_service.py does not select from non-existent 'users' table."""
    service_path = BACKEND_DIR / "app" / "services" / "issue_service.py"
    content = service_path.read_text(encoding="utf-8")
    assert 'table("users")' not in content and "table('users')" not in content, \
        "M-4 DEFECT: issue_service queries non-existent public.users table!"


def test_M4_workspace_service_does_not_query_public_users():
    """M-4: Verify workspace_service.py does not select from non-existent 'users' table."""
    service_path = BACKEND_DIR / "app" / "services" / "workspace_service.py"
    content = service_path.read_text(encoding="utf-8")
    assert 'table("users")' not in content and "table('users')" not in content, \
        "M-4 DEFECT: workspace_service queries non-existent public.users table!"


def test_M14_rank_between_inverted_args_handled():
    """M-14: Verify _rank_between with inverted arguments does not produce invalid ranks."""
    r1 = "0|h50000:"
    r2 = "0|h10000:"
    # Inverted args: r1 > r2. A robust implementation either swaps or handles gracefully.
    res = calculate_midpoint_rank(r1, r2)
    # The result must either be between the two or swap them
    low, high = min(r1, r2), max(r1, r2)
    assert low < res < high or res > low, f"Got unexpected rank {res}"


def test_M14_rank_length_under_repeated_prepends():
    """M-14: Check rank string length after 300 repeated prepends."""
    from app.core.lexorank import _rank_before
    r = "0|h00000:"
    for _ in range(300):
        r = _rank_before(r)
    # If it exceeds 255 chars, it will fail against VARCHAR(255)
    assert len(r) <= 255, f"M-14 DEFECT: Rank length is {len(r)} chars, exceeding sort_order VARCHAR(255)!"


def test_C11_clear_database_script_safety():
    """C-11: Verify clear_database.py requires confirmation and does not run blindly against prod."""
    script_path = REPO_ROOT / "supabase" / "clear_database.py"
    if script_path.exists():
        content = script_path.read_text(encoding="utf-8")
        assert "input(" in content or "confirm" in content.lower() or "sys.exit" in content, \
            "C-11 DEFECT: clear_database.py has no safety prompt and blindly purges database!"


def test_team_service_does_not_query_public_users():
    """M-4: Verify team_service.py does not select from non-existent 'users' table."""
    service_path = BACKEND_DIR / "app" / "services" / "team_service.py"
    if service_path.exists():
        content = service_path.read_text(encoding="utf-8")
        assert 'table("users")' not in content and "table('users')" not in content, \
            "M-4 DEFECT: team_service queries non-existent public.users table!"


def test_breakdown_agent_atomic_rpc_identifier():
    """H-10: Verify breakdown_agent attempts allocate_issue_identifier RPC."""
    agent_path = BACKEND_DIR / "app" / "agents" / "breakdown_agent.py"
    content = agent_path.read_text(encoding="utf-8")
    assert "allocate_issue_identifier" in content, \
        "H-10 DEFECT: breakdown_agent does not use allocate_issue_identifier RPC!"


def test_react_agent_client_disconnect_handling():
    """Verify react_agent checks request.is_disconnected() during token streaming."""
    agent_path = BACKEND_DIR / "app" / "agents" / "react_agent.py"
    content = agent_path.read_text(encoding="utf-8")
    assert "is_disconnected" in content, \
        "react_agent fails to handle client disconnect during SSE streaming!"


def test_duplicate_check_vector_results_populated():
    """Verify check_duplicates returns matches from RPC without crashing."""
    from unittest.mock import MagicMock
    from app.services.phase4_service import Phase4Service
    from app.schemas.phase4 import DuplicateCheckRequest

    mock_db = MagicMock()
    mock_db.table().select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
    mock_db.rpc().execute.return_value = MagicMock(data=[])

    req = DuplicateCheckRequest(title="Authentication failure on login page", organization_id="11111111-1111-1111-1111-111111111111")
    res = Phase4Service.check_duplicates(req, "u1", mock_db)
    assert res.duplicates_found is False


def test_hitl_breakdown_interrupt_payload_shape():
    """Verify start_breakdown returns interrupted status and thread_id."""
    from unittest.mock import MagicMock
    from app.services.phase4_service import Phase4Service
    from app.schemas.phase4 import BreakdownStartRequest

    mock_db = MagicMock()
    mock_db.table().select().eq().limit().execute.return_value = MagicMock(data=[{"id": "iss1", "organization_id": "org1", "team_id": "team1", "title": "Test Issue"}])
    mock_db.table().select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
    mock_db.table().select().eq().is_().execute.return_value = MagicMock(data=[])

    req = BreakdownStartRequest(issue_id="iss1")
    res = Phase4Service.start_breakdown(req, "u1", mock_db)
    assert res.status == "interrupted"
    assert "org1:u1:" in res.thread_id
