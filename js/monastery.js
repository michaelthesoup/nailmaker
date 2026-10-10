"use strict";

// ----------------------------------------------------------------
// The Monastery. Part of the machinery, but powered by the
// community. Tao gives makers and breakers the same rate bonus; the
// monks quietly move that bonus between the two sides, keeping the
// TOTAL the same, until production and consumption of iron match. It
// is a picture of the Middle Way (ทางสายกลาง): two extremes, and a path
// that finds the center between them -- turned by the Wheel of the
// Dharma (ธรรมจักร), which spins faster the more monks there are.
//
//   - Unlocks once you have reincarnated at least once AND hold 3 tao
//     (earned again each life, like the swarm).
//   - Halls cost funds AND a lot of unsold nails, and seat monks (a
//     mid-to-late-game sink).
//   - Monks are community members moved out of meditation: each monk is
//     one member NOT making merit (see communityMeritRate()).
//   - Monks work in whole 1% steps. One monk takes a step every second,
//     two monks every half second, and so on -- never a bigger step.
//   - The lean (state.monkShift, -1..+1) is applied in formulas.js:
//       maker bonus   = tao bonus * (1 + lean)
//       breaker bonus = tao bonus * (1 - lean)
//   - Monks only act on the tao bonus, so with no tao there is nothing
//     to steer.
// ----------------------------------------------------------------

var MONASTERY_UNLOCK_TAO = 3;           // held tao needed (plus having reincarnated at least once)
var MONASTERY_HALL_COST_BASE = 10000;   // funds for the first hall...
var MONASTERY_HALL_NAILS_BASE = 100000; // ...and unsold nails for the first hall
var MONASTERY_HALL_COST_GROWTH = 2.5;   // each further hall costs this much more of both
var MONASTERY_SEATS_PER_HALL = 2;
var MONK_STEP = 0.01;                   // a monk moves the lean by 1% of the pool per step
var MONK_RELAX_STEPS_PER_SEC = 2;       // with no monks the lean drifts back to neutral, a step every 0.5s

var monkStepAccum = 0; // fractional monk steps carried between ticks (not saved)

function monasteryCheckUnlock() {
  if (state.unlockedMonastery) return;
  if (state.karma >= 1 && state.tao >= MONASTERY_UNLOCK_TAO) state.unlockedMonastery = true;
}

function monasteryUnlocked() {
  return !!state.unlockedMonastery;
}

function monasterySeats() {
  return state.monasteryHalls * MONASTERY_SEATS_PER_HALL;
}

function monasteryHallCost() {
  return Math.round(MONASTERY_HALL_COST_BASE * Math.pow(MONASTERY_HALL_COST_GROWTH, state.monasteryHalls));
}

function monasteryHallNailCost() {
  return Math.round(MONASTERY_HALL_NAILS_BASE * Math.pow(MONASTERY_HALL_COST_GROWTH, state.monasteryHalls));
}

// The lean that would make iron demand exactly equal iron supply.
//   A = what makers WOULD consume with no bonus, B = what breakers would
//   supply with no bonus, P = the tao bonus pool.
//   A(1 + P(1+s)) = B(1 + P(1-s))  =>  s = (B - A)(1 + P) / (P (A + B))
function monasteryTargetLean() {
  var P = taoRateBonus();
  var A = state.nailMakers * NAILMAKER_RATE * IRON_PER_NAIL;
  var B = state.breakers * BREAKER_INTAKE_RATE * activeIronTileCount();
  if (P <= 0 || A <= 0 || B <= 0) return 0;
  var s = (B - A) * (1 + P) / (P * (A + B));
  return Math.max(-1, Math.min(1, s));
}

function monasteryTick(dt) {
  monasteryCheckUnlock();
  if (!monasteryUnlocked()) return;
  if (state.monks > state.members) state.monks = state.members;

  if (taoRateBonus() <= 0) { state.monkShift = 0; monkStepAccum = 0; return; }

  var target = state.monks > 0 ? monasteryTargetLean() : 0;
  var cur = state.monkShift || 0;
  if (cur === target) { monkStepAccum = 0; return; }

  // One monk = one 1% step per second; N monks = N steps per second (each
  // still just 1%), so two monks take a step every half second.
  monkStepAccum += (state.monks > 0 ? state.monks : MONK_RELAX_STEPS_PER_SEC) * dt;
  while (monkStepAccum >= 1 - 1e-9 && cur !== target) {
    monkStepAccum -= 1;
    var diff = target - cur;
    if (Math.abs(diff) <= MONK_STEP) cur = target;
    else cur += diff > 0 ? MONK_STEP : -MONK_STEP;
  }
  if (cur === target) monkStepAccum = 0;
  state.monkShift = Math.max(-1, Math.min(1, cur));
}

el.btnBuildHall.addEventListener("click", function () {
  var cost = monasteryHallCost();
  var nails = monasteryHallNailCost();
  if (state.funds < cost || state.unsold < nails) return;
  state.funds -= cost;
  state.unsold -= nails;
  state.monasteryHalls += 1;
  render();
});

el.btnMonkAdd.addEventListener("click", function () {
  if (state.monks >= monasterySeats() || state.monks >= state.members) return;
  state.monks += 1;
  render();
});

el.btnMonkRemove.addEventListener("click", function () {
  if (state.monks <= 0) return;
  state.monks -= 1;
  render();
});

function fmtBonusPct(x) {
  return "+" + Math.round(x * 100) + "%";
}

// Called from render().
function renderMonastery() {
  monasteryCheckUnlock();
  el.monasterySection.style.display = monasteryUnlocked() ? "" : "none";
  if (!monasteryUnlocked()) return;

  var seats = monasterySeats();
  var cost = monasteryHallCost();
  var hallNails = monasteryHallNailCost();
  el.monasteryHalls.textContent = state.monasteryHalls;
  el.btnBuildHall.textContent = "build hall (" + fmtMoney(cost) + " + " + fmtInt(hallNails) + " nails)";
  el.btnBuildHall.disabled = state.funds < cost || state.unsold < hallNails;
  el.monasteryMonks.textContent = state.monks + " / " + seats;
  el.monasteryMeditating.textContent = String(state.members - state.monks);
  el.monasteryMakerBonus.textContent = fmtBonusPct(makerRateBonus());
  el.monasteryBreakerBonus.textContent = fmtBonusPct(breakerRateBonus());
  el.btnMonkAdd.disabled = state.monks >= seats || state.monks >= state.members;
  el.btnMonkRemove.disabled = state.monks <= 0;

  var hint;
  if (taoRateBonus() <= 0) {
    hint = "Monks steer the tao bonus between makers and breakers. You hold no tao, so there is nothing to steer yet.";
  } else if (state.monasteryHalls === 0) {
    hint = "Build a hall (it costs funds and a great many unsold nails) to seat monks, then move members out of the community's meditation to fill it.";
  } else if (state.monks === 0) {
    hint = "No monks yet. Each one is a community member who stops making merit, and steers the tao bonus toward balance.";
  } else {
    var gap = Math.abs((state.monkShift || 0) - monasteryTargetLean());
    hint = gap < 0.01
      ? "The monks have found the middle way: makers and breakers are in step."
      : "The monks are walking the middle way \u2014 shifting bonus between makers and breakers.";
  }
  el.monasteryHint.textContent = hint;
}

// ---------------- drawing ----------------

var monasteryCtx = el.monasteryCanvas.getContext("2d");
var monasteryWheelAngle = 0;
var monasteryLastFrame = Date.now();

function monasteryThemeColors() {
  var cs = getComputedStyle(document.documentElement);
  return {
    paper: cs.getPropertyValue("--paper").trim() || "#ffffff",
    ink: cs.getPropertyValue("--ink").trim() || "#000000"
  };
}

function drawDharmaWheel(ctx, x, y, r, angle, ink, paper) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, r - 7, 0, Math.PI * 2); ctx.stroke();

  for (var i = 0; i < 8; i++) {
    var a = i * Math.PI / 4;
    var cs = Math.cos(a), sn = Math.sin(a);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cs * 11, sn * 11); ctx.lineTo(cs * (r - 7), sn * (r - 7)); ctx.stroke();
    // a small bead on the rim between spokes
    var b = a + Math.PI / 8;
    ctx.beginPath(); ctx.arc(Math.cos(b) * (r - 3.5), Math.sin(b) * (r - 3.5), 2, 0, Math.PI * 2); ctx.fill();
  }

  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = paper;
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMonastery() {
  requestAnimationFrame(drawMonastery);
  var now = Date.now();
  var dt = Math.min(0.1, (now - monasteryLastFrame) / 1000);
  monasteryLastFrame = now;
  if (!monasteryUnlocked()) return;

  var ctx = monasteryCtx;
  var w = el.monasteryCanvas.width, h = el.monasteryCanvas.height;
  var colors = monasteryThemeColors();
  var ink = colors.ink, paper = colors.paper;

  monasteryWheelAngle += dt * (0.08 + state.monks * 0.3);

  ctx.clearRect(0, 0, w, h);
  drawDharmaWheel(ctx, w / 2, 62, 52, monasteryWheelAngle, ink, paper);

  // the Middle Way: breaking on the left, making on the right, balance in the center
  var x0 = 38, x1 = w - 38, mid = w / 2, y = 148, half = (x1 - x0) / 2;
  var active = taoRateBonus() > 0;
  ctx.save();
  ctx.globalAlpha = active ? 1 : 0.4;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(mid, y - 12); ctx.lineTo(mid, y + 12); ctx.stroke();

  ctx.fillStyle = ink;   // the dark extreme
  ctx.beginPath(); ctx.arc(x0, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = paper; // the light extreme
  ctx.beginPath(); ctx.arc(x1, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  var lean = state.monkShift || 0;
  if (active && state.monks > 0) { // where the monks are heading
    var tx = mid + monasteryTargetLean() * half;
    ctx.setLineDash([2, 3]);
    ctx.fillStyle = paper;
    ctx.beginPath(); ctx.arc(tx, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = ink;   // where the bonus sits now
  var px = mid + lean * half;
  ctx.beginPath(); ctx.moveTo(px, y - 9); ctx.lineTo(px + 6, y); ctx.lineTo(px, y + 9); ctx.lineTo(px - 6, y); ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.font = "11px sans-serif";
  ctx.fillText("breaking", x0, y + 28);
  ctx.fillText("making", x1, y + 28);
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("\u0e17\u0e32\u0e07\u0e2a\u0e32\u0e22\u0e01\u0e25\u0e32\u0e07", mid, y + 30);
}

requestAnimationFrame(drawMonastery);
