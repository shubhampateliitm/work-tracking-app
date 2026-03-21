import React, { useState } from "react";
import { Task, User, TaskSlot } from "../types";

type SprintInfo = { id: string; label: string; startDate: Date };

const computeSprintsForQuarter = (year: number, quarter: number): SprintInfo[] => {
  const qStartMonth = (quarter - 1) * 3;
  const qStart = new Date(year, qStartMonth, 1);
  const qEnd = new Date(year, qStartMonth + 3, 0);

  const firstWed = new Date(qStart);
  while (firstWed.getDay() !== 3) firstWed.setDate(firstWed.getDate() + 1);

  const sprints: SprintInfo[] = [];
  let sprintStart = new Date(firstWed);
  let sprintNum = 1;
  while (sprintStart <= qEnd) {
    const startStr = `${sprintStart.getFullYear()}${String(sprintStart.getMonth() + 1).padStart(2, '0')}${String(sprintStart.getDate()).padStart(2, '0')}`;
    sprints.push({
      id: `${year}-Q${quarter}-S${sprintNum}-${startStr}`,
      label: `Sprint ${sprintNum}`,
      startDate: new Date(sprintStart)
    });
    sprintStart.setDate(sprintStart.getDate() + 14);
    sprintNum++;
  }
  return sprints;
};

type Props = {
  tasks: Task[];
  users: User[];
  apiUrl: string;
  slots: TaskSlot[];
  onTaskUpdate: (taskId: string, userId: string, sprint: string | null, estimateHours: number | null) => void;
  onTaskSplit: (taskId: string, userId: string, currentSprintId: string, keptHours: number, overflowHours: number, overflowSprintId: string) => void;
};

type RetroData = {
  id: string | null;
  sprint_id: string;
  went_well: string;
  to_improve: string;
  action_items: string;
  stats?: { total_tasks: number; done_tasks: number; estimated_mins: number; spent_mins: number };
};

export const CapacityPlanningView = ({ tasks, users, apiUrl, onTaskUpdate, onTaskSplit, slots }: Props) => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [assigningCell, setAssigningCell] = useState<string | null>(null); // "userId:sprintId"
  const [pendingAssign, setPendingAssign] = useState<{
    taskId: string; userId: string; sprintId: string; currentEstimate: number | null;
  } | null>(null);
  const [pendingEstimate, setPendingEstimate] = useState('');
  const [splittingTask, setSplittingTask] = useState<{
    taskId: string; userId: string; sprintId: string; overflowHours: number; keptHours: number;
  } | null>(null);
  const [retroSprintId, setRetroSprintId] = useState<string | null>(null);
  const [retroData, setRetroData] = useState<RetroData | null>(null);
  const [retroSaving, setRetroSaving] = useState(false);

  const openRetro = async (sprintId: string) => {
    setRetroSprintId(sprintId);
    setRetroData(null);
    try {
      const res = await fetch(`${apiUrl}/retros/${encodeURIComponent(sprintId)}`);
      if (res.ok) setRetroData(await res.json());
    } catch { /* ignore */ }
  };

  const saveRetro = async () => {
    if (!retroData || !retroSprintId) return;
    setRetroSaving(true);
    const payload = { id: retroData.id ?? ('r_' + Date.now()), sprint_id: retroSprintId, went_well: retroData.went_well, to_improve: retroData.to_improve, action_items: retroData.action_items };
    try {
      await fetch(`${apiUrl}/retros`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setRetroSprintId(null);
    } catch { /* ignore */ }
    setRetroSaving(false);
  };

  const sprints = computeSprintsForQuarter(selectedYear, selectedQuarter);
  const activeUsers = users.filter(u => u.is_active);
  const years = [selectedYear - 1, selectedYear, selectedYear + 1];

  const getTasksForCell = (userId: string, sprintId: string): Task[] =>
    tasks.filter(t => t.sprint === sprintId && (t.user_id === userId || (userId === 'me' && !t.user_id)));

  const getUsedHours = (userId: string, sprintId: string): number => {
    const cellTasks = getTasksForCell(userId, sprintId);
    return cellTasks.reduce((sum, t) => sum + (t.time_estimate_mins || 0) / 60, 0);
  };

  const getSlottedDataForCell = (userId: string, sprintStart: Date) => {
    const sprintEnd = new Date(sprintStart);
    sprintEnd.setDate(sprintEnd.getDate() + 14);

    const cellSlots = slots.filter(s => {
      if (s.user_id !== userId) return false;
      const start = new Date(s.start_time);
      return start >= sprintStart && start < sprintEnd;
    });

    const taskSlotHoursMap: Record<string, number> = {};
    for (const s of cellSlots) {
      const dur = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / (1000 * 60 * 60);
      taskSlotHoursMap[s.task_id] = (taskSlotHoursMap[s.task_id] || 0) + dur;
    }

    const totalHours = Object.values(taskSlotHoursMap).reduce((a, b) => a + b, 0);
    const slottedTasks: Task[] = Object.keys(taskSlotHoursMap)
      .map(id => tasks.find(t => t.id === id))
      .filter((t): t is Task => !!t && !t.sprint);

    return { totalHours, slottedTasks, taskSlotHoursMap };
  };

  const unassignedTasks = tasks.filter(t => (!t.sprint || t.sprint === '') && t.status !== 'done');

  const handleStartAssign = (taskId: string, userId: string, sprintId: string) => {
    const task = tasks.find(t => t.id === taskId);
    const currentEstimateHours = task?.time_estimate_mins ? task.time_estimate_mins / 60 : null;
    setPendingAssign({ taskId, userId, sprintId, currentEstimate: currentEstimateHours });
    setPendingEstimate(currentEstimateHours != null ? String(currentEstimateHours) : '');
  };

  const handleConfirmAssign = () => {
    if (!pendingAssign) return;
    const hours = parseFloat(pendingEstimate);
    if (isNaN(hours) || hours <= 0) return;
    onTaskUpdate(pendingAssign.taskId, pendingAssign.userId, pendingAssign.sprintId, hours);
    setPendingAssign(null);
    setPendingEstimate('');
    setAssigningCell(null);
  };

  const handleCancelAssign = () => {
    setPendingAssign(null);
    setPendingEstimate('');
  };

  const handleEditEstimate = (taskId: string, currentMins: number | null, taskUserId: string) => {
    const currentHours = currentMins ? currentMins / 60 : 0;
    const input = prompt('Update estimated effort (hours):', String(currentHours));
    if (input === null) return;
    const hours = parseFloat(input);
    if (isNaN(hours) || hours <= 0) {
      alert('Please enter a valid number of hours.');
      return;
    }
    const task = tasks.find(t => t.id === taskId);
    if (task) onTaskUpdate(taskId, taskUserId, task.sprint, hours);
  };

  const handleUnassign = (taskId: string, taskUserId: string) => {
    onTaskUpdate(taskId, taskUserId, null, null);
  };

  const handleSplit = (overflowSprintId: string) => {
    if (!splittingTask) return;
    onTaskSplit(splittingTask.taskId, splittingTask.userId, splittingTask.sprintId, splittingTask.keptHours, splittingTask.overflowHours, overflowSprintId);
    setSplittingTask(null);
  };

  return (
    <div className="capacity-view">
      <div className="capacity-header">
        <div className="capacity-year-selector">
          {years.map(y => (
            <button key={y} className={`capacity-year-btn ${y === selectedYear ? 'active' : ''}`}
              onClick={() => setSelectedYear(y)}>{y}</button>
          ))}
        </div>
        <div className="capacity-quarter-tabs">
          {[1,2,3,4].map(q => (
            <button key={q} className={`capacity-quarter-btn ${q === selectedQuarter ? 'active' : ''}`}
              onClick={() => setSelectedQuarter(q)}>Q{q}</button>
          ))}
        </div>
      </div>

      <div className="capacity-grid" style={{ gridTemplateColumns: `180px repeat(${sprints.length}, 1fr)` }}>
        <div className="capacity-grid-header capacity-person-header">Person</div>
        {sprints.map(s => (
          <div key={s.id} className="capacity-grid-header capacity-sprint-header">
            <div className="capacity-sprint-label">{s.label}</div>
            <div className="capacity-sprint-date">
              {s.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <button className="capacity-retro-btn" onClick={() => openRetro(s.id)} title="Open sprint retrospective">Retro</button>
          </div>
        ))}

        {activeUsers.map(user => (
          <React.Fragment key={user.id}>
            <div className="capacity-person-cell">
              <div className="capacity-person-name">{user.name}</div>
              <div className="capacity-person-cap">{user.capacity_hours_per_sprint}h / sprint</div>
            </div>
            {sprints.map(sprint => {
              const cellKey = `${user.id}:${sprint.id}`;
              const cellTasks = getTasksForCell(user.id, sprint.id);
              const usedHours = getUsedHours(user.id, sprint.id);
              const { totalHours: slottedHours, slottedTasks, taskSlotHoursMap } = getSlottedDataForCell(user.id, sprint.startDate);
              const capHours = user.capacity_hours_per_sprint;
              const totalUsedHours = usedHours + slottedHours;
              const remainingHours = capHours - totalUsedHours;
              const plannedFillPct = Math.min(100, (usedHours / capHours) * 100);
              const slottedFillPct = Math.min(100 - plannedFillPct, (slottedHours / capHours) * 100);
              const isOver = totalUsedHours > capHours;
              const userUnassigned = unassignedTasks.filter(t =>
                t.user_id === user.id || (user.id === 'me' && !t.user_id)
              );

              return (
                <div key={cellKey} className={`capacity-cell ${isOver ? 'over-capacity' : ''}`}
                  onClick={() => { setSplittingTask(null); setAssigningCell(assigningCell === cellKey ? null : cellKey); }}>
                  <div className="capacity-tasks">
                    {cellTasks.map(t => {
                      const taskHours = (t.time_estimate_mins || 0) / 60;
                      const taskOverflow = taskHours > capHours ? parseFloat((taskHours - capHours).toFixed(1)) : 0;
                      return (
                        <div key={t.id} className="capacity-task-pill" title={`${t.title} — ${taskHours.toFixed(1)}h`}>
                          <span className="capacity-pill-title">{t.title}</span>
                          <span className="capacity-pill-hours"
                            onClick={(e) => { e.stopPropagation(); handleEditEstimate(t.id, t.time_estimate_mins, user.id); }}
                            title="Click to edit estimate">
                            {taskHours.toFixed(1)}h
                          </span>
                          {taskOverflow > 0 && (
                            <span className="capacity-pill-overflow">{taskOverflow.toFixed(1)}h overflow</span>
                          )}
                          {taskOverflow > 0 && (
                            <button className="capacity-pill-split"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAssigningCell(null);
                                setSplittingTask(splittingTask?.taskId === t.id ? null : {
                                  taskId: t.id, userId: user.id, sprintId: sprint.id,
                                  overflowHours: taskOverflow, keptHours: capHours
                                });
                              }}
                              title="Split overflow to another sprint">↗</button>
                          )}
                          <button className="capacity-pill-remove" onClick={(e) => { e.stopPropagation(); handleUnassign(t.id, user.id); }}
                            title="Remove from sprint">×</button>
                        </div>
                      );
                    })}
                    {slottedTasks.length > 0 && (
                      <div className="capacity-slotted-section">
                        <div className="capacity-slotted-label">Slotted</div>
                        {slottedTasks.map(t => {
                          const slotHrs = taskSlotHoursMap[t.id] || 0;
                          return (
                            <div key={t.id} className="capacity-task-pill capacity-task-pill--slotted"
                              title={`${t.title} — ${slotHrs.toFixed(1)}h scheduled in calendar`}>
                              <span className="capacity-pill-title">{t.title}</span>
                              <span className="capacity-pill-hours">📅 {slotHrs.toFixed(1)}h</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="capacity-bar-wrapper">
                    <div className={`capacity-bar-fill ${isOver ? 'over' : ''}`} style={{ width: `${plannedFillPct}%` }} />
                    {slottedHours > 0 && (
                      <div className="capacity-bar-fill capacity-bar-fill--slotted"
                        style={{ '--slot-left': `${plannedFillPct}%`, '--slot-width': `${slottedFillPct}%` } as React.CSSProperties} />
                    )}
                  </div>
                  <div className={`capacity-remaining ${isOver ? 'over' : ''}`}>
                    {isOver ? `${Math.abs(remainingHours).toFixed(1)}h over` : `${remainingHours.toFixed(1)}h left`}
                  </div>

                  {assigningCell === cellKey && (
                    <div className="capacity-assign-dropdown" onClick={(e) => e.stopPropagation()}>
                      {pendingAssign && pendingAssign.sprintId === sprint.id && pendingAssign.userId === user.id ? (
                        <div className="capacity-estimate-inline">
                          <div className="capacity-assign-title">
                            Estimate for "{tasks.find(t => t.id === pendingAssign.taskId)?.title}"
                          </div>
                          <div className="capacity-estimate-row">
                            <input
                              type="number"
                              className="capacity-estimate-input"
                              placeholder="Hours"
                              value={pendingEstimate}
                              onChange={(e) => setPendingEstimate(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmAssign(); if (e.key === 'Escape') handleCancelAssign(); }}
                              autoFocus
                              min="0.5"
                              step="0.5"
                            />
                            <span className="capacity-estimate-unit">hours</span>
                            <button className="capacity-estimate-confirm" onClick={handleConfirmAssign}>✓</button>
                            <button className="capacity-estimate-cancel" onClick={handleCancelAssign}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="capacity-assign-title">Assign task to {sprint.label}</div>
                          {userUnassigned.length > 0 ? userUnassigned.map(t => (
                            <div key={t.id} className="capacity-assign-option"
                              onClick={(e) => { e.stopPropagation(); handleStartAssign(t.id, user.id, sprint.id); }}>
                              <span className="capacity-assign-task-title">{t.title}</span>
                              <span className="capacity-assign-task-est">
                                {t.time_estimate_mins ? `${(t.time_estimate_mins / 60).toFixed(1)}h` : 'no estimate'}
                              </span>
                            </div>
                          )) : (
                            <div className="capacity-assign-empty">No unassigned tasks for {user.name}</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {splittingTask?.sprintId === sprint.id && splittingTask?.userId === user.id && (
                    <div className="capacity-split-panel" onClick={(e) => e.stopPropagation()}>
                      <div className="capacity-split-title">
                        Move {splittingTask.overflowHours.toFixed(1)}h overflow to:
                      </div>
                      {sprints.filter(s => s.id !== sprint.id).map(s => (
                        <div key={s.id} className="capacity-assign-option"
                          onClick={(e) => { e.stopPropagation(); handleSplit(s.id); }}>
                          <span className="capacity-assign-task-title">{s.label}</span>
                          <span className="capacity-assign-task-est">
                            {s.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      ))}
                      <button className="capacity-split-cancel"
                        onClick={(e) => { e.stopPropagation(); setSplittingTask(null); }}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {retroSprintId && (
        <div className="retro-modal-overlay" onClick={() => setRetroSprintId(null)}>
          <div className="retro-modal" onClick={(e) => e.stopPropagation()}>
            <div className="retro-modal-header">
              <h2 className="retro-modal-title">Sprint Retrospective</h2>
              <span className="retro-sprint-id">{retroSprintId.split('-').slice(1, 3).join(' ')}</span>
              <button className="retro-close-btn" onClick={() => setRetroSprintId(null)}>×</button>
            </div>
            {retroData?.stats && (
              <div className="retro-stats">
                <span>{retroData.stats.done_tasks}/{retroData.stats.total_tasks} tasks done</span>
                <span>{((retroData.stats.spent_mins || 0) / 60).toFixed(1)}h / {((retroData.stats.estimated_mins || 0) / 60).toFixed(1)}h estimated</span>
              </div>
            )}
            {retroData ? (
              <>
                <div className="retro-field">
                  <label className="retro-label">What went well</label>
                  <textarea className="input-field retro-textarea" value={retroData.went_well} onChange={(e) => setRetroData({ ...retroData, went_well: e.target.value })} placeholder="Wins and highlights..." rows={3} />
                </div>
                <div className="retro-field">
                  <label className="retro-label">What to improve</label>
                  <textarea className="input-field retro-textarea" value={retroData.to_improve} onChange={(e) => setRetroData({ ...retroData, to_improve: e.target.value })} placeholder="Pain points and blockers..." rows={3} />
                </div>
                <div className="retro-field">
                  <label className="retro-label">Action items</label>
                  <textarea className="input-field retro-textarea" value={retroData.action_items} onChange={(e) => setRetroData({ ...retroData, action_items: e.target.value })} placeholder="Concrete next steps..." rows={3} />
                </div>
                <div className="retro-actions">
                  <button className="btn-primary" onClick={saveRetro} disabled={retroSaving}>{retroSaving ? 'Saving…' : 'Save Retrospective'}</button>
                  <button className="btn-secondary" onClick={() => setRetroSprintId(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <p className="retro-loading">Loading…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
