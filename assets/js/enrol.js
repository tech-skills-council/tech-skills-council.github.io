/* Enrolment form → Supabase REST (insert-only, protected by RLS).
   Defence in depth, in order of usefulness:
     1. Row-level security on the table (server side, the real control)
     2. Cloudflare Turnstile, when a site key is configured
     3. Honeypot field no human ever fills
     4. Minimum fill time — bots submit instantly
     5. Client-side validation for correctness, never for security
*/
(function () {
  'use strict';

  var cfg = window.TSC_CONFIG || {};
  var form = document.getElementById('enrol-form');
  if (!form) return;

  var statusEl = document.getElementById('form-status');
  var submitBtn = document.getElementById('enrol-submit');
  var loadedAt = Date.now();

  function say(kind, msg) {
    statusEl.className = 'form-status show ' + kind;
    statusEl.textContent = msg;
  }

  function setInvalid(field, on) {
    var wrap = field.closest('.field');
    if (wrap) wrap.classList.toggle('invalid', !!on);
  }

  function validate(data) {
    var problems = [];
    if (!data.full_name || data.full_name.trim().length < 2) problems.push('full_name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || '')) problems.push('email');
    if (!data.university) problems.push('university');
    if (!data.year_of_study) problems.push('year_of_study');
    if (!data.branch || data.branch.trim().length < 2) problems.push('branch');
    if (!data.consent) problems.push('consent');
    return problems;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    statusEl.className = 'form-status';

    var fd = new FormData(form);
    var data = {
      full_name: (fd.get('full_name') || '').toString().trim(),
      email: (fd.get('email') || '').toString().trim().toLowerCase(),
      university: (fd.get('university') || '').toString(),
      year_of_study: (fd.get('year_of_study') || '').toString(),
      branch: (fd.get('branch') || '').toString().trim(),
      experience: (fd.get('experience') || '').toString(),
      interests: (fd.get('interests') || '').toString().trim().slice(0, 500),
      attending_launch: fd.get('attending_launch') ? true : false,
      council_interest: fd.get('council_interest') ? true : false,
      consent: fd.get('consent') ? true : false
    };

    // honeypot — hidden from humans, irresistible to bots
    if ((fd.get('company') || '').toString().length > 0) {
      say('ok', 'Thanks — your enrolment has been recorded.');
      return;
    }
    // too fast to be a person filling a form
    if (Date.now() - loadedAt < 2500) {
      say('bad', 'That was quick — take a moment and submit again.');
      return;
    }

    form.querySelectorAll('.field').forEach(function (f) { f.classList.remove('invalid'); });
    var problems = validate(data);
    if (problems.length) {
      problems.forEach(function (name) {
        var el = form.querySelector('[name="' + name + '"]');
        if (el) setInvalid(el, true);
      });
      say('bad', 'Some fields need attention — check the highlighted rows.');
      return;
    }

    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.indexOf('YOUR-PROJECT') !== -1) {
      say('bad', 'Enrolment is not connected yet. Email ' + (cfg.CONTACT_EMAIL || 'the council') + ' and we will add you manually.');
      return;
    }

    var token = '';
    var tsField = form.querySelector('[name="cf-turnstile-response"]');
    if (cfg.TURNSTILE_SITE_KEY) {
      token = tsField ? tsField.value : '';
      if (!token) { say('bad', 'Please complete the verification box and submit again.'); return; }
    }

    var payload = {
      full_name: data.full_name,
      email: data.email,
      university: data.university,
      year_of_study: data.year_of_study,
      branch: data.branch,
      experience: data.experience || null,
      interests: data.interests || null,
      attending_launch: data.attending_launch,
      council_interest: data.council_interest,
      source: 'website',
      turnstile_token: token || null
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    fetch(cfg.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + (cfg.ENROL_TABLE || 'enrolments'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (res.ok) {
          form.reset();
          say('ok', 'You are on the list. A confirmation is on its way to ' + data.email + ' — check spam if it does not land in ten minutes.');
          return;
        }
        return res.text().then(function (body) {
          if (res.status === 409 || /duplicate/i.test(body)) {
            say('ok', 'You are already enrolled with that email — nothing more to do.');
            return;
          }
          say('bad', 'That did not go through. Try again, or email ' + (cfg.CONTACT_EMAIL || 'the council') + '.');
        });
      })
      .catch(function () {
        say('bad', 'Network trouble — check your connection and try again.');
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enrol';
        if (window.turnstile && cfg.TURNSTILE_SITE_KEY) window.turnstile.reset();
      });
  });
})();
