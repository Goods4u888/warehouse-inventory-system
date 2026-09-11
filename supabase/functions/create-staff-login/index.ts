// create-staff-login
//
// Lets an admin create a brand-new person's Supabase Auth login straight
// from Manage Staff (admin.html), instead of the old flow where the admin
// had to first create it by hand in the Supabase Dashboard (Authentication
// -> Users -> Add user) and only then attach a profile to it from the app.
//
// This has to live server-side because creating an Auth user requires the
// Admin API (auth.admin.createUser), which needs the service_role key --
// a key that must NEVER ship in client-side JS (see js/config.js, which
// deliberately only holds the anon/publishable key). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY below are auto-injected into every Edge
// Function's environment by the platform -- nothing to configure by hand.
//
// Deploy: Supabase Dashboard -> Edge Functions -> Create a new function,
// name it exactly "create-staff-login" (must match the
// supabaseClient.functions.invoke('create-staff-login', ...) call in
// js/db.js), paste this file in, Deploy. See README.md "Roles" section.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Every response -- including error paths and the OPTIONS preflight, not
// just the 200 case -- needs these, or the browser shows a generic "Failed
// to fetch" with the real error hidden in the Network tab.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function generatePassword(length = 16) {
  // Alphanumeric + a few symbols, no ambiguous-looking chars (0/O, 1/l/I)
  // since an admin may have to read this aloud or retype it once.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not signed in' }, 401);

    // "As-caller" client, only used to resolve who's calling.
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(token);
    if (callerErr || !callerData?.user) return json({ error: 'Not signed in' }, 401);

    // Service-role client for every privileged operation from here on --
    // this bypasses RLS entirely, so every check the database would
    // otherwise enforce has to be re-done here by hand.
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: callerProfile } = await serviceClient
      .from('user_profiles')
      .select('role, is_active')
      .eq('id', callerData.user.id)
      .maybeSingle();
    if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return json({ error: 'Admin only' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim();
    const name = String(body.name ?? '').trim();
    const role = String(body.role ?? '').trim();
    const department = body.department ? String(body.department).trim() : null;

    if (!email || !name) return json({ error: 'Email and name are required' }, 400);
    if (!['requester', 'staff', 'admin'].includes(role)) {
      return json({ error: 'Invalid role' }, 400);
    }

    let userId: string;
    let generatedPassword: string | null = null;

    const password = generatePassword();
    const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // otherwise the account sits unconfirmed forever -- this app sends no confirmation email.
    });

    if (created?.user) {
      userId = created.user.id;
      generatedPassword = password;
    } else if (createErr && (createErr.status === 422 || /already.*registered|already exists/i.test(createErr.message ?? ''))) {
      // A login for this email already exists -- from before this feature,
      // or from the original manual-dashboard bootstrap (admin@warehouse.local).
      // Reuse it instead of hard-failing: find it and just attach/update
      // the profile. Not built for scale (small trusted team), so a single
      // page is plenty.
      const { data: listed, error: listErr } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
      if (listErr) return json({ error: listErr.message }, 500);
      const match = listed.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
      if (!match) return json({ error: 'Could not find the existing login for that email' }, 500);
      userId = match.id;
    } else {
      return json({ error: createErr?.message ?? 'Could not create login' }, 500);
    }

    const { error: upsertErr } = await serviceClient
      .from('user_profiles')
      .upsert({ id: userId, name, role, department, is_active: true });
    if (upsertErr) return json({ error: upsertErr.message }, 500);

    return json({ id: userId, generated_password: generatedPassword });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
