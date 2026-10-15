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
  var ACCELERATION_START_MS = 10000;
  var ACCELERATION_INTERVAL_MS = 2000;

  function scheduleNext() {
    repeatTimeout = setTimeout(function () {
      if (btn.disabled) {
        stop();
        return;
      }
      var heldFor = Date.now() - heldSince;
      var acceleration = Math.max(0, Math.floor((heldFor - ACCELERATION_START_MS) / ACCELERATION_INTERVAL_MS));
      var steps = Math.pow(2, acceleration);
      action(steps);
      currentDelay = Math.max(minDelay, currentDelay * speedUpFactor);
      scheduleNext();
    }, currentDelay);
  }

  function start(e) {
    if (e.button !== undefined && e.button !== 0) return; // left click / primary touch only
    if (btn.disabled) return;
    held = true;
    heldSince = Date.now();
    action(1); // do the first step right away
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
      action(1);
    }
  });
}
