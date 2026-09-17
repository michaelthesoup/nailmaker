"use strict";

// A small generated click keeps the game self-contained. Replace the body of
// playButtonSound with an Audio element later if you want to use an asset.
var buttonAudioContext = null;

function playButtonSound() {
  var AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!buttonAudioContext) buttonAudioContext = new AudioContextClass();
  if (buttonAudioContext.state === "suspended") buttonAudioContext.resume();

  var oscillator = buttonAudioContext.createOscillator();
  var gain = buttonAudioContext.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(520, buttonAudioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(260, buttonAudioContext.currentTime + 0.035);
  gain.gain.setValueAtTime(0.035, buttonAudioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, buttonAudioContext.currentTime + 0.04);
  oscillator.connect(gain);
  gain.connect(buttonAudioContext.destination);
  oscillator.start();
  oscillator.stop(buttonAudioContext.currentTime + 0.04);
}

document.addEventListener("pointerdown", function (event) {
  var button = event.target.closest("button");
  if (button && !button.disabled) playButtonSound();
});

document.addEventListener("keydown", function (event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  var button = event.target.closest("button");
  if (button && !button.disabled) playButtonSound();
});
