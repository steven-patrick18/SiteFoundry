/* SiteFoundry sf.js — first-party beacon (§11).
 * < 5 KB, no dependencies. Events: pageview, cta_click, outbound_click,
 * push_prompt_shown, push_subscribed, lead_submit -> POST {track}/api/v1/public/track
 * via navigator.sendBeacon (text/plain simple request, no preflight).
 * Also appends incoming UTMs + click ids to outbound store links so the
 * destination's own analytics sees the original ad source. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var SITE_KEY = script.getAttribute('data-site-key') || '';
  var TRACK_URL = script.getAttribute('data-track') || '';
  var DEST = script.getAttribute('data-dest') || '';
  var SESSION_MS = 30 * 60 * 1000; // 30-min sliding window

  /* ── session id ── */
  function sessionId() {
    try {
      var raw = localStorage.getItem('sf_session');
      var now = Date.now();
      var s = raw ? JSON.parse(raw) : null;
      if (!s || now - s.at > SESSION_MS) {
        s = { id: 'sf_' + now.toString(36) + Math.random().toString(36).slice(2, 10), at: now };
      }
      s.at = now;
      localStorage.setItem('sf_session', JSON.stringify(s));
      return s.id;
    } catch (e) {
      return 'sf_anon';
    }
  }

  /* ── landing UTMs persist for the session so every event is attributed ── */
  function utms() {
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    try {
      var current = new URLSearchParams(location.search);
      var hasIncoming = keys.some(function (k) { return current.has(k); });
      if (hasIncoming) {
        var fresh = {};
        keys.forEach(function (k) { if (current.get(k)) fresh[k] = current.get(k); });
        sessionStorage.setItem('sf_utm', JSON.stringify(fresh));
        return fresh;
      }
      return JSON.parse(sessionStorage.getItem('sf_utm') || '{}');
    } catch (e) {
      return {};
    }
  }

  function send(event, meta) {
    if (!TRACK_URL || !SITE_KEY) return;
    var payload = {
      site_key: SITE_KEY,
      event: event,
      session_id: sessionId(),
      path: location.pathname,
      referrer: document.referrer || undefined,
      meta: meta || undefined,
    };
    var u = utms();
    for (var k in u) payload[k] = u[k];
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(TRACK_URL, body); // text/plain — simple request
    } else {
      try { fetch(TRACK_URL, { method: 'POST', body: body, keepalive: true }); } catch (e) {}
    }
  }

  /* ── UTM passthrough to the destination store (§11) ── */
  function passthrough() {
    var params = new URLSearchParams(location.search);
    var carry = new URLSearchParams();
    params.forEach(function (value, key) {
      if (key.indexOf('utm_') === 0 || key === 'gclid' || key === 'msclkid' || key === 'fbclid') {
        carry.set(key, value);
      }
    });
    if (![].slice.call(carry.keys()).length) return;
    document.querySelectorAll('a[data-outbound]').forEach(function (a) {
      try {
        var url = new URL(a.href);
        carry.forEach(function (value, key) {
          if (!url.searchParams.has(key)) url.searchParams.set(key, value);
        });
        a.href = url.toString();
      } catch (e) {}
    });
  }

  function destHost() {
    try { return new URL(DEST).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  window.sfTrack = send; // used by the on-site search (and future widgets)

  onReady(function () {
    passthrough();
    send('pageview');

    /* cta_click on styled CTAs; outbound_click on links to the store */
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a) return;
      if (a.classList.contains('cta')) send('cta_click', { text: (a.textContent || '').trim().slice(0, 80) });
      if (a.hasAttribute('data-outbound')) {
        var host = '';
        try { host = new URL(a.href).hostname.replace(/^www\./, ''); } catch (err) {}
        if (!destHost() || host === destHost()) {
          send('outbound_click', {
            product: a.getAttribute('data-product') || undefined,
            target_url: a.href,
          });
        }
      }
    }, { capture: true, passive: true });

    /* consented lead capture -> POST /public/lead (§10) */
    var LEAD_URL = TRACK_URL ? TRACK_URL.replace(/\/track$/, '/lead') : '';
    document.querySelectorAll('form[data-sf-lead]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var consent = form.querySelector('input[name=consent]');
        if (!consent || !consent.checked) return; // consent is mandatory
        var fields = {};
        [].forEach.call(form.querySelectorAll('input[name]'), function (el) {
          if (el.name !== 'consent' && el.value) fields[el.name] = el.value;
        });
        var payload = { site_key: SITE_KEY, fields: fields, consent: true };
        var u = utms();
        for (var k in u) payload[k] = u[k];
        var done = function () {
          send('lead_submit', { form: 'lead' });
          form.innerHTML =
            '<p style="text-align:center;font-weight:600">Thank you! We’ll be in touch shortly.</p>';
        };
        if (LEAD_URL) {
          fetch(LEAD_URL, { method: 'POST', body: JSON.stringify(payload), keepalive: true })
            .then(done)
            .catch(done); // never trap the visitor on a network hiccup
        } else {
          done();
        }
      });
    });

    /* PushVault events (§11) */
    window.addEventListener('pushvault:prompt_shown', function () { send('push_prompt_shown'); });
    window.addEventListener('pushvault:subscribed', function () { send('push_subscribed'); });
  });
})();
