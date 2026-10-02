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
// Clicking any dot flips its color and buys enough of the opposite
// machine type to make the real rate split match the resulting colors.
//
// Push the real imbalance far enough (SWARM_COLLAPSE_IMBALANCE_THRESHOLD)
// and HOLD it there for a sustained moment, and the whole swarm greys
// out and collapses into an unstable core: it destroys enough of the
// overrepresented type to meaningfully correct the real ratio, and
// banks one isotope core (state.isotopeStock), which together with
// unsold nails is what the foundry core (see city.js) needs to arm a
// nailbomb. Copper pays for each balancing conversion.
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

  var demand = ironDemandRate();
  var supply = ironSupplyRate();
  var total = demand + supply;
  var makerFraction = total > 0 ? demand / total : 0.5;
  var wantMakerDots = Math.round(makerFraction * SWARM_DISPLAY_DOTS);

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
// overrepresented type to bring actual iron rates back toward the
// survivable target.
// ----------------------------------------------------------------

function swarmUpdateCollapse(dt) {
  var imbalance = swarmImbalanceMagnitude();
  if (imbalance >= SWARM_COLLAPSE_IMBALANCE_THRESHOLD) {
    swarmCollapseSustain += dt;
    swarmGreying = true;
    if (swarmCollapseSustain >= SWARM_COLLAPSE_SUSTAIN_SEC) {
      swarmCollapse();
    }
  } else {
    swarmCollapseSustain = 0;
    swarmGreying = false;
  }
}

function swarmCollapse() {
  swarmCollapseSustain = 0;
  swarmGreying = false;

  var majority = swarmMajoritySide();
  var majorityCount = majority === "maker" ? state.nailMakers : state.breakers;
  // Solve in iron rates: a maker and a breaker do not necessarily
  // contribute the same amount of capacity.
  var t = SWARM_COLLAPSE_POST_IMBALANCE_TARGET;
  var minorityRate = majority === "maker" ? ironSupplyRate() : ironDemandRate();
  var targetMajorityRate = minorityRate * (1 + t) / Math.max(0.0001, 1 - t);
  var perUnitRate = majority === "maker"
    ? nailMakerRateEffective() * IRON_PER_NAIL
    : breakerIntakeEffective() * activeIronTileCount();
  var targetMajority = perUnitRate > 0 ? targetMajorityRate / perUnitRate : majorityCount;
  var destroyed = Math.max(0, Math.round(majorityCount - targetMajority));

  if (majority === "maker") {
    state.nailMakers = Math.max(0, state.nailMakers - destroyed);
    while (state.factoryTimers && state.factoryTimers.length > state.factories) state.factoryTimers.pop();
  } else {
    state.breakers = Math.max(0, state.breakers - destroyed);
  }

  state.isotopeStock += SWARM_COLLAPSE_FUEL_GAIN;

  swarmFlashHint("unstable core formed -- destroyed " + fmtInt(destroyed) + " " + majority + "s, +" + SWARM_COLLAPSE_FUEL_GAIN + " isotope core", 2000);
  render();
}

function swarmStep(nowMs) {
  if (!swarmCtx) return;
  if (!state.unlockedYinYang) {
    swarmLastFrameMs = null;
    requestAnimationFrame(swarmStep);
    return;
  }

  var dt = swarmLastFrameMs != null ? Math.min(0.1, (nowMs - swarmLastFrameMs) / 1000) : 1 / 60;
  swarmLastFrameMs = nowMs;

  swarmSyncDots();
  swarmUpdateCollapse(dt);

  var fleeMult = swarmFleeMultiplier();
  var now = Date.now();

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

    var dotSpeedMult = d.speedy ? SWARM_MAJORITY_SPEED_MULT : 1;
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

function swarmFlashHint(text, duration) {
  if (!el.swarmCostHint) return;
  var old = el.swarmCostHint.textContent;
  el.swarmCostHint.textContent = text;
  setTimeout(function () {
    if (el.swarmCostHint) el.swarmCostHint.textContent = old;
  }, duration || 1200);
}

// Clicking any dot flips its color. Copper buys the opposite machine
// capacity needed to move the real rate split to that visible ratio.
function swarmHandleClick(mx, my) {
  var now = Date.now();
  if (now - swarmLastClickAt < SWARM_CLICK_COOLDOWN_MS) return;

  for (var i = 0; i < swarmDots.length; i++) {
    var d = swarmDots[i];
    var dx = d.x - mx, dy = d.y - my;
    if (dx * dx + dy * dy > (SWARM_DOT_RADIUS + 6) * (SWARM_DOT_RADIUS + 6)) continue;

    var makerDots = swarmDots.filter(function (dot) { return dot.side === "maker"; }).length;
    var targetMakerDots = makerDots + (d.side === "maker" ? -1 : 1);
    var demand = ironDemandRate();
    var supply = ironSupplyRate();
    var machineType;
    var perUnitRate;
    var machinesNeeded;

    if (targetMakerDots < makerDots) {
      machineType = "breaker";
      perUnitRate = breakerIntakeEffective() * activeIronTileCount();
      var upperMakerFraction = (targetMakerDots + 0.5) / SWARM_DISPLAY_DOTS;
      var requiredSupply = demand * (1 - upperMakerFraction) / upperMakerFraction;
      machinesNeeded = Math.max(1, Math.floor((requiredSupply - supply) / perUnitRate) + 1);
    } else {
      machineType = "maker";
      perUnitRate = nailMakerRateEffective() * IRON_PER_NAIL;
      var lowerMakerFraction = (targetMakerDots - 0.5) / SWARM_DISPLAY_DOTS;
      var requiredDemand = supply * lowerMakerFraction / (1 - lowerMakerFraction);
      machinesNeeded = Math.max(1, Math.ceil((requiredDemand - demand) / perUnitRate));
    }

    if (perUnitRate <= 0 || !isFinite(machinesNeeded)) {
      swarmFlashHint("turn on " + (machineType === "maker" ? "nail makers" : "breakers") + " to change the ratio");
      return;
    }

    var unitCopperCost = machineType === "maker" ? FACTORY_COST_MAKER_SIDE_COPPER : FACTORY_COST_BREAKER_SIDE_COPPER;
    var cost = unitCopperCost * machinesNeeded;

    if (state.copperAmt < cost) {
      swarmFlashHint("not enough copper (" + fmtWeight(cost) + " for " + fmtInt(machinesNeeded) + " " + machineType + "s)");
      return;
    }

    swarmLastClickAt = now;
    state.copperAmt -= cost;
    d.stunUntil = now + SWARM_STUN_MS;

    if (machineType === "maker") {
      state.nailMakers += machinesNeeded;
    } else {
      state.breakers += machinesNeeded;
    }

    d.side = d.side === "maker" ? "breaker" : "maker";
    d.speedy = false;
    swarmFlashHint("added " + fmtInt(machinesNeeded) + " " + machineType + "s to match the new ratio (" + fmtWeight(cost) + ")", 1200);

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
