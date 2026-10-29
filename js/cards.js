"use strict";

// ----------------------------------------------------------------
// Cards (they replace the skill tree). You COLLECT cards and carry a DECK of them into each life; the deck is
// what makes that life different. The cards are generated, not written, so there is always something new and you
// can play forever. Both the deck and the collection are saved from life to life.
//
// Reincarnation (cardsui.js shows it):
//   1. A fork: one BLACK card and one WHITE card, and the words "choose your path wisely".
//      Black is the path of greed (the machine). White is the path of enlightenment (tao,
//      karma, the oscillator's tao). Taking one is your first card and sets your path.
//   2. PACKS. Every karma you hold (your total) is a pack of five cards, all of your path's colour except now and
//      then one of the OTHER colour (a good person with a little bad in them, or the reverse). You open them one at
//      a time and click the cards you want: a card goes to your deck, or to your collection if the deck is full
//      (with both full you must discard something). Every card you leave is gone when the next pack opens. Clicking
//      a card in the deck moves it to the collection and back, and any card can be discarded. Or press "open all"
//      to have the packs opened for you, one after another: it only puts legendaries into empty places in
//      your collection, and never changes your deck. You can begin your new life before every pack is open.
//   3. SLOTS. Your karma gives you a number of slots for the deck (cardSlots) and the collection has 12 places.
//      A deck holds ONE colour, your path's: the oscillator makes tao on either path (you can't have
//      both colours). The collection holds any colour, so an opposite-colour card from a pack can still be kept. Neither
//      path has any debuff; they are just two ways to play, a simple spiritual life or a fast industrial one.
//
// Cards come in four rarities: common, uncommon, rare and legendary. A legendary card is rare
// (about 1 in 100 at no karma, up to 1 in 20) and carries two effects, the first stronger than any
// rare card.
//
// Karma gives nothing but the cards (packs and slots). In particular it does not add deposits to the map (use the
// deposit cards) and it does not change resonance: every deck has one free steady hand (resonance.js); white and black
// cards add more.
//
// Nothing is granted when you equip a card: the game just asks cardMult() and cardAdd()
// whenever it works something out (the trick the lands and the skill tree used), so a
// card can never leave the game in a half-built state.
//
// BALANCE. Cards add up WITHIN a stat and only multiply BETWEEN different stats, so one stat can't run
// away: three +30% sale cards are +90% (not x2.2), and a cost card of 20% off is worth a quarter more
// buying power, added to the others (see cardTotalsOf). Past +300% each further point counts half. The
// "compound less" cards (factory and tao growth) are rarer and floored, because those two curves are the
// game's main brakes. The slots grow with the square root of karma, not with karma. Finally a maker/breaker check
// (cardBalance): breakers get their iron from every deposit, so breaker speed and deposit cards add together while
// maker speed stands alone. The loadout screen warns when a deck leans too far one way, and "equip best" will not
// push it past the limit (the factories' slider can only split machines 1% at a time).
//
// The collection (state.collection: at most 12 cards) and the deck (state.deck) are both saved, and a card is in
// one or the other, never both. Packs are worked out from state.draftSeed (set when the life begins) and the
// pack number, so reloading the page can't reroll them: the same life always offers the same cards.
//
// A card is { id, side: "black" | "white", rarity: 0 | 1 | 2 | 3, effects: { key: number } }.
//
// An effect is one of two kinds:
//   mult  a multiplier, 1 = no change; several cards combine (see BALANCE)
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
//   slotJackpot    how much the slot machine's three-7s jackpot pays (slots.js)
//   slotSpeed      how fast the slot machine spins (slots.js)
//   deposits       (add) deposits on every map
//   factoryGrowth  how much each factory you own adds to the price of the next: a share of the usual 40%, so 0.5 halves it
//   yinYangSpeed   how fast the yin & yang bars fill
//   taoRate        how strong the machine-speed bonus from each held tao is
//   taoDemand      how strong the demand bonus from each held tao is
//   resonanceTao   how fast the resonance bar fills on a white deck (resonance.js)
//   resonancePer   (add) extra tao for every full resonance bar (on top of the 1 you always get)
//   meritCost      the size of the oscillator's bar
//   tunersW        (add) steady hands: each slows the oscillator's drift by 15% (you always have one)
//   windowW        how wide the oscillator's lock window is on a white deck
//   driftW         how hard resonance drifts (a cost) on a white deck
//   taoPerCycle    (add) extra tao every time the yin & yang bars complete a cycle (on top of the 1 you always get)
//   taoGrowth      how much each tao you hold adds to the size of the bars: a share of the usual +10, so 0.5 makes it +5
// ----------------------------------------------------------------

var CARD_PACK_SIZE = 5;            // cards in a pack
var CARD_OPPOSITE_CHANCE = 0.15;  // chance each card in a pack is of the other colour
var CARD_SLOTS_MAX = 10;          // the loadout never holds more than this
var CARD_COLLECTION_MAX = 12;     // the collection holds at most this many cards (any rarity)

// Bonuses on one stat count in full up to +300%, and half beyond that.
var CARD_SOFTCAP_START = 3;
var CARD_SOFTCAP_RATE = 0.5;

// The maker/breaker check. 1 = the two sides are exactly in step. Within CARD_BALANCE_SOFT either way the loadout
// screen says nothing; beyond it, it warns; and "equip best" will not push a deck beyond CARD_BALANCE_HARD.
var CARD_BALANCE_SOFT = 1.5;
var CARD_BALANCE_HARD = 2.5;

// Stacking has no ceiling, but a price or cost that reaches zero would break the game, so these stop short of it.
// factoryGrowth and taoGrowth are shares of the usual growth: at 0.5 a factory still costs 1.2x the last (1.4 is
// normal), and each tao still adds at least +5 to the bars (+10 is normal). They are the game's main brakes, so they stop well short of flat.
var CARD_MULT_FLOOR = { machineCost: 0.01, marketingCost: 0.01, copperCost: 0.02, meritCost: 0.01, buyCooldown: 0, factoryGrowth: 0.5, taoGrowth: 0.5 };

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
  slotJackpot:   { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 80], [100, 150]] },
  slotSpeed:     { side: "black", kind: "mult", dir: "high", pct: [[10, 20], [25, 40], [50, 70], [80, 120]] },
  deposits:      { side: "black", kind: "add", sign: 1, step: 1, amount: [[2, 3], [3, 4], [5, 6], [8, 10]], int: true },
  // ---- white: enlightenment ----
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

// One card of a colour. opts: { karma, maxRarity, avoid } where avoid is a { key: true } map of effects already
// made, so a run of cards doesn't repeat itself. A legendary card has two effects: a legendary one, and a second at
// rare strength.
function cardMake(rng, side, opts) {
  opts = opts || {};
  var rarity = cardPickRarity(rng, opts.karma, opts.maxRarity);
  var pool = cardPool(side, rarity, opts.avoid, false);
  if (pool.length === 0) pool = cardPool(side, rarity, null, false); // every effect already used: allow a repeat rather than fail
  var chosen = pool[Math.floor(rng() * pool.length)];
  var effects = {};
  effects[chosen] = cardRollValue(rng, chosen, rarity);
  if (opts.avoid) opts.avoid[chosen] = true;

  if (rarity === 3) {
    var taken = {};
    taken[chosen] = true;
    var companions = cardPool(side, 2, taken, true);
    var second = companions[Math.floor(rng() * companions.length)];
    effects[second] = cardRollValue(rng, second, 2);
    if (opts.avoid) opts.avoid[second] = true;
  }
  return { side: side, rarity: rarity, effects: effects };
}

function cardOtherSide(side) { return side === "black" ? "white" : "black"; }

// The fork at the start of a rebirth: [black card, white card]. Plain cards only, like "20% cheaper machines".
function cardFork(seed, karma) {
  var rng = cardRng(seed, 0, 1);
  return [
    cardMake(rng, "black", { karma: karma, maxRarity: 1 }),
    cardMake(rng, "white", { karma: karma, maxRarity: 1 })
  ];
}

// Pack number `index` (1, 2, 3...) on a path: CARD_PACK_SIZE cards of the path's colour, each with a small chance of
// being of the other colour. The same seed, pack and path always give the same pack. Within a pack the effects
// don't repeat (while there are enough to go round), so five cards are five different things.
function cardPack(seed, index, path, karma) {
  var rng = cardRng(seed, 100 + index, path === "black" ? 2 : 3);
  var avoid = { black: {}, white: {} };
  var pack = [];
  for (var i = 0; i < CARD_PACK_SIZE; i++) {
    var side = rng() < CARD_OPPOSITE_CHANCE ? cardOtherSide(path) : path;
    pack.push(cardMake(rng, side, { karma: karma, avoid: avoid[side] }));
  }
  return pack;
}

// ---------------- the loadout ----------------

// How many cards you can carry: 2 + 1.5 x the square root of your karma, rounded down, at most CARD_SLOTS_MAX.
// (1 karma: 3, 2: 4, 4: 5, 9: 6, 16: 8, 25: 9, 36: 10.)
function cardSlots(karma) {
  return Math.min(CARD_SLOTS_MAX, 2 + Math.floor(1.5 * Math.sqrt(Math.max(0, karma || 0))));
}

// A deck holds one colour only (your path's), so no slot may hold the other colour. The collection can hold any
// colour. (Kept as a function so the rule is in one place.)
function cardOppositeAllowed(slots) {
  return 0;
}

function cardOppositeCount(deck, path) {
  var n = 0;
  deck.forEach(function (c) { if (c.side !== path) n++; });
  return n;
}

// Why `card` can't be added to `deck` right now, or null if it can. (Reference equality: the same copy can't go in twice.)
function cardLoadoutBlock(deck, card, slots, path) {
  if (deck.indexOf(card) >= 0) return "already equipped";
  if (deck.length >= slots) return "no free slot";
  if (card.side !== path) return "a " + path + " deck holds only " + path + " cards";
  return null;
}

// Strongest first, then black before white, then by what it does, so equal cards sit together.
function cardSorted(cards) {
  return cards.slice().sort(function (a, b) {
    if (b.rarity !== a.rarity) return b.rarity - a.rarity;
    if (a.side !== b.side) return a.side === "black" ? -1 : 1;
    var ka = Object.keys(a.effects).sort().join(","), kb = Object.keys(b.effects).sort().join(",");
    if (ka !== kb) return ka < kb ? -1 : 1;
    return JSON.stringify(a.effects) < JSON.stringify(b.effects) ? -1 : (JSON.stringify(a.effects) > JSON.stringify(b.effects) ? 1 : 0);
  });
}

// How far out of step a deck's makers and breakers are, as a number of 1 or more (1 = exactly in step).
function cardLean(deck) {
  var r = cardBalance(deck).ratio;
  return r >= 1 ? r : 1 / r;
}

// "Equip best": fills the slots from `cards`. Rarer is better, your own colour beats the other, and an effect the
// deck doesn't have yet beats a repeat (cards add up within a stat, so variety is worth more). A first pass refuses
// any card that would push the makers and breakers past CARD_BALANCE_HARD; a second pass fills what is left.
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

// How many of the card's effects the deck doesn't have yet.
function cardNewEffects(card, deck) {
  var n = 0;
  for (var key in card.effects) {
    if (!deck.some(function (c) { return c.effects[key] !== undefined; })) n++;
  }
  return n;
}

// How good a card looks for a deck: rarer is better, your own colour beats the other, a new effect beats a repeat.
function cardScoreIn(card, deck, path) {
  return card.rarity * 10 + (card.side === path ? 5 : 0) + 3 * cardNewEffects(card, deck);
}

// Whether adding `card` keeps the makers and breakers in step (or at least no further out of step than they are).
function cardLeanOk(deck, card) {
  var after = cardLean(deck.concat([card]));
  return after <= CARD_BALANCE_HARD || after <= cardLean(deck);
}

// What "open all" does with one pack. st = { kept } (changed in place). It only ever banks legendary cards, and only
// into EMPTY collection places: it never touches the deck, never swaps anything out, and a legendary that finds the
// collection full is simply left (it is gone with the pack). Returns { banked }.
function cardAutoPack(pack, st) {
  var stats = { banked: 0 };
  pack.forEach(function (c) {
    if (c.rarity === 3 && st.kept.length < CARD_COLLECTION_MAX) { st.kept.push(c); stats.banked++; }
  });
  return stats;
}

// ---------------- the deck ----------------

// The colour of the deck (a deck holds one): "black", "white", or null for no cards. (Resonance, a white-card feature, makes tao: resonance.js.)
function cardDeckSide() {
  var deck = cardDeck();
  return deck.length ? deck[0].side : null;
}

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

// How many packs a rebirth opens: one for every karma you hold in total (at least one).
function cardPackCount(karmaTotal) {
  return Math.max(1, Math.floor(karmaTotal || 0));
}

// A new life's seed. Kept in the save, so the same life always offers the same cards.
function cardNewSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

// A card made of anything but real effects is dropped; otherwise a clean copy (keeping its id, if it has one).
function cardClean(card) {
  if (!card || (card.side !== "black" && card.side !== "white") || !card.effects || typeof card.effects !== "object") return null;
  var effects = {}, any = false;
  for (var key in card.effects) {
    var v = card.effects[key];
    var def = CARD_EFFECTS[key];
    if (def && typeof v === "number" && isFinite(v) && Math.abs(v) < 1000 && (def.kind !== "mult" || v > 0)) { effects[key] = v; any = true; } // (a multiplier is always above zero; this also drops the old additive growth cards)
  }
  if (!any) return null;
  var out = { side: card.side, rarity: Math.max(0, Math.min(3, Math.floor(card.rarity) || 0)), effects: effects };
  if (typeof card.id === "number" && isFinite(card.id) && card.id >= 1) out.id = Math.floor(card.id);
  return out;
}

// Locks in a rebirth: gives an id to every card in the deck or the collection that doesn't have one yet, makes `kept`
// the new state.collection (at most CARD_COLLECTION_MAX), and returns the deck (copies of the equipped cards, each
// with its id) for state.deck. Everything else is simply gone.
function cardsCommit(equipped, kept) {
  if (typeof state.cardSerial !== "number" || !(state.cardSerial >= 1)) state.cardSerial = 1;
  equipped.concat(kept).forEach(function (c) { if (c.id === undefined) c.id = state.cardSerial++; });
  state.collection = kept.slice(0, CARD_COLLECTION_MAX).map(function (c) { return { id: c.id, side: c.side, rarity: c.rarity, effects: c.effects }; });
  return equipped.map(function (c) { return { id: c.id, side: c.side, rarity: c.rarity, effects: c.effects }; });
}

// Keeps a loaded save honest: cards made of anything but real effects are cleaned or dropped, every card gets a
// unique id, a card is in the deck or the collection but not both (the deck wins), the deck fits CARD_SLOTS_MAX and
// the collection CARD_COLLECTION_MAX, the seed is made if missing, and the old skill tree and lands (which no longer
// exist) are removed.
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
    if (c.id !== undefined && seen[c.id]) return;   // the same card twice
    if (c.id === undefined) c.id = serial++;
    seen[c.id] = true;
    keptDeck.push(c);
  });
  // A deck holds one colour: the one most of it is (black if level). The rest go to the collection.
  var blacks = keptDeck.filter(function (c) { return c.side === "black"; }).length;
  var deckSide = blacks >= keptDeck.length - blacks ? "black" : "white";
  var wrongColour = keptDeck.filter(function (c) { return c.side !== deckSide; });
  keptDeck = keptDeck.filter(function (c) { return c.side === deckSide; });
  wrongColour.forEach(function (c) { delete seen[c.id]; });
  collection = wrongColour.concat(collection);
  var keptCollection = [];
  collection.forEach(function (c) {
    if (c.id !== undefined && seen[c.id]) return;   // already in the deck (older saves kept a copy in both)
    if (c.id === undefined) c.id = serial++;
    seen[c.id] = true;
    keptCollection.push(c);
  });

  state.deck = keptDeck.slice(0, CARD_SLOTS_MAX);
  state.collection = keptCollection.slice(0, CARD_COLLECTION_MAX);
  state.cardSerial = serial;
  if (typeof state.draftSeed !== "number" || !isFinite(state.draftSeed)) state.draftSeed = cardNewSeed();
}
