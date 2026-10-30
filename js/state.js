"use strict";

var PRICE_MIN = 0.01;
var PRICE_STEP = 0.01;
var PRICE_MAX = 0.08;
var OPTIMAL_PRICE_SALES_RATIO = 0.9;
var OPTIMAL_PRICE_MAX_SALES_RATIO = 0.98;

var MARKETING_BASE_COST = 25;
var MARKETING_GROWTH = 2.0;
var MARKETING_LEVEL_MULT = 1.4;
var GAME_VERSION = "1.0";

var MARKETING_LEVEL_MAX = 100;

function clampMarketingLevel(level) {
  return Math.min(MARKETING_LEVEL_MAX, Math.max(0, Math.floor(Number(level) || 0)));
}

var IRON_BUY_COST = 1;
var IRON_BUY_AMOUNT = 100;

var NAILMAKER_COST = 5;
var NAILMAKER_COOLDOWN_MS = 1000;
var NAILMAKER_RATE = 1;
var IRON_PER_NAIL = 1;

var FACTORY_BUILD_COST_FUNDS = 1000;
var FACTORY_COST_GROWTH = 1.4;
var FACTORY_PERIOD_SEC = 1;
var FACTORY_COST_BREAKER_SIDE_COPPER = 1000;
var FACTORY_COST_MAKER_SIDE_COPPER = 100;
var FACTORY_BALANCE_DEFAULT = 90;

var BREAKER_BUILD_COST_FUNDS = 75;
var BREAKER_COOLDOWN_MS = 1000;
var BREAKER_INTAKE_RATE = 1;

var COPPER_SELL_PRICE = 0.05;

var MINE_IRON_AMOUNT = 1;
var MINE_COPPER_AMOUNT = 1;
var DEPOSIT_CAPACITY_BASE = 2000;
var DEPOSIT_CAPACITY_GROWTH = 1.2;

var TICK_MS = 100;

var MAP_ROWS = 10;
var MAP_COLS = 21;
var DEPOSITS_PER_MAP = 15;
var DEPOSITS_MAX = 60;

var MACHINERY_UNLOCK_NAILS = 250;

var YINYANG_TICK_AMOUNT = 1;
var YINYANG_MAX = 100;

var YINYANG_STATUS_DEADZONE = 0.9;

var YINYANG_PD_BONUS_PER_LEVEL = 0.1;

var KARMA_TAO_THRESHOLD = 3;
var TAO_COST_STEP = 10;
var KARMA_CAP = 100;
var NIRVANA_KARMA = 100;

function randRange(min, max) {
  return min + Math.random() * (max - min);
}
function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

var CHEAT_ALLOWED_USERNAMES = ["nailmaker", "potato"];
var TAO_RATE_BONUS_PER_POINT = 0.5;

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

function mapDepositCount() {
  var cardExtra = typeof cardAdd === "function" ? cardAdd("deposits") : 0;
  return Math.max(1, Math.min(DEPOSITS_MAX, DEPOSITS_PER_MAP + cardExtra));
}

var MAP_MIN_OF_EACH = 3;
function mapIronCount(total, luck) {
  var lo = Math.min(MAP_MIN_OF_EACH, Math.floor(total / 2)), hi = total - lo;
  var mid = total / 2;
  var u = lo - 0.5 + Math.random() * (hi - lo + 1);
  var pulled = mid + (u - mid) * (1 - 0.7 * Math.max(0, Math.min(1, luck || 0)));
  return Math.max(lo, Math.min(hi, Math.round(pulled)));
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
  var luck = typeof cardPityShare === "function" && typeof state !== "undefined" && state ? cardPityShare(state.slotPity) : 0;
  var types = [], ironCount = mapIronCount(depositTarget, luck);
  for (var t = 0; t < depositTarget; t++) types.push(t < ironCount ? "i" : "c");
  for (var t2 = types.length - 1; t2 > 0; t2--) {
    var j = Math.floor(Math.random() * (t2 + 1)), tmp = types[t2]; types[t2] = types[j]; types[j] = tmp;
  }
  while (placed < depositTarget && attempts < 1000) {
    attempts++;
    var r = Math.floor(rand() * MAP_ROWS);
    var c = Math.floor(rand() * MAP_COLS);
    if (tiles[r][c].type !== ".") continue;
    tiles[r][c] = { type: types[placed], remaining: capacity };
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

var CITY_TOTAL_SLOTS = 22;
var CITY_REBUILD_INTERVAL_SEC = 0.5;
var CITY_DISTRICT_WIDTH = 380;
var CITY_PAN_SPEED = 18;
var CITY_BUILDING_SPACING = 22;
var CITY_AFTERMATH_BASE_DISTANCE = 260;
var CITY_AFTERMATH_RADIUS_DISTANCE = 180;
var CITY_AFTERMATH_POWER_DISTANCE = 260;

var CITY_BOMB_BASE_NAILS = 50000;
var CITY_BOMB_COST_GROWTH = 2.3;
var CITY_BOMB_BASE_RADIUS = 1;
var CITY_BOMB_RADIUS_GROWTH = 0.6;
var CITY_BOMB_BASE_POWER = 0.5;
var CITY_BOMB_POWER_GROWTH = 0.18;
var CITY_BOMB_ECONOMY_SHOCK_FACTOR = 0.02;
var CITY_BOMB_ECONOMY_SHOCK_CAP = 0.15;

var CITY_FEVER_EXP_GROWTH = CITY_BOMB_COST_GROWTH;
var CITY_FEVER_MAX_BASE = 3;
var CITY_FEVER_PER_BOMB_BASE = 0.6;
var CITY_FEVER_HALFLIFE_SEC = 40;
var CITY_FEVER_DEMAND_PER_POINT = 0.35;
var CITY_MARKET_SCAR_PER_BOMB = 0.5;
var CITY_MARKET_SCAR_MAX = 10;
var CITY_BOMB_TAO_PER_POWER = 6;

var CITY_PED_COUNT = 16;
var CITY_PED_WALK_SPEED = 0.25;
var CITY_PED_PANIC_SPEED_MULT = 3.5;
var CITY_PED_PANIC_DURATION_SEC = 4;
var CITY_PANIC_PER_BOMB = 1;
var CITY_PANIC_HALFLIFE_SEC = 5;
var CITY_PANIC_DEMAND_MAX = 0.5;

var CORE_ISOTOPES_BASE = 1;

var SWARM_MAJORITY_SPEED_MULT = 1;
var SWARM_COLLAPSE_IMBALANCE_THRESHOLD = 0.5;
var SWARM_IMBALANCE_SPEED_BONUS = 1;
var SWARM_COLLAPSE_SUSTAIN_SEC = 1.5;
var SWARM_COLLAPSE_FUEL_GAIN = 1;

function defaultState() {
  var tiles = generateMapTiles(1);
  return {
    funds: 25.00,
    unsold: 0,
    price: PRICE_MAX,
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
    factoryProgress: 0,
    factoryBalance: FACTORY_BALANCE_DEFAULT,
    factoryAllocAccum: 0,

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

    unlockedYinYang: false,
    yin: 0,
    yang: 0,
    tao: 0,
    karma: 0,
    nirvanaAchieved: false,
    deck: [],
    collection: [],
    cardSerial: 1,
    draftSeed: typeof cardNewSeed === "function" ? cardNewSeed() : 1,

    settleAccum: 0,

    yinYangAccum: 0,

    simTime: 0,

    totalEarned: 0,
    slotPity: 0,
    unlockedSlots: false,
    unlockedResonance: false,
    resonanceProgress: 0,
    autoFactories: 0,
    res: null,
    swarmCollapses: 0,
    pastLives: [],

    unlockedCity: false,
    unlockedSwarm: false,
    cityBombs: 0,
    cityFever: 0,
    cityPanic: 0,
    cityMarketScar: 0,
    unlockedFloor: false,
    floorTier: 1,
    modules: [],
    moduleStock: [],
    moduleNextId: 1,
    yieldAccumMakers: 0,
    yieldAccumBreakers: 0,
    isotopeStock: 0,
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
