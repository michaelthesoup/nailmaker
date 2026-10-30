"use strict";

function marketingMultiplier() {
  return Math.pow(MARKETING_LEVEL_MULT, state.marketingLevel);
}

var DEMAND_CURVE_EXPONENT = 1.6;

var PRICE_DEMAND_SENSITIVITY = 1;

function publicDemandPD() {
  if (state.price <= 0) return 0;
  return marketingMultiplier() * Math.pow(0.8 / state.price, PRICE_DEMAND_SENSITIVITY) * yinYangPDMultiplier() * cityFeverMult() * cardMult("demandMult");
}

function avgNailsSoldPerSec() {
  var pd = publicDemandPD();
  if (pd <= 0) return 0;
  return Math.min(1, pd / 100) * 7 * Math.pow(pd, DEMAND_CURVE_EXPONENT);
}

function currentNailProductionRate() {
  var capacity = state.nailMakers * nailMakerRateEffective();
  if (capacity <= 0) return 0;
  var ironLow = state.ironAmt < capacity * IRON_PER_NAIL;
  var measuredRate = typeof actualNailsPerSec === "number" ? actualNailsPerSec : capacity;
  return ironLow && measuredRate < capacity * 0.97 ? Math.min(measuredRate, capacity) : capacity;
}

function optimalPriceForCurrentProduction() {
  var targetSales = currentNailProductionRate() * OPTIMAL_PRICE_SALES_RATIO;
  if (targetSales <= 0) return null;

  var salesAtDemand100 = 7 * Math.pow(100, DEMAND_CURVE_EXPONENT);
  var targetDemand = targetSales <= salesAtDemand100
    ? Math.pow(targetSales / 0.07, 1 / (1 + DEMAND_CURVE_EXPONENT))
    : Math.pow(targetSales / 7, 1 / DEMAND_CURVE_EXPONENT);
  var demandMultiplier = marketingMultiplier() * yinYangPDMultiplier() * cityFeverMult() * cardMult("demandMult");
  var price = 0.8 * Math.pow(demandMultiplier / targetDemand, 1 / PRICE_DEMAND_SENSITIVITY);
  if (!isFinite(price) || price >= Number.MAX_VALUE / 100) return Number.MAX_VALUE;

  var lowerPrice = Math.max(PRICE_MIN, Math.floor(price * 100) / 100);
  var upperPrice = Math.max(PRICE_MIN, Math.ceil(price * 100) / 100);
  var lowerDemand = demandMultiplier * Math.pow(0.8 / lowerPrice, PRICE_DEMAND_SENSITIVITY);
  var lowerSales = Math.min(1, lowerDemand / 100) * 7 * Math.pow(lowerDemand, DEMAND_CURVE_EXPONENT);
    var upperDemand = demandMultiplier * Math.pow(0.8 / upperPrice, PRICE_DEMAND_SENSITIVITY);
    var upperSales = Math.min(1, upperDemand / 100) * 7 * Math.pow(upperDemand, DEMAND_CURVE_EXPONENT);
  if (lowerSales <= targetSales / OPTIMAL_PRICE_SALES_RATIO * OPTIMAL_PRICE_MAX_SALES_RATIO
      && Math.abs(lowerSales - targetSales) < Math.abs(upperSales - targetSales)) {
    return lowerPrice;
  }
  return upperPrice;
}

function priceForMarketing() {
  return MARKETING_BASE_COST * Math.pow(MARKETING_GROWTH, state.marketingLevel) * cardMult("marketingCost");
}

function nailMakerCostEffective() {
  return NAILMAKER_COST * cardMult("machineCost");
}

function factoryCostGrowth() {
  return Math.max(1.02, 1 + (FACTORY_COST_GROWTH - 1) * cardMult("factoryGrowth"));
}

function handBuiltFactories() {
  return Math.max(0, state.factories - Math.min(state.autoFactories || 0, state.factories));
}

function factoryBuildCostEffective() {
  var discount = typeof moduleFactoryDiscount === "function" ? moduleFactoryDiscount() : 0;
  return FACTORY_BUILD_COST_FUNDS * Math.pow(factoryCostGrowth(), handBuiltFactories()) * (1 - discount) * cardMult("machineCost");
}

function factoryMakerFraction() {
  return state.factoryBalance / 100;
}

function factoryCopperCostEffective() {
  var f = factoryMakerFraction();
  var base = FACTORY_COST_BREAKER_SIDE_COPPER * (1 - f) + FACTORY_COST_MAKER_SIDE_COPPER * f;
  var save = typeof moduleCopperSave === "function" ? moduleCopperSave() : 0;
  return base * (1 - save) * cardMult("copperCost");
}

function breakerBuildCostEffective() {
  return BREAKER_BUILD_COST_FUNDS * cardMult("machineCost");
}

function nailMakerRateEffective() {
  if (!state.nailMakersOn) return 0;
  return NAILMAKER_RATE * (1 + makerRateBonus()) * cardMult("makerSpeed");
}

function breakerIntakeEffective() {
  if (!state.breakersOn) return 0;
  return BREAKER_INTAKE_RATE * (1 + breakerRateBonus()) * cardMult("breakerSpeed");
}

function factoryOutputRates() {
  if (!state.factoriesOn || state.factories <= 0) return { makers: 0, breakers: 0 };
  var speed = typeof moduleSpeedMult === "function" ? moduleSpeedMult() : 1;
  var capacity = state.factories * speed / FACTORY_PERIOD_SEC;
  var cost = factoryCopperCostEffective();
  var copperShort = cost > 0 && state.copperAmt < capacity * cost && actualFactoryCyclesPerSec < capacity * 0.97;
  var cycles = copperShort ? Math.min(actualFactoryCyclesPerSec, capacity) : capacity;
  var bonus = typeof moduleBonuses === "function" ? moduleBonuses() : null;
  var makerShare = state.factoryBalance / 100;
  return {
    makers: cycles * makerShare * (1 + (bonus ? bonus.makerYield : 0)),
    breakers: cycles * (1 - makerShare) * (1 + (bonus ? bonus.breakerYield : 0))
  };
}

function breakerTheoreticalRates() {
  var ammoRate = state.breakers * breakerIntakeEffective();
  var activeTiles = activeDepositTiles(state.mapTiles);
  var ironTiles = 0, copperTiles = 0;
  for (var i = 0; i < activeTiles.length; i++) {
    if (activeTiles[i].type === "i") ironTiles++; else copperTiles++;
  }
  return {
    ammoRate: ammoRate,
    ironRate: ammoRate * ironTiles,
    copperRate: ammoRate * copperTiles
  };
}

function processBreakerNails(nailsToUse) {
  var activeTiles = activeDepositTiles(state.mapTiles);
  if (nailsToUse <= 0 || activeTiles.length === 0) {
    return { nailsUsed: 0, ironGot: 0, copperGot: 0 };
  }

  var nailsUsed = Math.min(nailsToUse, state.unsold);
  for (var i = 0; i < activeTiles.length; i++) {
    nailsUsed = Math.min(nailsUsed, activeTiles[i].remaining);
  }
  nailsUsed = Math.max(0, nailsUsed);

  if (nailsUsed <= 0) {
    return { nailsUsed: 0, ironGot: 0, copperGot: 0 };
  }

  var ironGot = 0;
  var copperGot = 0;

  for (var j = 0; j < activeTiles.length; j++) {
    var tile = activeTiles[j];
    var amount = Math.min(nailsUsed, tile.remaining);
    tile.remaining -= amount;

    if (tile.type === "i") {
      ironGot += amount;
    } else if (tile.type === "c") {
      copperGot += amount;
    }
  }

  state.unsold -= nailsUsed;

  return { nailsUsed: nailsUsed, ironGot: ironGot, copperGot: copperGot };
}

function ironDemandRate() {
  return state.nailMakers * nailMakerRateEffective() * IRON_PER_NAIL;
}

function ironSupplyRate() {
  return breakerTheoreticalRates().ironRate;
}

function makersAhead() {
  return ironDemandRate() >= ironSupplyRate();
}

function ironStructuralImbalance() {
  var demand = ironDemandRate();
  var supply = ironSupplyRate();
  var total = demand + supply;
  if (total <= 0) return 0;
  return (demand - supply) / total;
}

var YINYANG_BALANCE_TOLERANCE = 0.05;

function activeIronTileCount() {
  var activeTiles = activeDepositTiles(state.mapTiles);
  var count = 0;
  for (var i = 0; i < activeTiles.length; i++) {
    if (activeTiles[i].type === "i") count++;
  }
  return count;
}

function ironDeficitMakers() {
  var demand = ironDemandRate();
  var supply = ironSupplyRate();
  if (supply <= demand) return 0;
  var perMakerDemand = nailMakerRateEffective() * IRON_PER_NAIL;
  if (perMakerDemand <= 0) return 0;
  return (supply - demand) / perMakerDemand;
}

function ironDeficitBreakers() {
  var demand = ironDemandRate();
  var supply = ironSupplyRate();
  if (demand <= supply) return 0;
  var ironTiles = activeIronTileCount();
  var perBreakerSupply = breakerIntakeEffective() * ironTiles;
  if (perBreakerSupply <= 0) return 0;
  return (demand - supply) / perBreakerSupply;
}

function checkYinYangUnlock() {
  if (state.unlockedYinYang) return;
  if (state.nailMakers >= 1 && state.breakers >= 1) {
    state.unlockedYinYang = true;
  }
}

function checkSwarmUnlock() {
  if (state.unlockedSwarm) return;
  if (state.tao >= 1 && state.factories >= 1) {
    state.unlockedSwarm = true;
  }
}

function harmonyRatio() {
  if (!state.unlockedYinYang) return 0;
  var lo = Math.min(state.yin, state.yang);
  var hi = Math.max(state.yin, state.yang);
  if (hi <= 0) return 0;
  return lo / hi;
}

function taoRateBonus() {
  return Math.max(0, state.tao) * TAO_RATE_BONUS_PER_POINT * cardMult("taoRate");
}

function productionRateBonusMultiplier() {
  return 1 + taoRateBonus();
}

function makerRateBonus() {
  return taoRateBonus();
}

function breakerRateBonus() {
  return taoRateBonus();
}

var YINYANG_INTERVAL_FLOOR_SEC = 0.05;

function yinYangTickAmount() {
  return YINYANG_TICK_AMOUNT * Math.max(1, cardMult("yinYangSpeed") * YINYANG_INTERVAL_FLOOR_SEC);
}

function yinYangTickInterval() {
  return Math.max(YINYANG_INTERVAL_FLOOR_SEC, 1 / cardMult("yinYangSpeed"));
}

function yinYangStatusLabel() {
  if (!state.unlockedYinYang) return "BALANCED";
  var diff = state.yang - state.yin;
  if (state.yin === state.yang || harmonyRatio() >= YINYANG_STATUS_DEADZONE) return "BALANCED";
  return diff > 0 ? "YANG-LEANING" : "YIN-LEANING";
}

function taoDemandBonus() {
  return Math.max(0, state.tao) * YINYANG_PD_BONUS_PER_LEVEL * cardMult("taoDemand");
}

function permanentDemandBonus() {
  return taoDemandBonus() + Math.min(CITY_MARKET_SCAR_MAX, state.cityMarketScar);
}

function yinYangPDMultiplier() {
  return 1 + permanentDemandBonus();
}

function taoCostStep() {
  return TAO_COST_STEP * cardMult("taoGrowth");
}

function yinYangMax() {
  var size = YINYANG_MAX + taoCostStep() * Math.max(0, state.tao);
  if (!isFinite(size)) size = 1e15;
  return Math.max(1, Math.round(Math.min(size, 1e15)));
}

function taoCostMult() {
  return yinYangMax() / YINYANG_MAX;
}

function settleYinYang() {
  if (state.unlockedYinYang) {
    var max = yinYangMax();
    var imbalance = ironStructuralImbalance();

    if (imbalance >= 0) {
      state.yang = Math.min(max, state.yang + yinYangTickAmount());
    } else {
      state.yin = Math.min(max, state.yin + yinYangTickAmount());
    }

    if (state.yin >= max && state.yang >= max) {
      state.tao += 1 + Math.max(0, Math.floor(cardAdd("taoPerCycle")));
      state.yin = 0;
      state.yang = 0;
    }
  }
}

function cityFeverMult() {
  var feverMult = 1 + CITY_FEVER_DEMAND_PER_POINT * state.cityFever;
  var panicMult = 1 + CITY_PANIC_DEMAND_MAX * state.cityPanic;
  return feverMult * panicMult;
}

function reincarnationKarmaGainNow() {
  var available = Math.floor(state.tao / KARMA_TAO_THRESHOLD);
  if (available < 1) return 0;
  return Math.max(0, Math.min(available, KARMA_CAP - state.karma));
}
