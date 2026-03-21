"use client";

import React, { useState, useEffect } from "react";
import { Task, TaskSlot } from "../types";

type BurndownEntry = {
  sprint_id: string;
  task_count: number;
  done_count: number;
  total_estimate_mins: number;
  spent_mins: number;
  remaining_mins: number;
};

type VelocityEntry = {
  sprint_id: string;
  tasks_completed: number;
  hours_logged: number;
};

type AccuracyEntry = {
  user_id: string;
  user_name: string;
  avg_estimate_mins: number;
  avg_actual_mins: number;
  task_count: number;
};

type SprintHealth = {
  sprint_id: string;
  total_tasks: number;
  done_tasks: number;
  total_estimate_mins: number;
  total_spent_mins: number;
  health_pct: number;
};

type DailyDigest = {
  due_soon: Task[];
  today_slots: TaskSlot[];
  sprint_health: SprintHealth[];
};

type BarDef = { key: string; colorClass: string; label: string };

type Props = {
  apiUrl: string;
  tasks: Task[];
};

function sprintLabel(sprint_id: string): string {
  const parts = sprint_id.split("-");
  if (parts.length >= 3) return `${parts[1]} ${parts[2]}`;
  return sprint_id;
}

function minsToHours(mins: number): string {
  return `${(mins / 60).toFixed(1)}h`;
}

function BarChart({ data, maxVal, labelKey, bars }: {
  data: Record<string, unknown>[];
  maxVal: number;
  labelKey: string;
  bars: BarDef[];
}) {
  if (data.length === 0) {
    return <div className="insights-empty">No data yet — assign tasks to sprints to see this chart.</div>;
  }

  const BAR_W = 24;
  const GAP = 8;
  const GROUP_GAP = 24;
  const H = 120;
  const LABEL_H = 28;
  const PADDING_X = 8;
  const groupW = bars.length * BAR_W + (bars.length - 1) * GAP;
  const totalW = data.length * groupW + (data.length - 1) * GROUP_GAP + PADDING_X * 2;
  const svgH = H + LABEL_H;

  return (
    <svg viewBox={`0 0 ${totalW} ${svgH}`} className="insights-svg" preserveAspectRatio="xMidYMid meet">
      {data.map((entry, gi) => {
        const groupX = PADDING_X + gi * (groupW + GROUP_GAP);
        const label = entry[labelKey] as string;
        return (
          <g key={label}>
            {bars.map((bar, bi) => {
              const val = (entry[bar.key] as number) || 0;
              const barH = maxVal > 0 ? Math.max(3, (val / maxVal) * H) : 3;
              const x = groupX + bi * (BAR_W + GAP);
              const y = H - barH;
              return (
                <rect
                  key={bar.key}
                  x={x} y={y}
                  width={BAR_W} height={barH}
                  rx="3"
                  className={`chart-bar chart-bar--${bar.colorClass}`}
                >
                  <title>{bar.label}: {val}</title>
                </rect>
              );
            })}
            <text
              x={groupX + groupW / 2}
              y={H + 18}
              textAnchor="middle"
              className="chart-axis-label"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export const InsightsView = ({ apiUrl, tasks }: Props) => {
  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [burndown, setBurndown] = useState<BurndownEntry[]>([]);
  const [velocity, setVelocity] = useState<VelocityEntry[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [digestRes, burndownRes, velocityRes, accuracyRes] = await Promise.all([
          fetch(`${apiUrl}/daily-digest`),
          fetch(`${apiUrl}/insights/burndown`),
          fetch(`${apiUrl}/insights/velocity`),
          fetch(`${apiUrl}/insights/accuracy`),
        ]);
        if (digestRes.ok) setDigest(await digestRes.json());
        if (burndownRes.ok) setBurndown(await burndownRes.json());
        if (velocityRes.ok) setVelocity(await velocityRes.json());
        if (accuracyRes.ok) setAccuracy(await accuracyRes.json());
      } catch (err) {
        console.error("Failed to load insights:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [apiUrl]);

  const maxBurndownMins = Math.max(...burndown.map(b => b.total_estimate_mins), 1);
  const maxVelocity = Math.max(...velocity.map(v => v.tasks_completed), 1);
  const maxAccuracyMins = Math.max(...accuracy.flatMap(a => [a.avg_estimate_mins, a.avg_actual_mins]), 1);

  const burndownChartData = burndown.map(b => ({ ...b, _label: sprintLabel(b.sprint_id) }));
  const velocityChartData = velocity.slice(-8).map(v => ({ ...v, _label: sprintLabel(v.sprint_id) }));
  const accuracyChartData = accuracy.map(a => ({ ...a, _label: a.user_name.split(" ")[0] }));

  if (loading) return <div className="insights-loading">Loading sprint intelligence…</div>;

  return (
    <div className="insights-view">
      <div className="insights-header">
        <h1 className="insights-title">Sprint Intelligence</h1>
        <p className="insights-subtitle">Velocity, burndown, and estimate accuracy across all sprints</p>
      </div>

      <div className="insights-brief-grid">
        {/* Morning Brief */}
        <section className="insights-card insights-brief">
          <h2 className="insights-card-title">Morning Brief</h2>
          <div className="brief-stats">
            <div className="brief-stat">
              <span className="brief-stat-value">{digest?.due_soon.length ?? 0}</span>
              <span className="brief-stat-label">Due within 3 days</span>
            </div>
            <div className="brief-stat">
              <span className="brief-stat-value">{digest?.today_slots.length ?? 0}</span>
              <span className="brief-stat-label">Slots today</span>
            </div>
            <div className="brief-stat">
              <span className="brief-stat-value">{tasks.filter(t => t.status === "current").length}</span>
              <span className="brief-stat-label">In current focus</span>
            </div>
          </div>
          {digest?.due_soon.length ? (
            <div className="brief-due-list">
              <p className="brief-section-label">Upcoming deadlines</p>
              {digest.due_soon.slice(0, 5).map(t => (
                <div key={t.id} className="brief-due-item">
                  <span className="brief-due-title">{t.title}</span>
                  {t.due_date && (
                    <span className="brief-due-date">
                      {new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="brief-no-deadlines">No tasks due in the next 3 days.</p>
          )}
        </section>

        {/* Sprint Health */}
        <section className="insights-card">
          <h2 className="insights-card-title">
            Sprint Health <span className="section-count">{digest?.sprint_health.length ?? 0}</span>
          </h2>
          {digest?.sprint_health.length ? (
            <div className="sprint-health-list">
              {digest.sprint_health.map(s => {
                const healthLevel = s.health_pct >= 75 ? "good" : s.health_pct >= 40 ? "mid" : "low";
                return (
                  <div key={s.sprint_id} className="sprint-health-item">
                    <div className="sprint-health-meta">
                      <span className="sprint-health-id">{sprintLabel(s.sprint_id)}</span>
                      <span className="sprint-health-pct" data-health={healthLevel}>{s.health_pct}%</span>
                    </div>
                    <div className="sprint-health-bar-track">
                      <div
                        className="sprint-health-bar-fill"
                        data-health={healthLevel}
                        style={{ "--health-pct": `${s.health_pct}%` } as React.CSSProperties}
                      />
                    </div>
                    <div className="sprint-health-counts">
                      <span>{s.done_tasks}/{s.total_tasks} tasks done</span>
                      <span>{minsToHours(s.total_spent_mins)} / {minsToHours(s.total_estimate_mins)} est</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="insights-empty">No sprint data. Assign tasks to sprints in the Capacity tab.</div>
          )}
        </section>
      </div>

      <div className="insights-charts-grid">
        {/* Velocity */}
        <section className="insights-card">
          <h2 className="insights-card-title">
            Velocity <span className="insights-card-sub">tasks completed per sprint</span>
          </h2>
          <div className="chart-legend">
            <span className="legend-dot legend-dot--green" />
            <span>Tasks completed</span>
          </div>
          <BarChart
            data={velocityChartData}
            maxVal={maxVelocity}
            labelKey="_label"
            bars={[{ key: "tasks_completed", colorClass: "green", label: "Completed" }]}
          />
        </section>

        {/* Burndown */}
        <section className="insights-card">
          <h2 className="insights-card-title">
            Burndown <span className="insights-card-sub">hours estimated vs spent</span>
          </h2>
          <div className="chart-legend">
            <span className="legend-dot legend-dot--blue" />
            <span>Estimated</span>
            <span className="legend-dot legend-dot--amber" />
            <span>Spent</span>
          </div>
          <BarChart
            data={burndownChartData}
            maxVal={maxBurndownMins}
            labelKey="_label"
            bars={[
              { key: "total_estimate_mins", colorClass: "blue", label: "Estimated (mins)" },
              { key: "spent_mins", colorClass: "amber", label: "Spent (mins)" },
            ]}
          />
        </section>

        {/* Accuracy */}
        <section className="insights-card insights-accuracy">
          <h2 className="insights-card-title">
            Estimate Accuracy <span className="insights-card-sub">avg estimate vs actual per person</span>
          </h2>
          <div className="chart-legend">
            <span className="legend-dot legend-dot--purple" />
            <span>Estimated</span>
            <span className="legend-dot legend-dot--red" />
            <span>Actual</span>
          </div>
          <BarChart
            data={accuracyChartData}
            maxVal={maxAccuracyMins}
            labelKey="_label"
            bars={[
              { key: "avg_estimate_mins", colorClass: "purple", label: "Avg Estimate (mins)" },
              { key: "avg_actual_mins", colorClass: "red", label: "Avg Actual (mins)" },
            ]}
          />
          {accuracy.length > 0 && (
            <table className="insights-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Avg Est</th>
                  <th>Avg Actual</th>
                  <th>Ratio</th>
                  <th>Tasks</th>
                </tr>
              </thead>
              <tbody>
                {accuracy.map(a => {
                  const ratio = a.avg_estimate_mins > 0 ? a.avg_actual_mins / a.avg_estimate_mins : 1;
                  const ratioClass = ratio > 1.1 ? "ratio-over" : ratio < 0.9 ? "ratio-under" : "ratio-on";
                  return (
                    <tr key={a.user_id}>
                      <td>{a.user_name}</td>
                      <td>{minsToHours(a.avg_estimate_mins)}</td>
                      <td>{minsToHours(a.avg_actual_mins)}</td>
                      <td className={ratioClass}>{ratio.toFixed(2)}x</td>
                      <td>{a.task_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
};
