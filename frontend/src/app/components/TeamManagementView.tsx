import React from "react";
import { User } from "../types";
import { generateId } from "../utils";

type Props = {
  usersList: User[];
  setUsersList: React.Dispatch<React.SetStateAction<User[]>>;
  primaryUserId: string;
  apiUrl: string;
};

export const TeamManagementView = ({ usersList, setUsersList, primaryUserId, apiUrl }: Props) => {
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const role = (form.elements.namedItem("role") as HTMLInputElement).value;
    if (!name) return;

    const newUser: User = { id: generateId(), name, role: role || null, is_active: true, capacity_hours_per_sprint: 60 };
    setUsersList([...usersList, newUser]);
    form.reset();

    await fetch(`${apiUrl || 'http://localhost:8000'}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser)
    });
  };

  const toggleUserStatus = async (user: User) => {
    const updatedUser = { ...user, is_active: !user.is_active };
    setUsersList(usersList.map(u => u.id === user.id ? updatedUser : u));

    await fetch(`${apiUrl || 'http://localhost:8000'}/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedUser)
    });
  };

  return (
    <div className="section team-section">
      <h2>👥 Team Lifecycle Management</h2>
      <p className="task-desc team-section-desc">Add new members to the team, or freeze inactive accounts.</p>
      
      <form onSubmit={handleAddUser} className="team-add-form">
        <input name="name" className="input-field" placeholder="Team Member Name" required />
        <input name="role" className="input-field" placeholder="Role (e.g. Engineer)" />
        <button type="submit" className="btn-primary">Add Member</button>
      </form>

      <div className="team-list">
        {usersList.map(u => (
          <div key={u.id} className={`team-member-card ${!u.is_active ? 'inactive' : ''}`}>
            <div>
              <strong>{u.name}</strong> {u.id === primaryUserId && <span className="badge">You</span>}
              <div className="team-member-role">{u.role || 'No role'}</div>
            </div>
            <div>
              {u.id !== primaryUserId && (
                <button 
                  onClick={() => toggleUserStatus(u)} 
                  className={`btn-secondary ${!u.is_active ? 'btn-activate' : ''}`}
                >
                  {u.is_active ? 'Disable Account' : 'Reactivate'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
