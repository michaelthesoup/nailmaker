"use strict";

var CARD_PACK_SIZE = 5;
var CARD_OPPOSITE_CHANCE = 0.15;
var CARD_SLOTS_MAX = 10;
var CARD_COLLECTION_MAX = 12;

var CARD_SOFTCAP_START = 3;
var CARD_SOFTCAP_RATE = 0.5;

var CARD_BALANCE_SOFT = 1.5;
var CARD_BALANCE_HARD = 2.5;

var CARD_MULT_FLOOR = { machineCost: 0.01, marketingCost: 0.01, copperCost: 0.02, meritCost: 0.01, buyCooldown: 0, factoryGrowth: 0.5, taoGrowth: 0.5 };

var CARD_RARITY_NAMES = ["common", "uncommon", "rare", "legendary"];

var CARD_EFFECTS = {
  machineCost:   { side: "black", kind: "mult", dir: "low",  pct: [[10, 20], [25, 35], [40, 50], [60, 75]] },
  marketingCost: { side: "black", kind: "mult", dir: "low",  pct: [[10, 20], [25, 35], [40, 50], [60, 75]] },
  copperCost:    { side: "black", kind: "mult", dir: "low",  pct: [[10, 15], [20, 30], [35, 45], [50, 65]] },
  buyCooldown:   { side: "black", kind: "mult", dir: "low",  pct: [[15, 25], [30, 45], [50, 70], [75, 90]] },
  factoryGrowth: { side: "black", kind: "mult", dir: "low",  pct: [[5, 10], [10, 15], [15, 25], [30, 40]], minRarity: 1 },
  saleMult:      { side: "black", kind: "mult", dir: "high", pct: [[10, 15], [20, 30], [40, 60], [80, 120]] },
  demandMult:    { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  makerSpeed:    { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  breakerSpeed:  { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  slotJackpot:   { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  slotSpeed:     { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 70], [80, 120]] },
  deposits:      { side: "black", kind: "add", sign: 1, step: 1, amount: [[2, 3], [3, 4], [5, 6], [8, 10]], int: true },
  yinYangSpeed:  { side: "white", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  taoRate:       { side: "white", kind: "mult", dir: "high", pct: [[10, 15], [20, 30], [35, 50], [60, 80]] },
  taoDemand:     { side: "white", kind: "mult", dir: "high", pct: [[10, 15], [20, 30], [35, 50], [60, 80]] },
  resonanceTao:  { side: "white", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  meritCost:     { side: "white", kind: "mult", dir: "low",  pct: [[5, 10], [12, 18], [20, 30], [35, 50]] },
  taoGrowth:     { side: "white", kind: "mult", dir: "low",  pct: [[5, 10], [10, 15], [15, 25], [30, 40]], minRarity: 2 },
  tunersW:       { side: "white", kind: "add", sign: 1, step: 1, amount: [[1, 1], [1, 1], [2, 2], [3, 3]], int: true },
  windowW:       { side: "white", kind: "mult", dir: "high", pct: [[10, 20], [25, 35], [40, 60], [70, 100]] },
  driftW:        { side: "white", kind: "mult", dir: "low",  pct: [[10, 20], [25, 35], [40, 55], [60, 75]] },
  resonancePer:  { side: "white", kind: "add", sign: 1, step: 1, amount: [[1, 1], [1, 1], [1, 1], [2, 2]], int: true, minRarity: 2, noCompanion: true },
  taoPerCycle:   { side: "white", kind: "add", sign: 1, step: 1, amount: [[1, 1], [1, 1], [1, 1], [2, 2]], int: true, minRarity: 2, noCompanion: true }
};

function cardPct(n) { return String(Math.round(Math.abs(n) * 100)); }

var CARD_EFFECT_TEXT = {
  machineCost:   { up: "machines {p}% more expensive",    down: "machines {p}% cheaper" },
  marketingCost: { up: "marketing {p}% more expensive",   down: "marketing {p}% cheaper" },
  copperCost:    { up: "factories use {p}% more copper",  down: "factories use {p}% less copper" },
  buyCooldown:   { up: "machine buy cooldown {p}% longer", down: "machine buy cooldown {p}% shorter" },
  factoryGrowth: { up: "factory prices compound {p}% more", down: "factory prices compound {p}% less" },
  saleMult:      { up: "nails sell for {p}% more",        down: "nails sell for {p}% less" },
  demandMult:    { up: "public demand {p}% higher",       down: "public demand {p}% lower" },
  makerSpeed:    { up: "nail makers {p}% faster",         down: "nail makers {p}% slower" },
  breakerSpeed:  { up: "nail breakers {p}% faster",       down: "nail breakers {p}% slower" },
  yinYangSpeed:  { up: "yin & yang {p}% faster",          down: "yin & yang {p}% slower" },
  taoRate:       { up: "each tao's speed bonus {p}% stronger",  down: "each tao's speed bonus {p}% weaker" },
  taoDemand:     { up: "each tao's demand bonus {p}% stronger", down: "each tao's demand bonus {p}% weaker" },
  resonanceTao:  { up: "the resonance bar fills {p}% faster", down: "the resonance bar fills {p}% slower" },
  meritCost:     { up: "the resonance bar {p}% bigger", down: "the resonance bar {p}% smaller" },
  windowW:       { up: "the resonance alignment window {p}% wider", down: "the resonance alignment window {p}% narrower" },
  driftW:        { up: "resonance drifts {p}% harder", down: "resonance drifts {p}% less" },
  resonancePer:  { add: function (n) { return "+" + n + " extra tao for every full resonance bar"; } },
  tunersW:       { add: function (n) { return "+" + n + " steady hand" + (n === 1 ? "" : "s") + ": resonance drifts 15% slower"; } },
  taoGrowth:     { up: "the tao requirement grows {p}% faster", down: "the tao requirement grows {p}% slower" },
  slotJackpot:   { up: "the slot machine's 777 jackpot pays {p}% more", down: "the slot machine's 777 jackpot pays {p}% less" },
  slotSpeed:     { up: "the slot machine spins {p}% faster", down: "the slot machine spins {p}% slower" },
  deposits:      { add: function (n) { return "+" + n + " deposits on every map"; } },
  taoPerCycle:   { add: function (n) { return "+" + n + " extra tao every yin & yang cycle"; } }
};

function cardEffectLine(key, value) {
  var t = CARD_EFFECT_TEXT[key], def = CARD_EFFECTS[key];
  if (!t || !def || typeof value !== "number") return "";
  if (def.kind === "mult") return (value >= 1 ? t.up : t.down).replace("{p}", cardPct(value - 1));
  return t.add(Math.abs(value));
}

function cardLines(card) {
  var lines = [];
  for (var key in card.effects) {
    var line = cardEffectLine(key, card.effects[key]);
    if (line) lines.push(line);
  }
  return lines;
}

function cardHash(a, b) {
  var h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ b, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function cardRng(seed, index, salt) {
  return mulberry32(cardHash(cardHash(seed >>> 0, index), salt));
}

var CARD_PITY_FULL = 500;
var CARD_PITY_BONUS = [0, 10, 25, 12];

function cardPityShare(pity) {
  return Math.max(0, Math.min(1, (pity || 0) / CARD_PITY_FULL));
}

var CARD_PITY_GUARANTEE = 10000;
var CARD_PITY_ROLL_BONUS = 0.8;

function cardPityGuaranteeShare(pity) {
  return Math.max(0, Math.min(1, ((pity || 0) - CARD_PITY_FULL) / (CARD_PITY_GUARANTEE - CARD_PITY_FULL)));
}

function cardRarityWeights(karma, pity) {
  var k = Math.max(0, karma || 0), b = cardPityShare(pity), g = cardPityGuaranteeShare(pity);
  var legendary = 1 + Math.min(4, k * 0.04) + CARD_PITY_BONUS[3] * b;
  var rare = 5 + Math.min(15, k * 0.15) + CARD_PITY_BONUS[2] * b;
  var uncommon = 25 + Math.min(20, k * 0.25) + CARD_PITY_BONUS[1] * b;
  var common = Math.max(0, 100 - legendary - rare - uncommon);
  if (g > 0) {
    var total = common + uncommon + rare + legendary;
    legendary += g * (total - legendary);
    common *= 1 - g; uncommon *= 1 - g; rare *= 1 - g;
  }
  return [common, uncommon, rare, legendary];
}

function cardPickRarity(rng, karma, maxRarity, pity) {
  var w = cardRarityWeights(karma, pity);
  var limit = maxRarity === undefined ? 3 : maxRarity;
  var total = 0, i;
  for (i = 0; i <= limit; i++) total += w[i];
  var roll = rng() * total;
  for (i = 0; i <= limit; i++) {
    roll -= w[i];
    if (roll < 0) return i;
  }
  return limit;
}

function cardRollValue(rng, key, rarity, pity) {
  var d = CARD_EFFECTS[key];
  var lift = CARD_PITY_ROLL_BONUS * Math.max(0, Math.min(1, (pity || 0) / CARD_PITY_GUARANTEE));
  if (d.kind === "mult") {
    var range = d.pct[rarity];
    var f = rng(); f = f + (1 - f) * lift;
    var p = Math.round((range[0] + f * (range[1] - range[0])) / 5) * 5;
    p = Math.max(range[0], Math.min(range[1], p));
    return d.dir === "high" ? 1 + p / 100 : 1 - p / 100;
  }
  var r = d.amount[rarity];
  var f2 = rng(); f2 = f2 + (1 - f2) * lift;
  var a = r[0] + f2 * (r[1] - r[0]);
  a = Math.round(a / d.step) * d.step;
  a = Math.max(r[0], Math.min(r[1], a));
  return Math.round(a * d.sign * 1000) / 1000;
}

function cardPool(side, rarity, avoid, forCompanion) {
  var pool = [];
  for (var key in CARD_EFFECTS) {
    var def = CARD_EFFECTS[key];
    if (def.side !== side || (def.minRarity || 0) > rarity) continue;
    if (forCompanion && def.noCompanion) continue;
    if (avoid && avoid[key]) continue;
    pool.push(key);
  }
  return pool;
}

function cardBalance(deck) {
  var totals = cardTotalsOf(deck || []);
  var maker = totals.mult.makerSpeed || 1;
  var depositFactor = Math.min(DEPOSITS_MAX, DEPOSITS_PER_MAP + (totals.add.deposits || 0)) / DEPOSITS_PER_MAP;
  var breaker = (totals.mult.breakerSpeed || 1) * depositFactor;
  return { maker: maker, breaker: breaker, ratio: breaker / maker };
}

function cardMake(rng, side, opts) {
  opts = opts || {};
  var rarity = cardPickRarity(rng, opts.karma, opts.maxRarity, opts.pity);
  var pool = cardPool(side, rarity, opts.avoid, false);
  if (pool.length === 0) pool = cardPool(side, rarity, null, false);
  var chosen = pool[Math.floor(rng() * pool.length)];
  var effects = {};
  effects[chosen] = cardRollValue(rng, chosen, rarity, opts.pity);
  if (opts.avoid) opts.avoid[chosen] = true;

  if (rarity === 3) {
    var taken = {};
    taken[chosen] = true;
    var companions = cardPool(side, 2, taken, true);
    var second = companions[Math.floor(rng() * companions.length)];
    effects[second] = cardRollValue(rng, second, 2, opts.pity);
    if (opts.avoid) opts.avoid[second] = true;
  }
  return { side: side, rarity: rarity, effects: effects };
}

function cardOtherSide(side) { return side === "black" ? "white" : "black"; }

function cardFork(seed, karma, pity) {
  var rng = cardRng(seed, 0, 1);
  return [
    cardMake(rng, "black", { karma: karma, maxRarity: 1, pity: pity }),
    cardMake(rng, "white", { karma: karma, maxRarity: 1, pity: pity })
  ];
}

function cardPack(seed, index, path, karma, pity) {
  var rng = cardRng(seed, 100 + index, path === "black" ? 2 : 3);
  var avoid = { black: {}, white: {} };
  var pack = [];
  for (var i = 0; i < CARD_PACK_SIZE; i++) {
    var side = rng() < CARD_OPPOSITE_CHANCE ? cardOtherSide(path) : path;
    pack.push(cardMake(rng, side, { karma: karma, avoid: avoid[side], pity: pity }));
  }
  return pack;
}

function cardSlots(karma) {
  return Math.min(CARD_SLOTS_MAX, 2 + Math.floor(1.5 * Math.sqrt(Math.max(0, karma || 0))));
}

function cardOppositeAllowed(slots) {
  return 0;
}

function cardOppositeCount(deck, path) {
  var n = 0;
  deck.forEach(function (c) { if (c.side !== path) n++; });
  return n;
}

function cardLoadoutBlock(deck, card, slots, path) {
  if (deck.indexOf(card) >= 0) return "already equipped";
  if (deck.length >= slots) return "no free slot";
  if (card.side !== path) return "a " + path + " deck holds only " + path + " cards";
  return null;
}

function cardSorted(cards) {
  return cards.slice().sort(function (a, b) {
    if (b.rarity !== a.rarity) return b.rarity - a.rarity;
    if (a.side !== b.side) return a.side === "black" ? -1 : 1;
    var ka = Object.keys(a.effects).sort().join(","), kb = Object.keys(b.effects).sort().join(",");
    if (ka !== kb) return ka < kb ? -1 : 1;
    return JSON.stringify(a.effects) < JSON.stringify(b.effects) ? -1 : (JSON.stringify(a.effects) > JSON.stringify(b.effects) ? 1 : 0);
  });
}

function cardLean(deck) {
  var r = cardBalance(deck).ratio;
  return r >= 1 ? r : 1 / r;
}

function cardAutoLoadout(cards, slots, path) {
  var deck = [];
  for (var pass = 0; pass < 2 && deck.length < slots; pass++) {
    var strict = pass === 0;
    while (deck.length < slots) {
      var best = null, bestScore = -1;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (cardLoadoutBlock(deck, c, slots, path)) continue;
        if (strict && !cardLeanOk(deck, c)) continue;
        var score = cardScoreIn(c, deck, path);
        if (score > bestScore) { best = c; bestScore = score; }
      }
      if (!best) break;
      deck.push(best);
    }
  }
  return deck;
}

function cardNewEffects(card, deck) {
  var n = 0;
  for (var key in card.effects) {
    if (!deck.some(function (c) { return c.effects[key] !== undefined; })) n++;
  }
  return n;
}

function cardScoreIn(card, deck, path) {
  return card.rarity * 10 + (card.side === path ? 5 : 0) + 3 * cardNewEffects(card, deck);
}

function cardLeanOk(deck, card) {
  var after = cardLean(deck.concat([card]));
  return after <= CARD_BALANCE_HARD || after <= cardLean(deck);
}

function cardAutoPack(pack, st) {
  var stats = { banked: 0 };
  pack.forEach(function (c) {
    if (c.rarity === 3 && st.kept.length < CARD_COLLECTION_MAX) { st.kept.push(c); stats.banked++; }
  });
  return stats;
}

function cardDeckSide() {
  var deck = cardDeck();
  return deck.length ? deck[0].side : null;
}

function cardDeck() {
  return (typeof state !== "undefined" && state && Array.isArray(state.deck)) ? state.deck : [];
}

function cardDiminish(s) {
  if (s <= CARD_SOFTCAP_START) return s;
  return CARD_SOFTCAP_START + (s - CARD_SOFTCAP_START) * CARD_SOFTCAP_RATE;
}

function cardTotalsOf(deck) {
  var bonus = {}, add = {};
  deck.forEach(function (card) {
    for (var key in card.effects) {
      var def = CARD_EFFECTS[key], v = card.effects[key];
      if (!def || typeof v !== "number" || !isFinite(v)) continue;
      if (def.kind === "mult") {
        if (v <= 0) continue;
        bonus[key] = (bonus[key] || 0) + (def.dir === "high" ? v - 1 : 1 / v - 1);
      } else add[key] = (add[key] || 0) + v;
    }
  });
  var mult = {};
  for (var k in bonus) {
    var s = cardDiminish(bonus[k]);
    mult[k] = CARD_EFFECTS[k].dir === "high" ? 1 + s : 1 / (1 + s);
  }
  return { mult: mult, add: add };
}

var cardCache = { sig: null, totals: { mult: {}, add: {} } };

function cardTotals() {
  var deck = cardDeck();
  var sig = deck.map(function (c) { return JSON.stringify(c.effects); }).join("|");
  if (sig !== cardCache.sig) cardCache = { sig: sig, totals: cardTotalsOf(deck) };
  return cardCache.totals;
}

function cardMult(key) {
  var v = cardTotals().mult[key];
  if (typeof v !== "number") return 1;
  var floor = CARD_MULT_FLOOR[key];
  return floor !== undefined ? Math.max(floor, v) : v;
}

function cardAdd(key) {
  var v = cardTotals().add[key];
  return typeof v === "number" ? v : 0;
}

function cardTotalsLines(deck) {
  var totals = cardTotalsOf(deck), lines = [];
  for (var key in CARD_EFFECTS) {
    if (CARD_EFFECTS[key].kind === "mult") {
      var m = totals.mult[key];
      if (m !== undefined && Math.abs(m - 1) > 0.0005) lines.push(cardEffectLine(key, m));
    } else {
      var a = totals.add[key];
      if (a !== undefined && Math.abs(a) > 0.00005) lines.push(cardEffectLine(key, a));
    }
  }
  return lines;
}

function cardPackCount(karmaTotal) {
  return Math.max(1, Math.floor(karmaTotal || 0));
}

function cardNewSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

function cardClean(card) {
  if (!card || (card.side !== "black" && card.side !== "white") || !card.effects || typeof card.effects !== "object") return null;
  var effects = {}, any = false;
  for (var key in card.effects) {
    var v = card.effects[key];
    var def = CARD_EFFECTS[key];
    if (def && typeof v === "number" && isFinite(v) && Math.abs(v) < 1000 && (def.kind !== "mult" || v > 0)) { effects[key] = v; any = true; }
  }
  if (!any) return null;
  var out = { side: card.side, rarity: Math.max(0, Math.min(3, Math.floor(card.rarity) || 0)), effects: effects };
  if (typeof card.id === "number" && isFinite(card.id) && card.id >= 1) out.id = Math.floor(card.id);
  return out;
}

function cardsCommit(equipped, kept) {
  if (typeof state.cardSerial !== "number" || !(state.cardSerial >= 1)) state.cardSerial = 1;
  equipped.concat(kept).forEach(function (c) { if (c.id === undefined) c.id = state.cardSerial++; });
  state.collection = kept.slice(0, CARD_COLLECTION_MAX).map(function (c) { return { id: c.id, side: c.side, rarity: c.rarity, effects: c.effects }; });
  return equipped.map(function (c) { return { id: c.id, side: c.side, rarity: c.rarity, effects: c.effects }; });
}

function cardsNormalize() {
  delete state.skills;
  delete state.region;

  var deck = [], collection = [], seen = {}, serial = 1;
  function take(list, out) {
    (Array.isArray(list) ? list : []).forEach(function (raw) {
      var c = cardClean(raw);
      if (c) out.push(c);
    });
  }
  take(state.deck, deck);
  take(state.collection, collection);
  deck.concat(collection).forEach(function (c) { if (c.id !== undefined && c.id >= serial) serial = c.id + 1; });
  if (typeof state.cardSerial === "number" && state.cardSerial > serial) serial = Math.floor(state.cardSerial);

  var keptDeck = [];
  deck.forEach(function (c) {
    if (c.id !== undefined && seen[c.id]) return;
    if (c.id === undefined) c.id = serial++;
    seen[c.id] = true;
    keptDeck.push(c);
  });
  var blacks = keptDeck.filter(function (c) { return c.side === "black"; }).length;
  var deckSide = blacks >= keptDeck.length - blacks ? "black" : "white";
  var wrongColour = keptDeck.filter(function (c) { return c.side !== deckSide; });
  keptDeck = keptDeck.filter(function (c) { return c.side === deckSide; });
  wrongColour.forEach(function (c) { delete seen[c.id]; });
  collection = wrongColour.concat(collection);
  var keptCollection = [];
  collection.forEach(function (c) {
    if (c.id !== undefined && seen[c.id]) return;
    if (c.id === undefined) c.id = serial++;
    seen[c.id] = true;
    keptCollection.push(c);
  });

  state.deck = keptDeck.slice(0, CARD_SLOTS_MAX);
  state.collection = keptCollection.slice(0, CARD_COLLECTION_MAX);
  state.cardSerial = serial;
  if (typeof state.draftSeed !== "number" || !isFinite(state.draftSeed)) state.draftSeed = cardNewSeed();
}
