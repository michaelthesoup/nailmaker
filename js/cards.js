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
//      bad in them, or the reverse. You can take it for the other side's bonus. Neither path
//      has any debuff; they are just two ways to play, a simple spiritual life or a fast
//      industrial one.
//
// Cards come in four rarities: common, uncommon, rare and legendary. A legendary card is rare
// (about 1 in 100 at no karma, up to 1 in 20) and carries two effects, the first stronger than any
// rare card.
//
// Karma gives nothing but the cards. In particular it no longer adds deposits to the map (pick the
// deposit cards) and it no longer makes room in the community: members come only from white cards,
// so a life with none has no community, and no monastery.
//
// Nothing is granted when you pick a card: the game just asks cardMult() and cardAdd()
// whenever it works something out (the trick the lands and the skill tree used), so a
// card can never leave the game in a half-built state.
//
// BALANCE. Cards add up WITHIN a stat and only multiply BETWEEN different stats, so one stat can't run
// away: three +30% sale cards are +90% (not x2.2), and a cost card of 20% off is worth a quarter more
// buying power, added to the others (see cardTotalsOf). Past +300% each further point counts half. The
// "compound less" cards (factory and tao growth) are rarer and floored, because those two curves are the
// game's main brakes. The number of hands you draft grows with the square root of karma, not with karma.
// Finally a maker/breaker check (cardBalance): breakers get their iron from every deposit, so breaker speed
// and deposit cards add together while maker speed stands alone. If your deck leans too far one way, the
// hands stop offering more of that side and lean toward the other, so the two stay within reach of each
// other (the factories' slider can only split machines 1% at a time).
//
// The deck lives in state.deck and lasts for one life; the next reincarnation drafts a new
// one, and ending a run wipes everything. A hand is worked out from state.draftSeed (set when
// the life begins) and the pick number, so reloading the page can't reroll it: the same
// life always offers the same cards.
//
// A card is { side: "black" | "white", rarity: 0 | 1 | 2 | 3, effects: { key: number } }.
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
//   factoryGrowth  how much each factory you own adds to the price of the next: a share of the usual 40%, so 0.5 halves it
//   yinYangSpeed   how fast the yin & yang bars fill
//   taoRate        how strong the machine-speed bonus from each held tao is
//   taoDemand      how strong the demand bonus from each held tao is
//   communitySpeed how fast members make merit
//   meritCost      merit needed per tao (the community's price of tao)
//   communityMembers (add) members of the community. This is the ONLY way to get any: no members, no community
//   karmaGain      (add) extra karma every reincarnation gives
//   taoGrowth      how much each tao you hold adds to the price of the next: a share of the usual 10%, so 0.5 halves it
// ----------------------------------------------------------------

var CARD_HAND_SIZE = 4;
var CARD_OPPOSITE_CHANCE = 0.2;  // chance a hand holds one card of the other colour

// Bonuses on one stat count in full up to +300%, and half beyond that.
var CARD_SOFTCAP_START = 3;
var CARD_SOFTCAP_RATE = 0.5;

// Hands drafted = this x the square root of your karma (see cardPickCount).
var CARD_PICK_FACTOR = 3;

// The maker/breaker check. 1 = the two sides are exactly in step. Within CARD_BALANCE_SOFT either way,
// hands are untouched; beyond it the stronger side's cards fade out of the hands, reaching none at
// CARD_BALANCE_HARD, while the weaker side's cards become up to 3x likelier.
var CARD_BALANCE_SOFT = 1.5;
var CARD_BALANCE_HARD = 2.5;
var CARD_BREAKER_KEYS = { breakerSpeed: true, deposits: true };
var CARD_MAKER_KEYS = { makerSpeed: true };

// Stacking has no ceiling, but a price or cost that reaches zero would break the game, so these stop short of it.
// factoryGrowth and taoGrowth are shares of the usual compounding: at 0.5 a factory still costs 1.2x the last (1.4 is
// normal), at 0.6 each tao costs 1.06x the last (1.1 is normal). They are the game's main brakes, so they stop well short of flat.
var CARD_MULT_FLOOR = { machineCost: 0.01, marketingCost: 0.01, copperCost: 0.02, meritCost: 0.01, buyCooldown: 0, factoryGrowth: 0.5, taoGrowth: 0.6 };

var CARD_RARITY_NAMES = ["common", "uncommon", "rare", "legendary"];

// Every effect a card can have. side: which colour it comes on. For mult, dir says which way is good
// ("low" = a cost) and pct holds the [min, max] percent for each rarity; for add, amount holds the
// [min, max] for each rarity, step is its rounding, sign its direction, int whether it must be whole.
// minRarity keeps the strongest effects to the rarer cards; noCompanion keeps one off the second line of a
// legendary card.
var CARD_EFFECTS = {
  // ---- black: greed ----
  machineCost:   { side: "black", kind: "mult", dir: "low",  pct: [[10, 20], [25, 35], [40, 50], [60, 75]] },
  marketingCost: { side: "black", kind: "mult", dir: "low",  pct: [[10, 20], [25, 35], [40, 50], [60, 75]] },
  copperCost:    { side: "black", kind: "mult", dir: "low",  pct: [[10, 15], [20, 30], [35, 45], [50, 65]] },
  buyCooldown:   { side: "black", kind: "mult", dir: "low",  pct: [[15, 25], [30, 45], [50, 70], [75, 90]] },
  factoryGrowth: { side: "black", kind: "mult", dir: "low",  pct: [[5, 10], [10, 15], [15, 25], [30, 40]], minRarity: 1 },
  saleMult:      { side: "black", kind: "mult", dir: "high", pct: [[10, 15], [20, 30], [40, 60], [80, 120]] },
  demandMult:    { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  makerSpeed:    { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  breakerSpeed:  { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  deposits:      { side: "black", kind: "add", sign: 1, step: 1, amount: [[2, 3], [3, 4], [5, 6], [8, 10]], int: true },
  // ---- white: enlightenment ----
  yinYangSpeed:  { side: "white", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  taoRate:       { side: "white", kind: "mult", dir: "high", pct: [[10, 15], [20, 30], [35, 50], [60, 80]] },
  taoDemand:     { side: "white", kind: "mult", dir: "high", pct: [[10, 15], [20, 30], [35, 50], [60, 80]] },
  communitySpeed: { side: "white", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  meritCost:     { side: "white", kind: "mult", dir: "low",  pct: [[5, 10], [12, 18], [20, 30], [35, 50]] },
  taoGrowth:     { side: "white", kind: "mult", dir: "low",  pct: [[3, 6], [6, 10], [10, 15], [20, 30]], minRarity: 2 },
  communityMembers: { side: "white", kind: "add", sign: 1, step: 1, amount: [[1, 1], [2, 2], [3, 4], [5, 6]], int: true },
  karmaGain:     { side: "white", kind: "add", sign: 1, step: 1, amount: [[1, 1], [1, 1], [1, 1], [2, 2]], int: true, minRarity: 2, noCompanion: true }
};

// Text for each effect. mult: the words for up and down; add: a function of the number.
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
  communitySpeed: { up: "community makes merit {p}% faster", down: "community makes merit {p}% slower" },
  meritCost:     { up: "merit per tao {p}% higher",       down: "merit per tao {p}% lower" },
  taoGrowth:     { up: "tao costs compound {p}% more",    down: "tao costs compound {p}% less" },
  deposits:      { add: function (n) { return "+" + n + " deposits on every map"; } },
  communityMembers: { add: function (n) { return "+" + n + " community member" + (n === 1 ? "" : "s"); } },
  karmaGain:     { add: function (n) { return "+" + n + " karma every reincarnation"; } }
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

// Weights of [common, uncommon, rare, legendary]. Karma slowly makes the better ones likelier.
function cardRarityWeights(karma) {
  var k = Math.max(0, karma || 0);
  var legendary = 1 + Math.min(4, k * 0.04);
  var rare = 5 + Math.min(15, k * 0.15);
  var uncommon = 25 + Math.min(20, k * 0.25);
  return [100 - legendary - rare - uncommon, uncommon, rare, legendary];
}

function cardPickRarity(rng, karma, maxRarity) {
  var w = cardRarityWeights(karma);
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

// The number an effect has at a rarity.
function cardRollValue(rng, key, rarity) {
  var d = CARD_EFFECTS[key];
  if (d.kind === "mult") {
    var range = d.pct[rarity];
    var p = Math.round((range[0] + rng() * (range[1] - range[0])) / 5) * 5; // whole steps of 5%
    p = Math.max(range[0], Math.min(range[1], p));
    return d.dir === "high" ? 1 + p / 100 : 1 - p / 100;
  }
  var r = d.amount[rarity];
  var a = r[0] + rng() * (r[1] - r[0]);
  a = Math.round(a / d.step) * d.step;
  a = Math.max(r[0], Math.min(r[1], a));
  return Math.round(a * d.sign * 1000) / 1000;
}

// Which effects a card of this colour and rarity may have, leaving out any already in `avoid`.
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

// ---------------- the maker/breaker check ----------------

// How strong the deck makes each side: { maker, breaker, ratio } with 1 = no cards, and ratio above 1 meaning the
// breakers are ahead. A breaker takes iron from every deposit, so its power is its speed times the extra deposits.
function cardBalance(deck) {
  var totals = cardTotalsOf(deck || []);
  var maker = totals.mult.makerSpeed || 1;
  var depositFactor = Math.min(DEPOSITS_MAX, DEPOSITS_PER_MAP + (totals.add.deposits || 0)) / DEPOSITS_PER_MAP;
  var breaker = (totals.mult.breakerSpeed || 1) * depositFactor;
  return { maker: maker, breaker: breaker, ratio: breaker / maker };
}

// How likely an effect is to be offered, given the deck's breaker/maker ratio: 1 normally, and leaning back toward
// the weaker side once the deck is out of step by more than CARD_BALANCE_SOFT.
function cardEffectWeight(key, ratio) {
  var over = ratio >= 1 ? ratio : 1 / ratio;
  if (!(over > CARD_BALANCE_SOFT)) return 1;
  var breakersAhead = ratio > 1;
  var leading = breakersAhead ? CARD_BREAKER_KEYS : CARD_MAKER_KEYS;
  var lagging = breakersAhead ? CARD_MAKER_KEYS : CARD_BREAKER_KEYS;
  var span = CARD_BALANCE_HARD - CARD_BALANCE_SOFT;
  var progress = Math.min(1, (over - CARD_BALANCE_SOFT) / span);
  if (leading[key]) return 1 - progress; // fades to none
  if (lagging[key]) return 1 + 2 * progress; // up to 3x likelier
  return 1;
}

// One card of a colour. opts: { karma, maxRarity, avoid, ratio } where avoid is a { key: true } map of effects
// already in the hand, so a hand doesn't repeat itself, and ratio is cardBalance(deck).ratio (1 if omitted).
// A legendary card has two effects: a legendary one, and a second at rare strength.
function cardMake(rng, side, opts) {
  opts = opts || {};
  var ratio = opts.ratio || 1;
  var rarity = cardPickRarity(rng, opts.karma, opts.maxRarity);
  var pool = cardPool(side, rarity, opts.avoid, false);
  if (pool.length === 0) pool = cardPool(side, rarity, null, false); // every effect already in the hand: allow a repeat rather than fail
  var chosen = cardPickWeighted(rng, pool, ratio);
  var effects = {};
  effects[chosen] = cardRollValue(rng, chosen, rarity);
  if (opts.avoid) opts.avoid[chosen] = true;

  if (rarity === 3) {
    var taken = {};
    taken[chosen] = true;
    var companions = cardPool(side, 2, taken, true);
    var second = cardPickWeighted(rng, companions, ratio);
    effects[second] = cardRollValue(rng, second, 2);
    if (opts.avoid) opts.avoid[second] = true;
  }
  return { side: side, rarity: rarity, effects: effects };
}

// Picks one of the keys by weight with a single random draw (so a hand's other draws never shift).
function cardPickWeighted(rng, keys, ratio) {
  var weights = keys.map(function (k) { return cardEffectWeight(k, ratio); });
  var total = weights.reduce(function (a, b) { return a + b; }, 0);
  var roll = rng();
  if (!(total > 0)) return keys[Math.floor(roll * keys.length)]; // nothing allowed (can't happen with these tables): plain pick
  roll *= total;
  for (var i = 0; i < keys.length; i++) {
    roll -= weights[i];
    if (roll < 0) return keys[i];
  }
  return keys[keys.length - 1];
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

// The hand for pick number `index` (1, 2, 3...) on a path, for a deck of the cards picked so far. The same seed, pick,
// path and deck always give the same hand. Now and then one card is swapped for one of the other colour.
function cardHand(seed, index, path, karma, deck) {
  var rng = cardRng(seed, index, path === "black" ? 2 : 3);
  var ratio = cardBalance(deck).ratio;
  var avoid = {}, hand = [];
  for (var i = 0; i < CARD_HAND_SIZE; i++) hand.push(cardMake(rng, path, { karma: karma, avoid: avoid, ratio: ratio }));
  var roll = rng(), slot = Math.floor(rng() * CARD_HAND_SIZE);
  if (roll < CARD_OPPOSITE_CHANCE) hand[slot] = cardMake(cardRng(seed, index, 4), cardOtherSide(path), { karma: karma, ratio: ratio });
  return hand;
}

// ---------------- the deck ----------------

function cardDeck() {
  return (typeof state !== "undefined" && state && Array.isArray(state.deck)) ? state.deck : [];
}

// Bonuses on one stat count in full up to CARD_SOFTCAP_START and at CARD_SOFTCAP_RATE beyond it.
function cardDiminish(s) {
  if (s <= CARD_SOFTCAP_START) return s;
  return CARD_SOFTCAP_START + (s - CARD_SOFTCAP_START) * CARD_SOFTCAP_RATE;
}

// Totals of a list of cards: { mult: { key: multiplier }, add: { key: sum } }.
// Cards add within a stat and multiply between stats. A stat that is good when high (sales, speed) sums each
// card's bonus: +30% and +50% make +80%. A stat that is good when low (a cost) sums each card's buying power:
// a card that takes 20% off is worth 1/0.8 - 1 = +25% more for the money, and those add up, so 20% off twice is
// 1/1.5, 33% off, not 36%. Either way the sum is softly capped (cardDiminish).
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

// How many hands of four a reincarnation offers: three times the square root of your karma, so karma still means
// more cards, but 50 karma is 21 picks, not 50. (1 karma: 3, 4: 6, 9: 9, 25: 15, 50: 21, 100: 30.)
function cardPickCount(karmaTotal) {
  return Math.round(CARD_PICK_FACTOR * Math.sqrt(Math.max(0, karmaTotal)));
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
      var def = CARD_EFFECTS[key];
      if (def && typeof v === "number" && isFinite(v) && Math.abs(v) < 1000 && (def.kind !== "mult" || v > 0)) { effects[key] = v; any = true; } // (a multiplier is always above zero; this also drops the old additive growth cards)
    }
    if (any) kept.push({ side: card.side, rarity: Math.max(0, Math.min(3, Math.floor(card.rarity) || 0)), effects: effects });
  });
  state.deck = kept.slice(0, 1000);
  if (typeof state.draftSeed !== "number" || !isFinite(state.draftSeed)) state.draftSeed = cardNewSeed();
}
