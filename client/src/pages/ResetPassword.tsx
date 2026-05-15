import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AuthLayout } from "../components/AuthLayout";
import { toast } from "../components/Toast";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Icon } from "../components/ui/Icons";

type TokenInfo = { valid: boolean; fullName?: string };

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [step, setStep] = useState<"checking" | "otp" | "done">("checking");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<TokenInfo>(`/auth/token/${token}?type=reset`)
      .then((data) => { setInfo(data); setStep("otp"); })
      .catch(() => setInfo({ valid: false }))
      .finally(() => setStep("otp"));
  }, [token]);

  async function requestOtp() {
    if (!token) return;
    setSubmitting(true);
    try {
      await api("/auth/send-otp", { method: "POST", body: JSON.stringify({ token }) });
      setOtpSent(true);
      toast().success("OTP sent to your email.");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to send OTP.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (otp.length !== 6) { setError("Enter the 6-digit OTP."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setError("");
    setSubmitting(true);
    try {
      await api("/auth/reset-with-otp", {
        method: "POST",
        body: JSON.stringify({ token, otp, password }),
      });
      toast().success("Password updated! You can now log in.");
      setStep("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reset password.";
      setError(msg);
      toast().error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done") {
    return (
      <AuthLayout
        title="Password updated"
        description="Your password has been changed successfully."
      >
        <Button size="lg" onClick={() => navigate("/login")} className="w-full">
          Go to login
        </Button>
      </AuthLayout>
    );
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
        <p className="text-sm text-[var(--fg-muted)]">Request a new password reset from your settings.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Password reset"
      title="Reset your password"
      description={info.fullName ? `Hi ${info.fullName}, verify your identity below.` : ""}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        {!otpSent ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--fg-muted)]">
              Click below to receive a one-time code at your email.
            </p>
            <Button type="button" onClick={requestOtp} loading={submitting} disabled={submitting} size="lg">
              <Icon.Send className="h-3.5 w-3.5" />
              {submitting ? "Sending…" : "Send OTP"}
            </Button>
          </div>
        ) : (
          <>
            <Label required>
              One-time code
              <Input
                autoFocus
                placeholder="000000"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-lg font-mono tracking-[0.5em]"
              />
            </Label>

            <Label required>
              New password
              <Input minLength={8} required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Label>

            <Label required>
              Confirm password
              <Input minLength={8} required type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Label>

            {error && (
              <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                {error}
              </div>
            )}

            <Button type="submit" loading={submitting} size="lg">
              {submitting ? "Updating…" : "Set new password"}
            </Button>

            <button type="button" onClick={requestOtp} className="text-xs text-[var(--accent)] hover:underline">
              Resend OTP
            </button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
