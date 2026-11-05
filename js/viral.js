"use strict";

var VIRAL_UNLOCK_MARKETING = 5;
var VIRAL_DURATION_MS = 120000;
var VIRAL_STREAK_STEP = 0.12;
var VIRAL_NODE_BONUS = 0.02;
var VIRAL_BREAK_MS = 15000;
var VIRAL_MAX_NODES = 100;
var VIRAL_SEEDS = 3;
var VIRAL_PULSE_MS = 480;
var VIRAL_STEP_MS = 520;
var VIRAL_FORECAST_RUNS = 150;
var VIRAL_HEIGHT = 190;

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
var viralPulse = null;
var viralPulseRaf = 0;

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
  return VIRAL_SEEDS + Math.floor(cardAdd("viralSeeds"));
}

function viralEdgeChance(p) {
  return Math.min(0.95, p * cardMult("viralSpread"));
}

function viralMultFor(streak, reached) {
  var growth = 1 + VIRAL_STREAK_STEP * cardMult("viralBonus");
  return Math.pow(growth, streak) * (1 + VIRAL_NODE_BONUS * reached);
}

function viralBuild() {
  var streak = state.viralStreak || 0;
  var round = state.viralLevel || 0;
  if (!state.viralSeed) state.viralSeed = 1 + Math.floor(Math.random() * 1e9);
  var r = viralRng(viralHash(state.viralSeed, round));
  var n = Math.min(VIRAL_MAX_NODES, 24 + streak * 5);
  var critics = Math.min(Math.floor(n * 0.55), Math.round(n * Math.min(0.55, 0.04 + 0.04 * streak)));
  critics = Math.max(1, critics);
  var safeCount = n - critics;
  var pocketN = Math.max(3, Math.round(safeCount * Math.max(0.12, 0.38 - 0.02 * streak)));
  var nodes = [], adj = [], edges = [], seen = {};
  for (var i = 0; i < n; i++) {
    nodes.push({ x: 0.04 + r() * 0.92, y: 0.06 + r() * 0.88 });
    adj.push([]);
  }
  var order = [];
  for (var s = 0; s < n; s++) order.push(s);
  for (var sh = n - 1; sh > 0; sh--) {
    var sw = Math.floor(r() * (sh + 1));
    var tmp = order[sh]; order[sh] = order[sw]; order[sw] = tmp;
  }
  var pocket = order.slice(0, pocketN);
  var rest = order.slice(pocketN);
  var hazard = new Array(n);
  for (var z = 0; z < n; z++) hazard[z] = null;
  var pickedCritics = 0;
  for (var c = 0; c < rest.length && pickedCritics < critics; c++) {
    if (r() < (critics - pickedCritics) / (rest.length - c)) { hazard[rest[c]] = "critic"; pickedCritics++; }
  }
  function dist(a, b) {
    return Math.hypot(nodes[a].x - nodes[b].x, (nodes[a].y - nodes[b].y) * 0.5);
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
  function linkGroup(list) {
    list.forEach(function (u) {
      var near = list.filter(function (v) { return v !== u; }).sort(function (a, b) { return dist(u, a) - dist(u, b); });
      var k = 2 + (r() < 0.4 ? 1 : 0);
      for (var q = 0; q < k && q < near.length; q++) link(u, near[q]);
    });
    var extra = Math.floor(list.length / 9);
    for (var e = 0; e < extra; e++) link(list[Math.floor(r() * list.length)], list[Math.floor(r() * list.length)]);
    var comp = {};
    list.forEach(function (u) { comp[u] = u; });
    function find(u) { while (comp[u] !== u) u = comp[u]; return u; }
    edges.forEach(function (ed) {
      if (comp[ed.a] === undefined || comp[ed.b] === undefined) return;
      var ra = find(ed.a), rb = find(ed.b);
      if (ra !== rb) comp[ra] = rb;
    });
    var guard = 0;
    while (guard++ < list.length) {
      var roots = {};
      list.forEach(function (u) { roots[find(u)] = true; });
      if (Object.keys(roots).length <= 1) break;
      var base = find(list[0]), best = null, bd = 1e9;
      list.forEach(function (u) {
        if (find(u) !== base) return;
        list.forEach(function (v) {
          if (find(v) === base) return;
          var d = dist(u, v);
          if (d < bd) { bd = d; best = [u, v]; }
        });
      });
      if (!best) break;
      link(best[0], best[1]);
      comp[find(best[0])] = find(best[1]);
    }
  }
  linkGroup(pocket);
  linkGroup(rest);

  var pocketMap = {};
  pocket.forEach(function (u) { pocketMap[u] = true; });
  viralNet = { n: n, nodes: nodes, adj: adj, edges: edges, hazard: hazard, hazards: critics, pocket: pocketMap };
  viralNetLevel = round;
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
  if (viralPulse) {
    var k = Math.min(1, (performance.now() - viralPulse.at) / VIRAL_PULSE_MS);
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 1 - k;
    viralPulse.nodes.forEach(function (i) {
      var nd = viralNet.nodes[i];
      ctx.beginPath();
      ctx.arc(nd.x * w, nd.y * VIRAL_HEIGHT, 4 + k * 16, 0, 6.2832);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
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
    viralPulse = { nodes: next.slice(), at: performance.now() };
    if (!viralPulseRaf) viralPulseRaf = requestAnimationFrame(viralPulseLoop);
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
  var reached = 0, critics = 0;
  for (var i = 0; i < viralStates.length; i++) {
    if (viralStates[i] === 0) continue;
    if (viralNet.hazard[i]) critics++;
    else reached++;
  }
  var text = "reached " + reached + " people";
  var now = Date.now();
  var broke = critics > 0;

  if (broke) {
    var lost = state.viralStreak || 0;
    state.viralStreak = 0;
    if (state.viralBuzzUntil > now) state.viralBuzzUntil = Math.min(state.viralBuzzUntil, now + VIRAL_BREAK_MS);
    text = "a critic got hold of it -- streak lost" + (lost > 0 ? " (" + lost + ")" : "");
  } else {
    state.viralStreak = (state.viralStreak || 0) + 1;
    state.viralBest = Math.max(state.viralBest || 0, state.viralStreak);
    var mult = viralMultFor(state.viralStreak, reached);
    state.viralBuzz = Math.max(viralBuzzMult(), mult);
    state.viralBuzzUntil = now + VIRAL_DURATION_MS * cardMult("viralTime");
    text += " -- streak " + state.viralStreak + ", demand x" + (Math.round(mult * 100) / 100);
  }

  var optimal = optimalPriceForCurrentProduction();
  if (optimal !== null) {
    state.price = optimal;
    text += " · optimal price set";
  }

  var payMinutes = Math.floor(cardAdd("viralJackpot"));
  if (critics > 0 && payMinutes > 0) {
    var pay = viralRevenuePerSec() * 60 * payMinutes * critics;
    if (pay > 0) {
      state.funds += pay;
      text += " · +" + fmtMoney(pay);
    }
  }

  state.viralLevel = (state.viralLevel || 0) + 1;
  viralRunning = false;
  viralSay(text);
  viralFlash(broke ? "viral-shake" : "viral-pop");
  setTimeout(function () {
    if (viralRunning) return;
    viralBuild();
    viralDraw();
    viralRefreshText();
  }, 2800);
  render();
}

function viralFlash(cls) {
  if (!viralUI) return;
  var target = cls === "viral-pop" ? viralUI.streak : viralUI.canvas;
  target.classList.remove("viral-pop", "viral-shake");
  void target.offsetWidth;
  target.classList.add(cls);
}

function viralPulseLoop() {
  viralPulseRaf = 0;
  if (!viralPulse) return;
  viralDraw();
  if (performance.now() - viralPulse.at < VIRAL_PULSE_MS) viralPulseRaf = requestAnimationFrame(viralPulseLoop);
  else { viralPulse = null; viralDraw(); }
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
  var buzz = left > 0 ? "buzz: demand x" + mult + " for " + Math.ceil(left / 1000) + "s" : "no buzz right now";
  var safeTotal = viralNet.n - viralNet.hazards;
  var info = "samples " + viralPickCount + "/" + viralSeedCount() + " · forecast " + Math.round(viralForecast) + "/" + safeTotal;
  if (viralPickCount > 0) info += " · risk " + Math.round(viralRisk * 100) + "%";
  var streak = state.viralStreak || 0;
  var streakText = "streak " + streak;
  var sub = "best " + (state.viralBest || 0) + " · next round x" + (Math.round(viralMultFor(streak + 1, Math.round(viralForecast)) * 100) / 100);
  var legend = viralNet.n + " people · " + viralNet.hazards + " critics (squares) · one safe pocket hides in here";
  var text = [info, buzz, legend, streakText, sub].join("|");
  if (text === viralShownText) return;
  viralShownText = text;
  var parts = text.split("|");
  viralUI.info.textContent = parts[0];
  viralUI.buzz.textContent = parts[1];
  viralUI.legend.textContent = parts[2];
  viralUI.streak.textContent = parts[3];
  viralUI.sub.textContent = parts[4];
}

function viralBuildUI() {
  var section = document.getElementById("viralSection");
  if (!section) return;
  var st = document.createElement("style");
  st.textContent =
    "#viralSection { grid-column: 3; grid-row: 1; }" +
    ".viral-streak { font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 1px; }" +
    ".viral-sub { font-size: 10px; opacity: 0.6; text-align: center; margin-bottom: 6px; }" +
    "@keyframes viralpop { 0% { transform: scale(1); } 35% { transform: scale(1.5); } 100% { transform: scale(1); } }" +
    "@keyframes viralshake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(3px); } }" +
    ".viral-pop { animation: viralpop 0.5s ease-out; }" +
    ".viral-shake { animation: viralshake 0.4s linear; }" +
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
  var streakEl = document.createElement("div"); streakEl.className = "viral-streak";
  var subEl = document.createElement("div"); subEl.className = "viral-sub";
  body.appendChild(streakEl); body.appendChild(subEl);
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
  viralUI = { section: section, streak: streakEl, sub: subEl, canvas: canvas, info: info, msg: msg, buzz: buzz, legend: legend };
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
