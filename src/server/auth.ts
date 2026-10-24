import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { db, schema } from "@/db/client";
import { serverEnv } from "@/lib/env.server";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  orgId: string;
  emailVerified: boolean;
};

const emailSchema = z.string().trim().email("Please enter a valid email");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

/** Returns the signed-in user with their profile, or null. Cheap; safe to call in beforeLoad. */
export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    let profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.id, user.id),
    });
    // Users created by invite/admin, or whose sign-up transaction failed after the auth
    // user was created, have no workspace yet. Create one from their sign-up metadata.
    if (!profile) {
      const meta = (user.user_metadata ?? {}) as { full_name?: string; company?: string };
      profile = await db.transaction(async (tx) => {
        const [org] = await tx
          .insert(schema.organizations)
          .values({ name: meta.company?.trim() || "My company" })
          .returning({ id: schema.organizations.id });
        const [created] = await tx
          .insert(schema.profiles)
          .values({
            id: user.id,
            orgId: org.id,
            email: user.email ?? "",
            fullName: meta.full_name?.trim() ?? "",
          })
          .onConflictDoNothing()
          .returning();
        return created;
      });
      if (!profile) return null;
    }

    return {
      id: user.id,
      email: user.email ?? profile.email,
      name: profile.fullName,
      orgId: profile.orgId,
      emailVerified: Boolean(user.email_confirmed_at),
    };
  },
);

export const signIn = createServerFn({ method: "POST" })
  .validator(z.object({ email: emailSchema, password: z.string().min(1) }))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(data);
    if (error) return { ok: false as const, error: friendlyAuthError(error.message) };
    return { ok: true as const };
  });

export const signUp = createServerFn({ method: "POST" })
  .validator(
    z.object({
      fullName: z.string().trim().min(1, "Full name is required"),
      company: z.string().trim().min(1, "Company name is required"),
      email: emailSchema,
      password: passwordSchema,
    }),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.fullName, company: data.company },
        emailRedirectTo: `${serverEnv.APP_URL}/verify-email`,
      },
    });
    if (error) return { ok: false as const, error: friendlyAuthError(error.message) };
    const user = result.user;
    if (!user) return { ok: false as const, error: "Sign-up failed. Please try again." };

    // Supabase returns a user with an empty identities array when the email is already registered.
    if (user.identities && user.identities.length === 0) {
      return { ok: false as const, error: "An account with this email already exists." };
    }

    // Create the workspace + profile now so the account is usable immediately after verification.
    await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({ name: data.company })
        .returning({ id: schema.organizations.id });
      await tx
        .insert(schema.profiles)
        .values({ id: user.id, orgId: org.id, email: data.email, fullName: data.fullName })
        .onConflictDoNothing();
    });

    return { ok: true as const, needsVerification: !user.email_confirmed_at };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = getSupabaseServerClient();
  await supabase.auth.signOut();
  return { ok: true as const };
});

export const resendVerification = createServerFn({ method: "POST" })
  .validator(z.object({ email: emailSchema }))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.resend({ type: "signup", email: data.email });
    if (error) return { ok: false as const, error: friendlyAuthError(error.message) };
    return { ok: true as const };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator(z.object({ email: emailSchema }))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    // Always report success so the endpoint can't be used to enumerate accounts.
    await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${serverEnv.APP_URL}/reset-password`,
    });
    return { ok: true as const };
  });

/**
 * Completes an email link (sign-up confirmation or password reset). Supabase redirects
 * back with `?code=…` (PKCE); exchanging it creates the session in this browser.
 */
export const exchangeAuthCode = createServerFn({ method: "POST" })
  .validator(z.object({ code: z.string().min(1) }))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(data.code);
    if (error) {
      // Supabase only issues `code` after it has verified the email token, so this
      // specific failure means the link was opened in a browser that did not start
      // the flow (no PKCE verifier cookie). The email itself is already confirmed.
      const verifierMissing = error.code === "pkce_code_verifier_not_found";
      return {
        ok: false as const,
        reason: verifierMissing ? ("verifier_missing" as const) : ("invalid" as const),
        error: friendlyAuthError(error.message),
      };
    }
    return { ok: true as const };
  });

/**
 * Browser-independent verification. Used when the email template links with
 * `token_hash` + `type` (Supabase's recommended SSR pattern) instead of a PKCE code.
 */
export const verifyTokenHash = createServerFn({ method: "POST" })
  .validator(
    z.object({
      tokenHash: z.string().min(1),
      type: z.enum(["signup", "email", "recovery", "email_change", "invite", "magiclink"]),
    }),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: data.tokenHash,
      type: data.type,
    });
    if (error) return { ok: false as const, error: friendlyAuthError(error.message) };
    return { ok: true as const };
  });

export const updatePassword = createServerFn({ method: "POST" })
  .validator(z.object({ password: passwordSchema }))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });
    if (error) return { ok: false as const, error: friendlyAuthError(error.message) };
    return { ok: true as const };
  });

function friendlyAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Please verify your email before signing in.";
  if (m.includes("already registered")) return "An account with this email already exists.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  return message;
}
