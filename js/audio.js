"use strict";

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

function playMergeSound(tier) {
  var AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!buttonAudioContext) buttonAudioContext = new AudioContextClass();
  var ctx = buttonAudioContext;
  if (ctx.state === "suspended") ctx.resume();
  var now = ctx.currentTime;
  var lift = Math.pow(1.045, Math.min(10, Math.max(1, tier || 1)) - 1);
  var master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  var thump = ctx.createOscillator();
  var thumpGain = ctx.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(130, now);
  thump.frequency.exponentialRampToValueAtTime(48, now + 0.2);
  thumpGain.gain.setValueAtTime(0.16, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  thump.connect(thumpGain);
  thumpGain.connect(master);
  thump.start(now);
  thump.stop(now + 0.26);

  var len = Math.floor(ctx.sampleRate * 0.06);
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var noise = ctx.createBufferSource();
  noise.buffer = buf;
  var filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2400;
  filter.Q.value = 0.9;
  var noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.09, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);

  [[523.25, 0.05, 0.34], [783.99, 0.13, 0.42]].forEach(function (n) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = n[0] * lift;
    g.gain.setValueAtTime(0.0001, now + n[1]);
    g.gain.exponentialRampToValueAtTime(0.07, now + n[1] + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + n[2]);
    osc.connect(g);
    g.connect(master);
    osc.start(now + n[1]);
    osc.stop(now + n[1] + n[2] + 0.02);
  });
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

function sfxContext() {
  var AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!buttonAudioContext) buttonAudioContext = new AudioContextClass();
  if (buttonAudioContext.state === "suspended") buttonAudioContext.resume();
  return buttonAudioContext;
}

function sfxNoise(ctx, seconds, shape) {
  var len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * shape(i / len);
  var src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function sfxTone(ctx, dest, type, f0, f1, start, dur, vol) {
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, start);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, start + dur);
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g);
  g.connect(dest);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function playCardPickSound() {
  var ctx = sfxContext();
  if (!ctx) return;
  var now = ctx.currentTime;
  var master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  sfxTone(ctx, master, "triangle", 880, 520, now, 0.06, 0.07);
  sfxTone(ctx, master, "sine", 1320, 1000, now + 0.025, 0.09, 0.03);
  var tick = sfxNoise(ctx, 0.03, function (u) { return 1 - u; });
  var f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 3200;
  var g = ctx.createGain();
  g.gain.value = 0.05;
  tick.connect(f);
  f.connect(g);
  g.connect(master);
  tick.start(now);
}

function playPackOpenSound() {
  var ctx = sfxContext();
  if (!ctx) return;
  var now = ctx.currentTime;
  var master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  var tear = sfxNoise(ctx, 0.28, function (u) { return Math.min(1, u * 8) * (1 - u * 0.6) * (0.55 + 0.45 * Math.sin(u * 90)); });
  var f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(1800, now);
  f.frequency.exponentialRampToValueAtTime(6000, now + 0.28);
  var tg = ctx.createGain();
  tg.gain.setValueAtTime(0.11, now);
  tg.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  tear.connect(f);
  f.connect(tg);
  tg.connect(master);
  tear.start(now);

  var t = now + 0.26;
  sfxTone(ctx, master, "sine", 150, 60, t, 0.2, 0.15);
  var puff = sfxNoise(ctx, 0.12, function (u) { return 1 - u; });
  var pf = ctx.createBiquadFilter();
  pf.type = "lowpass";
  pf.frequency.value = 1800;
  var pg = ctx.createGain();
  pg.gain.value = 0.1;
  puff.connect(pf);
  pf.connect(pg);
  pg.connect(master);
  puff.start(t);

  [659.25, 880, 1318.5].forEach(function (hz, i) {
    sfxTone(ctx, master, "triangle", hz, hz, t + 0.07 + i * 0.07, 0.3, 0.05);
  });
}

var slotTickAt = 0;

function playSlotTickSound(pitch) {
  var ctx = sfxContext();
  if (!ctx) return;
  var now = ctx.currentTime;
  if (now - slotTickAt < 0.028) return;
  slotTickAt = now;
  var master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  var hz = 1500 * (pitch || 1);
  sfxTone(ctx, master, "square", hz, hz * 0.55, now, 0.02, 0.012);
  var click = sfxNoise(ctx, 0.015, function (u) { return 1 - u; });
  var f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 2600;
  var g = ctx.createGain();
  g.gain.value = 0.05;
  click.connect(f);
  f.connect(g);
  g.connect(master);
  click.start(now);
}

function playSlotStopSound() {
  var ctx = sfxContext();
  if (!ctx) return;
  var now = ctx.currentTime;
  var master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  sfxTone(ctx, master, "sine", 190, 80, now, 0.11, 0.13);
  sfxTone(ctx, master, "triangle", 900, 600, now, 0.04, 0.05);
}
