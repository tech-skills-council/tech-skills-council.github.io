/* Google sign-in gate for the registration and application forms.
   ---------------------------------------------------------------
   Why this exists: the club is open to pathway students only, and a
   typed-in email address proves nothing — anyone can type a classmate's.
   Signing in with Google proves the person actually controls the address,
   and the address itself is then taken from a token the browser cannot
   forge, not from the form.

   The gate is deliberately shallow. It hides the form and shows a sign-in
   panel; it is NOT the security boundary. The edge function re-verifies
   the token and re-checks the domain on every submission, because anything
   this file does can be undone from a console.

   Kill switch: TSC_CONFIG.REQUIRE_LOGIN. Set it to false and this file
   does nothing at all — the form works exactly as it did before. If Google
   sign-in breaks an hour before the session, that one flag restores
   registration without a code change.
*/
(function () {
  'use strict';

  var cfg = window.TSC_CONFIG || {};
  var form = document.querySelector('form[data-tsc-form]');
  if (!form) return;

  /* ---------- the kill switch, checked before anything else ---------- */
  if (!cfg.REQUIRE_LOGIN) return;

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    /* Misconfigured or the vendored client failed to load. Fail OPEN rather
       than locking everyone out of a form that otherwise works — the edge
       function is still enforcing everything that matters. */
    console.warn('auth: not configured or client missing; falling back to the open form.');
    return;
  }

  var client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.TSC_AUTH = { client: client, session: null };

  /* Domains permitted to register. Empty list = any signed-in Google account,
     which is still a real improvement over an unverified typed address. */
  var DOMAINS = (cfg.ALLOWED_EMAIL_DOMAINS || []).map(function (d) {
    return String(d).trim().toLowerCase().replace(/^@/, '');
  }).filter(Boolean);

  function domainOf(email) {
    var at = String(email || '').lastIndexOf('@');
    return at === -1 ? '' : email.slice(at + 1).toLowerCase();
  }

  function isAllowed(email) {
    if (!DOMAINS.length) return true;
    return DOMAINS.indexOf(domainOf(email)) !== -1;
  }

  function domainList() {
    return DOMAINS.map(function (d) { return '@' + d; }).join(', ');
  }

  /* ---------- the panel that stands in front of the form ---------- */

  var panel = document.createElement('div');
  panel.className = 'auth-gate';
  panel.id = 'auth-gate';

  function render(state, detail) {
    if (state === 'signed-out') {
      panel.innerHTML =
        '<span class="auth-eyebrow">Members only</span>' +
        '<h3>Sign in to register</h3>' +
        '<p>Orientation is open to pathway students for now. Sign in with your ' +
        'university Google account and the form below unlocks.' +
        (DOMAINS.length
          ? ' Accepted addresses end in <b>' + domainList() + '</b>.'
          : '') +
        '</p>' +
        '<button type="button" class="btn big" id="auth-signin">' +
          '<svg viewBox="0 0 48 48" aria-hidden="true" width="18" height="18">' +
            '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/>' +
            '<path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.7 7l7.6 5.9c4.4-4.1 6.8-10.972 6.8-17.4z"/>' +
            '<path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.8-6.1z"/>' +
            '<path fill="#34A853" d="M24 48c6.2 0 11.5-2.1 15.3-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.7 2.3-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>' +
          '</svg>' +
          'Continue with Google' +
        '</button>' +
        '<p class="auth-note">We only read your name and email address. Nothing is posted anywhere.</p>';
      panel.querySelector('#auth-signin').addEventListener('click', signIn);
      return;
    }

    if (state === 'wrong-domain') {
      panel.innerHTML =
        '<span class="auth-eyebrow bad">Not a pathway address</span>' +
        '<h3>That account can\'t register yet</h3>' +
        '<p>You signed in as <b>' + esc(detail) + '</b>, which isn\'t a recognised pathway address. ' +
        (DOMAINS.length ? 'Please use the account ending in <b>' + domainList() + '</b>. ' : '') +
        'If you are on the pathway and this looks wrong, email ' +
        '<a href="mailto:' + esc(cfg.CONTACT_EMAIL || '') + '">' + esc(cfg.CONTACT_EMAIL || 'the council') + '</a> ' +
        'and we will add you by hand.</p>' +
        '<button type="button" class="btn ghost" id="auth-signout">Use a different account</button>';
      panel.querySelector('#auth-signout').addEventListener('click', signOut);
      return;
    }

    if (state === 'signed-in') {
      panel.innerHTML =
        '<span class="auth-eyebrow ok">Verified</span>' +
        '<h3>Signed in as ' + esc(detail) + '</h3>' +
        '<p>Your name and email are filled in below and locked to this account. ' +
        'Everything else is up to you.</p>' +
        '<button type="button" class="btn ghost" id="auth-signout">Not you? Sign out</button>';
      panel.querySelector('#auth-signout').addEventListener('click', signOut);
      return;
    }

    if (state === 'error') {
      panel.innerHTML =
        '<span class="auth-eyebrow bad">Sign-in problem</span>' +
        '<h3>Couldn\'t sign you in</h3>' +
        '<p>' + esc(detail || 'Something went wrong on the way back from Google.') +
        ' Try again, or email <a href="mailto:' + esc(cfg.CONTACT_EMAIL || '') + '">' +
        esc(cfg.CONTACT_EMAIL || 'the council') + '</a> and we will register you by hand.</p>' +
        '<button type="button" class="btn big" id="auth-signin">Try again</button>';
      panel.querySelector('#auth-signin').addEventListener('click', signIn);
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function signIn() {
    var btn = panel.querySelector('#auth-signin');
    if (btn) { btn.disabled = true; btn.textContent = 'Opening Google…'; }
    client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: { prompt: 'select_account' }
      }
    }).then(function (r) {
      if (r && r.error) render('error', r.error.message);
    });
  }

  function signOut() {
    client.auth.signOut().then(function () { window.location.reload(); });
  }

  /* ---------- wiring the form to the session ---------- */

  function lockIdentityFields(session) {
    var email = session.user.email || '';
    var name = (session.user.user_metadata &&
      (session.user.user_metadata.full_name || session.user.user_metadata.name)) || '';

    var emailEl = form.querySelector('[name="email"]');
    if (emailEl) {
      emailEl.value = email;
      emailEl.readOnly = true;
      emailEl.setAttribute('aria-readonly', 'true');
      emailEl.classList.add('is-locked');
      var hint = emailEl.parentElement && emailEl.parentElement.querySelector('.hint');
      if (hint) hint.textContent = 'Taken from your Google account — this is where the joining link goes.';
    }

    var nameEl = form.querySelector('[name="full_name"]');
    if (nameEl && name && !nameEl.value) nameEl.value = name;
  }

  function show(signedIn) {
    form.hidden = !signedIn;

    /* Hidden fields must not stay required, or a browser can refuse to submit
       because of a control the user cannot see or reach.
       The two passes must select differently: clearing `required` also stops
       the element matching `[required]`, so restoring has to look for the
       marker left behind rather than for the attribute that was just removed. */
    if (!signedIn) {
      form.querySelectorAll('[required]').forEach(function (el) {
        el.dataset.wasRequired = '1';
        el.required = false;
      });
    } else {
      form.querySelectorAll('[data-was-required]').forEach(function (el) {
        el.required = true;
        delete el.dataset.wasRequired;
      });
    }
  }

  function apply(session) {
    window.TSC_AUTH.session = session || null;

    if (!session) { render('signed-out'); show(false); return; }

    var email = session.user.email || '';
    if (!isAllowed(email)) { render('wrong-domain', email); show(false); return; }

    render('signed-in', email);
    lockIdentityFields(session);
    show(true);
  }

  /* Insert the panel where the form is, then hide the form until we know. */
  form.parentNode.insertBefore(panel, form);
  show(false);
  render('signed-out');

  /* An OAuth return lands back here with the session in the URL. */
  client.auth.getSession().then(function (r) {
    apply(r && r.data ? r.data.session : null);
    /* Tidy the tokens out of the address bar so the page can be reloaded
       or shared without carrying a session in the URL. */
    if (window.location.hash && window.location.hash.indexOf('access_token') !== -1) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }).catch(function (e) {
    render('error', e && e.message);
    show(false);
  });

  client.auth.onAuthStateChange(function (_event, session) { apply(session); });
})();
