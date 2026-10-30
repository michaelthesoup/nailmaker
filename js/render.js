"use strict";

function render() {
  el.title.textContent = "nails: " + fmtInt(state.totalNailsMade);
  el.funds.textContent = fmtMoney(state.funds);
  el.unsold.textContent = fmtInt(state.unsold);
  el.price.textContent = fmtMoney(state.price);
  el.price.style.display = "none";
  el.manualPriceWrap.style.display = "flex";
  if (document.activeElement !== el.manualPrice) el.manualPrice.value = state.price.toFixed(2);
  el.demand.textContent = Math.round(publicDemandPD()) + "%";
  var demandBonusPct = Math.round(permanentDemandBonus() * 100);
  el.demandYYNote.textContent = demandBonusPct > 0 ? "+" + demandBonusPct + "%" : "";
  var makerBonusPct = Math.round(makerRateBonus() * 100);
  var breakerBonusPct = Math.round(breakerRateBonus() * 100);
  el.nailMakerBonus.textContent = makerBonusPct > 0 ? "+" + makerBonusPct + "%" : "";
  el.breakerBonus.textContent = breakerBonusPct > 0 ? "+" + breakerBonusPct + "%" : "";
  el.marketing.textContent = state.marketingLevel + (state.marketingLevel >= MARKETING_LEVEL_MAX ? " (max)" : "");
  el.iron.textContent = fmtWeight(state.ironAmt);
  el.copper.textContent = fmtWeight(state.copperAmt);
  el.nailMakers.textContent = state.nailMakers;
  el.factories.textContent = state.factories;
  el.factoryBonus.textContent = "";
  el.breakers.textContent = state.breakers;
  var capacityNailsPerSec = state.nailMakers * nailMakerRateEffective();
  el.nailMakerNailsRate.textContent = fmtRateNum(capacityNailsPerSec);
  el.nailMakerIronRate.textContent = fmtRate(ironDemandRate());
  var ironLow = state.ironAmt < capacityNailsPerSec * IRON_PER_NAIL;
  var ironStarved = capacityNailsPerSec > 0 && ironLow && actualNailsPerSec < capacityNailsPerSec * 0.97;
  var theoreticalNailsPerSec = ironStarved ? Math.min(actualNailsPerSec, capacityNailsPerSec) : capacityNailsPerSec;
  var theoreticalSoldPerSec = avgNailsSoldPerSec();
  var sustainableSoldPerSec = Math.min(theoreticalSoldPerSec, theoreticalNailsPerSec);
  el.avgRev.textContent = fmtMoney(sustainableSoldPerSec * state.price * cardMult("saleMult"));
  el.avgNails.textContent = fmtDecimal(theoreticalNailsPerSec);
  el.mapIndexLabel.textContent = state.mapIndex;

  var factorySpeedMult = typeof moduleSpeedMult === "function" ? moduleSpeedMult() : 1;
  var factoryCopperRate = state.factories * factorySpeedMult * (1 / FACTORY_PERIOD_SEC) * factoryCopperCostEffective();
  el.factoryMaterialUse.textContent = "consuming " + fmtWeight(factoryCopperRate) + " copper/s";
  var factoryOut = factoryOutputRates();
  el.factoryMakerRate.textContent = fmtRateNum(factoryOut.makers);
  el.factoryBreakerRate.textContent = fmtRateNum(factoryOut.breakers);

  el.sliderFactoryBalance.value = state.factoryBalance;
  el.factoryMakerPct.textContent = Math.round(state.factoryBalance) + "%";
  el.factoryBreakerPct.textContent = Math.round(100 - state.factoryBalance) + "%";
  var gray = Math.round(255 * (state.factoryBalance / 100));
  el.sliderFactoryBalance.style.accentColor = "rgb(" + gray + "," + gray + "," + gray + ")";

  el.btnBuyFactory.textContent = "buy (" + fmtMoney(factoryBuildCostEffective()) + ")";
  el.btnBuyFactory.disabled = state.funds < factoryBuildCostEffective();

  var breakerRates = breakerTheoreticalRates();
  el.breakerNailsRate.textContent = fmtRateNum(breakerRates.ammoRate);
  el.breakerIronRate.textContent = fmtRate(ironSupplyRate());
  el.breakerCopperRate.textContent = fmtRate(breakerRates.copperRate);

  var breakerReady = buyButtonLabel(
    el.btnBuyBreaker,
    state.breakerCooldownUntil,
    "buy (" + fmtMoney(breakerBuildCostEffective()) + ")"
  );
  el.btnBuyBreaker.disabled = !breakerReady || state.funds < breakerBuildCostEffective();

  if (state.marketingLevel >= MARKETING_LEVEL_MAX) {
    el.btnBuyMarketing.textContent = "max level";
    el.btnBuyMarketing.disabled = true;
  } else {
    el.btnBuyMarketing.textContent = "buy (" + fmtMoney(priceForMarketing()) + ")";
    el.btnBuyMarketing.disabled = state.funds < priceForMarketing();
  }

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

  checkYinYangUnlock();
  checkSwarmUnlock();
  if (state.unlockedYinYang) {
    var yyMax = yinYangMax();
    el.yin.textContent = fmtInt(state.yin) + " / " + fmtInt(yyMax);
    el.yang.textContent = fmtInt(state.yang) + " / " + fmtInt(yyMax);
    var anyIron = ironDemandRate() > 0 || ironSupplyRate() > 0;
    var yangAhead = anyIron && makersAhead();
    var yinAhead = anyIron && !makersAhead();
    el.yinLabel.style.fontWeight = el.yin.style.fontWeight = yinAhead ? "bold" : "normal";
    el.yangLabel.style.fontWeight = el.yang.style.fontWeight = yangAhead ? "bold" : "normal";
    el.yinYangLevel.textContent = fmtInt(state.tao);

    var diff = state.yang - state.yin;
    var pos = Math.max(0, Math.min(100, 50 + (diff / yyMax) * 50));
    el.sliderYinYang.value = pos;
    var yyGray = Math.round(255 * (pos / 100));
    el.sliderYinYang.style.accentColor = "rgb(" + yyGray + "," + yyGray + "," + yyGray + ")";

    renderYinYangStatus(yinYangStatusLabel());

    var negativeKarma = state.tao < 0 ? Math.trunc(state.tao / KARMA_TAO_THRESHOLD) : 0;
    el.valKarma.textContent = fmtInt(state.karma + negativeKarma);
    el.btnPastLives.textContent = "past lives (" + (state.pastLives ? state.pastLives.length : 0) + ")";
    var karmaAvailable = Math.floor(state.tao / KARMA_TAO_THRESHOLD);
    var karmaGain = reincarnationKarmaGainNow();
    if (state.tao < 0 || karmaAvailable < 1) {
      el.btnReincarnate.disabled = true;
      el.btnReincarnate.textContent = "reincarnate";
    } else {
      el.btnReincarnate.disabled = false;
      el.btnReincarnate.textContent = karmaGain > 0 ? "reincarnate (+" + karmaGain + " karma)" : "reincarnate";
    }
  }

  if (!state.unlockedMap && state.breakers > 0) state.unlockedMap = true;
  if (!state.unlockedMachinery && state.totalNailsMade >= MACHINERY_UNLOCK_NAILS) state.unlockedMachinery = true;
  el.mapSection.style.display = state.unlockedMap ? "" : "none";
  if (el.postBreakerSection) el.postBreakerSection.style.display = state.unlockedMap ? "" : "none";
  if (el.factoryBalanceSliderWrap) el.factoryBalanceSliderWrap.style.display = state.factories > 0 ? "" : "none";
  el.machinerySection.style.display = state.unlockedMachinery ? "" : "none";
  el.yinYangSection.style.display = state.unlockedYinYang ? "" : "none";
  if (el.swarmSection) el.swarmSection.style.display = state.unlockedSwarm ? "" : "none";

  renderMap();
  if (typeof renderCity === "function") renderCity();
  if (typeof renderResonance === "function") renderResonance();
  if (typeof renderSlots === "function") renderSlots();
  if (typeof renderFloor === "function") renderFloor();
  if (typeof newsRender === "function") newsRender();
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
