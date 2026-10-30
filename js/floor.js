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
  battery: { name: "battery",         code: "B", w: 2, h: 2, price: 8e5, effect: "speed",        amount: 0.08, boosted: true, what: "factories work {n}% faster" },
  press:   { name: "copper press",    code: "P", w: 1, h: 2, price: 2e6, effect: "copper",       amount: 0.06, boosted: true, what: "each cycle costs {n}% less copper" },
  table:   { name: "blueprint table", code: "T", w: 2, h: 1, price: 5e6, effect: "price",        amount: 0.04,                what: "new factories cost {n}% less" },
  maker:   { name: "maker die",       code: "M", w: 1, h: 3, price: 1e7, effect: "makerYield",   amount: 0.10,                what: "{n}% more nail makers from each maker cycle" },
  breaker: { name: "breaker die",     code: "K", w: 1, h: 3, price: 1e7, effect: "breakerYield", amount: 0.10,                what: "{n}% more nail breakers from each breaker cycle" },
  cooler:  { name: "cooler",          code: "C", w: 1, h: 1, price: 1.5e6, effect: null,                                     what: "boosts the batteries and copper presses beside it by 50% (up to two coolers each)" }
};
var MODULE_ORDER = ["battery", "press", "table", "maker", "breaker", "cooler"];

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

function moduleSpeedMult() { return 1 + moduleBonuses().speed; }
function moduleCopperSave() { return moduleBonuses().copper; }
function moduleFactoryDiscount() { return moduleBonuses().price; }

function moduleOwnedCount(type) {
  var n = 0, i;
  for (i = 0; i < state.modules.length; i++) if (state.modules[i].type === type) n++;
  for (i = 0; i < state.moduleStock.length; i++) if (state.moduleStock[i].type === type) n++;
  return n;
}

function modulePrice(type) {
  return MODULES[type].price * Math.pow(MODULE_PRICE_GROWTH, moduleOwnedCount(type));
}

function floorNormalize() {
  if (!Array.isArray(state.modules)) state.modules = [];
  if (!Array.isArray(state.moduleStock)) state.moduleStock = [];
  state.floorTier = Math.max(1, Math.min(FLOOR_SIZES.length, Math.floor(state.floorTier || 1)));
  state.moduleStock = state.moduleStock.filter(function (s) { return s && MODULES[s.type]; })
    .map(function (s) { return { type: s.type, paid: Number(s.paid) || 0 }; });

  var kept = [];
  var maxId = 0;
  var all = state.modules;
  state.modules = [];
  for (var i = 0; i < all.length; i++) {
    var m = all[i];
    if (!m || !MODULES[m.type]) continue;
    var rot = m.rot ? 1 : 0;
    if (!canPlaceModule(m.type, rot, Math.floor(m.x), Math.floor(m.y))) continue;
    var clean = { id: Math.floor(m.id) || 0, type: m.type, x: Math.floor(m.x), y: Math.floor(m.y), rot: rot, paid: Number(m.paid) || 0 };
    if (!clean.id || kept.some(function (k) { return k.id === clean.id; })) clean.id = maxId + 1;
    maxId = Math.max(maxId, clean.id);
    kept.push(clean);
    state.modules.push(clean);
  }
  state.moduleNextId = Math.max(Math.floor(state.moduleNextId || 1), maxId + 1);
}

function floorHeldType() { return floorHold ? floorHold.type : null; }

function buyModule(type) {
  var price = modulePrice(type);
  if (state.funds < price) return;
  state.funds -= price;
  state.moduleStock.push({ type: type, paid: price });
  floorRender();
  render();
}

function floorFindStock(type) {
  for (var i = 0; i < state.moduleStock.length; i++) if (state.moduleStock[i].type === type) return i;
  return -1;
}

function floorPlaceHeld(x, y) {
  if (!floorHold) return;
  var idx = floorFindStock(floorHold.type);
  if (idx < 0) { floorHold = null; floorRender(); return; }
  if (!canPlaceModule(floorHold.type, floorHold.rot, x, y)) { floorSetHint("it doesn't fit there"); return; }
  var item = state.moduleStock.splice(idx, 1)[0];
  var m = { id: state.moduleNextId++, type: item.type, x: x, y: y, rot: floorHold.rot, paid: item.paid };
  state.modules.push(m);
  if (floorFindStock(floorHold.type) < 0) floorHold = null;
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
  state.moduleStock.push({ type: m.type, paid: m.paid });
  floorSelected = null;
  floorHold = thenHold ? { type: m.type, rot: m.rot } : null;
  floorRender();
  render();
}

function floorSell() {
  var m = floorSelectedModule();
  if (!m) return;
  var refund = m.paid * MODULE_SELL_REFUND;
  if (!window.confirm("Sell this " + MODULES[m.type].name + " for " + fmtMoney(refund) + "? (" + Math.round(MODULE_SELL_REFUND * 100) + "% of what you paid)")) return;
  state.modules = state.modules.filter(function (x) { return x.id !== m.id; });
  state.funds += refund;
  floorSelected = null;
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
var floorUi = { buy: {}, sellBtn: null, expandBtn: null };
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
  return m ? moduleInfoText(m) : "";
}

function fmtPct(x) { return Math.round(x * 1000) / 10 + "%"; }

function moduleInfoText(m) {
  var def = MODULES[m.type];
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

function floorCellClick(x, y, occupant) {
  if (floorHold) { floorPlaceHeld(x, y); return; }
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
        cell.textContent = MODULES[m.type].code;
        cell.title = MODULES[m.type].name;
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
  var body = el.floorBody;
  body.innerHTML = "";
  floorUi = { buy: {}, sellBtn: null, expandBtn: null };
  floorNormalize();
  var n = floorSize();

  var b = moduleBonuses();
  sheetAddHeading(body, "what your modules do");
  sheetAddRows(body, [
    ["factory speed", b.speed > 0 ? "+" + fmtPct(b.speed) : "\u2014"],
    ["copper per cycle", b.copper > 0 ? "\u2212" + fmtPct(b.copper) : "\u2014"],
    ["new factory price", b.price > 0 ? "\u2212" + fmtPct(b.price) : "\u2014"],
    ["maker yield", b.makerYield > 0 ? "+" + fmtPct(b.makerYield) : "\u2014"],
    ["breaker yield", b.breakerYield > 0 ? "+" + fmtPct(b.breakerYield) : "\u2014"]
  ]);

  sheetAddHeading(body, "floor (" + n + " \u00d7 " + n + ", Mk" + state.floorTier + ")");
  floorBuildGrid(body);

  var controls = fl("div", "admin-btns");
  controls.style.justifyContent = "center";
  if (floorHold) {
    floorBtn(controls, "rotate", floorRotate);
    floorBtn(controls, "cancel", function () { floorHold = null; floorRender(); });
  } else if (floorSelectedModule()) {
    var m = floorSelectedModule();
    if (MODULES[m.type].w !== MODULES[m.type].h) floorBtn(controls, "rotate", floorRotate);
    floorBtn(controls, "move", function () { floorPickUp(true); });
    floorBtn(controls, "pick up", function () { floorPickUp(false); });
    floorUi.sellBtn = floorBtn(controls, "sell for " + fmtMoney(m.paid * MODULE_SELL_REFUND), floorSell);
    floorBtn(controls, "cancel", function () { floorSelected = null; floorRender(); });
  }
  body.appendChild(controls);
  floorHintNode = fl("div", "hint", floorDefaultHint());
  floorHintNode.style.textAlign = "center";
  body.appendChild(floorHintNode);

  var counts = {};
  state.moduleStock.forEach(function (s) { counts[s.type] = (counts[s.type] || 0) + 1; });
  var stockTypes = MODULE_ORDER.filter(function (t) { return counts[t]; });
  if (stockTypes.length > 0) {
    sheetAddHeading(body, "in stock");
    var chips = fl("div", "admin-btns");
    stockTypes.forEach(function (t) {
      var chip = floorBtn(chips, MODULES[t].name + " " + MODULES[t].w + "\u00d7" + MODULES[t].h + " \u00d7" + counts[t], function () {
        floorHold = { type: t, rot: 0 };
        floorSelected = null;
        floorRender();
      });
      if (floorHold && floorHold.type === t) chip.classList.add("lb-tab-active");
    });
    body.appendChild(chips);
  }

  sheetAddHeading(body, "shop");
  MODULE_ORDER.forEach(function (t) {
    var def = MODULES[t];
    var row = fl("div", "row");
    row.appendChild(fl("span", "label", def.code + " \u00b7 " + def.name + " (" + def.w + "\u00d7" + def.h + ")"));
    var price = fl("span", "value", "");
    row.appendChild(price);
    body.appendChild(row);
    body.appendChild(fl("div", "hint", def.what.replace("{n}", fmtPct(def.amount || 0))));
    var wrap = fl("div", "admin-btns");
    var buy = floorBtn(wrap, "buy", function () { buyModule(t); });
    body.appendChild(wrap);
    floorUi.buy[t] = { btn: buy, price: price };
  });

  var cost = floorExpandCost();
  sheetAddHeading(body, "expand the floor");
  if ((state.floorTier || 1) >= FLOOR_SIZES.length || !cost) {
    sheetAddText(body, "the floor is at its largest");
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
  for (var t in floorUi.buy) {
    var price = modulePrice(t);
    floorUi.buy[t].price.textContent = fmtMoney(price);
    floorUi.buy[t].btn.disabled = state.funds < price;
  }
  if (floorUi.expandBtn) floorUi.expandBtn.disabled = !floorCanAfford(floorExpandCost());
}

function renderFloor() {
  if (!el.floorWrap) return;
  if (!state.unlockedFloor && state.factories >= FLOOR_UNLOCK_FACTORIES) state.unlockedFloor = true;
  el.floorWrap.style.display = state.unlockedFloor ? "" : "none";
  if (!state.unlockedFloor) return;
  var count = (state.modules || []).length;
  var label = "factory floor (" + count + " module" + (count === 1 ? "" : "s") + ")";
  if (el.btnFloor.textContent !== label) el.btnFloor.textContent = label;
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
