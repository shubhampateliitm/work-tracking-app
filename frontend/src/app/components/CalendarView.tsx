import React, { useState } from "react";
import { Task, TaskSlot } from "../types";

type Props = {
  tasks: Task[];
  slots: TaskSlot[];
  fetchSlots: () => void;
  apiUrl: string;
  primaryUserId: string;
};

export const CalendarView = ({ tasks, slots, fetchSlots, apiUrl, primaryUserId }: Props) => {
  const [showQuickSchedule, setShowQuickSchedule] = useState(false);
  const [qsTaskId, setQsTaskId] = useState("");
  const [qsDate, setQsDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [qsTime, setQsTime] = useState("09:00");
  const [qsDuration, setQsDuration] = useState("60");
  const [calWeekOffset, setCalWeekOffset] = useState(0);
  const [calDayOffset, setCalDayOffset] = useState(0);
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  const [calViewMode, setCalViewMode] = useState<'day' | 'week' | 'month' | 'agenda'>('agenda');

  const toDateKey = (timeStr: string) => {
    const d = new Date((timeStr.endsWith('Z') || timeStr.includes('+')) ? timeStr : timeStr + 'Z');
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const nowDateKey = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();

  const formatDayHeader = (key: string): { label: string; isToday: boolean } => {
    const [y, m, day] = key.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    const now = new Date();
    const tomorrowD = new Date(now); tomorrowD.setDate(now.getDate() + 1);
    const tomorrowKey = `${tomorrowD.getFullYear()}-${String(tomorrowD.getMonth() + 1).padStart(2, '0')}-${String(tomorrowD.getDate()).padStart(2, '0')}`;
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (key === nowDateKey) return { label: `Today — ${weekday}, ${date}`, isToday: true };
    if (key === tomorrowKey) return { label: `Tomorrow — ${weekday}, ${date}`, isToday: false };
    return { label: `${weekday}, ${date}`, isToday: false };
  };

  const norm = (t: string) => (t.endsWith('Z') || t.includes('+')) ? t : t + 'Z';

  const deleteSlot = async (slotId: string) => {
    try {
      const res = await fetch(`${apiUrl}/slots/${slotId}`, { method: 'DELETE' });
      if (res.ok) fetchSlots();
    } catch (err) { console.error('Failed to delete slot', err); }
  };

  const handleQuickSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qsTaskId || !qsDate || !qsTime) return;
    const startDateTime = new Date(`${qsDate}T${qsTime}:00`);
    const endDateTime = new Date(startDateTime.getTime() + parseInt(qsDuration) * 60000);
    const task = tasks.find(t => t.id === qsTaskId);
    const slotData = {
      id: crypto.randomUUID(),
      task_id: qsTaskId,
      user_id: task?.user_id || primaryUserId,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
    };
    try {
      const res = await fetch(`${apiUrl}/slots`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slotData),
      });
      if (res.ok) {
        setShowQuickSchedule(false);
        fetchSlots();
      } else if (res.status === 409) {
        const err = await res.json();
        alert(err.detail || 'Time slot overlaps with an existing slot.');
      } else {
        alert('Failed to schedule slot.');
      }
    } catch (err) { console.error('Failed to schedule slot', err); }
  };

  const activeTasks = tasks.filter(t => t.status !== 'done');
  const GRID_START = 7;
  const GRID_END = 22;
  const GRID_HOURS = GRID_END - GRID_START;
  const HOUR_LABELS = Array.from({ length: GRID_HOURS + 1 }, (_, i) => GRID_START + i);

  const slotGridPos = (startStr: string, endStr: string) => {
    const st = new Date(norm(startStr));
    const et = new Date(norm(endStr));
    const startFrac = (st.getHours() + st.getMinutes() / 60 - GRID_START) / GRID_HOURS;
    const durationFrac = (et.getTime() - st.getTime()) / (GRID_HOURS * 3600 * 1000);
    const topPct = Math.max(0, Math.min(100, startFrac * 100));
    const heightPct = Math.max(2, Math.min(100 - topPct, durationFrac * 100));
    return { topPct, heightPct };
  };

  const renderSlotEvent = (s: TaskSlot) => {
    const t = tasks.find(tsk => tsk.id === s.task_id);
    if (!t) return null;
    const stStr = norm(s.start_time);
    const etStr = norm(s.end_time);
    const { topPct, heightPct } = slotGridPos(s.start_time, s.end_time);
    const startT = new Date(stStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const nowMs = Date.now();
    const startMs = new Date(stStr).getTime();
    const endMs = new Date(etStr).getTime();
    const isLive = nowMs >= startMs && nowMs < endMs;
    const isPast = nowMs >= endMs;
    const isSoon = !isLive && !isPast && (startMs - nowMs) <= 30 * 60 * 1000;
    const stateClass = isLive ? 'cal-event--live' : isPast ? 'cal-event--past' : isSoon ? 'cal-event--soon' : '';
    return (
      <div key={s.id}
        className={`cal-time-event ${stateClass}`}
        style={{ '--event-top': `${topPct}%`, '--event-height': `${heightPct}%` } as React.CSSProperties}>
        <div className="cal-event-time">{startT}</div>
        <div className="cal-event-title">{t.title}</div>
        <button className="cal-event-delete" title="Delete" onClick={() => deleteSlot(s.id)}>×</button>
      </div>
    );
  };

  const quickScheduleForm = showQuickSchedule && (
    <form className="calendar-quick-schedule" onSubmit={handleQuickSchedule}>
      <select className="calendar-qs-task-select" value={qsTaskId}
        onChange={e => setQsTaskId(e.target.value)} required>
        <option value="">Pick a task…</option>
        {activeTasks.map(t => (
          <option key={t.id} value={t.id}>{t.title}</option>
        ))}
      </select>
      <input type="date" className="calendar-qs-date" value={qsDate}
        onChange={e => setQsDate(e.target.value)} required />
      <input type="time" className="calendar-qs-time" value={qsTime}
        onChange={e => setQsTime(e.target.value)} required />
      <select className="calendar-qs-duration" value={qsDuration}
        onChange={e => setQsDuration(e.target.value)}>
        {[30,45,60,90,120,150,180,240].map(m => (
          <option key={m} value={m}>{m < 60 ? `${m}m` : `${m/60}h${m%60 ? ` ${m%60}m` : ''}`}</option>
        ))}
      </select>
      <button type="submit" className="btn-primary">Save</button>
    </form>
  );

  const viewToggle = (
    <div className="cal-view-toggle">
      {(['day', 'week', 'month', 'agenda'] as const).map(mode => (
        <button key={mode}
          className={`cal-view-btn${calViewMode === mode ? ' cal-view-btn--active' : ''}`}
          data-mode={mode}
          onClick={() => setCalViewMode(mode)}>
          {mode.charAt(0).toUpperCase() + mode.slice(1)}
        </button>
      ))}
    </div>
  );

  if (calViewMode === 'day') {
    const today = new Date();
    const dayDate = new Date(today);
    dayDate.setDate(today.getDate() + calDayOffset);
    dayDate.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayDate); dayEnd.setDate(dayDate.getDate() + 1);
    const dayKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;
    const { label: dayLabel } = formatDayHeader(dayKey);
    const daySlots = slots.filter(s => {
      const st = new Date(norm(s.start_time));
      return st >= dayDate && st < dayEnd;
    }).sort((a, b) => new Date(norm(a.start_time)).getTime() - new Date(norm(b.start_time)).getTime());

    return (
      <div className="section calendar-section">
        <div className="calendar-section-header">
          <h2>📅 Calendar</h2>
          <button className="btn-primary calendar-add-btn" onClick={() => setShowQuickSchedule(v => !v)}>
            {showQuickSchedule ? 'Cancel' : '+ Schedule Block'}
          </button>
        </div>
        {viewToggle}
        {quickScheduleForm}
        <div className="cal-day-view">
          <div className="cal-day-nav">
            <button className="calendar-week-prev" onClick={() => setCalDayOffset(o => o - 1)}>‹</button>
            <div className="cal-day-header">{dayLabel}</div>
            <button className="calendar-week-next" onClick={() => setCalDayOffset(o => o + 1)}>›</button>
            {calDayOffset !== 0 && (
              <button className="calendar-week-today" onClick={() => setCalDayOffset(0)}>Today</button>
            )}
          </div>
          <div className="cal-time-grid">
            <div className="cal-time-axis">
              {HOUR_LABELS.map(h => (
                <div key={h} className="cal-hour-label">
                  {h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
                </div>
              ))}
            </div>
            <div className="cal-day-column">
              {daySlots.length === 0 && (
                <div className="cal-empty-day">No blocks scheduled. Use &quot;+ Schedule Block&quot; to add one.</div>
              )}
              {daySlots.map(s => renderSlotEvent(s))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (calViewMode === 'week') {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dow + calWeekOffset * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
    const weekLabel = calWeekOffset === 0 ? 'This Week'
      : calWeekOffset === -1 ? 'Last Week'
      : calWeekOffset === 1 ? 'Next Week'
      : `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(weekEnd.getTime() - 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        key,
        isToday: key === nowDateKey,
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        daySlots: slots
          .filter(s => { const st = new Date(norm(s.start_time)); return st >= d && st < new Date(d.getTime() + 86400000); })
          .sort((a, b) => new Date(norm(a.start_time)).getTime() - new Date(norm(b.start_time)).getTime()),
      };
    });

    return (
      <div className="section calendar-section">
        <div className="calendar-section-header">
          <h2>📅 Calendar</h2>
          <button className="btn-primary calendar-add-btn" onClick={() => setShowQuickSchedule(v => !v)}>
            {showQuickSchedule ? 'Cancel' : '+ Schedule Block'}
          </button>
        </div>
        {viewToggle}
        {quickScheduleForm}
        <div className="calendar-week-nav">
          <button className="calendar-week-prev" onClick={() => setCalWeekOffset(o => o - 1)}>‹</button>
          <span className="calendar-week-label">{weekLabel}</span>
          <button className="calendar-week-next" onClick={() => setCalWeekOffset(o => o + 1)}>›</button>
          {calWeekOffset !== 0 && (
            <button className="calendar-week-today" onClick={() => setCalWeekOffset(0)}>Today</button>
          )}
        </div>
        <div className="cal-week-view">
          <div className="cal-week-grid">
            <div className="cal-time-axis-spacer" />
            {weekDays.map(d => (
              <div key={d.key} className={`cal-week-day-label${d.isToday ? ' cal-week-day-label--today' : ''}`}>
                {d.label}
              </div>
            ))}
            <div className="cal-time-axis">
              {HOUR_LABELS.map(h => (
                <div key={h} className="cal-hour-label">
                  {h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
                </div>
              ))}
            </div>
            {weekDays.map(d => (
              <div key={d.key} className={`cal-week-day-col${d.isToday ? ' cal-week-day-col--today' : ''}`}>
                {d.daySlots.map(s => renderSlotEvent(s))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (calViewMode === 'month') {
    const now = new Date();
    const viewYear = now.getFullYear();
    const viewMonth = now.getMonth() + calMonthOffset;
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const lastOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const monthLabel = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const startDow = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(firstOfMonth); gridStart.setDate(1 - startDow);
    const gridDays = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isCurrentMonth = d.getMonth() === firstOfMonth.getMonth() && d.getFullYear() === firstOfMonth.getFullYear();
      if (!isCurrentMonth && i >= 35 && d > lastOfMonth) return null;
      return {
        key,
        dayNum: d.getDate(),
        isToday: key === nowDateKey,
        isCurrentMonth,
        daySlots: slots.filter(s => toDateKey(s.start_time) === key),
      };
    }).filter(Boolean) as { key: string; dayNum: number; isToday: boolean; isCurrentMonth: boolean; daySlots: TaskSlot[] }[];

    return (
      <div className="section calendar-section">
        <div className="calendar-section-header">
          <h2>📅 Calendar</h2>
          <button className="btn-primary calendar-add-btn" onClick={() => setShowQuickSchedule(v => !v)}>
            {showQuickSchedule ? 'Cancel' : '+ Schedule Block'}
          </button>
        </div>
        {viewToggle}
        {quickScheduleForm}
        <div className="cal-month-view">
          <div className="cal-month-nav">
            <button className="calendar-week-prev" onClick={() => setCalMonthOffset(o => o - 1)}>‹</button>
            <span className="cal-month-label">{monthLabel}</span>
            <button className="calendar-week-next" onClick={() => setCalMonthOffset(o => o + 1)}>›</button>
            {calMonthOffset !== 0 && (
              <button className="calendar-week-today" onClick={() => setCalMonthOffset(0)}>Today</button>
            )}
          </div>
          <div className="cal-month-grid">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <div key={d} className="cal-month-weekday">{d}</div>
            ))}
            {gridDays.map(d => (
              <div key={d.key}
                className={`cal-month-day${d.isToday ? ' cal-month-day--today' : ''}${!d.isCurrentMonth ? ' cal-month-day--other' : ''}`}>
                <span className="cal-month-day-num">{d.dayNum}</span>
                {d.daySlots.slice(0, 3).map(s => {
                  const t = tasks.find(tsk => tsk.id === s.task_id);
                  if (!t) return null;
                  return (
                    <div key={s.id} className="cal-month-event" title={t.title}>{t.title}</div>
                  );
                })}
                {d.daySlots.length > 3 && (
                  <div className="cal-month-more">+{d.daySlots.length - 3} more</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Agenda View
  const getWeekBounds = (offset: number) => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dow + offset * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
    return { weekStart, weekEnd };
  };

  const { weekStart, weekEnd } = getWeekBounds(calWeekOffset);
  const weekLabel = calWeekOffset === 0 ? 'This Week'
    : calWeekOffset === -1 ? 'Last Week'
    : calWeekOffset === 1 ? 'Next Week'
    : `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(weekEnd.getTime() - 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const sortedSlots = [...slots]
    .filter(s => {
      const st = new Date(norm(s.start_time));
      return st >= weekStart && st < weekEnd;
    })
    .sort((a, b) => new Date(norm(a.start_time)).getTime() - new Date(norm(b.start_time)).getTime());

  const slotsByDay: Record<string, typeof sortedSlots> = {};
  sortedSlots.forEach(s => {
    const key = toDateKey(s.start_time);
    if (!slotsByDay[key]) slotsByDay[key] = [];
    slotsByDay[key].push(s);
  });

  return (
    <div className="section calendar-section">
      <div className="calendar-section-header">
        <h2>📅 Calendar</h2>
        <button className="btn-primary calendar-add-btn"
          onClick={() => setShowQuickSchedule(v => !v)}>
          {showQuickSchedule ? 'Cancel' : '+ Schedule Block'}
        </button>
      </div>
      {viewToggle}

      <div className="calendar-week-nav">
        <button className="calendar-week-prev" onClick={() => setCalWeekOffset(o => o - 1)}>‹</button>
        <span className="calendar-week-label">{weekLabel}</span>
        <button className="calendar-week-next" onClick={() => setCalWeekOffset(o => o + 1)}>›</button>
        {calWeekOffset !== 0 && (
          <button className="calendar-week-today" onClick={() => setCalWeekOffset(0)}>Today</button>
        )}
      </div>

      {quickScheduleForm}

      {Object.keys(slotsByDay).length === 0 && !showQuickSchedule && (
        <div className="empty-state">No slots for {weekLabel.toLowerCase()}. Use "+ Schedule Block" or the task card.</div>
      )}

      <div className="calendar-agenda-grid">
        {Object.entries(slotsByDay).map(([key, daySlots]) => {
          const { label, isToday } = formatDayHeader(key);
          const dayTotalMins = daySlots.reduce((sum, sl) => {
            const s0 = norm(sl.start_time); const e0 = norm(sl.end_time);
            return sum + Math.round((new Date(e0).getTime() - new Date(s0).getTime()) / 60000);
          }, 0);
          const dayTotalLabel = dayTotalMins >= 60
            ? `${Math.floor(dayTotalMins / 60)}h${dayTotalMins % 60 > 0 ? ` ${dayTotalMins % 60}m` : ''}`
            : `${dayTotalMins}m`;

          return (
            <div key={key} className={`calendar-day-group ${isToday ? 'calendar-day-group--today' : ''}`}>
              <h3 className="calendar-day-header">
                {label}
                {isToday && <span className="calendar-today-badge">Today</span>}
                <span className="calendar-day-summary">{dayTotalLabel} · {daySlots.length} slot{daySlots.length !== 1 ? 's' : ''}</span>
              </h3>
              <div className="calendar-slots-list">
                {daySlots.map(s => {
                  const t = tasks.find(tsk => tsk.id === s.task_id);
                  if (!t) return null;
                  const stStr = norm(s.start_time); const etStr = norm(s.end_time);
                  const startT = new Date(stStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                  const endT = new Date(etStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                  const nowMs = Date.now();
                  const startMs = new Date(stStr).getTime();
                  const endMs = new Date(etStr).getTime();
                  const isLive = nowMs >= startMs && nowMs < endMs;
                  const isPast = nowMs >= endMs;
                  const isSoon = !isLive && !isPast && (startMs - nowMs) <= 30 * 60 * 1000;
                  const stateClass = isLive ? 'calendar-slot-card--live' : isPast ? 'calendar-slot-card--past' : isSoon ? 'calendar-slot-card--soon' : '';
                  const durationMins = Math.round((endMs - startMs) / 60000);
                  const durationLabel = durationMins >= 60
                    ? `${Math.floor(durationMins / 60)}h${durationMins % 60 > 0 ? ` ${durationMins % 60}m` : ''}`
                    : `${durationMins}m`;
                  return (
                    <div key={s.id} className={`calendar-slot-card ${stateClass}`}>
                      <div className="calendar-slot-time">{startT} - {endT}</div>
                      <div className="calendar-slot-task">{t.title}</div>
                      <span className="calendar-slot-duration">{durationLabel}</span>
                      <div className="calendar-slot-status badge">{t.status}</div>
                      <button className="calendar-slot-delete" title="Delete slot"
                        onClick={() => deleteSlot(s.id)}>×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
