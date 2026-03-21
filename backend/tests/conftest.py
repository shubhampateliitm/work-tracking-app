import pytest
import duckdb
from fastapi.testclient import TestClient

from main import app
from database import get_db

@pytest.fixture(scope="session")
def engine():
    # Use in-memory DuckDB for tests
    conn = duckdb.connect(':memory:')
    
    # Initialize schema
    conn.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        role VARCHAR,
        is_active BOOLEAN DEFAULT TRUE,
        capacity_hours_per_sprint INTEGER DEFAULT 60
    );
    """)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR PRIMARY KEY,
        title VARCHAR NOT NULL,
        description VARCHAR,
        status VARCHAR DEFAULT 'todo',
        user_id VARCHAR,
        week VARCHAR,
        next_update_date TIMESTAMP,
        due_date TIMESTAMP,
        feedback VARCHAR,
        time_estimate_mins INTEGER,
        time_spent_mins INTEGER DEFAULT 0,
        sprint VARCHAR,
        priority VARCHAR DEFAULT 'p2',
        recurrence_rule VARCHAR
    );
    """)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS task_updates (
        id VARCHAR PRIMARY KEY,
        task_id VARCHAR NOT NULL,
        update_text text NOT NULL,
        created_at TIMESTAMP NOT NULL
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
    yield conn
    conn.close()

@pytest.fixture
def db(engine):
    # clear tables before each test
    engine.execute("DELETE FROM task_notes")
    engine.execute("DELETE FROM task_dependencies")
    engine.execute("DELETE FROM retrospectives")
    engine.execute("DELETE FROM task_slots")
    engine.execute("DELETE FROM task_activity")
    engine.execute("DELETE FROM task_updates")
    engine.execute("DELETE FROM tasks")
    engine.execute("DELETE FROM users")
    return engine

@pytest.fixture
def client(db):
    def override_get_db():
        return db
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
