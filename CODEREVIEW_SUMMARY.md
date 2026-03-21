# Code Change Summary & Review Request

## Objective
Ensure all application views (Dashboard, Calendar, Team, Capacity) are synchronized and reflect consistent, up-to-date information without requiring manual refreshes.

---

## 1. Frontend Changes (`frontend/src/app/DashboardClient.tsx`)

### **Reactive Data Fetching**
- **Added Functions**: `fetchTasks`, `fetchUsers`, and `refreshAllData`. These provide the ability to re-fetch the entire application state from the backend.
- **Refresh Trigger**: Updated `ActiveSlotBanner` to call `refreshAllData()` whenever a scheduled slot is completed (either naturally or manually). This ensures the `time_spent_mins` calculated by the backend is immediately reflected in the task cards and progress bars.
- **Lifecycle**: Maintained `fetchSlots()` on mount to satisfy initial test state requirements while relying on SSR props for initial task/user data.

### **State & Logic Integrity**
- **`handleMoveTask` Fix**: Modified the drop handler to explicitly clear the `week` field if a task is moved to any status other than "Done". This prevents stale "Completed Week" metadata from grouping tasks incorrectly if they are reopened.
- **Auto-Triage in Capacity View**: Updated `onTaskUpdate` within `CapacityPlanningView`. If a task with status `to_be_classified` is assigned a user or a sprint, its status is automatically updated to `current`. This removes the friction of manual status updates after planning.

---

## 2. Backend Changes (`backend/routes.py`)

### **API Alignment**
- **`get_team_focus` Update**: Changed the query logic from `status = 'current'` to `status != 'done'`. 
- **Rationale**: The frontend "Team" view displays all active tasks for members. Previously, the backend filtered this strictly to "current" status, causing a discrepancy between the initial Server-Side Render (SSR) and the reactive client-side state after user interactions.

---

## 3. Verification Results
- **Test Suites**: Both `pytest` (11 tests) and `jest` (61 tests) are passing.
- **Sync Check**: Verified that completing a slot in the Calendar view updates the progress bar in the Dashboard view immediately.
- **Triage Check**: Verified that assigning a new task in Capacity view immediately moves it to the "Current Focus" column in the Dashboard.

---

## 4. Areas for Claude's Review & Feedback
1. **Component Size**: `DashboardClient.tsx` has grown to ~2200 lines. Propose a strategy for splitting this into modular components (e.g., `CalendarView`, `PlanningView`, `TaskBoard`) while maintaining the shared state.
2. **Refresh Efficiency**: `refreshAllData` fetches everything. Should we implement more granular updates or a websocket-based approach for real-time sync?
3. **Optimistic UI vs. Backend Results**: Currently, `handleMoveTask` updates local state before the API call. Should we incorporate the backend's response (including generated activity logs) back into the state to ensure perfect alignment?
4. **Test Coverage**: While existing tests pass, they do not specifically assert on the "cross-view sync" behavior. Recommend patterns for testing interaction between the `ActiveSlotBanner` and the `TaskCard` progress bars.
