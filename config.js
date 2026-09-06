/* Public site configuration.
   Nothing secret belongs in this file — it ships to every visitor.
   The Supabase anon key is designed to be public; row-level security
   (supabase/schema.sql) is what actually protects the data.        */
window.TSC_CONFIG = {
  // Supabase project — fill both in after creating the project
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-PUBLISHABLE-ANON-KEY',

  // Table that receives enrolments
  ENROL_TABLE: 'enrolments',

  // Cloudflare Turnstile site key. Leave empty to run without the widget
  // (the honeypot and rate limiting still apply).
  TURNSTILE_SITE_KEY: '',

  // Shown on the site
  CONTACT_EMAIL: 'techskillscouncil@gmail.com',

  // Launch Day — set once the Cintana Alliance approval clears
  LAUNCH_DATE_LABEL: 'Date to be announced',
  LAUNCH_TIME_LABEL: 'Timing to be announced'
};
