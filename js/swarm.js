"use strict";

// ----------------------------------------------------------------
// The Foundry Swarm. A small always-visible panel next to yin & yang.
//
// The dots are a LIVE readout of the real economy: 10 white / 10 black
// means your nail-maker count and breaker count are EXACTLY at the
// ratio where iron production and consumption match. All black means
// you have far more breaker capacity than your makers can use; all
// white means the reverse. This updates every frame from the real
// numbers -- it is not something the player sets by clicking, it's
// something clicking CHANGES by altering the real economy underneath.
//
// Clicking a dot grants a chunk of the type needed to close the actual
// gap between your current counts and the exact balance point -- e.g.
// if reaching balance would take 4,000 more nail makers, a click
// grants a real fraction of that 4,000, not a token +1 or a flat
// percentage disconnected from how far off you actually are. That's
// why a badly skewed economy needs several big clicks and a nearly
// balanced one only needs small nudges: the grant size IS the size of
// the real problem. The exact numbers are never shown -- the board is
// small, dots are small and constantly drifting, so it has to be
// judged by eye, not read off a counter.
//
// Drift SPEED is inverted from what you might expect: perfect real
// balance is the FASTEST the dots move (hardest to click precisely --
// holding the ideal is a constant, active effort), while a badly
// skewed economy slows them down (easy to see and easy to act on).
// ----------------------------------------------------------------

var SWARM_DISPLAY_DOTS = 20;
var SWARM_DOT_RADIUS = 3;
var SWARM_BASE_SPEED = 0.35; // px/frame at the FASTEST point (perfect real balance)
var SWARM_MIN_SPEED_MULT = 0.15; // speed multiplier at maximum real imbalance (slow)
var SWARM_MAX_SPEED_MULT = 1.0; // speed multiplier at perfect real balance (fast)
var SWARM_GRANT_PROGRESS_FRACTION = 0.25; // each click closes this fraction of the REAL remaining gap
var SWARM_FALLBACK_FARM_RATE = 0.1; // used only when clicking the "wrong" direction (no real gap that way)
var SWARM_GRANT_COST_FRACTION = 0.6; // fraction of the granted units' normal build cost, paid per unit
var SWARM_CLICK_COOLDOWN_MS = 250;

var swarmDots = []; // { x, y, vx, vy, side: 'maker' | 'breaker' } -- side is resynced live every frame
var swarmCanvasEl = null;
var swarmCtx = null;
var swarmWidth = 192;
var swarmHeight = 160;
var swarmLastClickAt = 0;

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

// Keeps the fixed dot pool's color split matching the LIVE real
// balance (demand share vs supply share). Re-labels existing dots
// toward the target split rather than respawning, so drift stays
// smooth frame to frame -- only colors change, positions don't reset.
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
}

// Inverted on purpose: real balance is FAST (hard to hold), real
// imbalance is SLOW (easy to fix once it's drifted).
function swarmSpeedMultiplier() {
  var imbalance = Math.abs(ironStructuralImbalance()); // 0 (balanced) .. 1 (fully leaning)
  return SWARM_MIN_SPEED_MULT + (SWARM_MAX_SPEED_MULT - SWARM_MIN_SPEED_MULT) * (1 - imbalance);
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

  if (el.swarmIronRates) {
    el.swarmIronRates.textContent = "iron: " + fmtWeight(ironSupplyRate()) + "/s made \u00b7 " + fmtWeight(ironDemandRate()) + "/s used";
  }
  if (el.swarmUnitCounts) {
    el.swarmUnitCounts.textContent = fmtInt(state.nailMakers) + " makers \u00b7 " + fmtInt(state.breakers) + " breakers";
  }

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

// Batch size: a fraction of the REAL remaining gap to exact balance.
// Clicking a black/breaker-surplus dot grants MAKERS (closing a supply
// surplus); clicking a white/maker-surplus dot grants BREAKERS
// (closing a demand surplus). If the real gap in that direction is
// already zero (you clicked the "wrong" color for the current
// imbalance, or things are already balanced), it falls back to a
// small percentage of current holdings so the click still does
// something rather than being a dead button.
function swarmBatchSize(clickedSide) {
  if (clickedSide === "breaker") {
    var deficitMakers = ironDeficitMakers();
    if (deficitMakers > 0) return Math.max(1, Math.round(deficitMakers * SWARM_GRANT_PROGRESS_FRACTION));
    return Math.max(1, Math.round(state.breakers * SWARM_FALLBACK_FARM_RATE));
  } else {
    var deficitBreakers = ironDeficitBreakers();
    if (deficitBreakers > 0) return Math.max(1, Math.round(deficitBreakers * SWARM_GRANT_PROGRESS_FRACTION));
    return Math.max(1, Math.round(state.nailMakers * SWARM_FALLBACK_FARM_RATE));
  }
}

function swarmGrantCost(clickedSide, batchSize) {
  var grantedUnitCost = clickedSide === "maker" ? breakerBuildCostEffective() : nailMakerCostEffective();
  return round2(grantedUnitCost * SWARM_GRANT_COST_FRACTION * batchSize);
}

function swarmHandleClick(mx, my) {
  var now = Date.now();
  if (now - swarmLastClickAt < SWARM_CLICK_COOLDOWN_MS) return;

  for (var i = 0; i < swarmDots.length; i++) {
    var d = swarmDots[i];
    var dx = d.x - mx, dy = d.y - my;
    if (dx * dx + dy * dy > (SWARM_DOT_RADIUS + 4) * (SWARM_DOT_RADIUS + 4)) continue;

    var batchSize = swarmBatchSize(d.side);
    var cost = swarmGrantCost(d.side, batchSize);

    if (state.funds < cost) {
      swarmFlashHint("not enough funds (" + fmtMoney(cost) + " for +" + batchSize + ")");
      return;
    }

    swarmLastClickAt = now;
    state.funds -= cost;

    if (d.side === "maker") {
      state.breakers += batchSize;
      d.side = "breaker"; // flip THIS dot immediately -- don't wait for the next sync pass to pick some other dot
      swarmFlashHint("+" + batchSize + " breakers (" + fmtMoney(cost) + ")", 1000);
    } else {
      state.nailMakers += batchSize;
      d.side = "maker";
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
