import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics-tracker";
import { ANALYTICS_EVENTS } from "@/services/analytics.service";

/**
 * Authentication data access.
 *
 * All session state lives in Supabase Auth — this module only wraps the
 * calls; session observation happens through useSession(). Email confirmation
 * links and password-recovery links are redirected to /dashboard and
 * /auth/reset-password respectively (configured per call below).
 */

/**
 * Creates an account. When the project has email confirmation switched off
 * (`mailer_autoconfirm`), Supabase returns a live session and the caller can go
 * straight to the dashboard; otherwise the user must confirm by email first.
 */
export async function signUpWithEmail(params: {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
}): Promise<{ hasSession: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      emailRedirectTo: `${window.location.origin}/dashboard`,
      data: { full_name: params.fullName, phone: params.phone ?? null },
    },
  });
  if (error) throw error;

  trackEvent(ANALYTICS_EVENTS.accountRegistered);

  return { hasSession: Boolean(data.session) };
}

/**
 * Signs in with email + password.
 * Returns whether a session actually landed, so a caller can tell the user when
 * a browser silently refuses to keep the session instead of navigating into a
 * dead end.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ hasSession: boolean }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  trackEvent(ANALYTICS_EVENTS.loginSuccess);

  return { hasSession: Boolean(data.session) };
}

/** Sends the recovery email. Supabase redirects the user to /auth/reset-password. */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
  if (error) throw error;

  trackEvent(ANALYTICS_EVENTS.passwordResetRequested);
}

/**
 * Exchanges a recovery token from the email link for a session. Call this when
 * the reset page loads with `token_hash` + `type=recovery` in the URL hash;
 * updating the password only works once this session exists.
 */
export async function verifyRecoveryToken(tokenHash: string) {
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });
  if (error) throw error;
}

/** Sets a new password for the signed-in user (after verifyRecoveryToken or sign-in). */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  trackEvent(ANALYTICS_EVENTS.logout);
}
