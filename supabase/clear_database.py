import os
import psycopg2
from dotenv import load_dotenv

import sys
from urllib.parse import urlparse

# Load environment from backend/.env
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(dotenv_path)

env_name = os.getenv("ENVIRONMENT", "development")
if "--i-understand" not in sys.argv:
    print("SAFETY GUARD: clear_database.py truncates all tables and deletes all auth.users.")
    print("To proceed, you must pass the flag: --i-understand")
    sys.exit(1)

supabase_url = os.getenv("SUPABASE_URL", "")
db_host = os.getenv("DB_HOST", "aws-0-ap-southeast-1.pooler.supabase.com")
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")

if not db_user:
    # Attempt to derive from supabase_url ref
    if supabase_url:
        parsed = urlparse(supabase_url)
        ref = parsed.netloc.split(".")[0]
        db_user = f"postgres.{ref}"
    else:
        db_user = "postgres"

if not db_password:
    raise ValueError("DB_PASSWORD not found in environment or backend/.env")

print(f"Connecting to Supabase PostgreSQL at {db_host}...")
conn = psycopg2.connect(
    dbname="postgres",
    user=db_user,
    password=db_password,
    host=db_host,
    port=5432,
    connect_timeout=15,
)
conn.autocommit = True
cur = conn.cursor()

public_tables = [
    "activity_logs",
    "comment_reactions",
    "issue_comments",
    "issue_labels",
    "issue_attachments",
    "issue_embeddings",
    "issues",
    "project_milestones",
    "projects",
    "cycles",
    "labels",
    "workflow_states",
    "team_members",
    "teams",
    "workspace_invitations",
    "workspace_members",
    "organizations",
]

print("Truncating all public tables with CASCADE...")
table_list_str = ", ".join([f"public.{t}" for t in public_tables])
cur.execute(f"TRUNCATE TABLE {table_list_str} CASCADE;")
print("Public tables truncated.")

print("Deleting all auth.users...")
cur.execute("DELETE FROM auth.users;")
print("auth.users cleared.")

print("\nVerification (row counts):")
for t in public_tables:
    cur.execute(f"SELECT count(*) FROM {t};")
    print(f"  {t}: {cur.fetchone()[0]}")

cur.execute("SELECT count(*) FROM auth.users;")
print(f"  auth.users: {cur.fetchone()[0]}")

cur.close()
conn.close()
print("\nAll database records cleared successfully!")
