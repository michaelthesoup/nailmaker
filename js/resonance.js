"use strict";

// ----------------------------------------------------------------
// Resonance. A small oscilloscope. A faint dashed TARGET wave and your solid wave; two sliders (frequency and phase)
// move your wave. Line them up and a bar fills; the fuller it gets, the more you are paid.
//
//   THE TARGET   Comes from this life's seed (state.draftSeed). It never moves.
//   THE DRIFT    Your frequency and phase sliders slowly creep away from where you set them (very slowly), so you have to keep
//                nudging them back: stay active and it keeps paying. The more lopsided your iron (see resBalanceWord)
//                the faster it drifts. While it is roughly even (up to about 14 : 16) the drift is tiny.
//   THE ALIGNMENT How well the waves overlap, 0..100%, smoothed. There is no punishment.
//   THE BAR      Always 100 long. It fills by your alignment each second: 100% fills 1 a second, 50% half that.
//                A full bar is 1 TAO (cards can add more). Black and white both make tao here for now. The path only changes the feel: white
//                has a wide window and slow drift, black a narrower window and faster drift.
// ----------------------------------------------------------------

var RES_EVEN_ZONE = 0.10;               // iron imbalance that still counts as even: 14 : 16 is 0.07, 12 : 18 is 0.2
var RES_UNEVEN_FULL = 0.40;              // ...and the imbalance at which the drift is at its worst
var RES_UNLOCK_TAO = 1;              // held tao needed (earned again each life, like the swarm)
var RES_RING_SIZE = 100;             // the bar: always 100, whatever your tao
var RES_TOL = { f: 0.045, p: 0.06 }; // how far each control may be off, before the path and cards widen/narrow it
var RES_LOCK_RISE = 2, RES_LOCK_FALL = 3; // how quickly the lock follows the match (per second)
var RES_DRIFT_RATE = 0.0008;         // how fast a slider creeps (per second, at its fastest) when the iron is even
var RES_CTL = ["f", "p"];            // frequency, phase

function resSide() {
  return typeof cardDeckSide === "function" ? cardDeckSide() : null;
}

function resEnsure() {
  var r = state.res;
  if (!r || typeof r !== "object") r = state.res = {};
  if (!r.c || typeof r.c !== "object") r.c = { f: 0.5, p: 0.5 };
    ["lock", "q"].forEach(function (k) { if (typeof r[k] !== "number") r[k] = 0; });
  return r;
}

function resUnlockCheck() {
  if (state.unlockedResonance) return;
  if (resSide() && state.tao >= RES_UNLOCK_TAO) state.unlockedResonance = true;
}

function resUnlocked() {
  return !!state.unlockedResonance && !!resSide();
}

// Extra "steady hands" from cards: each one slows the drift by 15%. You always have one.
function resTuners() {
  return Math.min(8, 1 + Math.max(0, Math.floor(cardAdd("tunersW"))));
}

// ---------------- the seed ----------------

var resModelCache = null;

function resModel() {
  var seed = (state.draftSeed >>> 0) || 12345;
  if (resModelCache && resModelCache.seed === seed) return resModelCache;
  var r = cardRng(seed, 900, 31);
  var m = { seed: seed, t: { f: 0.25 + 0.5 * r(), p: 0.2 + 0.6 * r() }, dp: [], code: "" };
  for (var k = 0; k < 2; k++) {
    m.dp.push({ sgn: r() < 0.5 ? -1 : 1, w1: 6.2832 / (90 + r() * 70), w2: 6.2832 / (35 + r() * 25), f1: r() * 6.2832, f2: r() * 6.2832 });
  }
  m.code = "RX-" + ("0000" + (cardHash(seed, 77) & 0xffff).toString(16)).slice(-4).toUpperCase();
  resModelCache = m;
  return m;
}

// ---------------- the drift ----------------

function resImbalance() {
  if (ironDemandRate() <= 0 || ironSupplyRate() <= 0) return 0; // no real economy to measure yet: nothing pulls the wave
  var v = ironStructuralImbalance();
  return isFinite(v) ? Math.max(-0.5, Math.min(0.5, v)) : 0;
}

// How uneven the iron is, as 0 (even enough) .. 1 (as lopsided as the drift gets).
function resUneven(imb) {
  return Math.max(0, Math.min(1, (Math.abs(imb) - RES_EVEN_ZONE) / (RES_UNEVEN_FULL - RES_EVEN_ZONE)));
}

// The same, shown to the player in words.
function resBalanceWord(imb) {
  var u = resUneven(imb);
  return u <= 0 ? "even" : (u < 0.5 ? "uneven" : "lopsided");
}

function resPathDrift(side) { return side === "white" ? 0.7 : 1.1; }

// How fast the controls wander, per second.
function resDriftRate(side, imb) {
  var mult = resPathDrift(side) * cardMult("driftW");
  return RES_DRIFT_RATE * (0.4 + 4 * resUneven(imb)) * mult / (1 + 0.15 * (resTuners() - 1));
}

// The direction the drift is pushing right now: slow and meandering, between -1 and 1.
function resDriftDir(m, i, time) {
  var d = m.dp[i];
  // mostly one way (the seed picks which), with slow swells: it never settles back by itself
  return d.sgn * (0.55 + 0.45 * (Math.sin(d.w1 * time + d.f1) + 0.6 * Math.sin(d.w2 * time + d.f2)) / 1.6);
}

function resDriftStep(dt, time) {
  var r = resEnsure(), m = resModel(), rate = resDriftRate(resSide(), resImbalance());
  RES_CTL.forEach(function (key, i) {
    r.c[key] = Math.max(0, Math.min(1, r.c[key] + resDriftDir(m, i, time) * rate * Math.min(dt, 5))); // the slider itself creeps
  });
}

// Tolerance multiplier: the path (white forgiving, black strict) and cards.
function resTolMult(side) {
  return (side === "white" ? 1.4 : 0.9) * cardMult("windowW");
}

// How well your wave matches the target right now: z is how many tolerances off each control is (signed).
function resEvaluate() {
  var r = resEnsure(), m = resModel(), tm = resTolMult(resSide());
  var e = { f: r.c.f, p: r.c.p }, z = {}, z2 = 0;
  RES_CTL.forEach(function (key) {
    z[key] = (e[key] - m.t[key]) / (RES_TOL[key] * tm);
    z2 += z[key] * z[key];
  });
  return { e: e, z: z, z2: z2, q: Math.exp(-0.35 * z2) };
}

var resLast = null; // the latest evaluation, for the screen

// ---------------- the payout ----------------

function resGain() {
  return cardMult("resonanceTao");
}

// The bar fills at your alignment: 100% fills 1 a second, 50% half that, and so on (still visible when it is low).
function resOutputRate() {
  var r = resEnsure();
  if (!resSide()) return 0;
  return r.lock * resGain();
}

// The size of the bar: 100 (white cards can shrink it). It does not grow with your tao.
function resRingSize() {
  return RES_RING_SIZE * cardMult("meritCost");
}

function resonanceTick(dt) {
  resUnlockCheck();
  if (!resUnlocked()) return;
  var r = resEnsure(), time = state.simTime, side = resSide();

  resDriftStep(dt, time);
  resLast = resEvaluate();
  r.q = resLast.q;
  var k = resLast.q > r.lock ? RES_LOCK_RISE : RES_LOCK_FALL;
  r.lock += (resLast.q - r.lock) * (1 - Math.exp(-k * dt));

  state.resonanceProgress = (state.resonanceProgress || 0) + resOutputRate() * dt;
  var ring = resRingSize();
  while (state.resonanceProgress >= ring) {
    state.resonanceProgress -= ring;
    state.tao += 1 + Math.max(0, Math.floor(cardAdd("resonancePer")));
    ring = resRingSize();
  }
}

// ---------------- controls ----------------

function resSet(key, v) {
  var r = resEnsure();
  r.c[key] = Math.max(0, Math.min(1, v));
}

// ---------------- the panel ----------------
// Small and plain: black and white like the rest of the game, no flashing, nothing that punishes.

var resUI = null;

function resMk(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function resBuildStyle() {
  var st = document.createElement("style");
  st.textContent =
    "#resonanceSection { grid-column: 2; grid-row: 3; align-self: start; }" +
    "#resonanceSection .row { padding: 1px 0; font-size: 12px; }" +
    ".res-ctl { display: flex; flex-direction: column; align-items: stretch; gap: 2px; font-size: 11px; margin-top: 6px; user-select: none; }" +
    ".res-line { display: flex; align-items: center; gap: 4px; }" +
    ".res-line input[type=range] { flex: 1; min-width: 0; margin: 0; accent-color: #000; }" +
    ".res-line button { font-size: 12px; padding: 0 7px; line-height: 18px; }" +
    ".res-lab { display: flex; justify-content: space-between; }" +
    ".res-meter { position: relative; height: 6px; border: 1px solid var(--ink); margin: 2px 24px 0; }" +
    ".res-meter:before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; border-left: 1px solid var(--ink); opacity: 0.5; }" +
    ".res-meter i { position: absolute; top: -1px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--ink); }" +
    ".res-meter.ok { background: var(--ink); }" +
    ".res-meter.ok i { background: var(--paper); }" +
    ".res-buttons { display: flex; gap: 4px; justify-content: center; margin-top: 7px; }" +
    ".res-buttons button { font-size: 11px; padding: 1px 7px; }" +
    ".res-buttons button.on { background: var(--ink); color: var(--paper); }" +
    ".res-hint { font-size: 10px; margin-top: 5px; opacity: 0.7; text-align: center; }";
  document.head.appendChild(st);
}

// The meter shows which way a control is off: dot left of the middle = too low, right = too high; it fills in when it matches.
function resMeterSet(meter, dot, z) {
  var zz = Math.max(-3, Math.min(3, z || 0));
  dot.style.left = (50 + zz / 3 * 50).toFixed(1) + "%";
  meter.classList.toggle("ok", Math.abs(z || 0) < 0.6);
}

function resSlider(key, label) {
  var wrap = resMk("div", "res-ctl");
  var lab = resMk("div", "res-lab"); lab.appendChild(resMk("span", "", label));
  wrap.appendChild(lab);
  var line = resMk("div", "res-line");
  var minus = resMk("button", "", "‹"), plus = resMk("button", "", "›");
  minus.title = "nudge a hair down"; plus.title = "nudge a hair up";
  var input = document.createElement("input");
  input.type = "range"; input.min = "0"; input.max = "1"; input.step = "0.0005";
  var down = false;
  input.addEventListener("pointerdown", function () { down = true; });
  document.addEventListener("pointerup", function () { down = false; });
  input.addEventListener("input", function () { resSet(key, parseFloat(input.value)); });
  minus.addEventListener("click", function () { resSet(key, resEnsure().c[key] - 0.004); });
  plus.addEventListener("click", function () { resSet(key, resEnsure().c[key] + 0.004); });
  line.appendChild(minus); line.appendChild(input); line.appendChild(plus);
  wrap.appendChild(line);
  var meter = resMk("div", "res-meter"), dot = resMk("i");
  meter.appendChild(dot);
  wrap.appendChild(meter);
  return { el: wrap, set: function (v) { if (!down) input.value = v; }, meter: function (z) { resMeterSet(meter, dot, z); } };
}

function resBuildUI() {
  var section = document.getElementById("resonanceSection");
  if (!section) return;
  resBuildStyle();
  var body = section.querySelector(".panel-body");
  body.innerHTML = "";
  var canvas = resMk("canvas");
  canvas.width = 300; canvas.height = 96;
  canvas.style.cssText = "width:100%; display:block;";
  body.appendChild(canvas);

  function row(label) {
    var rw = resMk("div", "row");
    rw.appendChild(resMk("span", "label", label));
    var val = resMk("span", "value", "");
    rw.appendChild(val);
    body.appendChild(rw);
    return val;
  }
  resUI = { section: section, canvas: canvas, ctx: canvas.getContext ? canvas.getContext("2d") : null };
  resUI.lock = row("alignment:");
  resUI.output = row("output:");
  resUI.balance = row("iron balance:");

  resUI.sliderF = resSlider("f", "frequency");
  resUI.sliderP = resSlider("p", "phase");
  body.appendChild(resUI.sliderF.el);
  body.appendChild(resUI.sliderP.el);

  var btns = resMk("div", "res-buttons");
  function btn(text, fn) { var b = resMk("button", "", text); b.addEventListener("click", fn); btns.appendChild(b); return b; }
  resUI.btnSound = btn("sound", function () { resSoundToggle(); });
  resUI.btnSound.title = "hear how far off you are: a slow wobble that fades as you line up";
  body.appendChild(btns);
  resUI.hint = resMk("div", "res-hint", "");
  body.appendChild(resUI.hint);
}

function renderResonance() {
  var section = document.getElementById("resonanceSection");
  if (!section) return;
  if (!resUI) resBuildUI();
  var show = resUnlocked();
  section.style.display = show ? "" : "none";
  if (!show || !resUI) return;

  var r = resEnsure(), ev = resLast;
  resUI.lock.textContent = Math.round(r.lock * 100) + "%";
  resUI.balance.textContent = resBalanceWord(resImbalance());
  resUI.output.textContent = fmtInt(state.resonanceProgress || 0) + " / " + fmtInt(resRingSize());
  resUI.sliderF.set(r.c.f); resUI.sliderP.set(r.c.p);
  if (ev) { resUI.sliderF.meter(ev.z.f); resUI.sliderP.meter(ev.z.p); }
  resUI.btnSound.classList.toggle("on", !!(resAudio && resAudio.on));
  resUI.hint.textContent = r.lock < 0.3
    ? "slide frequency and phase until your wave covers the dashed one"
    : "stay lined up and the bar fills. It slowly drifts, so keep nudging it back";
}

// ---------------- the screen ----------------

function resWave(f, p, u, scroll) {
  return Math.sin(6.2832 * ((2 + 5 * f) * u + scroll + (p - 0.5)));
}

function resThemeColors() {
  var cs = getComputedStyle(document.documentElement);
  return { paper: cs.getPropertyValue("--paper").trim() || "#ffffff", ink: cs.getPropertyValue("--ink").trim() || "#000000" };
}

function drawResonance() {
  requestAnimationFrame(drawResonance);
  if (!resUI || !resUI.ctx || !resUnlocked()) return;
  var ctx = resUI.ctx, r = resEnsure(), m = resModel();
  var col = resThemeColors(), ink = col.ink;
  var w = resUI.canvas.width, h = resUI.canvas.height;
  var ev = resLast || resEvaluate();
  var scroll = (Date.now() / 1000) * 0.22;
  var X = 1, Y = 1, W = w - 2, H = 76, cy = Y + H / 2, amp = H * 0.4;

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = ink; ctx.lineWidth = 1;
  ctx.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1); // the screen: a plain rectangle

  ctx.save();
  ctx.beginPath(); ctx.rect(X + 1, Y + 1, W - 2, H - 2); ctx.clip();
  ctx.globalAlpha = 0.5; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; // the target: faint and dashed
  ctx.beginPath();
  for (var px = 0; px <= W; px += 3) {
    var yt = cy - resWave(m.t.f, m.t.p, px / W - 0.5, scroll) * amp;
    if (px === 0) ctx.moveTo(X + px, yt); else ctx.lineTo(X + px, yt);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1; ctx.lineWidth = 1.5; // yours: solid
  ctx.beginPath();
  for (var px2 = 0; px2 <= W; px2 += 3) {
    var ym = cy - resWave(Math.max(0, Math.min(1.2, ev.e.f)), ev.e.p, px2 / W - 0.5, scroll) * amp;
    if (px2 === 0) ctx.moveTo(X + px2, ym); else ctx.lineTo(X + px2, ym);
  }
  ctx.stroke();
  ctx.restore();

  // the bar: fills toward the next tao
  var by = H + 10, bh = 6;
  ctx.lineWidth = 1; ctx.strokeRect(X + 0.5, by + 0.5, W - 1, bh - 1);
  var frac = Math.min(1, (state.resonanceProgress || 0) / resRingSize());
  ctx.fillStyle = ink; ctx.fillRect(X + 1, by + 1, Math.max(0, (W - 2) * frac), bh - 2);

  resSoundUpdate(ev);
}

requestAnimationFrame(drawResonance);

// ---------------- sound: the beating of two tones ----------------
// A tone for the target and one for your wave. Detuned, you hear them beat (a wobble); as you line up, the wobble
// slows and vanishes. Off until you press the button (browsers need a click before they will play sound).

var resAudio = null;

function resSoundToggle() {
  if (resAudio) { resAudio.on = !resAudio.on; if (!resAudio.on) resAudio.gain.gain.value = 0; return; }
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    var ctx = new AC();
    var gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
    var a = ctx.createOscillator(), b = ctx.createOscillator();
    a.type = "sine"; b.type = "sine";
    a.connect(gain); b.connect(gain);
    a.start(); b.start();
    resAudio = { ctx: ctx, gain: gain, a: a, b: b, on: true };
  } catch (e) { resAudio = null; }
}

function resSoundUpdate(ev) {
  if (!resAudio || !resAudio.on) return;
  var m = resModel(), t = resAudio.ctx.currentTime;
  var base = 110 + m.t.f * 140;
  var diff = (ev.e.f - m.t.f) * 40; // hertz apart: a few hertz is a slow wobble you can hear
  resAudio.a.frequency.setTargetAtTime(base, t, 0.05);
  resAudio.b.frequency.setTargetAtTime(base + diff, t, 0.05);
  resAudio.gain.gain.setTargetAtTime(0.035, t, 0.1);
}
