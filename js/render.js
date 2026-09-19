"use strict";

// ----------------------------------------------------------------
// Render
// ----------------------------------------------------------------

function render() {
  el.title.textContent = "nails: " + fmtInt(state.totalNailsMade);
  el.funds.textContent = fmtMoney(state.funds);
  el.unsold.textContent = fmtInt(state.unsold);
  el.price.textContent = fmtMoney(state.price);
  el.demand.textContent = Math.round(publicDemandPD()) + "%";
  if (state.unlockedYinYang && state.tao > 0) {
    el.demandYYNote.textContent = "(+" + Math.round(YINYANG_PD_BONUS_PER_LEVEL * state.tao * 100) + "% from tao)";
  } else {
    el.demandYYNote.textContent = "";
  }
  el.marketing.textContent = state.marketingLevel;
  el.iron.textContent = fmtWeight(state.ironAmt);
  el.copper.textContent = fmtWeight(state.copperAmt);
  el.nailMakers.textContent = state.nailMakers;
  el.factories.textContent = state.factories;
  el.breakers.textContent = state.breakers;
  var theoreticalNailsPerSec = state.nailMakers * nailMakerRateEffective();
  el.nailMakerNailsRate.textContent = fmtDecimal(theoreticalNailsPerSec);
  el.nailMakerIronRate.textContent = fmtWeight(theoreticalNailsPerSec * IRON_PER_NAIL);
  var theoreticalSoldPerSec = avgNailsSoldPerSec();
  // Demand alone can say "the market would take 62 nails/sec," but if
  // production can't actually make that many, sustained revenue can't
  // reach that either -- so revenue is capped at whichever is smaller.
  var sustainableSoldPerSec = Math.min(theoreticalSoldPerSec, theoreticalNailsPerSec);
  el.avgRev.textContent = fmtMoney(sustainableSoldPerSec * state.price);
  el.avgNails.textContent = fmtDecimal(theoreticalNailsPerSec);
  el.mapIndexLabel.textContent = state.mapIndex;

  // ---- machinery: factories ----
  var factoryCopperRate = state.factories * (1 / FACTORY_PERIOD_SEC) * factoryCopperCostEffective();
  el.factoryMaterialUse.textContent = "consuming " + fmtWeight(factoryCopperRate) + " copper/s";
  el.factoryOutputRate.textContent = fmtDecimal(state.factories * (1 / FACTORY_PERIOD_SEC) * 60);

  el.sliderFactoryBalance.value = state.factoryBalance;
  var gray = Math.round(255 * (state.factoryBalance / 100));
  el.sliderFactoryBalance.style.accentColor = "rgb(" + gray + "," + gray + "," + gray + ")";

  el.btnBuyFactory.textContent = "buy (" + fmtMoney(factoryBuildCostEffective()) + ")";
  el.btnBuyFactory.disabled = state.funds < factoryBuildCostEffective();

  // ---- machinery: nail breakers ----
  var breakerRates = breakerTheoreticalRates();
  el.breakerNailsRate.textContent = fmtDecimal(breakerRates.ammoRate);
  el.breakerIronRate.textContent = fmtWeight(breakerRates.ironRate);
  el.breakerCopperRate.textContent = fmtWeight(breakerRates.copperRate);

  var breakerReady = buyButtonLabel(
    el.btnBuyBreaker,
    state.breakerCooldownUntil,
    "buy (" + fmtMoney(breakerBuildCostEffective()) + ")"
  );
  el.btnBuyBreaker.disabled = !breakerReady || state.funds < breakerBuildCostEffective();

  el.btnBuyMarketing.textContent = "buy (" + fmtMoney(priceForMarketing()) + ")";
  el.btnBuyMarketing.disabled = state.funds < priceForMarketing();

  el.btnBuyIron.textContent = "buy " + fmtWeight(IRON_BUY_AMOUNT) + " (" + fmtMoney(IRON_BUY_COST) + ")";
  el.btnBuyIron.disabled = state.funds < IRON_BUY_COST;

  el.btnSellCopper.textContent = "sell (" + fmtMoney(state.copperAmt * COPPER_SELL_PRICE) + ")";
  el.btnSellCopper.disabled = state.copperAmt <= 0;

  var nailMakerReady = buyButtonLabel(
    el.btnBuyNailMaker,
    state.nailMakerCooldownUntil,
    "buy (" + fmtMoney(nailMakerCostEffective()) + ")"
  );
  el.btnBuyNailMaker.disabled = !nailMakerReady || state.funds < nailMakerCostEffective();

  el.btnMakeNail.disabled = state.ironAmt < IRON_PER_NAIL;
  el.btnPriceMinus.disabled = state.price <= PRICE_MIN;

  // ---- tuning: simple on/off ----
  el.btnToggleNailMakers.textContent = state.nailMakersOn ? "ON" : "OFF";
  el.btnToggleFactories.textContent = state.factoriesOn ? "ON" : "OFF";
  el.btnToggleBreakers.textContent = state.breakersOn ? "ON" : "OFF";

  // ---- yin & yang ----
  checkYinYangUnlock();
  if (state.unlockedYinYang) {
    el.yin.textContent = fmtInt(state.yin) + " / " + YINYANG_MAX;
    el.yang.textContent = fmtInt(state.yang) + " / " + YINYANG_MAX;
    el.yinYangLevel.textContent = state.tao;

    var diff = state.yang - state.yin;
    var pos = Math.max(0, Math.min(100, 50 + diff / 2));
    el.sliderYinYang.value = pos;
    var yyGray = Math.round(255 * (pos / 100));
    el.sliderYinYang.style.accentColor = "rgb(" + yyGray + "," + yyGray + "," + yyGray + ")";

    renderYinYangStatus(yinYangStatusLabel());

    el.yinYangSpeedCost.textContent = yinYangSpeedCost() + " tao";
    el.btnYinYangSpeed.disabled = state.tao < yinYangSpeedCost();

    if (el.yinYangHint) {
      el.yinYangHint.textContent = "harvest more than you use to fill yin, use more than you harvest to fill yang \u2014 fill both to earn Tao. Each held Tao gives makers and breakers +" + Math.round(TAO_RATE_BONUS_PER_POINT * 100) + "% rate and +" + Math.round(YINYANG_PD_BONUS_PER_LEVEL * 100) + "% demand.";
    }

    el.valKarma.textContent = fmtInt(state.karma);
    var karmaAvailable = Math.floor(state.tao / KARMA_TAO_THRESHOLD);
    if (karmaAvailable >= 1) {
      var projectedTotal = state.karma + karmaAvailable;
      el.btnReincarnate.disabled = false;
      el.reincarnateHint.textContent = "reincarnate for +" + karmaAvailable + " karma (" + projectedTotal + " total) \u2014 stronger starting bonuses become more likely as karma grows";
    } else {
      el.btnReincarnate.disabled = true;
      el.reincarnateHint.textContent = "reach " + KARMA_TAO_THRESHOLD + " tao to end this life and be reborn";
    }
  }

  // ---- progressive reveal: unlock once, never re-hide ----
  if (!state.unlockedMap && state.breakers > 0) state.unlockedMap = true;
  if (!state.unlockedMachinery && state.totalNailsMade >= MACHINERY_UNLOCK_NAILS) state.unlockedMachinery = true;
  if (!state.unlockedTuning && state.totalNailsMade >= TUNING_UNLOCK_NAILS) state.unlockedTuning = true;
  if (!state.unlockedMarket && state.totalNailsMade >= MARKET_UNLOCK_NAILS) state.unlockedMarket = true;

  el.mapSection.style.display = state.unlockedMap ? "" : "none";
  el.machinerySection.style.display = state.unlockedMachinery ? "" : "none";
  el.tuningSection.style.display = state.unlockedTuning ? "" : "none";
  if (el.marketSection) el.marketSection.style.display = state.unlockedMarket ? "" : "none";
  el.yinYangSection.style.display = state.unlockedYinYang ? "" : "none";
  if (el.swarmSection) el.swarmSection.style.display = state.unlockedYinYang ? "" : "none";

  renderGuide();
  renderMap();
  if (typeof renderMarket === "function") renderMarket();
}

function renderGuide() {
  if (!el.guideOverlay) return;
  var unlocked = guideUnlocks();
  if (!state.guideSeen) state.guideSeen = {};

  var sections = document.querySelectorAll("[data-guide-unlock]");
  for (var i = 0; i < sections.length; i++) {
    var key = sections[i].getAttribute("data-guide-unlock");
    sections[i].style.display = unlocked[key] ? "" : "none";
  }

  var unread = 0;
  for (var unlockKey in unlocked) {
    if (unlocked[unlockKey] && !state.guideSeen[unlockKey]) unread++;
  }
  el.btnGuide.textContent = unread ? "guide (" + unread + ")" : "guide";
}

function renderYinYangStatus(label) {
  el.yinYangStatus.textContent = label;
}

function renderMap() {
  var activeTiles = activeDepositTiles(state.mapTiles);
  var beingWorked = state.breakers > 0 && state.breakersOn && activeTiles.length > 0;

  var lines = [];
  for (var r = 0; r < MAP_ROWS; r++) {
    var line = "";
    for (var c = 0; c < MAP_COLS; c++) {
      var tile = state.mapTiles[r][c];
      if (tile.remaining > 0) {
        line += beingWorked ? tile.type.toUpperCase() : tile.type;
      } else {
        line += ".";
      }
    }
    lines.push(line);
  }
  el.mapDisplay.textContent = lines.join("\n");

  var remaining = mapRemainingWeight(state.mapTiles);
  var total = state.mapTotalWeight || remaining;
  var ironRemaining = 0;
  var copperRemaining = 0;
  for (var materialRow = 0; materialRow < MAP_ROWS; materialRow++) {
    for (var materialCol = 0; materialCol < MAP_COLS; materialCol++) {
      var materialTile = state.mapTiles[materialRow][materialCol];
      if (materialTile.type === "i") ironRemaining += materialTile.remaining;
      if (materialTile.type === "c") copperRemaining += materialTile.remaining;
    }
  }
  el.mapHealthText.textContent = fmtWeight(remaining) + " / " + fmtWeight(total);
  el.mapMaterials.textContent = "iron: " + fmtWeight(ironRemaining) + " | copper: " + fmtWeight(copperRemaining);
  var pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  el.mapHealthFill.style.width = pct + "%";

}
