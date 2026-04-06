import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

type AuthResponse = { token: string; user: User };
type TokenInfo = { valid: boolean; fullName?: string };

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<TokenInfo>(`/auth/token/${token}?type=reset`).then(setInfo).catch(() => setInfo({ valid: false }));
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setError("");
    setSubmitting(true);
    try {
      const res = await api<AuthResponse>(`/auth/reset/${token}`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      login(res.token, res.user);
      navigate(res.user.role === "teacher" ? "/teacher" : "/student");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!info) {
    return <div className="auth-shell"><div className="card auth-card">Checking link...</div></div>;
  }

  if (!info.valid) {
    return (
      <div className="auth-shell">
        <div className="card auth-card stack">
          <h2 style={{ margin: 0 }}>Link expired</h2>
          <p className="muted" style={{ margin: 0 }}>This reset link is invalid or has expired. Ask your teacher to send a new one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card stack">
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ margin: 0 }}>New password</h1>
          <p className="muted" style={{ margin: 0 }}>Hi {info.fullName}, choose a new password for your account.</p>
        </div>

        <form className="stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
          <label className="field">
            <span>New password</span>
            <input autoFocus minLength={8} required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input minLength={8} required type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && <div style={{ color: "var(--danger)", fontSize: "0.88rem" }}>{error}</div>}
          <button className="button" disabled={submitting} type="submit">
            {submitting ? "Saving..." : "Set password"}
          </button>
        </form>
      </div>
    </div>
  );
}
