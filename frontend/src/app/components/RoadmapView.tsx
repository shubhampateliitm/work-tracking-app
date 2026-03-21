"use client";
import React, { useState } from "react";

type Step = {
  text: string;
  detail: string;
};

type Phase = {
  id: number;
  title: string;
  category: "foundation" | "backend" | "frontend" | "fullstack" | "devops" | "testing" | "ai";
  effort: string;
  summary: string;
  why: string;
  steps: Step[];
  skills: string[];
  decisions: string[];
  dependsOn: number[];
};

const PHASES: Phase[] = [
  {
    id: 0,
    title: "Project Foundation & Tooling",
    category: "foundation",
    effort: "2–4 hours",
    summary: "Set up the monorepo, version control, environment isolation, and shared configuration before a single line of application code is written.",
    why: "Decisions made here (folder layout, .env conventions, Git discipline) are expensive to undo later. Getting them right now saves days of untangling.",
    steps: [
      { text: "Create the root directory and run git init", detail: "Commit an empty .gitignore immediately — before any tooling creates files you don't want tracked (venv, node_modules, .duckdb)." },
      { text: "Define the monorepo layout: /backend and /frontend at the root", detail: "Keeping both services in one repo simplifies cross-service PRs and shared CI, while still allowing independent Docker builds." },
      { text: "Write a root .gitignore covering Python, Node, DuckDB, and secrets", detail: "Include: venv/, __pycache__/, *.pyc, node_modules/, .next/, *.duckdb, .env, .env.local, .DS_Store." },
      { text: "Create backend/venv and install base dependencies", detail: "python3 -m venv venv && pip install fastapi uvicorn duckdb==1.4.0 pydantic python-dotenv python-multipart. Pin duckdb version — DuckDB's storage format is version-locked." },
      { text: "Scaffold the Next.js app inside /frontend", detail: "npx create-next-app@latest frontend --typescript --tailwind --app. Answer No to the src/ directory question — the app/ router goes directly under frontend/." },
      { text: "Set up .env.example with all expected env vars documented", detail: "Include GOOGLE_API_KEY, DB_PATH, NEXT_PUBLIC_API_URL, INTERNAL_API_URL. Never commit a real .env." },
      { text: "Write a root-level docker-compose.yml as a placeholder", detail: "Even an empty compose file with correct service names prevents the 'I'll do it at the end' trap. Add healthchecks and named volumes from day one." },
      { text: "Verify both services can be started independently", detail: "cd backend && uvicorn main:app --reload. cd frontend && npm run dev. Both should reach their ports without errors before you commit." },
    ],
    skills: ["Git", "Shell scripting", "Python venv", "Node.js / npm", "Docker Compose basics"],
    decisions: [
      "Monorepo vs. separate repos — monorepo wins for a small team because cross-service changes land in one PR.",
      "DuckDB version pinning — 1.4.0 is the target; storage format changes across majors are not backward-compatible.",
      "App Router (Next.js 13+) over Pages Router — enables server components and SSR data fetching in page.tsx without getServerSideProps boilerplate.",
    ],
    dependsOn: [],
  },
  {
    id: 1,
    title: "Backend Foundation — FastAPI + DuckDB",
    category: "backend",
    effort: "1 day",
    summary: "Stand up the FastAPI application, establish the DuckDB connection pattern, create the users and tasks tables, and expose basic CRUD endpoints.",
    why: "Every subsequent feature builds on this layer. A sloppy connection model here (e.g. a global singleton) causes subtle concurrency bugs under load. Get the dependency injection right from the start.",
    steps: [
      { text: "Create backend/main.py with FastAPI app and CORS middleware", detail: "Allow all origins for local dev (allow_origins=['*']). CORS must be added before any router is included, or preflight requests will 401." },
      { text: "Write database.py: get_db() generator and init_db()", detail: "get_db() opens a connection, yields it, and closes it in finally. This is FastAPI's Depends() pattern — each request gets its own DuckDB connection, avoiding multi-writer conflicts." },
      { text: "Create the users table in init_db() and seed the primary user", detail: "INSERT INTO users ... WHERE NOT EXISTS. The primary user id should be the literal string 'me' — this becomes a convention the entire frontend relies on." },
      { text: "Create the tasks table with core fields only", detail: "Start with id, title, description, status, user_id. Resist the urge to add every field now — use ALTER TABLE ADD COLUMN for incremental migrations wrapped in try/except." },
      { text: "Write Pydantic models in models.py", detail: "Task and User as BaseModel subclasses with Optional fields and sensible defaults. Pydantic validates request bodies automatically when used as FastAPI route parameters." },
      { text: "Implement GET /tasks, POST /tasks, PUT /tasks/{id}, DELETE /tasks/{id}", detail: "Use conn.execute() with parameterised queries (?, values) — never f-string user data into SQL. fetchall() + dict(zip(columns, row)) is the DuckDB idiom for returning JSON-serialisable dicts." },
      { text: "Implement GET /users and POST /users", detail: "GET /users should filter is_active=TRUE. The frontend never shows inactive users in dropdowns, so they must be excluded at the query level, not the frontend." },
      { text: "Call init_db() in @app.on_event('startup')", detail: "This ensures schema and seed data exist before any request is served, even after a container restart with a fresh volume." },
    ],
    skills: ["FastAPI", "DuckDB SQL", "Pydantic v2", "Python generators", "REST API design"],
    decisions: [
      "get_db() generator over a global connection — DuckDB allows multiple read connections but only one write connection per file at a time. Per-request connections are safer and simpler.",
      "fetchall() + zip(columns, row) over fetchdf() — avoids a pandas dependency and produces plain Python dicts that FastAPI can serialise without extra steps.",
      "Try/except around ALTER TABLE migrations — DuckDB raises if a column already exists. Wrapping in try/except is the lightweight migration strategy; use Alembic only if you need rollbacks.",
      "Literal string 'me' as primary user ID — avoids an auth system while keeping user-scoped data queryable. The frontend uses id === 'me' as the primary user check throughout.",
    ],
    dependsOn: [0],
  },
  {
    id: 2,
    title: "Frontend Shell — Kanban Dashboard",
    category: "frontend",
    effort: "1 day",
    summary: "Build the Next.js shell: server-component data fetching in page.tsx, the DashboardClient tab layout, four kanban columns, and the task card component with drag-and-drop status updates.",
    why: "The kanban board is the core of the entire app. Getting the data flow (SSR → hydration → client mutations) correct here prevents the classic 'flash of stale data' and 'optimistic update rollback' bugs.",
    steps: [
      { text: "Establish the design token system in globals.css", detail: "Define all colors as CSS custom properties in :root (--bg-primary, --accent-blue, etc). Every colour in the app must reference a token — no hex literals in component CSS." },
      { text: "Build page.tsx as a server component with force-dynamic", detail: "Fetch /tasks, /users, /team-focus, /weekly-closed-tasks in parallel with Promise.all(). Wrap each fetch in try/catch returning empty defaults — a backend failure must render an empty dashboard, not a crash." },
      { text: "Create DashboardClient.tsx as a 'use client' component", detail: "Accept initialTasks, initialTeamFocus, initialWeekly, users, and apiUrl as props. Hydrate local state from these props with useState — the server data is the first render, client mutations update state locally." },
      { text: "Build the tab navigation", detail: "Map over a tabs array to render tab buttons. Use a single activeTab string state. Name the tab values exactly as you'll use them in conditionals ('dashboard', 'team', etc)." },
      { text: "Render four kanban columns from a STATUSES constant", detail: "['to_be_classified', 'current', 'upcoming', 'long-term']. Filter tasks per column. Each column renders a header with a count badge and a list of TaskCards." },
      { text: "Build TaskCard.tsx with data-status attribute", detail: "The card root element gets data-status={task.status}. All column-specific colours (border-left accent, background tint) are driven by CSS attribute selectors: [data-status='current'] { border-color: var(--accent-blue); }. No conditional className logic." },
      { text: "Implement drag-and-drop status update", detail: "Use native HTML5 draggable + onDragOver / onDrop on columns. On drop, call PUT /tasks/{id} with the new status, then update local state optimistically. Roll back on API error." },
      { text: "Wire task creation and editing modals", detail: "A single TaskModal component handles both create (no initial data) and edit (pre-filled). On save, POST or PUT to the API, then update the tasks array in state." },
    ],
    skills: ["Next.js App Router", "React state + props", "CSS custom properties", "HTML5 drag-and-drop", "Optimistic UI updates"],
    decisions: [
      "SSR initial data via page.tsx — the first render is fully populated without a loading spinner. Subsequent mutations go through client fetch() calls.",
      "Single mega-component DashboardClient.tsx — avoids prop drilling chains through multiple layers at this scale. If the app grows past ~2000 lines, extract tab components.",
      "data-status CSS attribute over className variants — eliminates conditional class logic in JSX. Adding a new status only requires a CSS rule, not a component change.",
      "Optimistic updates with rollback — update state immediately for instant feedback, then revert if the API returns an error. Never wait for the API before updating the UI.",
    ],
    dependsOn: [1],
  },
  {
    id: 3,
    title: "Team Management",
    category: "fullstack",
    effort: "4–6 hours",
    summary: "Add full user lifecycle management — create, edit, deactivate — and a Team tab showing each user's active tasks grouped by person.",
    why: "Without real user data, capacity planning and assignment features can't be built. This phase unlocks all multi-user workflows.",
    steps: [
      { text: "Add PUT /users/{id} and DELETE /users/{id} to routes.py", detail: "DELETE should soft-delete (set is_active=FALSE) rather than hard-delete, so historical task assignments remain intact." },
      { text: "Add capacity_hours_per_sprint to the users table via ALTER TABLE migration", detail: "Default 60 (6h/day × 10 working days). Wrap in try/except so the migration is idempotent on every startup." },
      { text: "Build the GET /team-focus endpoint", detail: "LEFT JOIN users u ON u.id = t.user_id WHERE t.status != 'done'. Group results by user_name in Python after fetching. LEFT JOIN ensures users with zero tasks still appear." },
      { text: "Create TeamManagementView.tsx", detail: "Two sections: team focus view (read-only, grouped task lists) and team roster (add/edit forms). A single editingUser state drives both create and edit modes." },
      { text: "Add user assignment dropdown to the task edit modal", detail: "Filter to is_active users only. Show 'Unassigned' as the first option. On change, optimistically update the task card's assignee label." },
      { text: "Ensure inactive users are hidden from all dropdowns", detail: "Filter usersList.filter(u => u.is_active) everywhere a user is selectable. Inactive users should still appear in historical task views." },
    ],
    skills: ["SQL LEFT JOIN", "React controlled forms", "FastAPI CRUD patterns"],
    decisions: [
      "Soft delete (is_active=FALSE) vs hard delete — hard delete would orphan task.user_id FK references. Soft delete preserves history.",
      "GET /team-focus groups in Python not SQL — DuckDB doesn't have a native GROUP_CONCAT with nested structure; it's simpler to accumulate a dict in Python after fetchall().",
    ],
    dependsOn: [1, 2],
  },
  {
    id: 4,
    title: "Time Tracking — Pomodoro & Calendar Slots",
    category: "fullstack",
    effort: "1–1.5 days",
    summary: "Add time estimate and time spent fields to tasks, a Pomodoro timer for live tracking, scheduled work slots with overlap detection, and a Calendar view.",
    why: "Time data is the foundation of the Insights tab. Without accurate estimates and actuals, burndown, velocity, and accuracy charts are meaningless.",
    steps: [
      { text: "Migrate tasks table: add time_estimate_mins and time_spent_mins columns", detail: "time_spent_mins DEFAULT 0 — never NULL. A NULL in a SUM() silently returns NULL for the whole aggregate, breaking all analytics." },
      { text: "Add POST /tasks/{id}/time endpoint", detail: "Body: { minutes: int }. Use UPDATE tasks SET time_spent_mins = time_spent_mins + ? — atomic increment, no read-modify-write race." },
      { text: "Create the task_slots table", detail: "Fields: id, task_id, user_id, start_time TIMESTAMP, end_time TIMESTAMP, created_at. Store timestamps as ISO strings via .isoformat() before insert." },
      { text: "Add POST /slots with overlap detection", detail: "SELECT id FROM task_slots WHERE user_id=? AND start_time < ? AND end_time > ?. If a row is returned, raise HTTPException(409). Two intervals overlap when start1 < end2 AND end1 > start2." },
      { text: "Add POST /slots/{id}/complete", detail: "Fetch the slot, compute min(now, end_time) - start_time in seconds / 60 for elapsed minutes. Call UPDATE tasks SET time_spent_mins = time_spent_mins + elapsed. Then DELETE the slot." },
      { text: "Build TimerComponents.tsx — the Pomodoro timer bar", detail: "Store elapsed seconds in a useRef (not useState) to avoid re-renders on every tick. A setInterval in useEffect increments the ref. Only update displayed time state every second." },
      { text: "Build CalendarView.tsx with slot scheduling UI", detail: "Render a weekly grid. Fetch all slots on mount. A slot creation form takes task, date, start time, and duration. On submit, compute end_time = start + duration and POST /slots." },
      { text: "Build ActiveSlotBanner.tsx", detail: "Poll or derive from slots state: find a slot where start_time <= now <= end_time. Display a live countdown by computing end_time - now on each render tick." },
    ],
    skills: ["Date arithmetic in Python and JS", "React useRef vs useState", "SQL atomic increments", "HTML time inputs"],
    decisions: [
      "useRef for timer tick — using useState would trigger a full re-render every second for every mounted component. useRef mutates without re-rendering; only the display label reads from state.",
      "Atomic SQL increment (SET x = x + ?) — avoids the read-modify-write race where two concurrent requests both read 30 and both write 45 instead of 60.",
      "Overlap check in SQL not application code — checking overlaps in Python requires fetching all slots first. A single parameterised SQL query with the interval math is O(log n) with an index.",
    ],
    dependsOn: [1, 2, 3],
  },
  {
    id: 5,
    title: "Sprint & Capacity Planning",
    category: "fullstack",
    effort: "1 day",
    summary: "Add sprint assignment and priority to tasks, define the sprint ID convention, and build the capacity planning grid showing team load per sprint.",
    why: "Sprint assignment is the bridge between day-to-day task management and planning. Without it, the insights tab can't produce per-sprint burndown or velocity data.",
    steps: [
      { text: "Migrate tasks table: add sprint VARCHAR and priority VARCHAR DEFAULT 'p2'", detail: "Priority values: 'p1' (urgent), 'p2' (normal), 'p3' (low). Store sprint as the full ID string — e.g. '2026-Q1-S6-20260311'. Never store sprint as an integer." },
      { text: "Define the sprint ID format as a convention, not a DB constraint", detail: "Format: {YEAR}-Q{quarter}-S{sprintNum}-{YYYYMMDD}. The Wednesday start date is embedded in the ID so it's human-readable without a lookup table. Sprints start on Wednesday." },
      { text: "Update PUT /tasks/{id} to persist sprint and priority fields", detail: "These fields were already added to the Task Pydantic model; just include them in the UPDATE SET clause." },
      { text: "Add capacity_hours_per_sprint to users (if not already done in Phase 3)", detail: "Default 60. This drives the capacity bar maximum in the grid." },
      { text: "Build CapacityPlanningView.tsx — the sprint × user grid", detail: "Derive unique sprints from tasks[].sprint. Derive unique users from usersList. Render a CSS grid where rows = users, columns = sprints." },
      { text: "Compute per-cell allocation from task estimates", detail: "For each user × sprint cell: sum time_estimate_mins for tasks where task.user_id === user.id && task.sprint === sprintId. Divide by 60 for hours. Compare against user.capacity_hours_per_sprint." },
      { text: "Render a capacity bar per cell", detail: "Width = min(allocated / capacity, 1) * 100%. Color: green < 80%, amber 80–100%, red > 100%. Use CSS custom properties for all three states." },
      { text: "Add sprint assignment dropdown to the capacity grid", detail: "Clicking a task in the 'Unassigned' column opens a dropdown to pick a sprint. On select, call PUT /tasks/{id} with the new sprint and user_id. Do NOT add overflow:hidden to the grid container — it will clip the dropdown." },
    ],
    skills: ["CSS grid layout", "Derived state from arrays", "Date/week arithmetic"],
    decisions: [
      "Sprint ID embeds the start date — makes IDs human-readable and sortable as strings without a sprints table. Lexicographic sort of the ID strings gives chronological order.",
      "Never add overflow:hidden to .capacity-grid — the sprint assignment dropdown renders as a child of the cell. overflow:hidden clips it, making it invisible. Use overflow:visible (the default).",
      "Capacity computed in the frontend, not the backend — avoids a dedicated /capacity endpoint. The data is already present in the tasks and users arrays fetched on page load.",
    ],
    dependsOn: [1, 2, 3],
  },
  {
    id: 6,
    title: "Activity Log & Task Updates",
    category: "backend",
    effort: "4–6 hours",
    summary: "Auto-record every meaningful change to a task as an activity entry, and add a manual update-notes history per task.",
    why: "Without an audit trail, users can't answer 'why is this task in its current state?' A diff-based activity log is cheaper to implement than full event sourcing and sufficient for a team tool.",
    steps: [
      { text: "Create the task_activity table", detail: "Fields: id, task_id, action VARCHAR, description TEXT, created_at TIMESTAMP. action is a short machine-readable label: 'created', 'status_changed', 'renamed', 'assigned', 'due_date_changed', 'feedback_added', 'time_spent'." },
      { text: "Create the task_updates table", detail: "Fields: id, task_id, update_text TEXT, created_at TIMESTAMP. This is a manual notes log — free text the user types, timestamped." },
      { text: "Write a log_activity() helper function in routes.py", detail: "Takes (conn, task_id, action, description). Inserts into task_activity. Call this from every route that mutates a task — don't inline the INSERT." },
      { text: "Add diff logic to PUT /tasks/{id}", detail: "Before the UPDATE, SELECT the old row. After the UPDATE, compare old vs new for: title (renamed), status (status_changed), user_id (assigned), due_date (due_date_changed), feedback (feedback_added). Only log entries for fields that actually changed." },
      { text: "Resolve user IDs to names in the assigned activity entry", detail: "SELECT name FROM users WHERE id = ? for both old and new user_id before logging. Store 'Reassigned from Alice to Bob', not 'Reassigned from u2 to u3'." },
      { text: "Add GET /tasks/{id}/activity and POST /tasks/{id}/updates endpoints", detail: "Both return chronological lists. activity is auto-generated; updates are user-written. The frontend shows both in the task detail panel." },
      { text: "Call log_activity() in POST /tasks/{id}/time with the minutes added", detail: "Message: 'Added 25m of tracked time.' This lets users see how time was logged over the task's life." },
    ],
    skills: ["SQL diff pattern", "Audit log design", "FastAPI helper functions"],
    decisions: [
      "Diff in the route handler, not a DB trigger — DuckDB doesn't support triggers. Fetching the old row before updating is the right pattern; the extra SELECT costs microseconds.",
      "Human-readable descriptions, not raw field names — 'Renamed from X to Y' is more useful in the UI than 'title changed'. Resolve user IDs to names at write time, not read time.",
      "Separate task_updates from task_activity — activity is auto-generated by the system; updates are intentional user notes. Conflating them makes the log noisy.",
    ],
    dependsOn: [1, 2],
  },
  {
    id: 7,
    title: "Analytics & Insights",
    category: "fullstack",
    effort: "1 day",
    summary: "Build three analytics endpoints — burndown, velocity, and estimation accuracy — and the Insights tab with visual charts for each.",
    why: "This is where all the time-tracking data from Phase 4 pays off. Teams use these charts to spot over-commitment, measure throughput, and calibrate future estimates.",
    steps: [
      { text: "Build GET /insights/burndown", detail: "GROUP BY sprint, SUM(time_estimate_mins), SUM(time_spent_mins), COUNT(*), SUM(CASE WHEN status='done' THEN 1 ELSE 0 END). remaining_mins = max(0, estimate - spent). Filter WHERE sprint IS NOT NULL AND sprint != ''." },
      { text: "Build GET /insights/velocity", detail: "SELECT sprint, COUNT(*), SUM(time_spent_mins) FROM tasks WHERE status='done' AND sprint IS NOT NULL GROUP BY sprint ORDER BY sprint ASC. Return hours_logged = round(total_spent_mins / 60, 2)." },
      { text: "Build GET /insights/accuracy", detail: "JOIN tasks t ON users u.id = t.user_id. ROUND(AVG(time_estimate_mins)) vs ROUND(AVG(time_spent_mins)). Filter: time_estimate_mins > 0 AND time_spent_mins > 0. Exclude tasks with no data from both sides." },
      { text: "Build GET /daily-digest", detail: "Three queries in one endpoint: tasks due within 3 days (not done), slots scheduled for today (CAST(start_time AS DATE) = today), per-sprint health summary. Useful as a 'morning dashboard' widget." },
      { text: "Build InsightsView.tsx with three sub-views switchable by tab", detail: "Burndown: horizontal bar pairs (estimate vs spent) per sprint. Velocity: completed count and hours per sprint. Accuracy: per-user table with estimate vs actual and a ratio." },
      { text: "Render bars as width-percentage divs, not canvas charts", detail: "A div with width: calc(value / max * 100%) is simpler than importing Chart.js. Use CSS transitions for animated bar widths on mount." },
      { text: "Add GET /notifications", detail: "Four query types: stale tasks (next_update_date < today), due soon (due_date between today and today+3), overdue (due_date < today, not done), upcoming slots (start_time within 15 min). Return severity: error / warning / info." },
    ],
    skills: ["SQL GROUP BY + CASE", "SQL date casting", "Data visualisation with CSS", "FastAPI multi-query endpoints"],
    decisions: [
      "CSS bar charts over a charting library — avoids a heavy dependency (Chart.js is 60KB+). Percentage-width divs with transitions are sufficient for this data density.",
      "COALESCE(time_estimate_mins, 0) in aggregates — NULL values in SUM() propagate as NULL. COALESCE forces them to 0, making the aggregate always return a number.",
      "Accuracy excludes tasks where estimate or spent is 0 — zero values skew the average (a 0-minute estimate is a missing value, not a real estimate).",
    ],
    dependsOn: [1, 2, 4, 5],
  },
  {
    id: 8,
    title: "Notes System & Catalog",
    category: "fullstack",
    effort: "1.5–2 days",
    summary: "Build a per-task block-based note editor, a notes CRUD API, a published Notes Catalog with full-text search, and inline catalog editing.",
    why: "Notes are where design decisions, architecture choices, and meeting outcomes live. Without a structured notes system, that institutional knowledge ends up in Slack messages that no one can find.",
    steps: [
      { text: "Create the task_notes table", detail: "Fields: id, task_id FK, title VARCHAR, content TEXT, is_published BOOLEAN DEFAULT FALSE, created_at, updated_at. Unpublished notes are private; published notes appear in the shared catalog." },
      { text: "Add CRUD endpoints: POST /tasks/{id}/notes, GET /tasks/{id}/notes, PUT /notes/{id}, DELETE /notes/{id}", detail: "PUT /notes/{id} updates updated_at = now(). The response from POST re-fetches the row (SELECT * WHERE id=?) because DuckDB 0.9.x had no RETURNING clause." },
      { text: "Add GET /notes/catalog", detail: "SELECT n.*, t.title as task_title FROM task_notes n JOIN tasks t ON n.task_id = t.id WHERE n.is_published = TRUE ORDER BY n.updated_at DESC. The task_title join means the frontend doesn't need a separate lookup." },
      { text: "Build BlockEditor.tsx — a contenteditable block engine", detail: "Each 'block' is a { id, type, text } object. Types: paragraph, heading1, heading2, heading3, code, hr. Render each as a contenteditable div. On Enter, insert a new block. On Backspace at start of empty block, merge with previous." },
      { text: "Handle Tab key in code blocks to insert literal tab characters", detail: "e.preventDefault() + document.execCommand('insertText', false, '\\t'). Without this, Tab moves browser focus out of the editor." },
      { text: "Build BlockViewer.tsx as the read-only renderer", detail: "Maps block types to semantic HTML elements. code blocks use <pre><code> with Prism.js syntax highlighting via CodeHighlight.tsx." },
      { text: "Build NoteEditor.tsx as a React portal modal", detail: "ReactDOM.createPortal(modal, document.body) ensures the modal renders above all other stacking contexts. Lock body scroll on mount (document.body.style.overflow = 'hidden'), restore on unmount." },
      { text: "Add inline editing to the Notes Catalog", detail: "Each catalog card gets an Edit button. e.stopPropagation() prevents it triggering the expand/collapse. On save, PUT /notes/{id} with is_published: true. Update the catalog card in-place without re-fetching." },
    ],
    skills: ["contenteditable APIs", "React portals", "Prism.js", "Block-based editor architecture"],
    decisions: [
      "Block-based editor over a markdown textarea — blocks give structured editing (headings, code, paragraphs) without parsing markdown on every keystroke. The content is stored as serialised block JSON.",
      "ReactDOM.createPortal for the NoteEditor modal — a modal rendered inside a task card inherits its stacking context and z-index. A portal escapes to document.body, always rendering on top.",
      "e.stopPropagation() on the Edit button — the button sits inside the catalog card header which has an onClick expand/collapse handler. Without stopPropagation, clicking Edit also toggles the card.",
      "is_published flag as the catalog gate — separates draft notes (visible only in task view) from published notes (visible to the whole team in the catalog). No separate table needed.",
    ],
    dependsOn: [1, 2],
  },
  {
    id: 9,
    title: "Advanced Task Features — Dependencies, Recurring Tasks & Retrospectives",
    category: "backend",
    effort: "1 day",
    summary: "Add task dependencies (blocked-by graph), auto-recurring task creation, sprint retrospectives, and CSV bulk export/import.",
    why: "These features address the 'long tail' of real project management — recurring stand-ups, blocked work, and post-sprint reflection. They're additive and don't require restructuring earlier work.",
    steps: [
      { text: "Create task_dependencies table", detail: "Fields: id, blocker_task_id FK, blocked_task_id FK, created_at. A row means 'blocked_task_id cannot start until blocker_task_id is done'." },
      { text: "Add POST /tasks/{id}/dependencies?blocker_task_id= and GET /tasks/{id}/dependencies", detail: "GET returns two lists: blocked_by (tasks blocking this one) and blocking (tasks this one blocks). JOIN tasks to include title and status." },
      { text: "Add recurrence_rule column to tasks", detail: "VARCHAR: 'daily' | 'weekly' | 'biweekly'. NULL means not recurring. Add via ALTER TABLE migration in init_db()." },
      { text: "Implement _create_recurring_next() helper", detail: "Called inside PUT /tasks/{id} when status changes to 'done' AND old_status != 'done' AND recurrence_rule IS NOT NULL. Creates a new task with the same title/description/user/priority, status='current', due_date shifted by the interval." },
      { text: "Create retrospectives table and CRUD endpoints", detail: "Fields: id, sprint_id UNIQUE, went_well TEXT, to_improve TEXT, action_items TEXT, created_at. GET /retros/{sprint_id}: if no row exists, auto-generate a draft with sprint health stats from the tasks table." },
      { text: "Add GET /tasks/export returning a StreamingResponse CSV", detail: "Use csv.DictWriter to write all task rows. StreamingResponse with media_type='text/csv' and Content-Disposition header triggers a browser download." },
      { text: "Add POST /tasks/import accepting a multipart file upload", detail: "Read the CSV with csv.DictReader. Insert each row with sensible defaults for missing fields. Return { imported_count: n }. Requires python-multipart in requirements.txt." },
    ],
    skills: ["Self-referential FK design", "Python csv module", "FastAPI StreamingResponse", "Date arithmetic"],
    decisions: [
      "Recurring instance created at completion time, not scheduled — simpler than a cron job. The next instance appears immediately when the current one is marked done.",
      "Retrospective auto-draft on GET — returning a draft with live stats (rather than a 404) means the UI can render the retro form immediately, pre-populated with real data.",
      "CSV export as StreamingResponse — avoids buffering the full CSV in memory. For large datasets, a streaming response is more memory-efficient.",
    ],
    dependsOn: [1, 2, 5, 6],
  },
  {
    id: 10,
    title: "Notifications & Daily Digest",
    category: "backend",
    effort: "4–6 hours",
    summary: "Build a notifications endpoint that returns actionable alerts across four categories, and a daily digest endpoint combining due tasks, today's slots, and sprint health.",
    why: "Proactive notifications prevent missed deadlines and stale tasks. Without them, the app is purely reactive — users must remember to check everything themselves.",
    steps: [
      { text: "Build GET /notifications with four alert types", detail: "Stale: CAST(next_update_date AS DATE) < today AND status NOT IN ('done'). Due soon: CAST(due_date AS DATE) BETWEEN today AND today+3 AND status != 'done'. Overdue: CAST(due_date AS DATE) < today AND status != 'done'. Slot reminder: start_time > now AND start_time <= now+15min." },
      { text: "Return severity levels per notification", detail: "'error' for overdue, 'warning' for stale, 'info' for due_soon and slot_reminder. The frontend uses data-severity on the notification item for CSS colour coding." },
      { text: "Build GET /daily-digest combining three queries", detail: "due_soon tasks, today's slots (with task title from a JOIN), per-sprint health stats (GROUP BY sprint with done count and estimate/spent totals). One endpoint, three independent queries, merged into a single JSON response." },
      { text: "Add the notification bell to the tab navigation", detail: "A bell button outside the tab list. Badge shows notification count. Clicking opens a dropdown panel. 'Clear all' removes notifications from local state (they reload on next fetch)." },
      { text: "Poll notifications every 60 seconds in the frontend", detail: "setInterval inside useEffect(() => { fetchNotifications(); }, []). Return the cleanup function: return () => clearInterval(id). Without cleanup, intervals accumulate on every re-render." },
    ],
    skills: ["SQL date casting and comparison", "React useEffect cleanup", "setInterval patterns"],
    decisions: [
      "CAST(due_date AS DATE) for date-only comparison — comparing raw TIMESTAMP to a date string fails silently (the strings don't match). CAST normalises both sides to DATE for a clean comparison.",
      "Notifications in local state, not DB — notifications are derived from task/slot data, not stored. Computing them on every GET means they're always current without a separate notifications table.",
      "useEffect cleanup for intervals — React Strict Mode mounts components twice in development. Without cleanup, you'll have two intervals, two API calls per tick, and subtle duplicate-update bugs.",
    ],
    dependsOn: [1, 2, 4, 6],
  },
  {
    id: 11,
    title: "AI Agent — Gemini Function Calling",
    category: "ai",
    effort: "1–1.5 days",
    summary: "Integrate Google Gemini with automatic function calling to build an AI agent that can answer questions about work data and take actions like creating tasks, scheduling slots, and marking work done.",
    why: "An AI layer that can act on your data — not just describe it — is qualitatively more useful than a simple chatbot. Function calling makes the agent trustworthy: every action is a real API call, not a hallucinated description.",
    steps: [
      { text: "Add google-generativeai to requirements.txt and configure with GOOGLE_API_KEY", detail: "load_dotenv() in ai_agent.py. If GOOGLE_API_KEY is absent, set self.model = None and return mock responses. The app must work without an API key." },
      { text: "Design the AIAgent class with a DuckDB connection in the constructor", detail: "The agent needs direct DB access to fetch context and to execute tool actions (CREATE, UPDATE). Passing the conn from the FastAPI Depends() chain keeps the connection lifecycle consistent." },
      { text: "Write _get_work_context() to build the prompt context", detail: "Query: all non-done tasks (with id, title, status, user_id, sprint), recently completed tasks, active users, and recent task_updates. Serialise to JSON and embed in the prompt. Include current_time so the model can reason about dates." },
      { text: "Define five tool functions as methods with typed signatures and docstrings", detail: "create_task, update_task, add_task_update, schedule_task_slot, mark_task_done. The Gemini SDK uses the function signature and docstring to generate the tool schema automatically — write them carefully." },
      { text: "Use GenerativeModel with tools=self.tools and enable_automatic_function_calling=True", detail: "Automatic function calling means the SDK handles the tool call / tool response loop internally. You send one message and get back the final text response after all tool calls complete." },
      { text: "Set refresh_required = True in every tool that mutates data", detail: "Return { response: text, refresh_required: True } from /ai/chat. The frontend checks this flag and calls refreshAllData() if True — the dashboard updates automatically after AI actions." },
      { text: "Build AIAgentView.tsx with chat history and a summary panel", detail: "Store messages as [{ role, content }] in state. POST /ai/chat with the user query. Append the response. If refresh_required is True, call the refreshData prop. POST /ai/summary separately for the executive summary." },
      { text: "Write _mock_summary() for offline/no-key mode", detail: "Returns a Markdown summary computed from the context dict — same structure as the real Gemini response. This lets developers work on the UI without a live API key." },
    ],
    skills: ["Google Gemini API", "LLM function calling", "Prompt engineering", "React chat UI patterns"],
    decisions: [
      "Gemini function calling over a custom tool router — the SDK handles the tool call / response cycle, including multi-turn tool use. Building a custom router would duplicate this logic.",
      "Tools as instance methods, not lambdas — methods have proper docstrings and type annotations, which the Gemini SDK reads to generate the JSON tool schema. Lambdas have neither.",
      "refresh_required flag in the response — the frontend can't know which AI actions mutate data. A boolean flag is cheaper than re-fetching everything on every chat message.",
      "Mock mode when GOOGLE_API_KEY is absent — the app is fully functional without an API key. Never hard-code a fallback key or raise an exception — just return mock data.",
    ],
    dependsOn: [1, 2, 3, 4, 5, 6],
  },
  {
    id: 12,
    title: "Docker, Deployment & Testing",
    category: "devops",
    effort: "1 day",
    summary: "Harden the Docker Compose setup with correct volumes, health checks, URL environment splitting, and a test-profile service. Write the full backend and frontend test suites.",
    why: "Tests are the only reliable way to catch regressions as the codebase grows. Docker Compose correctness is the difference between 'it works on my machine' and 'it works everywhere'.",
    steps: [
      { text: "Fix the Docker volume configuration", detail: "Never mount ./backend_data:/app — this overwrites the app code with an empty or stale directory. Use a named volume: backend_db:/app/data. Set DB_PATH=/app/data/work_tracker.duckdb in the environment." },
      { text: "Add support for DB_PATH env var in database.py", detail: "DB_NAME = os.environ.get('DB_PATH', 'work_tracker.duckdb'). This makes the DB location configurable without code changes." },
      { text: "Split frontend API URLs: NEXT_PUBLIC_API_URL vs INTERNAL_API_URL", detail: "NEXT_PUBLIC_API_URL=http://localhost:8000 is baked into the client bundle at build time (browser calls). INTERNAL_API_URL=http://backend:8000 is read at runtime by page.tsx SSR. Without this split, SSR fails inside Docker because localhost:8000 doesn't resolve inside the frontend container." },
      { text: "Add NEXT_PUBLIC_API_URL as a build ARG in the frontend Dockerfile", detail: "ARG NEXT_PUBLIC_API_URL=http://localhost:8000. ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL. Placed before RUN npm run build so Next.js bakes the value into the client bundle." },
      { text: "Add a health check to the backend service and depends_on condition to frontend", detail: "healthcheck: test: curl -f http://localhost:8000/ || exit 1. frontend depends_on: backend: condition: service_healthy. Without this, the frontend starts before FastAPI is ready and all SSR fetches fail." },
      { text: "Add a backend-test service under the 'test' profile", detail: "command: python -m pytest tests/ -v. The in-memory DuckDB fixture means the test service doesn't need a volume. Run with: docker compose --profile test run --rm backend-test." },
      { text: "Write backend tests in conftest.py + test_api.py", detail: "conftest.py: session-scoped in-memory DuckDB fixture. Per-test table wipe in the db fixture. Override get_db with app.dependency_overrides[get_db] = lambda: db. Tests use FastAPI TestClient." },
      { text: "Write frontend tests with Jest + React Testing Library", detail: "Mock global.fetch to return controlled data. Mock BlockEditor (uses innerText, not available in jsdom). Use act() around all state-changing interactions. Use waitFor() for async assertions." },
    ],
    skills: ["Docker multi-stage builds", "Docker health checks", "pytest fixtures", "FastAPI dependency override", "Jest + React Testing Library", "jsdom limitations"],
    decisions: [
      "Named Docker volume over bind mount — bind-mounting the host directory overwrites the container's installed app code. Named volumes are managed by Docker and survive container rebuilds.",
      "Session-scoped DuckDB fixture, per-test table wipe — creating an in-memory DB per test is slow (schema creation overhead). Creating it once per session and wiping data between tests is 10× faster.",
      "BlockEditor mock in Jest — contenteditable's innerText is not implemented in jsdom. Mock the entire BlockEditor component to return a simple div. The editor's own behaviour is tested via manual browser testing, not unit tests.",
      "Test profile for backend-test — avoids running tests every time docker compose up is called. The --profile test flag makes the test service opt-in.",
    ],
    dependsOn: [0, 1, 2],
  },
];

const CATEGORY_META: Record<Phase["category"], { label: string; className: string }> = {
  foundation: { label: "Foundation",  className: "phase-cat--foundation" },
  backend:    { label: "Backend",     className: "phase-cat--backend" },
  frontend:   { label: "Frontend",    className: "phase-cat--frontend" },
  fullstack:  { label: "Full-Stack",  className: "phase-cat--fullstack" },
  devops:     { label: "DevOps",      className: "phase-cat--devops" },
  testing:    { label: "Testing",     className: "phase-cat--testing" },
  ai:         { label: "AI",          className: "phase-cat--ai" },
};

function PhaseCard({ phase, isExpanded, onToggle }: {
  phase: Phase;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const cat = CATEGORY_META[phase.category];

  return (
    <div className={`roadmap-phase-card${isExpanded ? " roadmap-phase-card--expanded" : ""}`}>
      <div className="roadmap-phase-header" onClick={onToggle}>
        <div className="roadmap-phase-header-left">
          <span className="roadmap-phase-num">Phase {phase.id}</span>
          <h3 className="roadmap-phase-title">{phase.title}</h3>
          <span className={`roadmap-phase-cat ${cat.className}`}>{cat.label}</span>
        </div>
        <div className="roadmap-phase-header-right">
          <span className="roadmap-phase-effort">{phase.effort}</span>
          <button
            className="roadmap-expand-btn"
            aria-label={isExpanded ? "collapse" : "expand"}
            onClick={e => { e.stopPropagation(); onToggle(); }}
          >
            {isExpanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      <p className="roadmap-phase-summary">{phase.summary}</p>

      {isExpanded && (
        <div className="roadmap-phase-body">
          <div className="roadmap-section">
            <h4 className="roadmap-section-title">Why this phase matters</h4>
            <p className="roadmap-section-text">{phase.why}</p>
          </div>

          <div className="roadmap-section">
            <h4 className="roadmap-section-title">Implementation steps</h4>
            <ol className="roadmap-steps-list">
              {phase.steps.map((step, i) => (
                <li key={i} className="roadmap-step-item">
                  <span className="roadmap-step-text">{step.text}</span>
                  <span className="roadmap-step-detail">{step.detail}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="roadmap-meta-row">
            <div className="roadmap-section roadmap-section--half">
              <h4 className="roadmap-section-title">Key decisions & gotchas</h4>
              <ul className="roadmap-decisions-list">
                {phase.decisions.map((d, i) => (
                  <li key={i} className="roadmap-decision-item">{d}</li>
                ))}
              </ul>
            </div>

            <div className="roadmap-section roadmap-section--half">
              <h4 className="roadmap-section-title">Skills required</h4>
              <div className="roadmap-skills-chips">
                {phase.skills.map(s => (
                  <span key={s} className="roadmap-skill-chip">{s}</span>
                ))}
              </div>
              {phase.dependsOn.length > 0 && (
                <div className="roadmap-depends">
                  <span className="roadmap-depends-label">Depends on:</span>
                  {phase.dependsOn.map(id => (
                    <span key={id} className="roadmap-depends-chip">Phase {id}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RoadmapView() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const totalEffortHint = "~2–3 weeks for a solo developer working full-time";

  return (
    <div className="roadmap-view">
      <div className="roadmap-header">
        <h2 className="roadmap-heading">Build Work Orbit from Scratch</h2>
        <p className="roadmap-subheading">
          A developer roadmap — 13 phases, ordered by dependency, with implementation depth, key decisions, and gotchas for each step.
        </p>
        <div className="roadmap-meta-bar">
          <span className="roadmap-meta-item"><strong>{PHASES.length}</strong> phases</span>
          <span className="roadmap-meta-sep" />
          <span className="roadmap-meta-item"><strong>{PHASES.reduce((s, p) => s + p.steps.length, 0)}</strong> implementation steps</span>
          <span className="roadmap-meta-sep" />
          <span className="roadmap-meta-item">{totalEffortHint}</span>
        </div>
        <div className="roadmap-legend">
          {Object.entries(CATEGORY_META).map(([key, val]) => (
            <span key={key} className={`roadmap-phase-cat ${val.className}`}>{val.label}</span>
          ))}
        </div>
      </div>

      <div className="roadmap-timeline">
        {PHASES.map(phase => (
          <div key={phase.id} className="roadmap-timeline-row">
            <div className="roadmap-timeline-spine">
              <div className={`roadmap-timeline-dot roadmap-timeline-dot--${phase.category}`} />
              {phase.id < PHASES.length - 1 && <div className="roadmap-timeline-line" />}
            </div>
            <PhaseCard
              phase={phase}
              isExpanded={expandedId === phase.id}
              onToggle={() => setExpandedId(expandedId === phase.id ? null : phase.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
