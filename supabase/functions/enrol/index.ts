// ============================================================
// Tech & Skills Council — single submission endpoint
//
// Handles BOTH forms:
//   { form: "launch",  ... }  -> launch_registrations
//   { form: "council", ... }  -> council_applications
//
// What it does, in order:
//   1. CORS allow-list                      (only our own origins)
//   2. Body size cap                        (reject anything absurd)
//   3. Cloudflare Turnstile verification    (if TURNSTILE_SECRET is set)
//   4. Per-IP rate limit                    (hashed IP, sliding window)
//   5. Strict re-validation                 (never trust the browser)
//   6. Insert with the service-role key     (RLS denies everyone else)
//   7. Email the full submission to the council inbox
//
// Deploy:
//   supabase functions deploy enrol --no-verify-jwt
//
// Secrets (Project Settings -> Edge Functions -> Secrets):
//   SERVICE_ROLE_KEY   required  — Supabase service-role key
//   TURNSTILE_SECRET   optional  — enables captcha verification
//   RESEND_API_KEY     optional  — enables the notification email
//   NOTIFY_EMAIL       optional  — defaults to the council Gmail
//   IP_SALT            optional  — salt for hashing IPs
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "techskillscouncil@gmail.com";
const IP_SALT = Deno.env.get("IP_SALT") ?? "tsc-default-salt-change-me";

const ALLOWED_ORIGINS = [
  "https://tech-skills-council.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

/* Hostnames a Turnstile token may legitimately have been issued for. */
const ALLOWED_HOSTNAMES = [
  "tech-skills-council.github.io",
  "localhost",
  "127.0.0.1",
];

const RATE_WINDOW_MINUTES = 10;
/* Campus networks put hundreds of students behind a single public IP. A limit
   tuned for one person per address (5) would reject most of a computer lab or
   hostel block the moment a poster goes up — the exact situation this is built
   for. Turnstile is the real bot gate; this only has to stop a scripted flood,
   so it is set well above any plausible burst of genuine sign-ups. */
const RATE_MAX_PER_WINDOW = 40;
const MAX_BODY_BYTES = 16000;

const UNIVERSITIES = ["REC", "SNU", "AU"];
const YEARS = ["1", "2", "3", "4", "other"];
const TEAMS = [
  "skill_tracks", "build_nights", "design_creative", "platform_infra",
  "certification_asu", "industry_alumni", "pr_outreach",
];
const ROLE_TYPES = ["lead", "associate", "either", "board"];
const HOURS = ["1-3", "4-6", "7-10", "10+"];

const TEAM_LABELS: Record<string, string> = {
  skill_tracks: "Skill Tracks",
  build_nights: "Hackathons & Build Nights",
  design_creative: "Design & Creative",
  platform_infra: "Platform & Infrastructure",
  certification_asu: "Certification & ASU Liaison",
  industry_alumni: "Industry & Alumni Relations",
  pr_outreach: "PR & Outreach",
  none: "—",
};

/* ---------------- helpers ---------------- */

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const oneOf = (v: string, list: string[]) => (list.includes(v) ? v : "");
const nullIfEmpty = (v: string) => (v.length ? v : null);

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(IP_SALT + "|" + ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function db(path: string, init: RequestInit) {
  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...(init.headers ?? {}),
    },
  });
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  return await res.json();
}

/* ---------------- validation ---------------- */

type Result =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string };

function validateLaunch(b: Record<string, unknown>): Result {
  const row = {
    full_name: str(b.full_name, 120),
    email: str(b.email, 160).toLowerCase(),
    university: oneOf(str(b.university, 8), UNIVERSITIES),
    year_of_study: oneOf(str(b.year_of_study, 8), YEARS),
    branch: str(b.branch, 120),
    experience: nullIfEmpty(oneOf(str(b.experience, 20), ["none", "some", "comfortable"])),
    bringing_laptop: Boolean(b.bringing_laptop),
    dietary: nullIfEmpty(str(b.dietary, 120)),
    hear_about: nullIfEmpty(str(b.hear_about, 40)),
    interests: nullIfEmpty(str(b.interests, 500)),
    status: "registered",
  };
  if (row.full_name.length < 2) return { ok: false, error: "full_name" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) return { ok: false, error: "email" };
  if (!row.university) return { ok: false, error: "university" };
  if (!row.year_of_study) return { ok: false, error: "year_of_study" };
  if (row.branch.length < 2) return { ok: false, error: "branch" };
  return { ok: true, row };
}

function validateCouncil(b: Record<string, unknown>): Result {
  const row = {
    full_name: str(b.full_name, 120),
    email: str(b.email, 160).toLowerCase(),
    phone: nullIfEmpty(str(b.phone, 24)),
    university: oneOf(str(b.university, 8), UNIVERSITIES),
    year_of_study: oneOf(str(b.year_of_study, 8), YEARS),
    branch: str(b.branch, 120),

    role_type: oneOf(str(b.role_type, 20), ROLE_TYPES),
    team_first: oneOf(str(b.team_first, 40), TEAMS),
    team_second: nullIfEmpty(oneOf(str(b.team_second, 40), TEAMS.concat(["none"]))),

    experience_level: nullIfEmpty(
      oneOf(str(b.experience_level, 20), ["none", "some", "comfortable", "advanced"]),
    ),
    hours_per_week: oneOf(str(b.hours_per_week, 20), HOURS),

    why_join: str(b.why_join, 1200),
    relevant_experience: str(b.relevant_experience, 1200),
    what_you_would_build: nullIfEmpty(str(b.what_you_would_build, 1200)),
    leadership_history: nullIfEmpty(str(b.leadership_history, 800)),

    portfolio_url: nullIfEmpty(str(b.portfolio_url, 200)),
    linkedin_url: nullIfEmpty(str(b.linkedin_url, 200)),

    attending_launch: Boolean(b.attending_launch),
    status: "new",
  };

  if (row.full_name.length < 2) return { ok: false, error: "full_name" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) return { ok: false, error: "email" };
  if (!row.university) return { ok: false, error: "university" };
  if (!row.year_of_study) return { ok: false, error: "year_of_study" };
  if (row.branch.length < 2) return { ok: false, error: "branch" };
  if (!row.role_type) return { ok: false, error: "role_type" };
  if (!row.team_first) return { ok: false, error: "team_first" };
  if (!row.hours_per_week) return { ok: false, error: "hours_per_week" };
  if (row.why_join.length < 80) return { ok: false, error: "why_join" };
  if (row.relevant_experience.length < 60) return { ok: false, error: "relevant_experience" };
  for (const u of [row.portfolio_url, row.linkedin_url]) {
    if (u && !/^https?:\/\/.+\..+/.test(u)) return { ok: false, error: "url" };
  }
  return { ok: true, row };
}

/* ---------------- notification email ---------------- */

function esc(v: unknown) {
  return String(v ?? "—")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function emailHtml(form: string, row: Record<string, unknown>) {
  const isCouncil = form === "council";
  const rows: Array<[string, unknown]> = isCouncil
    ? [
      ["Name", row.full_name],
      ["Email", row.email],
      ["Phone", row.phone],
      ["University", row.university],
      ["Year", row.year_of_study],
      ["Branch", row.branch],
      ["Applying for", row.role_type],
      ["First-choice team", TEAM_LABELS[String(row.team_first)] ?? row.team_first],
      ["Second choice", TEAM_LABELS[String(row.team_second)] ?? row.team_second],
      ["Technical level", row.experience_level],
      ["Hours per week", row.hours_per_week],
      ["Portfolio", row.portfolio_url],
      ["LinkedIn", row.linkedin_url],
      ["Coming to Launch Day", row.attending_launch ? "Yes" : "No"],
    ]
    : [
      ["Name", row.full_name],
      ["Email", row.email],
      ["University", row.university],
      ["Year", row.year_of_study],
      ["Branch", row.branch],
      ["Technical level", row.experience],
      ["Bringing a laptop", row.bringing_laptop ? "Yes" : "No"],
      ["Dietary needs", row.dietary],
      ["Heard about us via", row.hear_about],
      ["Wants to build", row.interests],
    ];

  const table = rows.map(([k, v]) =>
    `<tr><td style="padding:7px 14px 7px 0;color:#747474;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:7px 0;font-size:14px;color:#111">${esc(v)}</td></tr>`
  ).join("");

  const longAnswers = isCouncil
    ? ([
      ["Why they want this", row.why_join],
      ["Relevant experience", row.relevant_experience],
      ["What they would build first", row.what_you_would_build],
      ["Leadership history", row.leadership_history],
    ] as Array<[string, unknown]>)
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) =>
        `<h3 style="font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#8C1D40;margin:22px 0 6px">${esc(k)}</h3>` +
        `<p style="margin:0;font-size:14px;line-height:1.6;color:#111;white-space:pre-wrap">${esc(v)}</p>`
      ).join("")
    : "";

  return `<!doctype html><html><body style="margin:0;background:#f4f1f2;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;background:#fff">
    <div style="background:#8C1D40;padding:22px 28px">
      <div style="color:#FFC627;font-size:11px;letter-spacing:2.5px;text-transform:uppercase">Tech &amp; Skills Council</div>
      <div style="color:#fff;font-size:23px;font-weight:bold;margin-top:5px">
        ${isCouncil ? "New council application" : "New Launch Day registration"}
      </div>
    </div>
    <div style="padding:26px 28px">
      <table style="border-collapse:collapse;width:100%">${table}</table>
      ${longAnswers}
      <p style="margin:26px 0 0;font-size:12px;color:#747474;border-top:1px solid #e5dde0;padding-top:14px">
        Stored in Supabase — the full record is in the dashboard.
        Personal data: do not forward outside the council.
      </p>
    </div>
  </div></body></html>`;
}

/* Keeps background work alive after the response is returned. Without this the
   isolate can be torn down the moment we respond, and a floating promise — the
   notification email — is silently dropped. */
function background(p: Promise<unknown>) {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(p);
  return p;
}

async function notify(form: string, row: Record<string, unknown>) {
  if (!RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "TSC Website <onboarding@resend.dev>",
        to: [NOTIFY_EMAIL],
        reply_to: String(row.email ?? ""),
        subject: form === "council"
          ? `Council application — ${row.full_name} (${row.university})`
          : `Launch Day registration — ${row.full_name} (${row.university})`,
        html: emailHtml(form, row),
      }),
    });
  } catch (_e) {
    // never fail a submission because email is down
  }
}

/* ---------------- handler ---------------- */

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);
  if (!SERVICE_ROLE_KEY) return json({ error: "not_configured" }, 500, headers);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413, headers);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad_json" }, 400, headers);
  }

  const form = str(body.form, 16);
  if (form !== "launch" && form !== "council") return json({ error: "unknown_form" }, 400, headers);

  if (TURNSTILE_SECRET) {
    const fd = new FormData();
    fd.append("secret", TURNSTILE_SECRET);
    fd.append("response", str(body.turnstile_token, 4000));
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "";
    if (ip) fd.append("remoteip", ip.split(",")[0].trim());

    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: fd,
    });
    const outcome = await verify.json().catch(() => ({ success: false }));
    if (!outcome.success) return json({ error: "verification_failed" }, 403, headers);

    /* A token proves a human solved a challenge — not that they solved it here.
       Cloudflare returns the hostname it was issued for; anything else is a token
       lifted from another site and replayed against this endpoint. */
    const issuedFor = String(outcome.hostname ?? "");
    if (issuedFor && !ALLOWED_HOSTNAMES.includes(issuedFor)) {
      console.warn("turnstile hostname mismatch", issuedFor);
      return json({ error: "verification_failed" }, 403, headers);
    }
  }

  const rawIp = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown")
    .split(",")[0].trim();
  const ipHash = await hashIp(rawIp);
  const recent = await rpc("recent_submits", { p_ip_hash: ipHash, p_minutes: RATE_WINDOW_MINUTES });
  if (typeof recent === "number" && recent >= RATE_MAX_PER_WINDOW) {
    return json({ error: "rate_limited" }, 429, headers);
  }

  /* Record the attempt before validating, so that a rejected submission still
     counts against the window. Logging only successes would leave the validator
     open to unlimited probing from a single source. */
  await db("submit_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ip_hash: ipHash, form }),
  });

  const result = form === "council" ? validateCouncil(body) : validateLaunch(body);
  if (!result.ok) return json({ error: "invalid", field: result.error }, 422, headers);

  const table = form === "council" ? "council_applications" : "launch_registrations";
  const res = await db(table, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(result.row),
  });

  if (res.status === 409) return json({ ok: true, duplicate: true }, 200, headers);
  if (!res.ok) {
    console.error("insert failed", res.status, await res.text());
    return json({ error: "store_failed" }, 502, headers);
  }

  background(notify(form, result.row));

  if (Math.random() < 0.02) background(rpc("prune_submit_events", {}));

  return json({ ok: true }, 201, headers);
});
