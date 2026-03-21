"use client";

import React, { useState, useEffect, useRef } from "react";
import { Task, TaskSlot, User, WorkNotification } from "./types";
import { sortTasks, getWednesdayStart, currentWeekString, generateId } from "./utils";
import { PomodoroFloatingBar } from "./components/TimerComponents";
import { ActiveSlotBanner } from "./components/ActiveSlotBanner";
import { CapacityPlanningView } from "./components/CapacityPlanningView";
import { TaskCard } from "./components/TaskCard";
import { TeamManagementView } from "./components/TeamManagementView";
import { CalendarView } from "./components/CalendarView";
import { AIAgentView } from "./components/AIAgentView";
import { InsightsView } from "./components/InsightsView";
import { NotesView } from "./components/NotesView";

type Props = {
  initialTasks: Task[];
  initialTeamFocus: Record<string, Task[]>;
  initialWeekly: Record<string, Task[]>;
  users: User[];
  apiUrl: string;
};

export default function DashboardClient({
  initialTasks,
  users,
  apiUrl,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [usersList, setUsersList] = useState<User[]>(users);
  
  const [slots, setSlots] = useState<TaskSlot[]>([]);
  const [notifiedSlotIds, setNotifiedSlotIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [quickAddStatus, setQuickAddStatus] = useState<string | null>(null);
  
  const [activeTimerTaskId, setActiveTimerTaskId] = useState<string | null>(null);
  const activeTimerElapsedSecsRef = useRef<number>(0);
  const activeTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [notifications, setNotifications] = useState<WorkNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (activeTimerTaskId) {
      activeTimerElapsedSecsRef.current = 0;
      activeTimerIntervalRef.current = setInterval(() => {
        activeTimerElapsedSecsRef.current += 1;
      }, 1000);
    } else {
      if (activeTimerIntervalRef.current) {
        clearInterval(activeTimerIntervalRef.current);
        activeTimerIntervalRef.current = null;
      }
    }
    return () => {
      if (activeTimerIntervalRef.current) clearInterval(activeTimerIntervalRef.current);
    };
  }, [activeTimerTaskId]);

  const stopTimerAndLogTime = async () => {
    if (!activeTimerTaskId) return;
    const minsToLog = Math.floor(activeTimerElapsedSecsRef.current / 60);
    const taskId = activeTimerTaskId;
    setActiveTimerTaskId(null);
    activeTimerElapsedSecsRef.current = 0;

    if (minsToLog > 0) {
      const prevTasks = [...tasks];
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, time_spent_mins: t.time_spent_mins + minsToLog } : t
      ));
      try {
        const res = await fetch(`${apiUrl}/tasks/${taskId}/time`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minutes: minsToLog })
        });
        if (!res.ok) throw new Error("Failed to log time");
      } catch (err) {
        console.error("Failed to log time spent", err);
        setTasks(prevTasks);
      }
    }
  };

  const fetchSlots = async () => {
    try {
      const res = await fetch(`${apiUrl}/slots`);
      if (res.ok) setSlots(await res.json());
    } catch (err) { console.error("Failed to fetch slots", err); }
  };

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${apiUrl}/tasks`);
      if (res.ok) setTasks(await res.json());
    } catch (err) { console.error("Failed to fetch tasks", err); }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${apiUrl}/users`);
      if (res.ok) setUsersList(await res.json());
    } catch (err) { console.error("Failed to fetch users", err); }
  };

  const refreshAllData = async () => {
    await Promise.all([fetchSlots(), fetchTasks(), fetchUsers()]);
  };

  useEffect(() => { fetchSlots(); }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${apiUrl}/notifications`);
      if (res.ok) setNotifications(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchNotifications();
    const poll = setInterval(fetchNotifications, 60000);
    return () => clearInterval(poll);
  }, []);

  const handleExport = () => {
    const a = document.createElement('a');
    a.href = `${apiUrl}/tasks/export`;
    a.download = 'tasks_export.csv';
    a.click();
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    const form = new FormData();
    form.append('file', importFile);
    try {
      const res = await fetch(`${apiUrl}/tasks/import`, { method: 'POST', body: form });
      if (res.ok) { await fetchTasks(); setImportModalOpen(false); setImportFile(null); }
    } catch { /* ignore */ }
    setImporting(false);
  };

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const notifyUpcoming = () => {
      const now = new Date();
      const upcoming = slots.filter(s => {
        const out = new Date(s.start_time);
        const diffMins = (out.getTime() - now.getTime()) / 60000;
        return diffMins > 0 && diffMins <= 5 && !notifiedSlotIds.has(s.id);
      });
      upcoming.forEach(s => {
        const t = tasks.find(tsk => tsk.id === s.task_id);
        if (t) {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('🔔 Upcoming Slot', { body: `"${t.title}" starts in ≤ 5 minutes` });
          } else { alert(`🔔 Upcoming Slot in <= 5 mins:\n${t.title}`); }
          setNotifiedSlotIds(prev => new Set(prev).add(s.id));
        }
      });
    };
    const notInterval = setInterval(notifyUpcoming, 30000);
    return () => clearInterval(notInterval);
  }, [slots, tasks, notifiedSlotIds]);
  
  const applySearch = (list: Task[]) =>
    searchQuery.trim() ? list.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())) : list;

  const activeUsers = usersList.filter(u => u.is_active);
  const meUser = usersList.find(u => u.id === "me");
  const primaryUserId = meUser?.id || activeUsers[0]?.id || usersList[0]?.id || "u1";

  const toBeClassifiedTasks = applySearch(sortTasks(tasks.filter(t => t.status === "to_be_classified" && (t.user_id === primaryUserId || !t.user_id))));
  const currentTasks = applySearch(sortTasks(tasks.filter(t => t.status === "current" && (t.user_id === primaryUserId || !t.user_id))));
  const upcomingTasks = applySearch(sortTasks(tasks.filter(t => t.status === "upcoming" && (t.user_id === primaryUserId || !t.user_id))));
  const longtermTasks = applySearch(sortTasks(tasks.filter(t => t.status === "long-term" && (t.user_id === primaryUserId || !t.user_id))));

  const teamFocus: Record<string, Task[]> = {};
  activeUsers.forEach((u) => {
    if (u.id !== primaryUserId) {
      teamFocus[u.name] = sortTasks(tasks.filter(t => t.status !== "done" && t.user_id === u.id));
    }
  });

  const parseWeekString = (weekStr: string) => {
    const d = new Date(weekStr);
    if (!isNaN(d.getTime()) && weekStr.includes("-")) {
      const wed = getWednesdayStart(d);
      const q = Math.floor(wed.getMonth() / 3) + 1;
      const qStart = new Date(wed.getFullYear(), Math.floor(wed.getMonth() / 3) * 3, 1);
      const qStartWed = getWednesdayStart(qStart);
      const firstWed = qStartWed.getTime() < qStart.getTime() ? new Date(qStartWed.getTime() + 7 * 86400000) : qStartWed;
      const weeksSinceQStart = Math.floor((wed.getTime() - firstWed.getTime()) / (7 * 86400000));
      const sprintNum = Math.floor(weeksSinceQStart / 2) + 1;
      const sprint = `Q${q} ${wed.getFullYear()} Sprint ${sprintNum}`;
      const weekLabel = `Week of ${wed.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`;
      return { sprint, weekLabel };
    }
    return { sprint: "Current Sprint", weekLabel: weekStr };
  };

  const sprintGroups: Record<string, Record<string, Task[]>> = {};
  tasks.filter(t => t.status === "done" && t.week).forEach((t) => {
    const { sprint, weekLabel } = parseWeekString(t.week as string);
    if (!sprintGroups[sprint]) sprintGroups[sprint] = {};
    if (!sprintGroups[sprint][weekLabel]) sprintGroups[sprint][weekLabel] = [];
    sprintGroups[sprint][weekLabel].push(t);
  });
  Object.keys(sprintGroups).forEach(s => {
    Object.keys(sprintGroups[s]).forEach(w => { sprintGroups[s][w] = sortTasks(sprintGroups[s][w]); });
  });

  const handleFieldUpdate = async (taskId: string, updates: Partial<Task>) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const prevTasks = [...tasks];
    const updated = { ...task, ...updates };
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
    try {
      const res = await fetch(`${apiUrl || 'http://localhost:8000'}/tasks/${taskId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch (err) { console.error('Failed to update task field:', err); setTasks(prevTasks); }
  };

  const toggleSelectTask = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  const toggleColCollapse = (key: string) => {
    setCollapsedCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleMoveTask = async (task: Task, newStatus: string, newUserId: string, week?: string | null) => {
    if (task.status === newStatus && task.user_id === newUserId) return;
    const prevTasks = [...tasks];
    const updatedTask = { ...task, status: newStatus, user_id: newUserId, week: week !== undefined ? week : task.week };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));
    try {
      const res = await fetch(`${apiUrl || 'http://localhost:8000'}/tasks/${task.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTask),
      });
      if (!res.ok) throw new Error("Move failed");
    } catch (err) { console.error("Failed to move task:", err); setTasks(prevTasks); }
  };

  const handleBulkMarkDone = async () => {
    const ids = [...selectedTaskIds];
    const week = currentWeekString();
    for (const id of ids) {
      const t = tasks.find(tk => tk.id === id);
      if (t) await handleMoveTask(t, 'done', t.user_id || primaryUserId, week);
    }
    setSelectedTaskIds(new Set());
  };

  const handleColumnQuickAdd = async (e: React.FormEvent, status: string) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const title = (form.elements.namedItem('title') as HTMLInputElement).value.trim();
    if (!title) return;
    const newTask: Task = {
      id: generateId(), title, description: null, status,
      user_id: primaryUserId, week: null, next_update_date: null,
      due_date: null, feedback: null, time_estimate_mins: null,
      time_spent_mins: 0, sprint: null, priority: 'p2',
    };
    setTasks(prev => [...prev, newTask]);
    setQuickAddStatus(null);
    try {
      const res = await fetch(`${apiUrl || 'http://localhost:8000'}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });
      if (!res.ok) throw new Error("Quick add failed");
    } catch (err) { console.error('Failed to quick-add task:', err); fetchTasks(); }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const dtStr = newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null;
    const newTask: Task = {
      id: generateId(), title: newTaskTitle, description: newTaskDesc || null,
      status: "to_be_classified", user_id: primaryUserId, week: null,
      next_update_date: null, due_date: dtStr, feedback: null,
      time_estimate_mins: null, time_spent_mins: 0, sprint: null
    };
    setTasks([...tasks, newTask]);
    setIsAddingTask(false); setNewTaskTitle(""); setNewTaskDesc(""); setNewTaskDueDate("");
    try {
      const res = await fetch(`${apiUrl}/tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });
      if (!res.ok) throw new Error("Create failed");
    } catch (err) { console.error("Failed to create task", err); fetchTasks(); }
  };

  const handleDeleteTask = async (taskId: string) => {
    const prevTasks = [...tasks];
    setTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      const res = await fetch(`${apiUrl}/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    } catch (err) { console.error("Failed to delete task:", err); setTasks(prevTasks); }
  };

  const taskCardProps = {
    apiUrl, users: usersList, primaryUserId, slots, activeTimerTaskId,
    stopTimerAndLogTime, setActiveTimerTaskId, setTasks, fetchSlots,
    currentWeekString, selectedTaskIds, toggleSelectTask, handleFieldUpdate, handleMoveTask,
    onDelete: handleDeleteTask, tasks
  };

  return (
    <div className="dashboard-container">
      <ActiveSlotBanner slots={slots} tasks={tasks} refreshData={refreshAllData} apiUrl={apiUrl} onSlotStart={() => stopTimerAndLogTime()} />
      <div className="tab-nav-wrapper">
        <div className="tab-nav">
          {['dashboard', 'calendar', 'team', 'capacity', 'insights', 'notes', 'ai'].map(tab => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {tab === 'ai' ? 'AI Agent' : tab === 'insights' ? 'Insights' : tab === 'notes' ? 'Notes' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="tab-nav-actions">
          <div className="notif-wrapper">
            <button className="notif-bell-btn" onClick={() => setNotifOpen(o => !o)} title="Notifications">
              <span className="notif-bell-icon">&#x1F514;</span>
              {notifications.length > 0 && <span className="notif-count-badge">{notifications.length}</span>}
            </button>
            {notifOpen && (
              <div className="notif-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="notif-header">
                  <span className="notif-header-title">Notifications</span>
                  <button className="notif-clear-btn" onClick={() => { setNotifications([]); setNotifOpen(false); }}>Clear all</button>
                </div>
                {notifications.length === 0 && <p className="notif-empty">All clear.</p>}
                {notifications.map((n, i) => (
                  <div key={i} className="notif-item" data-severity={n.severity}>
                    <span className="notif-message">{n.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'team' ? (
        <TeamManagementView usersList={usersList} setUsersList={setUsersList} primaryUserId={primaryUserId} apiUrl={apiUrl} />
      ) : activeTab === 'calendar' ? (
        <CalendarView tasks={tasks} slots={slots} fetchSlots={fetchSlots} apiUrl={apiUrl} primaryUserId={primaryUserId} />
      ) : activeTab === 'insights' ? (
        <InsightsView apiUrl={apiUrl} tasks={tasks} />
      ) : activeTab === 'notes' ? (
        <NotesView apiUrl={apiUrl} />
      ) : activeTab === 'ai' ? (
        <AIAgentView apiUrl={apiUrl} refreshData={refreshAllData} />
      ) : activeTab === 'capacity' ? (
        <CapacityPlanningView tasks={tasks} users={usersList} apiUrl={apiUrl} slots={slots}
          onTaskUpdate={async (taskId, userId, sprint, estimateHours) => {
            const task = tasks.find(t => t.id === taskId);
            if (!task) return;
            const updated: Task = { ...task, user_id: userId, sprint,
              status: (task.status === "to_be_classified" && userId && sprint) ? "current" : task.status,
              time_estimate_mins: estimateHours != null ? Math.round(estimateHours * 60) : (task.time_estimate_mins || 0)
            };
            const prevTasks = [...tasks];
            setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
            try {
              const res = await fetch(`${apiUrl}/tasks/${taskId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
              if (!res.ok) throw new Error("Update failed");
            } catch (err) { console.error("Failed to update task:", err); setTasks(prevTasks); }
          }}
          onTaskSplit={async (taskId, userId, currentSprintId, keptHours, overflowHours, overflowSprintId) => {
            const task = tasks.find(t => t.id === taskId);
            if (!task) return;
            const updatedTask = { ...task, time_estimate_mins: Math.round(keptHours * 60) };
            const overflowTask: Task = { ...task, id: generateId(), title: task.title + ' (cont.)', time_estimate_mins: Math.round(overflowHours * 60), time_spent_mins: 0, sprint: overflowSprintId, week: null, next_update_date: null, feedback: null };
            setTasks(prev => [...prev.map(t => t.id === taskId ? updatedTask : t), overflowTask]);
            try {
              await fetch(`${apiUrl}/tasks/${taskId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedTask) });
              await fetch(`${apiUrl}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(overflowTask) });
            } catch (err) { console.error('Failed to split task:', err); fetchTasks(); }
          }}
        />
      ) : (
      <>
        <div className="actions-bar">
          <div className="actions-bar-left">
            {!isAddingTask ? (
              <button className="btn-primary" onClick={() => setIsAddingTask(true)}>+ Add New Task</button>
            ) : (
              <form className="add-task-form" onSubmit={handleCreateTask}>
                <input autoFocus className="input-field title-input" placeholder="Task Title" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
                <input className="input-field" placeholder="Description (Optional)" value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} />
                <div className="add-task-due-group"><span className="add-task-due-label">Due:</span><input type="date" className="date-input" value={newTaskDueDate} onChange={(e) => setNewTaskDueDate(e.target.value)} /></div>
                <div className="form-actions"><button type="submit" className="btn-primary">Save</button><button type="button" className="btn-secondary" onClick={() => setIsAddingTask(false)}>Cancel</button></div>
              </form>
            )}
          </div>
          <div className="actions-bar-right">
            <input className="dashboard-search-input" type="search" placeholder="🔍 Search tasks…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <button className="btn-secondary" onClick={handleExport} title="Export all tasks as CSV">Export CSV</button>
            <button className="btn-secondary" onClick={() => setImportModalOpen(true)} title="Import tasks from CSV">Import CSV</button>
            <button className={`focus-mode-btn${focusMode ? ' focus-mode-btn--active' : ''}`} onClick={() => setFocusMode(f => !f)} title={focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode — hide everything but Current Focus'}>{focusMode ? '✕ Exit Focus' : '⚡ Focus'}</button>
          </div>
        </div>
        {importModalOpen && (
          <div className="import-modal-overlay" onClick={() => { setImportModalOpen(false); setImportFile(null); }}>
            <div className="import-modal" onClick={(e) => e.stopPropagation()}>
              <div className="import-modal-header">
                <h3 className="import-modal-title">Import Tasks from CSV</h3>
                <button className="retro-close-btn" onClick={() => { setImportModalOpen(false); setImportFile(null); }}>×</button>
              </div>
              <p className="import-hint">CSV must have headers: <code>id, title, description, status, user_id, priority, time_estimate_mins, time_spent_mins</code></p>
              <input type="file" accept=".csv" className="import-file-input" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
              {importFile && <p className="import-filename">{importFile.name}</p>}
              <div className="import-actions">
                <button className="btn-primary" onClick={handleImport} disabled={!importFile || importing}>{importing ? 'Importing…' : 'Import'}</button>
                <button className="btn-secondary" onClick={() => { setImportModalOpen(false); setImportFile(null); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {selectedTaskIds.size > 0 && (
          <div className="bulk-action-bar"><span className="bulk-count">{selectedTaskIds.size} selected</span><button className="btn-primary bulk-mark-done-btn" onClick={handleBulkMarkDone}>✓ Mark Done</button><button className="btn-secondary" onClick={() => setSelectedTaskIds(new Set())}>Deselect All</button></div>
        )}
        <div className={`dashboard-grid${focusMode ? ' dashboard-grid--focus' : ''}`}>
          <div className="dashboard-col">
            <section className={`section current-focus${collapsedCols.has('current') ? ' section--collapsed' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const task = JSON.parse(e.dataTransfer.getData("application/json")); handleMoveTask(task, "current", primaryUserId); }}>
              <h2>🎯 Current Focus <span className="section-count">{currentTasks.length}</span>{currentTasks.length >= 5 && <span className="wip-warning" title="High WIP">⚠️ High WIP</span>}<button className="column-collapse-btn" onClick={e => { e.stopPropagation(); toggleColCollapse('current'); }}>{collapsedCols.has('current') ? '▸' : '▾'}</button></h2>
              {!collapsedCols.has('current') && <>
                {currentTasks.length === 0 && <div className="empty-state">No current tasks.</div>}
                {currentTasks.map(t => <TaskCard key={t.id} task={t} {...taskCardProps} />)}
                {quickAddStatus === 'current' ? <form className="column-quick-add-form" onSubmit={e => handleColumnQuickAdd(e, 'current')}><input name="title" className="input-field" placeholder="Task title…" autoFocus required /><div className="quick-add-actions"><button type="submit" className="btn-primary schedule-btn-sm">Add</button><button type="button" className="btn-secondary schedule-btn-sm" onClick={() => setQuickAddStatus(null)}>Cancel</button></div></form> : <button className="column-quick-add-btn" onClick={() => setQuickAddStatus('current')}>+ Add</button>}
              </>}
            </section>
            {!focusMode && <>
              <section className={`section${collapsedCols.has('upcoming') ? ' section--collapsed' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const task = JSON.parse(e.dataTransfer.getData("application/json")); handleMoveTask(task, "upcoming", primaryUserId); }}>
                <h2>⏳ Upcoming <span className="section-count">{upcomingTasks.length}</span><button className="column-collapse-btn" onClick={e => { e.stopPropagation(); toggleColCollapse('upcoming'); }}>{collapsedCols.has('upcoming') ? '▸' : '▾'}</button></h2>
                {!collapsedCols.has('upcoming') && <>
                  {upcomingTasks.length === 0 && <div className="empty-state">None scheduled.</div>}
                  {upcomingTasks.map(t => <TaskCard key={t.id} task={t} {...taskCardProps} />)}
                  {quickAddStatus === 'upcoming' ? <form className="column-quick-add-form" onSubmit={e => handleColumnQuickAdd(e, 'upcoming')}><input name="title" className="input-field" placeholder="Task title…" autoFocus required /><div className="quick-add-actions"><button type="submit" className="btn-primary schedule-btn-sm">Add</button><button type="button" className="btn-secondary schedule-btn-sm" onClick={() => setQuickAddStatus(null)}>Cancel</button></div></form> : <button className="column-quick-add-btn" onClick={() => setQuickAddStatus('upcoming')}>+ Add</button>}
                </>}
              </section>
              <section className={`section${collapsedCols.has('triage') ? ' section--collapsed' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const task = JSON.parse(e.dataTransfer.getData("application/json")); handleMoveTask(task, "to_be_classified", primaryUserId); }}>
                <h2>📥 Triage <span className="section-count">{toBeClassifiedTasks.length}</span><button className="column-collapse-btn" onClick={e => { e.stopPropagation(); toggleColCollapse('triage'); }}>{collapsedCols.has('triage') ? '▸' : '▾'}</button></h2>
                {!collapsedCols.has('triage') && <>
                  {toBeClassifiedTasks.length === 0 && <div className="empty-state">No new tasks.</div>}
                  {toBeClassifiedTasks.map(t => <TaskCard key={t.id} task={t} {...taskCardProps} />)}
                </>}
              </section>
            </>}
          </div>
          {!focusMode && <div className="dashboard-col">
            <section className={`section team-focus${collapsedCols.has('team') ? ' section--collapsed' : ''}`}>
              <h2>👥 Team <span className="section-count">{activeUsers.filter(u => u.id !== primaryUserId).length}</span><button className="column-collapse-btn" onClick={e => { e.stopPropagation(); toggleColCollapse('team'); }}>{collapsedCols.has('team') ? '▸' : '▾'}</button></h2>
              {!collapsedCols.has('team') && activeUsers.filter(u => u.id !== primaryUserId).map(u => {
                const memberTasks = teamFocus[u.name] || [];
                return (
                  <div key={u.id} className="team-member team-member-drop" onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent-purple)"; }} onDragLeave={e => e.currentTarget.style.borderColor = "transparent"} onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "transparent"; const task = JSON.parse(e.dataTransfer.getData("application/json")); handleMoveTask(task, "current", u.id); }}>
                    <div className="team-member-name">{u.name} <span className="team-member-count">{memberTasks.length}</span></div>
                    {memberTasks.length === 0 && <div className="empty-state team-member-drop-empty">Drop tasks here</div>}
                    {memberTasks.map(t => <TaskCard key={t.id} task={t} {...taskCardProps} />)}
                  </div>
                );
              })}
            </section>
            <section className={`section${collapsedCols.has('longterm') ? ' section--collapsed' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const task = JSON.parse(e.dataTransfer.getData("application/json")); handleMoveTask(task, "long-term", primaryUserId); }}>
              <h2>🔭 Long-term <span className="section-count">{longtermTasks.length}</span><button className="column-collapse-btn" onClick={e => { e.stopPropagation(); toggleColCollapse('longterm'); }}>{collapsedCols.has('longterm') ? '▸' : '▾'}</button></h2>
              {!collapsedCols.has('longterm') && <>
                {longtermTasks.length === 0 && <div className="empty-state">No long-term tasks.</div>}
                {longtermTasks.map(t => <TaskCard key={t.id} task={t} {...taskCardProps} />)}
                {quickAddStatus === 'long-term' ? <form className="column-quick-add-form" onSubmit={e => handleColumnQuickAdd(e, 'long-term')}><input name="title" className="input-field" placeholder="Task title…" autoFocus required /><div className="quick-add-actions"><button type="submit" className="btn-primary schedule-btn-sm">Add</button><button type="button" className="btn-secondary schedule-btn-sm" onClick={() => setQuickAddStatus(null)}>Cancel</button></div></form> : <button className="column-quick-add-btn" onClick={() => setQuickAddStatus('long-term')}>+ Add</button>}
              </>}
            </section>
            <section className={`section${collapsedCols.has('done') ? ' section--collapsed' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const task = JSON.parse(e.dataTransfer.getData("application/json")); handleMoveTask(task, "done", primaryUserId, currentWeekString()); }}>
              <h2>✅ Done <span className="section-count">{tasks.filter(t => t.status === 'done').length}</span><button className="column-collapse-btn" onClick={e => { e.stopPropagation(); toggleColCollapse('done'); }}>{collapsedCols.has('done') ? '▸' : '▾'}</button></h2>
              {!collapsedCols.has('done') && Object.keys(sprintGroups).sort((a, b) => b.localeCompare(a)).map(sName => (
                <div key={sName} className="sprint-group"><h3 className="sprint-label">{sName}</h3>
                  {Object.keys(sprintGroups[sName]).sort((a, b) => b.localeCompare(a)).map(wLabel => (
                    <details key={wLabel} className="week-dropdown" open><summary className="week-summary"><span className="week-summary-label">{wLabel}</span><span className="badge done week-done-count">{sprintGroups[sName][wLabel].length} Done</span></summary><div className="week-tasks week-tasks-inner">{sprintGroups[sName][wLabel].map(t => <TaskCard key={t.id} task={t} {...taskCardProps} />)}</div></details>
                  ))}
                </div>
              ))}
            </section>
          </div>}
        </div>
      </>
      )}
      {activeTimerTaskId && <PomodoroFloatingBar taskTitle={tasks.find(t => t.id === activeTimerTaskId)?.title || "Task"} onStop={stopTimerAndLogTime} />}
    </div>
  );
}
