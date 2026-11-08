"use strict";

var FLOOR_UNLOCK_FACTORIES = 10;
var FLOOR_SIZES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
var FLOOR_EXPAND_COSTS = FLOOR_SIZES.map(function (n, i) {
  return i === 0 ? null : { funds: 0, nails: 0, copper: 1e6 * Math.pow(5, i - 1) };
});
var FLOOR_WIRE_REACH = 3;
var MODULE_SELL_REFUND = 0.75;
var MODULE_PRICE_GROWTH = 1.5;
var MODULE_COOLER_BONUS = 0.5;
var MODULE_COOLER_MAX = 2;
var MODULE_CAPS = { speed: 3, copper: 0.6, price: 0.5, makerYield: 5, breakerYield: 5 };

var MODULES = {
  battery: { name: "battery",         code: "B", w: 2, h: 2, price: 1.6e5, effect: null, what: "powers every part wired into the same network" },
  press:   { name: "copper press",    code: "P", w: 1, h: 2, price: 4e5, effect: "copper",       amount: 0.06, boosted: true, what: "each cycle costs {n} less copper" },
  table:   { name: "blueprint table", code: "T", w: 2, h: 1, price: 1e6, effect: "price",        amount: 0.04,                what: "new factories cost {n} less" },
  processor: { name: "maker chip",    code: "MKR", w: 1, h: 1, price: 60, copper: true, tiered: true, effect: "makerYield", amount: 0.05, what: "each factory cycle builds {n} more nail makers" },
  replicator: { name: "replicator", code: "REP", w: 5, h: 5, price: 5e4, copper: true, tiered: false, effect: null, limit: 1, what: "slowly turns copper into new factories while it is powered" },
  controller: { name: "controller",  code: "CTL", w: 1, h: 1, price: 0, copper: true, tiered: false, effect: null, what: "every part needs a wire path to the controller and to a battery to work" },
  memory:  { name: "breaker chip",   code: "BRK", w: 1, h: 1, price: 40, copper: true, tiered: true, effect: "breakerYield", amount: 0.05, what: "each factory cycle builds {n} more nail breakers" }
};
var MODULE_ORDER = ["battery", "press", "table", "replicator", "processor", "memory", "controller"];
var REPLICATOR_FILL_SEC = 30;
var REPLICATOR_COPPER_PER_CYCLE = 300;
var REPLICATOR_COST_GROWTH = 1.15;
var FLOOR_CHIP_BOOST = 2;

function floorSize() {
  var tier = Math.max(1, Math.min(FLOOR_SIZES.length, Math.floor(state.floorTier || 1)));
  return FLOOR_SIZES[tier - 1];
}

function moduleDims(type, rot) {
  var def = MODULES[type];
  return rot ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

function moduleCells(m) {
  var d = moduleDims(m.type, m.rot);
  var cells = [];
  for (var dy = 0; dy < d.h; dy++) for (var dx = 0; dx < d.w; dx++) cells.push([m.x + dx, m.y + dy]);
  return cells;
}

function floorOccupancy(skipId) {
  var n = floorSize();
  var grid = [];
  for (var y = 0; y < n; y++) { grid.push([]); for (var x = 0; x < n; x++) grid[y].push(0); }
  var mods = state.modules || [];
  for (var i = 0; i < mods.length; i++) {
    if (mods[i].id === skipId) continue;
    var cells = moduleCells(mods[i]);
    for (var c = 0; c < cells.length; c++) {
      if (grid[cells[c][1]] && grid[cells[c][1]][cells[c][0]] !== undefined) grid[cells[c][1]][cells[c][0]] = mods[i].id;
    }
  }
  return grid;
}

function modulesTouch(a, b) {
  var ca = moduleCells(a), cb = moduleCells(b);
  for (var i = 0; i < ca.length; i++) for (var j = 0; j < cb.length; j++) {
    if (Math.abs(ca[i][0] - cb[j][0]) + Math.abs(ca[i][1] - cb[j][1]) === 1) return true;
  }
  return false;
}

function canPlaceModule(type, rot, x, y, skipId) {
  var n = floorSize();
  var d = moduleDims(type, rot);
  if (x < 0 || y < 0 || x + d.w > n || y + d.h > n) return false;
  var grid = floorOccupancy(skipId);
  for (var dy = 0; dy < d.h; dy++) for (var dx = 0; dx < d.w; dx++) {
    if (grid[y + dy][x + dx]) return false;
  }
  return true;
}

function coolersTouching(m, coolers) {
  var n = 0;
  for (var i = 0; i < coolers.length; i++) if (modulesTouch(m, coolers[i])) n++;
  return Math.min(MODULE_COOLER_MAX, n);
}

function floorController() {
  var mods = state.modules || [];
  for (var i = 0; i < mods.length; i++) if (mods[i].type === "controller") return mods[i];
  return null;
}

function floorWorking() {
  var mods = state.modules || [];
  var parent = {};
  mods.forEach(function (m) { parent[m.id] = m.id; });
  var find = function (x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  (state.wires || []).forEach(function (w) {
    if (parent[w[0]] === undefined || parent[w[1]] === undefined) return;
    parent[find(w[0])] = find(w[1]);
  });
  var net = {};
  mods.forEach(function (m) {
    var r = find(m.id);
    var n = net[r] || (net[r] = { battery: false, controller: false });
    if (m.type === "battery") n.battery = true;
    if (m.type === "controller") n.controller = true;
  });
  var out = {};
  mods.forEach(function (m) { var n = net[find(m.id)]; out[m.id] = n.battery && n.controller; });
  return out;
}

function floorPowered(m) {
  return !!floorWorking()[m.id];
}

function floorPortLimit(id) {
  var m = floorFindModule(id);
  if (!m) return 0;
  if (m.type === "controller") return 3 + Math.max(1, Math.floor(state.floorTier || 1));
  var def = MODULES[m.type];
  return Math.max(2, Math.min(4, def.w * def.h));
}

function floorGap(a, b) {
  var ca = moduleCells(a), cb = moduleCells(b), best = 99;
  for (var i = 0; i < ca.length; i++) for (var j = 0; j < cb.length; j++) {
    best = Math.min(best, Math.abs(ca[i][0] - cb[j][0]) + Math.abs(ca[i][1] - cb[j][1]) - 1);
  }
  return best;
}

function moduleBonuses() {
  var out = { speed: 0, copper: 0, price: 0, makerYield: 0, breakerYield: 0 };
  var mods = state.modules || [];
  if (mods.length === 0) return out;
  var coolers = mods.filter(function (m) { return m.type === "cooler"; });
  var work = floorWorking();
  for (var i = 0; i < mods.length; i++) {
    var def = MODULES[mods[i].type];
    if (!def || !def.effect) continue;
    if (!work[mods[i].id]) continue;
    var amount = def.amount;
    if (def.tiered) amount *= Math.pow(FLOOR_CHIP_BOOST, floorTierOf(mods[i]) - 1);
    if (def.boosted) amount *= 1 + MODULE_COOLER_BONUS * coolersTouching(mods[i], coolers);
    out[def.effect] += amount;
  }
  for (var k in MODULE_CAPS) out[k] = Math.min(MODULE_CAPS[k], out[k]);
  return out;
}

function moduleSpeedMult() { return 1 + moduleBonuses().speed; }
function moduleCopperSave() { return moduleBonuses().copper; }
function moduleFactoryDiscount() { return moduleBonuses().price; }

function moduleOwnedCount(type) {
  var n = 0, i;
  for (i = 0; i < state.modules.length; i++) if (state.modules[i].type === type) n++;
  for (i = 0; i < state.moduleStock.length; i++) if (state.moduleStock[i].type === type) n++;
  return n;
}

function modulePrice(type, tier) {
  if (MODULES[type].tiered) {
    tier = tier || 1;
    return MODULES[type].price * Math.pow(AI_TILE_TIER_PRICE, tier - 1) * Math.pow(AI_TILE_PRICE_GROWTH, (state.aiBought && state.aiBought[type + ":" + tier]) || 0);
  }
  return MODULES[type].price * Math.pow(MODULE_PRICE_GROWTH, moduleOwnedCount(type));
}

var floorTip = null;

function floorChipAmount(type, tier) { return MODULES[type].amount * Math.pow(FLOOR_CHIP_BOOST, (tier || 1) - 1); }

function floorPartTip(type, tier) {
  var def = MODULES[type];
  var amount = def.tiered ? floorChipAmount(type, tier) : def.amount;
  var what = def.what.replace("{n}", Math.round(amount * 100) + "%");
  return [def.name + (def.tiered ? " \u00b7 tier " + tier : ""), what];
}

function floorTipShow(ev, lines) {
  if (!floorTip) {
    floorTip = document.createElement("div");
    floorTip.style.cssText = "position:fixed;z-index:100000;pointer-events:none;font-size:10px;line-height:1.3;padding:2px 6px;border:1px solid var(--ink);background:var(--paper);color:var(--ink);white-space:nowrap;";
    document.body.appendChild(floorTip);
  }
  floorTip.textContent = "";
  var a = document.createElement("div");
  a.textContent = lines[0];
  a.style.opacity = "0.6";
  var b = document.createElement("div");
  b.textContent = lines[1];
  floorTip.appendChild(a);
  floorTip.appendChild(b);
  floorTip.style.display = "block";
  floorTipMove(ev);
}

function floorTipMove(ev) {
  if (!floorTip) return;
  floorTip.style.left = (ev.clientX + 12) + "px";
  floorTip.style.top = (ev.clientY + 14) + "px";
}

function floorTipHide() {
  if (floorTip) floorTip.style.display = "none";
}

function floorTierOf(o) {
  if (!MODULES[o.type] || !MODULES[o.type].tiered) return 1;
  return Math.max(1, Math.min(AI_MAX_TIER, Math.floor(o.tier) || 1));
}

function floorNormalize() {
  if (!Array.isArray(state.modules)) state.modules = [];
  if (!Array.isArray(state.moduleStock)) state.moduleStock = [];
  [state.modules, state.moduleStock].forEach(function (list) {
    list.forEach(function (o) {
      if (o && !MODULES[o.type] && (o.type === "maker" || o.type === "breaker" || o.type === "cooler")) state.funds += Number(o.paid) || 0;
    });
  });
  if (!state.aiSeen || typeof state.aiSeen !== "object") state.aiSeen = {};
  state.floorTier = Math.max(1, Math.min(FLOOR_SIZES.length, Math.floor(state.floorTier || 1)));
  state.moduleStock = state.moduleStock.filter(function (s) { return s && MODULES[s.type]; })
    .map(function (s) { var o = { type: s.type, tier: floorTierOf(s), paid: Number(s.paid) || 0 }; return o; });
  if (!state.aiBought || typeof state.aiBought !== "object") state.aiBought = {};

  var kept = [];
  var maxId = 0;
  var all = state.modules;
  state.modules = [];
  for (var i = 0; i < all.length; i++) {
    var m = all[i];
    if (!m || !MODULES[m.type]) continue;
    var rot = m.rot ? 1 : 0;
    if (!canPlaceModule(m.type, rot, Math.floor(m.x), Math.floor(m.y))) continue;
    if (m.type === "controller" && state.modules.some(function (k) { return k.type === "controller"; })) { state.copperAmt = (state.copperAmt || 0) + (Number(m.paid) || 0); continue; }
    var clean = { id: Math.floor(m.id) || 0, type: m.type, x: Math.floor(m.x), y: Math.floor(m.y), rot: rot, tier: floorTierOf(m), paid: Number(m.paid) || 0 };
    if (m.type === "replicator" && typeof m.progress === "number" && isFinite(m.progress)) clean.progress = Math.max(0, Math.min(1, m.progress));
    if (!clean.id || kept.some(function (k) { return k.id === clean.id; })) clean.id = maxId + 1;
    maxId = Math.max(maxId, clean.id);
    kept.push(clean);
    state.modules.push(clean);
  }
  state.moduleNextId = Math.max(Math.floor(state.moduleNextId || 1), maxId + 1);
  if (state.aiOwned) floorEnsureController();
  floorCleanWires();
}

function floorCleanWires() {
  var ids = {};
  state.modules.forEach(function (m) { ids[m.id] = m; });
  var seen = {}, count = {}, out = [];
  (Array.isArray(state.wires) ? state.wires : []).forEach(function (w) {
    if (!Array.isArray(w) || w.length < 2) return;
    var a = ids[w[0]], b = ids[w[1]];
    if (!a || !b || !floorCanWire(a, b)) return;
    var key = Math.min(a.id, b.id) + "-" + Math.max(a.id, b.id);
    if (seen[key]) return;
    if ((count[a.id] || 0) >= floorPortLimit(a.id) || (count[b.id] || 0) >= floorPortLimit(b.id)) return;
    seen[key] = true;
    count[a.id] = (count[a.id] || 0) + 1;
    count[b.id] = (count[b.id] || 0) + 1;
    out.push([a.id, b.id]);
  });
  state.wires = out;
}

function floorCanWire(a, b) {
  if (!a || !b || a.id === b.id) return false;
  return floorGap(a, b) <= FLOOR_WIRE_REACH;
}

function floorWireCount(id) {
  var n = 0;
  (state.wires || []).forEach(function (w) { if (w[0] === id || w[1] === id) n++; });
  return n;
}

function floorIsWired(a, b) {
  return (state.wires || []).some(function (w) { return (w[0] === a && w[1] === b) || (w[0] === b && w[1] === a); });
}

function floorUnwire(id) {
  state.wires = (state.wires || []).filter(function (w) { return w[0] !== id && w[1] !== id; });
}

function floorFindModule(id) {
  for (var i = 0; i < state.modules.length; i++) if (state.modules[i].id === id) return state.modules[i];
  return null;
}

function floorToggleWire(aId, bId) {
  var a = floorFindModule(aId), b = floorFindModule(bId);
  if (!a || !b || a.id === b.id) return false;
  if (floorIsWired(aId, bId)) {
    state.wires = state.wires.filter(function (w) { return !((w[0] === aId && w[1] === bId) || (w[0] === bId && w[1] === aId)); });
    return true;
  }
  if (!floorCanWire(a, b)) { floorSetHint("too far apart. a wire reaches " + FLOOR_WIRE_REACH + " cells"); return false; }
  if (floorWireCount(aId) >= floorPortLimit(aId)) { floorSetHint("the " + MODULES[a.type].name + " has no free ports"); return false; }
  if (floorWireCount(bId) >= floorPortLimit(bId)) { floorSetHint("the " + MODULES[b.type].name + " has no free ports"); return false; }
  state.wires.push([aId, bId]);
  return true;
}

function floorFreeSpot(type) {
  var n = floorSize();
  for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (canPlaceModule(type, 0, x, y)) return { x: x, y: y };
  return null;
}

function floorEnsureController() {
  if (floorController()) return;
  if (state.moduleStock.some(function (s) { return s.type === "controller"; })) return;
  var spot = floorFreeSpot("controller");
  if (!spot) return;
  state.modules.push({ id: state.moduleNextId++, type: "controller", x: spot.x, y: spot.y, rot: 0, tier: 1, paid: 0 });
}

function floorMigratePipeline() {
  if (state.mbWired) return;
  state.mbWired = true;
  floorNormalize();
  floorEnsureController();
}

function replicatorCost() {
  return REPLICATOR_COPPER_PER_CYCLE * factoryCopperCostEffective() * Math.pow(REPLICATOR_COST_GROWTH, state.autoFactories || 0);
}

function floorTick(dt) {
  var mods = state.modules;
  if (!mods || !mods.length) return;
  var work = null;
  for (var i = 0; i < mods.length; i++) {
    var m = mods[i];
    if (m.type !== "replicator") continue;
    work = work || floorWorking();
    if (!work[m.id]) continue;
    var cost = replicatorCost();
    if (!(cost > 0)) continue;
    var take = Math.min(cost / REPLICATOR_FILL_SEC * dt, state.copperAmt, (1 - (m.progress || 0)) * cost);
    if (take <= 0) continue;
    state.copperAmt -= take;
    m.progress = (m.progress || 0) + take / cost;
    if (m.progress >= 1 - 1e-9) {
      m.progress = 0;
      if (state.factories === 0) state.factoryBalance = FACTORY_BALANCE_DEFAULT;
      state.factories += 1;
      state.autoFactories = (state.autoFactories || 0) + 1;
    }
  }
}

function floorHeldType() { return floorHold ? floorHold.type : null; }

function buyModule(type, tier) {
  tier = tier || 1;
  var price = modulePrice(type, tier);
  var def = MODULES[type];
  if (def.limit && moduleOwnedCount(type) >= def.limit) return;
  if ((def.copper ? state.copperAmt : state.funds) < price) return;
  if (def.copper) {
    state.copperAmt -= price;
    state.aiBought[type + ":" + tier] = ((state.aiBought && state.aiBought[type + ":" + tier]) || 0) + 1;
  } else {
    state.funds -= price;
  }
  state.moduleStock.push({ type: type, tier: tier, paid: price });
  floorHold = { type: type, tier: tier, rot: 0 };
  floorSelected = null;
  floorRender();
  render();
}

function floorFindStock(type, tier) {
  for (var i = 0; i < state.moduleStock.length; i++) if (state.moduleStock[i].type === type && (state.moduleStock[i].tier || 1) === (tier || 1)) return i;
  return -1;
}

function floorPlaceHeld(x, y) {
  if (!floorHold) return;
  var idx = floorFindStock(floorHold.type, floorHold.tier);
  if (idx < 0) { floorHold = null; floorRender(); return; }
  if (!canPlaceModule(floorHold.type, floorHold.rot, x, y)) { floorSetHint("it doesn't fit there"); return; }
  var item = state.moduleStock.splice(idx, 1)[0];
  var m = { id: state.moduleNextId++, type: item.type, x: x, y: y, rot: floorHold.rot, tier: item.tier || 1, paid: item.paid };
  state.modules.push(m);
  if (floorFindStock(floorHold.type, floorHold.tier) < 0) floorHold = null;
  floorSelected = null;
  floorRender();
  render();
}

function floorSelectedModule() {
  if (!floorSelected) return null;
  for (var i = 0; i < state.modules.length; i++) if (state.modules[i].id === floorSelected) return state.modules[i];
  return null;
}

function floorRotate() {
  if (floorHold) {
    if (MODULES[floorHold.type].w !== MODULES[floorHold.type].h) floorHold.rot = floorHold.rot ? 0 : 1;
    floorRender();
    return;
  }
  var m = floorSelectedModule();
  if (!m || MODULES[m.type].w === MODULES[m.type].h) return;
  var rot = m.rot ? 0 : 1;
  if (!canPlaceModule(m.type, rot, m.x, m.y, m.id)) { floorSetHint("no room to rotate it there"); return; }
  m.rot = rot;
  floorRender();
  render();
}

function floorPickUp(thenHold) {
  var m = floorSelectedModule();
  if (!m) return;
  state.modules = state.modules.filter(function (x) { return x.id !== m.id; });
  floorUnwire(m.id);
  var stock = { type: m.type, tier: m.tier || 1, paid: m.paid };
  state.moduleStock.push(stock);
  floorSelected = null;
  floorHold = thenHold ? { type: m.type, tier: m.tier || 1, rot: m.rot } : null;
  floorRender();
  render();
}

function floorExpandCost() {
  return FLOOR_EXPAND_COSTS[Math.min(FLOOR_SIZES.length - 1, Math.floor(state.floorTier || 1))] || null;
}

function floorCanAfford(c) {
  return !!c && state.funds >= c.funds && state.unsold >= c.nails && state.copperAmt >= c.copper;
}

function floorExpand() {
  if ((state.floorTier || 1) >= FLOOR_SIZES.length) return;
  var c = floorExpandCost();
  if (!floorCanAfford(c)) return;
  state.funds -= c.funds;
  state.unsold -= c.nails;
  state.copperAmt -= c.copper;
  state.floorTier += 1;
  floorRender();
  render();
}

var floorHold = null;
var floorSelected = null;
var floorWiring = null;
var floorOpen = false;
var floorUi = { buy: {}, sellBtn: null, expandBtn: null, mergeBtn: null, ai: {}, heat: {}, bars: {} };
var floorCellEls = [];
var floorHintNode = null;
var floorHover = null;
var floorHintTimer = null;

function fl(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function floorSetHint(text) {
  if (!floorHintNode) return;
  floorHintNode.textContent = text;
  clearTimeout(floorHintTimer);
  floorHintTimer = setTimeout(function () { if (floorHintNode) floorHintNode.textContent = floorDefaultHint(); }, 2000);
}

function floorDefaultHint() {
  if (floorWiring) return "tap another part to wire it or unwire it. press done when finished";
  var m = floorSelectedModule();
  if (m) return moduleInfoText(m) + " ports " + floorWireCount(m.id) + "/" + floorPortLimit(m.id) + ".";
  return floorHold ? "tap a cell to put it down" : "double-click a tile to pick it up, then tap a cell to put it down";
}

function floorMoneyText(type, amount) {
  return MODULES[type].copper ? fmtWeight(amount) + " of copper" : fmtMoney(amount);
}

function floorMerge() {
  var m = floorSelectedModule();
  if (!m) return;
  var partner = aiMergePartner(m);
  if (!partner) return;
  var cost = aiMergeCost(m.type, m.tier || 1);
  if (state.copperAmt < cost) return;
  state.copperAmt -= cost;
  m.tier = (m.tier || 1) + 1;
  if (typeof playMergeSound === "function") playMergeSound(m.tier);
  m.paid = (m.paid || 0) + (partner.paid || 0) + cost;
  (state.wires || []).forEach(function (w) {
    var other = w[0] === partner.id ? w[1] : (w[1] === partner.id ? w[0] : 0);
    var ob = other && floorFindModule(other);
    if (ob && other !== m.id && !floorIsWired(m.id, other) && floorWireCount(m.id) < floorPortLimit(m.id) && floorCanWire(m, ob)) state.wires.push([m.id, other]);
  });
  floorUnwire(partner.id);
  state.modules = state.modules.filter(function (x) { return x.id !== partner.id; });
  floorRender();
  render();
}

function fmtPct(x) { return Math.round(x * 1000) / 10 + "%"; }

function moduleInfoText(m) {
  var def = MODULES[m.type];
  if (def.tiered) return aiTileInfoText(m);
  var line = def.name + ": ";
  if (!def.effect) return line + def.what + "." + (m.type !== "controller" && m.type !== "battery" || floorPowered(m) ? "" : " it has no wire path to a battery and the controller.");
  var coolers = state.modules.filter(function (x) { return x.type === "cooler"; });
  var n = def.boosted ? coolersTouching(m, coolers) : 0;
  var amount = def.amount * (1 + MODULE_COOLER_BONUS * n);
  line += def.what.replace("{n}", fmtPct(amount));
  if (!floorPowered(m)) line += ". it has no wire path to a battery and the controller, so it does nothing";
  if (def.boosted) line += " (" + n + " cooler" + (n === 1 ? "" : "s") + " touching)";
  return line + ".";
}

function floorPreview(x, y) {
  var n = floorSize();
  var yy, xx;
  for (yy = 0; yy < n; yy++) for (xx = 0; xx < n; xx++) {
    if (floorCellEls[yy] && floorCellEls[yy][xx]) floorCellEls[yy][xx].classList.remove("floor-ok", "floor-bad");
  }
  if (!floorHold || x === null) return;
  var d = moduleDims(floorHold.type, floorHold.rot);
  var ok = canPlaceModule(floorHold.type, floorHold.rot, x, y);
  for (var dy = 0; dy < d.h; dy++) for (var dx = 0; dx < d.w; dx++) {
    var cell = floorCellEls[y + dy] && floorCellEls[y + dy][x + dx];
    if (cell) cell.classList.add(ok ? "floor-ok" : "floor-bad");
  }
}

var floorLastClick = { id: 0, at: 0 };

function floorCellClick(x, y, occupant) {
  if (floorHold) { floorPlaceHeld(x, y); return; }
  if (floorWiring) {
    if (occupant && occupant !== floorWiring) { floorToggleWire(floorWiring, occupant); floorRender(); render(); }
    else if (!occupant) { floorWiring = null; floorRender(); }
    return;
  }
  var now = Date.now();
  if (occupant && floorLastClick.id === occupant && now - floorLastClick.at < 400) {
    floorLastClick = { id: 0, at: 0 };
    floorSelected = occupant;
    floorPickUp(true);
    return;
  }
  floorLastClick = { id: occupant || 0, at: now };
  floorSelected = occupant || null;
  floorRender();
}

function floorBuildGrid(parent) {
  var n = floorSize();
  var occ = floorOccupancy();
  var byId = {};
  state.modules.forEach(function (m) { byId[m.id] = m; });

  var grid = fl("div", "floor-grid");
  grid.style.position = "relative";
  grid.style.setProperty("--floor-cell", Math.max(30, Math.min(44, Math.floor(640 / n))) + "px");
  var working = floorWorking();
  var wiringMod = floorWiring ? floorFindModule(floorWiring) : null;
  grid.style.gridTemplateColumns = "repeat(" + n + ", var(--floor-cell))";
  floorCellEls = [];
  for (var y = 0; y < n; y++) {
    floorCellEls.push([]);
    for (var x = 0; x < n; x++) {
      var id = occ[y][x];
      var cell = fl("div", "floor-cell");
      if (id) {
        var m = byId[id];
        cell.classList.add("occ");
        if (m.x === x && m.y === y) {
          var gl = aiGlyph(aiGlyphKey(m.type, m.tier), 44, m.rot);
          var dm = moduleDims(m.type, m.rot);
          gl.style.position = "absolute";
          gl.style.left = "0";
          gl.style.top = "0";
          gl.style.zIndex = "1";
          gl.style.width = "calc(var(--floor-cell) * " + dm.w + ")";
          gl.style.height = "calc(var(--floor-cell) * " + dm.h + ")";
          if (!working[m.id]) gl.style.opacity = "0.3";
          cell.style.position = "relative";
          cell.appendChild(gl);
          if (m.type === "replicator") {
            var track = fl("div", "");
            track.style.cssText = "position:absolute;z-index:2;left:10%;right:10%;bottom:6px;height:8px;border:1px solid var(--ink);background:var(--paper);pointer-events:none;width:calc(var(--floor-cell) * " + dm.w + " * 0.8);";
            var fill = fl("div", "");
            fill.style.cssText = "height:100%;width:0;background:var(--ink);";
            track.appendChild(fill);
            track.style.top = "calc(var(--floor-cell) * " + dm.h + " - 16px)";
            track.style.bottom = "auto";
            cell.appendChild(track);
            floorUi.bars[m.id] = fill;
          }
        }
        if (floorSelected === id || floorWiring === id) cell.classList.add("sel");
        if (wiringMod && floorCanWire(wiringMod, m)) cell.classList.add("floor-wirable");
        if (y > 0 && occ[y - 1][x] === id) cell.classList.add("no-top");
        if (y < n - 1 && occ[y + 1][x] === id) cell.classList.add("no-bottom");
        if (x > 0 && occ[y][x - 1] === id) cell.classList.add("no-left");
        if (x < n - 1 && occ[y][x + 1] === id) cell.classList.add("no-right");
      }
      (function (cx, cy, cid) {
        cell.addEventListener("click", function () { floorCellClick(cx, cy, cid); });
        cell.addEventListener("mouseenter", function () { floorHover = { x: cx, y: cy }; floorPreview(cx, cy); });
      })(x, y, id);
      floorCellEls[y].push(cell);
      grid.appendChild(cell);
    }
  }
  grid.addEventListener("mouseleave", function () { floorHover = null; floorPreview(null, null); });
  parent.appendChild(grid);
}

function floorDrawWires() {
  var grid = document.querySelector("#floorOverlay .floor-grid");
  if (!grid) return;
  var old = grid.querySelector("svg.floor-wires");
  if (old) old.parentNode.removeChild(old);
  var gw = grid.offsetWidth, gh = grid.offsetHeight;
  if (!gw || !gh || !state.wires || !state.wires.length) return;
  var ns = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "floor-wires");
  svg.setAttribute("width", gw);
  svg.setAttribute("height", gh);
  svg.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;overflow:visible;";
  var center = function (m) {
    var c = floorCellEls[m.y] && floorCellEls[m.y][m.x];
    return c ? { x: c.offsetLeft + c.offsetWidth / 2, y: c.offsetTop + c.offsetHeight / 2 } : null;
  };
  var focus = floorWiring || floorSelected;
  var used = {};
  var port = function (m, toward) {
    var c = center(m);
    var pts = aiGlyphPoints(aiGlyphKey(m.type, m.tier), m.rot).pts;
    var cell = floorCellEls[m.y][m.x];
    var k = cell.offsetWidth / 40, best = null, bd = 1e9;
    pts.forEach(function (n, i) {
      var key = m.id + ":" + i;
      var x = cell.offsetLeft + n[0] * k, y = cell.offsetTop + n[1] * k;
      var d = Math.pow(x - toward.x, 2) + Math.pow(y - toward.y, 2) + (used[key] || 0) * 400;
      if (d < bd) { bd = d; best = { x: x, y: y, key: key }; }
    });
    if (!best) return c;
    used[best.key] = (used[best.key] || 0) + 1;
    return best;
  };
  state.wires.forEach(function (w, wi) {
    var a = floorFindModule(w[0]), b = floorFindModule(w[1]);
    if (!a || !b) return;
    var ca = center(a), cb = center(b);
    if (!ca || !cb) return;
    var p = port(a, cb), q = port(b, ca);
    var path = document.createElementNS(ns, "line");
    path.setAttribute("x1", p.x); path.setAttribute("y1", p.y);
    path.setAttribute("x2", q.x); path.setAttribute("y2", q.y);
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", focus && (w[0] === focus || w[1] === focus) ? "1.4" : "1");
    path.setAttribute("stroke-linecap", "butt");
    path.style.opacity = focus && w[0] !== focus && w[1] !== focus ? "0.45" : "0.9";
    svg.appendChild(path);
  });
  svg.style.color = "var(--ink)";
  grid.appendChild(svg);
}

function floorBtn(parent, label, fn) {
  var b = fl("button", "", label);
  b.addEventListener("click", fn);
  parent.appendChild(b);
  return b;
}

function floorRender() {
  floorTipHide();
  var body = el.floorBody;
  body.innerHTML = "";
  floorUi = { buy: {}, sellBtn: null, expandBtn: null, mergeBtn: null, ai: {}, heat: {}, bars: {} };
  floorNormalize();
  var n = floorSize();

  var b = moduleBonuses();
  var ctl = floorController();
  var used = ctl ? floorWireCount(ctl.id) : 0, lim = ctl ? floorPortLimit(ctl.id) : 0;
  sheetAddHeading(body, "motherboard");
  body.appendChild(fl("div", "hint", "a part only works when its wires lead to a battery and to the controller. one battery powers everything in its network. wires reach " + FLOOR_WIRE_REACH + " cells, and parts have a limited number of ports: the controller has " + lim + " (" + used + " used), chips and presses 2, bigger parts one per tile. select a part and press wire, then tap the parts to connect."));

  sheetAddHeading(body, "what your modules do");
  sheetAddRows(body, [
    ["copper per cycle", b.copper > 0 ? "\u2212" + fmtPct(b.copper) : "\u2014"],
    ["new factory price", b.price > 0 ? "\u2212" + fmtPct(b.price) : "\u2014"],
    ["nail makers per cycle", b.makerYield > 0 ? "+" + fmtPct(b.makerYield) : "\u2014"],
    ["nail breakers per cycle", b.breakerYield > 0 ? "+" + fmtPct(b.breakerYield) : "\u2014"]
  ]);

  sheetAddHeading(body, "board (" + n + " \u00d7 " + n + ", Mk" + state.floorTier + ")");
  floorBuildGrid(body);

  var controls = fl("div", "admin-btns");
  controls.style.justifyContent = "center";
  if (floorHold) {
    var holdTag = fl("span", "floor-hold");
    holdTag.appendChild(aiGlyph(aiGlyphKey(floorHold.type, floorHold.tier), Math.floor(26 / Math.max(MODULES[floorHold.type].w, MODULES[floorHold.type].h)), floorHold.rot));
    holdTag.appendChild(fl("span", "", "in hand: tap a cell"));
    controls.appendChild(holdTag);
    floorBtn(controls, "rotate [r]", floorRotate);
    floorBtn(controls, "cancel [c]", function () { floorHold = null; floorRender(); });
  } else if (floorWiring) {
    controls.appendChild(fl("span", "floor-hold", "wiring: tap a part"));
    floorBtn(controls, "done [d]", function () { floorWiring = null; floorRender(); });
  } else if (floorSelectedModule()) {
    var m = floorSelectedModule();
    if (MODULES[m.type].w !== MODULES[m.type].h) floorBtn(controls, "rotate [r]", floorRotate);
    floorBtn(controls, "wire [w]", function () { floorWiring = m.id; floorSelected = null; floorRender(); });
    if (MODULES[m.type].tiered) {
      var partner = aiMergePartner(m);
      floorUi.mergeBtn = floorBtn(controls, "merge [m]", floorMerge);
      floorUi.mergeBtn.dataset.ok = partner ? "1" : "";
      if (!partner) floorUi.mergeBtn.title = (m.tier || 1) >= AI_MAX_TIER ? "already the top tier" : "needs a tier " + (m.tier || 1) + " " + MODULES[m.type].name + " touching it";
    }
    floorBtn(controls, "pick up [q]", function () { floorPickUp(true); });
    floorBtn(controls, "cancel [c]", function () { floorSelected = null; floorRender(); });
  }
  body.appendChild(controls);
  var keysHint = fl("div", "hint", "keys: r rotate \u00b7 w wire \u00b7 q pick up \u00b7 m merge \u00b7 c cancel \u00b7 d done. they work on the selected part, or the one under the mouse");
  keysHint.style.textAlign = "center";
  body.appendChild(keysHint);
  floorHintNode = fl("div", "hint", floorDefaultHint());
  floorHintNode.style.textAlign = "center";
  body.appendChild(floorHintNode);

  var counts = {};
  state.moduleStock.forEach(function (s) { var k = s.type + ":" + (s.tier || 1); counts[k] = (counts[k] || 0) + 1; });
  var stockKeys = [];
  MODULE_ORDER.forEach(function (tp) {
    for (var tr = 1; tr <= AI_MAX_TIER; tr++) if (counts[tp + ":" + tr]) stockKeys.push([tp, tr]);
  });
  if (stockKeys.length > 0) {
    sheetAddHeading(body, "spares");
    var chips = fl("div", "admin-btns");
    stockKeys.forEach(function (pair) {
      var t = pair[0], tr = pair[1];
      var chip = fl("button", "floor-spare");
      chip.appendChild(aiGlyph(aiGlyphKey(t, tr), Math.floor(26 / Math.max(MODULES[t].w, MODULES[t].h))));
      chip.appendChild(fl("span", "", "\u00d7" + counts[t + ":" + tr]));
      chip.addEventListener("click", function () {
        floorHold = { type: t, tier: tr, rot: 0 };
        floorSelected = null;
        floorRender();
      });
      chips.appendChild(chip);
      if (floorHold && floorHold.type === t && (floorHold.tier || 1) === tr) chip.classList.add("lb-tab-active");
    });
    body.appendChild(chips);
  }

  sheetAddHeading(body, "parts");
  var cols = fl("div", "shop-cols");
  [["parts", ["battery", "press", "table", "replicator"]], ["maker chips", ["processor"]], ["breaker chips", ["memory"]]].forEach(function (colDef) {
    var col = fl("div", "shop-col");
    col.appendChild(fl("div", "shop-col-head", colDef[0]));
    colDef[1].forEach(function (tp) {
      var tiers = MODULES[tp].tiered ? AI_MAX_TIER : 1;
      for (var tr = 1; tr <= tiers; tr++) (function (type, tier) {
        var cell = fl("button", "shop-cell");
        cell.appendChild(aiGlyph(aiGlyphKey(type, tier), Math.floor(38 / Math.max(MODULES[type].w, MODULES[type].h))));
        if (!MODULES[type].tiered) cell.appendChild(fl("span", "", MODULES[type].name));
        var price = fl("span", "", "");
        cell.appendChild(price);
        cell.addEventListener("click", function () { buyModule(type, tier); });
        cell.addEventListener("mouseenter", function (ev) { floorTipShow(ev, floorPartTip(type, tier)); });
        cell.addEventListener("mousemove", function (ev) { floorTipMove(ev); });
        cell.addEventListener("mouseleave", floorTipHide);
        col.appendChild(cell);
        floorUi.buy[type + ":" + tier] = { box: cell, btn: cell, price: price, type: type, tier: tier };
      })(tp, tr);
    });
    cols.appendChild(col);
  });
  body.appendChild(cols);

  var cost = floorExpandCost();
  sheetAddHeading(body, "expand the motherboard");
  if ((state.floorTier || 1) >= FLOOR_SIZES.length || !cost) {
    sheetAddText(body, "the motherboard is at its largest");
  } else {
    var nextN = FLOOR_SIZES[state.floorTier];
    sheetAddText(body, "Mk" + (state.floorTier + 1) + ": " + nextN + " \u00d7 " + nextN + " cells. Costs " + fmtWeight(cost.copper) + " of copper.");
    var ew = fl("div", "admin-btns");
    floorUi.expandBtn = floorBtn(ew, "expand to " + nextN + " \u00d7 " + nextN, floorExpand);
    body.appendChild(ew);
  }

  floorUpdate();
  floorDrawWires();
  if (floorHover && floorHold) floorPreview(floorHover.x, floorHover.y);
}

function floorUpdate() {
  for (var key in floorUi.buy) {
    var e = floorUi.buy[key];
    var price = modulePrice(e.type, e.tier);
    var have = MODULES[e.type].copper ? state.copperAmt : state.funds;
    var gate = !MODULES[e.type].tiered || e.tier === 1 || ((state.aiBought && state.aiBought[e.type + ":" + (e.tier - 1)]) || 0) > 0;
    if (gate && !state.aiSeen[key] && (e.tier === 1 && MODULES[e.type].tiered || have >= price * 0.5)) state.aiSeen[key] = true;
    e.box.style.display = gate && state.aiSeen[key] ? "" : "none";
    e.price.textContent = MODULES[e.type].copper ? fmtWeight(price) : fmtMoney(price);
    e.btn.disabled = have < price || !!(MODULES[e.type].limit && moduleOwnedCount(e.type) >= MODULES[e.type].limit);
  }
  if (floorUi.mergeBtn) {
    var sm = floorSelectedModule();
    floorUi.mergeBtn.disabled = !floorUi.mergeBtn.dataset.ok || !sm || state.copperAmt < aiMergeCost(sm.type, sm.tier || 1);
  }
  var work = null;
  for (var rid in floorUi.bars) {
    var rm = floorFindModule(parseInt(rid, 10));
    if (!rm) continue;
    work = work || floorWorking();
    floorUi.bars[rid].style.width = Math.round((rm.progress || 0) * 100) + "%";
    floorUi.bars[rid].parentNode.style.opacity = work[rm.id] ? "1" : "0.35";
  }
  if (floorUi.expandBtn) floorUi.expandBtn.disabled = !floorCanAfford(floorExpandCost());
}

function renderFloor() {
  if (!el.floorWrap) return;
  if (!state.unlockedFloor && state.factories >= FLOOR_UNLOCK_FACTORIES) state.unlockedFloor = true;
  el.floorWrap.style.display = "none";
  if (floorOpen) floorUpdate();
}

function floorOpenScreen() {
  floorNormalize();
  floorOpen = true;
  floorHold = null;
  floorSelected = null;
  floorRender();
  el.floorOverlay.style.display = "flex";
  el.floorOverlay.firstElementChild.scrollTop = 0;
  floorDrawWires();
}

function floorCloseScreen() {
  floorOpen = false;
  floorWiring = null;
  floorHold = null;
  floorSelected = null;
  el.floorOverlay.style.display = "none";
}

el.btnFloor.addEventListener("click", floorOpenScreen);
window.addEventListener("resize", function () { if (floorOpen) floorDrawWires(); });
el.btnFloorClose.addEventListener("click", floorCloseScreen);
el.floorOverlay.addEventListener("click", function (e) { if (e.target === el.floorOverlay) floorCloseScreen(); });
function floorKeyTarget() {
  var m = floorSelectedModule();
  if (m) return m;
  if (!floorHover) return null;
  var row = floorOccupancy()[floorHover.y];
  var id = row && row[floorHover.x];
  return id ? floorFindModule(id) : null;
}

function floorKey(key) {
  if (key === "escape" || key === "c") {
    if (floorHold) { floorHold = null; floorRender(); return true; }
    if (floorWiring) { floorWiring = null; floorRender(); return true; }
    if (floorSelected) { floorSelected = null; floorRender(); return true; }
    if (key === "escape") floorCloseScreen();
    return true;
  }
  if (key === "r") { if (floorHold || floorKeyTarget()) { if (!floorHold) floorSelected = floorKeyTarget().id; floorRotate(); } return true; }
  if (key === "d") { if (floorWiring) { floorWiring = null; floorRender(); } return true; }
  if (floorHold) return false;
  var t = floorKeyTarget();
  if (key === "w") {
    if (floorWiring) {
      if (t && t.id !== floorWiring) { floorToggleWire(floorWiring, t.id); floorRender(); render(); }
      else { floorWiring = null; floorRender(); }
    } else if (t) { floorWiring = t.id; floorSelected = null; floorRender(); }
    return true;
  }
  if (floorWiring) return false;
  if (key === "q" && t) { floorSelected = t.id; floorPickUp(true); return true; }
  if (key === "m" && t && MODULES[t.type].tiered) { floorSelected = t.id; floorMerge(); return true; }
  return false;
}

document.addEventListener("keydown", function (e) {
  if (!floorOpen || e.ctrlKey || e.metaKey || e.altKey) return;
  var tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (floorKey(String(e.key).toLowerCase())) e.preventDefault();
});
