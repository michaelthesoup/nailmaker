"use strict";

var VIRAL_UNLOCK_MARKETING = 5;
var VIRAL_DURATION_MS = 120000;
var VIRAL_BACKLASH_MS = 60000;
var VIRAL_MAX_BONUS = 0.5;
var VIRAL_BACKLASH_CUT = 0.25;
var VIRAL_CRITIC_KEEP = 0.4;
var VIRAL_STEP_MS = 520;
var VIRAL_FORECAST_RUNS = 150;
var VIRAL_HEIGHT = 190;
var VIRAL_MAX_HAZARDS = 6;

var viralNet = null;
var viralNetLevel = -1;
var viralUI = null;
var viralPicks = {};
var viralPickCount = 0;
var viralRunning = false;
var viralStates = null;
var viralForecast = 0;
var viralRisk = 0;
var viralShownText = "";

function viralHash(a, b) {
  var x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return (x ^ (x >>> 16)) >>> 0;
}

function viralRng(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function viralBuzzMult() {
  return state.viralBuzzUntil > Date.now() ? Math.max(0.5, state.viralBuzz || 1) : 1;
}

function viralSeedCount() {
  return viralNet.baseSeeds + Math.floor(cardAdd("viralSeeds"));
}

function viralEdgeChance(p) {
  return Math.min(0.95, p * cardMult("viralSpread"));
}

function viralBuild() {
  var level = state.viralLevel || 0;
  if (!state.viralSeed) state.viralSeed = 1 + Math.floor(Math.random() * 1e9);
  var r = viralRng(viralHash(state.viralSeed, level));
  var n = Math.min(90, 24 + level * 4);
  var nodes = [], adj = [], edges = [], seen = {};
  for (var i = 0; i < n; i++) {
    nodes.push({ x: 0.04 + r() * 0.92, y: 0.06 + r() * 0.88 });
    adj.push([]);
  }
  function link(a, b) {
    if (a === b) return;
    var key = a < b ? a + "_" + b : b + "_" + a;
    if (seen[key]) return;
    seen[key] = true;
    var p = 0.3 + 0.45 * r();
    edges.push({ a: a, b: b, p: p });
    adj[a].push({ to: b, p: p });
    adj[b].push({ to: a, p: p });
  }
  for (var u = 0; u < n; u++) {
    var order = [];
    for (var v = 0; v < n; v++) if (v !== u) order.push(v);
    order.sort(function (p1, p2) {
      return Math.hypot(nodes[p1].x - nodes[u].x, (nodes[p1].y - nodes[u].y) * 0.5) - Math.hypot(nodes[p2].x - nodes[u].x, (nodes[p2].y - nodes[u].y) * 0.5);
    });
    var near = 2 + (r() < 0.4 ? 1 : 0);
    for (var k = 0; k < near; k++) link(u, order[k]);
  }
  var longLinks = Math.floor(n / 9);
  for (var l = 0; l < longLinks; l++) link(Math.floor(r() * n), Math.floor(r() * n));

  var hazard = new Array(n);
  for (var z = 0; z < n; z++) hazard[z] = null;
  var hazardCount = Math.min(VIRAL_MAX_HAZARDS, Math.floor((level + 1) / 2));
  var placed = 0, guard = 0;
  while (placed < hazardCount && guard++ < 500) {
    var pick = Math.floor(r() * n);
    if (hazard[pick] || adj[pick].length < 2) continue;
    hazard[pick] = placed % 2 === 0 ? "critic" : "backlash";
    placed++;
  }

  viralNet = { n: n, nodes: nodes, adj: adj, edges: edges, hazard: hazard, hazards: placed, baseSeeds: 3 + Math.floor(level / 4) };
  viralNetLevel = level;
  viralPicks = {};
  viralPickCount = 0;
  viralStates = null;
  viralForecast = 0;
  viralRisk = 0;
}

function viralSimulate(picks) {
  var st = new Array(viralNet.n);
  for (var i = 0; i < st.length; i++) st[i] = 0;
  var active = [];
  picks.forEach(function (p) { st[p] = 1; active.push(p); });
  while (active.length) {
    var next = [];
    for (var a = 0; a < active.length; a++) {
      var list = viralNet.adj[active[a]];
      for (var e = 0; e < list.length; e++) {
        if (st[list[e].to] === 0 && Math.random() < viralEdgeChance(list[e].p)) {
          st[list[e].to] = 1;
          next.push(list[e].to);
        }
      }
      st[active[a]] = 2;
    }
    active = next;
  }
  var reached = 0, hits = 0;
  for (var q = 0; q < st.length; q++) {
    if (st[q] === 0) continue;
    if (viralNet.hazard[q]) hits++;
    else reached++;
  }
  return { reached: reached, hits: hits };
}

function viralPickList() {
  var out = [];
  for (var k in viralPicks) if (viralPicks[k]) out.push(+k);
  return out;
}

function viralUpdateForecast() {
  var picks = viralPickList();
  if (!picks.length) { viralForecast = 0; viralRisk = 0; return; }
  var sum = 0, risky = 0;
  for (var i = 0; i < VIRAL_FORECAST_RUNS; i++) {
    var res = viralSimulate(picks);
    sum += res.reached;
    if (res.hits > 0) risky++;
  }
  viralForecast = sum / VIRAL_FORECAST_RUNS;
  viralRisk = risky / VIRAL_FORECAST_RUNS;
}

function viralColors() {
  var cs = getComputedStyle(document.documentElement);
  return { ink: (cs.getPropertyValue("--ink") || "#000").trim() || "#000", paper: (cs.getPropertyValue("--paper") || "#fff").trim() || "#fff" };
}

function viralDraw() {
  if (!viralUI || !viralNet) return;
  var cv = viralUI.canvas, w = cv.clientWidth || 280;
  if (cv.width !== w || cv.height !== VIRAL_HEIGHT) { cv.width = w; cv.height = VIRAL_HEIGHT; }
  var c = viralColors(), ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, w, VIRAL_HEIGHT);
  viralNet.edges.forEach(function (e) {
    var a = viralNet.nodes[e.a], b = viralNet.nodes[e.b];
    var hot = viralStates && viralStates[e.a] > 0 && viralStates[e.b] > 0;
    ctx.globalAlpha = hot ? 0.9 : 0.12 + e.p * 0.35;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = hot ? 1.6 : 0.6 + e.p * 1.2;
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * VIRAL_HEIGHT);
    ctx.lineTo(b.x * w, b.y * VIRAL_HEIGHT);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  viralNet.nodes.forEach(function (nd, i) {
    var deg = viralNet.adj[i].length, r = 3 + Math.min(4, deg * 0.7);
    var s = viralStates ? viralStates[i] : 0;
    var px = nd.x * w, py = nd.y * VIRAL_HEIGHT;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = c.ink;
    if (viralNet.hazard[i]) {
      var half = r + 1;
      ctx.fillStyle = s > 0 ? c.ink : c.paper;
      ctx.fillRect(px - half, py - half, half * 2, half * 2);
      ctx.strokeRect(px - half, py - half, half * 2, half * 2);
      ctx.beginPath();
      ctx.moveTo(px - half + 2, py - half + 2);
      ctx.lineTo(px + half - 2, py + half - 2);
      ctx.moveTo(px + half - 2, py - half + 2);
      ctx.lineTo(px - half + 2, py + half - 2);
      ctx.strokeStyle = s > 0 ? c.paper : c.ink;
      ctx.stroke();
      return;
    }
    var picked = viralPicks[i];
    ctx.beginPath();
    ctx.arc(px, py, r, 0, 6.2832);
    ctx.fillStyle = (s > 0 || picked) ? c.ink : c.paper;
    ctx.fill();
    ctx.globalAlpha = s === 2 ? 0.55 : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (picked && !viralRunning) {
      ctx.beginPath();
      ctx.arc(px, py, r + 3, 0, 6.2832);
      ctx.stroke();
    }
  });
}

function viralSay(text) { if (viralUI) viralUI.msg.textContent = text; }

function viralCanvasClick(e) {
  if (viralRunning || !viralNet) return;
  var cv = viralUI.canvas, rect = cv.getBoundingClientRect();
  var sx = cv.width / rect.width, sy = cv.height / rect.height;
  var px = (e.clientX - rect.left) * sx, py = (e.clientY - rect.top) * sy;
  var best = -1, bd = 14;
  viralNet.nodes.forEach(function (nd, i) {
    var d = Math.hypot(nd.x * cv.width - px, nd.y * VIRAL_HEIGHT - py);
    if (d < bd) { bd = d; best = i; }
  });
  if (best < 0) return;
  if (viralNet.hazard[best]) { viralSay("that one would hurt you -- keep the rumour away"); return; }
  var limit = viralSeedCount();
  if (viralPicks[best]) { viralPicks[best] = false; viralPickCount--; }
  else if (viralPickCount >= limit) { viralSay("only " + limit + " free samples to hand out"); return; }
  else { viralPicks[best] = true; viralPickCount++; }
  viralSay("");
  viralUpdateForecast();
  viralDraw();
  viralRefreshText();
}

function viralSpread() {
  if (viralRunning || !viralNet) return;
  var picks = viralPickList();
  if (!picks.length) { viralSay("pick at least one person to start the rumour"); return; }
  viralRunning = true;
  viralSay("spreading...");
  var st = new Array(viralNet.n);
  for (var i = 0; i < st.length; i++) st[i] = 0;
  picks.forEach(function (p) { st[p] = 1; });
  viralStates = st;
  var active = picks.slice();
  viralDraw();

  function step() {
    var next = [];
    for (var a = 0; a < active.length; a++) {
      var list = viralNet.adj[active[a]];
      for (var e = 0; e < list.length; e++) {
        if (viralStates[list[e].to] === 0 && Math.random() < viralEdgeChance(list[e].p)) {
          viralStates[list[e].to] = 1;
          next.push(list[e].to);
        }
      }
      viralStates[active[a]] = 2;
    }
    active = next;
    viralDraw();
    if (active.length) { setTimeout(step, VIRAL_STEP_MS); return; }
    viralFinish();
  }
  setTimeout(step, VIRAL_STEP_MS);
}

function viralRevenuePerSec() {
  return Math.min(avgNailsSoldPerSec(), currentNailProductionRate()) * state.price * cardMult("saleMult");
}

function viralFinish() {
  var reached = 0, critics = 0, backlashes = 0;
  for (var i = 0; i < viralStates.length; i++) {
    if (viralStates[i] === 0) continue;
    var h = viralNet.hazard[i];
    if (h === "critic") critics++;
    else if (h === "backlash") backlashes++;
    else reached++;
  }
  var safeTotal = viralNet.n - viralNet.hazards;
  var frac = reached / safeTotal;
  var mult = 1 + VIRAL_MAX_BONUS * cardMult("viralBonus") * frac - VIRAL_BACKLASH_CUT * backlashes;
  var duration = VIRAL_DURATION_MS * cardMult("viralTime") * Math.pow(VIRAL_CRITIC_KEEP, critics);
  var text = "reached " + reached + " / " + safeTotal + " people";

  if (mult >= 1) {
    state.viralBuzz = Math.max(viralBuzzMult(), mult);
    state.viralBuzzUntil = Date.now() + duration;
    text += " -- demand x" + (Math.round(mult * 100) / 100);
  } else {
    state.viralBuzz = Math.max(0.5, mult);
    state.viralBuzzUntil = Date.now() + VIRAL_BACKLASH_MS;
    text += " -- backlash, demand x" + (Math.round(state.viralBuzz * 100) / 100);
  }
  if (critics > 0 && mult >= 1) text += " (a critic cut it short)";

  var optimal = optimalPriceForCurrentProduction();
  if (optimal !== null) {
    state.price = optimal;
    text += " · optimal price set";
  }

  var hits = critics + backlashes;
  var payMinutes = Math.floor(cardAdd("viralJackpot"));
  if (hits > 0 && payMinutes > 0) {
    var pay = viralRevenuePerSec() * 60 * payMinutes * hits;
    if (pay > 0) {
      state.funds += pay;
      text += " · +" + fmtMoney(pay);
    }
  }

  state.viralLevel = (state.viralLevel || 0) + 1;
  viralRunning = false;
  viralSay(text);
  setTimeout(function () {
    if (viralRunning) return;
    viralBuild();
    viralDraw();
    viralRefreshText();
  }, 2800);
  render();
}

function viralClear() {
  if (viralRunning) return;
  viralPicks = {};
  viralPickCount = 0;
  viralForecast = 0;
  viralRisk = 0;
  viralSay("");
  viralDraw();
  viralRefreshText();
}

function viralRefreshText() {
  if (!viralUI || !viralNet) return;
  var left = Math.max(0, state.viralBuzzUntil - Date.now());
  var mult = Math.round(viralBuzzMult() * 100) / 100;
  var buzz = left > 0 ? (mult < 1 ? "backlash: demand x" : "buzz: demand x") + mult + " for " + Math.ceil(left / 1000) + "s" : "no buzz right now";
  var safeTotal = viralNet.n - viralNet.hazards;
  var info = "samples " + viralPickCount + "/" + viralSeedCount() + " · forecast " + Math.round(viralForecast) + "/" + safeTotal;
  if (viralNet.hazards > 0) info += " · risk " + Math.round(viralRisk * 100) + "%";
  var legend = viralNet.hazards > 0 ? "squares are risky people -- keep the rumour away from them" : "";
  var text = info + "|" + buzz + "|" + legend;
  if (text === viralShownText) return;
  viralShownText = text;
  var parts = text.split("|");
  viralUI.info.textContent = parts[0];
  viralUI.buzz.textContent = parts[1];
  viralUI.legend.textContent = parts[2];
}

function viralBuildUI() {
  var section = document.getElementById("viralSection");
  if (!section) return;
  var st = document.createElement("style");
  st.textContent =
    "#viralSection { grid-column: 3; grid-row: 1; }" +
    ".viral-canvas { width: 100%; height: " + VIRAL_HEIGHT + "px; display: block; border: 1px solid var(--ink); cursor: pointer; }" +
    ".viral-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 5px; font-size: 11px; }" +
    ".viral-row button { font-size: 11px; padding: 1px 7px; flex: none; }" +
    ".viral-row span:last-child { display: flex; gap: 4px; flex: none; }" +
    ".viral-msg { min-height: 15px; margin-top: 4px; text-align: center; font-size: 12px; }" +
    ".viral-buzz { margin-top: 3px; font-size: 11px; opacity: 0.7; text-align: center; }" +
    ".viral-legend { margin-top: 2px; font-size: 10px; opacity: 0.55; text-align: center; min-height: 12px; }";
  document.head.appendChild(st);
  var body = section.querySelector(".panel-body");
  body.innerHTML = "";
  var canvas = document.createElement("canvas");
  canvas.className = "viral-canvas";
  body.appendChild(canvas);
  var row = document.createElement("div");
  row.className = "viral-row";
  var info = document.createElement("span");
  var btns = document.createElement("span");
  var clearBtn = document.createElement("button"); clearBtn.textContent = "clear";
  var goBtn = document.createElement("button"); goBtn.textContent = "spread";
  btns.appendChild(clearBtn); btns.appendChild(goBtn);
  row.appendChild(info); row.appendChild(btns);
  body.appendChild(row);
  var msg = document.createElement("div"); msg.className = "viral-msg";
  var buzz = document.createElement("div"); buzz.className = "viral-buzz";
  var legend = document.createElement("div"); legend.className = "viral-legend";
  body.appendChild(msg); body.appendChild(buzz); body.appendChild(legend);
  canvas.addEventListener("click", viralCanvasClick);
  clearBtn.addEventListener("click", viralClear);
  goBtn.addEventListener("click", viralSpread);
  viralUI = { section: section, canvas: canvas, info: info, msg: msg, buzz: buzz, legend: legend };
}

function viralTryUnlock() {
  if (state.unlockedViral || state.viralLocked || state.unlockedCity) return;
  if (state.marketingLevel < VIRAL_UNLOCK_MARKETING) return;
  state.unlockedViral = true;
  state.coreBall = false;
}

function renderViral() {
  var section = document.getElementById("viralSection");
  if (!section) return;
  if (!viralUI) viralBuildUI();
  if (state.unlockedCity && state.unlockedViral) state.unlockedViral = false;
  viralTryUnlock();
  var show = !!state.unlockedViral && !state.viralLocked && !state.unlockedCity;
  section.style.display = show ? "" : "none";
  if (!show || !viralUI) return;
  if (!viralNet || (viralNetLevel !== (state.viralLevel || 0) && !viralRunning)) { viralBuild(); viralDraw(); }
  viralRefreshText();
}

window.addEventListener("resize", function () { viralDraw(); });
