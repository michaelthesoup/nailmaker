"use strict";

// ----------------------------------------------------------------
// The Foundry Swarm. A small always-visible panel next to yin & yang.
//
// The dots are a LIVE readout of the real economy: 10 white / 10 black
// (scaled with SWARM_DISPLAY_DOTS) means your nail-maker count and
// breaker count are EXACTLY at the ratio where iron production and
// consumption match. All black means you have far more breaker
// capacity than your makers can use; all white means the reverse.
// This updates every frame from the real numbers -- it is not
// something the player sets by clicking, it's something clicking
// CHANGES by altering the real economy underneath.
//
// Clicking a dot grants a chunk of the type needed to close the actual
// gap between your current counts and the exact balance point -- e.g.
// if reaching balance would take 4,000 more nail makers, a click
// grants a real fraction of that 4,000, not a token +1 or a flat
// percentage disconnected from how far off you actually are.
//
// Cost is paid in COPPER, not funds -- the same copper a factory would
// spend to build that unit type (FACTORY_COST_MAKER_SIDE_COPPER /
// FACTORY_COST_BREAKER_SIDE_COPPER from formulas.js/state.js), times
// batch size. No discount, no markup.
//
// Drift SPEED is inverted from what you might expect: perfect real
// balance is the FASTEST the dots move (hardest to click precisely --
// holding the ideal is a constant, active effort), while a badly
// skewed economy slows them down (easy to see and easy to act on).
//
// On top of drift, dots also FLEE the cursor when you get close -- and
// how hard they flee is the OPPOSITE shape from drift speed: at real
// balance they barely react (they're already fast, so precision alone
// is the challenge), while at real imbalance they panic and dodge hard
// (they're slow and easy to reach, so persistence/cornering becomes
// the challenge instead). The two hard states never stack on the same
// dot -- each tests a different skill. A brief stun window after a
// successful hit stops the next dot from becoming instantly harder to
// land right after you land one.
// ----------------------------------------------------------------

var SWARM_DISPLAY_DOTS = 30;
var SWARM_DOT_RADIUS = 3;
var SWARM_BASE_SPEED = 0.35; // px/frame at the FASTEST point (perfect real balance)
var SWARM_MIN_SPEED_MULT = 0.15; // speed multiplier at maximum real imbalance (slow)
var SWARM_MAX_SPEED_MULT = 1.0; // speed multiplier at perfect real balance (fast)
var SWARM_GRANT_PROGRESS_FRACTION = 0.25; // each click closes this fraction of the REAL remaining gap
var SWARM_FALLBACK_FARM_RATE = 0.1; // used only when clicking the "wrong" direction (no real gap that way)
var SWARM_CLICK_COOLDOWN_MS = 250;

// Flee behavior -- inverted from drift speed on purpose (see header).
var SWARM_FLEE_RADIUS = 55; // px -- dots within this distance of the cursor start dodging
var SWARM_FLEE_MIN_MULT = 0.05; // flee strength at perfect real balance (barely reacts)
var SWARM_FLEE_MAX_MULT = 1.0; // flee strength at maximum real imbalance (panics)
var SWARM_FLEE_FORCE = 0.9; // px/frame of push added at the center of the flee radius
var SWARM_STUN_MS = 350; // after a hit, a dot ignores flee for this long so chaining feels fair

var swarmDots = []; // { x, y, vx, vy, side: 'maker' | 'breaker', stunUntil } -- side is resynced live every frame
var swarmCanvasEl = null;
var swarmCtx = null;
var swarmWidth = 288;
var swarmHeight = 224;
var swarmLastClickAt = 0;
var swarmMouseX = null;
var swarmMouseY = null; // null while the cursor isn't over the canvas -- no flee to compute

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
    stunUntil: 0
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
function swarmImbalanceMagnitude() {
  return Math.abs(ironStructuralImbalance()); // 0 (balanced) .. 1 (fully leaning)
}

function swarmSpeedMultiplier() {
  var imbalance = swarmImbalanceMagnitude();
  return SWARM_MIN_SPEED_MULT + (SWARM_MAX_SPEED_MULT - SWARM_MIN_SPEED_MULT) * (1 - imbalance);
}

// Also inverted from speed, but in the OTHER direction: strongest flee
// at maximum imbalance, weakest at perfect balance. See header comment.
function swarmFleeMultiplier() {
  var imbalance = swarmImbalanceMagnitude();
  return SWARM_FLEE_MIN_MULT + (SWARM_FLEE_MAX_MULT - SWARM_FLEE_MIN_MULT) * imbalance;
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
  var fleeMult = swarmFleeMultiplier();
  var now = Date.now();

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
        // Cap total speed so a dot cornered at point-blank range doesn't
        // rocket off unrealistically fast -- keeps the chase readable.
        var speed = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
        var maxSpeed = SWARM_BASE_SPEED * 3;
        if (speed > maxSpeed) {
          d.vx = (d.vx / speed) * maxSpeed;
          d.vy = (d.vy / speed) * maxSpeed;
        }
      }
    }

    d.x += d.vx * speedMult;
    d.y += d.vy * speedMult;

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

// Cost is paid in copper, at exactly what a factory would spend to
// build that many of that unit type (FACTORY_COST_MAKER_SIDE_COPPER /
// FACTORY_COST_BREAKER_SIDE_COPPER) -- no discount, no markup, no
// escalation. Clicking a maker (white) dot grants breakers, so the
// cost is the breaker-side copper cost times the batch size, and vice
// versa.
function swarmGrantCost(clickedSide, batchSize) {
  var grantedUnitCopperCost = clickedSide === "maker" ? FACTORY_COST_BREAKER_SIDE_COPPER : FACTORY_COST_MAKER_SIDE_COPPER;
  return grantedUnitCopperCost * batchSize;
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

    if (state.copperAmt < cost) {
      swarmFlashHint("not enough copper (" + fmtWeight(cost) + " for +" + batchSize + ")");
      return;
    }

    swarmLastClickAt = now;
    state.copperAmt -= cost;
    d.stunUntil = now + SWARM_STUN_MS;

    if (d.side === "maker") {
      state.breakers += batchSize;
      d.side = "breaker"; // flip THIS dot immediately -- don't wait for the next sync pass to pick some other dot
      swarmFlashHint("+" + batchSize + " breakers (" + fmtWeight(cost) + ")", 1000);
    } else {
      state.nailMakers += batchSize;
      d.side = "maker";
      swarmFlashHint("+" + batchSize + " makers (" + fmtWeight(cost) + ")", 1000);
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
