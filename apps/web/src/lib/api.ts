const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export interface MeProfile {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type GroupRole = "OWNER" | "ADMIN" | "MEMBER";
export type GroupMemberStatus = "ACTIVE" | "LEFT" | "REMOVED";

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  role: GroupRole;
  memberCount: number;
  createdAt: string;
}

export interface GroupMemberSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: GroupRole;
  status: GroupMemberStatus;
  joinedAt: string;
}

export interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  chatMode: string;
  createdAt: string;
  updatedAt: string;
  myRole: GroupRole;
  members: GroupMemberSummary[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Shared request helper. The access token is the ONLY thing that
 * establishes identity on every call — this app never sends a user
 * id itself (see AGENTS.md "Security").
 */
async function apiFetch<T>(
  accessToken: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const errorBody =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: { message?: string; code?: string } }).error
        : undefined;
    throw new ApiError(
      res.status,
      errorBody?.message ?? `Request failed with status ${res.status}`,
      errorBody?.code
    );
  }

  // 200s with no meaningful body (e.g. leave/remove) still parse fine
  // as JSON here since the backend always returns a small JSON object.
  return (await res.json()) as T;
}

/** GET /api/v1/me */
export function fetchMe(accessToken: string): Promise<MeProfile> {
  return apiFetch<MeProfile>(accessToken, "/api/v1/me");
}

/** POST /api/v1/groups */
export function createGroup(
  accessToken: string,
  input: { name: string; description?: string }
): Promise<GroupSummary> {
  return apiFetch<GroupSummary>(accessToken, "/api/v1/groups", { method: "POST", body: input });
}

/** GET /api/v1/groups */
export async function listGroups(accessToken: string): Promise<GroupSummary[]> {
  const { groups } = await apiFetch<{ groups: GroupSummary[] }>(accessToken, "/api/v1/groups");
  return groups;
}

/** GET /api/v1/groups/:groupId */
export function getGroupDetails(accessToken: string, groupId: string): Promise<GroupDetails> {
  return apiFetch<GroupDetails>(accessToken, `/api/v1/groups/${groupId}`);
}

/** POST /api/v1/groups/:groupId/members */
export function addGroupMember(
  accessToken: string,
  groupId: string,
  input: { userId?: string; phone?: string }
): Promise<GroupMemberSummary> {
  return apiFetch<GroupMemberSummary>(accessToken, `/api/v1/groups/${groupId}/members`, {
    method: "POST",
    body: input,
  });
}

/** DELETE /api/v1/groups/:groupId/members/:userId */
export function removeGroupMember(accessToken: string, groupId: string, userId: string): Promise<void> {
  return apiFetch<void>(accessToken, `/api/v1/groups/${groupId}/members/${userId}`, { method: "DELETE" });
}

/** POST /api/v1/groups/:groupId/leave */
export function leaveGroup(accessToken: string, groupId: string): Promise<void> {
  return apiFetch<void>(accessToken, `/api/v1/groups/${groupId}/leave`, { method: "POST" });
}
