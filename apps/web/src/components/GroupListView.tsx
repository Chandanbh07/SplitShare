import { useState } from "react";
import type { FormEvent } from "react";
import { createGroup, listGroups, ApiError } from "../lib/api";
import type { GroupSummary } from "../lib/api";

interface Props {
  accessToken: string;
  groups: GroupSummary[];
  onGroupsChange: (groups: GroupSummary[]) => void;
  onOpenGroup: (groupId: string) => void;
}

/**
 * Minimal group list + creation form. This is a functional test UI
 * for the Groups + Members milestone, not the final product design
 * — see docs/architecture.md for the planned full frontend.
 */
export default function GroupListView({ accessToken, groups, onGroupsChange, onOpenGroup }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const list = await listGroups(accessToken);
    onGroupsChange(list);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await createGroup(accessToken, {
        name,
        description: description.trim() ? description.trim() : undefined,
      });
      setName("");
      setDescription("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create group.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h2>Create a group</h2>
      <form onSubmit={(e) => void handleCreate(e)}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </label>
        <label>
          Description (optional)
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </label>
        <button type="submit" disabled={creating}>
          Create group
        </button>
      </form>
      {error && <p className="notice notice-error">{error}</p>}

      <h2 className="section-heading">Your groups</h2>
      {groups.length === 0 && <p className="muted">No groups yet — create one above.</p>}
      <ul className="group-list">
        {groups.map((group) => (
          <li key={group.id} className="group-list-item">
            <button type="button" className="group-list-button" onClick={() => onOpenGroup(group.id)}>
              <div>
                <strong>{group.name}</strong>
                {group.description && <div className="muted">{group.description}</div>}
              </div>
              <div className="group-list-meta">
                <span className="badge">{group.role}</span>
                <span className="muted">
                  {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
