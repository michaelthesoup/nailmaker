"use strict";

// ----------------------------------------------------------------
// The Foundry Swarm. A small always-visible panel next to yin & yang.
//
// The dots are a LIVE readout of the real economy: half white and half
// black means iron production and consumption match, using the same
// rate-based parity metric as yin/yang. More white means makers consume
// more iron than breakers supply; more black means the reverse.
//
// BALANCE, properly defined: half white, half black, both moving at
// the SAME speed. There is no "fast at balance" trick here -- at real
// parity, every dot drifts at the same calm baseline.
//
// Clicking any dot flips its color by SCRAPPING machines of one type and
// rebuilding their value as the other (at the factory's exchange rate, minus
// a 20% loss), so the real rate split matches the resulting colors. It costs
// no copper and creates no machines: factories stay the only way to grow.
//
// Push the real imbalance far enough (SWARM_COLLAPSE_IMBALANCE_THRESHOLD)
// and HOLD it there for a sustained moment, and the whole swarm greys
// out and collapses into an unstable core: it destroys enough of the
// overrepresented type to bring real iron rates as close to parity as
// whole machines allow, then banks one unstable core (state.isotopeStock), which together with
// unsold nails is what the foundry core (see city.js) needs to arm a
// nailbomb.
//
// Dots also FLEE the cursor when you get close, independent of all the
// above -- stronger the more imbalanced the real economy currently is,
// barely reacting at true parity. A brief stun window after a
// successful hit stops the next dot from becoming instantly harder to
// land right after you land one.
// ----------------------------------------------------------------

var SWARM_DISPLAY_DOTS = 30;
var SWARM_DOT_RADIUS = 3;
var SWARM_BASE_SPEED = 0.25; // px/frame -- the uniform speed BOTH colors move at when genuinely balanced, and the baseline for the minority color otherwise. Kept deliberately gentle: balance is meant to be the EASY state now, not a challenge.
var SWARM_CLICK_COOLDOWN_MS = 250;
var SWARM_CONVERSION_LOSS = 0.2; // share of the scrapped machines' value lost when a flip converts them

// How lopsided the REAL economy has to be before the dots show it. The dot
// split is drawn on a log scale of demand:supply, so it takes a seriously
// lopsided build to leave only a few dots of one color: at
// SWARM_FULL_SKEW_RATIO to 1 (default 50:1) exactly SWARM_MIN_MINORITY_DOTS
// remain, and never fewer. (3:1, the collapse line, shows as roughly 18/12.)
var SWARM_FULL_SKEW_RATIO = 50;
var SWARM_MIN_MINORITY_DOTS = 3;
var SWARM_REJECT_SPEED = 5; // px/frame a dot is flung away at when a flip isn't possible

// Flee behavior -- strongest at real imbalance, weakest at real parity.
var SWARM_FLEE_RADIUS = 55; // px -- dots within this distance of the cursor start dodging
// TESTING: still eased down from the original 0.05 / 1.0 / 0.9 while
// the rest of the loop is being worked out, but nudged back up a bit
// from the near-zero first pass.
var SWARM_FLEE_MIN_MULT = 0.05;
var SWARM_FLEE_MAX_MULT = 0.4;
var SWARM_FLEE_FORCE = 0.35;
var SWARM_STUN_MS = 350; // after a hit, a dot ignores flee for this long so chaining feels fair

var swarmDots = []; // { x, y, vx, vy, side: 'maker' | 'breaker', speedy, stunUntil }
var swarmCanvasEl = null;
var swarmCtx = null;
var swarmWidth = 288;
var swarmHeight = 224;
var swarmLastClickAt = 0;
var swarmMouseX = null;
var swarmMouseY = null; // null while the cursor isn't over the canvas -- no flee to compute
var swarmLastFrameMs = null;

// Collapse state -- how long the real imbalance has been sitting past
// the collapse threshold. Not saved; resets harmlessly on reload.
var swarmCollapseSustain = 0;
var swarmGreying = false;

function swarmRandomVelocity(speed) {
  var angle = Math.random() * Math.PI * 2;
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

function swarmSpawnDot(side) {
  var v = swarmRandomVelocity(SWARM_BASE_SPEED);
  return {
    x: SWARM_DOT_RADIUS + Math.random() * (swarmWidth - SWARM_DOT_RADIUS * 2),
    y: SWARM_DOT_RADIUS + Math.random() * (swarmHeight - SWARM_DOT_RADIUS * 2),
    vx: v.vx,
    vy: v.vy,
    side: side,
    speedy: false,
    stunUntil: 0
  };
}

function swarmWithinTolerance() {
  return Math.abs(ironStructuralImbalance()) <= SWARM_MAJORITY_TOLERANCE;
}

function swarmMajoritySide() {
  return ironDemandRate() >= ironSupplyRate() ? "maker" : "breaker";
}

// Keeps the fixed dot pool's color split matching the LIVE real
// balance (demand share vs supply share), and marks which dots are
// currently the fast "majority" group. Re-labels existing dots toward
// the target split rather than respawning, so drift stays smooth frame
// to frame -- only colors/speed change, positions don't reset.
function swarmSyncDots() {
  while (swarmDots.length < SWARM_DISPLAY_DOTS) {
    swarmDots.push(swarmSpawnDot(Math.random() < 0.5 ? "maker" : "breaker"));
  }
  while (swarmDots.length > SWARM_DISPLAY_DOTS) {
    swarmDots.pop();
  }

  var wantMakerDots = swarmWantedMakerDots();

  var haveMakerDots = swarmDots.filter(function (d) { return d.side === "maker"; }).length;

  var i;
  if (haveMakerDots < wantMakerDots) {
    var toFlipToMaker = wantMakerDots - haveMakerDots;
    for (i = 0; i < swarmDots.length && toFlipToMaker > 0; i++) {
      if (swarmDots[i].side === "breaker") { swarmDots[i].side = "maker"; toFlipToMaker--; }
    }
  } else if (haveMakerDots > wantMakerDots) {
    var toFlipToBreaker = haveMakerDots - wantMakerDots;
    for (i = 0; i < swarmDots.length && toFlipToBreaker > 0; i++) {
      if (swarmDots[i].side === "maker") { swarmDots[i].side = "breaker"; toFlipToBreaker--; }
    }
  }

  var balanced = swarmWithinTolerance();
  var majority = swarmMajoritySide();
  for (i = 0; i < swarmDots.length; i++) {
    swarmDots[i].speedy = !balanced && swarmDots[i].side === majority;
  }
}

// -1 (all supply) .. 0 (balanced) .. +1 (all demand), on a log scale of
// demand:supply so the dots only reach their extremes at SWARM_FULL_SKEW_RATIO.
function swarmSkew() {
  var demand = ironDemandRate();
  var supply = ironSupplyRate();
  if (demand <= 0 && supply <= 0) return 0;
  if (supply <= 0) return 1;
  if (demand <= 0) return -1;
  return Math.max(-1, Math.min(1, Math.log(demand / supply) / Math.log(SWARM_FULL_SKEW_RATIO)));
}

function swarmMaxSkewDots() {
  return SWARM_DISPLAY_DOTS / 2 - SWARM_MIN_MINORITY_DOTS;
}

function swarmWantedMakerDots() {
  return Math.round(SWARM_DISPLAY_DOTS / 2 + swarmMaxSkewDots() * swarmSkew());
}

function swarmCountMakerDots() {
  var n = 0;
  for (var i = 0; i < swarmDots.length; i++) if (swarmDots[i].side === "maker") n++;
  return n;
}

// What the swarm is telling you, in words that are deliberately different
// from the yin & yang panel's labels, and what to do about it.
function swarmStatusInfo() {
  var demand = ironDemandRate();
  var supply = ironSupplyRate();
  if (demand <= 0 && supply <= 0) {
    return { label: "nothing to balance yet", advice: "build nail makers and nail breakers" };
  }
  if (supply <= 0) {
    return { label: "too many makers", advice: "you have no breakers feeding them \u2014 get breakers" };
  }
  if (demand <= 0) {
    return { label: "too many breakers", advice: "you have no makers using the iron \u2014 get nail makers" };
  }
  if (swarmWithinTolerance()) {
    return { label: "balanced", advice: "makers and breakers are in step" };
  }
  if (demand > supply) {
    return { label: "too many makers", advice: "get more breakers \u2014 click a white ball to add them" };
  }
  return { label: "too many breakers", advice: "get more makers \u2014 click a black ball to add them" };
}

function swarmImbalanceMagnitude() {
  return Math.abs(ironStructuralImbalance()); // 0 (balanced) .. 1 (fully leaning)
}

// Strongest flee at maximum real imbalance, weakest at perfect balance.
function swarmFleeMultiplier() {
  var imbalance = swarmImbalanceMagnitude();
  return SWARM_FLEE_MIN_MULT + (SWARM_FLEE_MAX_MULT - SWARM_FLEE_MIN_MULT) * imbalance;
}

function swarmColorFor(side) {
  return side === "maker" ? "#fff" : "#000";
}

// ----------------------------------------------------------------
// Collapse: sustained severe imbalance destroys enough of the
// overrepresented type to bring actual iron rates as close to parity
// as whole machines allow.
//
// Only counts if BOTH demand and supply actually exist. A player who
// simply hasn't bought a breaker yet (zero supply) reads as maximum
// imbalance by the raw math, but that's just not having started --
// not instability -- so it must never trigger a collapse on its own.
// Without this, buying your very first nail maker before your first
// breaker (or vice versa) would eventually wipe it right back out.
// ----------------------------------------------------------------

function swarmUpdateCollapse(dt) {
  var bothSidesActive = ironDemandRate() > 0 && ironSupplyRate() > 0;
  var imbalance = swarmImbalanceMagnitude();
  if (bothSidesActive && imbalance >= SWARM_COLLAPSE_IMBALANCE_THRESHOLD) {
    swarmCollapseSustain += dt;
    swarmGreying = true;
    if (swarmCollapseSustain >= SWARM_COLLAPSE_SUSTAIN_SEC) {
      swarmCollapse();
    }
  } else {
    // Decays back down rather than resetting to zero instantly -- a
    // single frame dipping just under the threshold (very plausible
    // while the player is actively correcting it) shouldn't throw away
    // all the sustained progress built up so far.
    swarmCollapseSustain = Math.max(0, swarmCollapseSustain - dt * 2);
    swarmGreying = swarmCollapseSustain > 0;
  }
}

function swarmCollapse() {
  swarmCollapseSustain = 0;
  swarmGreying = false;

  var majority = swarmMajoritySide();
  var majorityCount = majority === "maker" ? state.nailMakers : state.breakers;
  // Solve in iron rates: a maker and a breaker do not necessarily
  // contribute the same amount of capacity.
  var minorityRate = majority === "maker" ? ironSupplyRate() : ironDemandRate();
  var perUnitRate = majority === "maker"
    ? nailMakerRateEffective() * IRON_PER_NAIL
    : breakerIntakeEffective() * activeIronTileCount();
  var targetMajority = perUnitRate > 0 ? minorityRate / perUnitRate : majorityCount;
  var lowerCount = Math.floor(targetMajority);
  var upperCount = Math.min(majorityCount, Math.ceil(targetMajority));
  var lowerImbalance = Math.abs((lowerCount * perUnitRate - minorityRate) / (lowerCount * perUnitRate + minorityRate));
  var upperImbalance = Math.abs((upperCount * perUnitRate - minorityRate) / (upperCount * perUnitRate + minorityRate));
  var remainingMajority = upperImbalance < lowerImbalance ? upperCount : lowerCount;
  var destroyed = Math.max(0, majorityCount - remainingMajority);

  if (majority === "maker") {
    state.nailMakers = Math.max(0, state.nailMakers - destroyed);
    state.factoryProgress = Math.min(state.factoryProgress || 0, state.factories);
  } else {
    state.breakers = Math.max(0, state.breakers - destroyed);
  }

  state.isotopeStock += SWARM_COLLAPSE_FUEL_GAIN;
  state.swarmCollapses = (state.swarmCollapses || 0) + 1;
  state.unlockedCity = true; // the skyline unlocks the first time the player destabilizes the swarm this hard

  swarmFlashHint("unstable core formed -- destroyed " + fmtInt(destroyed) + " " + majority + "s", 2000);
  render();
}

function swarmStep(nowMs) {
  if (!swarmCtx) return;
  if (!state.unlockedSwarm) {
    swarmLastFrameMs = null;
    requestAnimationFrame(swarmStep);
    return;
  }

  var dt = swarmLastFrameMs != null ? Math.min(0.1, (nowMs - swarmLastFrameMs) / 1000) : 1 / 60;
  swarmLastFrameMs = nowMs;

  swarmSyncDots();
  swarmUpdateCollapse(dt);

  var fleeMult = swarmFleeMultiplier();
  var imbalanceSpeedMult = 1 + SWARM_IMBALANCE_SPEED_BONUS * Math.abs(ironStructuralImbalance());
  var now = Date.now();

  var statusInfo = swarmStatusInfo();
  if (el.swarmStatus) el.swarmStatus.textContent = statusInfo.label + (swarmGreying ? " \u2014 unstable!" : "");
  if (el.swarmAdvice) el.swarmAdvice.textContent = statusInfo.advice;
  if (el.swarmDotCounts) {
    var whiteDots = swarmCountMakerDots();
    el.swarmDotCounts.textContent = swarmDots.length + " balls: " + whiteDots + " white (makers) \u00b7 " + (swarmDots.length - whiteDots) + " black (breakers)";
  }

  if (el.swarmIronRates) {
    el.swarmIronRates.textContent = "iron: " + fmtWeight(ironSupplyRate()) + "/s made \u00b7 " + fmtWeight(ironDemandRate()) + "/s used";
  }
  if (el.swarmUnitCounts) {
    var statusNote = "";
    if (swarmGreying) statusNote = " \u00b7 UNSTABLE -- collapsing soon";
    el.swarmUnitCounts.textContent = fmtInt(state.nailMakers) + " makers \u00b7 " + fmtInt(state.breakers) + " breakers" + statusNote;
  }

  swarmCtx.clearRect(0, 0, swarmWidth, swarmHeight);
  swarmCtx.strokeStyle = "#000";
  swarmCtx.lineWidth = 1;
  swarmCtx.strokeRect(0.5, 0.5, swarmWidth - 1, swarmHeight - 1);

  if (swarmGreying) {
    var flash = 0.08 + 0.08 * Math.abs(Math.sin(nowMs / 120));
    swarmCtx.fillStyle = "#000";
    swarmCtx.globalAlpha = flash;
    swarmCtx.fillRect(0, 0, swarmWidth, swarmHeight);
    swarmCtx.globalAlpha = 1;
  }

  for (var i = 0; i < swarmDots.length; i++) {
    var d = swarmDots[i];

    // Flee: push away from the cursor, stronger the closer the dot is,
    // scaled by the current imbalance-driven flee multiplier. Stunned
    // dots (just hit) ignore this so chaining a hit isn't punished.
    if (swarmMouseX !== null && now >= d.stunUntil) {
      var dx = d.x - swarmMouseX;
      var dy = d.y - swarmMouseY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0 && dist < SWARM_FLEE_RADIUS) {
        var pushStrength = (1 - dist / SWARM_FLEE_RADIUS) * SWARM_FLEE_FORCE * fleeMult;
        d.vx += (dx / dist) * pushStrength;
        d.vy += (dy / dist) * pushStrength;
      }
    }

    var dotSpeedMult = (d.speedy ? SWARM_MAJORITY_SPEED_MULT : 1) * imbalanceSpeedMult;
    d.x += d.vx * dotSpeedMult;
    d.y += d.vy * dotSpeedMult;

    // Wall-bounce always wins over flee -- a dot inside the margin gets
    // pushed back regardless of what flee just did, so dots can't pin
    // themselves shaking against an edge or corner.
    if (d.x < SWARM_DOT_RADIUS) { d.x = SWARM_DOT_RADIUS; d.vx = Math.abs(d.vx); }
    if (d.x > swarmWidth - SWARM_DOT_RADIUS) { d.x = swarmWidth - SWARM_DOT_RADIUS; d.vx = -Math.abs(d.vx); }
    if (d.y < SWARM_DOT_RADIUS) { d.y = SWARM_DOT_RADIUS; d.vy = Math.abs(d.vy); }
    if (d.y > swarmHeight - SWARM_DOT_RADIUS) { d.y = swarmHeight - SWARM_DOT_RADIUS; d.vy = -Math.abs(d.vy); }

    // Gently bleed off any flee-boosted speed back toward base drift
    // speed so dots don't stay hyped-up forever after a chase.
    var curSpeed = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
    if (curSpeed > SWARM_BASE_SPEED) {
      var decay = 0.02;
      var scale = 1 - decay * (1 - SWARM_BASE_SPEED / curSpeed);
      d.vx *= scale;
      d.vy *= scale;
    }

    swarmCtx.beginPath();
    swarmCtx.arc(d.x, d.y, d.speedy ? SWARM_DOT_RADIUS + 0.6 : SWARM_DOT_RADIUS, 0, Math.PI * 2);
    swarmCtx.fillStyle = swarmColorFor(d.side);
    if (swarmGreying) { swarmCtx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(nowMs / 120 + i)); }
    swarmCtx.fill();
    swarmCtx.globalAlpha = 1;
    swarmCtx.lineWidth = d.speedy ? 1.6 : 1;
    swarmCtx.stroke();
  }

  requestAnimationFrame(swarmStep);
}

var swarmBaseHint = null;
var swarmHintTimer = null;

// Shows a message in the hint line for a moment, then puts the ORIGINAL
// hint back. (It used to remember whatever text was showing at the time,
// so clicking again mid-flash could leave a stale message stuck there.)
function swarmFlashHint(text, duration) {
  if (!el.swarmCostHint) return;
  if (swarmBaseHint === null) swarmBaseHint = el.swarmCostHint.textContent;
  el.swarmCostHint.textContent = text;
  clearTimeout(swarmHintTimer);
  swarmHintTimer = setTimeout(function () {
    swarmHintTimer = null;
    if (el.swarmCostHint) el.swarmCostHint.textContent = swarmBaseHint;
  }, duration || 1200);
}

// A flip that isn't possible doesn't just fail: the ball is flung away from
// where you clicked, rejecting you.
function swarmRejectDot(d, mx, my) {
  var dx = d.x - mx, dy = d.y - my;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) {
    var a = Math.random() * Math.PI * 2;
    dx = Math.cos(a); dy = Math.sin(a); len = 1;
  }
  d.vx = (dx / len) * SWARM_REJECT_SPEED;
  d.vy = (dy / len) * SWARM_REJECT_SPEED;
  d.stunUntil = Date.now() + 700; // flee logic stays out of its way while it flies
}

// ----------------------------------------------------------------
// Flipping a ball is a TRADE, not a purchase. It scrapes machines of one
// type and rebuilds their value as the other, at the factory's own
// exchange rate (a breaker costs a factory 1,000 g of copper and a maker
// 100 g, so 1 breaker <-> 10 makers) minus SWARM_CONVERSION_LOSS. It costs
// no copper and creates no new value: factories stay the only way to grow.
//
//   black ball -> white: scrap breakers, get makers   (10 breakers -> 80 makers at 20% loss)
//   white ball -> black: scrap makers, get breakers   (12.5 makers -> 1 breaker at 20% loss)
//
// How many machines are scrapped is the smallest number that moves the
// real iron split onto the new ball split (one ball's worth).
// ----------------------------------------------------------------

function swarmMakersPerBreaker() {
  return (FACTORY_COST_BREAKER_SIDE_COPPER / FACTORY_COST_MAKER_SIDE_COPPER) * (1 - SWARM_CONVERSION_LOSS);
}

function swarmBreakersPerMaker() {
  return (FACTORY_COST_MAKER_SIDE_COPPER / FACTORY_COST_BREAKER_SIDE_COPPER) * (1 - SWARM_CONVERSION_LOSS);
}

// Black -> white. Scrap k breakers for floor(k * r) makers, k as small as
// possible while demand/supply reaches lowerRatio. Always keeps one breaker.
function swarmPlanToMakers(lowerRatio) {
  var owned = state.breakers;
  var m = nailMakerRateEffective() * IRON_PER_NAIL;
  var b = breakerIntakeEffective() * activeIronTileCount();
  if (m <= 0) return { why: "turn on your nail makers first" };
  if (b <= 0) return { why: "turn on your breakers (and find some iron) first" };
  if (owned < 2) return { why: "you need breakers to scrap into makers" };

  var D = ironDemandRate(), S = ironSupplyRate(), r = swarmMakersPerBreaker();
  function gainFor(k) { return Math.floor(k * r + 1e-9); }
  function reaches(k) {
    var s2 = S - k * b;
    return gainFor(k) >= 1 && s2 > 0 && (D + gainFor(k) * m) / s2 >= lowerRatio;
  }

  var k = Math.max(1, Math.ceil((lowerRatio * S - D) / (r * m + lowerRatio * b) - 1e-9));
  var guard = 0;
  while (k <= owned - 1 && !reaches(k) && guard++ < 5000) k++;
  if (k > owned - 1 || !reaches(k)) return { why: "not enough breakers to scrap for that" };
  return { from: "breaker", scrap: k, gain: gainFor(k) };
}

// White -> black. Gain g whole breakers by scrapping ceil(g / r) makers, g as
// small as possible while demand/supply drops to upperRatio. Keeps one maker.
function swarmPlanToBreakers(upperRatio) {
  var owned = state.nailMakers;
  var m = nailMakerRateEffective() * IRON_PER_NAIL;
  var b = breakerIntakeEffective() * activeIronTileCount();
  if (m <= 0) return { why: "turn on your nail makers first" };
  if (b <= 0) return { why: "turn on your breakers (and find some iron) first" };
  if (owned < 2) return { why: "you need nail makers to scrap into breakers" };

  var D = ironDemandRate(), S = ironSupplyRate(), r = swarmBreakersPerMaker();
  function scrapFor(g) { return Math.ceil(g / r - 1e-9); }
  function reaches(g) {
    var d2 = D - scrapFor(g) * m;
    return d2 > 0 && d2 / (S + g * b) <= upperRatio;
  }

  var g = Math.max(1, Math.ceil((D - upperRatio * S) / (m / r + upperRatio * b) - 1e-9));
  var guard = 0;
  while (scrapFor(g) <= owned - 1 && !reaches(g) && guard++ < 5000) g++;
  if (scrapFor(g) > owned - 1 || !reaches(g)) return { why: "not enough nail makers to scrap for that" };
  return { from: "maker", scrap: scrapFor(g), gain: g };
}

function swarmHandleClick(mx, my) {
  var now = Date.now();
  if (now - swarmLastClickAt < SWARM_CLICK_COOLDOWN_MS) return;

  for (var i = 0; i < swarmDots.length; i++) {
    var d = swarmDots[i];
    var dx = d.x - mx, dy = d.y - my;
    if (dx * dx + dy * dy > (SWARM_DOT_RADIUS + 6) * (SWARM_DOT_RADIUS + 6)) continue;

    var makerDots = swarmCountMakerDots();
    var targetMakerDots = makerDots + (d.side === "maker" ? -1 : 1);
    var maxMakerDots = SWARM_DISPLAY_DOTS - SWARM_MIN_MINORITY_DOTS;
    if (targetMakerDots > maxMakerDots || targetMakerDots < SWARM_MIN_MINORITY_DOTS) {
      swarmLastClickAt = now;
      swarmFlashHint("the swarm can't show a more lopsided split than this");
      return;
    }

    var half = SWARM_DISPLAY_DOTS / 2;
    var skewDots = swarmMaxSkewDots();
    var plan;

    // The dots show a log scale of demand:supply, so a target dot count maps
    // back to a demand:supply ratio of SWARM_FULL_SKEW_RATIO ^ ((dots - 15) / 12).
    if (targetMakerDots < makerDots) {
      plan = swarmPlanToBreakers(Math.pow(SWARM_FULL_SKEW_RATIO, (targetMakerDots + 0.5 - half) / skewDots));
    } else {
      plan = swarmPlanToMakers(Math.pow(SWARM_FULL_SKEW_RATIO, (targetMakerDots - 0.5 - half) / skewDots));
    }

    swarmLastClickAt = now;
    if (!plan.from) {
      swarmRejectDot(d, mx, my);
      swarmFlashHint(plan.why);
      return;
    }

    d.stunUntil = now + SWARM_STUN_MS;
    if (plan.from === "breaker") {
      state.breakers -= plan.scrap;
      state.nailMakers += plan.gain;
      swarmFlashHint("scrapped " + fmtInt(plan.scrap) + " breakers into " + fmtInt(plan.gain) + " makers (" + Math.round(SWARM_CONVERSION_LOSS * 100) + "% lost)", 1800);
    } else {
      state.nailMakers -= plan.scrap;
      state.breakers += plan.gain;
      swarmFlashHint("scrapped " + fmtInt(plan.scrap) + " makers into " + fmtInt(plan.gain) + " breakers (" + Math.round(SWARM_CONVERSION_LOSS * 100) + "% lost)", 1800);
    }

    d.side = d.side === "maker" ? "breaker" : "maker";
    d.speedy = false;
    if (state.breakers > 0) state.unlockedMap = true;
    render();
    return;
  }
}

function swarmInit() {
  swarmCanvasEl = el.swarmCanvas;
  if (!swarmCanvasEl) return;
  swarmCtx = swarmCanvasEl.getContext("2d");
  swarmWidth = swarmCanvasEl.width;
  swarmHeight = swarmCanvasEl.height;

  swarmCanvasEl.addEventListener("click", function (e) {
    var rect = swarmCanvasEl.getBoundingClientRect();
    var scaleX = swarmWidth / rect.width;
    var scaleY = swarmHeight / rect.height;
    var mx = (e.clientX - rect.left) * scaleX;
    var my = (e.clientY - rect.top) * scaleY;
    swarmHandleClick(mx, my);
  });

  swarmCanvasEl.addEventListener("pointermove", function (e) {
    var rect = swarmCanvasEl.getBoundingClientRect();
    var scaleX = swarmWidth / rect.width;
    var scaleY = swarmHeight / rect.height;
    swarmMouseX = (e.clientX - rect.left) * scaleX;
    swarmMouseY = (e.clientY - rect.top) * scaleY;
  });

  swarmCanvasEl.addEventListener("pointerleave", function () {
    swarmMouseX = null;
    swarmMouseY = null;
  });

  requestAnimationFrame(swarmStep);
}

swarmInit();
