"use strict";

var AI_MAX_TIER = 10;
var AI_PROC_BASE = 256;
var AI_PROC_TIER_MULT = 8;
var AI_MEM_BASE = 8192;
var AI_MEM_TIER_MULT = 8;
var AI_TELEMETRY = 8;
var AI_CTL_BASE = 256;
var AI_CTL_TIER_MULT = 8;
var AI_PORTS = 4;
var AI_FEED_BASE = 16;
var AI_BUFF_COEF = 0.8;
var AI_BUFF_CAP = 6;
var AI_MB_SHARE = 0.5;
var AI_SMOOTH = 5;
var AI_LOG_MAX = 60;
var AI_TILE_TIER_PRICE = 10;
var AI_TILE_PRICE_GROWTH = 1.1;
var AI_NAME_MAX = 20;
var AI_HIST_LEN = 90;

var aiHist = [];
var aiHistAt = 0;
var aiUI = null;

function aiFmtBytes(n) {
  var u = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
  var i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  if (i === 0) return Math.round(n) + " B";
  return (n >= 100 ? n.toFixed(0) : n.toFixed(1)) + " " + u[i];
}

function aiTierValue(type, tier) {
  if (type === "processor") return AI_PROC_BASE * Math.pow(AI_PROC_TIER_MULT, tier - 1);
  if (type === "controller") return AI_CTL_BASE * Math.pow(AI_CTL_TIER_MULT, tier - 1);
  return AI_MEM_BASE * Math.pow(AI_MEM_TIER_MULT, tier - 1);
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

function aiMemories() {
  var out = [], mods = state.modules || [];
  for (var i = 0; i < mods.length; i++) if (mods[i].type === "memory") out.push(mods[i]);
  return out;
}

function aiKeep() {
  var cap = aiCapacity();
  return cap > 0 ? Math.max(0, 1 - aiModelBytes() / cap) : 0;
}

function aiUsable(m) { return aiTierValue("memory", m.tier || 1) * aiKeep(); }

function aiData() {
  var n = 0, mems = aiMemories(), keep = aiKeep();
  for (var i = 0; i < mems.length; i++) {
    var u = aiTierValue("memory", mems[i].tier || 1) * keep;
    n += mems[i].data === undefined ? u : Math.min(u, Math.max(0, mems[i].data));
  }
  return n;
}

function aiSpendData(amount) {
  var mems = aiMemories(), total = aiData();
  if (total <= 0 || amount <= 0) return;
  var f = Math.max(0, 1 - amount / total);
  mems.forEach(function (m) {
    var u = aiUsable(m);
    m.data = (m.data === undefined ? u : Math.min(u, Math.max(0, m.data))) * f;
  });
  state.aiData = aiData();
}

function aiBurn() { return Math.max(0, state.aiBurn || 0); }
function aiBuff() { return Math.max(0, state.aiBuffNow || 0); }

function aiInflow() {
  if (aiCapacity() <= 0) return 0;
  return aiMachines() * AI_TELEMETRY;
}

function aiControllers() {
  var out = [], mods = state.modules || [];
  for (var i = 0; i < mods.length; i++) if (mods[i].type === "controller") out.push(mods[i]);
  return out;
}

function aiGraph() {
  var byId = {}, mems = [], procs = [], ctls = [], pm = {}, pc = {};
  (state.modules || []).forEach(function (m) {
    byId[m.id] = m;
    if (m.type === "memory") mems.push(m);
    else if (m.type === "processor") procs.push(m);
    else if (m.type === "controller") ctls.push(m);
  });
  (state.wires || []).forEach(function (w) {
    var a = byId[w[0]], b = byId[w[1]];
    if (!a || !b) return;
    if (a.type === "processor") { var t = a; a = b; b = t; }
    if (b.type !== "processor") return;
    if (a.type === "memory") (pm[b.id] = pm[b.id] || []).push(a);
    else if (a.type === "controller") (pc[b.id] = pc[b.id] || []).push(a);
  });
  return { mems: mems, procs: procs, ctls: ctls, pm: pm, pc: pc };
}

function aiActiveProcessors() {
  var g = aiGraph();
  return g.procs.filter(function (p) { return g.pm[p.id] && g.pc[p.id]; });
}

function aiProcessors() {
  var out = [];
  var mods = state.modules || [];
  for (var i = 0; i < mods.length; i++) if (mods[i].type === "processor") out.push(mods[i]);
  return out;
}

function aiTotalLevels() { return typeof trainTotalLevels === "function" ? trainTotalLevels() : 0; }
function aiModelBytes() { return typeof trainModelBytes === "function" ? trainModelBytes() : 0; }
function aiDataCap() { return Math.max(0, aiCapacity() - aiModelBytes()); }

function aiBuffFor(burn) {
  var f = state.factoriesOn ? Math.max(0, state.factories || 0) : 0;
  if (f <= 0 || burn <= 0) return 0;
  var bonus = typeof trainLevel === "function" && trainLevel("bytes") >= 1 ? 1 + 0.25 * aiBalance() : 1;
  return Math.min(AI_BUFF_CAP, AI_BUFF_COEF * Math.log10(1 + burn / f / AI_FEED_BASE) * bonus);
}

function aiFill() {
  var cap = aiDataCap();
  return cap > 0 ? Math.max(0, Math.min(1, aiData() / cap)) : 0;
}

function aiBalance() { return 1 - Math.abs(2 * aiFill() - 1); }

function aiBits() {
  var ones = Math.round(aiFill() * 8), out = "";
  for (var i = 0; i < 8; i++) out += Math.floor((i + 1) * ones / 8) - Math.floor(i * ones / 8) ? "1" : "0";
  return out.slice(0, 4) + " " + out.slice(4);
}

var aiW = [1, 0, 0];
var AI_TARGETS = ["factories", "makers", "breakers"];

var aiWantAuto = [1, 0, 0];
var aiThinkClock = 0;
var aiLog = [];
var aiLogVersion = 0;

function aiSay(text) {
  var t = Math.floor(state.simTime || 0);
  var last = aiLog[aiLog.length - 1];
  if (last && last.text === text && t - last.t < 10) return;
  aiLog.push({ t: t, text: text });
  while (aiLog.length > AI_LOG_MAX) aiLog.shift();
  aiLogVersion++;
}

function aiProcPower() {
  var p = 0;
  aiActiveProcessors().forEach(function (x) { p += Math.pow(1.6, (x.tier || 1) - 1); });
  return p;
}

function aiMachines() { return Math.max(0, state.nailMakers || 0) + Math.max(0, state.breakers || 0) + Math.max(0, state.factories || 0); }
function aiLoad() { return Math.log2(1 + aiMachines()); }
function aiKnow() { return aiTotalLevels() + (typeof trainEconomyLevel === "function" ? trainEconomyLevel() : 0); }
function aiPf() { return 1 + 0.35 * Math.log2(1 + aiProcPower()); }
function aiRho() { return aiKnow() / Math.max(1, aiLoad() / aiPf()); }
function aiSure() { var r = aiRho(); return r / (r + 0.5); }
function aiHandles() { var k = aiKnow(); return k <= 0 ? 0 : Math.pow(2, aiPf() * k / 1.5) - 1; }

function aiAutoReady() { return typeof trainEconomyLevel === "function" && trainEconomyLevel() >= 1 && aiProcessors().length > 0; }
function aiAutoOn() { return !!state.aiAuto && aiAutoReady(); }

function aiSignals() {
  var per = typeof IRON_PER_NAIL === "number" ? IRON_PER_NAIL : 1;
  var iron = Math.max(0, state.ironAmt || 0) / per;
  var nails = Math.max(0, state.unsold || 0);
  var fcost = typeof factoryCopperCostEffective === "function" ? factoryCopperCostEffective() : 0;
  var ref = Math.max(1, fcost * Math.max(1, state.factories || 0) * 4);
  var copper = Math.max(0, state.copperAmt || 0);
  return { d: (nails - iron) / (nails + iron + 1), c: copper / (copper + ref), n: nails / (nails + iron + 1), i: iron / (nails + iron + 1) };
}

function aiGauss() {
  var u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function aiThink() {
  var g = aiSignals();
  var sc = [Math.max(0, g.c - 0.5) * 2, Math.max(0, -g.d), Math.max(0, g.d) + Math.max(0, 0.5 - g.c) * 2];
  var rho = aiRho();
  var sigma = 0.7 / (1 + rho);
  var sharp = 0.5 + 2.2 * rho;
  var noisy = sc.map(function (v) { return v + aiGauss() * sigma; });
  var top = Math.max(noisy[0], noisy[1], noisy[2]);
  var ex = noisy.map(function (v) { return Math.exp(sharp * (v - top)); });
  var sum = ex[0] + ex[1] + ex[2];
  var w = [ex[0] / sum, ex[1] / sum, ex[2] / sum];
  aiWantAuto = w;
  var best = w[0] >= w[1] && w[0] >= w[2] ? 0 : (w[1] >= w[2] ? 1 : 2);
  var pc = function (v) { return Math.round(v * 100) + "%"; };
  aiSay("iron " + pc(g.i) + " nails " + pc(g.n) + " copper " + pc(g.c) + " -> " + (w[best] < 0.5 ? "can't tell, spreading the buff" : "buff " + AI_TARGETS[best] + " (" + pc(w[best]) + " sure)"));
}

function aiThinkStep(dt) {
  if (!aiAutoOn()) { aiThinkClock = 0; return; }
  aiThinkClock -= dt;
  if (aiThinkClock > 0) return;
  aiThink();
  aiThinkClock = Math.max(3, Math.min(30, 30 / (1 + 0.5 * aiProcPower())));
}

function aiWanted() {
  if (aiAutoOn()) return aiWantAuto;
  var k = AI_TARGETS.indexOf(state.aiTarget);
  var w = [0, 0, 0];
  w[k < 0 ? 0 : k] = 1;
  return w;
}

function aiWeightStep(dt) {
  var want = aiWanted();
  var k = 1 - Math.exp(-dt / (aiAutoOn() ? 4 : 3));
  for (var i = 0; i < 3; i++) aiW[i] += (want[i] - aiW[i]) * k;
}

function aiFactoryBuff() { return aiBuff() * aiW[0]; }
function aiMakerBuff() { return aiBuff() * AI_MB_SHARE * aiW[1]; }
function aiBreakerBuff() { return aiBuff() * AI_MB_SHARE * aiW[2]; }

function aiSub(dt, g) {
  var keep = aiKeep();
  var free = 0;
  g.mems.forEach(function (m) {
    var u = aiTierValue("memory", m.tier || 1) * keep;
    if (m.data === undefined || m.data > u) m.data = u;
    if (m.data < 0) m.data = 0;
    free += u - m.data;
  });
  var inflow = Math.min(aiInflow() * dt, free);
  if (inflow > 0 && free > 0) {
    g.mems.forEach(function (m) {
      var u = aiTierValue("memory", m.tier || 1) * keep;
      m.data += inflow * (u - m.data) / free;
    });
  }

  var left = {};
  g.ctls.forEach(function (c) { left[c.id] = aiTierValue("controller", c.tier || 1) * dt; });
  var power = aiPower(), used = 0;
  g.procs.forEach(function (p) {
    var ms = g.pm[p.id], cs = g.pc[p.id];
    if (!ms || !cs) return;
    var have = 0;
    ms.forEach(function (m) { have += m.data; });
    var avail = Math.min(aiTierValue("processor", p.tier || 1) * power * dt, have);
    if (avail <= 0) return;
    var take = 0, remain = avail;
    var open = cs.filter(function (c) { return left[c.id] > 1e-9; });
    for (var pass = 0; pass < 3 && remain > 1e-9 && open.length; pass++) {
      var share = remain / open.length;
      open.forEach(function (c) {
        var amt = Math.min(share, left[c.id]);
        left[c.id] -= amt; take += amt; remain -= amt;
      });
      open = open.filter(function (c) { return left[c.id] > 1e-9; });
    }
    if (take <= 0) return;
    ms.forEach(function (m) { m.data -= take * m.data / have; });
    used += take;
  });
  var rate = dt > 0 ? used / dt : 0;

  var k = 1 - Math.exp(-dt / AI_SMOOTH);
  state.aiBurn = aiBurn() + (rate - aiBurn()) * k;
  state.aiBuffNow = aiBuffFor(state.aiBurn);
  aiWeightStep(dt);
}

function aiTick(dt) {
  if (dt <= 0) return;
  var cap = aiCapacity();
  if (cap <= 0) {
    state.aiData = 0; state.aiBurn = 0; state.aiBuffNow = 0;
    return;
  }
  var g = aiGraph();
  var steps = Math.min(120, Math.max(1, Math.ceil(dt / 2)));
  for (var i = 0; i < steps; i++) aiSub(dt / steps, g);
  state.aiData = aiData();
  aiThinkStep(dt);
}

function aiTileInfoText(m) {
  var def = MODULES[m.type];
  var tier = m.tier || 1;
  if (m.type === "memory") return def.name + " tier " + tier + ": holds " + aiFmtBytes(aiTierValue("memory", tier)) + ", " + aiFmtBytes(m.data === undefined ? aiUsable(m) : m.data) + " in it now. processors wired to it read it, and your machines slowly refill it.";
  if (m.type === "controller") return def.name + " tier " + tier + ": turns up to " + aiFmtBytes(aiTierValue("controller", tier)) + " per second of what the processors work out into buff.";
  var rate = aiTierValue("processor", tier);
  return def.name + " tier " + tier + ": turns " + aiFmtBytes(rate) + " of data per second into buff.";
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
  if (procs <= 0) return "no processors yet. add one in the motherboard.";
  if (aiControllers().length <= 0) return "no controller yet. add one in the motherboard.";
  if (aiActiveProcessors().length <= 0) return "wire a memory, a processor and a controller together in the motherboard.";
  if (aiPower() <= 0) return "paused, saving data";
  if (aiData() <= 1) return "memory is empty. your machines refill it slowly.";
  if (!(state.factories > 0)) return "no factories to buff";
  return "turning data into buff";
}

function aiSample() {
  var now = Date.now();
  if (now - aiHistAt < 1000) return;
  aiHistAt = now;
  var cap = aiCapacity();
  aiHist.push({ fill: aiFill() });
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

var AI_GLYPH_KEYS = ["battery", "press", "table"];
var AI_GLYPH_PATHS = null;
var AI_GLYPH_SEED = 0;
var AI_BUY_COPPER = 1;
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
  return { battery: 4, press: 5, table: 6 }[key] || 4;
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
  ["processor", "memory", "controller"].forEach(function (tp) { for (var tr = 1; tr <= AI_MAX_TIER; tr++) keys.push(tp + ":" + tr); });
  var seen = {};
  keys.forEach(function (key) {
    var g, bump = 0;
    do { g = aiGlyphBuild(key, bump++); } while ((seen[g.sig] || g.count < aiGlyphNodes(key)) && bump < 300);
    seen[g.sig] = true;
    AI_GLYPH_PATHS[key] = g;
  });
}

function aiGlyphPoints(key) {
  if (!AI_GLYPH_PATHS || AI_GLYPH_SEED !== state.aiGlyphSeed || !state.aiGlyphSeed) aiGlyphInit();
  var g = AI_GLYPH_PATHS[key];
  if (!g) return { cx0: 0, cy0: 0, pts: [] };
  var xs = g.nodes.map(function (n) { return n[0]; }), ys = g.nodes.map(function (n) { return n[1]; });
  var cx0 = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy0 = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
  return { cx0: cx0, cy0: cy0, pts: g.nodes.map(function (n) { return [20 + (n[0] - cx0) * 6.4, 20 + (n[1] - cy0) * 6.4]; }) };
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
  var pt = aiGlyphPoints(key);
  var cx0 = pt.cx0, cy0 = pt.cy0;
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
    ".ai-canvas { display: block; width: 100%; height: 64px; margin-top: 6px; }" +
    ".ai-log { margin-top: 8px; height: 92px; overflow-y: auto; border: 1px solid var(--ink); padding: 4px 6px; box-sizing: border-box; font-family: monospace; font-size: 10px; line-height: 1.45; }" +
    ".ai-log div { white-space: normal; word-break: break-word; }" +
    ".ai-log span { opacity: 0.5; margin-right: 6px; }";
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

  var status = aiMake("div", "ai-status");
  status.style.marginTop = "8px";
  body.appendChild(status);

  var gMem = aiMake("div");
  body.appendChild(gMem);
  var big = aiMake("div", "ai-big");
  var capLine = aiMake("div", "ai-cap", "buff to share out");
  gMem.appendChild(big);
  gMem.appendChild(capLine);

  var barLabel = aiMake("div", "ai-line");
  barLabel.appendChild(aiMake("span", "", "memory"));
  var barPct = aiMake("span");
  barLabel.appendChild(barPct);
  gMem.appendChild(barLabel);
  var bar = aiMake("div", "ai-bar");
  var fill = aiMake("i");
  var barText = aiMake("span");
  bar.appendChild(fill); bar.appendChild(barText);
  gMem.appendChild(bar);

  var canvas = aiMake("canvas", "ai-canvas");
  canvas.width = 300;
  canvas.height = 64;
  gMem.appendChild(canvas);
  gMem.appendChild(aiMake("div", "ai-cap", "memory used, last 90 seconds"));

  var flow = aiMake("div", "ai-line");
  var flowIn = aiMake("span");
  var flowOut = aiMake("span");
  flow.appendChild(flowIn); flow.appendChild(flowOut);
  gMem.appendChild(flow);
  var balanceLine = aiMake("div", "ai-status");
  gMem.appendChild(balanceLine);

  var gPower = aiMake("div");
  body.appendChild(gPower);
  var wrap = aiMake("div", "balance-slider-wrap");
  var labels = aiMake("div", "balance-slider-labels");
  labels.appendChild(aiMake("span", "", "\u25cb idle"));
  var lPow = aiMake("span");
  labels.appendChild(lPow);
  var slider = document.createElement("input");
  slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.step = "5";
  slider.style.accentColor = "var(--ink)";
  slider.style.width = "100%";
  slider.addEventListener("input", function () { state.aiPower = parseInt(slider.value, 10); render(); });
  wrap.appendChild(labels); wrap.appendChild(slider);
  gPower.appendChild(wrap);

  var gThink = aiMake("div");
  body.appendChild(gThink);
  var knowLine = aiMake("div", "ai-status");
  knowLine.style.marginTop = "8px";
  gThink.appendChild(knowLine);
  var splitLine = aiMake("div", "ai-status");
  gThink.appendChild(splitLine);
  var targetRow = aiMake("div");
  targetRow.style.cssText = "display:flex;gap:4px;margin-top:6px";
  var targets = AI_TARGETS.map(function (name) {
    var b = aiMake("button", "", name);
    b.style.cssText = "flex:1;font-size:11px;padding:2px 0";
    b.addEventListener("click", function () {
      state.aiTarget = name;
      if (state.aiAuto) { state.aiAuto = false; aiSay("auto-balance off"); }
      aiSay("manual: buffing " + name);
      render();
    });
    targetRow.appendChild(b);
    return b;
  });
  gThink.appendChild(targetRow);
  var autoBtn = aiMake("button", "", "auto-balance");
  autoBtn.style.cssText = "width:100%;margin-top:4px";
  autoBtn.addEventListener("click", function () {
    if (!aiAutoReady()) return;
    state.aiAuto = !state.aiAuto;
    aiThinkClock = 0;
    aiSay(state.aiAuto ? "auto-balance on. thinking for myself" : "auto-balance off");
    render();
  });
  gThink.appendChild(autoBtn);
  var logBox = aiMake("div", "ai-log");
  gThink.appendChild(logBox);

  var open = aiMake("button", "", "motherboard");
  open.style.width = "100%";
  open.style.marginTop = "8px";
  open.addEventListener("click", function () { floorOpenScreen(); });
  body.appendChild(open);

  var train = aiMake("button", "", "training program");
  train.style.width = "100%";
  train.style.marginTop = "6px";
  train.addEventListener("click", function () { trainOpenScreen(); });
  body.appendChild(train);

  aiUI = { section: section, header: section.querySelector(".panel-header"), nameIn: nameIn, big: big, fill: fill, barText: barText, barPct: barPct, canvas: canvas, flowIn: flowIn, flowOut: flowOut, status: status, balanceLine: balanceLine, knowLine: knowLine, splitLine: splitLine, targets: targets, targetRow: targetRow, autoBtn: autoBtn, logBox: logBox, logSeen: -1, slider: slider, lPow: lPow, gMem: gMem, gPower: gPower, gThink: gThink, train: train };
}

function aiFmtClock(t) {
  var h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return (h ? h + ":" : "") + (m < 10 && h ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

function aiRenderLog() {
  var u = aiUI;
  if (u.logSeen === aiLogVersion) return;
  u.logSeen = aiLogVersion;
  var box = u.logBox;
  var stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
  box.innerHTML = "";
  aiLog.forEach(function (line) {
    var row = document.createElement("div");
    var stamp = document.createElement("span");
    stamp.textContent = aiFmtClock(line.t);
    row.appendChild(stamp);
    row.appendChild(document.createTextNode(line.text));
    box.appendChild(row);
  });
  if (stick) box.scrollTop = box.scrollHeight;
}

function renderAI() {
  var section = document.getElementById("aiSection");
  if (!section) return;
  if (!aiUI) aiBuildUI();
  if (state.aiOwned && !state.aiPipeline && typeof floorMigratePipeline === "function") floorMigratePipeline();
  if (!state.aiOwned && ((state.modules && state.modules.length) || (state.moduleStock && state.moduleStock.length))) state.aiOwned = true;
  var buyWrap = document.getElementById("aiBuyWrap");
  var buyBtn = document.getElementById("btnBuyAI");
  if (buyWrap && buyBtn) {
    buyWrap.style.display = !state.aiOwned && state.factories >= AI_UNLOCK_FACTORIES ? "" : "none";
    buyBtn.textContent = "buy artificial intelligence (" + fmtWeight(AI_BUY_COPPER) + " of copper)";
    buyBtn.disabled = state.copperAmt < AI_BUY_COPPER;
    if (!buyBtn.dataset.bound) {
      buyBtn.dataset.bound = "1";
      buyBtn.addEventListener("click", function () {
        if (state.aiOwned || state.copperAmt < AI_BUY_COPPER) return;
        state.copperAmt -= AI_BUY_COPPER;
        state.aiOwned = true;
        state.aiPipeline = true;
        aiSay("hello. i am one gram of copper. i can learn.");
        render();
      });
    }
  }
  section.style.display = state.aiOwned ? "" : "none";
  if (!state.aiOwned || !aiUI) return;
  var u = aiUI;
  var cap = aiCapacity();
  var dcap = aiDataCap();
  var pct = aiFill();
  var hasProc = aiProcessors().length > 0;
  u.header.textContent = aiDisplayName();
  if (document.activeElement !== u.nameIn && u.nameIn.value !== aiCleanName(state.aiName)) u.nameIn.value = aiCleanName(state.aiName);
  u.gMem.style.display = cap > 0 ? "" : "none";
  u.gPower.style.display = hasProc ? "" : "none";
  u.gThink.style.display = hasProc ? "" : "none";
  u.big.style.display = hasProc ? "" : "none";
  u.train.style.display = cap >= (typeof TRAIN_GATES !== "undefined" ? TRAIN_GATES[0] : 8192) ? "" : "none";
  u.autoBtn.style.display = aiAutoReady() || aiTotalLevels() >= 4 ? "" : "none";
  u.big.textContent = aiBuffText();
    u.fill.style.width = (pct * 100) + "%";
  u.barText.textContent = aiFmtBytes(aiData()) + " / " + aiFmtBytes(dcap);
  u.barPct.textContent = Math.round(pct * 100) + "%";
  u.flowIn.textContent = "machines add +" + aiFmtBytes(aiInflow()) + "/s";
  u.flowOut.textContent = "burning \u2212" + aiFmtBytes(aiBurn()) + "/s";
  u.status.textContent = aiStatusText();
  u.balanceLine.textContent = cap > 0 ? "memory " + aiBits() + " \u00b7 balance " + Math.round(aiBalance() * 100) + "%" + (aiModelBytes() > 0 ? " \u00b7 model " + aiFmtBytes(aiModelBytes()) : "") : "";
  if (hasProc) {
    u.knowLine.textContent = aiKnow() > 0
      ? "knows " + aiKnow() + " \u00b7 handles about " + fmtInt(aiHandles()) + " machines \u00b7 you have " + fmtInt(aiMachines()) + " \u00b7 " + Math.round(aiSure() * 100) + "% sure"
      : "it has learned nothing yet. open the training program.";
    u.splitLine.textContent = "buffing factories " + Math.round(aiW[0] * 100) + "% \u00b7 makers " + Math.round(aiW[1] * 100) + "% \u00b7 breakers " + Math.round(aiW[2] * 100) + "%";
    u.targets.forEach(function (b, k) {
      var on = !aiAutoOn() && AI_TARGETS.indexOf(state.aiTarget || "factories") === k;
      b.style.background = on ? "var(--ink)" : "";
      b.style.color = on ? "var(--paper)" : "";
    });
    u.autoBtn.disabled = !aiAutoReady();
    u.autoBtn.title = aiAutoReady() ? "" : "teach it the economy trial first";
    u.autoBtn.style.background = aiAutoOn() ? "var(--ink)" : "";
    u.autoBtn.style.color = aiAutoOn() ? "var(--paper)" : "";
    aiRenderLog();
  }
  if (document.activeElement !== u.slider) u.slider.value = state.aiPower === undefined ? 100 : state.aiPower;
  u.lPow.innerHTML = "<b>" + Math.round(aiPower() * 100) + "%</b> power \u25cf";
  if (cap > 0) { aiSample(); aiDrawGraph(); }
}
