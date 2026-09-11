"use strict";

// ----------------------------------------------------------------
// Actions
// ----------------------------------------------------------------

el.btnPriceMinus.addEventListener("click", function () {
  state.price = Math.max(PRICE_MIN, round2(state.price - PRICE_STEP));
  render();
});

el.btnPricePlus.addEventListener("click", function () {
  state.price = round2(state.price + PRICE_STEP);
  render();
});

el.btnMakeNail.addEventListener("click", function () {
  if (state.ironAmt >= IRON_PER_NAIL) {
    state.ironAmt -= IRON_PER_NAIL;
    state.unsold += 1;
    state.totalNailsMade += 1;
    render();
  }
});

el.btnBuyMarketing.addEventListener("click", function () {
  var cost = priceForMarketing();
  if (state.funds >= cost) {
    state.funds -= cost;
    state.marketingLevel += 1;
    render();
  }
});

el.btnBuyIron.addEventListener("click", function () {
  if (state.funds >= IRON_BUY_COST) {
    state.funds -= IRON_BUY_COST;
    state.ironAmt += IRON_BUY_AMOUNT;
    render();
  }
});

el.btnSellCopper.addEventListener("click", function () {
  if (state.copperAmt > 0) {
    state.funds += state.copperAmt * COPPER_SELL_PRICE;
    state.profitAccum += state.copperAmt;
    state.copperAmt = 0;
    render();
  }
});

el.btnBuyNailMaker.addEventListener("click", function () {
  if (Date.now() < state.nailMakerCooldownUntil) return;
  var cost = nailMakerCostEffective();
  if (state.funds >= cost) {
    state.funds -= cost;
    state.nailMakers += 1;
    state.nailMakerCooldownUntil = Date.now() + NAILMAKER_COOLDOWN_MS;
    render();
  }
});

el.sliderFactoryBalance.addEventListener("input", function () {
  state.factoryBalance = parseInt(el.sliderFactoryBalance.value, 10);
  render();
});

el.btnBuyFactory.addEventListener("click", function () {
  if (Date.now() < state.factoryCooldownUntil) return;
  var cost = factoryBuildCostEffective();
  if (state.funds < cost) return;

  state.funds -= cost;
  state.factories += 1;
  state.factoryTimers.push(0);
  state.factoryCooldownUntil = Date.now() + FACTORY_COOLDOWN_MS;
  render();
});
el.btnBuyBreaker.addEventListener("click", function () {
  if (Date.now() < state.breakerCooldownUntil) return;
  var cost = breakerBuildCostEffective();
  if (state.funds < cost) return;

  state.funds -= cost;
  state.breakers += 1;
  state.unlockedMap = true;
  state.breakerCooldownUntil = Date.now() + BREAKER_COOLDOWN_MS;
  render();
});
el.btnNextMap.addEventListener("click", goToNextMap);
el.btnAutoNextMap.addEventListener("click", function () {
  state.autoNextMap = !state.autoNextMap;
  render();
});

el.btnToggleNailMakers.addEventListener("click", function () {
  state.nailMakersOn = !state.nailMakersOn;
  render();
});
el.btnToggleFactories.addEventListener("click", function () {
  state.factoriesOn = !state.factoriesOn;
  render();
});
el.btnToggleBreakers.addEventListener("click", function () {
  state.breakersOn = !state.breakersOn;
  render();
});

function goToNextMap() {
  if (mapHasDeposits(state.mapTiles)) return;
  state.mapIndex += 1;
  state.mapTiles = generateMapTiles(state.mapIndex);
  state.mapTotalWeight = mapRemainingWeight(state.mapTiles);
  render();
}

el.btnSave.addEventListener("click", function () {
  localStorage.setItem("nailMakerSave", JSON.stringify(state));
  flashButton(el.btnSave, "saved!");
});

el.btnLoad.addEventListener("click", function () {
  var raw = localStorage.getItem("nailMakerSave");
  if (!raw) {
    flashButton(el.btnLoad, "no save found");
    return;
  }
  try {
    var data = JSON.parse(raw);
    state = Object.assign(defaultState(), data);
    migrateLoadedState();
    render();
    flashButton(el.btnLoad, "loaded!");
  } catch (e) {
    flashButton(el.btnLoad, "load failed");
  }
});

// ----------------------------------------------------------------
// Leaderboard -- local to this browser only. There's no server here,
// so this can't be a shared cross-player leaderboard; it's a running
// top-10 list of your own past runs on this device, stored under a
// separate localStorage key so resetting your run never touches it.
// ----------------------------------------------------------------

var LEADERBOARD_KEY = "nailMakerLeaderboard";
var LEADERBOARD_MAX_ENTRIES = 10;

function loadLeaderboard() {
  try {
    var raw = localStorage.getItem(LEADERBOARD_KEY);
    var list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function addLeaderboardEntry(name, score) {
  var list = loadLeaderboard();
  list.push({ name: name, score: score });
  list.sort(function (a, b) { return b.score - a.score; });
  list = list.slice(0, LEADERBOARD_MAX_ENTRIES);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list));
  return list;
}

function renderLeaderboard() {
  var list = loadLeaderboard();
  el.leaderboardList.innerHTML = "";
  if (list.length === 0) {
    var empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "no runs yet -- click \"end run\" to bank your first score";
    el.leaderboardList.appendChild(empty);
    return;
  }
  for (var i = 0; i < list.length; i++) {
    var row = document.createElement("div");
    row.className = "row";
    var nameSpan = document.createElement("span");
    nameSpan.className = "label";
    nameSpan.textContent = (i + 1) + ". " + list[i].name;
    var scoreSpan = document.createElement("span");
    scoreSpan.className = "value";
    scoreSpan.textContent = fmtInt(list[i].score) + " nails";
    row.appendChild(nameSpan);
    row.appendChild(scoreSpan);
    el.leaderboardList.appendChild(row);
  }
}

el.btnEndRun.addEventListener("click", function () {
  var confirmed = window.confirm(
    "End this run and start over from scratch?\n\n" +
    "Your final nail count (" + fmtInt(state.totalNailsMade) + ") will be saved to the leaderboard below. This can't be undone."
  );
  if (!confirmed) return;

  var name = window.prompt("Name for the leaderboard:", "");
  if (name === null) return; // cancelled -- don't reset if they backed out
  name = name.trim().slice(0, 20);
  if (!name) name = "anonymous";

  addLeaderboardEntry(name, Math.floor(state.totalNailsMade));
  state = defaultState();
  renderLeaderboard();
  render();
});

function migrateLoadedState() {
  if (Array.isArray(state.factories)) {
    var old = state.factories;
    state.factoryTimers = [];
    for (var i = 0; i < old.length; i++) {
      state.factoryTimers.push(old[i] && typeof old[i].timer === "number" ? old[i].timer : 0);
    }
    state.factories = old.length;
  } else {
    state.factories = Math.max(0, Math.floor(state.factories || 0));
    if (!Array.isArray(state.factoryTimers)) state.factoryTimers = [];
    while (state.factoryTimers.length < state.factories) state.factoryTimers.push(0);
    if (state.factoryTimers.length > state.factories) {
      state.factoryTimers = state.factoryTimers.slice(0, state.factories);
    }
  }
  if (typeof state.factoryCooldownUntil !== "number") state.factoryCooldownUntil = 0;
  state.unlockedMap = state.breakers > 0;
  if (!state.mapTotalWeight) {
    state.mapTotalWeight = Math.max(
      mapRemainingWeight(state.mapTiles),
      depositCapacityForMap(state.mapIndex) * DEPOSITS_PER_MAP
    );
  }
  delete state.playerRow;
  delete state.playerCol;
  delete state.mineCooldownUntil;
  delete state.blueprints;
  delete state.upgradesOwned;

  // Old saves used "yinYangLevel" -- carry it over as tao points, and
  // backfill the permanent bonus stack it would have earned.
  if (typeof state.tao !== "number") {
    state.tao = typeof state.yinYangLevel === "number" ? state.yinYangLevel : 0;
  }
  if (typeof state.taoBonusStack !== "number") {
    state.taoBonusStack = state.tao * TAO_PERMANENT_BONUS_PER_POINT;
  }
  delete state.yinYangLevel;
}

function flashButton(btn, text) {
  var old = btn.textContent;
  btn.textContent = text;
  setTimeout(function () {
    btn.textContent = old;
  }, 1000);
}

// ----------------------------------------------------------------
// Cheat box -- deliberately blends into the corner, no label.
// Type "<key> <amount>" and hit Enter.
// Keys: funds, unsold, iron, copper, nailmakers, factories, breakers, marketing, yin, yang
// ----------------------------------------------------------------

el.cheatBox.addEventListener("keydown", function (e) {
  if (e.key !== "Enter") return;
  var raw = el.cheatBox.value.trim().toLowerCase();
  var parts = raw.split(/\s+/);
  if (parts.length === 2) {
    var key = parts[0];
    var amount = parseFloat(parts[1]);
    if (!isNaN(amount)) {
      switch (key) {
        case "funds": state.funds = amount; break;
        case "unsold": state.unsold = Math.max(0, amount); break;
        case "iron": state.ironAmt = Math.max(0, amount); break;
        case "copper": state.copperAmt = Math.max(0, amount); break;
        case "nailmakers": state.nailMakers = Math.max(0, Math.floor(amount)); break;
        case "factories":
          state.factories = Math.max(0, Math.floor(amount));
          state.factoryTimers = [];
          for (var i = 0; i < state.factories; i++) state.factoryTimers.push(0);
          break;
        case "breakers":
          state.breakers = Math.max(0, Math.floor(amount));
          if (state.breakers > 0) state.unlockedMap = true;
          break;
        case "marketing": state.marketingLevel = Math.max(0, Math.floor(amount)); break;
        case "yin": state.yin = Math.max(0, Math.min(YINYANG_MAX, amount)); break;
        case "yang": state.yang = Math.max(0, Math.min(YINYANG_MAX, amount)); break;
        case "yylevel": state.tao = Math.max(0, Math.floor(amount)); break;
        case "tao": state.tao = Math.max(0, Math.floor(amount)); break;
      }
      render();
    }
  }
  el.cheatBox.value = "";
  el.cheatBox.blur();
});
