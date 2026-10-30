"use strict";

function setupRepeatButton(btn, action) {
  var repeatTimeout = null;
  var currentDelay = 90;
  var minDelay = 25;
  var speedUpFactor = 0.7;
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
    if (e.button !== undefined && e.button !== 0) return;
    if (btn.disabled) return;
    held = true;
    heldSince = Date.now();
    action(1);
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

  btn.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && !held) {
      action(1);
    }
  });
}
