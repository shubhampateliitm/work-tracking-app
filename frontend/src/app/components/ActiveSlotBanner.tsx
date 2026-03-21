import React, { useState, useEffect } from "react";
import { Task, TaskSlot } from "../types";

type Props = {
  slots: TaskSlot[];
  tasks: Task[];
  refreshData: () => void;
  apiUrl: string;
  onSlotStart?: (slotTaskId: string) => void;
};

export const ActiveSlotBanner = ({ slots, tasks, refreshData, apiUrl, onSlotStart }: Props) => {
  const [activeSlot, setActiveSlot] = useState<TaskSlot | null>(null);
  const [activeSlotTimeRemaining, setActiveSlotTimeRemaining] = useState<string>("");
  const [isEnding, setIsEnding] = useState(false);
  const [notifiedStartIds, setNotifiedStartIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const trackActiveSlot = () => {
      const now = Date.now();
      const current = slots.find(s => {
        const out = s.start_time.endsWith('Z') || s.start_time.includes('+') ? s.start_time : s.start_time + 'Z';
        const startT = new Date(out).getTime();
        const endOut = s.end_time.endsWith('Z') || s.end_time.includes('+') ? s.end_time : s.end_time + 'Z';
        const endT = new Date(endOut).getTime();
        return now >= startT && now < endT;
      });

      setActiveSlot(current || null);
      if (current) {
        if (!notifiedStartIds.has(current.id)) {
          setNotifiedStartIds(prev => new Set(prev).add(current.id));
          const t = tasks.find(tsk => tsk.id === current.task_id);
          if (onSlotStart) onSlotStart(current.task_id);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('⏰ Scheduled Slot Started', { body: `"${t?.title || 'Task'}" has started. Pomodoro timer was auto-stopped.`, icon: '⏰' });
          } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
            Notification.requestPermission().then(perm => {
              if (perm === 'granted') {
                new Notification('⏰ Scheduled Slot Started', { body: `"${t?.title || 'Task'}" has started. Pomodoro timer was auto-stopped.`, icon: '⏰' });
              }
            });
          }
        }

        const endOut = current.end_time.endsWith('Z') || current.end_time.includes('+') ? current.end_time : current.end_time + 'Z';
        const endT = new Date(endOut).getTime();
        const diff = endT - now;
        if (diff > 0) {
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          
          let timeRemaining = "";
          if (h > 0) timeRemaining += `${h}h `;
          if (m > 0 || h > 0) timeRemaining += `${m}m `;
          timeRemaining += `${s}s`;
          
          setActiveSlotTimeRemaining(timeRemaining.trim());
        } else {
          setActiveSlotTimeRemaining("");
          if (activeSlot && activeSlot.id === current.id && !isEnding) {
            setIsEnding(true);
            fetch(`${apiUrl}/slots/${current.id}/complete`, { method: 'POST' })
              .then(res => {
                if (res.ok) refreshData();
              })
              .catch(err => console.error("Failed to auto-complete slot:", err))
              .finally(() => setIsEnding(false));
          }
        }
      }
    };
    
    trackActiveSlot();
    const intervalId = setInterval(trackActiveSlot, 1000);
    return () => clearInterval(intervalId);
  }, [slots, activeSlot, isEnding, refreshData, apiUrl, tasks, notifiedStartIds, onSlotStart]);

  if (!activeSlot) return null;
  const t = tasks.find(tsk => tsk.id === activeSlot.task_id);
  if (!t) return null;
  
  const stStr = (activeSlot.start_time.endsWith('Z') || activeSlot.start_time.includes('+')) ? activeSlot.start_time : activeSlot.start_time + 'Z';
  const etStr = (activeSlot.end_time.endsWith('Z') || activeSlot.end_time.includes('+')) ? activeSlot.end_time : activeSlot.end_time + 'Z';
  const startT = new Date(stStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const endT = new Date(etStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const handleEndSlot = async () => {
    if (!activeSlot) return;
    setIsEnding(true);
    try {
      const res = await fetch(`${apiUrl}/slots/${activeSlot.id}/complete`, { method: 'POST' });
      if (res.ok) {
        refreshData();
      } else {
        alert("Failed to end slot.");
      }
    } catch (err) {
      console.error("Failed to complete slot:", err);
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <div className="active-slot-banner">
      <div className="active-slot-banner-left">
         <span className="live-dot" />
         <span className="active-slot-banner-label">Currently Slotted:</span>
         <span className="active-slot-banner-task">{t.title}</span>
      </div>
      <div className="active-slot-banner-right">
        <span className="active-slot-banner-time">({startT} - {endT})</span>
        <span className="active-slot-banner-countdown">⏳ {activeSlotTimeRemaining}</span>
        <button 
          className="btn-end-slot" 
          onClick={handleEndSlot}
          disabled={isEnding}
        >
          {isEnding ? "..." : "End Early"}
        </button>
      </div>
    </div>
  );
};
