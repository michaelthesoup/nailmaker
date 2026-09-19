"use strict";

// ----------------------------------------------------------------
// The Foundry Swarm. A small always-visible panel next to yin & yang.
// Dots represent the live ratio of nail makers (light) to nail
// breakers (dark) -- a fixed number of dots on screen regardless of
// scale, split proportionally to your real counts. Drift speed is
// tied to the same structural iron demand/supply imbalance yin & yang
// itself is built on, so a lopsided economy visibly goes chaotic.
//
// Clicking a dot does NOT convert it 1:1. Instead it farms a BATCH of
// the OPPOSITE type, sized as a percentage of how many of the clicked
// type you currently have -- the clicked unit itself isn't removed.
// This makes the swarm a genuine second way to gain makers/breakers,
// alongside (not instead of) buying and factories: the more lopsided
// your build already is, the bigger every successful click pays out
// on the dominant side, which is also the side that's hardest to hit
// since imbalance is what speeds the dots up in the first place.
// A funds cost (matching the normal build cost of the batch) and a
// short cooldown keep this from being spammed for free.
// ----------------------------------------------------------------

var SWARM_DISPLAY_DOTS = 20; // fixed dot count on screen, regardless of real scale
var SWARM_DOT_RADIUS = 4;
var SWARM_BASE_SPEED = 0.25; // px/frame at perfect balance
var SWARM_SPEED_IMBALANCE_K = 9; // how much extra speed max imbalance adds
var SWARM_FARM_RATE = 0.1; // batch size = this fraction of the clicked type's current count
var SWARM_CLICK_COOLDOWN_MS = 300;

var swarmDots = []; // { x, y, vx, vy, side: 'maker' | 'breaker' }
var swarmCanvasEl = null;
var swarmCtx = null;
var swarmWidth = 192;
var swarmHeight = 160;
var swarmLastClickAt = 0;

function swarmIronDemandRate() {
  return state.nailMakers * nailMakerRateEffective() * IRON_PER_NAIL;
}

function swarmIronSupplyRate() {
  return breakerTheoreticalRates().ironRate;
}

// -1 (all supply, yin-leaning) .. 0 (balanced) .. +1 (all demand, yang-leaning)
function swarmImbalance() {
  var demand = swarmIronDemandRate();
  var supply = swarmIronSupplyRate();
  var total = demand + supply;
  if (total <= 0) return 0;
  return (demand - supply) / total;
}

function swarmSpeedMultiplier() {
  var imbalance = swarmImbalance();
  return 1 + SWARM_SPEED_IMBALANCE_K * imbalance * imbalance;
}

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
    side: side
  };
}

// Dots are a fixed-size sample of the current maker:breaker RATIO, not
// a 1:1 map to real units -- so the swarm stays readable at any scale.
// Re-splits the existing dot pool toward the new ratio each sync,
// re-using dots (just relabeling side) rather than respawning
// everything, so drift stays smooth frame to frame.
function swarmSyncDots() {
  while (swarmDots.length < SWARM_DISPLAY_DOTS) {
    swarmDots.push(swarmSpawnDot(Math.random() < 0.5 ? "maker" : "breaker"));
  }
  while (swarmDots.length > SWARM_DISPLAY_DOTS) {
    swarmDots.pop();
  }

  var totalUnits = state.nailMakers + state.breakers;
  var makerFraction = totalUnits > 0 ? state.nailMakers / totalUnits : 0.5;
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
}

function swarmColorFor(side) {
  return side === "maker" ? "#fff" : "#000";
}

function swarmStep() {
  if (!swarmCtx) return;
  if (!state.unlockedYinYang) {
    requestAnimationFrame(swarmStep);
    return;
  }

  swarmSyncDots();
  var speedMult = swarmSpeedMultiplier();

  swarmCtx.clearRect(0, 0, swarmWidth, swarmHeight);
  swarmCtx.strokeStyle = "#000";
  swarmCtx.lineWidth = 1;
  swarmCtx.strokeRect(0.5, 0.5, swarmWidth - 1, swarmHeight - 1);

  for (var i = 0; i < swarmDots.length; i++) {
    var d = swarmDots[i];
    d.x += d.vx * speedMult;
    d.y += d.vy * speedMult;
    if (d.x < SWARM_DOT_RADIUS || d.x > swarmWidth - SWARM_DOT_RADIUS) d.vx *= -1;
    if (d.y < SWARM_DOT_RADIUS || d.y > swarmHeight - SWARM_DOT_RADIUS) d.vy *= -1;

    swarmCtx.beginPath();
    swarmCtx.arc(d.x, d.y, SWARM_DOT_RADIUS, 0, Math.PI * 2);
    swarmCtx.fillStyle = swarmColorFor(d.side);
    swarmCtx.fill();
    swarmCtx.stroke();
  }

  if (el.swarmRatio) {
    el.swarmRatio.textContent = Math.floor(state.nailMakers) + " makers / " + Math.floor(state.breakers) + " breakers";
  }

  requestAnimationFrame(swarmStep);
}

// Batch size farmed when clicking a dot of `clickedSide`: a percentage
// of the CLICKED type's current count, granted as units of the
// OPPOSITE type. The clicked type itself is never reduced.
function swarmBatchSize(clickedSide) {
  var sourceCount = clickedSide === "maker" ? state.nailMakers : state.breakers;
  return Math.max(1, Math.round(sourceCount * SWARM_FARM_RATE));
}

function swarmBatchCost(clickedSide, batchSize) {
  var unitCost = clickedSide === "maker" ? breakerBuildCostEffective() : nailMakerCostEffective();
  return round2(unitCost * batchSize);
}

function swarmFlashHint(text, duration) {
  if (!el.swarmCostHint) return;
  var old = el.swarmCostHint.textContent;
  el.swarmCostHint.textContent = text;
  setTimeout(function () {
    if (el.swarmCostHint) el.swarmCostHint.textContent = old;
  }, duration || 1200);
}

function swarmHandleClick(mx, my) {
  var now = Date.now();
  if (now - swarmLastClickAt < SWARM_CLICK_COOLDOWN_MS) return;

  for (var i = 0; i < swarmDots.length; i++) {
    var d = swarmDots[i];
    var dx = d.x - mx, dy = d.y - my;
    if (dx * dx + dy * dy > (SWARM_DOT_RADIUS + 3) * (SWARM_DOT_RADIUS + 3)) continue;

    var batchSize = swarmBatchSize(d.side);
    var cost = swarmBatchCost(d.side, batchSize);

    if (state.funds < cost) {
      swarmFlashHint("not enough funds (" + fmtMoney(cost) + " for +" + batchSize + ")");
      return;
    }

    swarmLastClickAt = now;
    state.funds -= cost;

    if (d.side === "maker") {
      state.breakers += batchSize;
      swarmFlashHint("+" + batchSize + " breakers (" + fmtMoney(cost) + ")", 1000);
    } else {
      state.nailMakers += batchSize;
      swarmFlashHint("+" + batchSize + " makers (" + fmtMoney(cost) + ")", 1000);
    }

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

  requestAnimationFrame(swarmStep);
}

swarmInit();
