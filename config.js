/* Public site configuration.
   Nothing secret belongs in this file — it ships to every visitor.
   The site never talks to the database directly; it posts to the edge
   function below, which is the only thing holding a key that can write. */
window.TSC_CONFIG = {
  // Supabase Edge Function that receives BOTH forms.
  // Looks like: https://<project-ref>.supabase.co/functions/v1/enrol
  ENROL_ENDPOINT: 'https://smvjvrwhbsvpnwdoastl.supabase.co/functions/v1/enrol',

  // Cloudflare Turnstile site key (public by design).
  // Leave empty to run without the widget — the other layers still apply.
  TURNSTILE_SITE_KEY: '0x4AAAAAAEqnp_LkQWcPsu50',

  CONTACT_EMAIL: 'techskillscouncil@gmail.com',
  SITE_URL: 'https://tech-skills-council.github.io',

  // ---- Launch Day ----------------------------------------------------
  // Date confirmed 7 September 2026. Everything below is written into the
  // page at runtime, so this file is the single place to change any of it.
  LAUNCH_DATE_LABEL: 'Friday, 18 September 2026',

  // Short form used where the full date will not fit (poster caption,
  // narrow stat cells). Leave empty to fall back to the full label.
  LAUNCH_DATE_SHORT: '18 Sep 2026',

  // Start time, e.g. '2:00 PM'. Empty until confirmed.
  LAUNCH_TIME_LABEL: '9:00 PM IST',

  // How long the session runs, as displayed. Launch Day is an opening
  // session plus one short guided activity — not a full-day build.
  LAUNCH_DURATION_LABEL: '~2 hrs',

  // Fully online. The joining link is emailed after registration — it is
  // deliberately NOT published, so only registered pathway students get in.
  LAUNCH_FORMAT: 'online',

  // ---- Google sign-in -------------------------------------------------
  // THE KILL SWITCH. Set to false and the forms work exactly as they did
  // before sign-in existed — no gate, no dependency on Google. If OAuth
  // breaks an hour before the session, flip this, push, and registration
  // keeps working. Nothing else needs to change.
  REQUIRE_LOGIN: true,

  // Supabase project URL and anon key. The anon key is publishable by
  // design: RLS denies the anon role every table, the reporting views had
  // their anon grants revoked, and the only write path is the edge
  // function, which holds the service-role key server-side.
  SUPABASE_URL: 'https://smvjvrwhbsvpnwdoastl.supabase.co',
  SUPABASE_ANON_KEY: '',

  // Addresses permitted to register, by domain. Arjun is supplying the
  // authoritative list. An EMPTY list means any signed-in Google account
  // is accepted — still a real improvement, because the address is then
  // proven rather than typed. Add entries here and push; no redeploy.
  // The edge function enforces the same list server-side via the
  // ALLOWED_EMAIL_DOMAINS secret, which is the one that actually counts.
  ALLOWED_EMAIL_DOMAINS: []
};
