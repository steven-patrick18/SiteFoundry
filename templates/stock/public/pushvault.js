/* PushVault snippet — M3 placeholder.
 * The real pushvault.js is delivered by the PushVault product (sibling spec)
 * and replaces this file during install once the integration lands in M5.
 * It must register /pv-sw.js and emit pushvault:prompt_shown /
 * pushvault:subscribed window events for sf.js to record. */
(function () {
  'use strict';
  var script = document.currentScript;
  var key = script && script.getAttribute('data-property-key');
  if (!key || !('serviceWorker' in navigator)) return;
  /* Real prompt/subscribe flow arrives with PushVault (M5). */
})();
