import os
import glob
import psycopg2
from dotenv import load_dotenv

from urllib.parse import urlparse

# Load environment from backend/.env
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(dotenv_path)

supabase_url = os.getenv("SUPABASE_URL", "")
db_host = os.getenv("DB_HOST", "aws-0-ap-southeast-1.pooler.supabase.com")
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")

if not db_user:
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

# Create migrations tracking table if not exists
cur.execute("""
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
    );
""")

cur.execute("SELECT version FROM schema_migrations;")
applied_versions = {r[0] for r in cur.fetchall()}

migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
sql_files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))

print(f"Found {len(sql_files)} migration file(s). ({len(applied_versions)} already applied)")
for sql_path in sql_files:
    fname = os.path.basename(sql_path)
    if fname in applied_versions:
        print(f"Skipping already applied migration: {fname}")
        continue

    print(f"Running migration: {fname} ...")
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()
    cur.execute(sql)
    cur.execute("INSERT INTO schema_migrations (version) VALUES (%s) ON CONFLICT DO NOTHING;", (fname,))
    print(f"Migration {fname} applied successfully!")

cur.close()
conn.close()
print("All migrations completed successfully!")
