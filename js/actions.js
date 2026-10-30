"use strict";

setupRepeatButton(el.btnPriceMinus, function (steps) {
  steps = steps || 1;
  state.price = Math.max(PRICE_MIN, round2(state.price - PRICE_STEP * steps));
  render();
});

setupRepeatButton(el.btnPricePlus, function (steps) {
  steps = steps || 1;
  var nextPrice = state.price + PRICE_STEP * steps;
  state.price = !isFinite(nextPrice) || nextPrice >= Number.MAX_VALUE / 100
    ? Number.MAX_VALUE
    : round2(nextPrice);
  render();
});

el.manualPrice.addEventListener("change", function () {
  var price = Number(el.manualPrice.value);
  if (!isFinite(price) || price < PRICE_MIN) {
    render();
    return;
  }
  state.price = Math.max(PRICE_MIN, round2(price));
  render();
});

el.manualPrice.addEventListener("keydown", function (e) {
  if (e.key === "Enter") el.manualPrice.blur();
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
  if (state.marketingLevel >= MARKETING_LEVEL_MAX) return;
  var cost = priceForMarketing();
  if (state.funds >= cost) {
    state.funds -= cost;
    state.marketingLevel = clampMarketingLevel(state.marketingLevel + 1);
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
    state.nailMakerCooldownUntil = Date.now() + NAILMAKER_COOLDOWN_MS * cardMult("buyCooldown");
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
  if (state.factories === 0) state.factoryBalance = FACTORY_BALANCE_DEFAULT;
  state.factories += 1;
  render();
});
el.btnBuyBreaker.addEventListener("click", function () {
  if (Date.now() < state.breakerCooldownUntil) return;
  var cost = breakerBuildCostEffective();
  if (state.funds < cost) return;

  state.funds -= cost;
  state.breakers += 1;
  state.unlockedMap = true;
  state.breakerCooldownUntil = Date.now() + BREAKER_COOLDOWN_MS * cardMult("buyCooldown");
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

el.btnGuide.addEventListener("click", function () {
  markGuideRead();
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

el.btnEndRun.addEventListener("click", function () {
  var karmaWarning = state.karma > 0
    ? "\n\nYour " + fmtInt(state.karma) + " karma will be lost. You'll start over with nothing, exactly like a brand new player. This is a dead end -- if you want your karma to carry forward and improve your next life, reincarnate instead."
    : "";
  var postNote = currentAuthUser()
    ? "will be saved to the leaderboard."
    : "won't be posted to a leaderboard because you aren't logged in.";
  var confirmed = window.confirm(
    "End this life for good?\n\n" +
    "Your final nail count (" + fmtInt(state.totalNailsMade) + ") " + postNote +
    karmaWarning
  );
  if (!confirmed) return;

  var user = currentAuthUser();
  var name = user ? (user.displayName || "player") : "anonymous";

  submitScore(name, Math.floor(state.totalNailsMade), { karma: state.karma, timeSec: state.simTime });
  deleteAllSaves();

  var endedLife = buildLifeRecord({ how: "ended" });
  var allLives = (state.pastLives || []).concat([endedLife]);
  var karmaLost = Math.max(0, state.karma);
  recordLifeEnd(endedLife, "ended", allLives, karmaLost);

  var nirvanaCarried = state.nirvanaAchieved;
  var wipeAppliedCarried = state.wipeApplied;
  var resetAppliedCarried = state.resetApplied;
  state = defaultState();
  state.nirvanaAchieved = nirvanaCarried;
  if (wipeAppliedCarried) state.wipeApplied = wipeAppliedCarried;
  if (resetAppliedCarried) state.resetApplied = resetAppliedCarried;

  render();
  showEndScreen({ kind: "ended", life: endedLife, allLives: allLives, karmaLost: karmaLost });
});

function migrateLoadedState() {
  state.marketingLevel = clampMarketingLevel(state.marketingLevel);
  state.factories = Array.isArray(state.factories) ? state.factories.length : Math.max(0, Math.floor(state.factories || 0));
  state.unlockedMap = state.unlockedMap || state.breakers > 0;
  state.factoryProgress = Math.min(state.factories, Math.max(0, Number(state.factoryProgress) || 0));
  delete state.factoryTimers;
  delete state.factorySquared;
  delete state.factorySquaredProgress;
  delete state.unlockedFactorySquared;
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

  if (typeof state.tao !== "number") {
    state.tao = typeof state.yinYangLevel === "number" ? state.yinYangLevel : 0;
  }
  delete state.taoBonusStack;
  delete state.yinYangLevel;

  if (state.cityKarmaLocked && state.karma < 0) state.karma = 0;
  delete state.cityKarmaLocked;

  if (!Array.isArray(state.pastLives)) state.pastLives = [];
  if (typeof cardsNormalize === "function") cardsNormalize();
  if (typeof floorNormalize === "function") floorNormalize();
}

function flashButton(btn, text) {
  var old = btn.textContent;
  btn.textContent = text;
  setTimeout(function () {
    btn.textContent = old;
  }, 1000);
}

function isCheatAllowed() {
  var user = currentAuthUser();
  if (!user || !user.displayName) return false;
  if (user.email !== "nailmaker" + AUTH_EMAIL_DOMAIN) return false;
  return CHEAT_ALLOWED_USERNAMES.indexOf(user.displayName.toLowerCase()) !== -1;
}
