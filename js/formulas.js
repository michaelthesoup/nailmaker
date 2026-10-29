"use strict";

// ----------------------------------------------------------------
// Formulas
// ----------------------------------------------------------------

function marketingMultiplier() {
  return Math.pow(MARKETING_LEVEL_MULT, state.marketingLevel);
}

// Universal Paperclips' demand math, with the universe/project terms
// (which we don't have) dropped since they're both just 1 for us:
//   PD = (k^M) * (0.8 / price)
//   avg sold/sec = min(1, PD/100) * 7 * PD^EXP
// Below PD=100 the min() clamp makes this behave like
// 0.07 * PD^(1+EXP) -- bumping EXP makes small price/marketing changes
// swing sold/sec a lot harder at low demand (matching how snappy the
// real Paperclips curve feels), while nails are still sold at whatever
// price you set, so it stays every bit as profitable -- more sales at
// the same price is strictly more revenue, never less.
var DEMAND_CURVE_EXPONENT = 1.6; // was 1.15

// How hard public demand swings when you move the price. At 1 (the
// original Paperclips shape), demand is exactly inversely proportional
// to price -- doubling price exactly halves demand. Above 1, price
// changes matter more; below 1, they matter less. This is separate
// from DEMAND_CURVE_EXPONENT above, which controls how demand turns
// into actual sales, not how price turns into demand.
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

// How much dearer each factory you own makes the next: 1.4 normally, and the factory-growth cards take a share off the
// 0.4 (never below 1.02, so a factory always costs a little more than the last).
function factoryCostGrowth() {
  return Math.max(1.02, 1 + (FACTORY_COST_GROWTH - 1) * cardMult("factoryGrowth"));
}

// Factories you bought yourself. The ones a black oscillator builds (resonance.js) don't make the next factory dearer,
// or the price would climb to infinity after a few thousand of them.
function handBuiltFactories() {
  return Math.max(0, state.factories - Math.min(state.autoFactories || 0, state.factories));
}

function factoryBuildCostEffective() {
  var discount = typeof moduleFactoryDiscount === "function" ? moduleFactoryDiscount() : 0; // blueprint tables (floor.js)
  return FACTORY_BUILD_COST_FUNDS * Math.pow(factoryCostGrowth(), handBuiltFactories()) * (1 - discount) * cardMult("machineCost");
}

// A factory's material cost per cycle depends on which way the balance
// slider is leaning. Building toward nail breakers (heavier mining
// equipment) costs a lot more copper than building toward nail makers
// (lighter machines). At dead center, it's the midpoint of the two.
// Iron is never part of this -- iron's job in this game is becoming
// nails, copper's job is becoming machines.
function factoryMakerFraction() {
  return state.factoryBalance / 100;
}

function factoryCopperCostEffective() {
  var f = factoryMakerFraction();
  var base = FACTORY_COST_BREAKER_SIDE_COPPER * (1 - f) + FACTORY_COST_MAKER_SIDE_COPPER * f;
  var save = typeof moduleCopperSave === "function" ? moduleCopperSave() : 0; // copper presses (floor.js)
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

// Theoretical rates, computed straight from current state -- always
// instantly accurate to breaker count and how many deposits are
// currently active, never a lagging or flickering historical average.
// How many nail makers and nail breakers the factories are building per second, exactly: cycles per second
// times the balance slider's split, with any extra machines the floor's dies add. When copper has run short
// it shows what is really being built (measured, see engine.js) instead of what they could do.
function factoryOutputRates() {
  if (!state.factoriesOn || state.factories <= 0) return { makers: 0, breakers: 0 };
  var speed = typeof moduleSpeedMult === "function" ? moduleSpeedMult() : 1;
  var capacity = state.factories * speed / FACTORY_PERIOD_SEC; // cycles per second at full speed
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
  var ammoRate = state.breakers * breakerIntakeEffective(); // nails/sec ammo
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

// One nail is one hit on every active deposit. Each hit removes 1g
// from that deposit and gives the player 1g of that deposit's material.
// Example: 10 iron deposits + 5 copper deposits = 10g iron + 5g copper
// from one nail. Empty deposits stop receiving hits. There's no
// artificial per-deposit throttle here -- breakers costing real iron
// and copper to build is what keeps a pile of them from getting out of
// hand, so extraction itself is only limited by ammo and by whatever's
// actually left in the ground.
function processBreakerNails(nailsToUse) {
  var activeTiles = activeDepositTiles(state.mapTiles);
  if (nailsToUse <= 0 || activeTiles.length === 0) {
    return { nailsUsed: 0, ironGot: 0, copperGot: 0 };
  }

  // A nail can only hit each deposit once. Therefore the number of
  // complete nails we can use is limited by the smallest remaining
  // deposit.
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

// ----------------------------------------------------------------
// Structural iron balance. This is the REAL signal the swarm and
// yin/yang both key off -- not moment-to-moment actual flow (which
// self-throttles the instant the iron buffer runs dry, making it
// useless as a balance signal), but the underlying capacity your
// current build represents: how much iron your nail makers COULD
// consume, versus how much your breakers COULD extract. That only
// changes when you actually change your build or the map does.
// ----------------------------------------------------------------

function ironDemandRate() {
  return state.nailMakers * nailMakerRateEffective() * IRON_PER_NAIL;
}

function ironSupplyRate() {
  return breakerTheoreticalRates().ironRate;
}

// -1 (all supply, yin-leaning/breaking-heavy) .. 0 (balanced) ..
// +1 (all demand, yang-leaning/making-heavy)
// Which side is ahead, from the SAME two numbers the panels show: what your makers could use per second
// against what your breakers could bring in. There is no "balanced": it is always one or the other, and it
// flips exactly where those two numbers cross. A tie counts as makers (the yang tick, as in settleYinYang).
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

var YINYANG_BALANCE_TOLERANCE = 0.05; // within this of dead-even counts as "balanced" for tick purposes

function activeIronTileCount() {
  var activeTiles = activeDepositTiles(state.mapTiles);
  var count = 0;
  for (var i = 0; i < activeTiles.length; i++) {
    if (activeTiles[i].type === "i") count++;
  }
  return count;
}

// How many ADDITIONAL nail makers would close a supply surplus (too
// many breakers relative to what your makers can consume) -- 0 if
// there's no surplus. This is the real target the swarm grants toward,
// not an arbitrary percentage.
function ironDeficitMakers() {
  var demand = ironDemandRate();
  var supply = ironSupplyRate();
  if (supply <= demand) return 0;
  var perMakerDemand = nailMakerRateEffective() * IRON_PER_NAIL;
  if (perMakerDemand <= 0) return 0;
  return (supply - demand) / perMakerDemand;
}

// How many ADDITIONAL breakers would close a demand surplus (too many
// makers relative to what your breakers can feed) -- 0 if none.
function ironDeficitBreakers() {
  var demand = ironDemandRate();
  var supply = ironSupplyRate();
  if (demand <= supply) return 0;
  var ironTiles = activeIronTileCount();
  var perBreakerSupply = breakerIntakeEffective() * ironTiles;
  if (perBreakerSupply <= 0) return 0;
  return (demand - supply) / perBreakerSupply;
}

// ----------------------------------------------------------------
// Yin & Yang helpers
// ----------------------------------------------------------------

// Yin & Yang is about the relationship between two forces -- making
// and breaking -- so it unlocks the moment BOTH forces actually exist,
// not whenever the player happens to be sitting on a stockpile of
// material. A tonne of iron and copper measured nothing meaningful
// about balance; owning at least one of each machine does.
function checkYinYangUnlock() {
  if (state.unlockedYinYang) return;
  if (state.nailMakers >= 1 && state.breakers >= 1) {
    state.unlockedYinYang = true;
  }
}

// The foundry swarm unlocks at 1 tao AND owning at least one factory --
// not at a single lucky instant of balance. Reaching 1 tao requires
// filling BOTH yin and yang to 100, and since settleYinYang() advances
// only one bar per settle (whichever side currently favors), that's
// only possible by deliberately crossing back and forth across true
// balance over time -- real, demonstrated understanding of the
// mechanic. Requiring a factory too means the swarm only appears once
// the player has an economy with automated production actually running,
// not just two hand-bought machines.
function checkSwarmUnlock() {
  if (state.unlockedSwarm) return;
  if (state.tao >= 1 && state.factories >= 1) {
    state.unlockedSwarm = true;
  }
}

// How close yin and yang are, as a ratio (0 = one bar totally idle
// while the other has moved, 1 = dead even). Used only for the status label.
function harmonyRatio() {
  if (!state.unlockedYinYang) return 0;
  var lo = Math.min(state.yin, state.yang);
  var hi = Math.max(state.yin, state.yang);
  if (hi <= 0) return 0; // nothing has happened yet -- no bonus to give
  return lo / hi;
}

// Held Tao directly controls this bonus. Spending Tao therefore removes
// the corresponding rate bonus immediately.
function taoRateBonus() {
  return Math.max(0, state.tao) * TAO_RATE_BONUS_PER_POINT * cardMult("taoRate"); // negative tao just means 0%, never a penalty
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

// Cards can stack the yin & yang speed very high. The bars settle at most 20 times a second (like the breakers
// and selling, see engine.js); past that each settle simply moves the bar further, so the speed is the same but the
// game never has to loop thousands of times a tick.
var YINYANG_INTERVAL_FLOOR_SEC = 0.05;

function yinYangTickAmount() {
  return YINYANG_TICK_AMOUNT * Math.max(1, cardMult("yinYangSpeed") * YINYANG_INTERVAL_FLOOR_SEC);
}

function yinYangTickInterval() {
  return Math.max(YINYANG_INTERVAL_FLOOR_SEC, 1 / cardMult("yinYangSpeed")); // once per real second, faster with cards (cards.js)
}

function yinYangStatusLabel() {
  if (!state.unlockedYinYang) return "BALANCED";
  var diff = state.yang - state.yin;
  if (state.yin === state.yang || harmonyRatio() >= YINYANG_STATUS_DEADZONE) return "BALANCED";
  return diff > 0 ? "YANG-LEANING" : "YIN-LEANING";
}

function taoDemandBonus() {
  return Math.max(0, state.tao) * YINYANG_PD_BONUS_PER_LEVEL * cardMult("taoDemand"); // negative tao just means 0%
}

// All permanent demand bonuses ADD together (tao + nailbomb market scar),
// so the percentage shown next to demand is exactly the sum of its parts.
function permanentDemandBonus() {
  return taoDemandBonus() + Math.min(CITY_MARKET_SCAR_MAX, state.cityMarketScar);
}

// Based on currently held Tao and the permanent market scar.
function yinYangPDMultiplier() {
  return 1 + permanentDemandBonus();
}

// Called once per real second (from the settle loop in tick()).
// Uses the STRUCTURAL demand/supply balance, not moment-to-moment
// actual flow -- see ironStructuralImbalance() above. Exactly ONE bar
// ticks up per settle, always -- whichever side demand/supply currently
// favors (ties go to yang). There is no longer a "both tick up together
// at balance" case; balance just means the tick keeps landing on
// whichever side is barely ahead, which naturally slows down near zero
// imbalance since the sign keeps flipping. If both bars are sitting at
// 100 together, that's a tao point.
// There is no cap on tao, but each tao held makes the next one a little dearer: the bars have to reach YINYANG_MAX for
// your first tao and TAO_COST_STEP more for each tao held (100, 110, 120, ...), so with 8 tao they need 180. White cards
// can shrink the step. Negative tao counts as none, and extra tao from a cycle (taoPerCycle cards) counts like any other,
// because it is tao held.
function taoCostStep() {
  return TAO_COST_STEP * cardMult("taoGrowth");
}

// How full each yin and yang bar has to get for the next tao: 100, 110, 120, ...
function yinYangMax() {
  var size = YINYANG_MAX + taoCostStep() * Math.max(0, state.tao);
  if (!isFinite(size)) size = 1e15;
  return Math.max(1, Math.round(Math.min(size, 1e15)));
}

// How many times the first tao's price the next one costs: 1 for the first, 1.1 for the second, 1.2 for the third...
// (the oscillator's tao ring is scaled the same way).
function taoCostMult() {
  return yinYangMax() / YINYANG_MAX;
}

function settleYinYang() {
  if (state.unlockedYinYang) {
    var max = yinYangMax();
    var imbalance = ironStructuralImbalance();

    if (imbalance >= 0) {
      // demand (making) at or ahead of supply (breaking) -- yang ticks
      state.yang = Math.min(max, state.yang + yinYangTickAmount());
    } else {
      // supply (breaking) ahead of demand (making) -- yin ticks
      state.yin = Math.min(max, state.yin + yinYangTickAmount());
    }

    if (state.yin >= max && state.yang >= max) {
      state.tao += 1 + Math.max(0, Math.floor(cardAdd("taoPerCycle"))); // the cycle's tao, plus any extra the white cards give
      state.yin = 0;
      state.yang = 0;
    }
  }
}

// Temporary fever/panic spikes multiply on top of the permanent bonuses
// (the market scar itself lives in permanentDemandBonus() above).
function cityFeverMult() {
  var feverMult = 1 + CITY_FEVER_DEMAND_PER_POINT * state.cityFever;
  var panicMult = 1 + CITY_PANIC_DEMAND_MAX * state.cityPanic;
  return feverMult * panicMult;
}

// How much karma reincarnating right now would add: 1 per KARMA_TAO_THRESHOLD tao held, held to the karma cap.
function reincarnationKarmaGainNow() {
  var available = Math.floor(state.tao / KARMA_TAO_THRESHOLD);
  if (available < 1) return 0;
  return Math.max(0, Math.min(available, KARMA_CAP - state.karma));
}
