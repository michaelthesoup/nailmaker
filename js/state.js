"use strict";

// ----------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------

var PRICE_MIN = 0.01;
var PRICE_STEP = 0.01;
var PRICE_MAX = 0.08; // also used as the starting price -- a reasonable one, not the rock-bottom floor
var OPTIMAL_PRICE_SALES_RATIO = 0.9;
var OPTIMAL_PRICE_MAX_SALES_RATIO = 0.98;

// Marketing, Universal-Paperclips style. Their formula is:
//   PD = (1 + 0.1*U) * (1.1^M) * Bonuses * (0.8/P)
//   avg sold/sec = min(1, PD/100) * 7 * PD^1.15
// We have no universes or projects, so U=0 and Bonuses=1 both drop out,
// leaving PD = k^M * (0.8/P), M = marketingLevel.
var MARKETING_BASE_COST = 25;
var MARKETING_GROWTH = 2.0;
var MARKETING_LEVEL_MULT = 1.4;
var GAME_VERSION = "1.0"; // shown as small grey text at the top of the page

var MARKETING_LEVEL_MAX = 100;

function clampMarketingLevel(level) {
  return Math.min(MARKETING_LEVEL_MAX, Math.max(0, Math.floor(Number(level) || 0)));
}

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
var FACTORY_BALANCE_DEFAULT = 90; // 0-100, nail-maker share. A first factory builds 90% makers and 10% breakers.

var BREAKER_BUILD_COST_FUNDS = 75;
var BREAKER_COOLDOWN_MS = 1000; // pacing between buys, like nail makers
var BREAKER_INTAKE_RATE = 1; // nails/sec consumed per breaker


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
var DEPOSITS_PER_MAP = 15; // deposits on every map. Karma adds none: only the deposit cards (cards.js) add more, up to the max.
var DEPOSITS_MAX = 60;

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
// There is no limit on tao. Instead every tao you hold makes the next one a little dearer: the yin and yang bars
// (and the oscillator's tao ring) are YINYANG_MAX for your first tao, then TAO_COST_STEP bigger for each tao held
// (100, 110, 120, ...; 8 tao means 180). White cards can shrink the step (see cards.js: taoGrowth). Karma cannot grow
// past KARMA_CAP, and Nirvana is reached exactly when your karma gets to NIRVANA_KARMA (it is no longer a roll).
var TAO_COST_STEP = 10;
var KARMA_CAP = 100;
var NIRVANA_KARMA = 100;

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

// Usernames allowed to use the cheat box. Checked against the logged-in
// account's username (case-insensitive) -- guests and anyone not on
// this list can type in the box all they want, nothing will happen.
var CHEAT_ALLOWED_USERNAMES = ["nailmaker", "potato"];
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

// How many deposits a map gets, from banked karma. Reads the live game
// state; before it exists (the very first defaultState() call) or for a
// karma-less player it's just the base count.
function mapDepositCount() {
  // Every map has the same base number of deposits. Karma adds none: the only way to get more is the deposit cards.
  var cardExtra = typeof cardAdd === "function" ? cardAdd("deposits") : 0;
  return Math.max(1, Math.min(DEPOSITS_MAX, DEPOSITS_PER_MAP + cardExtra));
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
  var depositTarget = mapDepositCount();
  while (placed < depositTarget && attempts < 1000) {
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
// temporarily, scars the market permanently, and drains tao (pushing it
// negative, which also costs karma standing and blocks reincarnation).
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
// Each nailbomb drains tao by round(this * the bomb's power) -- 3 for the first
// bomb (= -1 karma standing at 3 tao per karma), then more for each bigger bomb.
var CITY_BOMB_TAO_PER_POWER = 6;

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
// It needs unsold nails (cityBombCost() in city.js) PLUS unstable cores,
// which only come from the swarm (see swarm.js). The Nth nailbomb needs
// N cores: CORE_ISOTOPES_BASE + bombs already dropped.
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
var SWARM_MAJORITY_SPEED_MULT = 1; // TESTING: temporarily disabled -- all dots move at the same base speed regardless of majority/minority. Restore to something like 2.4 once the rest of the loop is confirmed to feel right.
var SWARM_COLLAPSE_IMBALANCE_THRESHOLD = 0.5; // 0.5 = a 3-to-1 split between the two sides (0.43 would be 2.5-to-1, 0.33 is 2-to-1). Raised from 0.32 (~2-to-1) to make collapse a real commitment. Old note:  // |imbalance| has to cross this -- eased down from 0.85 (nearly every dot one color), then from 0.4 (which was still easy to hover just under during active play). Now a clear ~2-to-1 majority is enough.
// All dots move faster the further out of balance you are: speed x (1 + this * |imbalance|).
// At the collapse line (0.5) that is 1.5x; at total one-sided imbalance it is 2x.
var SWARM_IMBALANCE_SPEED_BONUS = 1;
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
    factoryProgress: 0, // factory cycles banked toward the next machine (see engine.js) -- production is a continuous stream, not per-factory batches
    factoryBalance: FACTORY_BALANCE_DEFAULT, // 0 = all breakers, 100 = all makers
    factoryAllocAccum: 0, // Bresenham-style accumulator so output matches the slider ratio exactly over time


    breakers: 0,
    breakerCooldownUntil: 0,

    nailMakersOn: true,
    factoriesOn: true,
    breakersOn: true,

    unlockedMap: false,
    unlockedMachinery: false,
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
    deck: [],               // the cards in your deck (see cards.js); kept across lives, wiped only by ending the run
    collection: [],         // the cards you have put aside (12 at most); kept across lives too
    cardSerial: 1,          // the next card id
    draftSeed: typeof cardNewSeed === "function" ? cardNewSeed() : 1, // makes this life's card hands, so reloading can't reroll them (cards.js)

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

    // Stats for the end-of-life screen and the past lives log.
    totalEarned: 0, // lifetime money earned from selling nails this life
    unlockedResonance: false, // earned per life: a path chosen + 1 tao (see resonance.js)
    resonanceProgress: 0,     // output toward the next tao (white) or factory (black): the ring on the oscilloscope
    autoFactories: 0,         // factories the oscillator has built: they don't raise the price of the next one you buy
    res: null,                // the oscillator bench: control positions, lock, streak (resonance.js makes it)
    swarmCollapses: 0, // times the swarm has collapsed this life
    pastLives: [], // log of lives ended by reincarnation; erased by ending a run (see lives.js)

    // The skyline (see tunables above). Buildings themselves are never
    // stored -- they're computed fresh from nailMakers/breakers/factories
    // whenever the panel draws, so there's nothing here to desync.
    unlockedCity: false, // unlocks the first time the swarm collapses and produces an unstable core
    unlockedSwarm: false, // unlocks the first time the player achieves real balance (production == consumption)
    cityBombs: 0,
    cityFever: 0, // decaying marketing boost from recent nailbombs -- see cityFeverMult()
    cityPanic: 0, // decaying street-panic boost from a recent nailbomb -- fast, short-lived, see cityFeverMult()
    cityMarketScar: 0, // permanent demand loss from the lasting impact of bombings
    unlockedFloor: false, // the factory floor (modules) button appears at FLOOR_UNLOCK_FACTORIES factories (floor.js)
    floorTier: 1,         // Mk1 = 5x5 grid, Mk2 = 6x6, Mk3 = 7x7
    modules: [],          // placed modules: { id, type, x, y, rot, paid }
    moduleStock: [],      // bought but not placed: { type, paid }
    moduleNextId: 1,
    yieldAccumMakers: 0,  // fractional machines carried between factory cycles (module yield bonuses)
    yieldAccumBreakers: 0,
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
