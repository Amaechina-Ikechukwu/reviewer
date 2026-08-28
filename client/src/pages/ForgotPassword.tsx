import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icons";
import { Input, Label } from "../components/ui/Input";

/**
 * Self-service reset for someone who cannot sign in. The confirmation never
 * says whether the address has an account — that would let anyone check who is
 * enrolled — so the same message shows either way.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Check your email" description="A reset link is on its way">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--success)]/20 text-[var(--success)]">
              <Icon.Check className="h-5 w-5" />
            </div>
            <p className="text-sm text-[var(--fg)]">
              If <strong>{email}</strong> has an account, we have sent it a link to set a new password.
            </p>
            <p className="text-xs text-[var(--fg-muted)]">
              The link lasts 15 minutes. Check your spam folder if it does not arrive.
            </p>
          </div>
          <Link to="/login">
            <Button variant="secondary" size="lg" className="w-full">
              Back to sign in
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot your password?" description="We'll email you a link to set a new one">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Label required>
          Email
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
            placeholder="you@school.edu"
          />
        </Label>

        {error && (
          <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}

        <Button type="submit" loading={submitting} size="lg" className="mt-1 w-full">
          {submitting ? "Sending..." : "Send reset link"}
        </Button>

        <Link
          to="/login"
          className="text-center text-xs font-medium text-[var(--fg-muted)] transition-colors hover:text-[var(--accent)]"
        >
          Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}
