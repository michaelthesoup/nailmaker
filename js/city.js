"use strict";

// ----------------------------------------------------------------
// The city (foundation). Tunables and the state shape live in
// state.js; buff/inflation math lives in formulas.js. This file is
// the behavior: slow damage over time, pulse decay, actions, the
// nailbomb, moving on to the next city, and drawing the skyline.
//
// Acceleration is deliberately never shown as a number or bar -- it
// reads through the skyline and through the buff text under it.
// ----------------------------------------------------------------

var cityViewFor = null; // which cityBuildings array the smoothed values below belong to
var cityViewD = [];
var cityViewM = [];

function cityHurtPhysical(b, amount) {
  var before = b.d;
  b.d = Math.max(0, b.d - amount);
  var lost = (before - b.d) * b.pop;
  state.cityDead += lost * CITY_DEAD_FRACTION;
  state.cityDisplaced += lost * CITY_DISPLACED_FRACTION;
}

function cityDealDamage(amount) {
  var guard = 0;
  while (amount > 0.0001 && guard++ < 50) {
    var alive = [];
    for (var i = 0; i < state.cityBuildings.length; i++) {
      if (state.cityBuildings[i].d > 0.02) alive.push(state.cityBuildings[i]);
    }
    if (!alive.length) return;
    var b = alive[Math.floor(Math.random() * alive.length)];
    var take = Math.min(amount, b.d);
    cityHurtPhysical(b, take);
    amount -= take;
  }
}

function cityHollowedOut() {
  return cityAverage("d") < CITY_HOLLOW_THRESHOLD || cityAverage("m") < CITY_HOLLOW_THRESHOLD;
}

// A hollowed-out city means moving on to the next one: bigger, more
// people, fresh market. Acceleration and inflation come with you.
function cityNext() {
  state.cityIndex += 1;
  state.cityBuildings = generateCityBuildings(state.cityIndex);
  state.cityPending = 0;
}

function cityTick(dt) {
  if (!state.unlockedCity && state.totalNailsMade >= CITY_UNLOCK_NAILS) state.unlockedCity = true;

  // Pulses decay back toward zero; the floor never does.
  var decay = Math.pow(0.5, dt / ACCEL_PULSE_HALFLIFE_SEC);
  for (var lever in state.accelPulse) {
    state.accelPulse[lever] *= decay;
    if (state.accelPulse[lever] < 0.001) state.accelPulse[lever] = 0;
  }

  // A raised floor makes society quietly rot even between actions.
  state.cityPending += state.accelFloor * CITY_PASSIVE_DAMAGE_PER_SEC * dt;

  if (state.cityPending > 0) {
    var drain = Math.min(state.cityPending, Math.max(CITY_DAMAGE_DRAIN_MIN * dt, state.cityPending * CITY_DAMAGE_DRAIN_RATE * dt));
    state.cityPending -= drain;
    cityDealDamage(drain);
  }

  if (cityHollowedOut()) cityNext();
}

function cityActionCost(action) {
  return action.baseCost * inflationCostMult();
}

function cityDoAction(action) {
  var cost = cityActionCost(action);
  if (state.funds < cost) return;
  state.funds -= cost;
  state.accelPulse[action.lever] = Math.min(1, (state.accelPulse[action.lever] || 0) + action.spike);
  state.cityPending += action.damage;
  render();
}

function nailbombCost() {
  return NAILBOMB_BASE_NAILS * Math.pow(NAILBOMB_COST_GROWTH, state.nailbombs);
}

el.btnNailbomb.addEventListener("click", function () {
  var cost = nailbombCost();
  if (state.unsold < cost) return;
  var confirmed = window.confirm(
    "Detonate a nailbomb?\n\n" +
    "It burns " + fmtInt(cost) + " unsold nails to gut this city's market. " +
    "Nails will sell for more, but everything you buy will cost more too, and " +
    "society will keep rotting a little on its own.\n\n" +
    "This is permanent. It can't be undone, not even by reincarnating away from it."
  );
  if (!confirmed) return;

  state.unsold -= cost;
  state.nailbombs += 1;
  state.accelFloor = Math.min(ACCEL_FLOOR_MAX, state.nailbombs * ACCEL_FLOOR_PER_NAILBOMB);
  for (var i = 0; i < state.cityBuildings.length; i++) {
    state.cityBuildings[i].m = Math.max(0, state.cityBuildings[i].m - NAILBOMB_MARKET_DAMAGE);
  }
  render();
});

// ----------------------------------------------------------------
// UI
// ----------------------------------------------------------------

var cityActionButtons = {}; // id -> { row, button }

function cityBuildActionRows() {
  for (var i = 0; i < CITY_ACTIONS.length; i++) {
    (function (action) {
      var row = document.createElement("div");
      row.className = "row";
      var label = document.createElement("span");
      label.className = "label";
      label.textContent = action.label;
      var button = document.createElement("button");
      button.addEventListener("click", function () { cityDoAction(action); });
      row.appendChild(label);
      row.appendChild(button);
      el.cityActions.appendChild(row);
      cityActionButtons[action.id] = { row: row, button: button };
    })(CITY_ACTIONS[i]);
  }
}

function cityBuffText() {
  var parts = [];
  var pct = function (x) { return Math.round(x * 100) + "%"; };
  if (accelBuff("marketing") > 0.005) parts.push("marketing costs -" + pct(1 - accelMarketingCostMult()));
  if (accelBuff("factory") > 0.005) parts.push("factory costs -" + pct(1 - accelFactoryCostMult()));
  if (accelBuff("demand") > 0.005) parts.push("public demand +" + pct(accelDemandMult() - 1));
  if (state.nailbombs > 0) parts.push("nails sell x" + inflationRevenueMult().toFixed(1) + ", costs x" + inflationCostMult().toFixed(1));
  return parts.length ? parts.join(" \u00b7 ") : "the city is quiet";
}

function renderCity() {
  if (!el.citySection) return;
  el.citySection.style.display = state.unlockedCity ? "" : "none";
  if (!state.unlockedCity) return;

  el.cityIndexLabel.textContent = state.cityIndex;
  el.cityDead.textContent = fmtInt(state.cityDead);
  el.cityDisplaced.textContent = fmtInt(state.cityDisplaced);
  el.cityBuffs.textContent = cityBuffText();
  el.cityNailbombs.textContent = state.nailbombs;

  for (var i = 0; i < CITY_ACTIONS.length; i++) {
    var a = CITY_ACTIONS[i];
    var ui = cityActionButtons[a.id];
    var unlocked = state.totalNailsMade >= a.unlockNails;
    ui.row.style.display = unlocked ? "" : "none";
    ui.button.textContent = "buy (" + fmtMoney(cityActionCost(a)) + ")";
    ui.button.disabled = state.funds < cityActionCost(a);
    ui.row.firstChild.textContent = a.label + " \u2014 " + a.effect;
  }

  var bombCost = nailbombCost();
  el.btnNailbomb.textContent = "detonate nailbomb (" + fmtInt(bombCost) + " unsold nails)";
  el.btnNailbomb.disabled = state.unsold < bombCost;
  el.cityBombHint.textContent = "permanent: guts this city's market, inflates prices, and can't be pulled back out";
}

// ----------------------------------------------------------------
// Drawing -- the skyline IS the acceleration readout. Physical damage
// (actions) shrinks, cracks, and finally levels buildings. Market
// damage (nailbombs) leaves them standing with the windows dark.
// ----------------------------------------------------------------

function cityWindowValue(seed, k) {
  var x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function cityCssColor(name, fallback) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function cityDraw() {
  var canvas = el.cityCanvas;
  if (!canvas) return;
  var cx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height, GROUND = H - 20;
  var B = state.cityBuildings;

  if (cityViewFor !== B) {
    cityViewFor = B;
    cityViewD = B.map(function (b) { return b.d; });
    cityViewM = B.map(function (b) { return b.m; });
  }
  for (var s = 0; s < B.length; s++) {
    cityViewD[s] += (B[s].d - cityViewD[s]) * 0.08;
    cityViewM[s] += (B[s].m - cityViewM[s]) * 0.08;
  }

  var ink = cityCssColor("--ink", "#000");
  var paper = cityCssColor("--paper", "#fff");
  cx.clearRect(0, 0, W, H);
  cx.lineWidth = 1;
  cx.strokeStyle = ink;
  cx.beginPath();
  cx.moveTo(0, GROUND + 0.5);
  cx.lineTo(W, GROUND + 0.5);
  cx.stroke();

  var gap = 3, totalW = 0, i;
  for (i = 0; i < B.length; i++) totalW += B[i].w;
  totalW += gap * (B.length - 1);
  var scale = (W - 16) / totalW;
  var x = 8;

  for (i = 0; i < B.length; i++) {
    var b = B[i];
    var bw = b.w * scale;
    var d = cityViewD[i], m = cityViewM[i];

    if (d > 0.08) {
      var ch = b.h * (0.3 + 0.7 * d);
      var top = GROUND - ch;
      cx.fillStyle = paper;
      cx.strokeStyle = ink;
      cx.fillRect(x, top, bw, ch);
      cx.strokeRect(x + 0.5, top + 0.5, bw - 1, ch - 1);

      var cols = Math.max(1, Math.floor((bw - 6) / 7));
      var maxRows = Math.floor((ch - 8) / 12);
      for (var r = 0; r < maxRows; r++) {
        for (var c = 0; c < cols; c++) {
          var lit = cityWindowValue(b.seed, r * cols + c) < m;
          cx.globalAlpha = lit ? 1 : 0.12;
          cx.fillStyle = ink;
          cx.fillRect(x + 4 + c * 7, top + 5 + r * 12, 4, 6);
        }
      }
      cx.globalAlpha = 1;

      if (d < 0.75) {
        var crackX = x + bw * (0.25 + 0.5 * cityWindowValue(b.seed, 999));
        cx.strokeStyle = ink;
        cx.beginPath();
        cx.moveTo(crackX, top);
        cx.lineTo(crackX - 3, top + ch * 0.3);
        cx.lineTo(crackX + 3, top + ch * 0.55);
        cx.lineTo(crackX - 2, top + ch * 0.8);
        cx.stroke();
      }
    } else {
      cx.fillStyle = ink;
      for (var p = 0; p < 6; p++) {
        var rx = x + ((p * 7919 + i * 31) % Math.max(1, Math.floor(bw)));
        cx.fillRect(rx, GROUND - 2 - ((p * 13 + i) % 5), 3, 2 + ((p + i) % 3));
      }
    }
    x += bw + gap * scale;
  }
}

function cityLoop() {
  if (state.unlockedCity) cityDraw();
  requestAnimationFrame(cityLoop);
}

cityBuildActionRows();
requestAnimationFrame(cityLoop);
