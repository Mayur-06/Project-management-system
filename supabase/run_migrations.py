import os
import glob
import psycopg2
from dotenv import load_dotenv

# Load environment from backend/.env
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(dotenv_path)

db_password = os.getenv("DB_PASSWORD")
project_ref = "zteuxlfrleyctdkyuzvb"

# Detected Supabase pooler region
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

migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
sql_files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))

print(f"Found {len(sql_files)} migration file(s).")
for sql_path in sql_files:
    fname = os.path.basename(sql_path)
    print(f"Running migration: {fname} ...")
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()
    cur.execute(sql)
    print(f"Migration {fname} applied successfully!")

cur.close()
conn.close()
print("All migrations completed successfully!")
