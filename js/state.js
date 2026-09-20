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
var FACTORY_BUILD_COST_FUNDS = 1000;
var FACTORY_COST_GROWTH = 1.4; // each factory you own makes the next one cost this much more
var FACTORY_PERIOD_SEC = 1;
// A factory's material cost per cycle depends on which way the balance
// slider is leaning. Building toward nail breakers (heavier mining
// equipment) costs a lot more material than building toward nail
// makers (lighter machines). At dead center, it's the midpoint of the
// two, i.e. half of each added together.
var FACTORY_COST_BREAKER_SIDE_COPPER = 1000; // grams, at slider = 0 (all breakers)
var FACTORY_COST_MAKER_SIDE_COPPER = 100; // grams, at slider = 100 (all nail makers)
var FACTORY_BALANCE_DEFAULT = 50; // 0-100, nail-maker share

var BREAKER_BUILD_COST_FUNDS = 75;
var BREAKER_COOLDOWN_MS = 1000; // pacing between buys, like nail makers
var BREAKER_INTAKE_RATE = 1; // nails/sec consumed per breaker

// Factory Squared ("factory-squared"): the next tier of automation after
// factories automate buying makers/breakers, this automates buying
// factories. Unlocks only once you've got a serious economy going
// (100k of BOTH makers and breakers) -- by then the copper cost below
// is meant to be a real but manageable drain, not free.
var FACTORY_SQUARED_UNLOCK_MAKERS = 100000;
var FACTORY_SQUARED_UNLOCK_BREAKERS = 100000;
var FACTORY_SQUARED_BUILD_COST_FUNDS = 1000000000; // $1 billion
var FACTORY_SQUARED_COST_GROWTH = 1.5; // each factory-squared you own makes the next one cost this much more -- otherwise a fixed price would eventually buy infinite factories for pocket change
var FACTORY_SQUARED_PERIOD_SEC = 1; // produces one factory per cycle, per owned factory-squared
var FACTORY_SQUARED_COPPER_COST = 10000000; // 10 tonnes of copper, in grams, per production cycle

var COPPER_SELL_PRICE = 0.05; // $ per gram

// One nail hits every remaining deposit once. Yield is 1g per deposit,
// so 10 iron + 5 copper deposits returns 10g iron and 5g copper.
var MINE_IRON_AMOUNT = 1;
var MINE_COPPER_AMOUNT = 1;
var DEPOSIT_CAPACITY_BASE = 2000; // grams -- map 1's deposits hold 2kg
var DEPOSIT_CAPACITY_GROWTH = 1.2; // each map's capacity is × this the last

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
var YINYANG_SPEED_COST_BASE = 1;
var YINYANG_MAX = 100;

var YINYANG_STATUS_DEADZONE = 0.9; // harmony ratio above this reads as "BALANCED"

// When both bars fill at once, you earn a tao point: a permanent boost
// to public demand (same as before), AND whatever the live balance
// bonus was at that exact moment gets locked in forever as a permanent
// multiplier on top of the live one -- so tao points stack, making
// every future run of good balance worth more than the last.
var YINYANG_PD_BONUS_PER_LEVEL = 0.1; // +10% public demand per held tao point

// Reincarnation: once you've banked enough tao, you can end this life
// and start a new one. Karma is earned from tao at the moment you
// reincarnate and never goes away, not even across a fresh life --
// it's not spent, it just permanently raises how many stats you get
// to rewrite each time you're reborn.
var KARMA_TAO_THRESHOLD = 3; // tao points per 1 karma, checked at the moment of reincarnating

// Reincarnation is a choice between two paths:
//  - Suicide (the "end run" button): ends everything, karma resets to
//    zero, you start over exactly like a brand new player. A true dead
//    end, no benefit, just a clean slate and a score on the leaderboard.
//  - Reincarnation: karma improves the odds of stronger starting bonuses.
//    Each bonus rolls independently, so a life can be rich in one area and
//    modest in another. There are no karma cutoffs or guaranteed results.
function randRange(min, max) {
  return min + Math.random() * (max - min);
}
function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

var STARTING_BONUS_TIERS = [
  { funds: [0, 0], nailMakers: [0, 0], breakers: [0, 0], marketingLevel: [0, 0], factories: [0, 0] },
  { funds: [30, 80], nailMakers: [1, 2], breakers: [0, 1], marketingLevel: [0, 1], factories: [0, 0] },
  { funds: [150, 350], nailMakers: [3, 6], breakers: [1, 3], marketingLevel: [1, 2], factories: [0, 0] },
  { funds: [400, 750], nailMakers: [7, 12], breakers: [3, 6], marketingLevel: [2, 4], factories: [0, 1] },
  { funds: [900, 1600], nailMakers: [14, 22], breakers: [6, 10], marketingLevel: [5, 8], factories: [1, 2] },
  { funds: [1800, 3200], nailMakers: [25, 40], breakers: [11, 18], marketingLevel: [9, 14], factories: [2, 4] },
];

var STARTING_BONUS_FIELDS = ["funds", "nailMakers", "breakers", "marketingLevel", "factories"];
var STARTING_TITLES = [
  { maxQuality: 0, label: "a quiet beginning" },
  { maxQuality: 4, label: "an encouraging start" },
  { maxQuality: 8, label: "an established workshop" },
  { maxQuality: 12, label: "a name people know" },
  { maxQuality: 17, label: "an empire already in motion" },
  { maxQuality: Infinity, label: "nirvana", isNirvana: true },
];

// Karma raises the ceiling smoothly. Every stat can roll below or above the
// average, but high tiers become more common as karma accumulates.
function pickStartingBonusTier(karma) {
  var roll = Math.random() * (karma + 10);
  return Math.min(STARTING_BONUS_TIERS.length - 1, Math.floor(roll / 10));
}

function startingTitleForQuality(quality) {
  for (var i = 0; i < STARTING_TITLES.length; i++) {
    if (quality <= STARTING_TITLES[i].maxQuality) return STARTING_TITLES[i];
  }
  return STARTING_TITLES[STARTING_TITLES.length - 1];
}

function rollStartingBonuses(karma) {
  var granted = { funds: 0, nailMakers: 0, breakers: 0, marketingLevel: 0, factories: 0 };
  var quality = 0;
  for (var i = 0; i < STARTING_BONUS_FIELDS.length; i++) {
    var field = STARTING_BONUS_FIELDS[i];
    var tier = pickStartingBonusTier(karma);
    var range = STARTING_BONUS_TIERS[tier][field];
    granted[field] = randInt(range[0], range[1]);
    quality += tier;
  }
  var title = startingTitleForQuality(quality);
  return { granted: granted, title: title, quality: quality };
}

// Tao is normally earned by completing a Yin/Yang lap. Reincarnation grants
// a modest head start, with stronger titles completing more of the cycle.
function reincarnationTaoAward(result, karma) {
  if (result.title.isNirvana) return 3;
  return karma >= 13 ? 2 : 1;
}

// Usernames allowed to use the cheat box. Checked against the logged-in
// account's username (case-insensitive) -- guests and anyone not on
// this list can type in the box all they want, nothing will happen.
var CHEAT_ALLOWED_USERNAMES = ["nailmaker", "mining"];
var TAO_RATE_BONUS_PER_POINT = 0.5; // +50% nail-maker/breaker rate per held tao point

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
    factoryBalance: FACTORY_BALANCE_DEFAULT, // 0 = all breakers, 100 = all makers
    factoryAllocAccum: 0, // Bresenham-style accumulator so output matches the slider ratio exactly over time

    factorySquared: 0,
    factorySquaredTimers: [],

    breakers: 0,
    breakerCooldownUntil: 0,

    nailMakersOn: true,
    factoriesOn: true,
    breakersOn: true,

    unlockedMap: false,
    unlockedMachinery: false,
    unlockedTuning: false,
    unlockedFactorySquared: false,
    guideSeen: {
      handmade: false,
      machinery: false,
      map: false,
      yinYang: false
    },

    autoNextMap: false,

    // Yin & Yang: two 0-100 bars, ticked once per real second based on
    // the structural balance between iron demand (nail makers) and
    // iron supply (breakers) -- see ironStructuralImbalance() in
    // formulas.js. Balanced ticks both bars together; skewed ticks
    // whichever side the imbalance favors.
    unlockedYinYang: false,
    yin: 0,
    yang: 0,
    tao: 0, // tao points -- earned by Yin/Yang laps or rare reincarnation awards
    yinYangSpeedLevel: 0, // each level makes Yin/Yang settle 20% faster
    karma: 0, // permanent across reincarnations -- carried over explicitly, never wiped by a reset
    nirvanaAchieved: false, // a true permanent achievement -- survives even suicide, unlike karma

    // Production ticks every frame (fast, smooth climb). Selling and
    // breaker nail-consumption settle in chunks rather than
    // continuously, at a rate that scales with breaker count -- so you
    // can watch inventory climb then drop, and it stays smooth even at
    // huge scale instead of always being one lump per second.
    settleAccum: 0,

    // Yin & yang settle on their own fixed one-second cadence,
    // independent of the breaker-scaled settle rate above.
    yinYangAccum: 0,

    simTime: 0, // seconds of game time elapsed
  };
}

var state = defaultState();
