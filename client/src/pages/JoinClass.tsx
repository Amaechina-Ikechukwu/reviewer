import { useEffect, useState, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

export default function JoinClass() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [teacherName, setTeacherName] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<{ teacherName: string }>(`/teachers/join/${code}`)
      .then((data) => setTeacherName(data.teacherName))
      .catch(() => setNotFound(true));
  }, [code]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { token, user } = await api<{ token: string; user: User }>(`/teachers/join/${code}`, {
        method: "POST",
        body: JSON.stringify({ fullName, email, password }),
      });
      login(token, user);
      navigate("/student");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 style={{ fontSize: "1.4rem", margin: "0 0 8px" }}>Invalid link</h1>
          <p className="muted">This join link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  if (!teacherName) {
    return <div className="auth-shell">Loading...</div>;
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">You're joining</div>
          <h1 style={{ fontSize: "1.6rem", margin: "4px 0 4px" }}>{teacherName}'s class</h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.95rem" }}>Create your account to get started.</p>
        </div>

        <form className="stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
          <label className="field">
            <span>Full name</span>
            <input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Your full name" />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Min 8 characters" minLength={8} />
          </label>
          {error && <div style={{ color: "var(--danger)", fontSize: "0.88rem" }}>{error}</div>}
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account & join"}
          </button>
        </form>
      </div>
    </div>
  );
}
