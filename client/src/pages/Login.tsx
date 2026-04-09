import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { toast, Toaster } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import type { Role, User } from "../types";

type AuthResponse = {
  token: string;
  user: User;
};

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = mode === "login"
        ? await api<AuthResponse>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          })
        : await api<AuthResponse>("/auth/register", {
            method: "POST",
            body: JSON.stringify({ email, password, fullName, role }),
          });

      login(payload.token, payload.user);
      navigate(payload.user.role === "teacher" ? "/teacher" : "/student");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setError(msg);
      toast().error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card stack">
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ margin: 0 }}>Reviewer</h1>
          <p className="muted" style={{ margin: 0 }}>{mode === "login" ? "Sign in to your account." : "Create a new account."}</p>
        </div>

        <div className="pill-row">
          <button className={`pill-button ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")} type="button">
            Login
          </button>
          <button className={`pill-button ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")} type="button">
            Register
          </button>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <label className="field">
                <span>Full name</span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              </label>

              <label className="field">
                <span>Role</span>
                <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                  <option value="teacher">Teacher / Admin</option>
                  <option value="student">Student</option>
                </select>
              </label>
            </>
          )}

          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>

          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>

          {error && <div className="card" style={{ color: "#b91c1c" }}>{error}</div>}

          <button className="button" disabled={submitting} type="submit">
            {submitting ? "Working..." : mode === "login" ? "Login" : "Create account"}
          </button>
        </form>
      </div>
      <Toaster />
    </div>
  );
}
