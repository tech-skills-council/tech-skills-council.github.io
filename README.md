# Tech & Skills Council — website

Public site and the two front doors (Launch Day registration, council applications) for the
Tech & Skills Council, an official programme of the ASU Cintana Alliance spanning REC,
Shiv Nadar University and Anurag University.

**Learn by Building.** — live at https://tech-skills-council.github.io/

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Hand-written HTML/CSS/JS, no framework, no build step | Leads change every year; nobody should inherit a toolchain. Edit a file, push, it's live. |
| Hosting | GitHub Pages from `main` | Free, org-owned, HTTPS, redeploys on push. |
| Backend | One Supabase Edge Function + Postgres | The browser never touches the database. |
| Anti-abuse | Turnstile + honeypot + timing + per-IP rate limit + RLS | Layered; the layers that matter run server-side. |
| CI | GitHub Actions secret guard | Fails the build only on *real* credentials. |

## Layout

```
index.html            gap · programme · launch day · benefits · tiers · council ·
                      calendar · roadmap · badging · posters · conduct · FAQ · two doors
launch.html           Launch Day registration — short form
council.html          Council application — long form, written answers
enrol.html            redirect to launch.html (old links)
404.html
config.js             PUBLIC config — endpoint URL, Turnstile site key, contact email
assets/css/main.css   all styles, including the custom cursor
assets/js/main.js     opening animation, scroll reveal, ticker, cursor
assets/js/forms.js    validation + submission for BOTH forms
assets/img/posters/   print-ready A4 posters with live QR codes
supabase/schema.sql   both tables, rate-limit table, RLS lockdown — run once
supabase/functions/enrol/  the only thing that can write to the database
.github/workflows/guard.yml  secret scan
```

## Setup

### 1. Database

Supabase → SQL Editor → paste `supabase/schema.sql` → run.

RLS is enabled with **no policies at all**, so the anon key can neither read nor write.
That is deliberate: every submission goes through the edge function, which holds the
service-role key server-side. Council members read submissions in the dashboard.

### 2. Edge function

```bash
supabase functions deploy enrol --no-verify-jwt
supabase secrets set SERVICE_ROLE_KEY=... IP_SALT=<long random string>
# optional but recommended:
supabase secrets set TURNSTILE_SECRET=...
supabase secrets set RESEND_API_KEY=... NOTIFY_EMAIL=techskillscouncil@gmail.com
```

Then put the function URL into `config.js` as `ENROL_ENDPOINT`, and the Turnstile **site**
key (public) as `TURNSTILE_SITE_KEY`. Without `RESEND_API_KEY` everything still works —
submissions save, you just don't get the email.

### 3. Fill in the rest of `config.js`

`LAUNCH_DATE_LABEL` / `LAUNCH_TIME_LABEL` once the Cintana Alliance approval clears.
Leave them empty and the site says "to be announced" everywhere, including on both posters.

## Load and abuse handling

| Layer | Where | Stops |
| --- | --- | --- |
| Honeypot + 4s minimum fill time | browser | Naive bots |
| Shape validation | browser | Typos, before a round trip |
| Turnstile | browser + function | Scripted submissions |
| Rate limit — 5 per 10 min per hashed IP | function | Floods from one source |
| Strict re-validation | function | Hand-crafted requests |
| CHECK constraints + unique email | Postgres | Bad or duplicate rows |
| RLS with zero policies | Postgres | Any direct write from a browser |

Edge functions scale horizontally and Postgres handles the concurrency — a few hundred
people registering at once during a poster push is not a problem. IPs are stored only as
salted SHA-256 hashes, never raw.

The realistic failure mode is the free Supabase project pausing after a week of inactivity.
Open the dashboard once before Launch Day.

## Data protection

Both tables hold personal data, and the council application holds written answers people
wrote in confidence. Per the charter: store securely, access only from the team that needs
it, never share outside the council without consent, delete on request. Keep the Supabase
project's member list short.

## Local

```bash
python3 -m http.server 8000
```

## Brand

`:root` at the top of `assets/css/main.css`. ASU Maroon `#8C1D40`, ASU Gold `#FFC627`,
black, white — roughly 80% of any surface. Display: Archivo (standing in for ASU's
Neue Haas Grotesk); body: the Arial/Helvetica stack ASU specifies for web.

## Motion & accessibility

The opening animation plays once per browser session, is skippable with click or Escape,
and — like the scroll reveals, the ticker and the custom cursor — is disabled entirely
under `prefers-reduced-motion`. The custom cursor is also off on touch devices.
