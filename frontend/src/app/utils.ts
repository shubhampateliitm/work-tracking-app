import { Task } from "./types";

export const PRIORITY_ORDER: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

export const sortTasks = (tasksList: Task[]) => {
  return [...tasksList].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? 'p2'] ?? 1;
    const pb = PRIORITY_ORDER[b.priority ?? 'p2'] ?? 1;
    if (pa !== pb) return pa - pb;
    if (!a.next_update_date && !!b.next_update_date) return -1;
    if (!!a.next_update_date && !b.next_update_date) return 1;
    if (!!a.next_update_date && !!b.next_update_date) {
      return new Date(a.next_update_date!).getTime() - new Date(b.next_update_date!).getTime();
    }
    return 0;
  });
};

export const getWednesdayStart = (d: Date): Date => {
  const result = new Date(d);
  result.setHours(0,0,0,0);
  const day = result.getDay(); // 0=Sun, 3=Wed
  const diff = (day >= 3) ? day - 3 : day + 4; 
  result.setDate(result.getDate() - diff);
  return result;
};

export const getQuarterStart = (d: Date): Date => {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
};

export const currentWeekString = () => {
  const wed = getWednesdayStart(new Date());
  const yyyy = wed.getFullYear();
  const mm = String(wed.getMonth() + 1).padStart(2, '0');
  const dd = String(wed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const generateId = () => "t_" + Math.random().toString(36).substr(2, 9);
