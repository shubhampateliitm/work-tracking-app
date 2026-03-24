from fastapi.testclient import TestClient

def test_read_root(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "Work tracking API is running"}

def test_user_lifecycle(client: TestClient):
    # 1. Create User
    user_data = {"id": "u1", "name": "Test User", "role": "Tester", "is_active": True}
    response = client.post("/users", json=user_data)
    assert response.status_code == 200
    assert response.json()["name"] == "Test User"
    
    # 2. Get Users
    response = client.get("/users")
    assert response.status_code == 200
    users = response.json()
    assert len(users) == 1
    assert users[0]["id"] == "u1"
    
    # 3. Disable User
    user_data["is_active"] = False
    response = client.put("/users/u1", json=user_data)
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    # 4. Delete User
    response = client.delete("/users/u1")
    assert response.status_code == 200
    
    response = client.get("/users")
    assert len(response.json()) == 0

def test_task_lifecycle(client: TestClient):
    # Setup user
    client.post("/users", json={"id": "u1", "name": "Worker", "role": "Dev", "is_active": True})

    # 1. Create Task
    task_data = {
        "id": "t1",
        "title": "Build Test Suite",
        "description": "Comprehensive tests",
        "status": "to_be_classified",
        "user_id": "u1",
        "week": None,
        "next_update_date": None,
        "due_date": "2026-12-31T23:59:59Z",
        "feedback": None
    }
    response = client.post("/tasks", json=task_data)
    assert response.status_code == 200
    
    # 2. Get Tasks
    response = client.get("/tasks")
    assert response.status_code == 200
    tasks = response.json()
    assert len(tasks) == 1
    assert tasks[0]["id"] == "t1"
    
    # 3. Post Update
    response = client.post("/tasks/t1/updates?update_text=Started testing")
    assert response.status_code == 200
    assert "id" in response.json()
    assert response.json()["update_text"] == "Started testing"

    # 4. Get Updates
    response = client.get("/tasks/t1/updates")
    assert response.status_code == 200
    updates = response.json()
    assert len(updates) == 1
    assert updates[0]["update_text"] == "Started testing"

    # 5. Update Task (Mark Done + Feedback)
    task_data["status"] = "done"
    task_data["feedback"] = "Tests completed successfully"
    task_data["week"] = "2026-03-09"
    response = client.put("/tasks/t1", json=task_data)
    assert response.status_code == 200

    # 6. Verify Weekly Closed Tasks
    response = client.get("/weekly-closed-tasks")
    assert response.status_code == 200
    weekly = response.json()
    assert "2026-03-09" in weekly
    assert len(weekly["2026-03-09"]) == 1
    assert weekly["2026-03-09"][0]["id"] == "t1"
    
    # 7. Delete Task
    response = client.delete("/tasks/t1")
    assert response.status_code == 200
    response = client.get("/tasks")
    assert len(response.json()) == 0

def test_team_focus(client: TestClient):
    client.post("/users", json={"id": "u2", "name": "Team Dev", "role": "Dev", "is_active": True})
    client.post("/tasks", json={
        "id": "t2", "title": "Team Task", "description": "",
        "status": "current", "user_id": "u2", "week": None,
        "next_update_date": None, "due_date": None, "feedback": None
    })
    
    response = client.get("/team-focus")
    assert response.status_code == 200
    focus = response.json()
    assert "Team Dev" in focus
    assert len(focus["Team Dev"]) == 1
    assert focus["Team Dev"][0]["id"] == "t2"

def test_task_activity_log(client: TestClient):
    # Setup user
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})

    # 1. Create task — should auto-log "Task created"
    task_data = {
        "id": "t1", "title": "Build Feature", "description": "Desc",
        "status": "to_be_classified", "user_id": "u1", "week": None,
        "next_update_date": None, "due_date": None, "feedback": None
    }
    client.post("/tasks", json=task_data)

    # 2. Get activity — should have 1 entry
    response = client.get("/tasks/t1/activity")
    assert response.status_code == 200
    activity = response.json()
    assert len(activity) >= 1
    assert activity[0]["action"] == "created"
    assert "created" in activity[0]["description"].lower()

    # 3. Update task — change status and rename
    task_data["status"] = "current"
    task_data["title"] = "Build Feature v2"
    client.put("/tasks/t1", json=task_data)

    response = client.get("/tasks/t1/activity")
    activity = response.json()
    # Should have at least 3 entries: created + status_changed + renamed
    assert len(activity) >= 3
    actions = [a["action"] for a in activity]
    assert "status_changed" in actions
    assert "renamed" in actions

    # 4. Reassign task
    client.post("/users", json={"id": "u2", "name": "Bob", "role": "Dev", "is_active": True})
    task_data["user_id"] = "u2"
    client.put("/tasks/t1", json=task_data)

    response = client.get("/tasks/t1/activity")
    activity = response.json()
    actions = [a["action"] for a in activity]
    assert "assigned" in actions
    # Verify names are resolved, not raw IDs
    assigned_entry = next(a for a in activity if a["action"] == "assigned")
    assert "Bob" in assigned_entry["description"]
    assert "Alice" in assigned_entry["description"]

    # 5. Set due date
    task_data["due_date"] = "2026-12-31T23:59:59Z"
    client.put("/tasks/t1", json=task_data)

    response = client.get("/tasks/t1/activity")
    activity = response.json()
    actions = [a["action"] for a in activity]
    assert "due_date_changed" in actions

def test_time_tracking(client, db):
    # Setup user and task
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})
    task_data = {
        "id": "time_task", "title": "Track Me", "description": "", 
        "status": "current", "user_id": "u1", "time_estimate_mins": 120
    }
    client.post("/tasks", json=task_data)

    # Increment time
    resp = client.post("/tasks/time_task/time", json={"minutes": 30})
    assert resp.status_code == 200
    assert resp.json()["time_spent_mins"] == 30

    resp = client.post("/tasks/time_task/time", json={"minutes": 15})
    assert resp.json()["time_spent_mins"] == 45

    # Verify task fetch includes time
    resp = client.get("/tasks")
    tasks = resp.json()
    t = next(t for t in tasks if t["id"] == "time_task")
    assert t["time_spent_mins"] == 45
    assert t["time_estimate_mins"] == 120

    # Verify activity was logged
    resp = client.get("/tasks/time_task/activity")
    acts = resp.json()
    assert any(a["action"] == "time_spent" and "15m" in a["description"] for a in acts)

def test_task_slots(client, db):
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})
    task_data = {"id": "slot_task", "title": "Slot Me", "description": "", "status": "current", "user_id": "u1"}
    client.post("/tasks", json=task_data)

    slot_data = {
        "id": "slot_1",
        "task_id": "slot_task",
        "user_id": "u1",
        "start_time": "2026-03-20T10:00:00Z",
        "end_time": "2026-03-20T11:00:00Z"
    }

    # Create slot
    resp = client.post("/slots", json=slot_data)
    assert resp.status_code == 200
    
    # Get slots for user
    resp = client.get("/slots?user_id=u1")
    assert resp.status_code == 200
    slots = resp.json()
    assert len(slots) == 1
    assert slots[0]["task_id"] == "slot_task"

    # Delete slot
    resp = client.delete("/slots/slot_1")
    assert resp.status_code == 200

    resp = client.get("/slots?user_id=u1")
    assert len(resp.json()) == 0

def test_slot_completion(client, db):
    # Setup user and task
    client.post("/users", json={"id": "u2", "name": "Bob", "role": "Dev", "is_active": True})
    client.post("/tasks", json={"id": "comp_task", "title": "Complete Me", "description": "", "status": "current", "user_id": "u2"})

    from datetime import datetime, timedelta
    now = datetime.now()
    
    # Create a slot that started 30 mins ago and ends 30 mins in the future
    start_time = now - timedelta(minutes=30)
    end_time = now + timedelta(minutes=30)
    
    slot_data = {
        "id": "slot_2",
        "task_id": "comp_task",
        "user_id": "u2",
        "start_time": start_time.isoformat() + "Z",
        "end_time": end_time.isoformat() + "Z"
    }

    resp = client.post("/slots", json=slot_data)
    assert resp.status_code == 200

    # Complete the slot
    resp = client.post("/slots/slot_2/complete")
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["status"] == "success"
    # Elapsed time should be around 30 minutes
    assert abs(res_data["minutes_added"] - 30) <= 1

    # Verify slot is gone
    resp = client.get("/slots?user_id=u2")
    assert len(resp.json()) == 0

    # Verify task time_spent_mins was updated
    resp = client.get("/tasks")
    t = next(t for t in resp.json() if t["id"] == "comp_task")
    assert abs(t["time_spent_mins"] - 30) <= 1

def test_code_execution_disabled_returns_503(client: TestClient, monkeypatch):
    monkeypatch.setenv("CODE_EXECUTION_ENABLED", "false")

    response = client.post("/execute", json={"language": "python", "code": "print('hi')"})

    assert response.status_code == 503
    assert "Code execution is disabled" in response.json()["detail"]


def test_sprint_field_persistence(client: TestClient):
    """Tasks can be assigned to sprints and the sprint field is persisted."""
    # Setup user
    client.post("/users", json={"id": "u1", "name": "Worker", "role": "Dev", "is_active": True})

    # Create task with no sprint
    task_data = {
        "id": "t_sprint",
        "title": "Sprint Task",
        "description": "Test sprint field",
        "status": "current",
        "user_id": "u1",
        "week": None,
        "next_update_date": None,
        "due_date": None,
        "feedback": None,
        "time_estimate_mins": 480,
        "time_spent_mins": 0,
        "sprint": None
    }
    resp = client.post("/tasks", json=task_data)
    assert resp.status_code == 200
    assert resp.json()["sprint"] is None

    # Assign to a sprint
    task_data["sprint"] = "2026-Q1-S3-20260115"
    resp = client.put("/tasks/t_sprint", json=task_data)
    assert resp.status_code == 200
    assert resp.json()["sprint"] == "2026-Q1-S3-20260115"

    # Verify persistence via GET
    resp = client.get("/tasks")
    t = next(t for t in resp.json() if t["id"] == "t_sprint")
    assert t["sprint"] == "2026-Q1-S3-20260115"


def test_priority_field(client: TestClient):
    """Tasks have a priority field defaulting to 'p2'; can be set to p1/p3."""
    client.post("/users", json={"id": "u1", "name": "Worker", "role": "Dev", "is_active": True})

    # Create task without explicit priority — should default to p2
    resp = client.post("/tasks", json={"id": "prio_t1", "title": "Priority Test", "description": "",
                                       "status": "current", "user_id": "u1"})
    assert resp.status_code == 200
    assert resp.json()["priority"] == "p2"

    # Update to p1
    updated = {**resp.json(), "priority": "p1"}
    resp = client.put("/tasks/prio_t1", json=updated)
    assert resp.status_code == 200
    assert resp.json()["priority"] == "p1"

    # Verify persistence via GET
    resp = client.get("/tasks")
    t = next(t for t in resp.json() if t["id"] == "prio_t1")
    assert t["priority"] == "p1"


def test_user_capacity_field(client: TestClient):
    """Users have a capacity_hours_per_sprint field defaulting to 60."""
    # Create user without explicit capacity
    resp = client.post("/users", json={"id": "cap_u1", "name": "Default Cap", "role": "Dev", "is_active": True})
    assert resp.status_code == 200
    assert resp.json()["capacity_hours_per_sprint"] == 60

    # Create user with custom capacity
    resp = client.post("/users", json={
        "id": "cap_u2", "name": "Custom Cap", "role": "PM", "is_active": True,
        "capacity_hours_per_sprint": 48
    })
    assert resp.status_code == 200
    assert resp.json()["capacity_hours_per_sprint"] == 48

    # Verify via GET
    resp = client.get("/users")
    users = resp.json()
    u1 = next(u for u in users if u["id"] == "cap_u1")
    u2 = next(u for u in users if u["id"] == "cap_u2")
    assert u1["capacity_hours_per_sprint"] == 60
    assert u2["capacity_hours_per_sprint"] == 48


def test_daily_digest(client, db):
    """Daily digest returns due_soon tasks, today's slots, and sprint health."""
    from datetime import datetime, timedelta
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})

    # Task due in 2 days — should appear in due_soon
    due_soon_date = (datetime.now() + timedelta(days=2)).isoformat()
    client.post("/tasks", json={
        "id": "t_due", "title": "Due Soon Task", "description": "",
        "status": "current", "user_id": "u1", "due_date": due_soon_date
    })

    # Task due in 10 days — should NOT appear
    far_date = (datetime.now() + timedelta(days=10)).isoformat()
    client.post("/tasks", json={
        "id": "t_far", "title": "Far Task", "description": "",
        "status": "current", "user_id": "u1", "due_date": far_date
    })

    # Done task with near due date — should NOT appear
    client.post("/tasks", json={
        "id": "t_done_due", "title": "Done Due Task", "description": "",
        "status": "done", "user_id": "u1", "due_date": due_soon_date
    })

    # Sprint task — should appear in sprint_health
    client.post("/tasks", json={
        "id": "t_sprint", "title": "Sprint Task", "description": "",
        "status": "current", "user_id": "u1",
        "sprint": "2026-Q1-S6-20260311",
        "time_estimate_mins": 120, "time_spent_mins": 30
    })

    # Today's slot
    now = datetime.now()
    slot_start = now.replace(hour=14, minute=0, second=0, microsecond=0)
    slot_end = now.replace(hour=15, minute=0, second=0, microsecond=0)
    client.post("/slots", json={
        "id": "s_today", "task_id": "t_due", "user_id": "u1",
        "start_time": slot_start.isoformat(),
        "end_time": slot_end.isoformat()
    })

    resp = client.get("/daily-digest")
    assert resp.status_code == 200
    data = resp.json()
    assert "due_soon" in data
    assert "today_slots" in data
    assert "sprint_health" in data

    due_ids = [t["id"] for t in data["due_soon"]]
    assert "t_due" in due_ids
    assert "t_far" not in due_ids
    assert "t_done_due" not in due_ids

    slot_ids = [s["id"] for s in data["today_slots"]]
    assert "s_today" in slot_ids

    sprint_ids = [s["sprint_id"] for s in data["sprint_health"]]
    assert "2026-Q1-S6-20260311" in sprint_ids


def test_insights_burndown(client, db):
    """Burndown returns per-sprint estimate/spent/remaining totals."""
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})

    # Sprint S3: 2 tasks (1 in-progress, 1 done)
    client.post("/tasks", json={
        "id": "b_t1", "title": "B Task 1", "description": "",
        "status": "current", "user_id": "u1",
        "sprint": "2026-Q1-S3-20260115",
        "time_estimate_mins": 120, "time_spent_mins": 60
    })
    client.post("/tasks", json={
        "id": "b_t2", "title": "B Task 2", "description": "",
        "status": "done", "user_id": "u1",
        "sprint": "2026-Q1-S3-20260115",
        "time_estimate_mins": 60, "time_spent_mins": 60
    })

    # Sprint S4: 1 task
    client.post("/tasks", json={
        "id": "b_t3", "title": "B Task 3", "description": "",
        "status": "current", "user_id": "u1",
        "sprint": "2026-Q1-S4-20260129",
        "time_estimate_mins": 180, "time_spent_mins": 30
    })

    resp = client.get("/insights/burndown")
    assert resp.status_code == 200
    data = resp.json()

    sprint_ids = [d["sprint_id"] for d in data]
    assert "2026-Q1-S3-20260115" in sprint_ids
    assert "2026-Q1-S4-20260129" in sprint_ids

    s3 = next(d for d in data if d["sprint_id"] == "2026-Q1-S3-20260115")
    assert s3["total_estimate_mins"] == 180
    assert s3["spent_mins"] == 120
    assert s3["remaining_mins"] == 60
    assert s3["task_count"] == 2
    assert s3["done_count"] == 1


def test_insights_velocity(client, db):
    """Velocity returns per-sprint completed task count and logged hours."""
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})

    # 2 done tasks in sprint S3
    for i in range(2):
        client.post("/tasks", json={
            "id": f"v_t{i}", "title": f"V Task {i}", "description": "",
            "status": "done", "user_id": "u1",
            "sprint": "2026-Q1-S3-20260115",
            "time_estimate_mins": 60, "time_spent_mins": 50
        })

    # 1 in-progress task in S3 — should NOT count toward velocity
    client.post("/tasks", json={
        "id": "v_t_ip", "title": "In Progress", "description": "",
        "status": "current", "user_id": "u1",
        "sprint": "2026-Q1-S3-20260115",
        "time_estimate_mins": 60, "time_spent_mins": 20
    })

    # 1 done task in S4
    client.post("/tasks", json={
        "id": "v_t2", "title": "V S4 Task", "description": "",
        "status": "done", "user_id": "u1",
        "sprint": "2026-Q1-S4-20260129",
        "time_estimate_mins": 90, "time_spent_mins": 80
    })

    resp = client.get("/insights/velocity")
    assert resp.status_code == 200
    data = resp.json()

    s3 = next((d for d in data if d["sprint_id"] == "2026-Q1-S3-20260115"), None)
    assert s3 is not None
    assert s3["tasks_completed"] == 2
    assert abs(s3["hours_logged"] - round(100 / 60, 2)) < 0.01

    s4 = next((d for d in data if d["sprint_id"] == "2026-Q1-S4-20260129"), None)
    assert s4 is not None
    assert s4["tasks_completed"] == 1
    assert abs(s4["hours_logged"] - round(80 / 60, 2)) < 0.01


def test_insights_accuracy(client, db):
    """Accuracy returns per-user average estimate vs actual time."""
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})
    client.post("/users", json={"id": "u2", "name": "Bob", "role": "Dev", "is_active": True})

    # Alice: 2 done tasks
    client.post("/tasks", json={
        "id": "acc_t1", "title": "Alice T1", "description": "",
        "status": "done", "user_id": "u1",
        "time_estimate_mins": 120, "time_spent_mins": 90
    })
    client.post("/tasks", json={
        "id": "acc_t2", "title": "Alice T2", "description": "",
        "status": "done", "user_id": "u1",
        "time_estimate_mins": 60, "time_spent_mins": 70
    })

    # Bob: 1 done task
    client.post("/tasks", json={
        "id": "acc_t3", "title": "Bob T1", "description": "",
        "status": "done", "user_id": "u2",
        "time_estimate_mins": 90, "time_spent_mins": 90
    })

    # Task with no estimate — should be excluded from accuracy
    client.post("/tasks", json={
        "id": "acc_t4", "title": "No Estimate", "description": "",
        "status": "done", "user_id": "u1"
    })

    # Task with zero time_spent — should be excluded
    client.post("/tasks", json={
        "id": "acc_t5", "title": "No Spent", "description": "",
        "status": "done", "user_id": "u1",
        "time_estimate_mins": 60, "time_spent_mins": 0
    })

    resp = client.get("/insights/accuracy")
    assert resp.status_code == 200
    data = resp.json()

    alice = next((d for d in data if d["user_id"] == "u1"), None)
    assert alice is not None
    assert alice["user_name"] == "Alice"
    assert alice["avg_estimate_mins"] == 90   # (120 + 60) / 2
    assert alice["avg_actual_mins"] == 80     # (90 + 70) / 2
    assert alice["task_count"] == 2

    bob = next((d for d in data if d["user_id"] == "u2"), None)
    assert bob is not None
    assert bob["avg_estimate_mins"] == 90
    assert bob["avg_actual_mins"] == 90


def test_recurring_task(client, db):
    """Completing a recurring task auto-creates the next instance."""
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})

    task_data = {
        "id": "rec_t1", "title": "Weekly Standup", "description": "Prep",
        "status": "current", "user_id": "u1",
        "due_date": "2026-03-20T09:00:00Z",
        "recurrence_rule": "weekly"
    }
    client.post("/tasks", json=task_data)

    # Complete the task
    task_data["status"] = "done"
    task_data["week"] = "2026-03-19"
    resp = client.put("/tasks/rec_t1", json=task_data)
    assert resp.status_code == 200

    # Verify a new instance was auto-created
    resp = client.get("/tasks")
    tasks = resp.json()
    recurring_tasks = [t for t in tasks if t["title"] == "Weekly Standup" and t["status"] == "current"]
    assert len(recurring_tasks) == 1
    new_task = recurring_tasks[0]
    assert new_task["recurrence_rule"] == "weekly"
    assert new_task["id"] != "rec_t1"
    # Due date should be shifted by 7 days
    assert "2026-03-27" in new_task["due_date"]


def test_notifications(client, db):
    """Notifications endpoint returns stale, due_soon, overdue, slot_reminder items."""
    from datetime import datetime, timedelta
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})

    # Overdue task
    past_due = (datetime.now() - timedelta(days=2)).isoformat()
    client.post("/tasks", json={
        "id": "n_overdue", "title": "Overdue Task", "description": "",
        "status": "current", "user_id": "u1", "due_date": past_due
    })

    # Stale task
    past_update = (datetime.now() - timedelta(days=3)).isoformat()
    client.post("/tasks", json={
        "id": "n_stale", "title": "Stale Task", "description": "",
        "status": "current", "user_id": "u1", "next_update_date": past_update
    })

    resp = client.get("/notifications")
    assert resp.status_code == 200
    notifs = resp.json()
    types = [n["type"] for n in notifs]
    assert "overdue" in types
    assert "stale" in types


def test_task_dependencies(client, db):
    """Dependencies: add, get, and remove."""
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})
    client.post("/tasks", json={"id": "dep_a", "title": "Task A", "description": "", "status": "current", "user_id": "u1"})
    client.post("/tasks", json={"id": "dep_b", "title": "Task B", "description": "", "status": "current", "user_id": "u1"})

    # B is blocked by A
    resp = client.post("/tasks/dep_b/dependencies?blocker_task_id=dep_a")
    assert resp.status_code == 200
    dep_id = resp.json()["id"]

    # Get dependencies for B
    resp = client.get("/tasks/dep_b/dependencies")
    data = resp.json()
    assert len(data["blocked_by"]) == 1
    assert data["blocked_by"][0]["task_id"] == "dep_a"

    # Get dependencies for A (it blocks B)
    resp = client.get("/tasks/dep_a/dependencies")
    data = resp.json()
    assert len(data["blocking"]) == 1
    assert data["blocking"][0]["task_id"] == "dep_b"

    # Remove dependency
    resp = client.delete(f"/dependencies/{dep_id}")
    assert resp.status_code == 200
    resp = client.get("/tasks/dep_b/dependencies")
    assert len(resp.json()["blocked_by"]) == 0


def test_retrospectives(client, db):
    """CRUD for sprint retrospectives."""
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})
    client.post("/tasks", json={
        "id": "retro_t1", "title": "Retro Task", "description": "",
        "status": "done", "user_id": "u1", "sprint": "2026-Q1-S3-20260115",
        "time_estimate_mins": 120, "time_spent_mins": 100
    })

    # Get draft retro (no saved retro yet)
    resp = client.get("/retros/2026-Q1-S3-20260115")
    assert resp.status_code == 200
    draft = resp.json()
    assert draft["id"] is None
    assert draft["stats"]["total_tasks"] == 1

    # Save retro
    retro = {
        "id": "r1", "sprint_id": "2026-Q1-S3-20260115",
        "went_well": "Good velocity", "to_improve": "Better estimates",
        "action_items": "Add buffer to estimates"
    }
    resp = client.post("/retros", json=retro)
    assert resp.status_code == 200

    # Get saved retro
    resp = client.get("/retros/2026-Q1-S3-20260115")
    data = resp.json()
    assert data["went_well"] == "Good velocity"

    # List all retros
    resp = client.get("/retros")
    assert len(resp.json()) == 1


def test_task_notes(client, db):
    """CRUD for task notes: create, read, update, delete."""
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})
    client.post("/tasks", json={"id": "note_t1", "title": "Task With Notes", "description": "", "status": "current", "user_id": "u1"})

    # Create a note
    note = {"id": "n1", "task_id": "note_t1", "title": "Design Decisions", "content": "## Overview\nUsed TDD approach.", "is_published": False}
    resp = client.post("/tasks/note_t1/notes", json=note)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "n1"
    assert data["title"] == "Design Decisions"
    assert data["is_published"] is False

    # Get notes for task
    resp = client.get("/tasks/note_t1/notes")
    assert resp.status_code == 200
    notes = resp.json()
    assert len(notes) == 1
    assert notes[0]["content"] == "## Overview\nUsed TDD approach."

    # Update note content and publish it
    updated = {**note, "title": "Design Decisions (Final)", "content": "## Overview\nUsed TDD. All tests pass.", "is_published": True}
    resp = client.put("/notes/n1", json=updated)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Design Decisions (Final)"
    assert resp.json()["is_published"] is True

    # Delete note
    resp = client.delete("/notes/n1")
    assert resp.status_code == 200
    resp = client.get("/tasks/note_t1/notes")
    assert len(resp.json()) == 0


def test_notes_catalog(client, db):
    """Published notes appear in catalog; unpublished notes do not."""
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})
    client.post("/tasks", json={"id": "cat_t1", "title": "Task A", "description": "", "status": "current", "user_id": "u1"})
    client.post("/tasks", json={"id": "cat_t2", "title": "Task B", "description": "", "status": "current", "user_id": "u1"})

    # Published note on task A
    client.post("/tasks/cat_t1/notes", json={"id": "pub_n1", "task_id": "cat_t1", "title": "Published Note", "content": "# Public content", "is_published": True})
    # Draft note on task A — should NOT appear in catalog
    client.post("/tasks/cat_t1/notes", json={"id": "draft_n1", "task_id": "cat_t1", "title": "Draft Note", "content": "Work in progress", "is_published": False})
    # Published note on task B
    client.post("/tasks/cat_t2/notes", json={"id": "pub_n2", "task_id": "cat_t2", "title": "Another Published", "content": "# Also public", "is_published": True})

    resp = client.get("/notes/catalog")
    assert resp.status_code == 200
    catalog = resp.json()
    ids = [n["id"] for n in catalog]
    assert "pub_n1" in ids
    assert "pub_n2" in ids
    assert "draft_n1" not in ids
    # Catalog entries include task_title for context
    pub1 = next(n for n in catalog if n["id"] == "pub_n1")
    assert pub1["task_title"] == "Task A"


def test_csv_export_import(client, db):
    """CSV export and import round-trip."""
    client.post("/users", json={"id": "u1", "name": "Alice", "role": "Dev", "is_active": True})
    client.post("/tasks", json={
        "id": "csv_t1", "title": "Export Me", "description": "Test export",
        "status": "current", "user_id": "u1", "time_estimate_mins": 60, "time_spent_mins": 30
    })

    # Export
    resp = client.get("/tasks/export")
    assert resp.status_code == 200
    csv_text = resp.text
    assert "Export Me" in csv_text
    assert "csv_t1" in csv_text

    # Import via CSV
    import_csv = "id,title,description,status,user_id,priority,time_estimate_mins,time_spent_mins\nimp_t1,Imported Task,From CSV,to_be_classified,u1,p1,90,0\nimp_t2,Another Import,,current,u1,p2,120,10\n"
    import io
    resp = client.post("/tasks/import", files={"file": ("tasks.csv", io.BytesIO(import_csv.encode()), "text/csv")})
    assert resp.status_code == 200
    assert resp.json()["imported_count"] == 2

    # Verify imported tasks exist
    resp = client.get("/tasks")
    tasks = resp.json()
    ids = [t["id"] for t in tasks]
    assert "imp_t1" in ids
    assert "imp_t2" in ids
    imp1 = next(t for t in tasks if t["id"] == "imp_t1")
    assert imp1["title"] == "Imported Task"
    assert imp1["priority"] == "p1"


def test_execute_python(client, db, monkeypatch):
    """Execute a Python snippet and get stdout back."""
    from code_executor import ExecutionResult
    import code_executor

    monkeypatch.setenv("CODE_EXECUTION_ENABLED", "true")
    monkeypatch.setattr(code_executor, "execute_code", lambda language, code: ExecutionResult(
        stdout="hello world\n",
        stderr="",
        exit_code=0,
        timed_out=False,
    ))

    resp = client.post("/execute", json={"language": "python", "code": "print('hello world')"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["stdout"].strip() == "hello world"
    assert data["stderr"] == ""
    assert data["exit_code"] == 0
    assert data["timed_out"] is False


def test_execute_javascript(client, db, monkeypatch):
    """Execute a JavaScript snippet via Node.js."""
    from code_executor import ExecutionResult
    import code_executor

    monkeypatch.setenv("CODE_EXECUTION_ENABLED", "true")
    monkeypatch.setattr(code_executor, "execute_code", lambda language, code: ExecutionResult(
        stdout="42\n",
        stderr="",
        exit_code=0,
        timed_out=False,
    ))

    resp = client.post("/execute", json={"language": "javascript", "code": "console.log(42)"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["stdout"].strip() == "42"
    assert data["exit_code"] == 0
    assert data["timed_out"] is False


def test_execute_syntax_error(client, db, monkeypatch):
    """A script with a syntax error should return non-zero exit_code and stderr."""
    from code_executor import ExecutionResult
    import code_executor

    monkeypatch.setenv("CODE_EXECUTION_ENABLED", "true")
    monkeypatch.setattr(code_executor, "execute_code", lambda language, code: ExecutionResult(
        stdout="",
        stderr="SyntaxError: invalid syntax",
        exit_code=1,
        timed_out=False,
    ))

    resp = client.post("/execute", json={"language": "python", "code": "def foo(\n"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["exit_code"] != 0
    assert "SyntaxError" in data["stderr"]


def test_execute_timeout(client, db, monkeypatch):
    """An infinite loop should time out."""
    from code_executor import ExecutionResult
    import code_executor

    monkeypatch.setenv("CODE_EXECUTION_ENABLED", "true")
    monkeypatch.setattr(code_executor, "execute_code", lambda language, code: ExecutionResult(
        stdout="",
        stderr="Execution timed out after 30s",
        exit_code=-1,
        timed_out=True,
    ))

    resp = client.post("/execute", json={"language": "python", "code": "while True: pass"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["timed_out"] is True


def test_execute_unsupported_lang(client, db):
    """Requesting an unsupported language should return 400."""
    resp = client.post("/execute", json={"language": "scala", "code": "println(1)"})
    assert resp.status_code == 400
