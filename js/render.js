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
  el.avgRev.textContent = fmtMoney(histRatePerSec(state.histRevenue));
  el.avgNails.textContent = fmtDecimal(histRatePerSec(state.histNailsMade));
  el.mapIndexLabel.textContent = state.mapIndex;

  // ---- machinery: factories ----
  el.factoryIronRate.textContent = fmtWeight(histRatePerSec(state.histFactoryIron));
  el.factoryCopperRate.textContent = fmtWeight(histRatePerSec(state.histFactoryCopper));
  el.factoryOutputRate.textContent = fmtDecimal(histRatePerSec(state.histFactoryOutput) * 60);

  el.sliderFactoryBalance.value = state.factoryBalance;
  var gray = Math.round(255 * (state.factoryBalance / 100));
  el.sliderFactoryBalance.style.accentColor = "rgb(" + gray + "," + gray + "," + gray + ")";

  var factoryReady = buyButtonLabel(
    el.btnBuyFactory,
    state.factoryCooldownUntil,
    "buy (" + fmtMoney(factoryBuildCostEffective()) + ")"
  );
  el.btnBuyFactory.disabled = !factoryReady || state.funds < factoryBuildCostEffective();

  // ---- machinery: nail breakers ----
  el.breakerNailsRate.textContent = fmtDecimal(histRatePerSec(state.histBreakerNails));
  el.breakerIronRate.textContent = fmtWeight(histRatePerSec(state.histBreakerIron));
  el.breakerCopperRate.textContent = fmtWeight(histRatePerSec(state.histBreakerCopper));

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

    var ratio = harmonyRatio();
    var totalBonusPct = Math.round((productionRateBonusMultiplier() - 1) * 100);
    if (ratio >= YINYANG_STATUS_DEADZONE) {
      el.yinYangStatus.textContent = "BALANCED \u2014 +" + totalBonusPct + "% maker/breaker speed";
    } else if (diff > 0) {
      el.yinYangStatus.textContent = "YANG-LEANING \u2014 +" + totalBonusPct + "% maker/breaker speed";
    } else {
      el.yinYangStatus.textContent = "YIN-LEANING \u2014 +" + totalBonusPct + "% maker/breaker speed";
    }

    if (el.yinYangHint) {
      el.yinYangHint.textContent = "harvest more than you use to fill yin, use more than you harvest to fill yang \u2014 fill both for a tao point, locking in today's balance bonus forever (" + Math.round(state.taoBonusStack * 100) + "% permanent so far)";
    }

    el.valKarma.textContent = fmtInt(state.karma);
    var karmaAvailable = Math.floor(state.tao / KARMA_TAO_THRESHOLD);
    if (karmaAvailable >= 1) {
      el.btnReincarnate.disabled = false;
      el.reincarnateHint.textContent = "end this life for +" + karmaAvailable + " karma (" + (state.karma + karmaAvailable) + " total) and a chance to rewrite " + (state.karma + karmaAvailable) + " part" + ((state.karma + karmaAvailable) === 1 ? "" : "s") + " of your next one";
    } else {
      el.btnReincarnate.disabled = true;
      el.reincarnateHint.textContent = "reach " + KARMA_TAO_THRESHOLD + " tao to end this life and be reborn";
    }
  }

  // ---- progressive reveal: unlock once, never re-hide ----
  if (!state.unlockedMap && state.breakers > 0) state.unlockedMap = true;
  if (!state.unlockedMachinery && state.totalNailsMade >= MACHINERY_UNLOCK_NAILS) state.unlockedMachinery = true;
  if (!state.unlockedTuning && state.totalNailsMade >= TUNING_UNLOCK_NAILS) state.unlockedTuning = true;

  el.mapSection.style.display = state.unlockedMap ? "" : "none";
  el.machinerySection.style.display = state.unlockedMachinery ? "" : "none";
  el.tuningSection.style.display = state.unlockedTuning ? "" : "none";
  el.yinYangSection.style.display = state.unlockedYinYang ? "" : "none";

  renderMap();
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
  el.mapHealthText.textContent = fmtWeight(remaining) + " / " + fmtWeight(total);
  var pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  el.mapHealthFill.style.width = pct + "%";

  el.btnNextMap.style.display = mapHasDeposits(state.mapTiles) ? "none" : "block";
  el.btnAutoNextMap.textContent = "auto-next map: " + (state.autoNextMap ? "ON" : "OFF");
}
