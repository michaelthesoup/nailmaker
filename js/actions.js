"use strict";

// ----------------------------------------------------------------
// Actions
// ----------------------------------------------------------------

setupRepeatButton(el.btnPriceMinus, function () {
  state.price = Math.max(PRICE_MIN, round2(state.price - PRICE_STEP));
  render();
});

setupRepeatButton(el.btnPricePlus, function () {
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
  var cost = factoryBuildCostEffective();
  if (state.funds < cost) return;

  state.funds -= cost;
  state.factories += 1;
  state.factoryTimers.push(0);
  render();
});
el.btnBuyFactorySquared.addEventListener("click", function () {
  var cost = factorySquaredBuildCostEffective();
  if (state.funds < cost) return;

  state.funds -= cost;
  state.factorySquared += 1;
  state.factorySquaredTimers.push(0);
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
// Guide
// ----------------------------------------------------------------

el.btnGuide.addEventListener("click", function () {
  markGuideRead();
  renderGuide();
  el.guideOverlay.style.display = "block";
  el.guideOverlay.scrollTop = 0;
});

el.btnGuideClose.addEventListener("click", function () {
  el.guideOverlay.style.display = "none";
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && el.guideOverlay.style.display === "block") {
    el.guideOverlay.style.display = "none";
  }
});

// Table-of-contents links scroll the guide itself, not the page behind it.
el.guideOverlay.addEventListener("click", function (e) {
  var link = e.target.closest("a[data-goto]");
  if (!link) return;
  e.preventDefault();
  var target = document.getElementById(link.getAttribute("data-goto"));
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});

function guideUnlocks() {
  return {
    handmade: state.totalNailsMade >= 100,
    machinery: state.unlockedMachinery,
    map: state.unlockedMap,
    yinYang: state.unlockedYinYang
  };
}

function markGuideRead() {
  var unlocked = guideUnlocks();
  if (!state.guideSeen) state.guideSeen = {};
  for (var key in unlocked) {
    if (unlocked[key]) state.guideSeen[key] = true;
  }
}

// ----------------------------------------------------------------
// End Run -- leaderboard storage/rendering itself lives in leaderboard.js
// ----------------------------------------------------------------

el.btnEndRun.addEventListener("click", function () {
  var karmaWarning = state.karma > 0
    ? "\n\nYour " + fmtInt(state.karma) + " karma will be lost. You'll start over with nothing, exactly like a brand new player. This is a dead end -- if you want your karma to carry forward and improve your next life, reincarnate instead."
    : "";
  var confirmed = window.confirm(
    "End this life for good?\n\n" +
    "Your final nail count (" + fmtInt(state.totalNailsMade) + ") will be saved to the leaderboard below." +
    karmaWarning
  );
  if (!confirmed) return;

  var user = currentAuthUser();
  var name;
  if (user) {
    // Logged-in players are always identified by their account username --
    // no point asking them to type a name they already have.
    name = user.displayName || "player";
  } else {
    name = window.prompt("Name for the leaderboard:", "");
    if (name === null) return; // cancelled -- don't reset if they backed out
    name = name.trim().slice(0, 20);
    if (!name) name = "anonymous";
  }

  submitScore(name, Math.floor(state.totalNailsMade));
  deleteAllSaves();

  // Capture this life (and the whole run) for the end screen before the
  // reset below wipes it -- including the past lives log, which ending a
  // run destroys.
  var endedLife = buildLifeRecord({ how: "ended" });
  var allLives = (state.pastLives || []).concat([endedLife]);
  var karmaLost = Math.max(0, state.karma);
  recordLifeEnd(endedLife, "ended", allLives, karmaLost); // lifetime stats survive the wipe below

  var nirvanaCarried = state.nirvanaAchieved; // a real achievement -- survives even this
  state = defaultState();
  state.nirvanaAchieved = nirvanaCarried;

  render();
  showEndScreen({ kind: "ended", life: endedLife, allLives: allLives, karmaLost: karmaLost });
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
  state.unlockedMap = state.unlockedMap || state.breakers > 0;
  if (!Array.isArray(state.factorySquaredTimers)) state.factorySquaredTimers = [];
  state.factorySquared = Math.max(0, Math.floor(state.factorySquared || 0));
  while (state.factorySquaredTimers.length < state.factorySquared) state.factorySquaredTimers.push(0);
  if (state.factorySquaredTimers.length > state.factorySquared) {
    state.factorySquaredTimers = state.factorySquaredTimers.slice(0, state.factorySquared);
  }
  if (!state.mapTotalWeight) {
    state.mapTotalWeight = Math.max(
      mapRemainingWeight(state.mapTiles),
      depositCapacityForMap(state.mapIndex) * mapDepositCount()
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
  delete state.taoBonusStack;
  delete state.yinYangLevel;

  // The karma lock no longer exists (nailbombs drain tao instead). A save
  // made under the old rule has karma stuck at -1 -- reset it to 0.
  if (state.cityKarmaLocked && state.karma < 0) state.karma = 0;
  delete state.cityKarmaLocked;

  if (!Array.isArray(state.pastLives)) state.pastLives = [];
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
// Only works for accounts on CHEAT_ALLOWED_USERNAMES (see state.js).
// Type "<key> <amount>" and hit Enter.
// Keys: funds, unsold, iron, copper, nailmakers, factories, breakers, marketing, yin, yang
// ----------------------------------------------------------------

function isCheatAllowed() {
  var user = currentAuthUser();
  if (!user || !user.displayName) return false;
  return CHEAT_ALLOWED_USERNAMES.indexOf(user.displayName.toLowerCase()) !== -1;
}

el.cheatBox.addEventListener("keydown", function (e) {
  if (e.key !== "Enter") return;

  if (!isCheatAllowed()) {
    el.cheatBox.value = "";
    el.cheatBox.blur();
    return;
  }

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
        case "totalnails": state.totalNailsMade = Math.max(0, amount); break;
        case "citybombs": state.cityBombs = Math.max(0, Math.floor(amount)); break;
      }
      render();
    }
  }
  el.cheatBox.value = "";
  el.cheatBox.blur();
});
