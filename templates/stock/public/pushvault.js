/* PushVault capture snippet (SiteFoundry integration contract).
 * Soft, NON-BLOCKING opt-in banner — never a gate over content (§1: ad
 * account health). Emits `pushvault:prompt_shown` / `pushvault:subscribed`
 * window events, which sf.js records into the funnel. Registers /pv-sw.js.
 * Subscriber delivery to the PushVault backend attaches here when the
 * PushVault product ships (property key is already wired through). */
(function () {
  'use strict';
  var script = document.currentScript;
  var KEY = script && script.getAttribute('data-property-key');
  if (!KEY || !('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (Notification.permission === 'denied') return;

  var SNOOZE_KEY = 'pv_snooze';
  var SNOOZE_MS = 7 * 24 * 3600 * 1000;
  try {
    var snoozed = localStorage.getItem(SNOOZE_KEY);
    if (snoozed && Date.now() - Number(snoozed) < SNOOZE_MS) return;
  } catch (e) {}

  var swPath = (script.getAttribute('src') || '/pushvault.js').replace(/pushvault\.js.*$/, 'pv-sw.js');

  function emit(name) {
    try { window.dispatchEvent(new CustomEvent(name)); } catch (e) {}
  }

  function subscribed() {
    navigator.serviceWorker.register(swPath).then(function () {
      emit('pushvault:subscribed');
      /* TODO(PushVault backend): POST the PushSubscription with KEY */
    }).catch(function () {});
  }

  function showBanner() {
    if (Notification.permission === 'granted') return; // already opted in
    var banner = document.createElement('div');
    banner.setAttribute('role', 'dialog');
    banner.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:9999;max-width:340px;' +
      'background:#fff;border:1px solid #e5e7eb;border-radius:12px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.18);padding:14px 16px;' +
      'font:14px/1.45 system-ui,sans-serif;color:#111827';
    banner.innerHTML =
      '<div style="font-weight:700;margin-bottom:4px">🔔 Get deal alerts</div>' +
      '<div style="color:#4b5563;margin-bottom:10px">Be first to know when prices drop. No spam.</div>' +
      '<button data-pv-allow style="background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:8px 18px;font-weight:600;cursor:pointer">Allow</button>' +
      '<button data-pv-no style="background:none;border:0;color:#6b7280;padding:8px 12px;cursor:pointer">No thanks</button>';
    document.body.appendChild(banner);
    emit('pushvault:prompt_shown');

    banner.querySelector('[data-pv-allow]').addEventListener('click', function () {
      banner.remove();
      Notification.requestPermission().then(function (permission) {
        if (permission === 'granted') subscribed();
        else try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch (e) {}
      });
    });
    banner.querySelector('[data-pv-no]').addEventListener('click', function () {
      banner.remove();
      try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch (e) {}
    });
  }

  // soft trigger: after 6s or 30% scroll, whichever comes first
  var shown = false;
  function maybeShow() {
    if (shown) return;
    shown = true;
    showBanner();
  }
  setTimeout(maybeShow, 6000);
  window.addEventListener('scroll', function onScroll() {
    var scrolled = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
    if (scrolled > 0.3) {
      window.removeEventListener('scroll', onScroll);
      maybeShow();
    }
  }, { passive: true });
})();
