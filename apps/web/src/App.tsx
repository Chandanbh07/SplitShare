import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./lib/supabaseClient";
import { fetchMe, listGroups, ApiError, type MeProfile, type GroupSummary } from "./lib/api";
import GroupListView from "./components/GroupListView";
import GroupDetailsView from "./components/GroupDetailsView";

type PasswordMode = "login" | "signup";
type AuthTab = "password" | "phone";

/**
 * Minimal UI to exercise the V1 auth foundation end-to-end:
 * email/password signup+login, phone/OTP login, logout, and the
 * resulting SplitFlow profile from `GET /api/v1/me`. This is a test
 * harness for the auth flow, not the SplitFlow product UI — see
 * docs/architecture.md for the planned full frontend.
 */
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [authTab, setAuthTab] = useState<AuthTab>("password");
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  // Keep `session` in sync with Supabase's own state (initial load +
  // every subsequent sign-in/sign-out/token refresh).
  useEffect(() => {
    if (!supabase) {
      setSessionLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Whenever we have a session, ask the backend who that token
  // belongs to — this is the only place the app learns the
  // SplitFlow User profile; it never trusts anything local.
  const loadProfile = useCallback(async (accessToken: string) => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const me = await fetchMe(accessToken);
      setProfile(me);
      const myGroups = await listGroups(accessToken);
      setGroups(myGroups);
    } catch (err) {
      setProfile(null);
      setProfileError(err instanceof ApiError ? `${err.message} (${err.status})` : "Failed to load profile.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.access_token) {
      void loadProfile(session.access_token);
    } else {
      setProfile(null);
      setProfileError(null);
      setGroups([]);
      setOpenGroupId(null);
    }
  }, [session?.access_token, loadProfile]);

  function resetFormMessages() {
    setFormError(null);
    setFormNotice(null);
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    resetFormMessages();
    setFormLoading(true);
    try {
      if (passwordMode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setFormNotice("Account created. Check your email if confirmation is required, or you may already be signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    resetFormMessages();
    setFormLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) throw error;
      setOtpSent(true);
      setFormNotice("Code sent. Enter it below to finish signing in.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    resetFormMessages();
    setFormLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token: otpCode, type: "sms" });
      if (error) throw error;
      setOtpSent(false);
      setOtpCode("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="page">
        <div className="card">
          <h1>SplitFlow — Auth</h1>
          <p className="notice notice-error">
            Supabase isn't configured for this app yet. Set{" "}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{" "}
            <code>apps/web/.env</code> (see <code>apps/web/.env.example</code>), then reload.
          </p>
        </div>
      </div>
    );
  }

  if (sessionLoading) {
    return (
      <div className="page">
        <div className="card">
          <h1>SplitFlow — Auth</h1>
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div className="page">
        <div className="card card-wide">
          <div className="top-bar">
            <div>
              <h1>SplitFlow</h1>
              {profileLoading && <p className="muted">Loading…</p>}
              {profileError && <p className="notice notice-error">{profileError}</p>}
              {profile && (
                <p className="muted">
                  Signed in as <strong>{profile.displayName}</strong>{" "}
                  <span className="mono small">({profile.id})</span>
                </p>
              )}
            </div>
            <button type="button" onClick={() => void handleLogout()}>
              Log out
            </button>
          </div>

          {profile &&
            (openGroupId ? (
              <GroupDetailsView
                accessToken={session.access_token}
                currentUserId={profile.id}
                groupId={openGroupId}
                onBack={() => setOpenGroupId(null)}
                onLeft={() => {
                  setOpenGroupId(null);
                  void listGroups(session.access_token).then(setGroups);
                }}
              />
            ) : (
              <GroupListView
                accessToken={session.access_token}
                groups={groups}
                onGroupsChange={setGroups}
                onOpenGroup={setOpenGroupId}
              />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <h1>SplitFlow — Auth</h1>

        <div className="tabs">
          <button
            type="button"
            className={authTab === "password" ? "tab tab-active" : "tab"}
            onClick={() => {
              setAuthTab("password");
              resetFormMessages();
            }}
          >
            Email
          </button>
          <button
            type="button"
            className={authTab === "phone" ? "tab tab-active" : "tab"}
            onClick={() => {
              setAuthTab("phone");
              resetFormMessages();
            }}
          >
            Phone
          </button>
        </div>

        {authTab === "password" && (
          <form onSubmit={(e) => void handlePasswordSubmit(e)}>
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={passwordMode === "signup" ? "new-password" : "current-password"}
              />
            </label>

            <div className="button-row">
              <button type="submit" disabled={formLoading} onClick={() => setPasswordMode("login")}>
                Log in
              </button>
              <button type="submit" disabled={formLoading} onClick={() => setPasswordMode("signup")}>
                Sign up
              </button>
            </div>
          </form>
        )}

        {authTab === "phone" && !otpSent && (
          <form onSubmit={(e) => void handleSendOtp(e)}>
            <label>
              Phone number
              <input
                type="tel"
                required
                placeholder="+15551234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </label>
            <button type="submit" disabled={formLoading}>
              Send code
            </button>
          </form>
        )}

        {authTab === "phone" && otpSent && (
          <form onSubmit={(e) => void handleVerifyOtp(e)}>
            <label>
              Verification code
              <input
                type="text"
                inputMode="numeric"
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                autoComplete="one-time-code"
              />
            </label>
            <div className="button-row">
              <button type="submit" disabled={formLoading}>
                Verify
              </button>
              <button
                type="button"
                disabled={formLoading}
                onClick={() => {
                  setOtpSent(false);
                  setOtpCode("");
                  resetFormMessages();
                }}
              >
                Back
              </button>
            </div>
          </form>
        )}

        {formError && <p className="notice notice-error">{formError}</p>}
        {formNotice && <p className="notice notice-ok">{formNotice}</p>}
      </div>
    </div>
  );
}
