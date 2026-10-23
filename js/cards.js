"use strict";

// ----------------------------------------------------------------
// Cards (they replace the skill tree). Reincarnation ends with a draft: you build the
// DECK for your next life, and the deck is what makes that life different. The cards are
// generated, not written, so the draft never runs out and you can play forever.
//
// The draft (cardsui.js shows it):
//   1. A fork: one BLACK card and one WHITE card, and the words "choose your path wisely".
//      Black is the path of greed (the machine). White is the path of enlightenment (tao,
//      karma, the community). Taking one is your first card and sets your path.
//   2. Then one hand of four cards, all of your path's colour, for EVERY karma you hold.
//      Pick one from each hand. More karma, more cards.
//   3. Now and then a hand holds one card of the OTHER colour: a good person with a little
//      bad in them, or the reverse. You can take it for the other side's bonus, but you can't
//      balance good and evil: each opposite card you hold makes the next one rarer to be
//      offered and weaker (it becomes unstable). Neither path has any debuff; they are just
//      two ways to play, a simple spiritual life or a fast industrial one.
//
// Nothing is granted when you pick a card: the game just asks cardMult() and cardAdd()
// whenever it works something out (the trick the lands and the skill tree used), so a
// card can never leave the game in a half-built state. Cards stack without limit:
// multipliers multiply, so a deck of cheap-machinery cards makes machines nearly free.
//
// The deck lives in state.deck and lasts for one life; the next reincarnation drafts a new
// one, and ending a run wipes everything. A hand is worked out from state.draftSeed (set when
// the life begins) and the pick number, so reloading the page can't reroll it: the same
// life always offers the same cards.
//
// A card is { side: "black" | "white", rarity: 0 | 1 | 2, effects: { key: number } }.
//
// An effect is one of two kinds:
//   mult  a multiplier, 1 = no change; several cards multiply together
//   add   a number added to something; several cards add together
//
//   machineCost    price of makers, breakers and factories
//   copperCost     copper a factory cycle uses
//   marketingCost  price of marketing levels
//   buyCooldown    the wait between buying nail makers (and breakers)
//   saleMult       money per nail sold
//   demandMult     public demand
//   breakerSpeed   ore per nail the breakers take
//   makerSpeed     nails per second each maker turns out
//   deposits       (add) deposits on every map
//   factoryGrowth  (add) added to how much dearer each factory makes the next (negative = gentler)
//   yinYangSpeed   how fast the yin & yang bars fill
//   taoRate        how strong the machine-speed bonus from each held tao is
//   taoDemand      how strong the demand bonus from each held tao is
//   communitySpeed how fast members make merit
//   meritCost      merit needed per tao (the community's price of tao)
//   communityRoom  (add) members the community has room for
//   karmaGain      (add) extra karma every reincarnation gives
//   taoGrowth      (add) added to how much dearer each tao makes the next one (negative = gentler)
// ----------------------------------------------------------------

var CARD_HAND_SIZE = 4;
var CARD_OPPOSITE_CHANCE = 0.2;  // chance a hand holds one card of the other colour, with none held yet
var CARD_OPPOSITE_DECAY = 0.5;   // each opposite card already held halves that chance...
var CARD_OPPOSITE_POWER = 0.75;  // ...and makes the next one's bonus a quarter weaker (the instability)

// Stacking has no ceiling, but a price or cost that reaches zero would break the game, so these stop short of it.
var CARD_MULT_FLOOR = { machineCost: 0.01, marketingCost: 0.01, copperCost: 0.02, meritCost: 0.01, buyCooldown: 0 };

var CARD_RARITY_NAMES = ["common", "uncommon", "rare"];

// Every effect a card can have. side: which colour it comes on. For mult, dir says which way is good
// ("low" = a cost) and pct holds the [min, max] percent for each rarity; for add, amount holds the
// [min, max] for each rarity, step is its rounding, sign its direction, int whether it must be whole.
// minRarity keeps the strongest effects to the rarer cards.
var CARD_EFFECTS = {
  // ---- black: greed ----
  machineCost:   { side: "black", kind: "mult", dir: "low",  pct: [[10, 20], [25, 35], [40, 50]] },
  marketingCost: { side: "black", kind: "mult", dir: "low",  pct: [[10, 20], [25, 35], [40, 50]] },
  copperCost:    { side: "black", kind: "mult", dir: "low",  pct: [[10, 15], [20, 30], [35, 45]] },
  buyCooldown:   { side: "black", kind: "mult", dir: "low",  pct: [[15, 25], [30, 45], [50, 70]] },
  saleMult:      { side: "black", kind: "mult", dir: "high", pct: [[10, 15], [20, 30], [40, 60]] },
  demandMult:    { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80]] },
  makerSpeed:    { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80]] },
  breakerSpeed:  { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80]] },
  factoryGrowth: { side: "black", kind: "add", sign: -1, step: 0.01,  amount: [[0.01, 0.02], [0.03, 0.04], [0.05, 0.07]] },
  deposits:      { side: "black", kind: "add", sign: 1,  step: 1,     amount: [[2, 3], [4, 6], [7, 10]], int: true },
  // ---- white: enlightenment ----
  yinYangSpeed:  { side: "white", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80]] },
  taoRate:       { side: "white", kind: "mult", dir: "high", pct: [[10, 15], [20, 30], [35, 50]] },
  taoDemand:     { side: "white", kind: "mult", dir: "high", pct: [[10, 15], [20, 30], [35, 50]] },
  communitySpeed: { side: "white", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80]] },
  meritCost:     { side: "white", kind: "mult", dir: "low",  pct: [[5, 10], [12, 18], [20, 30]] },
  taoGrowth:     { side: "white", kind: "add", sign: -1, step: 0.001, amount: [[0.002, 0.004], [0.005, 0.008], [0.01, 0.015]] },
  communityRoom: { side: "white", kind: "add", sign: 1,  step: 1,     amount: [[1, 1], [2, 2], [3, 4]], int: true },
  karmaGain:     { side: "white", kind: "add", sign: 1,  step: 1,     amount: [[1, 1], [1, 1], [1, 1]], int: true, minRarity: 2 }
};

// Text for each effect. mult: the words for up and down; add: a function of the number.
function cardPct(n) { return String(Math.round(Math.abs(n) * 100)); }
// 0.003 -> "0.3 points", 0.01 -> "1 point"
function cardPoints(n) {
  var p = Math.round(Math.abs(n) * 1000) / 10;
  return p + (p === 1 ? " point" : " points");
}

var CARD_EFFECT_TEXT = {
  machineCost:   { up: "machines {p}% dearer",            down: "machines {p}% cheaper" },
  marketingCost: { up: "marketing {p}% dearer",           down: "marketing {p}% cheaper" },
  copperCost:    { up: "factory copper cost {p}% higher", down: "factory copper cost {p}% lower" },
  buyCooldown:   { up: "buying machines has {p}% more cooldown", down: "buying machines has {p}% less cooldown" },
  saleMult:      { up: "nails sell for {p}% more",        down: "nails sell for {p}% less" },
  demandMult:    { up: "public demand {p}% higher",       down: "public demand {p}% lower" },
  makerSpeed:    { up: "nail makers {p}% faster",         down: "nail makers {p}% slower" },
  breakerSpeed:  { up: "nail breakers {p}% faster",       down: "nail breakers {p}% slower" },
  yinYangSpeed:  { up: "yin & yang {p}% faster",          down: "yin & yang {p}% slower" },
  taoRate:       { up: "each tao's speed bonus {p}% stronger",  down: "each tao's speed bonus {p}% weaker" },
  taoDemand:     { up: "each tao's demand bonus {p}% stronger", down: "each tao's demand bonus {p}% weaker" },
  communitySpeed: { up: "community makes merit {p}% faster", down: "community makes merit {p}% slower" },
  meritCost:     { up: "the community needs {p}% more merit per tao", down: "the community needs {p}% less merit per tao" },
  deposits:      { add: function (n) { return "+" + n + " deposits on every map"; } },
  factoryGrowth: { add: function (n) { return "each factory is " + cardPoints(n) + " less dear than the last"; } },
  communityRoom: { add: function (n) { return "room for " + n + " more community member" + (n === 1 ? "" : "s"); } },
  karmaGain:     { add: function (n) { return "+" + n + " karma every reincarnation"; } },
  taoGrowth:     { add: function (n) { return "each tao is " + cardPoints(n) + " less dear than the last"; } }
};

// One effect as a line of text, e.g. ("machineCost", 0.8) -> "machines 20% cheaper".
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

// ---------------- making cards ----------------

// A number mixed from two (for seeding), and a seeded random generator from three.
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

// Weights of [common, uncommon, rare]. Karma slowly makes the better ones likelier.
function cardRarityWeights(karma) {
  var k = Math.max(0, karma || 0);
  var rare = 5 + Math.min(15, k * 0.15);
  var uncommon = 25 + Math.min(20, k * 0.25);
  return [100 - rare - uncommon, uncommon, rare];
}

function cardPickRarity(rng, karma, maxRarity) {
  var w = cardRarityWeights(karma);
  var limit = maxRarity === undefined ? 2 : maxRarity;
  var total = 0, i;
  for (i = 0; i <= limit; i++) total += w[i];
  var roll = rng() * total;
  for (i = 0; i <= limit; i++) {
    roll -= w[i];
    if (roll < 0) return i;
  }
  return limit;
}

// One card of a colour. opts: { karma, maxRarity, avoid } where avoid is a { key: true } map of effects
// already in the hand, so a hand doesn't repeat itself.
function cardMake(rng, side, opts) {
  opts = opts || {};
  var rarity = cardPickRarity(rng, opts.karma, opts.maxRarity);
  var pool = [];
  for (var key in CARD_EFFECTS) {
    var def = CARD_EFFECTS[key];
    if (def.side === side && (def.minRarity || 0) <= rarity && !(opts.avoid && opts.avoid[key])) pool.push(key);
  }
  if (pool.length === 0) { // only if every effect is already in the hand: allow repeats rather than fail
    for (var k2 in CARD_EFFECTS) if (CARD_EFFECTS[k2].side === side && (CARD_EFFECTS[k2].minRarity || 0) <= rarity) pool.push(k2);
  }
  var chosen = pool[Math.floor(rng() * pool.length)];
  var d = CARD_EFFECTS[chosen];
  var effects = {};
  if (d.kind === "mult") {
    var range = d.pct[rarity];
    var p = Math.round((range[0] + rng() * (range[1] - range[0])) / 5) * 5; // whole steps of 5%
    p = Math.max(range[0], Math.min(range[1], p));
    effects[chosen] = d.dir === "high" ? 1 + p / 100 : 1 - p / 100;
  } else {
    var r = d.amount[rarity];
    var a = r[0] + rng() * (r[1] - r[0]);
    a = Math.round(a / d.step) * d.step;
    a = Math.max(r[0], Math.min(r[1], a));
    effects[chosen] = Math.round(a * d.sign * 1000) / 1000;
  }
  if (opts.avoid) opts.avoid[chosen] = true;
  return { side: side, rarity: rarity, effects: effects };
}

// A card made weaker by a factor (the opposite-colour cards). Mults shrink toward 1, adds toward 0.
function cardScale(card, f) {
  var effects = {};
  for (var key in card.effects) {
    var def = CARD_EFFECTS[key], v = card.effects[key];
    if (def.kind === "mult") effects[key] = Math.round((1 + (v - 1) * f) * 1000) / 1000;
    else {
      var scaled = v * f;
      effects[key] = def.int ? (v < 0 ? -1 : 1) * Math.max(1, Math.round(Math.abs(scaled))) : Math.round(scaled * 1000) / 1000;
    }
  }
  return { side: card.side, rarity: card.rarity, effects: effects };
}

function cardOtherSide(side) { return side === "black" ? "white" : "black"; }

// The fork at the start of the draft: [black card, white card]. Plain cards only, like "20% cheaper machines".
function cardFork(seed, karma) {
  var rng = cardRng(seed, 0, 1);
  return [
    cardMake(rng, "black", { karma: karma, maxRarity: 1 }),
    cardMake(rng, "white", { karma: karma, maxRarity: 1 })
  ];
}

// The hand for pick number `index` (1, 2, 3...) on a path. heldOpposite is how many opposite-colour cards
// you hold already. The same seed, pick and path always give the same hand; only the rare opposite card
// depends on what you took before.
function cardHand(seed, index, path, heldOpposite, karma) {
  var rng = cardRng(seed, index, path === "black" ? 2 : 3);
  var avoid = {}, hand = [];
  for (var i = 0; i < CARD_HAND_SIZE; i++) hand.push(cardMake(rng, path, { karma: karma, avoid: avoid }));
  var roll = rng(), slot = Math.floor(rng() * CARD_HAND_SIZE);
  var chance = CARD_OPPOSITE_CHANCE * Math.pow(CARD_OPPOSITE_DECAY, heldOpposite);
  if (roll < chance) {
    var oppRng = cardRng(seed, index, 4);
    var other = cardMake(oppRng, cardOtherSide(path), { karma: karma });
    hand[slot] = cardScale(other, Math.pow(CARD_OPPOSITE_POWER, heldOpposite));
  }
  return hand;
}

// ---------------- the deck ----------------

function cardDeck() {
  return (typeof state !== "undefined" && state && Array.isArray(state.deck)) ? state.deck : [];
}

// Totals of a list of cards: { mult: { key: product }, add: { key: sum } }.
function cardTotalsOf(deck) {
  var mult = {}, add = {};
  deck.forEach(function (card) {
    for (var key in card.effects) {
      var def = CARD_EFFECTS[key], v = card.effects[key];
      if (!def || typeof v !== "number") continue;
      if (def.kind === "mult") mult[key] = (mult[key] === undefined ? 1 : mult[key]) * v;
      else add[key] = (add[key] || 0) + v;
    }
  });
  return { mult: mult, add: add };
}

// The live deck's totals, kept until the deck changes (they are asked for several times a tick).
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

// The deck's combined effects as lines of text, in the order of the table above.
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

// How many cards of the other colour a deck holds, given its path.
function cardOppositeCount(deck, path) {
  return deck.filter(function (c) { return c.side !== path; }).length;
}

// How many hands of four a reincarnation offers: one per karma.
function cardPickCount(karmaTotal) {
  return Math.max(0, Math.floor(karmaTotal));
}

// A new life's seed. Kept in the save, so the same life always offers the same cards.
function cardNewSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

// Keeps a loaded save honest: a deck made of anything but real cards is cleaned or dropped, the seed is made
// if missing, and the old skill tree and lands (which no longer exist) are removed.
function cardsNormalize() {
  delete state.skills;
  delete state.region;
  var kept = [];
  (Array.isArray(state.deck) ? state.deck : []).forEach(function (card) {
    if (!card || (card.side !== "black" && card.side !== "white") || !card.effects || typeof card.effects !== "object") return;
    var effects = {}, any = false;
    for (var key in card.effects) {
      var v = card.effects[key];
      if (CARD_EFFECTS[key] && typeof v === "number" && isFinite(v) && Math.abs(v) < 1000) { effects[key] = v; any = true; }
    }
    if (any) kept.push({ side: card.side, rarity: Math.max(0, Math.min(2, Math.floor(card.rarity) || 0)), effects: effects });
  });
  state.deck = kept.slice(0, 1000);
  if (typeof state.draftSeed !== "number" || !isFinite(state.draftSeed)) state.draftSeed = cardNewSeed();
}
