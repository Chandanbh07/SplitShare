import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  getGroupDetails,
  addGroupMember,
  removeGroupMember,
  leaveGroup,
  ApiError,
} from "../lib/api";
import type { GroupDetails } from "../lib/api";

interface Props {
  accessToken: string;
  currentUserId: string;
  groupId: string;
  onBack: () => void;
  /** Called after a successful leave, so the parent can refresh the group list. */
  onLeft: () => void;
}

type AddMemberMode = "userId" | "phone";

/**
 * Minimal group details view: active members, add member, leave, and
 * remove (where the current user's role permits it). The backend is
 * always the source of truth for what's actually permitted — this UI
 * just hides obviously-inapplicable actions and surfaces whatever
 * error the API returns otherwise.
 */
export default function GroupDetailsView({ accessToken, currentUserId, groupId, onBack, onLeft }: Props) {
  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [addMode, setAddMode] = useState<AddMemberMode>("userId");
  const [addValue, setAddValue] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const d = await getGroupDetails(accessToken, groupId);
      setDetails(d);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load group.");
    }
  }, [accessToken, groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAddBusy(true);
    try {
      await addGroupMember(
        accessToken,
        groupId,
        addMode === "userId" ? { userId: addValue.trim() } : { phone: addValue.trim() }
      );
      setAddValue("");
      await load();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Failed to add member.");
    } finally {
      setAddBusy(false);
    }
  }

  async function handleRemove(targetUserId: string) {
    setActionError(null);
    setPendingUserId(targetUserId);
    try {
      await removeGroupMember(accessToken, groupId, targetUserId);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to remove member.");
    } finally {
      setPendingUserId(null);
    }
  }

  async function handleLeave() {
    setActionError(null);
    setPendingUserId(currentUserId);
    try {
      await leaveGroup(accessToken, groupId);
      onLeft();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to leave group.");
      setPendingUserId(null);
    }
  }

  if (loadError) {
    return (
      <div>
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <p className="notice notice-error">{loadError}</p>
      </div>
    );
  }

  if (!details) {
    return <p>Loading…</p>;
  }

  const canManageMembers = details.myRole === "OWNER" || details.myRole === "ADMIN";
  const canLeave = details.myRole !== "OWNER";

  return (
    <div>
      <button type="button" onClick={onBack}>
        ← Back
      </button>

      <h2 className="section-heading">{details.name}</h2>
      {details.description && <p className="muted">{details.description}</p>}
      <p className="muted">
        Your role: <span className="badge">{details.myRole}</span>
      </p>

      <h3>Active members</h3>
      <ul className="member-list">
        {details.members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const canRemoveThis =
            canManageMembers &&
            !isSelf &&
            member.role !== "OWNER" &&
            !(details.myRole === "ADMIN" && member.role === "ADMIN");

          return (
            <li key={member.userId} className="member-list-item">
              <div>
                <strong>{member.displayName}</strong> <span className="badge">{member.role}</span>
                {isSelf && <span className="muted"> (you)</span>}
              </div>
              {canRemoveThis && (
                <button
                  type="button"
                  className="danger"
                  disabled={pendingUserId === member.userId}
                  onClick={() => void handleRemove(member.userId)}
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {actionError && <p className="notice notice-error">{actionError}</p>}

      {canManageMembers && (
        <>
          <h3>Add member</h3>
          <div className="tabs">
            <button
              type="button"
              className={addMode === "userId" ? "tab tab-active" : "tab"}
              onClick={() => setAddMode("userId")}
            >
              By user ID
            </button>
            <button
              type="button"
              className={addMode === "phone" ? "tab tab-active" : "tab"}
              onClick={() => setAddMode("phone")}
            >
              By phone
            </button>
          </div>
          <form onSubmit={(e) => void handleAddMember(e)}>
            <label>
              {addMode === "userId" ? "User ID" : "Phone number"}
              <input value={addValue} onChange={(e) => setAddValue(e.target.value)} required />
            </label>
            <button type="submit" disabled={addBusy}>
              Add member
            </button>
          </form>
          {addError && <p className="notice notice-error">{addError}</p>}
        </>
      )}

      {canLeave ? (
        <button type="button" className="danger" disabled={pendingUserId === currentUserId} onClick={() => void handleLeave()}>
          Leave group
        </button>
      ) : (
        <p className="muted">As the owner, you can't leave this group yet (ownership transfer isn't implemented).</p>
      )}
    </div>
  );
}
