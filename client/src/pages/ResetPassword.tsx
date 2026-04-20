import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
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
    return (
      <AuthLayout title="Checking link...">
        <div className="h-16 animate-pulse rounded-md bg-[var(--surface-muted)]" />
      </AuthLayout>
    );
  }

  if (!info.valid) {
    return (
      <AuthLayout title="Link expired" description="This reset link is invalid or has expired.">
        <p className="text-sm text-[var(--fg-muted)]">Ask your teacher to send a new one.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Password reset"
      title="Choose a new password"
      description={`Hi ${info.fullName}, set a new password below.`}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Label required>New password
          <Input autoFocus minLength={8} required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Label>
        <Label required>Confirm password
          <Input minLength={8} required type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Label>
        {error && (
          <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}
        <Button type="submit" loading={submitting} size="lg">
          {submitting ? "Saving..." : "Set password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
