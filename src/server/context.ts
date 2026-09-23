import { eq } from "drizzle-orm";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { db, schema } from "@/db/client";

export class AuthError extends Error {
  status = 401;
  constructor(message = "Not signed in") {
    super(message);
  }
}

export type RequestContext = { userId: string; orgId: string };

/** Resolves the caller's user and organisation from the session cookie, or throws. */
export async function requireUser(): Promise<RequestContext> {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError();
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, user.id),
    columns: { orgId: true },
  });
  if (!profile) throw new AuthError("No workspace for this user");
  return { userId: user.id, orgId: profile.orgId };
}
