import React, { useState, useEffect } from "react";

export const PomodoroFloatingBar = ({ taskTitle, onStop }: { taskTitle: string, onStop: () => void }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="global-pomodoro-bar">
      <div className="pomodoro-pulse"></div>
      <div className="pomodoro-info">
        <span className="pomodoro-label">Tracking:</span>
        <span className="pomodoro-task-title">{taskTitle}</span>
      </div>
      <div className="pomodoro-time">
        {Math.floor(elapsed / 60).toString().padStart(2, '0')}:
        {(elapsed % 60).toString().padStart(2, '0')}
      </div>
      <button className="pomodoro-stop-btn" onClick={onStop}>
        Stop & Save
      </button>
    </div>
  );
};

export const LiveTimerBadge = () => {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    setSecs(0);
    const id = setInterval(() => setSecs(prev => prev + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="live-seconds"> +{Math.floor(secs / 60)}m (live)</span>;
};
