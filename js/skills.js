"use strict";

// ----------------------------------------------------------------
// The skill tree (replaces the old lands). Karma is the currency: every karma
// you have banked is SKILL_POINTS_PER_KARMA skill points to spend here. Karma
// itself is never spent, so the community's room and the road to Nirvana are
// untouched; only your skill points go down when you learn something.
//
// The tree grows from one middle node, where everyone starts. Under it is ONE node
// (greed) and above it is ONE node (enlightenment). Learn either and it branches into
// four more, and each of those branches on again:
//
//   DOWN  greed           the machine: cheaper machines, cheaper marketing,
//                         more demand, better prices, more ore.
//   UP    enlightenment   tao, karma and the community: stronger tao, faster
//                         yin & yang, a faster community, more karma.
//
// A life follows ONE of the two. You only ever see what you have learned and the
// next step off it: a node stays hidden until the node it grows from is learned.
//
// The tree is only open at reincarnation (the screen after the ritual, see
// reincarnation.js and skillsui.js): that is when you spend your points, or take
// them back and spend them differently. Skills persist across lives and are wiped,
// with everything else, when you end a run.
//
// Nothing is granted when you learn a node: the game just asks skillMult() and
// skillAdd() whenever it works something out (the same trick the lands used), so
// a skill can never leave the game in a half-built state. The text shown to the
// player is generated from the numbers below, so the screen and the maths can't
// disagree.
//
// An effect is one of two kinds:
//   mult  a multiplier, 1 = no change; several nodes multiply together
//   add   a number added to something; several nodes add together
//
//   machineCost    price of makers, breakers and factories
//   copperCost     copper a factory cycle uses
//   marketingCost  price of marketing levels
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
//
// Every node names the node it grows from (req). The middle node is "root" and everyone
// holds it. The list order of a node's children is their left-to-right order on screen;
// where each node sits is worked out from that (skillLayout below).
// ----------------------------------------------------------------

var SKILL_POINTS_PER_KARMA = 3;

var SKILL_ROOT = { id: "root", name: "the middle", cost: 0, effects: {} };

var SKILL_NODES = [
  // ---- DOWN: greed ----
  { id: "gate_greed",   name: "greed",        req: "root",         cost: 1, effects: { saleMult: 1.05 } },
  // production
  { id: "overtime",     name: "overtime",     req: "gate_greed",   cost: 2, effects: { makerSpeed: 1.15 } },
  { id: "sharper",      name: "sharper nails", req: "overtime",    cost: 3, effects: { breakerSpeed: 1.2 } },
  { id: "doubleshift",  name: "double shift", req: "sharper",      cost: 4, effects: { makerSpeed: 1.3 } },
  // marketing and demand
  { id: "billboards",   name: "billboards",   req: "gate_greed",   cost: 1, effects: { marketingCost: 0.85 } },
  { id: "jingles",      name: "jingles",      req: "billboards",   cost: 2, effects: { demandMult: 1.15 } },
  { id: "loyalty",      name: "brand loyalty", req: "jingles",     cost: 3, effects: { marketingCost: 0.8 } },
  { id: "hysteria",     name: "mass hysteria", req: "loyalty",     cost: 5, effects: { demandMult: 1.4 } },
  // machinery
  { id: "haggling",     name: "haggling",     req: "gate_greed",   cost: 1, effects: { machineCost: 0.9 } },
  { id: "bulk",         name: "bulk orders",  req: "haggling",     cost: 2, effects: { machineCost: 0.85 } },
  { id: "contracts",    name: "contracts",    req: "bulk",         cost: 3, effects: { factoryGrowth: -0.05 } },
  { id: "cheapcopper",  name: "cheap copper", req: "contracts",    cost: 4, effects: { copperCost: 0.8 } },
  { id: "machines",     name: "machines for machines", req: "cheapcopper", cost: 6, effects: { factoryGrowth: -0.1 } },
  // trade, which splits into prices and ore
  { id: "fairprices",   name: "fair prices",  req: "gate_greed",   cost: 1, effects: { saleMult: 1.1 } },
  { id: "premium",      name: "premium brand", req: "fairprices",  cost: 2, effects: { saleMult: 1.15 } },
  { id: "cartel",       name: "cartel",       req: "premium",      cost: 3, effects: { saleMult: 1.25 } },
  { id: "pricefixing",  name: "price fixing", req: "cartel",       cost: 5, effects: { saleMult: 1.5 } },
  { id: "prospecting",  name: "prospecting",  req: "premium",      cost: 2, effects: { deposits: 3 } },
  { id: "deepveins",    name: "deep veins",   req: "prospecting",  cost: 3, effects: { deposits: 5 } },
  { id: "stripmining",  name: "strip mining", req: "deepveins",    cost: 4, effects: { deposits: 7 } },

  // ---- UP: enlightenment ----
  { id: "gate_light",   name: "enlightenment", req: "root",        cost: 1, effects: { yinYangSpeed: 1.1 } },
  // lightness: tao gets dearer more gently
  { id: "lighter",      name: "light load",   req: "gate_light",   cost: 2, effects: { taoGrowth: -0.01 } },
  { id: "lighter2",     name: "lighter still", req: "lighter",     cost: 5, effects: { taoGrowth: -0.01 } },
  { id: "lighter3",     name: "weightless",   req: "lighter2",     cost: 8, effects: { taoGrowth: -0.01 } },
  // flow: the yin & yang bars
  { id: "slowbreath",   name: "slow breath",  req: "gate_light",   cost: 1, effects: { yinYangSpeed: 1.15 } },
  { id: "deepbreath",   name: "deep breath",  req: "slowbreath",   cost: 2, effects: { yinYangSpeed: 1.25 } },
  { id: "river",        name: "flowing river", req: "deepbreath",  cost: 3, effects: { yinYangSpeed: 1.4 } },
  { id: "stream",       name: "unbroken stream", req: "river",     cost: 5, effects: { yinYangSpeed: 1.8 } },
  // tao
  { id: "stillwater",   name: "still water",  req: "gate_light",   cost: 1, effects: { taoRate: 1.2 } },
  { id: "openhand",     name: "open hand",    req: "stillwater",   cost: 2, effects: { taoDemand: 1.25 } },
  { id: "emptymind",    name: "empty mind",   req: "openhand",     cost: 3, effects: { taoRate: 1.3 } },
  { id: "middleway",    name: "the middle way", req: "emptymind",  cost: 5, effects: { taoDemand: 1.5 } },
  { id: "bodhi",        name: "bodhi",        req: "middleway",    cost: 8, effects: { taoRate: 1.5, taoDemand: 1.5 } },
  // community, which splits into speed and karma
  { id: "opendoor",     name: "open door",    req: "gate_light",   cost: 1, effects: { communitySpeed: 1.15 } },
  { id: "sharedtable",  name: "shared table", req: "opendoor",     cost: 2, effects: { communityRoom: 2 } },
  { id: "chanting",     name: "chanting",     req: "sharedtable",  cost: 3, effects: { communitySpeed: 1.3 } },
  { id: "assembly",     name: "great assembly", req: "chanting",   cost: 5, effects: { communitySpeed: 1.6 } },
  { id: "meritmaking",  name: "merit-making", req: "sharedtable",  cost: 3, effects: { meritCost: 0.9 } },
  { id: "compassion",   name: "compassion",   req: "meritmaking",  cost: 4, effects: { karmaGain: 1 } },
  { id: "perfectgift",  name: "perfect giving", req: "compassion", cost: 8, effects: { karmaGain: 1 } }
];

// text for each effect. mult: whether a higher number is good for the player, and the words for up and down.
function skillPct(n) { return String(Math.round(Math.abs(n) * 100)); }

var SKILL_EFFECT_TEXT = {
  machineCost:   { kind: "mult", goodWhen: "low",  up: "machines {p}% dearer",            down: "machines {p}% cheaper" },
  copperCost:    { kind: "mult", goodWhen: "low",  up: "factory copper cost {p}% higher", down: "factory copper cost {p}% lower" },
  marketingCost: { kind: "mult", goodWhen: "low",  up: "marketing {p}% dearer",           down: "marketing {p}% cheaper" },
  saleMult:      { kind: "mult", goodWhen: "high", up: "nails sell for {p}% more",        down: "nails sell for {p}% less" },
  demandMult:    { kind: "mult", goodWhen: "high", up: "public demand {p}% higher",       down: "public demand {p}% lower" },
  breakerSpeed:  { kind: "mult", goodWhen: "high", up: "breakers {p}% faster",            down: "breakers {p}% slower" },
  makerSpeed:    { kind: "mult", goodWhen: "high", up: "nail makers {p}% faster",         down: "nail makers {p}% slower" },
  yinYangSpeed:  { kind: "mult", goodWhen: "high", up: "yin & yang {p}% faster",          down: "yin & yang {p}% slower" },
  taoRate:       { kind: "mult", goodWhen: "high", up: "each tao's speed bonus {p}% stronger",  down: "each tao's speed bonus {p}% weaker" },
  taoDemand:     { kind: "mult", goodWhen: "high", up: "each tao's demand bonus {p}% stronger", down: "each tao's demand bonus {p}% weaker" },
  communitySpeed: { kind: "mult", goodWhen: "high", up: "community makes merit {p}% faster", down: "community makes merit {p}% slower" },
  meritCost:     { kind: "mult", goodWhen: "low",  up: "the community needs {p}% more merit per tao", down: "the community needs {p}% less merit per tao" },
  deposits:      { kind: "add",  text: function (n) { return "+" + n + " deposits on every map"; } },
  factoryGrowth: { kind: "add",  text: function (n) { return "each factory is " + skillPct(n) + " points less dearer than the last"; } },
  communityRoom: { kind: "add",  text: function (n) { return "room for " + n + " more community members"; } },
  karmaGain:     { kind: "add",  text: function (n) { return "+" + n + " karma every reincarnation"; } },
  taoGrowth:     { kind: "add",  text: function (n) { return "each tao is " + skillPct(n) + " point less dearer than the last"; } }
};

// ---------------- lookups ----------------

var skillIndex = {};
SKILL_NODES.forEach(function (n) { skillIndex[n.id] = n; });

// Where every node sits, worked out once from the tree itself: side ("up" or "down"), depth (steps from
// the middle) and col (left-right, in column widths). A node with one child sits straight above/below it;
// one with several sits in the middle of them; each side is then centred on the middle node. The hidden
// nodes still have a place, so what you can see never jumps about as more is revealed.
function skillLayout() {
  var kids = {};
  SKILL_NODES.forEach(function (n) { (kids[n.req] = kids[n.req] || []).push(n); });
  var slot = 0;
  function place(n, side, depth) {
    n.side = side;
    n.depth = depth;
    var list = kids[n.id] || [];
    if (list.length === 0) { n.col = slot++; return; }
    list.forEach(function (c) { place(c, side, depth + 1); });
    n.col = (list[0].col + list[list.length - 1].col) / 2;
  }
  function shift(n, by) {
    n.col -= by;
    (kids[n.id] || []).forEach(function (c) { shift(c, by); });
  }
  (kids.root || []).forEach(function (gate) {
    slot = 0;
    place(gate, gate.id === "gate_light" ? "up" : "down", 1);
    shift(gate, gate.col); // the gateway sits right above/below the middle
  });
  SKILL_ROOT.side = null; SKILL_ROOT.depth = 0; SKILL_ROOT.col = 0;
}
skillLayout();

function skillNodeById(id) {
  return id === "root" ? SKILL_ROOT : (skillIndex[id] || null);
}

// "up" or "down" for a node; the middle belongs to neither.
function skillNodeSide(node) {
  return node.side || null;
}

// What the player can see: the middle, the two gateways, everything learned, and the next step off
// each learned node. Everything deeper is hidden until the node before it is learned.
function skillVisible(node) {
  if (node.id === "root" || node.req === "root") return true;
  return skillHas(node.id) || skillHas(node.req);
}

function skillOwned() {
  return (typeof state !== "undefined" && state && Array.isArray(state.skills)) ? state.skills : [];
}

function skillHas(id) {
  return id === "root" || skillOwned().indexOf(id) !== -1;
}

// The product and the sum of everything owned, kept until the list of owned skills changes
// (these are asked for several times a tick).
var skillCache = { sig: null, mult: {}, add: {} };

function skillTotals() {
  var owned = skillOwned();
  var sig = owned.join("|");
  if (sig === skillCache.sig) return skillCache;
  var mult = {}, add = {};
  owned.forEach(function (id) {
    var node = skillIndex[id];
    if (!node) return;
    for (var key in node.effects) {
      var spec = SKILL_EFFECT_TEXT[key];
      var v = node.effects[key];
      if (!spec || typeof v !== "number") continue;
      if (spec.kind === "mult") mult[key] = (mult[key] === undefined ? 1 : mult[key]) * v;
      else add[key] = (add[key] || 0) + v;
    }
  });
  skillCache = { sig: sig, mult: mult, add: add };
  return skillCache;
}

function skillMult(key) {
  var v = skillTotals().mult[key];
  return typeof v === "number" ? v : 1;
}

function skillAdd(key) {
  var v = skillTotals().add[key];
  return typeof v === "number" ? v : 0;
}

// [[text, isGood], ...] for one node, good ones first.
function skillEffectLines(node) {
  var lines = [];
  for (var key in node.effects) {
    var t = SKILL_EFFECT_TEXT[key];
    var v = node.effects[key];
    if (!t || typeof v !== "number") continue;
    if (t.kind === "mult") {
      if (v === 1) continue;
      var up = v > 1;
      lines.push([(up ? t.up : t.down).replace("{p}", skillPct(v - 1)), (t.goodWhen === "high") === up]);
    } else {
      lines.push([t.text(v), true]);
    }
  }
  lines.sort(function (a, b) { return (b[1] ? 1 : 0) - (a[1] ? 1 : 0); });
  return lines;
}

// ---------------- points ----------------

// The karma a reincarnation in progress is about to add. It is only banked when you press "begin new life"
// (reincarnation.js), so that leaving or reloading mid-ritual can't keep the karma and the old life too; until
// then the tree already counts it, so you can spend it.
var skillKarmaPending = 0;

function skillPointsTotal() {
  var karma = (typeof state !== "undefined" && state && state.karma) || 0;
  return SKILL_POINTS_PER_KARMA * Math.max(0, Math.floor(karma + skillKarmaPending));
}

function skillPointsSpent() {
  var sum = 0;
  skillOwned().forEach(function (id) { var n = skillIndex[id]; if (n) sum += n.cost; });
  return sum;
}

function skillPointsFree() {
  return skillPointsTotal() - skillPointsSpent();
}

// Which way this life has gone: "up", "down", or null while nothing is learned.
function skillDirection() {
  var dir = null;
  skillOwned().forEach(function (id) {
    var n = skillIndex[id];
    var side = n ? skillNodeSide(n) : null;
    if (side) dir = side;
  });
  return dir;
}

// Why a node can't be learned right now ("" = it can). Used by the screen to dim nodes and by learn().
function skillLearnBlock(id) {
  var node = skillNodeById(id);
  if (!node || id === "root") return "not a skill";
  if (skillHas(id)) return "learned";
  if (!skillHas(node.req)) return "needs " + skillNodeById(node.req).name;
  var dir = skillDirection();
  if (dir && dir !== skillNodeSide(node)) return "closed: you follow the " + (dir === "up" ? "enlightened" : "greedy") + " path";
  if (skillPointsFree() < node.cost) return "needs " + node.cost + " skill point" + (node.cost === 1 ? "" : "s");
  return "";
}

// A learned node can be taken back as long as nothing learned stands on it.
function skillCanTakeBack(id) {
  if (id === "root" || !skillHas(id)) return false;
  return !skillOwned().some(function (other) { var n = skillIndex[other]; return n && n.req === id; });
}

function skillLearn(id) {
  if (skillLearnBlock(id)) return false;
  state.skills = skillOwned().concat([id]);
  return true;
}

function skillTakeBack(id) {
  if (!skillCanTakeBack(id)) return false;
  state.skills = skillOwned().filter(function (other) { return other !== id; });
  return true;
}

function skillTakeBackAll() {
  state.skills = [];
}

// Keeps a loaded save honest: unknown nodes, nodes whose parent is missing, a mix of both
// directions, or more spent than karma allows are dropped (the later ones first).
function skillNormalize() {
  var list = Array.isArray(state.skills) ? state.skills : [];
  var kept = [];
  var dir = null, spent = 0, budget = skillPointsTotal();
  list.forEach(function (id) {
    var n = skillIndex[id];
    if (!n || kept.indexOf(id) !== -1) return;
    if (n.req !== "root" && kept.indexOf(n.req) === -1) return;
    var side = skillNodeSide(n);
    if (dir && side !== dir) return;
    if (spent + n.cost > budget) return;
    if (side) dir = side;
    spent += n.cost;
    kept.push(id);
  });
  state.skills = kept;
  delete state.region; // the lands are gone
}
