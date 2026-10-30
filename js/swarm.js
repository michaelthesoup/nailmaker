"use strict";

var SWARM_DISPLAY_DOTS = 30;
var SWARM_DOT_RADIUS = 3;
var SWARM_BASE_SPEED = 0.25;
var SWARM_CLICK_COOLDOWN_MS = 250;
var SWARM_CONVERSION_LOSS = 0;

var SWARM_FULL_SKEW_RATIO = 50;
var SWARM_MIN_MINORITY_DOTS = 3;
var SWARM_REJECT_SPEED = 5;

var SWARM_FLEE_RADIUS = 55;
var SWARM_FLEE_MIN_MULT = 0.05;
var SWARM_FLEE_MAX_MULT = 0.4;
var SWARM_FLEE_FORCE = 0.35;
var SWARM_STUN_MS = 350;

var swarmDots = [];
var swarmCanvasEl = null;
var swarmCtx = null;
var swarmWidth = 288;
var swarmHeight = 224;
var swarmLastClickAt = 0;
var swarmMouseX = null;
var swarmMouseY = null;
var swarmLastFrameMs = null;

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

function swarmMajoritySide() {
  return makersAhead() ? "maker" : "breaker";
}

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

  var even = ironDemandRate() === ironSupplyRate();
  var majority = swarmMajoritySide();
  for (i = 0; i < swarmDots.length; i++) {
    swarmDots[i].speedy = !even && swarmDots[i].side === majority;
  }
}

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

function swarmStatusInfo() {
  if (ironDemandRate() <= 0 && ironSupplyRate() <= 0) {
    return { label: "nothing running yet" };
  }
  return { label: makersAhead() ? "makers > breakers" : "makers < breakers" };
}

function swarmImbalanceMagnitude() {
  return Math.abs(ironStructuralImbalance());
}

function swarmFleeMultiplier() {
  var imbalance = swarmImbalanceMagnitude();
  return SWARM_FLEE_MIN_MULT + (SWARM_FLEE_MAX_MULT - SWARM_FLEE_MIN_MULT) * imbalance;
}

function swarmColorFor(side) {
  return side === "maker" ? "#fff" : "#000";
}

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
    swarmCollapseSustain = Math.max(0, swarmCollapseSustain - dt * 2);
    swarmGreying = swarmCollapseSustain > 0;
  }
}

function swarmCollapse() {
  swarmCollapseSustain = 0;
  swarmGreying = false;

  var majority = swarmMajoritySide();
  var majorityCount = majority === "maker" ? state.nailMakers : state.breakers;
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
  state.unlockedCity = true;

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
  if (el.swarmDotCounts) {
    var whiteDots = swarmCountMakerDots();
    el.swarmDotCounts.textContent = swarmDots.length + " balls: " + whiteDots + " white (makers) \u00b7 " + (swarmDots.length - whiteDots) + " black (breakers)";
  }

  if (el.swarmIronRates) {
    el.swarmIronRates.textContent = "iron: " + fmtRate(ironSupplyRate()) + "/s made \u00b7 " + fmtRate(ironDemandRate()) + "/s used";
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

    if (d.x < SWARM_DOT_RADIUS) { d.x = SWARM_DOT_RADIUS; d.vx = Math.abs(d.vx); }
    if (d.x > swarmWidth - SWARM_DOT_RADIUS) { d.x = swarmWidth - SWARM_DOT_RADIUS; d.vx = -Math.abs(d.vx); }
    if (d.y < SWARM_DOT_RADIUS) { d.y = SWARM_DOT_RADIUS; d.vy = Math.abs(d.vy); }
    if (d.y > swarmHeight - SWARM_DOT_RADIUS) { d.y = swarmHeight - SWARM_DOT_RADIUS; d.vy = -Math.abs(d.vy); }

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

function swarmRejectDot(d, mx, my) {
  var dx = d.x - mx, dy = d.y - my;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) {
    var a = Math.random() * Math.PI * 2;
    dx = Math.cos(a); dy = Math.sin(a); len = 1;
  }
  d.vx = (dx / len) * SWARM_REJECT_SPEED;
  d.vy = (dy / len) * SWARM_REJECT_SPEED;
  d.stunUntil = Date.now() + 700;
}

function swarmLossNote() {
  return SWARM_CONVERSION_LOSS > 0 ? " (" + Math.round(SWARM_CONVERSION_LOSS * 100) + "% lost)" : "";
}

function swarmMakersPerBreaker() {
  return (FACTORY_COST_BREAKER_SIDE_COPPER / FACTORY_COST_MAKER_SIDE_COPPER) * (1 - SWARM_CONVERSION_LOSS);
}

function swarmBreakersPerMaker() {
  return (FACTORY_COST_MAKER_SIDE_COPPER / FACTORY_COST_BREAKER_SIDE_COPPER) * (1 - SWARM_CONVERSION_LOSS);
}

function swarmPlanToMakers(lowerRatio) {
  var owned = state.breakers;
  var m = nailMakerRateEffective() * IRON_PER_NAIL;
  var b = breakerIntakeEffective() * activeIronTileCount();
  if (m <= 0) return { why: "turn on your nail makers first" };
  if (b <= 0) return { why: "turn on your breakers (and find some iron) first" };
  if (owned < 2) return { why: "you need breakers to convert into makers" };

  var D = ironDemandRate(), S = ironSupplyRate(), r = swarmMakersPerBreaker();
  function gainFor(k) { return Math.floor(k * r + 1e-9); }
  function reaches(k) {
    var s2 = S - k * b;
    return gainFor(k) >= 1 && s2 > 0 && (D + gainFor(k) * m) / s2 >= lowerRatio;
  }

  var k = Math.max(1, Math.ceil((lowerRatio * S - D) / (r * m + lowerRatio * b) - 1e-9));
  var guard = 0;
  while (k <= owned - 1 && !reaches(k) && guard++ < 5000) k++;
  if (k > owned - 1 || !reaches(k)) return { why: "not enough breakers to convert for that" };
  return { from: "breaker", scrap: k, gain: gainFor(k) };
}

function swarmPlanToBreakers(upperRatio) {
  var owned = state.nailMakers;
  var m = nailMakerRateEffective() * IRON_PER_NAIL;
  var b = breakerIntakeEffective() * activeIronTileCount();
  if (m <= 0) return { why: "turn on your nail makers first" };
  if (b <= 0) return { why: "turn on your breakers (and find some iron) first" };
  if (owned < 2) return { why: "you need nail makers to convert into breakers" };

  var D = ironDemandRate(), S = ironSupplyRate(), r = swarmBreakersPerMaker();
  function scrapFor(g) { return Math.ceil(g / r - 1e-9); }
  function reaches(g) {
    var d2 = D - scrapFor(g) * m;
    return d2 > 0 && d2 / (S + g * b) <= upperRatio;
  }

  var g = Math.max(1, Math.ceil((D - upperRatio * S) / (m / r + upperRatio * b) - 1e-9));
  var guard = 0;
  while (scrapFor(g) <= owned - 1 && !reaches(g) && guard++ < 5000) g++;
  if (scrapFor(g) > owned - 1 || !reaches(g)) return { why: "not enough nail makers to convert for that" };
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
      swarmFlashHint("converted " + fmtInt(plan.scrap) + " breakers into " + fmtInt(plan.gain) + " makers" + swarmLossNote(), 1800);
    } else {
      state.nailMakers -= plan.scrap;
      state.breakers += plan.gain;
      swarmFlashHint("converted " + fmtInt(plan.scrap) + " makers into " + fmtInt(plan.gain) + " breakers" + swarmLossNote(), 1800);
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
