"use strict";

// ----------------------------------------------------------------
// The skyline (foundation -- tunables live in state.js, the marketing
// payoff lives in formulas.js as cityFeverMult()).
//
// The skyline is never stored in state -- it's rebuilt from state's
// real nailMakers / breakers / factories on a slow timer (see
// CITY_REBUILD_INTERVAL_SEC), not every animation frame. Rebuilding
// every frame was tried first and made the whole skyline flicker,
// because factories/makers/breakers change by small amounts constantly
// (a factory finishing a cycle, a swarm click, etc.), and every change
// was reshuffling the layout and resizing buildings on the spot. Slot
// identity is now also kept STABLE across rebuilds: each type's
// buildings keep the same seed/position as long as that type's slot
// count doesn't change, so small count changes just resize a building
// slightly rather than reshuffling the whole skyline.
//
// Each type gets a share of a fixed number of building slots
// proportional to its share of the player's real totals, so a skyline
// overrun with one dark color IS the player having too much of that
// thing -- there's nothing else to read.
//
// Nailbombs target one building. Detonating destroys it and damages
// its neighbors, falling off with distance, and that damage converts
// straight into a permanent loss of real makers/breakers/factories.
// In exchange the player gets a temporary marketing boost that decays
// -- and that boost, and what it costs to trigger, both grow
// EXPONENTIALLY with every bomb already detonated (see state.js).
// ----------------------------------------------------------------

var cityCanvasEl = null;
var cityCtx = null;
var cityLayout = []; // last drawn slot layout: [{type, units, x, w}], used for click hit-testing
var cityTarget = null; // index into cityLayout the player has selected, or null
var cityBlast = null; // { x, r, max } -- the expanding blast ring animation
var cityShake = 0;

// Cached between rebuilds so the skyline doesn't reshuffle or resize
// every frame -- see the header comment above.
var cityCachedSlots = []; // stable slot identities: [{type, indexInType, units, seed}]
var cityRebuildAccum = 0;

function cityBuildSlots() {
  var types = [
    { type: "maker", count: Math.max(0, Math.floor(state.nailMakers)) },
    { type: "breaker", count: Math.max(0, Math.floor(state.breakers)) },
    { type: "factory", count: Math.max(0, Math.floor(state.factories)) }
  ];
  var total = types[0].count + types[1].count + types[2].count;
  if (total <= 0) return [];

  // How many slots each type gets, and how many real units each slot
  // represents, computed fresh every time (cheap) -- but WHICH slots
  // keep their old seed/position is decided against the cached layout
  // below, so a type only reshuffles when its own slot COUNT changes.
  var freshByType = {};
  for (var t = 0; t < types.length; t++) {
    var count = types[t].count;
    if (count <= 0) { freshByType[types[t].type] = []; continue; }
    var n = Math.min(CITY_MAX_PER_TYPE, Math.max(1, Math.round(CITY_TOTAL_SLOTS * count / total)));
    var list = [];
    for (var i = 0; i < n; i++) {
      var lo = Math.floor(i * count / n);
      var hi = Math.floor((i + 1) * count / n);
      list.push({ type: types[t].type, indexInType: i, units: Math.max(1, hi - lo) });
    }
    freshByType[types[t].type] = list;
  }

  var oldByKey = {};
  for (var k = 0; k < cityCachedSlots.length; k++) {
    var s = cityCachedSlots[k];
    oldByKey[s.type + s.indexInType] = s;
  }

  var merged = [];
  var typeNames = ["maker", "breaker", "factory"];
  for (var tn = 0; tn < typeNames.length; tn++) {
    var fresh = freshByType[typeNames[tn]];
    for (var f = 0; f < fresh.length; f++) {
      var key = fresh[f].type + fresh[f].indexInType;
      var prev = oldByKey[key];
      merged.push({
        type: fresh[f].type,
        indexInType: fresh[f].indexInType,
        units: fresh[f].units, // units update live even when position/seed stay put
        seed: prev ? prev.seed : Math.floor(Math.random() * 99999),
        orderKey: prev ? prev.orderKey : Math.random() // stays put unless this exact slot is new
      });
    }
  }

  merged.sort(function (a, b) { return a.orderKey - b.orderKey; });
  cityCachedSlots = merged;
  return merged;
}

function cityMaybeRebuild(dt) {
  cityRebuildAccum += dt;
  if (cityRebuildAccum < CITY_REBUILD_INTERVAL_SEC && cityCachedSlots.length) return;
  cityRebuildAccum = 0;
  cityBuildSlots();
}

function cityLayoutFor(slots, width) {
  var n = slots.length;
  if (!n) return [];
  var gap = 4;
  var unit = (width - 16 - gap * (n - 1)) / n;
  var w = Math.max(10, Math.min(30, unit));
  var totalW = w * n + gap * (n - 1);
  var x = (width - totalW) / 2;
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push({ type: slots[i].type, units: slots[i].units, seed: slots[i].seed, x: x, w: w });
    x += w + gap;
  }
  return out;
}

function cityBombCost() {
  return Math.round(CITY_BOMB_BASE_NAILS * Math.pow(CITY_BOMB_COST_GROWTH, state.cityBombs));
}

function cityBombRadius() {
  return CITY_BOMB_BASE_RADIUS + state.cityBombs * CITY_BOMB_RADIUS_GROWTH;
}

function cityBombPower() {
  return CITY_BOMB_BASE_POWER + state.cityBombs * CITY_BOMB_POWER_GROWTH;
}

// Both the fever ceiling and what a single bomb adds to it grow
// EXPONENTIALLY with bombs already detonated, at the same rate the
// bomb's own cost grows -- see the CITY_FEVER_EXP_GROWTH comment in
// state.js.
function cityFeverMax() {
  return CITY_FEVER_MAX_BASE * Math.pow(CITY_FEVER_EXP_GROWTH, state.cityBombs);
}

function cityFeverGainForNextBomb() {
  return CITY_FEVER_PER_BOMB_BASE * Math.pow(CITY_FEVER_EXP_GROWTH, state.cityBombs);
}

function cityPick(mx) {
  for (var i = 0; i < cityLayout.length; i++) {
    if (mx >= cityLayout[i].x && mx <= cityLayout[i].x + cityLayout[i].w) return i;
  }
  return null;
}

// ----------------------------------------------------------------
// Pedestrians. Purely a visual layer walking the ground strip below
// the buildings -- their positions are never saved. Calm, they amble
// left and right at random. A bomb sends every one of them sprinting
// away from ground zero for a while; how fast/far they're running
// isn't itself mechanical, but the citywide panic meter it represents
// (state.cityPanic, decaying separately and much faster than fever)
// is, and it feeds cityFeverMult() in formulas.js.
// ----------------------------------------------------------------

var cityPeds = [];

function cityInitPedestrians(width) {
  cityPeds = [];
  for (var i = 0; i < CITY_PED_COUNT; i++) {
    cityPeds.push({
      x: Math.random() * width,
      dir: Math.random() < 0.5 ? -1 : 1,
      panicT: 0
    });
  }
}

function cityPanicPedestrians(blastX) {
  for (var i = 0; i < cityPeds.length; i++) {
    var p = cityPeds[i];
    p.panicT = CITY_PED_PANIC_DURATION_SEC;
    p.dir = p.x < blastX ? -1 : 1; // flee away from the blast
    if (p.x === blastX) p.dir = Math.random() < 0.5 ? -1 : 1;
  }
}

function cityUpdatePedestrians(dt, width, groundY) {
  for (var i = 0; i < cityPeds.length; i++) {
    var p = cityPeds[i];
    var panicking = p.panicT > 0;
    if (panicking) p.panicT = Math.max(0, p.panicT - dt);

    var speed = CITY_PED_WALK_SPEED * (panicking ? CITY_PED_PANIC_SPEED_MULT : 1);
    p.x += p.dir * speed * dt * 60; // dt*60 keeps speed comparable to the old fixed-per-frame numbers regardless of actual framerate

    if (!panicking && Math.random() < 0.004) p.dir *= -1; // calm wandering: occasionally change direction
    if (p.x < 4) { p.x = 4; p.dir = 1; }
    if (p.x > width - 4) { p.x = width - 4; p.dir = -1; }
  }
}

function cityDrawPedestrians(groundY, ink) {
  for (var i = 0; i < cityPeds.length; i++) {
    var p = cityPeds[i];
    var panicking = p.panicT > 0;
    cityCtx.fillStyle = ink;
    cityCtx.globalAlpha = panicking ? 1 : 0.6;
    cityCtx.beginPath();
    cityCtx.arc(p.x, groundY + 8, panicking ? 2 : 1.6, 0, Math.PI * 2);
    cityCtx.fill();
    cityCtx.globalAlpha = 1;
  }
}

// Converts blast damage straight into a permanent loss of whatever the
// affected buildings actually represent -- there's no intermediate
// "building hp" state, the skyline just reflows next rebuild.
function cityDetonateAt(targetIndex) {
  if (targetIndex == null || targetIndex >= cityLayout.length) return;
  var cost = cityBombCost();
  if (state.unsold < cost) return;

  state.unsold -= cost;
  var radius = cityBombRadius();
  var power = cityBombPower();
  var lost = { maker: 0, breaker: 0, factory: 0 };

  for (var i = 0; i < cityLayout.length; i++) {
    var dist = Math.abs(i - targetIndex);
    if (dist > radius) continue;
    var falloff = 1 - (dist / (radius + 0.001));
    var slot = cityLayout[i];
    lost[slot.type] += Math.round(slot.units * power * falloff);
  }

  state.nailMakers = Math.max(0, state.nailMakers - lost.maker);
  state.breakers = Math.max(0, state.breakers - lost.breaker);
  if (lost.factory > 0) {
    state.factories = Math.max(0, state.factories - lost.factory);
    while (state.factoryTimers.length > state.factories) state.factoryTimers.pop();
  }

  var gain = cityFeverGainForNextBomb();
  state.cityBombs += 1;
  state.cityFever = Math.min(cityFeverMax(), state.cityFever + gain);
  state.cityPanic = CITY_PANIC_PER_BOMB; // a bomb always maxes out the panic meter -- how long that panic actually lasts on-screen is per-pedestrian, below

  cityShake = 10;
  var hitX = cityLayout[targetIndex].x + cityLayout[targetIndex].w / 2;
  cityBlast = { x: hitX, r: 0, max: 60 + radius * 22 };
  cityTarget = null;
  cityRebuildAccum = CITY_REBUILD_INTERVAL_SEC; // force an immediate rebuild so the destroyed building disappears right away
  cityPanicPedestrians(hitX);

  render();
}

function cityTick(dt) {
  if (!state.unlockedCity && state.marketingLevel >= CITY_UNLOCK_MARKETING_LEVEL) state.unlockedCity = true;

  var feverDecay = Math.pow(0.5, dt / CITY_FEVER_HALFLIFE_SEC);
  state.cityFever *= feverDecay;
  if (state.cityFever < 0.001) state.cityFever = 0;

  var panicDecay = Math.pow(0.5, dt / CITY_PANIC_HALFLIFE_SEC);
  state.cityPanic *= panicDecay;
  if (state.cityPanic < 0.001) state.cityPanic = 0;

  cityMaybeRebuild(dt);
}

// ----------------------------------------------------------------
// UI
// ----------------------------------------------------------------

function cityCssColor(name, fallback) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Makers and breakers share the same silhouette -- only their colors
// invert (white body / black windows vs. black body / white windows),
// matching the maker/breaker palette already used by yin & yang and
// the foundry swarm. Factories are plain gray blocks, no detail.
function cityDrawBuilding(slot, groundY, paper, ink) {
  var baseH = slot.type === "factory" ? 46 : 38;
  var growth = Math.log(1 + slot.units) * 10;
  var h = baseH + growth;
  var top = groundY - h;

  if (slot.type === "factory") {
    cityCtx.fillStyle = "#9a9a9a";
    cityCtx.strokeStyle = ink;
    cityCtx.lineWidth = 1;
    cityCtx.fillRect(slot.x, top, slot.w, h);
    cityCtx.strokeRect(slot.x + 0.5, top + 0.5, slot.w - 1, h - 1);
    return;
  }

  var body = slot.type === "maker" ? paper : ink;
  var win = slot.type === "maker" ? ink : paper;
  cityCtx.fillStyle = body;
  cityCtx.strokeStyle = ink;
  cityCtx.lineWidth = 1;
  cityCtx.fillRect(slot.x, top, slot.w, h);
  cityCtx.strokeRect(slot.x + 0.5, top + 0.5, slot.w - 1, h - 1);

  var cols = Math.max(1, Math.floor((slot.w - 4) / 6));
  var rows = Math.floor((h - 6) / 9);
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var v = Math.abs(Math.sin((slot.seed + r * cols + c) * 12.9898)) % 1;
      cityCtx.globalAlpha = v < 0.85 ? 1 : 0.15; // a few dark windows even on an intact building, for texture
      cityCtx.fillStyle = win;
      cityCtx.fillRect(slot.x + 3 + c * 6, top + 4 + r * 9, 3, 5);
    }
  }
  cityCtx.globalAlpha = 1;
}

function cityDraw(dt) {
  if (!cityCtx) return;
  var canvas = el.cityCanvas;
  var W = canvas.width, H = canvas.height;
  var groundY = H - 24;

  if (cityPeds.length !== CITY_PED_COUNT) cityInitPedestrians(W);
  cityUpdatePedestrians(dt, W, groundY);

  // Uses the cached slots (see cityMaybeRebuild) -- NOT a fresh
  // cityBuildSlots() call -- so drawing every frame doesn't itself
  // cause the reshuffling that was the original flicker bug.
  cityLayout = cityLayoutFor(cityCachedSlots, W);

  var ink = cityCssColor("--ink", "#000");
  var paper = cityCssColor("--paper", "#fff");

  var ox = cityShake > 0 ? (Math.random() - 0.5) * cityShake : 0;
  var oy = cityShake > 0 ? (Math.random() - 0.5) * cityShake * 0.5 : 0;
  if (cityShake > 0) cityShake -= 0.8;

  cityCtx.save();
  cityCtx.translate(ox, oy);
  cityCtx.clearRect(-6, -6, W + 12, H + 12);

  cityCtx.strokeStyle = ink;
  cityCtx.lineWidth = 1;
  cityCtx.beginPath();
  cityCtx.moveTo(0, groundY + 0.5);
  cityCtx.lineTo(W, groundY + 0.5);
  cityCtx.stroke();

  for (var i = 0; i < cityLayout.length; i++) cityDrawBuilding(cityLayout[i], groundY, paper, ink);
  cityDrawPedestrians(groundY, ink);

  if (cityTarget != null && cityLayout[cityTarget]) {
    var t = cityLayout[cityTarget];
    cityCtx.strokeStyle = ink;
    cityCtx.setLineDash([3, 3]);
    cityCtx.strokeRect(t.x - 2, 4, t.w + 4, groundY - 2);
    cityCtx.setLineDash([]);
  }

  if (cityBlast) {
    cityBlast.r += 6;
    cityCtx.globalAlpha = Math.max(0, 1 - cityBlast.r / cityBlast.max);
    cityCtx.strokeStyle = ink;
    cityCtx.beginPath();
    cityCtx.arc(cityBlast.x, groundY - 20, cityBlast.r, 0, Math.PI * 2);
    cityCtx.stroke();
    cityCtx.globalAlpha = 1;
    if (cityBlast.r > cityBlast.max) cityBlast = null;
  }

  cityCtx.restore();
}

function cityBuffText() {
  if (state.cityFever <= 0.005 && state.cityPanic <= 0.005) return "the skyline is quiet";
  var parts = [];
  if (state.cityPanic > 0.005) parts.push("the street is panicking");
  parts.push("public demand +" + Math.round((cityFeverMult() - 1) * 100) + "%");
  return parts.join(" \u2014 ");
}

function renderCity() {
  if (!el.citySection) return;
  el.citySection.style.display = state.unlockedCity ? "" : "none";
  if (!state.unlockedCity) return;

  el.cityBuffs.textContent = cityBuffText();
  el.cityBombCount.textContent = state.cityBombs;

  var cost = cityBombCost();
  el.btnCityBomb.textContent = cityTarget == null
    ? "click a building to target it"
    : "detonate here (" + fmtInt(cost) + " unsold nails)";
  el.btnCityBomb.disabled = cityTarget == null || state.unsold < cost;
}

function cityInit() {
  cityCanvasEl = el.cityCanvas;
  if (!cityCanvasEl) return;
  cityCtx = cityCanvasEl.getContext("2d");

  cityCanvasEl.addEventListener("click", function (e) {
    var rect = cityCanvasEl.getBoundingClientRect();
    var scaleX = cityCanvasEl.width / rect.width;
    var mx = (e.clientX - rect.left) * scaleX;
    cityTarget = cityPick(mx);
    render();
  });

  el.btnCityBomb.addEventListener("click", function () {
    if (cityTarget == null) return;
    cityDetonateAt(cityTarget);
  });

  requestAnimationFrame(cityLoop);
}

// Drawing runs every animation frame for smooth blast/shake/pedestrian
// animation, but the underlying slot layout only rebuilds on its own
// slow timer via cityTick() in engine.js (see cityMaybeRebuild) --
// drawing itself never triggers a rebuild, which is what fixes the
// flicker.
var cityLastFrameMs = null;
function cityLoop(nowMs) {
  if (state.unlockedCity) {
    var dt = cityLastFrameMs != null ? Math.min(0.1, (nowMs - cityLastFrameMs) / 1000) : 1 / 60;
    cityLastFrameMs = nowMs;
    cityDraw(dt);
  } else {
    cityLastFrameMs = null;
  }
  requestAnimationFrame(cityLoop);
}

cityInit();
