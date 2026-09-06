// Optional hardening: verify Cloudflare Turnstile server-side before writing.
//
// Deploy:  supabase functions deploy enrol --no-verify-jwt
// Secrets: supabase secrets set TURNSTILE_SECRET=... SERVICE_ROLE_KEY=... SUPABASE_URL=...
//
// Then point assets/js/enrol.js at
//   `${SUPABASE_URL}/functions/v1/enrol`
// instead of the REST endpoint, and drop the "anon can enrol" policy so the
// only path into the table is this function.

const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const ALLOWED_ORIGINS = [
  "https://YOUR-GITHUB-USERNAME.github.io",
  "http://localhost:8000",
];

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = { ...cors(origin), "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers });
  }

  // 1. Turnstile
  const token = String(body.turnstile_token ?? "");
  const secret = Deno.env.get("TURNSTILE_SECRET");
  if (secret) {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    const ip = req.headers.get("cf-connecting-ip");
    if (ip) form.append("remoteip", ip);

    const verify = await fetch(TURNSTILE_URL, { method: "POST", body: form });
    const outcome = await verify.json();
    if (!outcome.success) {
      return new Response(JSON.stringify({ error: "verification_failed" }), { status: 403, headers });
    }
  }

  // 2. Shape and bounds — never trust the client's validation
  const universities = ["REC", "SNU", "AU"];
  const years = ["1", "2", "3", "4", "other"];
  const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

  const row = {
    full_name: str(body.full_name, 120),
    email: str(body.email, 160).toLowerCase(),
    university: str(body.university, 8),
    year_of_study: str(body.year_of_study, 8),
    branch: str(body.branch, 120),
    experience: ["none", "some", "comfortable"].includes(String(body.experience))
      ? String(body.experience)
      : null,
    interests: body.interests ? str(body.interests, 500) : null,
    attending_launch: Boolean(body.attending_launch),
    council_interest: Boolean(body.council_interest),
    source: "website",
    status: "new",
  };

  const valid =
    row.full_name.length >= 2 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email) &&
    universities.includes(row.university) &&
    years.includes(row.year_of_study) &&
    row.branch.length >= 2;

  if (!valid) {
    return new Response(JSON.stringify({ error: "invalid_payload" }), { status: 422, headers });
  }

  // 3. Insert with the service-role key, which never reaches the browser
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/enrolments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: Deno.env.get("SERVICE_ROLE_KEY") ?? "",
      Authorization: `Bearer ${Deno.env.get("SERVICE_ROLE_KEY") ?? ""}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (res.status === 409) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200, headers });
  }
  if (!res.ok) {
    return new Response(JSON.stringify({ error: "store_failed" }), { status: 502, headers });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 201, headers });
});
