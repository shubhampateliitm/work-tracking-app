import duckdb
import os

DB_NAME = os.environ.get("DB_PATH", "work_tracker.duckdb")

def get_db():
    conn = duckdb.connect(DB_NAME)
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    conn = duckdb.connect(DB_NAME)
    
    # Create tables
    conn.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        role VARCHAR,
        is_active BOOLEAN DEFAULT TRUE
    );
    """)
    # Migration for existing users
    try:
        conn.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE")
    except Exception:
        pass # Column likely already exists

    conn.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR PRIMARY KEY,
        title VARCHAR NOT NULL,
        description TEXT,
        status VARCHAR NOT NULL, -- e.g., 'done', 'current', 'upcoming', 'long-term'
        user_id VARCHAR,
        week VARCHAR, -- e.g., '2023-W12'
        next_update_date TIMESTAMP
    );
    """)
    
    # Try adding next_update_date if it doesn't exist (primitive migration since IF NOT EXISTS might not handle alters)
    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN next_update_date TIMESTAMP")
    except Exception:
        pass # Column likely already exists

    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN due_date TIMESTAMP")
    except Exception:
        pass # Column likely already exists

    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN feedback VARCHAR")
    except Exception:
        pass # Column likely already exists

    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN time_estimate_mins INTEGER")
    except Exception:
        pass

    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN time_spent_mins INTEGER DEFAULT 0")
    except Exception:
        pass

    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN sprint VARCHAR")
    except Exception:
        pass

    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN priority VARCHAR DEFAULT 'p2'")
    except Exception:
        pass

    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN recurrence_rule VARCHAR")
    except Exception:
        pass

    try:
        conn.execute("ALTER TABLE users ADD COLUMN capacity_hours_per_sprint INTEGER DEFAULT 60")
    except Exception:
        pass

    conn.execute("""
    CREATE TABLE IF NOT EXISTS task_updates (
        id VARCHAR PRIMARY KEY,
        task_id VARCHAR,
        update_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS task_activity (
        id VARCHAR PRIMARY KEY,
        task_id VARCHAR NOT NULL,
        action VARCHAR NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS task_slots (
        id VARCHAR PRIMARY KEY,
        task_id VARCHAR NOT NULL,
        user_id VARCHAR NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS retrospectives (
        id VARCHAR PRIMARY KEY,
        sprint_id VARCHAR NOT NULL,
        went_well TEXT DEFAULT '',
        to_improve TEXT DEFAULT '',
        action_items TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS task_dependencies (
        id VARCHAR PRIMARY KEY,
        blocker_task_id VARCHAR NOT NULL,
        blocked_task_id VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS task_notes (
        id VARCHAR PRIMARY KEY,
        task_id VARCHAR NOT NULL,
        title VARCHAR NOT NULL,
        content TEXT NOT NULL,
        is_published BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Seed primary user if not exists
    try:
        exists = conn.execute("SELECT 1 FROM users WHERE id = 'me'").fetchone()
        if not exists:
            conn.execute("INSERT INTO users (id, name, role, is_active, capacity_hours_per_sprint) VALUES ('me', 'Shubham Patel', 'Owner', TRUE, 60)")
    except Exception:
        pass

    conn.close()
