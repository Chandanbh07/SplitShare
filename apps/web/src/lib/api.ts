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
 * Calls `GET /api/v1/me` with the caller's Supabase access token.
 * The token is the ONLY thing that establishes identity — this app
 * never sends a user id itself (see AGENTS.md "Security").
 */
export async function fetchMe(accessToken: string): Promise<MeProfile> {
  const res = await fetch(`${API_URL}/api/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
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

  return (await res.json()) as MeProfile;
}
