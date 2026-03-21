import os
import json
import duckdb
import datetime
import uuid
from dotenv import load_dotenv, find_dotenv
import google.generativeai as genai

load_dotenv(find_dotenv(usecwd=True))

class AIAgent:
    def __init__(self, conn: duckdb.DuckDBPyConnection):
        self.conn = conn
        self.api_key = os.getenv("GOOGLE_API_KEY")
        self.refresh_required = False
        
        # Tools definitions for Gemini
        self.tools = [
            self.create_task,
            self.update_task,
            self.add_task_update,
            self.schedule_task_slot,
            self.mark_task_done
        ]

        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel(
                model_name='gemini-2.5-flash',
                tools=self.tools,
                system_instruction="""
                You are an expert Project Manager Assistant for a software team.
                You have access to the team's work tracking dashboard.
                Your goal is to help users manage their tasks, provide summaries, and perform actions.
                
                CONVENTIONS:
                - Primary User ID is 'me'.
                - Sprints start on Wednesdays.
                - When scheduling slots, if the user doesn't specify a date, assume today.
                - Always confirm the actions you've taken in a friendly, professional manner.
                - If you perform any data mutation (create, update, delete, schedule), the system will automatically refresh the user's dashboard.
                - You have access to task IDs in the context. Always use the correct ID when calling tools.
                """
            )
        else:
            self.model = None

    def log_activity(self, task_id: str, action: str, description: str):
        """Internal helper to log activity for AI actions."""
        aid = str(uuid.uuid4())
        now = datetime.datetime.now().isoformat()
        self.conn.execute(
            "INSERT INTO task_activity (id, task_id, action, description, created_at) VALUES (?, ?, ?, ?, ?)",
            [aid, task_id, action, description, now]
        )

    # --- Tool Implementations ---

    def create_task(self, title: str, status: str = "to_be_classified", description: str = None, user_id: str = "me", priority: str = "p2"):
        """Create a new task in the work tracking system. Returns the new task ID."""
        tid = "t_" + str(uuid.uuid4())[:8]
        self.conn.execute("""
            INSERT INTO tasks (id, title, description, status, user_id, priority, time_spent_mins)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        """, [tid, title, description, status, user_id, priority])
        self.log_activity(tid, "created", f"AI Agent created task: '{title}'")
        self.refresh_required = True
        return {"status": "success", "task_id": tid, "message": f"Created task '{title}'"}

    def update_task(self, task_id: str, status: str = None, user_id: str = None, sprint: str = None, priority: str = None):
        """Update an existing task's fields. Only provide fields that need changing."""
        updates = []
        params = []
        if status:
            updates.append("status = ?")
            params.append(status)
        if user_id:
            updates.append("user_id = ?")
            params.append(user_id)
        if sprint:
            updates.append("sprint = ?")
            params.append(sprint)
        if priority:
            updates.append("priority = ?")
            params.append(priority)
            
        if not updates:
            return {"status": "error", "message": "No fields provided for update"}
            
        params.append(task_id)
        self.conn.execute(f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?", params)
        self.log_activity(task_id, "updated", f"AI Agent updated task fields: {', '.join(updates)}")
        self.refresh_required = True
        return {"status": "success", "message": f"Updated task {task_id}"}

    def add_task_update(self, task_id: str, update_text: str):
        """Add a progress update note to a task."""
        uid = str(uuid.uuid4())
        now = datetime.datetime.now().isoformat()
        self.conn.execute(
            "INSERT INTO task_updates (id, task_id, update_text, created_at) VALUES (?, ?, ?, ?)",
            [uid, task_id, update_text, now]
        )
        self.log_activity(task_id, "update_added", f"AI Agent added update: {update_text}")
        self.refresh_required = True
        return {"status": "success", "message": "Update added successfully"}

    def schedule_task_slot(self, task_id: str, start_time: str, duration_mins: int, user_id: str = "me"):
        """Schedule a block of time in the calendar for a task. start_time should be ISO format."""
        sid = str(uuid.uuid4())
        start_dt = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        end_dt = start_dt + datetime.timedelta(minutes=duration_mins)
        
        self.conn.execute("""
            INSERT INTO task_slots (id, task_id, user_id, start_time, end_time) 
            VALUES (?, ?, ?, ?, ?)
        """, [sid, task_id, user_id, start_dt.isoformat(), end_dt.isoformat()])
        
        self.log_activity(task_id, "scheduled", f"AI Agent scheduled a {duration_mins}m slot starting at {start_time}")
        self.refresh_required = True
        return {"status": "success", "slot_id": sid}

    def mark_task_done(self, task_id: str, feedback: str = None, week: str = None):
        """Mark a task as completed. Optionally provide feedback and the week string (YYYY-MM-DD)."""
        if not week:
            # Calculate current Wednesday start
            d = datetime.datetime.now()
            diff = (d.weekday() - 2) % 7
            wed = d - datetime.timedelta(days=diff)
            week = wed.strftime("%Y-%m-%d")

        self.conn.execute("""
            UPDATE tasks SET status = 'done', feedback = ?, week = ? WHERE id = ?
        """, [feedback, week, task_id])
        
        self.log_activity(task_id, "completed", "AI Agent marked task as done")
        self.refresh_required = True
        return {"status": "success", "message": f"Task {task_id} marked as done for week {week}"}

    # --- Core Logic ---

    def _get_work_context(self):
        """Retrieve full work context including IDs for tool use."""
        seven_days_ago = (datetime.datetime.now() - datetime.timedelta(days=7)).isoformat()
        
        # All active tasks
        tasks = self.conn.execute("SELECT id, title, description, status, user_id, priority, time_spent_mins, time_estimate_mins, sprint FROM tasks WHERE status != 'done'").fetchall()
        
        # Recent completed tasks
        done_tasks = self.conn.execute("SELECT id, title, description, feedback, time_spent_mins, week FROM tasks WHERE status = 'done' AND (week >= ? OR week IS NULL)", [seven_days_ago]).fetchall()
        
        # Users
        users = self.conn.execute("SELECT id, name, role FROM users WHERE is_active = TRUE").fetchall()
        
        # Recent updates
        updates = self.conn.execute("""
            SELECT t.title, u.update_text, u.created_at 
            FROM task_updates u 
            JOIN tasks t ON u.task_id = t.id 
            WHERE u.created_at >= ? 
            ORDER BY u.created_at DESC
        """, [seven_days_ago]).fetchall()

        context = {
            "current_time": datetime.datetime.now().isoformat(),
            "users": [{"id": r[0], "name": r[1], "role": r[2]} for r in users],
            "active_tasks": [
                {"id": r[0], "title": r[1], "description": r[2], "status": r[3], "user_id": r[4], "priority": r[5], "spent": r[6], "estimate": r[7], "sprint": r[8]} 
                for r in tasks
            ],
            "recently_completed": [
                {"id": r[0], "title": r[1], "description": r[2], "feedback": r[3], "spent": r[4], "week": r[5]} 
                for r in done_tasks
            ],
            "recent_updates": [
                {"task": r[0], "text": r[1], "date": str(r[2])} 
                for r in updates
            ]
        }
        return context

    def generate_summary(self):
        """Generate a weekly executive summary."""
        context = self._get_work_context()
        if not self.model: return self._mock_summary(context)

        prompt = f"Provide a concise executive summary of the following work data:\n{json.dumps(context, indent=2)}"
        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Error: {str(e)}\n\n" + self._mock_summary(context)

    def ask_question(self, query: str):
        """Answer a question or perform an action using tool calling."""
        context = self._get_work_context()
        if not self.model:
            return {"response": "AI Agent is in mock mode (no GOOGLE_API_KEY found).", "refresh_required": False}

        # Start a chat session with automatic function calling
        chat = self.model.start_chat(enable_automatic_function_calling=True)
        
        full_prompt = f"""
        CONTEXT:
        {json.dumps(context, indent=2)}

        USER QUERY: {query}
        """
        
        try:
            response = chat.send_message(full_prompt)
            return {
                "response": response.text,
                "refresh_required": self.refresh_required
            }
        except Exception as e:
            return {
                "response": f"Encountered an error: {str(e)}",
                "refresh_required": self.refresh_required
            }

    def _mock_summary(self, context):
        # ... (same as before, or slightly updated for new context keys)
        lines = ["# Weekly Summary (Mock Mode)"]
        if context["recently_completed"]:
            lines.append("\n## Accomplishments")
            for t in context["recently_completed"]:
                lines.append(f"- **{t['title']}**: Completed.")
        if context["active_tasks"]:
            lines.append("\n## In Progress")
            for t in context["active_tasks"]:
                if t['status'] == 'current':
                    lines.append(f"- **{t['title']}**")
        return "\n".join(lines)
