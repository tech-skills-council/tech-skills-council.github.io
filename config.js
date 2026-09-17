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
  // Postponed 17 September 2026 — was Friday 18 September, 9:00 PM IST.
  // Pushed back a week with exams running across campuses; the new date
  // goes here the moment it's confirmed. Everything below is written into
  // the page at runtime, so this file is the single place to change it.
  // Leave LAUNCH_DATE_LABEL empty and the site says "to be announced"
  // everywhere, including both posters and the postponement notice.
  LAUNCH_DATE_LABEL: '',

  // Short form used where the full date will not fit (poster caption,
  // narrow stat cells). Leave empty to fall back to the full label.
  LAUNCH_DATE_SHORT: '',

  // Start time, e.g. '2:00 PM'. Empty until confirmed.
  LAUNCH_TIME_LABEL: '',

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

  // Addresses permitted to register, by domain — used only if Google
  // sign-in (REQUIRE_LOGIN) is actually active, which needs SUPABASE_ANON_KEY
  // filled in below. The real, always-on gate is the plain email-domain
  // check in assets/js/forms.js and the edge function's
  // UNIVERSITY_EMAIL_DOMAINS list — keep all three in sync by hand.
  ALLOWED_EMAIL_DOMAINS: ['rajalakshmi.edu.in', 'snu.edu.in', 'anurag.edu.in', 'chitkara.edu.in'],

  // ---- Council applications -------------------------------------------
  // The board wants council applications closed until after Orientation,
  // so the page shows a "opening soon" notice and points people at the
  // orientation instead. Flip to true to reopen — the form is untouched
  // underneath, nothing needs rebuilding.
  COUNCIL_APPLICATIONS_OPEN: false
};
