"use strict";

var AI_MAX_TIER = 10;
var AI_LOG_MAX = 40;
var AI_TILE_TIER_PRICE = 10;
var AI_TILE_PRICE_GROWTH = 1.1;
var AI_NAME_MAX = 20;

var aiUI = null;
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

function aiFactoryBuff() { return 0; }
function aiMakerBuff() { return 0; }
function aiBreakerBuff() { return 0; }

function aiTileInfoText(m) {
  var def = MODULES[m.type];
  var tier = m.tier || 1;
  var amount = Math.round(floorChipAmount(m.type, tier) * 100);
  var on = floorPowered(m) ? "" : " it has no wire path to a battery and the controller, so it does nothing.";
  return def.name + " tier " + tier + ": " + def.what.replace("{n}", amount + "%") + "." + on;
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
    ".ai-status { font-size: 10px; opacity: 0.65; text-align: center; margin-top: 8px; min-height: 12px; }" +
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
  body.appendChild(status);

  var logBox = aiMake("div", "ai-log");
  body.appendChild(logBox);

  var open = aiMake("button", "", "motherboard");
  open.style.width = "100%";
  open.style.marginTop = "8px";
  open.addEventListener("click", function () { floorOpenScreen(); });
  body.appendChild(open);

  aiUI = { section: section, header: section.querySelector(".panel-header"), nameIn: nameIn, status: status, logBox: logBox, logSeen: -1 };
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

function aiStatusText() {
  var mods = state.modules || [];
  var parts = mods.filter(function (m) { return m.type !== "controller"; });
  if (!parts.length) return "buy parts in the motherboard.";
  var idle = parts.filter(function (m) { return !floorPowered(m); }).length;
  if (idle) return idle + (idle === 1 ? " part is" : " parts are") + " not connected.";
  return "every part is connected.";
}

function renderAI() {
  var section = document.getElementById("aiSection");
  if (!section) return;
  if (!aiUI) aiBuildUI();
  if (!state.aiOwned && ((state.modules && state.modules.length) || (state.moduleStock && state.moduleStock.length))) state.aiOwned = true;
  if (state.aiOwned && !state.mbWired && typeof floorMigratePipeline === "function") floorMigratePipeline();
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
        state.mbWired = true;
        aiSay("hello. i am one gram of copper. i can learn.");
        floorNormalize();
        render();
      });
    }
  }
  section.style.display = state.aiOwned ? "" : "none";
  if (!state.aiOwned || !aiUI) return;
  aiUI.header.textContent = aiDisplayName();
  if (document.activeElement !== aiUI.nameIn && aiUI.nameIn.value !== aiCleanName(state.aiName)) aiUI.nameIn.value = aiCleanName(state.aiName);
  aiUI.status.textContent = aiStatusText();
  aiRenderLog();
}

var AI_GLYPH_KEYS = ["battery", "press", "table", "controller", "replicator"];
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
  return { battery: 12, press: 8, table: 8, controller: 9, replicator: 24 }[key] || 4;
}

function aiGlyphDims(key) {
  var d = MODULES[key.split(":")[0]];
  return d ? { w: d.w, h: d.h } : { w: 1, h: 1 };
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
  var dm = aiGlyphDims(key);
  var mult = Math.ceil(Math.sqrt(dm.w * dm.h));
  var maxX = dm.w * 6 - 1, maxY = dm.h * 6 - 1;
  var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  var want = aiGlyphNodes(key);
  var nodes = [[Math.floor(rnd() * (maxX + 1)), Math.floor(rnd() * (maxY + 1))]];
  var edges = [];
  var tries = 0;
  while (nodes.length < want && tries++ < 800) {
    var from = nodes[Math.floor(rnd() * nodes.length)];
    var d = dirs[Math.floor(rnd() * dirs.length)];
    var len = (1 + (rnd() < 0.3 ? 1 : 0)) * mult;
    var nx = from[0] + d[0] * len, ny = from[1] + d[1] * len;
    if (nx < 0 || ny < 0 || nx > maxX || ny > maxY) continue;
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

function aiGlyphLayout(key, rot) {
  if (!AI_GLYPH_PATHS || AI_GLYPH_SEED !== state.aiGlyphSeed || !state.aiGlyphSeed) aiGlyphInit();
  var g = AI_GLYPH_PATHS[key];
  var dm = aiGlyphDims(key);
  var gw = rot ? dm.h : dm.w, gh = rot ? dm.w : dm.h;
  if (!g) return { gw: gw, gh: gh, pts: [], edges: [] };
  var flip = function (n) { return rot ? [n[1], n[0]] : [n[0], n[1]]; };
  var nodes = g.nodes.map(flip);
  var xs = nodes.map(function (n) { return n[0]; }), ys = nodes.map(function (n) { return n[1]; });
  var cx0 = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy0 = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
  var X = function (v) { return 20 * gw + (v - cx0) * 6.4; };
  var Y = function (v) { return 20 * gh + (v - cy0) * 6.4; };
  return {
    gw: gw, gh: gh,
    pts: nodes.map(function (n) { return [X(n[0]), Y(n[1])]; }),
    edges: g.edges.map(function (e) {
      var p = flip([e[0], e[1]]), q = flip([e[2], e[3]]);
      return [X(p[0]), Y(p[1]), X(q[0]), Y(q[1])];
    })
  };
}

function aiGlyphPoints(key, rot) { return aiGlyphLayout(key, rot); }

function aiGlyph(key, px, rot) {
  var L = aiGlyphLayout(key, rot);
  var ns = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 " + (40 * L.gw) + " " + (40 * L.gh));
  svg.setAttribute("width", px * L.gw);
  svg.setAttribute("height", px * L.gh);
  svg.style.display = "block";
  svg.style.pointerEvents = "none";
  L.edges.forEach(function (e) {
    var l = document.createElementNS(ns, "line");
    l.setAttribute("x1", e[0]); l.setAttribute("y1", e[1]);
    l.setAttribute("x2", e[2]); l.setAttribute("y2", e[3]);
    l.setAttribute("stroke", "currentColor"); l.setAttribute("stroke-width", "1.8"); l.setAttribute("stroke-linecap", "round");
    svg.appendChild(l);
  });
  L.pts.forEach(function (n) {
    var c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", n[0]); c.setAttribute("cy", n[1]); c.setAttribute("r", "2.4");
    c.setAttribute("fill", "currentColor");
    svg.appendChild(c);
  });
  return svg;
}
