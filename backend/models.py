from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class User(BaseModel):
    id: str
    name: str
    role: Optional[str] = None
    is_active: bool = True
    capacity_hours_per_sprint: int = 60

class Task(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: str
    user_id: Optional[str] = None
    week: Optional[str] = None
    next_update_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    feedback: Optional[str] = None
    time_estimate_mins: Optional[int] = None
    time_spent_mins: int = 0
    sprint: Optional[str] = None
    priority: str = 'p2'
    recurrence_rule: Optional[str] = None

class TaskUpdate(BaseModel):
    id: str
    task_id: str
    update_text: str
    created_at: Optional[datetime] = None

class TaskActivity(BaseModel):
    id: str
    task_id: str
    action: str
    description: str
    created_at: Optional[datetime] = None

class TaskSlot(BaseModel):
    id: str
    task_id: str
    user_id: str
    start_time: datetime
    end_time: datetime
    created_at: Optional[datetime] = None

class TimeSpentUpdate(BaseModel):
    minutes: int

class Retrospective(BaseModel):
    id: str
    sprint_id: str
    went_well: str = ''
    to_improve: str = ''
    action_items: str = ''
    created_at: Optional[datetime] = None

class TaskDependency(BaseModel):
    id: str
    blocker_task_id: str
    blocked_task_id: str
    created_at: Optional[datetime] = None

class TaskNote(BaseModel):
    id: str
    task_id: str
    title: str
    content: str
    is_published: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
