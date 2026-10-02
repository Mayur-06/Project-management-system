import os
import psycopg2
from dotenv import load_dotenv

# Load environment from backend/.env
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(dotenv_path)

db_password = os.getenv("DB_PASSWORD")
project_ref = "zteuxlfrleyctdkyuzvb"
pooler_host = "aws-0-ap-southeast-1.pooler.supabase.com"
pooler_user = f"postgres.{project_ref}"

if not db_password:
    raise ValueError("DB_PASSWORD not found in environment or backend/.env")

print(f"Connecting to Supabase PostgreSQL at {pooler_host}...")
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
