/* Public site configuration.
   Nothing secret belongs in this file — it ships to every visitor.
   The site never talks to the database directly; it posts to the edge
   function below, which is the only thing holding a key that can write. */
window.TSC_CONFIG = {
  // Supabase Edge Function that receives BOTH forms.
  // Looks like: https://<project-ref>.supabase.co/functions/v1/enrol
  ENROL_ENDPOINT: 'https://YOUR-PROJECT.supabase.co/functions/v1/enrol',

  // Cloudflare Turnstile site key (public by design).
  // Leave empty to run without the widget — the other layers still apply.
  TURNSTILE_SITE_KEY: '',

  CONTACT_EMAIL: 'techskillscouncil@gmail.com',
  SITE_URL: 'https://tech-skills-council.github.io',

  // Launch Day — fill in once the Cintana Alliance approval clears
  LAUNCH_DATE_LABEL: '',
  LAUNCH_TIME_LABEL: ''
};
