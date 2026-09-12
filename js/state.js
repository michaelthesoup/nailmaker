"use strict";

// ----------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------

var PRICE_MIN = 0.01;
var PRICE_STEP = 0.01;
var PRICE_MAX = 0.08; // only used for the price stepper's rough feel, not the demand math

// Marketing, Universal-Paperclips style. Their formula is:
//   PD = (1 + 0.1*U) * (1.1^M) * Bonuses * (0.8/P)
//   avg sold/sec = min(1, PD/100) * 7 * PD^1.15
// We have no universes or projects, so U=0 and Bonuses=1 both drop out,
// leaving PD = k^M * (0.8/P), M = marketingLevel.
var MARKETING_BASE_COST = 25;
var MARKETING_GROWTH = 2.0;
var MARKETING_LEVEL_MULT = 1.4;

var IRON_BUY_COST = 1;
var IRON_BUY_AMOUNT = 100; // grams

var NAILMAKER_COST = 5; // flat, forever
var NAILMAKER_COOLDOWN_MS = 1000;
var NAILMAKER_RATE = 1; // nails/sec each maker produces, iron permitting
var IRON_PER_NAIL = 1; // grams

// Factories are the yin-yang engine: each completed cycle produces
// either one nail maker or one nail breaker, decided by the balance
// slider (0 = all breakers/black, 100 = all makers/white). The cost
// per cycle is the same no matter which comes out the other end.
var FACTORY_BUILD_COST_FUNDS = 100;
var FACTORY_COOLDOWN_MS = 5000;
var FACTORY_PERIOD_SEC = 1;
var FACTORY_IRON_COST = 100;
var FACTORY_COPPER_COST = 10;
var FACTORY_BALANCE_DEFAULT = 50; // 0-100, nail-maker share

var BREAKER_BUILD_COST_FUNDS = 50;
var BREAKER_COOLDOWN_MS = 1000; // pacing between buys, like nail makers
var BREAKER_INTAKE_RATE = 1; // nails/sec consumed per breaker

var COPPER_SELL_PRICE = 0.05; // $ per gram

// One nail hits every remaining deposit once. Yield is 1g per deposit,
// so 10 iron + 5 copper deposits returns 10g iron and 5g copper.
var MINE_IRON_AMOUNT = 1;
var MINE_COPPER_AMOUNT = 1;
var DEPOSIT_CAPACITY_BASE = 2000; // grams -- map 1's deposits hold 2kg
var DEPOSIT_CAPACITY_GROWTH = 1.2; // each map's capacity is × this the last

// How many seconds of history the "avg/s" and machinery-analytics
// readouts are averaged over. Bigger = steadier, more readable
// numbers; smaller = more responsive to what's happening right now.
var STATS_WINDOW_SEC = 5;

var TICK_MS = 100;

var MAP_ROWS = 10;
var MAP_COLS = 21;
var DEPOSITS_PER_MAP = 15;

// Progressive UI reveal. Map stays hidden until the first breaker
// is bought -- before that, there's nothing on it for anything to do.
var MACHINERY_UNLOCK_NAILS = 250;
var TUNING_UNLOCK_NAILS = 250;

// Yin & Yang: a late-game balance meter. Unlocks once you've ever held
// a full metric ton of BOTH iron and copper at the same time -- by
// then the economy is big enough that "surplus material" is a real
// problem worth having a system about.
var YINYANG_UNLOCK_GRAMS = 1000000; // 1 metric ton

// Each real second, we compare how many grams you harvested (mined,
// whether by hand or by breaker) against how many grams you profited
// (iron turned into nails, copper sold) since the last check. Whichever
// side "won" that second ticks up by one -- stillness (yin) if you're
// pulling more out of the ground than you're using, creation (yang) if
// you're using more than you're pulling. A simple, discrete, always-
// readable +1/sec race between two 0-100 bars.
var YINYANG_TICK_AMOUNT = 1;
var YINYANG_MAX = 100;

// Balance is rewarded, never punished: being close to balanced grants
// up to this much of a LIVE bonus to nail-maker and nail-breaker speed
// -- it rides the current harmony ratio in real time and evaporates if
// you drift off-balance. It's never a penalty, just something you can
// lose the benefit of.
var HARMONY_MAX_BONUS = 1; // up to +100% at perfect balance
var YINYANG_STATUS_DEADZONE = 0.9; // harmony ratio above this reads as "BALANCED"

// When both bars fill at once, you earn a tao point: a permanent boost
// to public demand (same as before), AND whatever the live balance
// bonus was at that exact moment gets locked in forever as a permanent
// multiplier on top of the live one -- so tao points stack, making
// every future run of good balance worth more than the last.
var YINYANG_PD_BONUS_PER_LEVEL = 0.5; // +50% public demand per tao point, permanent

// Reincarnation: once you've banked enough tao, you can end this life
// and start a new one. Karma is earned from tao at the moment you
// reincarnate and never goes away, not even across a fresh life --
// it's not spent, it just permanently raises how many stats you get
// to rewrite each time you're reborn.
var KARMA_TAO_THRESHOLD = 3; // tao points per 1 karma, checked at the moment of reincarnating

// Usernames allowed to use the cheat box. Checked against the logged-in
// account's username (case-insensitive) -- guests and anyone not on
// this list can type in the box all they want, nothing will happen.
var CHEAT_ALLOWED_USERNAMES = ["nailmaker"];
var TAO_PERMANENT_BONUS_PER_POINT = 0.5; // +50% nail-maker/breaker rate, permanent, stacking per tao point

// ----------------------------------------------------------------
// Map generation
// ----------------------------------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function depositCapacityForMap(mapIndex) {
  return DEPOSIT_CAPACITY_BASE * Math.pow(DEPOSIT_CAPACITY_GROWTH, mapIndex - 1);
}

function generateMapTiles(mapIndex) {
  var rand = mulberry32(mapIndex * 7919 + 13);
  var capacity = depositCapacityForMap(mapIndex);
  var tiles = [];
  for (var r = 0; r < MAP_ROWS; r++) {
    var row = [];
    for (var c = 0; c < MAP_COLS; c++) {
      row.push({ type: ".", remaining: 0 });
    }
    tiles.push(row);
  }

  var placed = 0;
  var attempts = 0;
  while (placed < DEPOSITS_PER_MAP && attempts < 1000) {
    attempts++;
    var r = Math.floor(rand() * MAP_ROWS);
    var c = Math.floor(rand() * MAP_COLS);
    if (tiles[r][c].type !== ".") continue;
    var type = rand() < 0.5 ? "i" : "c";
    tiles[r][c] = { type: type, remaining: capacity };
    placed++;
  }
  return tiles;
}

function mapHasDeposits(tiles) {
  for (var r = 0; r < MAP_ROWS; r++) {
    for (var c = 0; c < MAP_COLS; c++) {
      if (tiles[r][c].remaining > 0) return true;
    }
  }
  return false;
}

function activeDepositTiles(tiles) {
  var list = [];
  for (var r = 0; r < MAP_ROWS; r++) {
    for (var c = 0; c < MAP_COLS; c++) {
      if (tiles[r][c].remaining > 0) list.push(tiles[r][c]);
    }
  }
  return list;
}

function mapRemainingWeight(tiles) {
  var sum = 0;
  for (var r = 0; r < MAP_ROWS; r++) {
    for (var c = 0; c < MAP_COLS; c++) {
      sum += tiles[r][c].remaining;
    }
  }
  return sum;
}

// ----------------------------------------------------------------
// State
// ----------------------------------------------------------------

function defaultState() {
  var tiles = generateMapTiles(1);
  return {
    funds: 25.00,
    unsold: 0,
    price: PRICE_MIN,
    ironAmt: 100,
    copperAmt: 0,
    marketingLevel: 0,
    nailMakers: 0,
    totalNailsMade: 0,
    nailMakerCooldownUntil: 0,
    mapIndex: 1,
    mapTiles: tiles,
    mapTotalWeight: mapRemainingWeight(tiles),
    factories: 0,
    factoryTimers: [],
    factoryCooldownUntil: 0,
    factoryBalance: FACTORY_BALANCE_DEFAULT, // 0 = all breakers, 100 = all makers
    factoryAllocAccum: 0, // Bresenham-style accumulator so output matches the slider ratio exactly over time

    breakers: 0,
    breakerCooldownUntil: 0,

    nailMakersOn: true,
    factoriesOn: true,
    breakersOn: true,

    unlockedMap: false,
    unlockedMachinery: false,
    unlockedTuning: false,

    autoNextMap: false,

    // Yin & Yang: two 0-100 bars. Each real second, whichever of
    // "harvested" (mined) or "profited" (used) grams was higher that
    // second ticks its bar up by one. state.harvestAccum/profitAccum
    // collect grams as they happen; they're compared and cleared once
    // per second alongside breaker/selling settlement in tick().
    unlockedYinYang: false,
    yin: 0,
    yang: 0,
    tao: 0, // tao points -- earned when yin & yang both hit 100 together
    taoBonusStack: 0, // permanent, stacking nail-maker/breaker rate bonus locked in from past tao points
    karma: 0, // permanent across reincarnations -- carried over explicitly, never wiped by a reset
    harvestAccum: 0,
    profitAccum: 0,

    // Production ticks every frame (fast, smooth climb). Selling and
    // breaker nail-consumption only settle once per real second, in a
    // lump -- like Universal Paperclips, so you can actually watch
    // inventory climb, then drop, rather than it draining instantly.
    settleAccum: 0,

    simTime: 0, // seconds of game time elapsed, used to window the stats below

    // Rolling history for readable "avg/s" style numbers -- each entry
    // is [simTime, amount]; amounts are summed and divided by
    // STATS_WINDOW_SEC to get a smooth per-second rate, instead of a
    // jumpy instant-tick number.
    histRevenue: [],
    histNailsMade: [],
    histFactoryIron: [],
    histFactoryCopper: [],
    histFactoryOutput: [],
    histBreakerNails: [],
    histBreakerIron: [],
    histBreakerCopper: [],
  };
}

var state = defaultState();

// ----------------------------------------------------------------
// Rolling-average helpers
// ----------------------------------------------------------------

function histPush(arr, amount) {
  arr.push([state.simTime, amount]);
}

function histPrune(arr) {
  while (arr.length && (state.simTime - arr[0][0]) > STATS_WINDOW_SEC) {
    arr.shift();
  }
}

function histRatePerSec(arr) {
  var sum = 0;
  for (var i = 0; i < arr.length; i++) sum += arr[i][1];
  return sum / STATS_WINDOW_SEC;
}
