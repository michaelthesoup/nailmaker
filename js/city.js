"use strict";

// ----------------------------------------------------------------
// The skyline (foundation -- tunables live in state.js, the marketing
// payoff lives in formulas.js as cityFeverMult()).
//
// The skyline is an endlessly generated street. Each district reflects
// the current maker/breaker/factory mix; camera travel removes buildings
// behind the player and generates more ahead. Bombs pause the camera,
// damage real units, and leave a visible corridor of ruins to cross.
// ----------------------------------------------------------------

var cityCanvasEl = null;
var cityCtx = null;
var cityLayout = []; // last drawn slot layout: [{type, units, x, w}], used for click hit-testing
var cityTarget = null; // world-space building selected by the player
var cityBlast = null; // { x, r, max } -- the expanding blast ring animation
var cityShake = 0;
var cityCameraX = 0;
var cityNextDistrictX = 0;
var cityBuildings = [];
var cityAftermath = null; // { hitX, startX, endX, span, killRadius }

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

function cityGenerateDistrict(startX) {
  var slots = cityCachedSlots.slice();
  for (var i = 0; i < slots.length; i++) {
    slots[i] = {
      type: slots[i].type,
      units: slots[i].units,
      seed: Math.floor(Math.random() * 99999),
      orderKey: Math.random()
    };
  }
  slots.sort(function (a, b) { return a.orderKey - b.orderKey; });

  var layout = cityLayoutFor(slots, CITY_DISTRICT_WIDTH);
  for (var j = 0; j < layout.length; j++) {
    cityBuildings.push({
      type: layout[j].type,
      units: layout[j].units,
      seed: layout[j].seed,
      worldX: startX + layout[j].x,
      w: layout[j].w
    });
  }

  citySpawnDistrictPedestrians(startX, CITY_DISTRICT_WIDTH);
}

function cityEnsureWorld(width, extraDistance) {
  var lookAhead = width * 2 + (extraDistance || 0);
  while (cityNextDistrictX <= cityCameraX + lookAhead) {
    cityGenerateDistrict(cityNextDistrictX);
    cityNextDistrictX += CITY_DISTRICT_WIDTH;
  }

  cityBuildings = cityBuildings.filter(function (building) {
    return building.worldX + building.w >= cityCameraX - width;
  });
  cityPeds = cityPeds.filter(function (pedestrian) {
    return pedestrian.worldX >= cityCameraX - width;
  });
}

function cityVisibleLayout(width) {
  var visible = [];
  for (var i = 0; i < cityBuildings.length; i++) {
    var building = cityBuildings[i];
    var x = building.worldX - cityCameraX;
    if (x > width || x + building.w < 0) continue;
    var damage = 0;
    if (cityAftermath) {
      damage = Math.max(0, 1 - Math.abs(building.worldX - cityAftermath.hitX) / cityAftermath.span);
    }
    visible.push({
      type: building.type,
      units: building.units,
      seed: building.seed,
      x: x,
      w: building.w,
      worldX: building.worldX,
      damage: damage,
      building: building
    });
  }
  return visible;
}

function cityBombCost() {
  return Math.round(CITY_BOMB_BASE_NAILS * Math.pow(CITY_BOMB_COST_GROWTH, state.cityBombs));
}

function cityIsotopesNeeded() {
  return CORE_ISOTOPES_BASE;
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
    var centerX = cityLayout[i].x + cityLayout[i].w / 2;
    if (centerX >= 0 && centerX <= cityCanvasEl.width && mx >= cityLayout[i].x && mx <= cityLayout[i].x + cityLayout[i].w) {
      return cityLayout[i].building;
    }
  }
  return null;
}

// ----------------------------------------------------------------
// Pedestrians share world coordinates with the city so they can remain
// still in the blast zone as the camera continues past them.
// ----------------------------------------------------------------

var cityPeds = [];

function citySpawnDistrictPedestrians(startX, width) {
  for (var i = 0; i < CITY_PED_COUNT; i++) {
    var pedestrian = {
      worldX: startX + Math.random() * width,
      dir: Math.random() < 0.5 ? -1 : 1,
      panicT: 0,
      dead: false
    };
    cityApplyAftermathToPedestrian(pedestrian);
    cityPeds.push(pedestrian);
  }
}

function cityApplyAftermathToPedestrian(pedestrian) {
  if (!cityAftermath) return;
  var distance = Math.abs(pedestrian.worldX - cityAftermath.hitX);
  if (distance > cityAftermath.span) return;
  if (distance <= cityAftermath.killRadius) {
    pedestrian.dead = true;
    pedestrian.panicT = 0;
  } else {
    pedestrian.dir = pedestrian.worldX < cityAftermath.hitX ? -1 : 1;
    pedestrian.panicT = CITY_PED_PANIC_DURATION_SEC;
  }
}

function cityPanicPedestrians() {
  for (var i = 0; i < cityPeds.length; i++) {
    cityApplyAftermathToPedestrian(cityPeds[i]);
  }
}

function cityUpdatePedestrians(dt) {
  for (var i = 0; i < cityPeds.length; i++) {
    var p = cityPeds[i];
    if (p.dead) continue;

    var insideAftermath = cityAftermath && p.worldX >= cityAftermath.startX && p.worldX <= cityAftermath.endX;
    if (insideAftermath) cityApplyAftermathToPedestrian(p);
    var panicking = p.panicT > 0;
    if (panicking && !insideAftermath) p.panicT = Math.max(0, p.panicT - dt);

    var speed = CITY_PED_WALK_SPEED * (panicking ? CITY_PED_PANIC_SPEED_MULT : 1);
    p.worldX += p.dir * speed * dt * 60;

    if (!panicking && Math.random() < 0.004) p.dir *= -1; // calm wandering: occasionally change direction
  }
}

function cityDrawPedestrians(groundY, ink) {
  for (var i = 0; i < cityPeds.length; i++) {
    var p = cityPeds[i];
    var x = p.worldX - cityCameraX;
    if (x < -4 || x > cityCanvasEl.width + 4) continue;
    var panicking = p.panicT > 0;
    cityCtx.fillStyle = ink;
    cityCtx.globalAlpha = panicking || p.dead ? 1 : 0.6;
    cityCtx.beginPath();
    cityCtx.arc(x, groundY + 8, panicking || p.dead ? 2 : 1.6, 0, Math.PI * 2);
    cityCtx.fill();
    cityCtx.globalAlpha = 1;
  }
}

// Arming checks and pays BOTH costs up front (nails and one isotope core), then
// starts the drop sequence. The actual destruction doesn't happen until
// the dropped bomb visually lands -- see cityApplyImpact() -- so the
// damage, fever/panic gain, and page shake all land together with the
// animation instead of popping in the instant the button is clicked.
function cityArmAndDrop(targetBuilding) {
  if (!targetBuilding || cityBuildings.indexOf(targetBuilding) < 0) return;
  var targetCenterX = targetBuilding.worldX + targetBuilding.w / 2;
  if (targetCenterX < cityCameraX || targetCenterX > cityCameraX + cityCanvasEl.width) return;
  if (cityDropActive) return; // one bomb in flight at a time

  var nailsCost = cityBombCost();
  var isoCost = cityIsotopesNeeded();
  if (state.unsold < nailsCost || state.isotopeStock < isoCost) return;

  cityEnsureWorld(cityCanvasEl.width, cityBombRadius() * CITY_BUILDING_SPACING);

  state.unsold -= nailsCost;
  state.isotopeStock -= isoCost;
  cityTarget = null;
  render();

  cityStartDrop(targetBuilding);
}

function cityApplyImpact(targetBuilding) {
  if (!targetBuilding) return;

  var radius = cityBombRadius();
  var radiusWorld = radius * CITY_BUILDING_SPACING;
  var power = cityBombPower();
  var lost = { maker: 0, breaker: 0, factory: 0 };

  for (var i = 0; i < cityBuildings.length; i++) {
    var building = cityBuildings[i];
    var dist = Math.abs(building.worldX - targetBuilding.worldX) / CITY_BUILDING_SPACING;
    if (dist > radius) continue;
    var falloff = 1 - (dist / (radius + 0.001));
    lost[building.type] += Math.round(building.units * power * falloff);
  }

  var economyShock = Math.min(CITY_BOMB_ECONOMY_SHOCK_CAP, power * CITY_BOMB_ECONOMY_SHOCK_FACTOR);
  var workforce = { maker: state.nailMakers, breaker: state.breakers, factory: state.factories };
  if (workforce.maker > 0) lost.maker = Math.max(lost.maker, Math.max(1, Math.round(workforce.maker * economyShock)));
  if (workforce.breaker > 0) lost.breaker = Math.max(lost.breaker, Math.max(1, Math.round(workforce.breaker * economyShock)));
  if (workforce.factory > 0) lost.factory = Math.max(lost.factory, Math.max(1, Math.round(workforce.factory * economyShock)));

  state.nailMakers = Math.max(0, state.nailMakers - lost.maker);
  state.breakers = Math.max(0, state.breakers - lost.breaker);
  if (lost.factory > 0) {
    state.factories = Math.max(0, state.factories - lost.factory);
    while (state.factoryTimers.length > state.factories) state.factoryTimers.pop();
  }

  var gain = cityFeverGainForNextBomb();
  state.cityBombs += 1;
  state.cityFever = Math.min(cityFeverMax(), state.cityFever + gain);
  state.cityMarketScar = Math.min(CITY_MARKET_SCAR_MAX, state.cityMarketScar + CITY_MARKET_SCAR_PER_BOMB);
  state.karma = -1;
  state.cityKarmaLocked = true;
  state.cityPanic = CITY_PANIC_PER_BOMB; // a bomb always maxes out the panic meter -- how long that panic actually lasts on-screen is per-pedestrian, below

  var aftermathSpan = CITY_AFTERMATH_BASE_DISTANCE
    + radius * CITY_AFTERMATH_RADIUS_DISTANCE
    + power * CITY_AFTERMATH_POWER_DISTANCE;
  cityAftermath = {
    hitX: targetBuilding.worldX,
    startX: targetBuilding.worldX - aftermathSpan,
    endX: targetBuilding.worldX + aftermathSpan,
    span: aftermathSpan,
    killRadius: aftermathSpan * 0.12
  };
  cityPanicPedestrians();

  cityShake = 10;
  var hitX = targetBuilding.worldX + targetBuilding.w / 2 - cityCameraX;
  cityBlast = { x: hitX, r: 0, max: 60 + radius * 22 };
  cityRebuildAccum = CITY_REBUILD_INTERVAL_SEC; // force an immediate rebuild so the destroyed building disappears right away

  cityShakePage();
  render();
}

// ----------------------------------------------------------------
// The detonation sequence. A bomb visibly falls in from above the
// entire page, lands on its target, and the WHOLE page -- not just the
// skyline panel -- shakes violently. cityApplyImpact() (above) does the
// actual damage/fever/panic the instant the bomb lands.
// ----------------------------------------------------------------

var cityDropActive = false;
var cityDropTarget = null;
var cityDropY = -120;
var cityDropLastMs = null;
var cityDropLandY = 0;

var cityPageShakeFrames = 0;
var cityPageShakeMagnitude = 0;
var cityPageShakeRunning = false;

function cityStartDrop(targetBuilding) {
  if (!el.bombDropOverlay || !cityCanvasEl) {
    // No overlay available (shouldn't happen in the real page) --
    // fall back to an instant impact so a bomb never silently fails.
    cityApplyImpact(targetBuilding);
    return;
  }

  var rect = cityCanvasEl.getBoundingClientRect();
  var scaleX = rect.width / cityCanvasEl.width;
  var targetX = rect.left + (targetBuilding.worldX + targetBuilding.w / 2 - cityCameraX) * scaleX;
  cityDropLandY = rect.top + rect.height * 0.55;

  cityDropActive = true;
  cityDropTarget = targetBuilding;
  cityDropY = -120;
  cityDropLastMs = null;

  el.bombDropOverlay.style.left = targetX + "px";
  el.bombDropOverlay.style.top = cityDropY + "px";
  el.bombDropOverlay.style.display = "block";

  requestAnimationFrame(cityDropStep);
}

function cityDropStep(nowMs) {
  if (!cityDropActive) return;
  var dt = cityDropLastMs != null ? Math.min(0.05, (nowMs - cityDropLastMs) / 1000) : 1 / 60;
  cityDropLastMs = nowMs;

  // Accelerates like a falling object, for a bit of weight to the drop.
  var fallSpeed = 900 + (cityDropY + 120) * 4;
  cityDropY += fallSpeed * dt;
  el.bombDropOverlay.style.top = cityDropY + "px";

  if (cityDropY >= cityDropLandY) {
    cityDropActive = false;
    el.bombDropOverlay.style.display = "none";
    cityShakePage();
    cityApplyImpact(cityDropTarget);
    cityDropTarget = null;
    return;
  }

  requestAnimationFrame(cityDropStep);
}

function cityShakePage() {
  cityPageShakeFrames = 28;
  cityPageShakeMagnitude = 14;
  if (!cityPageShakeRunning) {
    cityPageShakeRunning = true;
    requestAnimationFrame(cityPageShakeStep);
  }
}

function cityPageShakeStep() {
  if (!el.pageShakeWrap) { cityPageShakeRunning = false; return; }

  if (cityPageShakeFrames > 0) {
    cityPageShakeFrames--;
    var mag = cityPageShakeMagnitude * (cityPageShakeFrames / 28);
    var dx = (Math.random() - 0.5) * 2 * mag;
    var dy = (Math.random() - 0.5) * 2 * mag;
    var rot = (Math.random() - 0.5) * 0.6 * (mag / 14);
    el.pageShakeWrap.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) rotate(" + rot.toFixed(2) + "deg)";
    requestAnimationFrame(cityPageShakeStep);
  } else {
    el.pageShakeWrap.style.transform = "translate(0,0) rotate(0deg)";
    cityPageShakeRunning = false;
  }
}

function cityTick(dt) {
  if (!state.unlockedCity && state.totalNailsMade >= CITY_UNLOCK_TOTAL_NAILS) state.unlockedCity = true;

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
  var damage = slot.damage || 0;
  var h = Math.max(2, (baseH + growth) * (1 - damage * 0.9));
  var top = groundY - h;

  if (slot.type === "factory") {
    cityCtx.fillStyle = damage > 0.5 ? "#686868" : "#9a9a9a";
    cityCtx.strokeStyle = ink;
    cityCtx.lineWidth = 1;
    cityCtx.fillRect(slot.x, top, slot.w, h);
    cityCtx.strokeRect(slot.x + 0.5, top + 0.5, slot.w - 1, h - 1);
    if (damage > 0.35) {
      cityCtx.beginPath();
      cityCtx.moveTo(slot.x + slot.w * 0.15, groundY - 2);
      cityCtx.lineTo(slot.x + slot.w * 0.5, groundY - Math.max(2, h * 0.3));
      cityCtx.lineTo(slot.x + slot.w * 0.85, groundY - 2);
      cityCtx.stroke();
    }
    return;
  }

  var body = slot.type === "maker" ? paper : ink;
  var win = slot.type === "maker" ? ink : paper;
  cityCtx.globalAlpha = 1 - damage * 0.55;
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
      cityCtx.globalAlpha = v < 0.85 - damage * 0.7 ? 1 : 0.12;
      cityCtx.fillStyle = win;
      cityCtx.fillRect(slot.x + 3 + c * 6, top + 4 + r * 9, 3, 5);
    }
  }
  cityCtx.globalAlpha = 1;

  if (damage > 0.35) {
    cityCtx.strokeStyle = ink;
    cityCtx.beginPath();
    cityCtx.moveTo(slot.x + slot.w * 0.2, groundY - 2);
    cityCtx.lineTo(slot.x + slot.w * 0.5, groundY - Math.max(2, h * 0.3));
    cityCtx.lineTo(slot.x + slot.w * 0.8, groundY - 2);
    cityCtx.stroke();
  }
}

function cityDraw(dt) {
  if (!cityCtx) return;
  var canvas = el.cityCanvas;
  var W = canvas.width, H = canvas.height;
  var groundY = H - 24;

  if (!cityDropActive) cityCameraX += CITY_PAN_SPEED * dt;
  cityEnsureWorld(W, cityAftermath ? cityAftermath.span : 0);
  cityUpdatePedestrians(dt);
  cityLayout = cityVisibleLayout(W);
  if (cityAftermath && cityCameraX > cityAftermath.endX) cityAftermath = null;

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

  if (cityTarget) {
    var targetX = cityTarget.worldX - cityCameraX;
    if (targetX + cityTarget.w < 0 || targetX > W) {
      cityTarget = null;
      renderCity();
    } else {
      var t = { x: targetX, w: cityTarget.w };
      cityCtx.strokeStyle = ink;
      cityCtx.setLineDash([3, 3]);
      cityCtx.strokeRect(t.x - 2, 4, t.w + 4, groundY - 2);
      cityCtx.setLineDash([]);
    }
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
  if (state.cityFever <= 0.005 && state.cityPanic <= 0.005 && state.cityMarketScar <= 0) return "the skyline is quiet";
  var parts = [];
  if (state.cityPanic > 0.005) parts.push("the street is panicking");
  if (state.cityFever > 0.005 || state.cityPanic > 0.005) {
    var temporaryDemand = (1 + CITY_FEVER_DEMAND_PER_POINT * state.cityFever) * (1 + CITY_PANIC_DEMAND_MAX * state.cityPanic);
    parts.push("public demand +" + Math.round((temporaryDemand - 1) * 100) + "% temporarily");
  }
  if (state.cityMarketScar > 0) parts.push("market scar -" + Math.round(state.cityMarketScar * 100) + "% permanently");
  return parts.join(" \u2014 ");
}

function renderCity() {
  if (!el.citySection) return;
  el.citySection.style.display = state.unlockedCity ? "" : "none";
  if (!state.unlockedCity) return;

  el.cityBuffs.textContent = cityBuffText();
  el.cityBombCount.textContent = state.cityBombs + " made";
  el.cityBombNumber.textContent = state.cityBombs + 1;

  var nailsCost = cityBombCost();
  var isoCost = cityIsotopesNeeded();

  el.coreNailsLabel.textContent = fmtInt(Math.min(state.unsold, nailsCost)) + " / " + fmtInt(nailsCost);
  el.coreNailsFill.style.width = Math.min(100, 100 * state.unsold / nailsCost) + "%";
  el.coreIsotopesLabel.textContent = Math.min(state.isotopeStock, isoCost) + " / " + isoCost;
  el.coreIsotopesFill.style.width = Math.min(100, 100 * state.isotopeStock / isoCost) + "%";

  var haveEnough = state.unsold >= nailsCost && state.isotopeStock >= isoCost;
  if (cityDropActive) {
    el.btnCityBomb.textContent = "falling...";
    el.btnCityBomb.disabled = true;
  } else if (cityTarget == null) {
    el.btnCityBomb.textContent = "click a building to target it";
    el.btnCityBomb.disabled = true;
  } else if (!haveEnough) {
    el.btnCityBomb.textContent = "not enough nails / 1 isotope core";
    el.btnCityBomb.disabled = true;
  } else {
    el.btnCityBomb.textContent = "use 1 isotope core and detonate here";
    el.btnCityBomb.disabled = false;
  }
}

function cityInit() {
  cityCanvasEl = el.cityCanvas;
  if (!cityCanvasEl) return;
  cityCtx = cityCanvasEl.getContext("2d");

  cityCanvasEl.addEventListener("click", function (e) {
    if (cityDropActive) return;
    var rect = cityCanvasEl.getBoundingClientRect();
    var scaleX = cityCanvasEl.width / rect.width;
    var mx = (e.clientX - rect.left) * scaleX;
    cityTarget = cityPick(mx);
    render();
  });

  el.btnCityBomb.addEventListener("click", function () {
    if (cityTarget == null) return;
    cityArmAndDrop(cityTarget);
  });

  requestAnimationFrame(cityLoop);
}

// Drawing runs each frame while cityTick() refreshes the district mix at
// a slower cadence. The camera keeps generating fresh city ahead of it.
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
