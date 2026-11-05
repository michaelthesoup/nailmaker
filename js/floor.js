"use strict";

var FLOOR_UNLOCK_FACTORIES = 10;
var FLOOR_SIZES = [5, 6, 7];
var FLOOR_EXPAND_COSTS = [
  null,
  { funds: 5e8, nails: 1e7, copper: 0 },
  { funds: 2e10, nails: 1e9, copper: 1e8 }
];
var MODULE_SELL_REFUND = 0.75;
var MODULE_PRICE_GROWTH = 1.5;
var MODULE_COOLER_BONUS = 0.5;
var MODULE_COOLER_MAX = 2;
var MODULE_CAPS = { speed: 3, copper: 0.6, price: 0.5, makerYield: 5, breakerYield: 5 };

var MODULES = {
  battery: { name: "battery",         code: "B", w: 2, h: 2, price: 1.6e5, effect: "speed",        amount: 0.08, boosted: true, what: "factories work {n} faster" },
  press:   { name: "copper press",    code: "P", w: 1, h: 2, price: 4e5, effect: "copper",       amount: 0.06, boosted: true, what: "each cycle costs {n} less copper" },
  table:   { name: "blueprint table", code: "T", w: 2, h: 1, price: 1e6, effect: "price",        amount: 0.04,                what: "new factories cost {n} less" },
  processor: { name: "processor",     code: "PRO", w: 1, h: 1, price: 60, copper: true, tiered: true, effect: null, what: "burns data to buff the factories. it heats up while it works and shuts down if it overheats. merge two of the same tier to upgrade" },
  memory:  { name: "memory",          code: "MEM", w: 1, h: 1, price: 40, copper: true, tiered: true, effect: null, what: "collects and stores data. merge two of the same tier to upgrade" },
  cooler:  { name: "cooler",          code: "C", w: 1, h: 1, price: 3e5, effect: null,                                     what: "cools the processors beside it so they can keep running (up to two coolers each)" }
};
var MODULE_ORDER = ["battery", "press", "table", "cooler", "processor", "memory"];

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

function moduleBonuses() {
  var out = { speed: 0, copper: 0, price: 0, makerYield: 0, breakerYield: 0 };
  var mods = state.modules || [];
  if (mods.length === 0) return out;
  var coolers = mods.filter(function (m) { return m.type === "cooler"; });
  for (var i = 0; i < mods.length; i++) {
    var def = MODULES[mods[i].type];
    if (!def || !def.effect) continue;
    var amount = def.amount;
    if (def.boosted) amount *= 1 + MODULE_COOLER_BONUS * coolersTouching(mods[i], coolers);
    out[def.effect] += amount;
  }
  for (var k in MODULE_CAPS) out[k] = Math.min(MODULE_CAPS[k], out[k]);
  return out;
}

function moduleSpeedMult() { return (1 + moduleBonuses().speed) * (1 + (typeof aiBuff === "function" ? aiBuff() : 0)); }
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

function floorPartTip(type, tier) {
  var def = MODULES[type];
  if (type === "memory") return [def.name + " · tier " + tier, "holds " + aiFmtBytes(aiTierValue(type, tier)) + " · collects " + aiFmtBytes(aiTierValue(type, tier) * AI_FILL_RATE) + "/s"];
  if (type === "processor") return [def.name + " · tier " + tier, "burns " + aiFmtBytes(aiTierValue(type, tier)) + " data/s · overheats in " + AI_HEAT_RUN + "s uncooled"];
  return [def.name, "cools processors beside it (heat gain \u2212" + Math.round(AI_COOLER_POWER * 100) + "% each)"];
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
      if (o && !MODULES[o.type] && (o.type === "maker" || o.type === "breaker")) state.funds += Number(o.paid) || 0;
    });
  });
  if (!state.aiSeen || typeof state.aiSeen !== "object") state.aiSeen = {};
  state.floorTier = Math.max(1, Math.min(FLOOR_SIZES.length, Math.floor(state.floorTier || 1)));
  state.moduleStock = state.moduleStock.filter(function (s) { return s && MODULES[s.type]; })
    .map(function (s) { return { type: s.type, tier: floorTierOf(s), paid: Number(s.paid) || 0 }; });
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
    var clean = { id: Math.floor(m.id) || 0, type: m.type, x: Math.floor(m.x), y: Math.floor(m.y), rot: rot, tier: floorTierOf(m), paid: Number(m.paid) || 0 };
    if (!clean.id || kept.some(function (k) { return k.id === clean.id; })) clean.id = maxId + 1;
    maxId = Math.max(maxId, clean.id);
    kept.push(clean);
    state.modules.push(clean);
  }
  state.moduleNextId = Math.max(Math.floor(state.moduleNextId || 1), maxId + 1);
}

function floorHeldType() { return floorHold ? floorHold.type : null; }

function buyModule(type, tier) {
  tier = tier || 1;
  var price = modulePrice(type, tier);
  var def = MODULES[type];
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
  state.moduleStock.push({ type: m.type, tier: m.tier || 1, paid: m.paid });
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
var floorOpen = false;
var floorUi = { buy: {}, sellBtn: null, expandBtn: null, mergeBtn: null, ai: {}, heat: {} };
var floorCellEls = [];
var floorHintNode = null;
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
  var m = floorSelectedModule();
  if (m) return moduleInfoText(m);
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
  state.modules = state.modules.filter(function (x) { return x.id !== partner.id; });
  floorRender();
  render();
}

function fmtPct(x) { return Math.round(x * 1000) / 10 + "%"; }

function moduleInfoText(m) {
  var def = MODULES[m.type];
  if (def.tiered) return aiTileInfoText(m);
  var line = def.name + ": ";
  if (!def.effect) return line + def.what + ".";
  var coolers = state.modules.filter(function (x) { return x.type === "cooler"; });
  var n = def.boosted ? coolersTouching(m, coolers) : 0;
  var amount = def.amount * (1 + MODULE_COOLER_BONUS * n);
  line += def.what.replace("{n}", fmtPct(amount));
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
          cell.style.display = "flex";
          cell.style.alignItems = "center";
          cell.style.justifyContent = "center";
          cell.appendChild(aiGlyph(aiGlyphKey(m.type, m.tier), 36));
        }
        if (m.type === "processor" && m.x === x && m.y === y) {
          cell.style.position = "relative";
          var heatBar = document.createElement("div");
          heatBar.style.cssText = "position:absolute;left:0;bottom:0;height:3px;width:0;pointer-events:none;";
          cell.appendChild(heatBar);
          floorUi.heat[m.id] = heatBar;
        }
        if (floorSelected === id) cell.classList.add("sel");
        if (y > 0 && occ[y - 1][x] === id) cell.classList.add("no-top");
        if (y < n - 1 && occ[y + 1][x] === id) cell.classList.add("no-bottom");
        if (x > 0 && occ[y][x - 1] === id) cell.classList.add("no-left");
        if (x < n - 1 && occ[y][x + 1] === id) cell.classList.add("no-right");
      }
      (function (cx, cy, cid) {
        cell.addEventListener("click", function () { floorCellClick(cx, cy, cid); });
        cell.addEventListener("mouseenter", function () { floorPreview(cx, cy); });
      })(x, y, id);
      floorCellEls[y].push(cell);
      grid.appendChild(cell);
    }
  }
  grid.addEventListener("mouseleave", function () { floorPreview(null, null); });
  parent.appendChild(grid);
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
  floorUi = { buy: {}, sellBtn: null, expandBtn: null, mergeBtn: null, ai: {}, heat: {} };
  floorNormalize();
  var n = floorSize();

  var b = moduleBonuses();
  sheetAddHeading(body, aiDisplayName());
  [["data", "raw"], ["collecting", "inflow"], ["burning", "proc"], ["factory buff", "buff"], ["overheated", "hot"]].forEach(function (r) {
    var row = fl("div", "row");
    row.appendChild(fl("span", "label", r[0]));
    var v = fl("span", "value", "");
    row.appendChild(v);
    body.appendChild(row);
    floorUi.ai[r[1]] = v;
  });
  body.appendChild(fl("div", "hint", "memory collects data. processors burn it to buff your factories, and each step up in tier adds a lot more. burning makes heat, and a processor that overheats shuts down until it cools, so put coolers beside them."));

  sheetAddHeading(body, "what your modules do");
  sheetAddRows(body, [
    ["factory speed", b.speed > 0 ? "+" + fmtPct(b.speed) : "\u2014"],
    ["copper per cycle", b.copper > 0 ? "\u2212" + fmtPct(b.copper) : "\u2014"],
    ["new factory price", b.price > 0 ? "\u2212" + fmtPct(b.price) : "\u2014"]
  ]);

  sheetAddHeading(body, "motherboard (" + n + " \u00d7 " + n + ", Mk" + state.floorTier + ")");
  floorBuildGrid(body);

  var controls = fl("div", "admin-btns");
  controls.style.justifyContent = "center";
  if (floorHold) {
    var holdTag = fl("span", "floor-hold");
    holdTag.appendChild(aiGlyph(aiGlyphKey(floorHold.type, floorHold.tier), 26));
    holdTag.appendChild(fl("span", "", "in hand: tap a cell"));
    controls.appendChild(holdTag);
    floorBtn(controls, "rotate", floorRotate);
    floorBtn(controls, "cancel", function () { floorHold = null; floorRender(); });
  } else if (floorSelectedModule()) {
    var m = floorSelectedModule();
    if (MODULES[m.type].w !== MODULES[m.type].h) floorBtn(controls, "rotate", floorRotate);
    if (MODULES[m.type].tiered) {
      var partner = aiMergePartner(m);
      floorUi.mergeBtn = floorBtn(controls, "merge", floorMerge);
      floorUi.mergeBtn.dataset.ok = partner ? "1" : "";
      if (!partner) floorUi.mergeBtn.title = (m.tier || 1) >= AI_MAX_TIER ? "already the top tier" : "needs a tier " + (m.tier || 1) + " " + MODULES[m.type].name + " touching it";
    }
    floorBtn(controls, "cancel", function () { floorSelected = null; floorRender(); });
  }
  body.appendChild(controls);
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
      chip.appendChild(aiGlyph(aiGlyphKey(t, tr), 26));
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
  [["memory", ["memory"]], ["processors", ["processor"]], ["cooler", ["cooler"]]].forEach(function (colDef) {
    var col = fl("div", "shop-col");
    col.appendChild(fl("div", "shop-col-head", colDef[0]));
    colDef[1].forEach(function (tp) {
      var tiers = MODULES[tp].tiered ? AI_MAX_TIER : 1;
      for (var tr = 1; tr <= tiers; tr++) (function (type, tier) {
        var cell = fl("button", "shop-cell");
        cell.appendChild(aiGlyph(aiGlyphKey(type, tier), 38));
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
    sheetAddText(body, "Mk" + (state.floorTier + 1) + ": " + nextN + " \u00d7 " + nextN + " cells. Costs " + fmtMoney(cost.funds) + ", " + fmtInt(cost.nails) + " unsold nails" + (cost.copper > 0 ? " and " + fmtWeight(cost.copper) + " of copper" : "") + ".");
    var ew = fl("div", "admin-btns");
    floorUi.expandBtn = floorBtn(ew, "expand to " + nextN + " \u00d7 " + nextN, floorExpand);
    body.appendChild(ew);
  }

  floorUpdate();
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
    e.btn.disabled = have < price;
  }
  if (floorUi.mergeBtn) {
    var sm = floorSelectedModule();
    floorUi.mergeBtn.disabled = !floorUi.mergeBtn.dataset.ok || !sm || state.copperAmt < aiMergeCost(sm.type, sm.tier || 1);
  }
  if (floorUi.ai.raw) {
    floorUi.ai.raw.textContent = aiFmtBytes(aiData()) + " / " + aiFmtBytes(aiCapacity());
    floorUi.ai.inflow.textContent = "+" + aiFmtBytes(aiInflow()) + "/s";
    floorUi.ai.proc.textContent = aiFmtBytes(aiBurn()) + "/s";
    floorUi.ai.hot.textContent = aiHotCount + " / " + aiProcessors().length;
    for (var hid in floorUi.heat) {
      var hb = floorUi.heat[hid];
      var hv = aiHeat[hid] || 0;
      hb.style.width = Math.round(hv * 100) + "%";
      hb.style.background = aiHot[hid] ? "repeating-linear-gradient(90deg, var(--ink) 0 2px, transparent 2px 4px)" : "var(--ink)";
    }
    floorUi.ai.buff.textContent = aiBuffText();
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
}

function floorCloseScreen() {
  floorOpen = false;
  floorHold = null;
  floorSelected = null;
  el.floorOverlay.style.display = "none";
}

el.btnFloor.addEventListener("click", floorOpenScreen);
el.btnFloorClose.addEventListener("click", floorCloseScreen);
el.floorOverlay.addEventListener("click", function (e) { if (e.target === el.floorOverlay) floorCloseScreen(); });
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && floorOpen) floorCloseScreen();
});
