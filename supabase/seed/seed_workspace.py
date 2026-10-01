import os
import psycopg2
from dotenv import load_dotenv

dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend", ".env"))
load_dotenv(dotenv_path)

db_password = os.getenv("DB_PASSWORD")
project_ref = "zteuxlfrleyctdkyuzvb"
pooler_host = "aws-0-ap-southeast-1.pooler.supabase.com"
pooler_user = f"postgres.{project_ref}"

conn = psycopg2.connect(
    dbname="postgres",
    user=pooler_user,
    password=db_password,
    host=pooler_host,
    port=5432,
    connect_timeout=15,
)
conn.autocommit = True
cur = conn.cursor()

# 1. Create Alex in auth.users if not exists
user_id = "00000000-0000-0000-0000-000000000001"
user_email = "alex@acme.inc"

print("Seeding auth.users...")
cur.execute("""
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    %s,
    'authenticated',
    'authenticated',
    %s,
    crypt('password123', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Alex Rivera"}',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;
""", (user_id, user_email))

# 2. Create organization
org_id = "11111111-1111-1111-1111-111111111111"
print("Seeding organizations...")
cur.execute("""
INSERT INTO organizations (id, name, slug, created_at, updated_at)
VALUES (%s, 'Acme Corp', 'acme', NOW(), NOW())
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
RETURNING id;
""", (org_id,))
row = cur.fetchone()
if row:
    org_id = row[0]

# 3. Create workspace_members
print("Seeding workspace_members...")
cur.execute("""
INSERT INTO workspace_members (organization_id, user_id, role, created_at)
VALUES (%s, %s, 'admin', NOW())
ON CONFLICT (organization_id, user_id) DO NOTHING;
""", (org_id, user_id))

# 4. Create team ENG
team_eng_id = "22222222-2222-2222-2222-222222222222"
print("Seeding teams...")
cur.execute("""
INSERT INTO teams (id, organization_id, name, key, issue_counter, cycle_duration_weeks, created_at)
VALUES (%s, %s, 'Engineering', 'ENG', 2, 2, NOW())
ON CONFLICT (organization_id, key) DO UPDATE SET name = EXCLUDED.name
RETURNING id;
""", (team_eng_id, org_id))
row = cur.fetchone()
if row:
    team_eng_id = row[0]

# 5. Team membership
cur.execute("""
INSERT INTO team_members (team_id, user_id, created_at)
VALUES (%s, %s, NOW())
ON CONFLICT (team_id, user_id) DO NOTHING;
""", (team_eng_id, user_id))

# 6. Workflow states for ENG
print("Seeding workflow states...")
states = [
    ("Triage", "#eab308", "triage", "0|h00000:", False),
    ("Backlog", "#94a3b8", "backlog", "0|h10000:", False),
    ("Todo", "#e2e8f0", "unstarted", "0|h20000:", True),
    ("In Progress", "#f59e0b", "started", "0|h30000:", False),
    ("In Review", "#3b82f6", "started", "0|h40000:", False),
    ("Done", "#22c55e", "completed", "0|h50000:", False),
    ("Canceled", "#ef4444", "canceled", "0|h60000:", False),
]

created_state_ids = {}
for name, color, category, pos, is_def in states:
    cur.execute("""
    INSERT INTO workflow_states (team_id, name, color, category, position, is_default, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, NOW())
    RETURNING id;
    """, (team_eng_id, name, color, category, pos, is_def))
    created_state_ids[name] = cur.fetchone()[0]

# 7. Sample issues
todo_id = created_state_ids.get("Todo")
in_progress_id = created_state_ids.get("In Progress")

print("Seeding initial issues...")
cur.execute("""
INSERT INTO issues (
    organization_id, team_id, number, identifier, title, description_text,
    priority, estimate, state_id, creator_id, sort_order, version, created_at, updated_at
) VALUES 
(
    %s, %s, 1, 'ENG-1', 'Setup Supabase Row-Level Security', 'Verify and test multi-tenant policies across all workspace tables.',
    'high', 3, %s, %s, '0|h10000:', 1, NOW(), NOW()
),
(
    %s, %s, 2, 'ENG-2', 'Build TipTap rich markdown editor', 'Implement rich text document editing with slash command support.',
    'medium', 5, %s, %s, '0|h20000:', 1, NOW(), NOW()
) ON CONFLICT (team_id, number) DO NOTHING;
""", (org_id, team_eng_id, in_progress_id, user_id, org_id, team_eng_id, todo_id, user_id))

cur.close()
conn.close()
print("Supabase database successfully seeded with Acme Corp workspace, Engineering team, and initial issues!")
