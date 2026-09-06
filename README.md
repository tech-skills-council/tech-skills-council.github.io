# Tech & Skills Council — website

The public site and enrolment front door for the Tech & Skills Council, an official programme of the
ASU Cintana Alliance spanning REC, Shiv Nadar University and Anurag University.

**Learn by Building.**

---

## Stack, and why

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Hand-written HTML/CSS/JS, no framework, no build step | A council whose leads change every year should not inherit a toolchain. Edit a file, push, it's live. |
| Hosting | GitHub Pages | Free, ties to the council's own GitHub organisation, HTTPS by default, deploys on push. |
| Backend | Supabase (Postgres + REST) | Free tier, real database, row-level security, and a dashboard the council can actually use. No server to run. |
| Anti-abuse | RLS + Cloudflare Turnstile + honeypot + timing check | Layered, and the layer that matters (RLS) is server-side. |
| CI/CD | GitHub Actions | Deploys on push to `main`, and fails the build if a service-role key is ever committed. |

## Repository layout

```
index.html                     one-page site: problem, programme, launch day, benefits, tiers, council, FAQ
enrol.html                     enrolment form
404.html
config.js                      PUBLIC config — Supabase URL, anon key, contact email, launch date labels
assets/css/main.css            all styles
assets/js/main.js              opening animation, scroll reveal, ticker
assets/js/enrol.js             form validation and submission
assets/img/                    logo (dark + light), favicon
supabase/schema.sql            table, constraints, indexes, RLS policies — run once
supabase/functions/enrol/      optional edge function for server-side Turnstile verification
tools/build-preview.mjs        inlines CSS/JS into one file for previewing
.github/workflows/deploy.yml   GitHub Pages deploy
```

## Setup

### 1. Put it on GitHub

```bash
cd tsc-website
git init -b main
git add .
git commit -m "Tech & Skills Council website"
git remote add origin git@github.com:<ORG-OR-USERNAME>/tsc-website.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: GitHub Actions**. The workflow deploys on every push to `main`.
The site lands at `https://<org-or-username>.github.io/tsc-website/`.

Prefer a bare domain? Name the repo `<org-or-username>.github.io` instead, or add a `CNAME` file with a custom domain.

### 2. Create the database

1. Create a free project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → run.
3. Settings → API → copy the **Project URL** and the **anon / publishable key**.
4. Paste both into `config.js`, commit, push.

The anon key is meant to be public. What protects the data is the RLS policy in `schema.sql`:
anonymous visitors can `INSERT` and nothing else — there is no `SELECT` policy, so the table cannot be
read back with that key. Council members read enrolments in the Supabase dashboard.

**Never commit the service-role key.** The deploy workflow fails the build if it finds one.

### 3. Turn on Turnstile (optional but recommended)

Create a free Cloudflare Turnstile widget, put the **site key** in `config.js`. The widget then renders on the
enrolment form. For true server-side verification, deploy `supabase/functions/enrol`, point `assets/js/enrol.js`
at the function URL instead of the REST endpoint, and drop the `anon can enrol` policy so the function is the
only way in.

### 4. Fill in the rest of `config.js`

- `CONTACT_EMAIL` — the council's Gmail
- `LAUNCH_DATE_LABEL` / `LAUNCH_TIME_LABEL` — once the Cintana Alliance approval clears

## Running it locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Single-file preview (for pasting somewhere that takes one HTML document):

```bash
node tools/build-preview.mjs index.html preview.html
```

## Data protection

Enrolment records are personal data belonging to students. Per the council's charter:

- store them securely and access them only from the team that needs them
- never share them outside the council without explicit member consent
- delete a member's record on request

Keep the Supabase project's members list tight — the fewer people with dashboard access, the better.

## Editing content

Everything is plain HTML. Copy lives in `index.html` and `enrol.html`; nothing is generated. The palette and
type live in the `:root` block at the top of `assets/css/main.css`:

- ASU Maroon `#8C1D40`, ASU Gold `#FFC627`, black, white — roughly 80% of any surface
- Display: Archivo (stands in for ASU's Neue Haas Grotesk); body: the Arial/Helvetica stack ASU specifies for web

## Accessibility & motion

The opening animation plays once per browser session, is skippable with click or Escape, and is disabled entirely
for anyone with reduced-motion preferences — as are scroll reveals and the ticker.
