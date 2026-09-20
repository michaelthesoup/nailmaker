"use strict";

// ----------------------------------------------------------------
// Hold-to-repeat buttons. Press once for a single step. Keep holding
// and it starts repeating on its own, getting faster the longer you
// hold it down, so you don't have to click fifty times to move a
// number a long way.
// ----------------------------------------------------------------

function setupRepeatButton(btn, action) {
  var repeatTimeout = null;
  var currentDelay = 90; // brief pause before the first repeat
  var minDelay = 25; // fastest it will ever repeat
  var speedUpFactor = 0.7; // get fast quickly while the button is held
  var held = false;
  var heldSince = 0;
  var FAST_MULTIPLIER_AFTER_MS = 5000; // after holding this long, each tick fires 3x instead of 1x
  var FAST_MULTIPLIER_COUNT = 3;

  function scheduleNext() {
    repeatTimeout = setTimeout(function () {
      if (btn.disabled) {
        stop();
        return;
      }
      var heldFor = Date.now() - heldSince;
      var steps = heldFor >= FAST_MULTIPLIER_AFTER_MS ? FAST_MULTIPLIER_COUNT : 1;
      for (var i = 0; i < steps; i++) action();
      currentDelay = Math.max(minDelay, currentDelay * speedUpFactor);
      scheduleNext();
    }, currentDelay);
  }

  function start(e) {
    if (e.button !== undefined && e.button !== 0) return; // left click / primary touch only
    if (btn.disabled) return;
    held = true;
    heldSince = Date.now();
    action(); // do the first step right away
    currentDelay = 90;
    scheduleNext();
  }

  function stop() {
    held = false;
    clearTimeout(repeatTimeout);
    repeatTimeout = null;
  }

  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointerleave", stop);
  btn.addEventListener("pointercancel", stop);

  // Keyboard users (Enter/Space on a focused button) just get a single
  // step per press, which is the normal expected behavior.
  btn.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && !held) {
      action();
    }
  });
}
