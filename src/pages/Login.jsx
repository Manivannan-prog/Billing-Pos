import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { isDemoMode } from "../lib/db";
import { Alert, Button, Field, Icon, Input, Spinner } from "../components/ui";
import { BrandFooter, BrandMark } from "../components/ui/Brand";

function Login() {
  const { profile, isLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (profile) return <Navigate to={location.state?.from || "/"} replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setIsSubmitting(true);
    try {
      await signIn(username, password);
      navigate(location.state?.from || "/", { replace: true });
    } catch (signInError) {
      setError(signInError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandMark badge className="mb-3 h-12 w-12 text-primary" />
          <h1 className="font-display text-[26px] font-semibold leading-tight text-text">
            Billing POS
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Sign in with the username your admin issued.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[14px] border border-border bg-surface p-6 shadow-[0_1px_2px_0_rgb(31_36_33/0.04),0_1px_3px_0_rgb(31_36_33/0.04)]"
        >
          <div className="space-y-4">
            <Field label="Username">
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                placeholder="e.g. shop"
                required
                autoFocus
              />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </Field>
          </div>

          {error && (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          )}

          <Button type="submit" size="lg" disabled={isSubmitting} className="mt-5 w-full">
            {isSubmitting ? <Spinner className="h-4 w-4" /> : <Icon name="lock" className="h-4 w-4" />}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-text-muted">
            <Icon name="lock" className="h-3.5 w-3.5" />
            Accounts are created by an administrator. There is no self sign-up.
          </p>
        </form>

        {isDemoMode && (
          <Alert tone="warning" className="mt-4">
            <p className="font-semibold">Demo mode — no backend connected</p>
            <p className="mt-1">
              <strong>shop / shop123</strong> is a shop account with the full POS.{" "}
              <strong>admin / admin123</strong> adds user management on top. Data stays in this
              browser until Supabase keys are added to <code>.env</code>.
            </p>
          </Alert>
        )}
        <BrandFooter className="justify-center" />
      </div>
    </div>
  );
}

export default Login;
