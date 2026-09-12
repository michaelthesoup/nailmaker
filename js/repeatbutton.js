"use strict";

// ----------------------------------------------------------------
// Hold-to-repeat buttons. Press once for a single step. Keep holding
// and it starts repeating on its own, getting faster the longer you
// hold it down, so you don't have to click fifty times to move a
// number a long way.
// ----------------------------------------------------------------

function setupRepeatButton(btn, action) {
  var repeatTimeout = null;
  var currentDelay = 400; // how long to wait before the first repeat
  var minDelay = 40; // fastest it will ever repeat
  var speedUpFactor = 0.85; // each repeat gets a bit faster than the last
  var held = false;

  function scheduleNext() {
    repeatTimeout = setTimeout(function () {
      if (btn.disabled) {
        stop();
        return;
      }
      action();
      currentDelay = Math.max(minDelay, currentDelay * speedUpFactor);
      scheduleNext();
    }, currentDelay);
  }

  function start(e) {
    if (e.button !== undefined && e.button !== 0) return; // left click / primary touch only
    if (btn.disabled) return;
    held = true;
    action(); // do the first step right away
    currentDelay = 400;
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
