import duckdb
conn = duckdb.connect("work_tracker.duckdb")

# Backup
conn.execute("CREATE TABLE IF NOT EXISTS task_updates_new AS SELECT * FROM task_updates")
conn.execute("DROP TABLE task_updates")
conn.execute("""
CREATE TABLE task_updates (
    id VARCHAR PRIMARY KEY, 
    task_id VARCHAR, 
    update_text TEXT NOT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)""")
conn.execute("INSERT INTO task_updates SELECT * FROM task_updates_new")
conn.execute("DROP TABLE task_updates_new")

conn.execute("CREATE TABLE IF NOT EXISTS tasks_new AS SELECT * FROM tasks")
conn.execute("DROP TABLE tasks")
conn.execute("""
CREATE TABLE tasks (
    id VARCHAR PRIMARY KEY, 
    title VARCHAR NOT NULL, 
    description TEXT, 
    status VARCHAR NOT NULL, 
    user_id VARCHAR, 
    week VARCHAR, 
    next_update_date TIMESTAMP, 
    due_date TIMESTAMP, 
    feedback VARCHAR
)""")
conn.execute("INSERT INTO tasks (id, title, description, status, user_id, week, next_update_date, due_date, feedback) SELECT id, title, description, status, user_id, week, next_update_date, due_date, feedback FROM tasks_new")
conn.execute("DROP TABLE tasks_new")

conn.close()
print("Migration completed.")
