/* Shared submission logic for both council and Launch Day forms.
   ---------------------------------------------------------------
   The browser never talks to the database directly. Everything goes to
   one Supabase Edge Function, which is the only thing holding a key that
   can write. Layers, outermost first:

     1. honeypot field + minimum fill time   (this file)
     2. client-side shape validation          (this file)
     3. Cloudflare Turnstile                  (widget here, verified server-side)
     4. per-IP rate limit                     (edge function)
     5. re-validation against the same rules  (edge function)
     6. RLS: no anon role can write at all    (Postgres)
*/
(function () {
  'use strict';

  var cfg = window.TSC_CONFIG || {};
  var form = document.querySelector('form[data-tsc-form]');
  if (!form) return;

  var kind = form.getAttribute('data-tsc-form');            // "launch" | "council"
  var statusEl = document.getElementById('form-status');
  var submitBtn = form.querySelector('[type="submit"]');
  var submitLabel = submitBtn ? submitBtn.textContent : 'Submit';
  var loadedAt = Date.now();
  var sending = false;

  /* ---------- helpers ---------- */

  function say(kindOfMsg, msg) {
    statusEl.className = 'form-status show ' + kindOfMsg;
    statusEl.textContent = msg;
    statusEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function markBad(names) {
    form.querySelectorAll('.field').forEach(function (f) { f.classList.remove('invalid'); });
    var first = null;
    names.forEach(function (n) {
      var el = form.querySelector('[name="' + n + '"]');
      if (!el) return;
      var wrap = el.closest('.field');
      if (wrap) wrap.classList.add('invalid');
      if (!first) first = el;
    });
    if (first) first.focus();
  }

  function val(fd, name, max) {
    return (fd.get(name) || '').toString().trim().slice(0, max || 200);
  }

  /* Human names for every field, so an error can say what is actually wrong
     instead of asking the applicant to hunt for a highlighted row. */
  var FIELD_LABELS = {
    full_name: 'your full name',
    email: 'your email address',
    phone: 'your phone number',
    university: 'your university',
    year_of_study: 'your year of study',
    branch: 'your branch or major',
    experience: 'where you are starting from',
    experience_level: 'your technical level',
    role_type: 'the kind of seat you want',
    team_first: 'your first-choice team',
    team_second: 'your second-choice team',
    hours_per_week: 'the hours a week you can give',
    why_join: 'why you want this seat',
    relevant_experience: 'your relevant experience',
    what_you_would_build: 'what you would build first',
    leadership_history: 'your leadership history',
    portfolio_url: 'your portfolio link',
    linkedin_url: 'your LinkedIn link',
    on_asu_pathway: 'whether you are on the ASU / Cintana pathway',
    consent: 'the consent box'
  };

  function listOf(names) {
    var parts = names.map(function (n) { return FIELD_LABELS[n] || n.replace(/_/g, ' '); });
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] + ' and ' + parts[1];
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }

  /* selected-state styling on radio cards */
  form.addEventListener('change', function (ev) {
    if (ev.target.type !== 'radio') return;
    var group = form.querySelectorAll('[name="' + ev.target.name + '"]');
    group.forEach(function (r) {
      var card = r.closest('.radio-card');
      if (card) card.classList.toggle('checked', r.checked);
    });
  });

  /* live character counters */
  form.querySelectorAll('textarea[maxlength]').forEach(function (ta) {
    var out = form.querySelector('[data-count-for="' + ta.name + '"]');
    if (!out) return;
    var sync = function () { out.textContent = ta.value.length + ' / ' + ta.maxLength; };
    ta.addEventListener('input', sync);
    sync();
  });

  /* ---------- payload builders ---------- */

  function buildLaunch(fd) {
    return {
      form: 'launch',
      full_name: val(fd, 'full_name', 120),
      email: val(fd, 'email', 160).toLowerCase(),
      university: val(fd, 'university', 8),
      year_of_study: val(fd, 'year_of_study', 8),
      branch: val(fd, 'branch', 120),
      experience: val(fd, 'experience', 20),
      bringing_laptop: !!fd.get('bringing_laptop'),
      dietary: val(fd, 'dietary', 120),
      hear_about: val(fd, 'hear_about', 40),
      interests: val(fd, 'interests', 500),
      on_asu_pathway: val(fd, 'on_asu_pathway', 4),
      consent: !!fd.get('consent')
    };
  }

  function buildCouncil(fd) {
    return {
      form: 'council',
      full_name: val(fd, 'full_name', 120),
      email: val(fd, 'email', 160).toLowerCase(),
      phone: val(fd, 'phone', 24),
      university: val(fd, 'university', 8),
      year_of_study: val(fd, 'year_of_study', 8),
      branch: val(fd, 'branch', 120),

      role_type: val(fd, 'role_type', 20),
      team_first: val(fd, 'team_first', 40),
      team_second: val(fd, 'team_second', 40),

      experience_level: val(fd, 'experience_level', 20),
      hours_per_week: val(fd, 'hours_per_week', 20),

      why_join: val(fd, 'why_join', 1200),
      relevant_experience: val(fd, 'relevant_experience', 1200),
      what_you_would_build: val(fd, 'what_you_would_build', 1200),

      portfolio_url: val(fd, 'portfolio_url', 200),
      linkedin_url: val(fd, 'linkedin_url', 200),

      attending_launch: !!fd.get('attending_launch'),
      leadership_history: val(fd, 'leadership_history', 800),
      on_asu_pathway: val(fd, 'on_asu_pathway', 4),
      consent: !!fd.get('consent')
    };
  }

  var REQUIRED = {
    launch: ['full_name', 'email', 'university', 'year_of_study', 'branch', 'on_asu_pathway'],
    council: ['full_name', 'email', 'university', 'year_of_study', 'branch',
              'role_type', 'team_first', 'hours_per_week', 'why_join', 'relevant_experience',
              'on_asu_pathway']
  };

  /* Allowed values, mirroring the edge function exactly. These are checked by
     membership, never by length — several legitimate values ("1", "AU", "10+")
     are shorter than any sensible minimum, and a length rule silently rejects
     them. Free-text fields keep a minimum length; fixed-choice fields do not. */
  var ENUMS = {
    university:       ['REC', 'SNU', 'AU'],
    year_of_study:    ['1', '2', '3', '4', 'other'],
    experience:       ['none', 'some', 'comfortable'],
    experience_level: ['none', 'some', 'comfortable', 'advanced'],
    role_type:        ['lead', 'associate', 'either', 'board'],
    hours_per_week:   ['1-3', '4-6', '7-10', '10+'],
    team_first:       ['skill_tracks', 'build_nights', 'design_creative', 'platform_infra',
                       'certification_asu', 'industry_alumni', 'pr_outreach'],
    team_second:      ['skill_tracks', 'build_nights', 'design_creative', 'platform_infra',
                       'certification_asu', 'industry_alumni', 'pr_outreach', 'none'],
    on_asu_pathway:   ['yes', 'no']
  };

  var MIN_LENGTH = { why_join: 80, relevant_experience: 60, what_you_would_build: 0 };

  function problems(data) {
    var bad = [];
    REQUIRED[kind].forEach(function (n) {
      var v = data[n];
      if (ENUMS[n]) {
        if (ENUMS[n].indexOf(String(v)) === -1) bad.push(n);
      } else if (!v || String(v).trim().length < 2) {
        bad.push(n);
      }
    });
    /* optional fixed-choice fields: only wrong if supplied and unrecognised */
    Object.keys(ENUMS).forEach(function (n) {
      if (REQUIRED[kind].indexOf(n) !== -1) return;
      var v = data[n];
      if (v && ENUMS[n].indexOf(String(v)) === -1 && bad.indexOf(n) === -1) bad.push(n);
    });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || '')) {
      if (bad.indexOf('email') === -1) bad.push('email');
    }
    Object.keys(MIN_LENGTH).forEach(function (n) {
      if (data[n] !== undefined && data[n].length > 0 && data[n].length < MIN_LENGTH[n]) {
        if (bad.indexOf(n) === -1) bad.push(n);
      }
    });
    ['portfolio_url', 'linkedin_url'].forEach(function (n) {
      if (data[n] && !/^https?:\/\/.+\..+/.test(data[n])) bad.push(n);
    });
    if (!form.querySelector('[name="consent"]').checked) bad.push('consent');
    return bad;
  }

  /* ---------- submit ---------- */

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (sending) return;
    statusEl.className = 'form-status';

    var fd = new FormData(form);

    // honeypot
    if ((fd.get('company') || '').toString().length > 0) {
      say('ok', 'Thanks — that has been recorded.');
      return;
    }
    // humans take longer than this
    if (Date.now() - loadedAt < 4000) {
      say('bad', 'That was quick — take another look and submit again.');
      return;
    }

    var data = kind === 'council' ? buildCouncil(fd) : buildLaunch(fd);
    var bad = problems(data);
    if (bad.length) {
      markBad(bad);
      var shortAnswers = bad.filter(function (n) { return MIN_LENGTH[n] > 0; });
      if (shortAnswers.length === bad.length) {
        say('bad', 'Please expand ' + listOf(shortAnswers) +
                   ' — a few sentences gives the reading panel something to assess.');
      } else {
        say('bad', 'Please check ' + listOf(bad) + ' before submitting.');
      }
      return;
    }

    var endpoint = (cfg.ENROL_ENDPOINT || '').trim();
    if (!endpoint || endpoint.indexOf('YOUR-PROJECT') !== -1) {
      say('bad', 'Submissions are not connected yet. Email ' + (cfg.CONTACT_EMAIL || 'the council') +
                 ' and we will add you by hand.');
      return;
    }

    if (cfg.TURNSTILE_SITE_KEY) {
      var t = form.querySelector('[name="cf-turnstile-response"]');
      data.turnstile_token = t ? t.value : '';
      if (!data.turnstile_token) {
        say('bad', 'Please complete the verification box, then submit again.');
        return;
      }
    }

    sending = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 20000);

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: ctrl.signal
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (r.status === 201 || r.status === 200) {
          var qs = new URLSearchParams({
            'for': kind,
            email: data.email || '',
            dup: r.body.duplicate ? '1' : '0'
          });
          window.location.href = 'thanks.html?' + qs.toString();
          return;
        }
        if (r.status === 429) {
          say('bad', 'Too many submissions from your connection just now. Wait a minute and try again.');
          return;
        }
        if (r.status === 403) {
          say('bad', 'Verification failed. Refresh the page and try once more.');
          return;
        }
        if (r.status === 422 && r.body.field) {
          markBad([r.body.field]);
          say('bad', 'Please check ' + listOf([r.body.field]) + ' — that value was not accepted.');
          return;
        }
        if (r.status === 413) {
          say('bad', 'That submission is longer than the form allows. Shorten the written answers and try again.');
          return;
        }
        /* 500 not_configured / 502 store_failed are our fault, not theirs — say so,
           and make sure the applicant is not left thinking their answers were the problem. */
        say('bad', 'Something on our side is not working — your answers were not saved. ' +
                   'Please email ' + (cfg.CONTACT_EMAIL || 'the council') +
                   ' and we will register you by hand.');
      })
      .catch(function (err) {
        say('bad', err && err.name === 'AbortError'
          ? 'That took too long. Check your connection and try again.'
          : 'Network trouble — check your connection and try again.');
      })
      .then(function () {
        clearTimeout(timer);
        sending = false;
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
        if (window.turnstile && cfg.TURNSTILE_SITE_KEY) window.turnstile.reset();
      });
  });

  /* Turnstile widget, if configured */
  if (cfg.TURNSTILE_SITE_KEY) {
    var slot = document.getElementById('turnstile-slot');
    if (slot) {
      var box = document.createElement('div');
      box.className = 'cf-turnstile';
      box.setAttribute('data-sitekey', cfg.TURNSTILE_SITE_KEY);
      box.setAttribute('data-theme', 'dark');
      slot.appendChild(box);
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    }
  }
})();
