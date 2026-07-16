/* SiteFoundry sf.js — M3 stub.
 * Does UTM passthrough on outbound links now; the full first-party beacon
 * (pageview/cta_click/outbound_click/push events -> /public/track) lands
 * with Milestone M4 and replaces this file at build time. */
(function () {
  'use strict';
  var qs = window.location.search;
  if (!qs || qs.length < 2) return;
  var incoming = new URLSearchParams(qs);
  var utm = new URLSearchParams();
  incoming.forEach(function (value, key) {
    if (key.indexOf('utm_') === 0 || key === 'gclid' || key === 'msclkid' || key === 'fbclid') {
      utm.set(key, value);
    }
  });
  if (![...utm.keys()].length) return;
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('a[data-outbound]').forEach(function (a) {
      try {
        var url = new URL(a.href);
        utm.forEach(function (value, key) {
          if (!url.searchParams.has(key)) url.searchParams.set(key, value);
        });
        a.href = url.toString();
      } catch (e) {
        /* ignore malformed hrefs */
      }
    });
  });
})();
