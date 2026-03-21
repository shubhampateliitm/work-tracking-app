export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  user_id: string;
  week: string | null;
  next_update_date: string | null;
  due_date: string | null;
  feedback: string | null;
  time_estimate_mins: number | null;
  time_spent_mins: number;
  sprint: string | null;
  priority?: string;
  recurrence_rule?: string | null;
};

export type TaskUpdate = {
  id: string;
  task_id: string;
  update_text: string;
  created_at: string;
};

export type TaskActivity = {
  id: string;
  task_id: string;
  action: string;
  description: string;
  created_at: string;
};

export type TaskSlot = {
  id: string;
  task_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  created_at?: string;
};

export type User = {
  id: string;
  name: string;
  role: string | null;
  is_active: boolean;
  capacity_hours_per_sprint: number;
};

export type TaskDependencyEntry = {
  dep_id: string;
  task_id: string;
  title: string;
  status: string;
};

export type TaskNote = {
  id: string;
  task_id: string;
  title: string;
  content: string;
  is_published: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  task_title?: string;
};

export type WorkNotification = {
  type: 'overdue' | 'due_soon' | 'stale' | 'slot_reminder';
  task_id?: string;
  slot_id?: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
};
