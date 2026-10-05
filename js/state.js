"use strict";

// ----------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------

var PRICE_MIN = 0.01;
var PRICE_STEP = 0.01;
var PRICE_MAX = 0.08; // also used as the starting price -- a reasonable one, not the rock-bottom floor

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
var FACTORY_SQUARED_COST_GROWTH = 1.1; // each factory-squared you own makes the next one cost this much more -- otherwise a fixed price would eventually buy infinite factories for pocket change
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

// Yin & Yang: a late-game balance meter. Unlocks once you've ever held
// a full metric ton of BOTH iron and copper at the same time -- by
// then the economy is big enough that "surplus material" is a real
// problem worth having a system about.

// Each real second, we compare how many grams you harvested (mined,
// whether by hand or by breaker) against how many grams you profited
// (iron turned into nails, copper sold) since the last check. Whichever
// side "won" that second ticks up by one -- stillness (yin) if you're
// pulling more out of the ground than you're using, creation (yang) if
// you're using more than you're pulling. A simple, discrete, always-
// readable +1/sec race between two 0-100 bars.
var YINYANG_TICK_AMOUNT = 1;
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

// ----------------------------------------------------------------
// Starting bonuses on reincarnation. Each field belongs to a tier with
// its own karma threshold. Below threshold, a field mostly rolls 0,
// with only a small "if you're lucky" chance at a token amount.
// Above threshold, the amount grows smoothly with karma via
// coeff * (karma - threshold)^exponent, then gets randomized +/-40%
// so nothing is ever guaranteed. Higher tiers never replace lower
// ones -- a high-karma player still rolls big Tier 1 numbers AND
// starts getting real Tier 3/4 rewards on top.
//
// IMPORTANT: ironAmt and copperAmt MUST stay in this field list.
// reincarnation.js reads result.granted.ironAmt/copperAmt directly --
// if either field is missing here, that arithmetic silently produces
// NaN, which then corrupts iron/copper/unsold for the rest of the run.
// ----------------------------------------------------------------

var STARTING_BONUS_FIELD_CONFIG = {
  // Tier 1 (low) -- always rolls something, even at 1-2 karma.
  // Coefficients calibrated so karma ~32 lands around: funds ~$2M,
  // iron ~5 tonnes, copper ~2 tonnes.
  funds:          { threshold: 0,  coeff: 17457.6, exponent: 1.368, luckyMin: 500,  luckyMax: 1500, luckyChance: 1.0 },
  ironAmt:        { threshold: 0,  coeff: 35083.3, exponent: 1.431, luckyMin: 5000, luckyMax: 20000, luckyChance: 1.0 },
  copperAmt:      { threshold: 0,  coeff: 7442.5,  exponent: 1.614, luckyMin: 2000, luckyMax: 8000, luckyChance: 1.0 },
  // Tier 2 (low-mid) -- starts around karma 2, reliable by ~10.
  // Coefficient calibrated so karma ~32 lands around 1,300 makers.
  nailMakers:     { threshold: 2,  coeff: 43.33,   exponent: 1.0,   luckyMin: 1,   luckyMax: 1,   luckyChance: 0.15 },
  // Tier 4 (high) -- starts around karma 10-15, reliable by ~30.
  // marketingLevel calibrated so karma ~32 lands around level 18.
  // factories has no explicit target given -- this is an estimate,
  // tune it if 15ish factories at karma 32 feels off.
  marketingLevel: { threshold: 10, coeff: 0.818,   exponent: 1.0,   luckyMin: 1,   luckyMax: 2,   luckyChance: 0.15 },
  factories:      { threshold: 15, coeff: 0.882,   exponent: 1.0,   luckyMin: 1,   luckyMax: 1,   luckyChance: 0.10 }
};

// Nail breakers are NOT in the generic config above -- they're
// deliberately computed to structurally balance against whatever
// nailMakers amount just got rolled (see rollStartingBonuses below
// and the map-sizing logic in reincarnation.js), rather than being an
// independent random roll like everything else.
var STARTING_BONUS_FIELDS = ["funds", "ironAmt", "copperAmt", "nailMakers", "marketingLevel", "factories"];

var STARTING_TITLES = [
  { maxQuality: 0, label: "a quiet beginning" },
  { maxQuality: 4, label: "an encouraging start" },
  { maxQuality: 8, label: "an established workshop" },
  { maxQuality: 12, label: "a name people know" },
  { maxQuality: 17, label: "an empire already in motion" },
  { maxQuality: Infinity, label: "nirvana", isNirvana: true },
];

// Used ONLY for quality/title pacing now (see rollStartingBonuses
// below) -- kept exactly as it always worked so nirvana pacing doesn't
// shift just because the actual granted-amount formulas were reworked.
var STARTING_BONUS_QUALITY_TIER_COUNT = 6;
function pickStartingBonusTier(karma) {
  var roll = Math.random() * (karma + 10);
  return Math.min(STARTING_BONUS_QUALITY_TIER_COUNT - 1, Math.floor(roll / 10));
}

function startingTitleForQuality(quality) {
  for (var i = 0; i < STARTING_TITLES.length; i++) {
    if (quality <= STARTING_TITLES[i].maxQuality) return STARTING_TITLES[i];
  }
  return STARTING_TITLES[STARTING_TITLES.length - 1];
}

// Rolls one field's amount for a given karma. Below threshold, the
// main formula doesn't run at all -- only a small, rare chance at a
// token "lucky" amount. This always returns a real number, never
// undefined, which is what the NaN bug above depended on not happening.
function rollFieldAmount(config, karma) {
  var scale = Math.max(0, karma - config.threshold);
  if (scale <= 0) {
    if (Math.random() < config.luckyChance) {
      return randInt(config.luckyMin, config.luckyMax);
    }
    return 0;
  }
  var midpoint = config.coeff * Math.pow(scale, config.exponent);
  return Math.max(0, randRange(midpoint * 0.6, midpoint * 1.4));
}

function rollStartingBonuses(karma) {
  var granted = {};
  for (var i = 0; i < STARTING_BONUS_FIELDS.length; i++) {
    var field = STARTING_BONUS_FIELDS[i];
    var config = STARTING_BONUS_FIELD_CONFIG[field];
    var amount = rollFieldAmount(config, karma);
    granted[field] = (field === "funds" || field === "ironAmt" || field === "copperAmt")
      ? Math.round(amount * 100) / 100
      : Math.round(amount);
  }

  // Quality/title: an independent roll from the original distribution,
  // unrelated to the field formulas above -- purely decides flavor
  // title and nirvana pacing.
  var quality = 0;
  for (var q = 0; q < 5; q++) {
    quality += pickStartingBonusTier(karma);
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

// ----------------------------------------------------------------
// The skyline. A row of buildings standing in for the player's real
// nail makers, breakers, and factories -- how much of the skyline
// each type takes up always matches the player's real ratio of them.
// The more of one thing the player has relative to the rest, the more
// of the skyline it is, which is what makes "too many breakers" (or
// makers, or factories) something the player can actually see.
//
// Bomb damage reduces the player's real makers, breakers, and factories.
// The generated city shows a fading trail of destruction as the camera
// reaches active civilization again. Each impact also spikes demand
// temporarily, scars the market permanently, and locks karma at -1.
// ----------------------------------------------------------------

var CITY_TOTAL_SLOTS = 22; // buildings generated per district
var CITY_REBUILD_INTERVAL_SEC = 0.5; // refreshes the mix used by newly generated districts
var CITY_DISTRICT_WIDTH = 380;
var CITY_PAN_SPEED = 18; // world pixels per second
var CITY_BUILDING_SPACING = 22;
var CITY_AFTERMATH_BASE_DISTANCE = 260;
var CITY_AFTERMATH_RADIUS_DISTANCE = 180;
var CITY_AFTERMATH_POWER_DISTANCE = 260;

// Cost and destructiveness both grow every time a nailbomb goes off, using
// the same growth rate (CITY_BOMB_COST_GROWTH) so the marketing payoff
// keeps pace with the escalating price -- see CITY_FEVER_EXP_GROWTH
// below, which reuses this same number on purpose.
var CITY_BOMB_BASE_NAILS = 50000; // unsold nails consumed by the first nailbomb
var CITY_BOMB_COST_GROWTH = 2.3; // each nailbomb afterward costs this much more
var CITY_BOMB_BASE_RADIUS = 1; // buildings on either side of the target also take damage, at this radius...
var CITY_BOMB_RADIUS_GROWTH = 0.6; // ...growing by this much per nailbomb already detonated
var CITY_BOMB_BASE_POWER = 0.5; // fraction of a building's units destroyed at ground zero...
var CITY_BOMB_POWER_GROWTH = 0.18; // ...growing by this much per nailbomb already detonated
var CITY_BOMB_ECONOMY_SHOCK_FACTOR = 0.02; // small system-wide loss to every active workforce category
var CITY_BOMB_ECONOMY_SHOCK_CAP = 0.15;

// Fever (the temporary marketing boost) grows EXPONENTIALLY alongside
// the nailbomb's own cost, not linearly -- both the ceiling it can reach
// and how much a single nailbomb adds to it scale by CITY_FEVER_EXP_GROWTH
// per nailbomb already detonated, the same rate the cost itself grows by.
// A nailbomb that's 2.3x more expensive than the last also buys roughly
// 2.3x more marketing.
var CITY_FEVER_EXP_GROWTH = CITY_BOMB_COST_GROWTH;
var CITY_FEVER_MAX_BASE = 3; // fever's ceiling before any nailbombs -- grows by CITY_FEVER_EXP_GROWTH per nailbomb detonated
var CITY_FEVER_PER_BOMB_BASE = 0.6; // fever a single nailbomb adds before any nailbombs -- grows the same way
var CITY_FEVER_HALFLIFE_SEC = 40; // fever decays back toward zero with this half-life if you stop bombing
var CITY_FEVER_DEMAND_PER_POINT = 0.35; // +35% public demand per point of fever, up to the (growing) cap above
// The market scar is now a permanent DEMAND BOOST (not a penalty) --
// every nailbomb permanently raises public demand further, on top of
// the temporary fever/panic spikes. This is deliberately a huge number:
// the destructive path trades karma/reincarnation away forever in
// exchange for demand that only ever grows, never shrinks.
var CITY_MARKET_SCAR_PER_BOMB = 0.5; // +50% permanent demand per nailbomb
var CITY_MARKET_SCAR_MAX = 10; // caps at +1000% permanent demand

// Pedestrians walking the skyline's ground floor -- purely visual
// (their count and movement are not saved), except for the panic
// meter they drive, which is real state and feeds public demand.
// A nailbomb sends the whole street into a panic that fades fast (a
// people-scale reaction, much quicker than the fever's marketing-scale
// decay), and panic buying is worth a short, sharp demand spike on
// top of the fever bonus -- the same "public demand" lever, not a
// second bonus system.
var CITY_PED_COUNT = 16;
var CITY_PED_WALK_SPEED = 0.25; // px/frame, calm
var CITY_PED_PANIC_SPEED_MULT = 3.5; // how much faster a panicking pedestrian moves
var CITY_PED_PANIC_DURATION_SEC = 4; // how long an individual pedestrian keeps sprinting after a nailbomb
var CITY_PANIC_PER_BOMB = 1; // panic meter jumps to this fraction of max on every nailbomb, regardless of size
var CITY_PANIC_HALFLIFE_SEC = 5; // panic fades fast -- it's a street-level reaction, not a lasting market shift
var CITY_PANIC_DEMAND_MAX = 0.5; // +50% public demand at maximum panic, decaying with it

// ----------------------------------------------------------------
// The foundry core: a nailbomb now has to be CRAFTED, not just bought.
// It still needs unsold nails -- the same cost curve as before,
// cityBombCost() in city.js -- plus one unstable core, which
// only comes from the swarm (see swarm.js). Only the nail cost scales.
// ----------------------------------------------------------------
var CORE_ISOTOPES_BASE = 1;

// ----------------------------------------------------------------
// The foundry swarm's majority/collapse rule (see swarm.js). Real
// balance means half white, half black, both at the SAME speed --
// true parity between how much iron makers consume and breakers
// supply, the exact same metric yin/yang uses (YINYANG_BALANCE_TOLERANCE
// in formulas.js). Clicking any dot flips its color and buys enough of
// the opposite machine type to match the resulting ratio. Severe
// sustained imbalance collapses the swarm and banks one unstable core.
// ----------------------------------------------------------------
var SWARM_MAJORITY_TOLERANCE = 0.05; // matches YINYANG_BALANCE_TOLERANCE's definition of real parity
var SWARM_MAJORITY_SPEED_MULT = 1; // TESTING: temporarily disabled -- all dots move at the same base speed regardless of majority/minority. Restore to something like 2.4 once the rest of the loop is confirmed to feel right.
var SWARM_COLLAPSE_IMBALANCE_THRESHOLD = 0.32; // |imbalance| has to cross this -- eased down from 0.85 (nearly every dot one color), then from 0.4 (which was still easy to hover just under during active play). Now a clear ~2-to-1 majority is enough.
var SWARM_COLLAPSE_SUSTAIN_SEC = 1.5; // ...and stay there this long (the grey-out) before it actually collapses
var SWARM_COLLAPSE_FUEL_GAIN = 1; // unstable core banked per collapse

function defaultState() {
  var tiles = generateMapTiles(1);
  return {
    funds: 25.00,
    unsold: 0,
    price: PRICE_MAX, // a good starting price, not the rock-bottom floor
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

    // The skyline (see tunables above). Buildings themselves are never
    // stored -- they're computed fresh from nailMakers/breakers/factories
    // whenever the panel draws, so there's nothing here to desync.
    unlockedCity: false, // unlocks the first time the swarm collapses and produces an unstable core
    unlockedSwarm: false, // unlocks the first time the player achieves real balance (production == consumption)
    cityBombs: 0,
    cityFever: 0, // decaying marketing boost from recent nailbombs -- see cityFeverMult()
    cityPanic: 0, // decaying street-panic boost from a recent nailbomb -- fast, short-lived, see cityFeverMult()
    cityMarketScar: 0, // permanent demand loss from the lasting impact of bombings
    cityKarmaLocked: false,
    isotopeStock: 0, // banked unstable cores from swarm collapses -- one is spent per nailbomb
    cityWorld: {
      cameraX: 0,
      nextDistrictX: 0,
      buildings: [],
      pedestrians: [],
      aftermath: null,
      cachedSlots: [],
      rebuildAccum: 0
    },
  };
}

var state = defaultState();
