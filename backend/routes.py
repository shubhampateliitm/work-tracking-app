from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from models import Task, User, TaskSlot, TimeSpentUpdate, Retrospective, TaskDependency, TaskNote, CodeExecutionRequest, CodeExecutionResponse
import duckdb
from database import get_db
from typing import List, Optional
import uuid
import datetime
import csv
import io
from pydantic import BaseModel
from ai_agent import AIAgent

router = APIRouter()

class ChatRequest(BaseModel):
    query: str

def log_activity(conn, task_id: str, action: str, description: str):
    """Insert a single activity entry for a task."""
    aid = str(uuid.uuid4())
    now = datetime.datetime.now().isoformat()
    conn.execute(
        "INSERT INTO task_activity (id, task_id, action, description, created_at) VALUES (?, ?, ?, ?, ?)",
        [aid, task_id, action, description, now]
    )

@router.get("/")
def read_root():
    return {"status": "ok", "message": "Work tracking API is running"}

@router.get("/users", response_model=List[User])
def get_users(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    result = conn.execute("SELECT id, name, role, is_active, capacity_hours_per_sprint FROM users").fetchall()
    return [{"id": r[0], "name": r[1], "role": r[2], "is_active": r[3], "capacity_hours_per_sprint": r[4]} for r in result]

@router.post("/users", response_model=User)
def create_user(user: User, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("INSERT INTO users (id, name, role, is_active, capacity_hours_per_sprint) VALUES (?, ?, ?, ?, ?)", [user.id, user.name, user.role, user.is_active, user.capacity_hours_per_sprint])
    return user

@router.put("/users/{user_id}", response_model=User)
def update_user(user_id: str, user: User, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("UPDATE users SET name=?, role=?, is_active=?, capacity_hours_per_sprint=? WHERE id=?", [user.name, user.role, user.is_active, user.capacity_hours_per_sprint, user_id])
    return user

@router.delete("/users/{user_id}")
def delete_user(user_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("DELETE FROM users WHERE id=?", [user_id])
    return {"message": "User deleted"}

@router.get("/tasks", response_model=list[dict])
def get_tasks(status: str = None, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    if status:
        res = conn.execute("SELECT * FROM tasks WHERE status = ?", [status]).fetchall()
    else:
        res = conn.execute("SELECT * FROM tasks").fetchall()
    
    columns = [desc[0] for desc in conn.description]
    return [dict(zip(columns, row)) for row in res]

@router.post("/tasks", response_model=Task)
def create_task(task: Task, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    dt_str = task.next_update_date.isoformat() if task.next_update_date else None
    due_str = task.due_date.isoformat() if task.due_date else None
    conn.execute("""
        INSERT INTO tasks (id, title, description, status, user_id, week, next_update_date, due_date, feedback, time_estimate_mins, time_spent_mins, sprint, priority, recurrence_rule)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [task.id, task.title, task.description, task.status, task.user_id, task.week, dt_str, due_str, task.feedback, task.time_estimate_mins, task.time_spent_mins, task.sprint, task.priority, task.recurrence_rule])
    
    log_activity(conn, task.id, "created", f"Task created: '{task.title}'")
    return task

@router.put("/tasks/{task_id}", response_model=Task)
def update_task(task_id: str, task: Task, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    # Fetch old task to diff changes
    old_row = conn.execute("SELECT title, status, user_id, due_date, feedback FROM tasks WHERE id = ?", [task_id]).fetchone()

    dt_str = task.next_update_date.isoformat() if task.next_update_date else None
    due_str = task.due_date.isoformat() if task.due_date else None
    conn.execute("""
        UPDATE tasks
        SET title=?, description=?, status=?, user_id=?, week=?, next_update_date=?, due_date=?, feedback=?, time_estimate_mins=?, time_spent_mins=?, sprint=?, priority=?, recurrence_rule=?
        WHERE id=?
    """, [task.title, task.description, task.status, task.user_id, task.week, dt_str, due_str, task.feedback, task.time_estimate_mins, task.time_spent_mins, task.sprint, task.priority, task.recurrence_rule, task_id])

    # Auto-log changes by diffing old vs new
    if old_row:
        old_title, old_status, old_user_id, old_due, old_feedback = old_row
        if task.title != old_title:
            log_activity(conn, task_id, "renamed", f"Renamed from '{old_title}' to '{task.title}'")
        if task.status != old_status:
            log_activity(conn, task_id, "status_changed", f"Status changed from '{old_status}' to '{task.status}'")
        if task.user_id != old_user_id:
            # Resolve user IDs to names
            old_name = "unassigned"
            if old_user_id:
                row = conn.execute("SELECT name FROM users WHERE id = ?", [old_user_id]).fetchone()
                old_name = row[0] if row else old_user_id
            new_name = task.user_id
            if task.user_id:
                row = conn.execute("SELECT name FROM users WHERE id = ?", [task.user_id]).fetchone()
                new_name = row[0] if row else task.user_id
            log_activity(conn, task_id, "assigned", f"Reassigned from '{old_name}' to '{new_name}'")
        new_due = due_str or ""
        old_due_str = old_due.isoformat() if old_due else ""
        if new_due != old_due_str:
            log_activity(conn, task_id, "due_date_changed", f"Due date changed to '{due_str or 'none'}'")
        if task.feedback and task.feedback != (old_feedback or ""):
            log_activity(conn, task_id, "feedback_added", "Feedback added")

        # Recurring task: auto-create next instance when completing
        if task.status == 'done' and old_status != 'done' and task.recurrence_rule:
            _create_recurring_next(conn, task)

    return task

@router.delete("/tasks/{task_id}")
def delete_task(task_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("DELETE FROM tasks WHERE id=?", [task_id])
    return {"status": "success"}

@router.get("/team-focus")
def get_team_focus(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    res = conn.execute("""
        SELECT u.name as user_name, t.* 
        FROM users u 
        LEFT JOIN tasks t ON u.id = t.user_id AND t.status != 'done'
    """).fetchall()
    
    columns = [desc[0] for desc in conn.description]
    team_tasks = {}
    for row in res:
        task_dict = dict(zip(columns, row))
        user_name = task_dict['user_name']
        if user_name not in team_tasks:
            team_tasks[user_name] = []
        if task_dict.get('id'):
            team_tasks[user_name].append(task_dict)
    
    return team_tasks

@router.get("/weekly-closed-tasks")
def get_weekly_closed_tasks(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    res = conn.execute("""
        SELECT week, id, title, description, status, user_id
        FROM tasks 
        WHERE status = 'done' AND week IS NOT NULL AND week != ''
        ORDER BY week DESC
    """).fetchall()
    
    columns = [desc[0] for desc in conn.description]
    weekly_tasks = {}
    for row in res:
        task_dict = dict(zip(columns, row))
        week = task_dict['week']
        if week not in weekly_tasks:
            weekly_tasks[week] = []
        weekly_tasks[week].append(task_dict)
        
    return weekly_tasks

@router.get("/tasks/{task_id}/updates")
def get_task_updates(task_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    res = conn.execute("SELECT * FROM task_updates WHERE task_id = ? ORDER BY created_at DESC", [task_id]).fetchall()
    columns = [desc[0] for desc in conn.description]
    return [dict(zip(columns, row)) for row in res]

@router.post("/tasks/{task_id}/updates")
def create_task_update(task_id: str, update_text: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    uid = str(uuid.uuid4())
    now = datetime.datetime.now().isoformat()
    conn.execute(
        "INSERT INTO task_updates (id, task_id, update_text, created_at) VALUES (?, ?, ?, ?)",
        [uid, task_id, update_text, now]
    )
    return {"id": uid, "task_id": task_id, "update_text": update_text, "created_at": now}

@router.get("/tasks/{task_id}/activity")
def get_task_activity(task_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    res = conn.execute(
        "SELECT id, task_id, action, description, created_at FROM task_activity WHERE task_id = ? ORDER BY created_at DESC", 
        [task_id]
    ).fetchall()
    
    columns = [desc[0] for desc in conn.description]
    return [dict(zip(columns, row)) for row in res]

@router.post("/tasks/{task_id}/time")
def add_time_spent(task_id: str, payload: TimeSpentUpdate, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    # Increment time spent
    conn.execute("UPDATE tasks SET time_spent_mins = time_spent_mins + ? WHERE id = ?", [payload.minutes, task_id])
    
    row = conn.execute("SELECT time_spent_mins FROM tasks WHERE id = ?", [task_id]).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    
    new_time = row[0]
    log_activity(conn, task_id, "time_spent", f"Added {payload.minutes}m of tracked time.")
    return {"status": "success", "time_spent_mins": new_time}

# --- Slots Endpoints ---

@router.get("/slots", response_model=List[dict])
def get_slots(user_id: str = None, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    if user_id:
        res = conn.execute("SELECT * FROM task_slots WHERE user_id = ? ORDER BY start_time ASC", [user_id]).fetchall()
    else:
        res = conn.execute("SELECT * FROM task_slots ORDER BY start_time ASC").fetchall()
    
    columns = [desc[0] for desc in conn.description]
    return [dict(zip(columns, row)) for row in res]

@router.post("/slots", response_model=dict)
def create_slot(slot: TaskSlot, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    start_str = slot.start_time.isoformat()
    end_str = slot.end_time.isoformat()

    # Check for overlapping slots for the same user
    # Two intervals [start1, end1] and [start2, end2] overlap if start1 < end2 and end1 > start2
    overlap = conn.execute("""
        SELECT id FROM task_slots 
        WHERE user_id = ? 
        AND start_time < ? 
        AND end_time > ?
    """, [slot.user_id, end_str, start_str]).fetchone()

    if overlap:
        raise HTTPException(status_code=409, detail="Time slot overlaps with an existing scheduled task.")

    conn.execute("""
        INSERT INTO task_slots (id, task_id, user_id, start_time, end_time) 
        VALUES (?, ?, ?, ?, ?)
    """, [slot.id, slot.task_id, slot.user_id, start_str, end_str])
    return slot.dict()

@router.delete("/slots/{slot_id}")
def delete_slot(slot_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("DELETE FROM task_slots WHERE id=?", [slot_id])
    return {"status": "success"}

@router.post("/slots/{slot_id}/complete")
def complete_slot(slot_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    # Fetch the slot and compute elapsed time before deleting it
    slot = conn.execute("SELECT task_id, start_time, end_time FROM task_slots WHERE id = ?", [slot_id]).fetchone()
    if not slot:
        raise HTTPException(status_code=404, detail="Task slot not found")

    import datetime
    task_id, start_time, end_time = slot
    if isinstance(start_time, str):
        start_time = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00"))
    if isinstance(end_time, str):
        end_time = datetime.datetime.fromisoformat(end_time.replace("Z", "+00:00"))

    now = datetime.datetime.now(start_time.tzinfo)
    
    # User might complete it after the slot technically ended
    actual_end = min(now, end_time)
    
    # Calculate minutes spent
    elapsed = actual_end - start_time
    minutes_spent = int(elapsed.total_seconds() / 60)

    if minutes_spent > 0:
        conn.execute("UPDATE tasks SET time_spent_mins = time_spent_mins + ? WHERE id = ?", [minutes_spent, task_id])
        log_activity(conn, task_id, "time_spent", f"Slotted time complete. Added {minutes_spent}m of tracked time.")

    conn.execute("DELETE FROM task_slots WHERE id=?", [slot_id])
    return {"status": "success", "minutes_added": minutes_spent}

@router.get("/daily-digest")
def get_daily_digest(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    today = datetime.date.today()
    three_days_out = today + datetime.timedelta(days=3)

    # Tasks due within 3 days that are not yet done
    due_rows = conn.execute("""
        SELECT * FROM tasks
        WHERE status != 'done'
        AND due_date IS NOT NULL
        AND CAST(due_date AS DATE) <= ?
        ORDER BY due_date ASC
    """, [str(three_days_out)]).fetchall()
    due_cols = [desc[0] for desc in conn.description]
    due_soon = [dict(zip(due_cols, row)) for row in due_rows]

    # Slots scheduled for today
    slot_rows = conn.execute("""
        SELECT * FROM task_slots
        WHERE CAST(start_time AS DATE) = ?
        ORDER BY start_time ASC
    """, [str(today)]).fetchall()
    slot_cols = [desc[0] for desc in conn.description]
    today_slots = [dict(zip(slot_cols, row)) for row in slot_rows]

    # Per-sprint health summary
    sprint_rows = conn.execute("""
        SELECT sprint,
               COUNT(*) as total_tasks,
               SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_tasks,
               SUM(COALESCE(time_estimate_mins, 0)) as total_estimate_mins,
               SUM(COALESCE(time_spent_mins, 0)) as total_spent_mins
        FROM tasks
        WHERE sprint IS NOT NULL AND sprint != ''
        GROUP BY sprint
        ORDER BY sprint DESC
    """).fetchall()

    sprint_health = []
    for sprint_id, total, done, est, spent in sprint_rows:
        health_pct = round((done / total) * 100) if total > 0 else 0
        sprint_health.append({
            "sprint_id": sprint_id,
            "total_tasks": total,
            "done_tasks": done,
            "total_estimate_mins": est,
            "total_spent_mins": spent,
            "health_pct": health_pct
        })

    return {"due_soon": due_soon, "today_slots": today_slots, "sprint_health": sprint_health}


@router.get("/insights/burndown")
def get_insights_burndown(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    rows = conn.execute("""
        SELECT sprint,
               COUNT(*) as task_count,
               SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_count,
               SUM(COALESCE(time_estimate_mins, 0)) as total_estimate_mins,
               SUM(COALESCE(time_spent_mins, 0)) as spent_mins
        FROM tasks
        WHERE sprint IS NOT NULL AND sprint != ''
        GROUP BY sprint
        ORDER BY sprint ASC
    """).fetchall()

    return [
        {
            "sprint_id": sprint_id,
            "task_count": task_count,
            "done_count": done_count,
            "total_estimate_mins": total_estimate,
            "spent_mins": spent,
            "remaining_mins": max(0, total_estimate - spent)
        }
        for sprint_id, task_count, done_count, total_estimate, spent in rows
    ]


@router.get("/insights/velocity")
def get_insights_velocity(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    rows = conn.execute("""
        SELECT sprint,
               COUNT(*) as tasks_completed,
               SUM(COALESCE(time_spent_mins, 0)) as total_spent_mins
        FROM tasks
        WHERE status = 'done'
        AND sprint IS NOT NULL AND sprint != ''
        GROUP BY sprint
        ORDER BY sprint ASC
    """).fetchall()

    return [
        {
            "sprint_id": sprint_id,
            "tasks_completed": tasks_completed,
            "hours_logged": round(total_spent_mins / 60, 2)
        }
        for sprint_id, tasks_completed, total_spent_mins in rows
    ]


@router.get("/insights/accuracy")
def get_insights_accuracy(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    rows = conn.execute("""
        SELECT t.user_id, u.name as user_name,
               ROUND(AVG(t.time_estimate_mins)) as avg_estimate_mins,
               ROUND(AVG(t.time_spent_mins)) as avg_actual_mins,
               COUNT(*) as task_count
        FROM tasks t
        JOIN users u ON t.user_id = u.id
        WHERE t.time_estimate_mins IS NOT NULL
        AND t.time_estimate_mins > 0
        AND t.time_spent_mins > 0
        GROUP BY t.user_id, u.name
        ORDER BY u.name ASC
    """).fetchall()

    return [
        {
            "user_id": user_id,
            "user_name": user_name,
            "avg_estimate_mins": int(avg_estimate),
            "avg_actual_mins": int(avg_actual),
            "task_count": task_count
        }
        for user_id, user_name, avg_estimate, avg_actual, task_count in rows
    ]


# --- Recurring Task Helper ---

def _create_recurring_next(conn, completed_task: Task):
    """Auto-create the next instance of a recurring task."""
    rule = completed_task.recurrence_rule
    deltas = {"daily": 1, "weekly": 7, "biweekly": 14}
    days = deltas.get(rule, 7)

    new_id = "t_" + str(uuid.uuid4())[:8]
    new_due = None
    if completed_task.due_date:
        old_due = completed_task.due_date
        if isinstance(old_due, str):
            old_due = datetime.datetime.fromisoformat(old_due.replace("Z", "+00:00"))
        new_due = (old_due + datetime.timedelta(days=days)).isoformat()

    conn.execute("""
        INSERT INTO tasks (id, title, description, status, user_id, priority, time_estimate_mins, time_spent_mins, recurrence_rule, due_date)
        VALUES (?, ?, ?, 'current', ?, ?, ?, 0, ?, ?)
    """, [new_id, completed_task.title, completed_task.description, completed_task.user_id,
          completed_task.priority, completed_task.time_estimate_mins, rule, new_due])
    log_activity(conn, new_id, "created", f"Auto-created recurring task (rule: {rule})")


# --- Notifications ---

@router.get("/notifications")
def get_notifications(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    now = datetime.datetime.now()
    today = now.date()
    three_days_out = today + datetime.timedelta(days=3)
    fifteen_min_out = now + datetime.timedelta(minutes=15)

    notifications = []

    # Stale tasks (next_update_date is past)
    stale = conn.execute("""
        SELECT id, title, next_update_date FROM tasks
        WHERE status NOT IN ('done') AND next_update_date IS NOT NULL
        AND CAST(next_update_date AS DATE) < ?
    """, [str(today)]).fetchall()
    for task_id, title, nud in stale:
        notifications.append({"type": "stale", "task_id": task_id, "message": f"'{title}' update is overdue", "severity": "warning"})

    # Due soon (within 3 days)
    due_soon = conn.execute("""
        SELECT id, title, due_date FROM tasks
        WHERE status != 'done' AND due_date IS NOT NULL
        AND CAST(due_date AS DATE) <= ? AND CAST(due_date AS DATE) >= ?
    """, [str(three_days_out), str(today)]).fetchall()
    for task_id, title, dd in due_soon:
        notifications.append({"type": "due_soon", "task_id": task_id, "message": f"'{title}' is due soon", "severity": "info"})

    # Overdue
    overdue = conn.execute("""
        SELECT id, title, due_date FROM tasks
        WHERE status != 'done' AND due_date IS NOT NULL
        AND CAST(due_date AS DATE) < ?
    """, [str(today)]).fetchall()
    for task_id, title, dd in overdue:
        notifications.append({"type": "overdue", "task_id": task_id, "message": f"'{title}' is overdue!", "severity": "error"})

    # Upcoming slots (within 15 min)
    upcoming_slots = conn.execute("""
        SELECT s.id, t.title, s.start_time FROM task_slots s
        JOIN tasks t ON s.task_id = t.id
        WHERE s.start_time > ? AND s.start_time <= ?
    """, [now.isoformat(), fifteen_min_out.isoformat()]).fetchall()
    for slot_id, title, st in upcoming_slots:
        notifications.append({"type": "slot_reminder", "slot_id": slot_id, "message": f"'{title}' starts soon", "severity": "info"})

    return notifications


# --- Task Dependencies ---

@router.post("/tasks/{task_id}/dependencies")
def add_dependency(task_id: str, blocker_task_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    dep_id = str(uuid.uuid4())
    now = datetime.datetime.now().isoformat()
    conn.execute(
        "INSERT INTO task_dependencies (id, blocker_task_id, blocked_task_id, created_at) VALUES (?, ?, ?, ?)",
        [dep_id, blocker_task_id, task_id, now]
    )
    log_activity(conn, task_id, "dependency_added", f"Now blocked by task {blocker_task_id}")
    return {"id": dep_id, "blocker_task_id": blocker_task_id, "blocked_task_id": task_id}

@router.get("/tasks/{task_id}/dependencies")
def get_dependencies(task_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    # Tasks blocking this one
    blockers = conn.execute("""
        SELECT d.id as dep_id, d.blocker_task_id, t.title as blocker_title, t.status as blocker_status
        FROM task_dependencies d JOIN tasks t ON d.blocker_task_id = t.id
        WHERE d.blocked_task_id = ?
    """, [task_id]).fetchall()

    # Tasks blocked by this one
    blocking = conn.execute("""
        SELECT d.id as dep_id, d.blocked_task_id, t.title as blocked_title, t.status as blocked_status
        FROM task_dependencies d JOIN tasks t ON d.blocked_task_id = t.id
        WHERE d.blocker_task_id = ?
    """, [task_id]).fetchall()

    return {
        "blocked_by": [{"dep_id": r[0], "task_id": r[1], "title": r[2], "status": r[3]} for r in blockers],
        "blocking": [{"dep_id": r[0], "task_id": r[1], "title": r[2], "status": r[3]} for r in blocking]
    }

@router.delete("/dependencies/{dep_id}")
def delete_dependency(dep_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("DELETE FROM task_dependencies WHERE id=?", [dep_id])
    return {"status": "success"}


# --- Retrospectives ---

@router.get("/retros")
def list_retros(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    rows = conn.execute("SELECT * FROM retrospectives ORDER BY created_at DESC").fetchall()
    cols = [d[0] for d in conn.description]
    return [dict(zip(cols, r)) for r in rows]

@router.get("/retros/{sprint_id}")
def get_retro(sprint_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    row = conn.execute("SELECT * FROM retrospectives WHERE sprint_id = ?", [sprint_id]).fetchone()
    if row:
        cols = [d[0] for d in conn.description]
        return dict(zip(cols, row))
    # Auto-generate draft with sprint stats
    stats = conn.execute("""
        SELECT COUNT(*) as total, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
               SUM(COALESCE(time_estimate_mins,0)) as est, SUM(COALESCE(time_spent_mins,0)) as spent
        FROM tasks WHERE sprint = ?
    """, [sprint_id]).fetchone()
    return {
        "id": None, "sprint_id": sprint_id,
        "went_well": "", "to_improve": "", "action_items": "",
        "stats": {"total_tasks": stats[0], "done_tasks": stats[1],
                  "estimated_mins": stats[2], "spent_mins": stats[3]}
    }

@router.post("/retros")
def save_retro(retro: Retrospective, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    now = datetime.datetime.now().isoformat()
    # Upsert
    existing = conn.execute("SELECT id FROM retrospectives WHERE sprint_id = ?", [retro.sprint_id]).fetchone()
    if existing:
        conn.execute("""
            UPDATE retrospectives SET went_well=?, to_improve=?, action_items=? WHERE sprint_id=?
        """, [retro.went_well, retro.to_improve, retro.action_items, retro.sprint_id])
        return {**retro.dict(), "id": existing[0], "created_at": now}
    else:
        conn.execute("""
            INSERT INTO retrospectives (id, sprint_id, went_well, to_improve, action_items, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, [retro.id, retro.sprint_id, retro.went_well, retro.to_improve, retro.action_items, now])
        return {**retro.dict(), "created_at": now}


# --- Bulk Export / Import ---

@router.get("/tasks/export")
def export_tasks(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    rows = conn.execute("SELECT * FROM tasks").fetchall()
    cols = [d[0] for d in conn.description]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=cols)
    writer.writeheader()
    for row in rows:
        writer.writerow(dict(zip(cols, row)))
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tasks_export.csv"}
    )

@router.post("/tasks/import")
async def import_tasks(file: UploadFile = File(...), conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    imported = 0
    for row in reader:
        task_id = row.get("id", "t_" + str(uuid.uuid4())[:8])
        title = row.get("title", "Imported Task")
        status = row.get("status", "to_be_classified")
        conn.execute("""
            INSERT INTO tasks (id, title, description, status, user_id, priority, time_estimate_mins, time_spent_mins)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, [task_id, title, row.get("description", ""), status,
              row.get("user_id", ""), row.get("priority", "p2"),
              int(row["time_estimate_mins"]) if row.get("time_estimate_mins") else None,
              int(row.get("time_spent_mins", 0) or 0)])
        imported += 1
    return {"status": "success", "imported_count": imported}


# --- Task Notes ---

@router.post("/tasks/{task_id}/notes", response_model=TaskNote)
def create_note(task_id: str, note: TaskNote, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    now = datetime.datetime.now().isoformat()
    conn.execute("""
        INSERT INTO task_notes (id, task_id, title, content, is_published, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, [note.id, task_id, note.title, note.content, note.is_published, now, now])
    row = conn.execute("SELECT * FROM task_notes WHERE id = ?", [note.id]).fetchone()
    cols = [d[0] for d in conn.description]
    return dict(zip(cols, row))

@router.get("/tasks/{task_id}/notes")
def get_notes(task_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    rows = conn.execute(
        "SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at DESC", [task_id]
    ).fetchall()
    cols = [d[0] for d in conn.description]
    return [dict(zip(cols, r)) for r in rows]

@router.put("/notes/{note_id}", response_model=TaskNote)
def update_note(note_id: str, note: TaskNote, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    now = datetime.datetime.now().isoformat()
    conn.execute("""
        UPDATE task_notes SET title=?, content=?, is_published=?, updated_at=? WHERE id=?
    """, [note.title, note.content, note.is_published, now, note_id])
    row = conn.execute("SELECT * FROM task_notes WHERE id = ?", [note_id]).fetchone()
    cols = [d[0] for d in conn.description]
    return dict(zip(cols, row))

@router.delete("/notes/{note_id}")
def delete_note(note_id: str, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    conn.execute("DELETE FROM task_notes WHERE id = ?", [note_id])
    return {"status": "success"}

@router.get("/notes/catalog")
def get_catalog(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    rows = conn.execute("""
        SELECT n.id, n.task_id, n.title, n.content, n.is_published, n.created_at, n.updated_at,
               t.title as task_title
        FROM task_notes n
        JOIN tasks t ON n.task_id = t.id
        WHERE n.is_published = TRUE
        ORDER BY n.updated_at DESC
    """).fetchall()
    cols = ["id", "task_id", "title", "content", "is_published", "created_at", "updated_at", "task_title"]
    return [dict(zip(cols, r)) for r in rows]


# --- AI ---

@router.post("/ai/summary")
def get_ai_summary(conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    agent = AIAgent(conn)
    summary = agent.generate_summary()
    return {"summary": summary}

@router.post("/ai/chat")
def ai_chat(request: ChatRequest, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    agent = AIAgent(conn)
    result = agent.ask_question(request.query)
    return result


# --- Code Execution ---

@router.post("/execute", response_model=CodeExecutionResponse)
def execute_code_endpoint(request: CodeExecutionRequest):
    from code_executor import execute_code, SUPPORTED_LANGUAGES
    if request.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {request.language}. Supported: {', '.join(sorted(SUPPORTED_LANGUAGES))}")
    result = execute_code(request.language, request.code)
    return CodeExecutionResponse(
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        timed_out=result.timed_out,
    )


