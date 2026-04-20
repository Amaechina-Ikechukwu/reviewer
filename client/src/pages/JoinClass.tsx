import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
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
      <AuthLayout title="Invalid link" description="This join link is invalid or has expired.">
        <p className="text-sm text-[var(--fg-muted)]">Contact your teacher for a new invite.</p>
      </AuthLayout>
    );
  }

  if (!teacherName) {
    return (
      <AuthLayout title="Loading...">
        <div className="h-16 animate-pulse rounded-md bg-[var(--surface-muted)]" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="You're joining"
      title={`${teacherName}'s class`}
      description="Create your student account to get started."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Label required>Full name
          <Input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Your full name" />
        </Label>
        <Label required>Email
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
        </Label>
        <Label required>Password
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Min 8 characters" minLength={8} />
        </Label>
        {error && (
          <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}
        <Button type="submit" loading={submitting} size="lg">
          {submitting ? "Creating account..." : "Create account & join"}
        </Button>
      </form>
    </AuthLayout>
  );
}
