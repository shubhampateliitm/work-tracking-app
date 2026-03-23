import React, { useState } from "react";
import { Task, TaskUpdate, TaskActivity, TaskSlot, User, TaskDependencyEntry, TaskNote } from "../types";
import { LiveTimerBadge } from "./TimerComponents";
import { BlockViewer } from "./BlockViewer";
import { NoteEditor } from "./NoteEditor";

type Props = {
  task: Task;
  apiUrl: string;
  users: User[];
  primaryUserId: string;
  slots: TaskSlot[];
  activeTimerTaskId: string | null;
  stopTimerAndLogTime: () => void;
  setActiveTimerTaskId: (id: string | null) => void;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  fetchSlots: () => void;
  currentWeekString: () => string;
  selectedTaskIds: Set<string>;
  toggleSelectTask: (id: string) => void;
  handleFieldUpdate: (id: string, updates: Partial<Task>) => void;
  handleMoveTask: (task: Task, newStatus: string, newUserId: string, week?: string | null) => void;
  onDelete: (taskId: string) => void;
  tasks?: Task[];
};


export const TaskCard = ({
  task, apiUrl, users, primaryUserId, slots, activeTimerTaskId,
  stopTimerAndLogTime, setActiveTimerTaskId, setTasks, fetchSlots,
  currentWeekString, selectedTaskIds, toggleSelectTask, handleFieldUpdate, handleMoveTask, onDelete, tasks
}: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [deps, setDeps] = useState<{ blocked_by: TaskDependencyEntry[]; blocking: TaskDependencyEntry[] } | null>(null);
  const [addingBlocker, setAddingBlocker] = useState(false);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [newUpdate, setNewUpdate] = useState("");
  const [nextDate, setNextDate] = useState(task.next_update_date ? task.next_update_date.split('T')[0] : "");
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.split('T')[0] : "");
  const [feedback, setFeedback] = useState(task.feedback || "");

  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleStartTime, setScheduleStartTime] = useState("");
  const [scheduleDurationMins, setScheduleDurationMins] = useState("60");
  const [isScheduled, setIsScheduled] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [activeDetailTab, setActiveDetailTab] = useState<'history' | 'schedule' | 'activity' | 'deps' | 'notes'>('history');
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [addingNote, setAddingNote] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [isEditingEstimate, setIsEditingEstimate] = useState(false);
  const [estimateInput, setEstimateInput] = useState('');

  const fetchUpdates = async () => {
    try {
      const urlStr = `${apiUrl || 'http://localhost:8000'}/tasks/${task.id}/updates`;
      const r = await fetch(urlStr);
      if (r.ok) setUpdates(await r.json());
    } catch (err) { console.error("Failed to fetch updates:", err); }
  };

  const fetchActivity = async () => {
    try {
      const urlStr = `${apiUrl || 'http://localhost:8000'}/tasks/${task.id}/activity`;
      const r = await fetch(urlStr);
      if (r.ok) setActivity(await r.json());
    } catch (err) { console.error("Failed to fetch activity:", err); }
  };

  const fetchNotes = async () => {
    try {
      const r = await fetch(`${apiUrl || 'http://localhost:8000'}/tasks/${task.id}/notes`);
      if (r.ok) setNotes(await r.json());
    } catch (err) { console.error("Failed to fetch notes:", err); }
  };

  const saveNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    const base = apiUrl || 'http://localhost:8000';
    if (editingNoteId) {
      const existing = notes.find(n => n.id === editingNoteId);
      const res = await fetch(`${base}/notes/${editingNoteId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingNoteId, task_id: task.id, title: noteTitle, content: noteContent, is_published: existing?.is_published ?? false })
      });
      if (res.ok) { const updated = await res.json(); setNotes(prev => prev.map(n => n.id === editingNoteId ? updated : n)); }
    } else {
      const id = crypto.randomUUID();
      const res = await fetch(`${base}/tasks/${task.id}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, task_id: task.id, title: noteTitle, content: noteContent, is_published: false })
      });
      if (res.ok) { const created = await res.json(); setNotes(prev => [created, ...prev]); }
    }
    setNoteTitle(''); setNoteContent(''); setEditingNoteId(null); setAddingNote(false);
  };

  const togglePublish = async (note: TaskNote) => {
    const base = apiUrl || 'http://localhost:8000';
    const res = await fetch(`${base}/notes/${note.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...note, is_published: !note.is_published })
    });
    if (res.ok) { const updated = await res.json(); setNotes(prev => prev.map(n => n.id === note.id ? updated : n)); }
  };

  const deleteNote = async (noteId: string) => {
    const base = apiUrl || 'http://localhost:8000';
    const res = await fetch(`${base}/notes/${noteId}`, { method: 'DELETE' });
    if (res.ok) setNotes(prev => prev.filter(n => n.id !== noteId));
  };

  const handleScheduleSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleDate || !scheduleStartTime) return;
    const startDateTime = new Date(`${scheduleDate}T${scheduleStartTime}:00`);
    const endDateTime = new Date(startDateTime.getTime() + parseInt(scheduleDurationMins) * 60000);
    const slotData = {
      id: crypto.randomUUID(),
      task_id: task.id,
      user_id: task.user_id || primaryUserId,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString()
    };
    try {
      const res = await fetch(`${apiUrl || 'http://localhost:8000'}/slots`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slotData)
      });
      if (res.ok) {
        setIsScheduling(false);
        setIsScheduled(true);
        setTimeout(() => { setIsScheduled(false); fetchSlots(); }, 3000);
      } else if (res.status === 409) {
        const errData = await res.json();
        alert(errData.detail || "Time slot overlaps with an existing scheduled task.");
      } else { alert("Failed to schedule slot."); }
    } catch (err) { console.error("Failed to schedule slot", err); }
  };

  const handleSetInitialDueDate = async (newDate: string) => {
     if (!newDate) return;
     const dtStr = new Date(newDate).toISOString();
     const updatedTask = { ...task, due_date: dtStr };
     setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));
     await fetch(`${apiUrl}/tasks/${task.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTask),
     });
     setDueDate(newDate);
  };

  const handleExpand = () => {
    if (!expanded) { fetchUpdates(); fetchActivity(); }
    setExpanded(!expanded);
  };

  const handleSetEstimate = async (hoursStr: string) => {
    const hours = parseFloat(hoursStr);
    if (isNaN(hours)) return;
    const mins = Math.round(hours * 60);
    const updatedTask = { ...task, time_estimate_mins: mins };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));
    try {
      await fetch(`${apiUrl || 'http://localhost:8000'}/tasks/${task.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTask),
      });
    } catch (err) { console.error("Failed to update estimate:", err); }
  };

  const saveRename = async (newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === task.title) { setEditTitle(task.title); setIsEditing(false); return; }
    const updatedTask = { ...task, title: trimmed };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));
    setIsEditing(false);
    try {
      await fetch(`${apiUrl || 'http://localhost:8000'}/tasks/${task.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTask),
      });
    } catch (err) { console.error("Failed to rename task:", err); }
  };

  const submitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUpdate.trim()) return;
    let finalUpdateText = newUpdate.trim();
    const oldDueDateStr = task.due_date ? task.due_date.split('T')[0] : "None";
    const newDueDateStr = dueDate || "None";
    if (dueDate !== (task.due_date ? task.due_date.split('T')[0] : "")) {
      finalUpdateText = `[Due Date Changed: ${oldDueDateStr} ➡️ ${newDueDateStr}] ${finalUpdateText}`;
    }
    const urlStr = `${apiUrl || 'http://localhost:8000'}/tasks/${task.id}/updates?update_text=${encodeURIComponent(finalUpdateText)}`;
    const r = await fetch(urlStr, { method: "POST" });
    if (r.ok) {
      const u = await r.json();
      setUpdates([u, ...updates]);
      setNewUpdate("");
    }
    let changed = false;
    const updatedTask = { ...task };
    if (nextDate !== (task.next_update_date ? task.next_update_date.split('T')[0] : "")) {
       updatedTask.next_update_date = nextDate ? new Date(nextDate).toISOString() : null;
       changed = true;
    }
    if (dueDate !== (task.due_date ? task.due_date.split('T')[0] : "")) {
       updatedTask.due_date = dueDate ? new Date(dueDate).toISOString() : null;
       changed = true;
    }
    if (changed) {
       setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));
       await fetch(`${apiUrl}/tasks/${task.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedTask),
       });
    }
  };

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedTask = { ...task, feedback: feedback.trim() };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));
    await fetch(`${apiUrl}/tasks/${task.id}`, {
       method: "PUT", headers: { "Content-Type": "application/json" },
       body: JSON.stringify(updatedTask),
    });
  };

  const formatDate = (ds: string) => {
     const d = new Date(ds);
     return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const assignedUser = users.find(u => u.id === task.user_id);
  const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const activeUsers = users.filter(u => u.is_active);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = task.status !== 'done' && task.due_date != null && new Date(task.due_date) < today;
  const isOverBudget = task.status !== 'done' && (task.time_estimate_mins ?? 0) > 0 && task.time_spent_mins >= (task.time_estimate_mins ?? 0) * 0.8;
  const riskFlag = isOverdue ? 'overdue' : isOverBudget ? 'budget' : undefined;

  return (
    <div className="task-card" data-status={task.status} data-risk={riskFlag} draggable onDragStart={(e) => { e.dataTransfer.setData("application/json", JSON.stringify(task)); e.dataTransfer.effectAllowed = "move"; }} style={{ cursor: 'grab' }}>
      <div className="task-header-flex">
        <input type="checkbox" className="task-select-checkbox" checked={selectedTaskIds.has(task.id)} onChange={() => toggleSelectTask(task.id)} onClick={e => e.stopPropagation()} title="Select for bulk action" />
        {isEditing ? (
          <input autoFocus className="task-title-edit" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveRename(editTitle); if (e.key === 'Escape') { setEditTitle(task.title); setIsEditing(false); } }} onBlur={() => saveRename(editTitle)} />
        ) : (
          <div className="task-title" onClick={handleExpand} onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditTitle(task.title); }}>
            {task.recurrence_rule && <span className="recurring-badge" title={`Repeats ${task.recurrence_rule}`}>↻</span>}
            {task.title}
          </div>
        )}
        <div className="task-card-actions">
          {assignedUser && <span className="assignee-initials" title={assignedUser.name}>{getInitials(assignedUser.name)}</span>}
          <select className="task-actions-select" value="" onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              if (val === "delete") {
                if (window.confirm(`Delete "${task.title}"? This cannot be undone.`)) onDelete(task.id);
              } else if (val === "done") handleMoveTask(task, "done", task.user_id, currentWeekString());
              else if (val.startsWith("user_")) handleMoveTask(task, "current", val.substring(5));
              else handleMoveTask(task, val, primaryUserId);
            }}>
            <option value="">Move...</option>
            <optgroup label="Triage"><option value="to_be_classified">To Be Classified</option></optgroup>
            <optgroup label="My Focus"><option value="current">Current Focus</option><option value="upcoming">Upcoming</option><option value="long-term">Long-Term</option></optgroup>
            <optgroup label="Team Focus">{activeUsers.filter(u => u.id !== primaryUserId).map(u => <option key={u.id} value={`user_${u.id}`}>Assign to {u.name}</option>)}</optgroup>
            <optgroup label="Completion"><option value="done">Mark Done</option></optgroup>
            <optgroup label="Danger"><option value="delete">🗑 Delete</option></optgroup>
          </select>
        </div>
      </div>
      {task.time_estimate_mins != null && task.time_estimate_mins > 0 && (
        <div className="task-progress-wrap">
          <div className={`task-progress-bar${task.time_spent_mins >= task.time_estimate_mins ? ' task-progress-bar--over' : task.time_spent_mins / task.time_estimate_mins > 0.75 ? ' task-progress-bar--warn' : ''}`}
            style={{ '--progress-pct': `${Math.min(100, (task.time_spent_mins / task.time_estimate_mins) * 100)}%` } as React.CSSProperties} />
        </div>
      )}
      <div className="task-meta-row">
        <button className={`priority-badge priority-${task.priority ?? 'p2'}`} title="Click to cycle priority" onClick={(e) => { e.stopPropagation(); const cycle: Record<string, string> = { p1: 'p2', p2: 'p3', p3: 'p1' }; handleFieldUpdate(task.id, { priority: cycle[task.priority ?? 'p2'] ?? 'p2' }); }}>{(task.priority ?? 'p2').toUpperCase()}</button>
        {task.status === 'current' && task.next_update_date && new Date(task.next_update_date) < new Date() && <span className="stale-badge" title="Update overdue — click to add update" onClick={handleExpand}>● stale</span>}
        {task.status === "done" && <span className="badge done">✓ Completed {assignedUser ? `by ${assignedUser.name}` : ''}</span>}
        {task.due_date && task.status !== "done" && <span className={`date-badge ${new Date(task.due_date).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) ? 'overdue' : 'future'}`}>Due {formatDate(task.due_date).split(',')[0]}</span>}
        {!task.due_date && task.status !== "done" && <label className="date-badge date-badge-set">📅 Set Due<input type="date" className="date-input" onChange={(e) => handleSetInitialDueDate(e.target.value)} /></label>}
        {task.next_update_date && task.status !== "done" && <span className="date-badge next-update">📅 Next: {formatDate(task.next_update_date)}</span>}
        {task.status !== "done" && (
          <div className="time-tracking-wrapper">
            <button className={`timer-play-btn ${activeTimerTaskId === task.id ? 'active' : ''}`} title={activeTimerTaskId === task.id ? "Stop Timer" : "Start Pomodoro Timer"} onClick={(e) => { e.stopPropagation(); if (activeTimerTaskId === task.id) stopTimerAndLogTime(); else { if (activeTimerTaskId) stopTimerAndLogTime(); setActiveTimerTaskId(task.id); } }}>{activeTimerTaskId === task.id ? "⏸ Stop" : "▶ Start"}</button>
            <span className="time-spent-display" title="Total Time Spent (Pomodoro + Slots)">⏱️ {Math.floor(task.time_spent_mins / 60)}h {task.time_spent_mins % 60}m spent {activeTimerTaskId === task.id && <LiveTimerBadge />}</span>
            <span className="time-divider">/</span>
            {isEditingEstimate ? (
              <input type="number" className="estimate-inline-input" placeholder="hrs" min="0.25" step="0.25" autoFocus value={estimateInput} onChange={e => setEstimateInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (estimateInput) { handleSetEstimate(estimateInput); setIsEditingEstimate(false); setEstimateInput(''); } } if (e.key === 'Escape') { setIsEditingEstimate(false); setEstimateInput(''); } }} onBlur={() => { if (estimateInput) handleSetEstimate(estimateInput); setIsEditingEstimate(false); setEstimateInput(''); }} onClick={e => e.stopPropagation()} />
            ) : task.time_estimate_mins !== null && task.time_estimate_mins > 0 ? (
              <span className="time-estimate-display" title="Double-click to edit" onDoubleClick={(e) => { e.stopPropagation(); setEstimateInput((task.time_estimate_mins! / 60).toFixed(1)); setIsEditingEstimate(true); }}>{Math.floor(task.time_estimate_mins / 60)}h {task.time_estimate_mins % 60}m</span>
            ) : ( <span className="time-estimate-add" title="Add Estimate (hours)" onClick={(e) => { e.stopPropagation(); setEstimateInput(''); setIsEditingEstimate(true); }}>⌛ Est?</span> )}
            <button className="btn-secondary slot-btn" onClick={(e) => { e.stopPropagation(); setIsScheduling(!isScheduling); }}>📅 Schedule</button>
          </div>
        )}
        {isScheduled && <div className="schedule-success">✓ Slot scheduled — check the Calendar tab</div>}
        {isScheduling && (
          <form className="schedule-slot-form" onSubmit={handleScheduleSlot} onClick={(e) => e.stopPropagation()}>
            <div className="schedule-inputs">
              <input type="date" required className="date-input" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
              <input type="time" required className="date-input" value={scheduleStartTime} onChange={(e) => setScheduleStartTime(e.target.value)} />
              <select className="duration-select" value={scheduleDurationMins} onChange={(e) => setScheduleDurationMins(e.target.value)}>
                <option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 hr</option><option value="90">1.5 hr</option><option value="120">2 hr</option>
              </select>
              <button type="submit" className="btn-primary schedule-btn-sm">Reserve</button>
              <button type="button" className="btn-secondary schedule-btn-sm" onClick={() => setIsScheduling(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>
      {expanded && (
        <div className="task-updates-section">
          {task.status === "done" ? (
            <div className="feedback-section">
              <h4>Completion Feedback</h4>
              <form onSubmit={submitFeedback}>
                <textarea className="input-field" placeholder="Add notes, results, or feedback for this completed task..." value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} />
                <div className="feedback-actions"><button type="submit" className="btn-green">Save Feedback</button></div>
              </form>
            </div>
          ) : (
            <form className="update-form" onSubmit={submitUpdate}>
              <textarea className="input-field" placeholder="Add latest progress update..." value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)} rows={2} />
              <div className="update-form-row">
                <div className="update-form-dates">
                   <div className="date-field-group"><span className="date-field-label">Next Update:</span><input type="date" className="date-input" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></div>
                   {task.due_date && <div className="date-field-group"><span className="date-field-label">Change Due Date:</span><input type="date" className="date-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>}
                </div>
                <button type="submit" className="btn-primary btn-post">Post</button>
              </div>
            </form>
          )}
          {task.status !== 'done' && (
            <div className="recurrence-row">
              <span className="recurrence-label">Repeat:</span>
              <select
                className="recurrence-select"
                value={task.recurrence_rule ?? ''}
                onChange={(e) => handleFieldUpdate(task.id, { recurrence_rule: e.target.value || null })}
              >
                <option value="">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
              </select>
            </div>
          )}
          <div className="detail-tabs">
            <button className={`detail-tab ${activeDetailTab === 'history' ? 'active' : ''}`} onClick={() => setActiveDetailTab('history')}>History ({updates.length})</button>
            <button className={`detail-tab ${activeDetailTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveDetailTab('schedule')}>Schedule ({slots.filter(s => s.task_id === task.id).length})</button>
            <button className={`detail-tab ${activeDetailTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveDetailTab('activity')}>Activity ({activity.length})</button>
            <button className={`detail-tab ${activeDetailTab === 'deps' ? 'active' : ''}`} onClick={async () => {
              setActiveDetailTab('deps');
              if (!deps) {
                try {
                  const res = await fetch(`${apiUrl}/tasks/${task.id}/dependencies`);
                  if (res.ok) setDeps(await res.json());
                } catch { /* ignore */ }
              }
            }}>Dependencies</button>
            <button className={`detail-tab ${activeDetailTab === 'notes' ? 'active' : ''}`} onClick={async () => {
              setActiveDetailTab('notes');
              await fetchNotes();
            }}>Notes ({notes.length})</button>
          </div>
          {activeDetailTab === 'history' && (
            <div className="updates-list updates-history">
              {updates.map(u => <div key={u.id} className="update-item"><div className="update-meta"><span>{formatDate(u.created_at)}</span></div><div>{u.update_text}</div></div>)}
              {updates.length === 0 && <p className="task-desc task-desc-sm">No progress updates.</p>}
            </div>
          )}
          {activeDetailTab === 'activity' && (
            <div className="activity-section">
              {activity.length === 0 && <p className="task-desc task-desc-sm">No activity recorded.</p>}
              {activity.map(a => <div key={a.id} className="activity-item"><span className={`activity-action-tag activity-action-${a.action}`}>{a.action.replace('_', ' ')}</span><span className="activity-description">{a.description}</span><span className="activity-time">{formatDate(a.created_at)}</span></div>)}
            </div>
          )}
          {activeDetailTab === 'deps' && (
            <div className="deps-section">
              <div className="deps-group">
                <p className="deps-group-label">Blocked by</p>
                {deps?.blocked_by.length ? deps.blocked_by.map(d => (
                  <div key={d.dep_id} className="dep-item">
                    <span className={`dep-status dep-status--${d.status}`}>{d.status}</span>
                    <span className="dep-title">{d.title}</span>
                    <button className="dep-remove-btn" title="Remove dependency" onClick={async () => {
                      try {
                        const res = await fetch(`${apiUrl}/dependencies/${d.dep_id}`, { method: 'DELETE' });
                        if (res.ok) setDeps(prev => prev ? { ...prev, blocked_by: prev.blocked_by.filter(x => x.dep_id !== d.dep_id) } : prev);
                      } catch { /* ignore */ }
                    }}>×</button>
                  </div>
                )) : <p className="deps-empty">No blockers.</p>}
                {!addingBlocker ? (
                  <button className="btn-secondary deps-add-btn" onClick={() => setAddingBlocker(true)}>+ Add blocker</button>
                ) : (
                  <div className="deps-add-row">
                    <select className="deps-select" defaultValue="" onChange={async (e) => {
                      const blockerId = e.target.value;
                      if (!blockerId) return;
                      try {
                        const res = await fetch(`${apiUrl}/tasks/${task.id}/dependencies?blocker_task_id=${blockerId}`, { method: 'POST' });
                        if (res.ok) {
                          const created = await res.json();
                          const blocker = tasks?.find(t => t.id === blockerId);
                          if (blocker) setDeps(prev => prev ? { ...prev, blocked_by: [...prev.blocked_by, { dep_id: created.id, task_id: blocker.id, title: blocker.title, status: blocker.status }] } : prev);
                        }
                      } catch { /* ignore */ }
                      setAddingBlocker(false);
                    }}>
                      <option value="">Select a task...</option>
                      {tasks?.filter(t => t.id !== task.id && t.status !== 'done').map(t => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                    <button className="btn-secondary" onClick={() => setAddingBlocker(false)}>Cancel</button>
                  </div>
                )}
              </div>
              {deps?.blocking.length ? (
                <div className="deps-group">
                  <p className="deps-group-label">Blocking</p>
                  {deps.blocking.map(d => (
                    <div key={d.dep_id} className="dep-item">
                      <span className={`dep-status dep-status--${d.status}`}>{d.status}</span>
                      <span className="dep-title">{d.title}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          {activeDetailTab === 'schedule' && (
            <div className="activity-section">
              {slots.filter(s => s.task_id === task.id).length === 0 && <p className="task-desc task-desc-sm">No time slots scheduled.</p>}
              {slots.filter(s => s.task_id === task.id).map(s => (
                <div key={s.id} className="activity-item" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div>
                    <span className="activity-action-tag activity-action-created">Scheduled</span>
                    <span className="activity-description">{new Date((s.start_time.endsWith('Z') || s.start_time.includes('+')) ? s.start_time : s.start_time + 'Z').toLocaleDateString('en-US')}</span>
                    <span className="activity-time">{new Date((s.start_time.endsWith('Z') || s.start_time.includes('+')) ? s.start_time : s.start_time + 'Z').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} {' - '} {new Date((s.end_time.endsWith('Z') || s.end_time.includes('+')) ? s.end_time : s.end_time + 'Z').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <button className="btn-secondary" style={{ padding: '2px 6px', fontSize: '0.7em' }} onClick={async (e) => { e.preventDefault(); try { const res = await fetch(`${apiUrl}/slots/${s.id}`, { method: 'DELETE' }); if (res.ok) fetchSlots(); } catch (err) { console.error("Failed to delete slot:", err); } }}>Delete</button>
                </div>
              ))}
            </div>
          )}
          {activeDetailTab === 'notes' && (
            <div className="task-notes-section">
              {(addingNote || editingNoteId) ? (
                <NoteEditor
                  key={editingNoteId ?? 'new'}
                  title={noteTitle}
                  content={noteContent}
                  onTitleChange={setNoteTitle}
                  onContentChange={setNoteContent}
                  onSave={saveNote}
                  onCancel={() => { setAddingNote(false); setEditingNoteId(null); setNoteTitle(''); setNoteContent(''); }}
                  apiUrl={apiUrl}
                />
              ) : (
                <button className="btn-secondary note-add-btn" onClick={() => setAddingNote(true)}>+ New Note</button>
              )}
              {notes.length === 0 && !addingNote && <p className="task-desc task-desc-sm">No notes yet. Click &quot;+ New Note&quot; to write one.</p>}
              {!addingNote && !editingNoteId && notes.map(n => (
                <div key={n.id} className={`note-item${n.is_published ? ' note-item--published' : ''}`}>
                  <div className="note-item-header" onClick={() => setExpandedNoteId(expandedNoteId === n.id ? null : n.id)}>
                    <span className="note-item-title">{n.title}</span>
                    <div className="note-item-header-right">
                      {n.is_published && <span className="note-published-badge">Published</span>}
                      <span className="note-item-toggle">{expandedNoteId === n.id ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {expandedNoteId === n.id ? (
                    <div className="note-item-body">
                      <BlockViewer content={n.content} apiUrl={apiUrl} />
                    </div>
                  ) : (
                    <div className="note-item-excerpt">{n.content.split('\n').find(l => l.trim() && !l.startsWith('#')) ?? n.content.slice(0, 100)}</div>
                  )}
                  <div className="note-item-actions">
                    <button className="btn-secondary note-action-btn" onClick={() => { setEditingNoteId(n.id); setNoteTitle(n.title); setNoteContent(n.content); setAddingNote(false); setExpandedNoteId(null); }}>Edit</button>
                    <button className="btn-secondary note-action-btn" onClick={() => togglePublish(n)}>{n.is_published ? 'Unpublish' : 'Publish to Catalog'}</button>
                    <button className="btn-secondary note-action-btn note-delete-btn" onClick={() => deleteNote(n.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
