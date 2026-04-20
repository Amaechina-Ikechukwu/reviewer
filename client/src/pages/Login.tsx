import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";
import { toast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/cn";
import type { Role, User } from "../types";

type AuthResponse = { token: string; user: User };

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
      const payload =
        mode === "login"
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
    <AuthLayout
      title={mode === "login" ? "Welcome back" : "Create your account"}
      description={
        mode === "login"
          ? "Sign in to continue to your workspace."
          : "Start reviewing student submissions in minutes."
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-1 text-sm">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "h-8 rounded px-3 font-medium transition-colors",
              mode === m
                ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
            )}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "register" && (
          <>
            <Label required>Full name
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Jane Doe" />
            </Label>
            <Label>Role
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="teacher">Teacher / Admin</option>
                <option value="student">Student</option>
              </Select>
            </Label>
          </>
        )}

        <Label required>Email
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@school.edu" />
        </Label>

        <Label required>Password
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
        </Label>

        {error && (
          <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}

        <Button type="submit" loading={submitting} size="lg" className="mt-1 w-full">
          {submitting ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
