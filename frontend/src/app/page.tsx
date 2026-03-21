import React from 'react';
import DashboardClient from './DashboardClient';
import { Task, User } from './types';

// Disable caching for rapid local dev data refresh
export const dynamic = 'force-dynamic';

// SSR fetches run inside the container — use internal Docker network URL when available
const SSR_API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
// Client-side calls come from the browser — always use the public-facing URL
const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Fetchers — all wrapped in try/catch so a backend connection failure
// renders an empty dashboard instead of a hard crash.
async function fetchTasks(status?: string): Promise<Task[]> {
  try {
    const url = status ? `${SSR_API_URL}/tasks?status=${status}` : `${SSR_API_URL}/tasks`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

async function fetchTeamFocus(): Promise<Record<string, Task[]>> {
  try {
    const res = await fetch(`${SSR_API_URL}/team-focus`);
    if (!res.ok) return {};
    return res.json();
  } catch { return {}; }
}

async function fetchWeeklyClosed(): Promise<Record<string, Task[]>> {
  try {
    const res = await fetch(`${SSR_API_URL}/weekly-closed-tasks`);
    if (!res.ok) return {};
    return res.json();
  } catch { return {}; }
}

async function fetchUsers(): Promise<User[]> {
  try {
    const res = await fetch(`${SSR_API_URL}/users`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export default async function Dashboard() {
  const [allTasks, teamFocus, weeklyClosed, users] = await Promise.all([
    fetchTasks(),
    fetchTeamFocus(),
    fetchWeeklyClosed(),
    fetchUsers()
  ]);

  return (
    <div className="dashboard-container">
      <header className="header-flex">
        <h1>Work Orbit</h1>
      </header>
      
      <DashboardClient 
        initialTasks={allTasks}
        initialTeamFocus={teamFocus}
        initialWeekly={weeklyClosed}
        users={users}
        apiUrl={CLIENT_API_URL}
      />
    </div>
  );
}
