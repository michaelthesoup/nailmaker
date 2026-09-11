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

function publicDemandPD() {
  if (state.price <= 0) return 0;
  return marketingMultiplier() * (0.8 / state.price) * yinYangPDMultiplier();
}

function avgNailsSoldPerSec() {
  var pd = publicDemandPD();
  if (pd <= 0) return 0;
  return Math.min(1, pd / 100) * 7 * Math.pow(pd, DEMAND_CURVE_EXPONENT);
}

function priceForMarketing() {
  return MARKETING_BASE_COST * Math.pow(MARKETING_GROWTH, state.marketingLevel);
}

function nailMakerCostEffective() {
  return NAILMAKER_COST;
}

function factoryBuildCostEffective() {
  return FACTORY_BUILD_COST_FUNDS;
}

function breakerBuildCostEffective() {
  return BREAKER_BUILD_COST_FUNDS;
}

function nailMakerRateEffective() {
  if (!state.nailMakersOn) return 0;
  return NAILMAKER_RATE * productionRateBonusMultiplier();
}

function breakerIntakeEffective() {
  if (!state.breakersOn) return 0;
  return BREAKER_INTAKE_RATE * productionRateBonusMultiplier();
}

// One nail is one hit on every active deposit. Each hit removes 1g
// from that deposit and gives the player 1g of that deposit's material.
// Example: 10 iron deposits + 5 copper deposits = 10g iron + 5g copper
// from one nail. Empty deposits stop receiving hits.
function processBreakerNails(nailsToUse) {
  var activeTiles = activeDepositTiles(state.mapTiles);
  if (nailsToUse <= 0 || activeTiles.length === 0) {
    return { nailsUsed: 0, ironGot: 0, copperGot: 0 };
  }

  // A nail can only hit each deposit once. Therefore the number of complete
  // nails we can use is limited by the smallest remaining deposit.
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

    state.harvestAccum += amount;
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
// Yin & Yang helpers
// ----------------------------------------------------------------

function checkYinYangUnlock() {
  if (state.unlockedYinYang) return;
  if (state.ironAmt >= YINYANG_UNLOCK_GRAMS && state.copperAmt >= YINYANG_UNLOCK_GRAMS) {
    state.unlockedYinYang = true;
  }
}

// How close yin and yang are, as a ratio (0 = one bar totally idle
// while the other has moved, 1 = dead even). Used purely for the
// balance bonus -- separate from the win condition, which needs both
// bars to actually reach 100, not just be proportionally close.
function harmonyRatio() {
  if (!state.unlockedYinYang) return 0;
  var lo = Math.min(state.yin, state.yang);
  var hi = Math.max(state.yin, state.yang);
  if (hi <= 0) return 0; // nothing has happened yet -- no bonus to give
  return lo / hi;
}

// Live balance bonus -- rides the current harmony ratio in real time.
// This is the part that evaporates if you drift off-balance.
function liveBalanceBonus() {
  return HARMONY_MAX_BONUS * harmonyRatio();
}

// Combined multiplier applied to nail-maker and nail-breaker rates:
// the permanent stack from past tao points, times (1 + the live
// bonus). The permanent stack never goes away; the live part does.
function productionRateBonusMultiplier() {
  return (1 + state.taoBonusStack) * (1 + liveBalanceBonus());
}

// Permanent public-demand multiplier from past tao points -- this
// (like the tao bonus stack) never resets.
function yinYangPDMultiplier() {
  return 1 + YINYANG_PD_BONUS_PER_LEVEL * state.tao;
}

// Called once per real second (from the settle loop in tick()).
// Compares grams harvested vs. grams profited since the last check:
// whichever was ahead ticks its bar up by one, capped at 100. If both
// bars are sitting at 100 together, that's a tao point: bump public
// demand permanently, lock in whatever the live balance bonus was at
// that exact moment as a permanent stacking addition to production
// rate, then reset both bars to start the next lap.
function settleYinYang() {
  if (state.unlockedYinYang) {
    if (state.harvestAccum > state.profitAccum) {
      state.yin = Math.min(YINYANG_MAX, state.yin + YINYANG_TICK_AMOUNT);
    } else if (state.profitAccum > state.harvestAccum) {
      state.yang = Math.min(YINYANG_MAX, state.yang + YINYANG_TICK_AMOUNT);
    }

    if (state.yin >= YINYANG_MAX && state.yang >= YINYANG_MAX) {
      state.tao += 1;
      state.taoBonusStack += TAO_PERMANENT_BONUS_PER_POINT;
      state.yin = 0;
      state.yang = 0;
    }
  }

  state.harvestAccum = 0;
  state.profitAccum = 0;
}
