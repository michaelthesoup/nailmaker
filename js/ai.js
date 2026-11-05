"use strict";

var AI_MAX_TIER = 10;
var AI_PROC_BASE = 256;
var AI_PROC_TIER_MULT = 8;
var AI_MEM_BASE = 8192;
var AI_MEM_TIER_MULT = 8;
var AI_FILL_RATE = 0.05;
var AI_TELEMETRY = 32;
var AI_FEED_BASE = 16;
var AI_BUFF_COEF = 0.8;
var AI_BUFF_CAP = 6;
var AI_SMOOTH = 5;
var AI_HEAT_RUN = 40;
var AI_HEAT_REST = 30;
var AI_HEAT_RESUME = 0.3;
var AI_COOLER_POWER = 0.6;
var AI_TILE_TIER_PRICE = 10;
var AI_TILE_PRICE_GROWTH = 1.1;
var AI_NAME_MAX = 20;
var AI_HIST_LEN = 90;

var aiHist = [];
var aiHistAt = 0;
var aiUI = null;
var aiHeat = {};
var aiHot = {};
var aiHotCount = 0;

function aiFmtBytes(n) {
  var u = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
  var i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  if (i === 0) return Math.round(n) + " B";
  return (n >= 100 ? n.toFixed(0) : n.toFixed(1)) + " " + u[i];
}

function aiTierValue(type, tier) {
  if (type === "processor") return AI_PROC_BASE * Math.pow(AI_PROC_TIER_MULT, tier - 1);
  return AI_MEM_BASE * Math.pow(AI_MEM_TIER_MULT, tier - 1);
}

function aiTileCoolers(m) {
  var coolers = state.modules.filter(function (x) { return x.type === "cooler"; });
  return coolersTouching(m, coolers);
}

function aiPower() { return Math.max(0, Math.min(100, state.aiPower === undefined ? 100 : state.aiPower)) / 100; }

function aiCapacity() {
  var total = 0;
  var mods = state.modules || [];
  for (var i = 0; i < mods.length; i++) {
    if (mods[i].type === "memory") total += aiTierValue("memory", mods[i].tier || 1);
  }
  return total;
}

function aiData() { return Math.max(0, state.aiData || 0); }
function aiBurn() { return Math.max(0, state.aiBurn || 0); }
function aiBuff() { return Math.max(0, state.aiBuffNow || 0); }

function aiInflow() {
  var cap = aiCapacity();
  if (cap <= 0) return 0;
  var f = state.factoriesOn ? Math.max(0, state.factories || 0) : 0;
  return cap * AI_FILL_RATE + f * AI_TELEMETRY;
}

function aiProcessors() {
  var out = [];
  var mods = state.modules || [];
  for (var i = 0; i < mods.length; i++) if (mods[i].type === "processor") out.push(mods[i]);
  return out;
}

function aiBuffFor(burn) {
  var f = state.factoriesOn ? Math.max(0, state.factories || 0) : 0;
  if (f <= 0 || burn <= 0) return 0;
  return Math.min(AI_BUFF_CAP, AI_BUFF_COEF * Math.log10(1 + burn / f / AI_FEED_BASE));
}

function aiSub(dt) {
  var cap = aiCapacity();
  var mods = state.modules || [];
  var coolers = mods.filter(function (x) { return x.type === "cooler"; });
  var procs = aiProcessors();
  var data = aiData();

  var inflow = Math.min(aiInflow() * dt, Math.max(0, cap - data));
  data += inflow;

  var capacity = 0;
  procs.forEach(function (p) { if (!aiHot[p.id]) capacity += aiTierValue("processor", p.tier || 1); });
  var desired = capacity * aiPower();
  var burned = Math.min(desired * dt, data);
  data -= burned;
  var rate = dt > 0 ? burned / dt : 0;
  var util = capacity > 0 ? rate / capacity : 0;

  procs.forEach(function (p) {
    var h = aiHeat[p.id] || 0;
    var cool = coolersTouching(p, coolers);
    var running = !aiHot[p.id];
    var gain = running ? util / AI_HEAT_RUN : 0;
    var loss = cool * AI_COOLER_POWER / AI_HEAT_RUN + (util > 0 && running ? 0 : 1 / AI_HEAT_REST);
    h = Math.max(0, Math.min(1, h + (gain - loss) * dt));
    if (h >= 1) aiHot[p.id] = true;
    else if (aiHot[p.id] && h <= AI_HEAT_RESUME) aiHot[p.id] = false;
    aiHeat[p.id] = h;
  });

  state.aiData = Math.min(cap, data);
  var k = 1 - Math.exp(-dt / AI_SMOOTH);
  state.aiBurn = aiBurn() + (rate - aiBurn()) * k;
  state.aiBuffNow = aiBuffFor(state.aiBurn);
}

function aiTick(dt) {
  if (dt <= 0) return;
  var cap = aiCapacity();
  var live = {};
  aiProcessors().forEach(function (p) { live[p.id] = true; });
  Object.keys(aiHeat).forEach(function (id) { if (!live[id]) { delete aiHeat[id]; delete aiHot[id]; } });
  if (cap <= 0) {
    state.aiData = 0; state.aiBurn = 0; state.aiBuffNow = 0;
    aiHotCount = 0;
    return;
  }
  var steps = Math.min(120, Math.max(1, Math.ceil(dt / 2)));
  for (var i = 0; i < steps; i++) aiSub(dt / steps);
  aiHotCount = aiProcessors().filter(function (p) { return aiHot[p.id]; }).length;
}

function aiTileInfoText(m) {
  var def = MODULES[m.type];
  var tier = m.tier || 1;
  if (m.type === "memory") return def.name + " tier " + tier + ": holds " + aiFmtBytes(aiTierValue("memory", tier)) + " and collects " + aiFmtBytes(aiTierValue("memory", tier) * AI_FILL_RATE) + " of data per second.";
  var n = aiTileCoolers(m);
  var rate = aiTierValue("processor", tier);
  var h = aiHeat[m.id] || 0;
  return def.name + " tier " + tier + ": burns " + aiFmtBytes(rate) + " of data per second (" + n + " cooler" + (n === 1 ? "" : "s") + " touching). heat " + Math.round(h * 100) + "%" + (aiHot[m.id] ? ", overheated" : "") + ".";
}

function aiMergeCost() { return 0; }

function aiMergePartner(m) {
  if (!MODULES[m.type].tiered) return null;
  var tier = m.tier || 1;
  if (tier >= AI_MAX_TIER) return null;
  var mods = state.modules;
  for (var i = 0; i < mods.length; i++) {
    var o = mods[i];
    if (o.id !== m.id && o.type === m.type && (o.tier || 1) === tier && modulesTouch(m, o)) return o;
  }
  return null;
}

function aiCleanName(s) {
  return String(s || "").replace(/[\u0000-\u001f<>]/g, "").slice(0, AI_NAME_MAX);
}

function aiDisplayName() { return aiCleanName(state.aiName) || "artificial intelligence"; }

function aiBuffText() {
  var b = aiBuff();
  if (b <= 0) return "no buff";
  if (b < 10) return "+" + Math.round(b * 100) + "%";
  return "\u00d7" + Math.round(1 + b).toLocaleString("en-US");
}

function aiStatusText() {
  var cap = aiCapacity();
  if (cap <= 0) return "no memory yet. buy some in the motherboard.";
  var procs = aiProcessors().length;
  if (procs <= 0) return "no processors yet. data piles up unused.";
  if (aiPower() <= 0) return "paused, saving data";
  if (aiHotCount >= procs) return "all processors overheated, add coolers";
  if (aiHotCount > 0) return aiHotCount + " of " + procs + " processors overheated";
  if (aiData() <= 1) return "starved: no data to burn";
  if (!(state.factories > 0)) return "no factories to buff";
  if (aiData() >= cap * 0.999) return "memory full: collecting has stopped";
  return "burning data to buff the factories";
}

function aiSample() {
  var now = Date.now();
  if (now - aiHistAt < 1000) return;
  aiHistAt = now;
  var cap = aiCapacity();
  aiHist.push({ fill: cap > 0 ? aiData() / cap : 0 });
  while (aiHist.length > AI_HIST_LEN) aiHist.shift();
}

function aiDrawGraph() {
  var c = aiUI.canvas;
  var ctx = c.getContext("2d");
  var w = c.width, h = c.height;
  var cs = getComputedStyle(document.body);
  var ink = (cs.getPropertyValue("--ink") || "#000").trim() || "#000";
  var paper = (cs.getPropertyValue("--paper") || "#fff").trim() || "#fff";
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 1;
  for (var g = 1; g < 4; g++) {
    var gy = Math.round(h * g / 4) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  var n = aiHist.length;
  if (n >= 2) {
    var step = w / (AI_HIST_LEN - 1);
    var x0 = w - (n - 1) * step;
    var series = function (get, alpha) {
      ctx.beginPath();
      ctx.moveTo(x0, h);
      for (var i = 0; i < n; i++) ctx.lineTo(x0 + i * step, h - 2 - get(aiHist[i]) * (h - 4));
      ctx.lineTo(x0 + (n - 1) * step, h);
      ctx.closePath();
      ctx.fillStyle = ink;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (var j = 0; j < n; j++) {
        var px = x0 + j * step, py = h - 2 - get(aiHist[j]) * (h - 4);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };
    series(function (s) { return s.fill; }, 0.25);
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

var AI_GLYPH_KEYS = ["battery", "press", "table", "cooler"];
var AI_GLYPH_PATHS = null;
var AI_GLYPH_SEED = 0;
var AI_BUY_COPPER = 1000000;
var AI_UNLOCK_FACTORIES = 5;

function aiGlyphKey(type, tier) {
  return MODULES[type] && MODULES[type].tiered ? type + ":" + (tier || 1) : type;
}

function aiHashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function aiGlyphNodes(key) {
  if (key.indexOf(":") > 0) return parseInt(key.split(":")[1], 10) + 2;
  return { battery: 4, press: 5, table: 6, cooler: 3 }[key] || 4;
}

function aiGlyphBuild(key, bump) {
  var s = (aiHashStr(key) + Math.imul(state.aiGlyphSeed, 2654435761) + bump * 7919) >>> 0;
  function rnd() {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  var want = aiGlyphNodes(key);
  var nodes = [[Math.floor(rnd() * 6), Math.floor(rnd() * 6)]];
  var edges = [];
  var tries = 0;
  while (nodes.length < want && tries++ < 400) {
    var from = nodes[Math.floor(rnd() * nodes.length)];
    var d = dirs[Math.floor(rnd() * dirs.length)];
    var len = 1 + (rnd() < 0.3 ? 1 : 0);
    var nx = from[0] + d[0] * len, ny = from[1] + d[1] * len;
    if (nx < 0 || ny < 0 || nx > 5 || ny > 5) continue;
    if (nodes.some(function (n) { return n[0] === nx && n[1] === ny; })) continue;
    nodes.push([nx, ny]);
    edges.push([from[0], from[1], nx, ny]);
  }
  var minX = Math.min.apply(null, nodes.map(function (n) { return n[0]; }));
  var minY = Math.min.apply(null, nodes.map(function (n) { return n[1]; }));
  var sig = edges.map(function (e) {
    var p = [e[0] - minX, e[1] - minY], q = [e[2] - minX, e[3] - minY];
    return p < q ? p + ">" + q : q + ">" + p;
  }).sort().join("|");
  return { nodes: nodes, edges: edges, sig: sig, count: nodes.length };
}

function aiGlyphInit() {
  if (!state.aiGlyphSeed) state.aiGlyphSeed = 1 + Math.floor(Math.random() * 2000000000);
  AI_GLYPH_SEED = state.aiGlyphSeed;
  AI_GLYPH_PATHS = {};
  var keys = AI_GLYPH_KEYS.slice();
  ["processor", "memory"].forEach(function (tp) { for (var tr = 1; tr <= AI_MAX_TIER; tr++) keys.push(tp + ":" + tr); });
  var seen = {};
  keys.forEach(function (key) {
    var g, bump = 0;
    do { g = aiGlyphBuild(key, bump++); } while ((seen[g.sig] || g.count < aiGlyphNodes(key)) && bump < 300);
    seen[g.sig] = true;
    AI_GLYPH_PATHS[key] = g;
  });
}

function aiGlyph(key, px) {
  if (!AI_GLYPH_PATHS || AI_GLYPH_SEED !== state.aiGlyphSeed || !state.aiGlyphSeed) aiGlyphInit();
  var g = AI_GLYPH_PATHS[key];
  var ns = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.setAttribute("width", px);
  svg.setAttribute("height", px);
  svg.style.display = "block";
  svg.style.pointerEvents = "none";
  if (!g) return svg;
  var xs = g.nodes.map(function (n) { return n[0]; }), ys = g.nodes.map(function (n) { return n[1]; });
  var cx0 = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy0 = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
  function ptx(v) { return 20 + (v - cx0) * 6.4; }
  function pty(v) { return 20 + (v - cy0) * 6.4; }
  g.edges.forEach(function (e) {
    var l = document.createElementNS(ns, "line");
    l.setAttribute("x1", ptx(e[0])); l.setAttribute("y1", pty(e[1]));
    l.setAttribute("x2", ptx(e[2])); l.setAttribute("y2", pty(e[3]));
    l.setAttribute("stroke", "currentColor"); l.setAttribute("stroke-width", "1.8"); l.setAttribute("stroke-linecap", "round");
    svg.appendChild(l);
  });
  g.nodes.forEach(function (n) {
    var c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", ptx(n[0])); c.setAttribute("cy", pty(n[1])); c.setAttribute("r", "2.4");
    c.setAttribute("fill", "currentColor");
    svg.appendChild(c);
  });
  return svg;
}

function aiMake(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function aiBuildUI() {
  var section = document.getElementById("aiSection");
  if (!section) return;
  var st = document.createElement("style");
  st.textContent =
    ".ai-name { width: 100%; box-sizing: border-box; font-size: 12px; padding: 3px 5px; border: 1px solid var(--ink); background: var(--paper); color: var(--ink); text-align: center; }" +
    ".ai-big { font-size: 26px; font-weight: bold; text-align: center; margin: 8px 0 0; letter-spacing: 1px; }" +
    ".ai-cap { font-size: 10px; opacity: 0.6; text-align: center; margin-bottom: 8px; }" +
    ".ai-bar { height: 16px; border: 1px solid var(--ink); position: relative; margin-top: 4px; }" +
    ".ai-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); opacity: 0.35; }" +
    ".ai-bar span { position: absolute; left: 0; right: 0; top: 0; line-height: 16px; font-size: 10px; text-align: center; }" +
    ".ai-line { display: flex; justify-content: space-between; font-size: 11px; margin-top: 5px; }" +
    ".ai-status { font-size: 10px; opacity: 0.65; text-align: center; margin-top: 3px; }" +
    ".ai-canvas { display: block; width: 100%; height: 64px; margin-top: 6px; }";
  document.head.appendChild(st);
  var body = section.querySelector(".panel-body");
  body.innerHTML = "";

  var nameIn = aiMake("input", "ai-name");
  nameIn.type = "text";
  nameIn.maxLength = AI_NAME_MAX;
  nameIn.placeholder = "name your AI";
  nameIn.addEventListener("input", function () {
    state.aiName = aiCleanName(nameIn.value);
    aiUI.header.textContent = aiDisplayName();
  });
  body.appendChild(nameIn);

  var big = aiMake("div", "ai-big");
  var cap = aiMake("div", "ai-cap", "factory speed");
  body.appendChild(big);
  body.appendChild(cap);

  var barLabel = aiMake("div", "ai-line");
  barLabel.appendChild(aiMake("span", "", "memory"));
  var barPct = aiMake("span");
  barLabel.appendChild(barPct);
  body.appendChild(barLabel);
  var bar = aiMake("div", "ai-bar");
  var fill = aiMake("i");
  var barText = aiMake("span");
  bar.appendChild(fill); bar.appendChild(barText);
  body.appendChild(bar);

  var canvas = aiMake("canvas", "ai-canvas");
  canvas.width = 300;
  canvas.height = 64;
  body.appendChild(canvas);
  body.appendChild(aiMake("div", "ai-cap", "memory used, last 90 seconds"));

  var flow = aiMake("div", "ai-line");
  var flowIn = aiMake("span");
  var flowOut = aiMake("span");
  flow.appendChild(flowIn); flow.appendChild(flowOut);
  body.appendChild(flow);
  var flowHot = aiMake("div", "ai-cap");
  flowHot.style.marginTop = "4px";
  flowHot.style.marginBottom = "0";
  body.appendChild(flowHot);
  var status = aiMake("div", "ai-status");
  body.appendChild(status);

  var wrap = aiMake("div", "balance-slider-wrap");
  var labels = aiMake("div", "balance-slider-labels");
  labels.appendChild(aiMake("span", "", "○ idle"));
  var lPow = aiMake("span");
  labels.appendChild(lPow);
  var slider = document.createElement("input");
  slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.step = "5";
  slider.style.accentColor = "var(--ink)";
  slider.style.width = "100%";
  slider.addEventListener("input", function () { state.aiPower = parseInt(slider.value, 10); render(); });
  wrap.appendChild(labels); wrap.appendChild(slider);
  body.appendChild(wrap);

  var open = aiMake("button", "", "motherboard");
  open.style.width = "100%";
  open.style.marginTop = "8px";
  open.addEventListener("click", function () { floorOpenScreen(); });
  body.appendChild(open);

  aiUI = { section: section, header: section.querySelector(".panel-header"), nameIn: nameIn, big: big, fill: fill, flowHot: flowHot, barText: barText, barPct: barPct, canvas: canvas, flowIn: flowIn, flowOut: flowOut, status: status, slider: slider, lPow: lPow };
}

function renderAI() {
  var section = document.getElementById("aiSection");
  if (!section) return;
  if (!aiUI) aiBuildUI();
  if (!state.aiOwned && ((state.modules && state.modules.length) || (state.moduleStock && state.moduleStock.length))) state.aiOwned = true;
  var buyWrap = document.getElementById("aiBuyWrap");
  var buyBtn = document.getElementById("btnBuyAI");
  if (buyWrap && buyBtn) {
    buyWrap.style.display = !state.aiOwned && state.factories >= AI_UNLOCK_FACTORIES ? "" : "none";
    buyBtn.textContent = "buy artificial intelligence (" + fmtWeight(AI_BUY_COPPER) + ")";
    buyBtn.disabled = state.copperAmt < AI_BUY_COPPER;
    if (!buyBtn.dataset.bound) {
      buyBtn.dataset.bound = "1";
      buyBtn.addEventListener("click", function () {
        if (state.aiOwned || state.copperAmt < AI_BUY_COPPER) return;
        state.copperAmt -= AI_BUY_COPPER;
        state.aiOwned = true;
        render();
      });
    }
  }
  section.style.display = state.aiOwned ? "" : "none";
  if (!state.aiOwned || !aiUI) return;
  var u = aiUI;
  var cap = aiCapacity();
  var pct = cap > 0 ? aiData() / cap : 0;
  u.header.textContent = aiDisplayName();
  if (document.activeElement !== u.nameIn && u.nameIn.value !== aiCleanName(state.aiName)) u.nameIn.value = aiCleanName(state.aiName);
  u.big.textContent = aiBuffText();
  if (el.factoryBonus) el.factoryBonus.textContent = aiBuff() > 0 ? " " + aiBuffText() : "";
  u.fill.style.width = (pct * 100) + "%";
  u.barText.textContent = aiFmtBytes(aiData()) + " / " + aiFmtBytes(cap);
  u.barPct.textContent = Math.round(pct * 100) + "%";
  u.flowIn.textContent = "collecting +" + aiFmtBytes(aiInflow()) + "/s";
  u.flowOut.textContent = "burning \u2212" + aiFmtBytes(aiBurn()) + "/s";
  u.flowHot.textContent = aiProcessors().length > 0 ? "overheated " + aiHotCount + " of " + aiProcessors().length : "";
  u.status.textContent = aiStatusText();
  if (document.activeElement !== u.slider) u.slider.value = state.aiPower === undefined ? 100 : state.aiPower;
  u.lPow.innerHTML = "<b>" + Math.round(aiPower() * 100) + "%</b> power \u25cf";
  aiSample();
  aiDrawGraph();
}
