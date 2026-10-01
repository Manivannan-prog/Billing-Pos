// Admin user management for the Billing POS.
//
// The service-role key can create and delete auth users, so it must never reach
// the browser. This function holds it server-side and only acts after proving
// the caller is an active admin, using the caller's own JWT against RLS.
//
// Deploy:  supabase functions deploy admin-users
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Logins are usernames, not emails. Supabase Auth wants an email, so each
// username is mapped onto a stable synthetic address in a domain nobody can
// receive mail at - there is no email confirmation or recovery flow here.
const USERNAME_DOMAIN = "pos.local";
const emailForUsername = (username: string) =>
  `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Resolve the caller from their bearer token and confirm they are an admin. */
async function requireAdmin(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: json({ error: "Missing authorization header." }, 401) };

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) {
    return { error: json({ error: "Invalid or expired session." }, 401) };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || !profile.is_active) {
    return { error: json({ error: "Admin access is required." }, 403) };
  }

  return { callerId: userData.user.id };
}

function validate(username: string, password: string | undefined, requirePassword: boolean) {
  if (!/^[a-z0-9._-]{3,30}$/i.test(username ?? "")) {
    return "Username must be 3-30 characters: letters, numbers, dot, dash or underscore.";
  }
  if (requirePassword || password) {
    if (!password || password.length < 8) return "Password must be at least 8 characters.";
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  let payload: Record<string, string | boolean>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }

  const action = String(payload.action ?? "");

  try {
    if (action === "list") {
      const { data, error } = await admin
        .from("profiles")
        .select("id, username, full_name, role, is_active, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json({ users: data });
    }

    if (action === "create") {
      const username = String(payload.username ?? "").trim().toLowerCase();
      const password = String(payload.password ?? "");
      const fullName = String(payload.fullName ?? "").trim();
      const role = payload.role === "admin" ? "admin" : "user";

      const invalid = validate(username, password, true);
      if (invalid) return json({ error: invalid }, 400);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: emailForUsername(username),
        password,
        email_confirm: true,
        user_metadata: { username, full_name: fullName },
      });
      if (createError) {
        const duplicate = /already/i.test(createError.message);
        return json(
          { error: duplicate ? `The username "${username}" is already taken.` : createError.message },
          duplicate ? 409 : 400,
        );
      }

      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .insert({
          id: created.user.id,
          username,
          full_name: fullName || username,
          role,
          is_active: true,
        })
        .select()
        .single();

      // Never leave an auth user without a profile - it would be a login that
      // passes authentication but resolves to no role at all.
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        const duplicate = /duplicate|unique/i.test(profileError.message);
        return json(
          { error: duplicate ? `The username "${username}" is already taken.` : profileError.message },
          duplicate ? 409 : 400,
        );
      }

      return json({ user: profile }, 201);
    }

    if (action === "update") {
      const id = String(payload.id ?? "");
      if (!id) return json({ error: "A user id is required." }, 400);

      const patch: Record<string, unknown> = {};
      if (payload.fullName !== undefined) patch.full_name = String(payload.fullName).trim();
      if (payload.role !== undefined) patch.role = payload.role === "admin" ? "admin" : "user";
      if (payload.isActive !== undefined) patch.is_active = Boolean(payload.isActive);
      patch.updated_at = new Date().toISOString();

      // Refuse to strand the shop with no way back in.
      if (patch.role === "user" || patch.is_active === false) {
        const { count } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("is_active", true);
        const { data: target } = await admin
          .from("profiles")
          .select("role, is_active")
          .eq("id", id)
          .maybeSingle();
        if ((count ?? 0) <= 1 && target?.role === "admin" && target?.is_active) {
          return json({ error: "This is the last active admin. Promote another admin first." }, 409);
        }
      }

      const { data, error } = await admin
        .from("profiles")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      return json({ user: data });
    }

    if (action === "reset-password") {
      const id = String(payload.id ?? "");
      const password = String(payload.password ?? "");
      if (!id) return json({ error: "A user id is required." }, 400);
      if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) throw error;

      return json({ ok: true });
    }

    if (action === "delete") {
      const id = String(payload.id ?? "");
      if (!id) return json({ error: "A user id is required." }, 400);
      if (id === guard.callerId) {
        return json({ error: "You cannot delete the account you are signed in with." }, 409);
      }

      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true);
      const { data: target } = await admin
        .from("profiles")
        .select("role, is_active")
        .eq("id", id)
        .maybeSingle();
      if ((count ?? 0) <= 1 && target?.role === "admin" && target?.is_active) {
        return json({ error: "This is the last active admin. Create another admin first." }, 409);
      }

      // profiles.id cascades from auth.users, so this clears both.
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;

      return json({ ok: true });
    }

    return json({ error: `Unknown action "${action}".` }, 400);
  } catch (error) {
    return json({ error: (error as Error).message ?? "Unexpected error." }, 500);
  }
});
