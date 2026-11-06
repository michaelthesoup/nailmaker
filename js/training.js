"use strict";

var TRAIN_PASSES = 3;
var TRAIN_RATE = 0.06;
var TRAIN_HIST = 120;
var TRAIN_DEMO_CAP = 4194304;
var TRAIN_DEMO_FILL = 0.05;
var TRAIN_MODEL_BASE = 128;
var TRAIN_MODEL_GROWTH = 2.2;
var TRAIN_MODEL_SHARE = 0.5;
var TRAIN_DEMO_STORAGE = 16777216;
var TRAIN_COST_MULT = 4;

var TRAIN_PAIRS = [
  ["white", "black"], ["sun", "moon"], ["day", "night"], ["light", "dark"], ["fire", "water"], ["summer", "winter"],
  ["give", "take"], ["make", "break"], ["build", "destroy"], ["full", "empty"], ["rise", "fall"], ["spring", "autumn"],
  ["push", "pull"], ["hot", "cold"], ["east", "west"], ["up", "down"], ["open", "close"], ["loud", "quiet"],
  ["fast", "slow"], ["strong", "weak"], ["hard", "soft"], ["dry", "wet"], ["sky", "earth"], ["noon", "midnight"],
  ["bright", "dim"], ["grow", "wither"], ["win", "lose"], ["begin", "end"], ["birth", "death"], ["gain", "lose"],
  ["plus", "minus"], ["in", "out"], ["create", "erase"], ["awake", "asleep"], ["speak", "listen"], ["joy", "sorrow"],
  ["hope", "fear"], ["order", "chaos"], ["love", "hate"], ["bloom", "decay"], ["advance", "retreat"], ["abundance", "scarcity"],
  ["expand", "shrink"], ["ascend", "descend"], ["ignite", "quench"], ["radiant", "murky"], ["vivid", "faded"], ["lift", "sink"]
];
var TRAIN_BOTH = ["dawn", "dusk", "mist", "eclipse", "twilight", "tide", "horizon", "shore", "equinox", "ember", "fog", "dew", "rainbow", "shadow", "smoke", "cloud", "ripple", "echo", "breeze", "frost", "steam", "thaw", "ash", "glow"];
var TRAIN_WORDS = [];
var TRAIN_MIXED = [];

(function () {
  function hash(i, j) { var x = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return Math.abs(x - Math.floor(x)); }
  TRAIN_PAIRS.forEach(function (p, i) {
    var clarity = Math.max(0.3, 1 - 0.018 * i), flip = Math.min(0.3, 0.008 * i);
    var yang = [0, 1, 2, 3, 4, 5].map(function (j) {
      var mag = clarity * (0.55 + 0.45 * hash(i + 1, j));
      return hash(i + 1, j + 10) < flip ? -mag : mag;
    });
    TRAIN_WORDS.push({ w: p[0], v: yang, side: 1, pair: i });
    TRAIN_WORDS.push({ w: p[1], v: yang.map(function (v, j) { return -v + (hash(i + 3, j + 20) - 0.5) * 0.12; }), side: 0, pair: i });
  });
  TRAIN_BOTH.forEach(function (w, i) {
    TRAIN_MIXED.push({ w: w, v: [0, 1, 2, 3, 4, 5].map(function (j) { return (hash(i + 7, j + 30) - 0.5) * 0.4; }), side: 2, pair: -1 });
  });
})();

function trainPairCount(level) { return Math.min(TRAIN_PAIRS.length, 2 * level); }
function trainBothCount(level) { return Math.min(TRAIN_BOTH.length, 2 + 2 * level); }
function trainVocab(level) { return TRAIN_WORDS.slice(0, 2 * trainPairCount(level)); }
function trainBlur(level) { return Math.max(0, level - TRAIN_PAIRS.length / 2) * 0.02; }

function trainGauss() {
  var u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function trainFuzz(v, level) {
  var s = trainBlur(level);
  return s > 0 ? v.map(function (x) { return x + trainGauss() * s; }) : v;
}

function trainPick(a) { return a[Math.floor(Math.random() * a.length)]; }
function trainMk(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function trainShowWords(words, small) {
  return function (node) {
    var row = trainMk("div", "train-words");
    words.forEach(function (w, i) {
      if (i) row.appendChild(trainMk("span", "train-sep", "·"));
      row.appendChild(trainMk("span", "train-word", w));
    });
    node.appendChild(row);
    if (small) node.appendChild(trainMk("div", "train-cap", small));
  };
}

function trainShowCells(items) {
  return function (node) {
    var row = trainMk("div", "train-cells");
    items.forEach(function (it) {
      var c = trainMk("div", "train-cell" + (it.q ? " q" : ""));
      c.appendChild(trainMk("b", "", it.top));
      c.appendChild(trainMk("span", "", it.bottom));
      row.appendChild(c);
    });
    node.appendChild(row);
  };
}

function trainShowBars(items) {
  return function (node) {
    items.forEach(function (it) {
      var line = trainMk("div", "train-barline");
      line.appendChild(trainMk("span", "", it.name));
      var bar = trainMk("div", "train-bar");
      var fill = trainMk("i");
      fill.style.width = Math.round(it.v * 100) + "%";
      bar.appendChild(fill);
      line.appendChild(bar);
      node.appendChild(line);
    });
  };
}

function trainWordSample(level) {
  var w = trainPick(trainVocab(level));
  return { x: trainFuzz(w.v, level), y: w.side, show: trainShowWords([w.w], "is it yin (0) or yang (1)?") };
}

function trainPairSample(level) {
  var vocab = trainVocab(level), a, b, opposite = Math.random() < 0.5;
  a = trainPick(vocab);
  if (opposite) {
    b = vocab.filter(function (w) { return w.pair === a.pair && w !== a; })[0];
  } else {
    var same = Math.random() < 0.5;
    var cands = vocab.filter(function (w) { return w !== a && w.pair !== a.pair && (!same || w.side === a.side); });
    b = trainPick(cands);
  }
  var av = trainFuzz(a.v, level), bv = trainFuzz(b.v, level);
  var prod = av.map(function (v, i) { return v * bv[i]; });
  var dot = 1 - 3 * av.reduce(function (p, v, i) { return p + Math.abs(v + bv[i]); }, 0) / 6;
  return { x: av.concat(bv, prod, [dot]), y: opposite ? 1 : 0, show: trainShowWords([a.w, b.w], "are these two opposites?") };
}

function trainMixedSample(level) {
  var cls = Math.floor(Math.random() * 3), w;
  if (cls === 2) w = trainPick(TRAIN_MIXED.slice(0, trainBothCount(level)));
  else w = trainPick(trainVocab(level).filter(function (x) { return x.side === cls; }));
  return { x: trainFuzz(w.v, level), y: w.side, show: trainShowWords([w.w], "yin, yang, or a bit of both?") };
}

var TRAIN_CYCLES = ["10", "110", "100", "1100"];

function trainCycleSample(level) {
  var pat = trainPick(TRAIN_CYCLES), off = Math.floor(Math.random() * pat.length);
  var pair = trainPick(TRAIN_PAIRS.slice(0, trainPairCount(level))), bits = [];
  for (var i = 0; i < 8; i++) bits.push(pat.charAt((i + off) % pat.length) === "1" ? 1 : 0);
  var shown = bits.slice(0, 7);
  var items = shown.map(function (b) { return { top: pair[b ? 0 : 1], bottom: String(b) }; });
  items.push({ top: "?", bottom: "", q: true });
  return { x: shown.slice(2).map(function (b) { return b ? 1 : -1; }), y: bits[7], show: trainShowCells(items) };
}

function trainByteSample(level) {
  var ones = Math.random() < 0.5 ? 3 : 4, bits = [0, 0, 0, 0, 0, 0, 0];
  var placed = 0;
  while (placed < ones) {
    var k = Math.floor(Math.random() * 7);
    if (!bits[k]) { bits[k] = 1; placed++; }
  }
  var items = bits.map(function (b) { return { top: b ? "●" : "○", bottom: String(b) }; });
  items.push({ top: "?", bottom: "", q: true });
  return { x: bits.map(function (b) { return b ? 1 : -1; }), y: ones === 3 ? 1 : 0, show: trainShowCells(items) };
}

function trainEconomySample(level) {
  var iron, nails, copper;
  var margin = Math.max(0.03, 0.15 - 0.008 * (level - 1)), edge = Math.max(0.015, 0.06 - 0.004 * (level - 1));
  do { iron = Math.random(); nails = Math.random(); copper = Math.random(); } while (Math.abs(copper - 0.25) < edge || Math.abs(copper - 0.75) < edge || (copper >= 0.25 && copper <= 0.75 && Math.abs(nails - iron) < margin));
  var y = copper > 0.75 ? 2 : (copper < 0.25 || nails > iron ? 1 : 0);
  return { x: [iron - 0.5, nails - 0.5, copper - 0.5], y: y, show: trainShowBars([{ name: "iron", v: iron }, { name: "nails", v: nails }, { name: "copper", v: copper }]) };
}

var TRAIN_GATES = [8192, 32768, 131072, 524288, 2097152, 8388608];

var TRAIN_TRIALS = [
  { id: "opposites", neurons: 6, name: "opposites", labels: ["0  yin", "1  yang"], gen: trainWordSample, inputs: 6, test: 48, need: 0.93, lesson: "everything has two sides. black is yin, 0. white is yang, 1." },
  { id: "pairs", neurons: 8, name: "pairs", labels: ["no", "yes"], gen: trainPairSample, inputs: 19, test: 60, need: 0.93, lesson: "every yang has a yin that answers it." },
  { id: "both", neurons: 8, name: "both", labels: ["0  yin", "1  yang", "both"], gen: trainMixedSample, inputs: 6, test: 60, need: 0.9, lesson: "some things sit in the middle. each side carries a seed of the other." },
  { id: "cycles", neurons: 10, name: "cycles", labels: ["0  yin", "1  yang"], gen: trainCycleSample, inputs: 5, test: 60, need: 0.93, lesson: "opposites take turns. make, then break, then make again." },
  { id: "bytes", neurons: 10, name: "bytes", labels: ["add a 0", "add a 1"], gen: trainByteSample, inputs: 7, test: 70, need: 0.93, lesson: "a byte is balanced with four 1s and four 0s. your memory is made of them." },
  { id: "economy", neurons: 12, name: "economy", labels: ["buff makers", "buff breakers", "buff factories"], gen: trainEconomySample, inputs: 3, test: 80, need: 0.9, lesson: "more nails than iron needs breakers. copper running out needs breakers. copper piling up needs factories. otherwise makers." }
];

var trainUI = null;
var trainOpen = false;
var trainCur = 0;
var trainDemo = { data: 65536 };
var trainRuns = {};
var trainTimer = null;

function trainLevels() {
  if (!state.trainLevels) state.trainLevels = {};
  return state.trainLevels;
}

function trainLevel(id) { return trainLevels()[id] || 0; }

function trainTotalLevels() {
  var m = trainLevels(), n = 0;
  TRAIN_TRIALS.forEach(function (t) { n += m[t.id] || 0; });
  return n;
}

function trainEconomyLevel() { return trainLevel("economy"); }

function trainLevelBytes(level) { return level > 0 ? TRAIN_MODEL_BASE * Math.pow(TRAIN_MODEL_GROWTH, level - 1) : 0; }

function trainModelBytes() {
  var n = 0;
  TRAIN_TRIALS.forEach(function (t) { n += trainLevelBytes(trainLevel(t.id)); });
  return n;
}

function trainCap() { return trainRealMemory() ? aiCapacity() : TRAIN_DEMO_STORAGE; }
function trainBudget() { return trainCap() * TRAIN_MODEL_SHARE; }

function trainNeedAcc(target) { return 1 - 0.07 * Math.pow(0.85, target - 1); }
function trainTestSize(target) { return Math.min(300, 50 + 20 * target); }
function trainNeedNeurons(idx, target) { return TRAIN_TRIALS[idx].neurons + target - 1; }
function trainTaughtMin(target) { return Math.round(20 * Math.pow(1.3, target - 1)); }
function trainTarget(idx) { return trainLevel(TRAIN_TRIALS[idx].id) + 1; }

function trainGate(idx) { return TRAIN_GATES[idx]; }
function trainUnlocked(idx) { return (idx === 0 || trainLevel(TRAIN_TRIALS[idx - 1].id) >= 1) && trainCap() >= TRAIN_GATES[idx]; }

function trainLevelBlock(idx) {
  var target = trainTarget(idx);
  var need = trainNeedNeurons(idx, target);
  if (trainNeurons() < need) return "needs " + need + " neurons, memory gives " + trainNeurons();
  var after = trainModelBytes() - trainLevelBytes(target - 1) + trainLevelBytes(target);
  if (after > trainBudget()) return "needs " + aiFmtBytesSafe(after) + " of model storage, only " + aiFmtBytesSafe(trainBudget()) + " is allowed. buy more memory";
  return "";
}

function aiFmtBytesSafe(n) { return typeof aiFmtBytes === "function" ? aiFmtBytes(n) : Math.round(n) + " B"; }

function trainNeurons() { return Math.max(4, Math.min(48, Math.floor(Math.sqrt(trainCap() / 64)))); }

function trainRealMemory() { return typeof aiCapacity === "function" && aiCapacity() > 0; }
function trainPool() { return trainRealMemory() ? aiData() : trainDemo.data; }
function trainDataCap() { return trainRealMemory() ? aiDataCap() : TRAIN_DEMO_CAP; }
function trainCostFor(idx) { return TRAIN_COST_MULT * trainLevelBytes(trainTarget(idx)) * (1 + 0.2 * idx); }
function trainCost() { return trainCostFor(trainCur); }
function trainSpend(n) {
  if (trainRealMemory()) aiSpendData(n);
  else trainDemo.data = Math.max(0, trainDemo.data - n);
}

function trainMake(nIn, h, k) {
  var net = { nIn: nIn, h: h, k: k, w1: [], b1: [], w2: [], b2: [] }, i, j;
  var s1 = Math.sqrt(2 / nIn), s2 = Math.sqrt(2 / h);
  for (i = 0; i < h; i++) {
    var row = [];
    for (j = 0; j < nIn; j++) row.push((Math.random() * 2 - 1) * s1);
    net.w1.push(row); net.b1.push(0);
  }
  for (var c = 0; c < k; c++) {
    var r = [];
    for (i = 0; i < h; i++) r.push(0);
    net.w2.push(r); net.b2.push(0);
  }
  return net;
}

function trainForward(net, x) {
  var hid = new Array(net.h), out = new Array(net.k), i, j, c;
  for (i = 0; i < net.h; i++) {
    var s = net.b1[i], row = net.w1[i];
    for (j = 0; j < net.nIn; j++) s += row[j] * x[j];
    hid[i] = Math.tanh(s);
  }
  var max = -1e9;
  for (c = 0; c < net.k; c++) {
    var o = net.b2[c];
    for (i = 0; i < net.h; i++) o += net.w2[c][i] * hid[i];
    out[c] = o;
    if (o > max) max = o;
  }
  var sum = 0;
  for (c = 0; c < net.k; c++) { out[c] = Math.exp(out[c] - max); sum += out[c]; }
  for (c = 0; c < net.k; c++) out[c] /= sum;
  return { hid: hid, out: out };
}

function trainStep(net, x, y) {
  var f = trainForward(net, x), i, j, c;
  var dOut = f.out.slice();
  dOut[y] -= 1;
  var dHid = new Array(net.h);
  for (i = 0; i < net.h; i++) {
    var g = 0;
    for (c = 0; c < net.k; c++) g += dOut[c] * net.w2[c][i];
    dHid[i] = g * (1 - f.hid[i] * f.hid[i]);
  }
  for (c = 0; c < net.k; c++) {
    for (i = 0; i < net.h; i++) net.w2[c][i] -= TRAIN_RATE * dOut[c] * f.hid[i];
    net.b2[c] -= TRAIN_RATE * dOut[c];
  }
  for (i = 0; i < net.h; i++) {
    for (j = 0; j < net.nIn; j++) net.w1[i][j] -= TRAIN_RATE * dHid[i] * x[j];
    net.b1[i] -= TRAIN_RATE * dHid[i];
  }
}

function trainBest(out) {
  var b = 0;
  for (var k = 1; k < out.length; k++) if (out[k] > out[b]) b = k;
  return b;
}

function trainPack(net) {
  var r = function (v) { return Math.round(v * 1000) / 1000; };
  return { h: net.h, nIn: net.nIn, k: net.k, w1: net.w1.map(function (row) { return row.map(r); }), b1: net.b1.map(r), w2: net.w2.map(function (row) { return row.map(r); }), b2: net.b2.map(r) };
}

function trainUnpack(t, h) {
  var saved = state.trainNets && state.trainNets[t.id];
  if (!saved || saved.nIn !== t.inputs || saved.k !== t.labels.length || !saved.w1 || saved.w1.length !== saved.h) return null;
  return trainPack(saved);
}

function trainSave(idx) {
  var t = TRAIN_TRIALS[idx], run = trainRuns[t.id];
  if (!run || !run.net) return;
  if (!state.trainNets) state.trainNets = {};
  state.trainNets[t.id] = trainPack(run.net);
}

function trainRun(idx) {
  var t = TRAIN_TRIALS[idx];
  var run = trainRuns[t.id];
  var h = trainNeurons();
  if (!run) {
    run = trainRuns[t.id] = { net: trainUnpack(t, h), test: null, seen: 0, history: [], acc: 0, sample: null };
  }
  if (!run.net || run.net.h !== h) {
    var old = run.net;
    run.net = trainMake(t.inputs, h, t.labels.length);
    if (old) {
      var keep = Math.min(old.h, h);
      for (var i = 0; i < keep; i++) {
        run.net.w1[i] = old.w1[i].slice(); run.net.b1[i] = old.b1[i];
        for (var c = 0; c < old.k; c++) run.net.w2[c][i] = old.w2[c][i];
      }
      for (var q = 0; q < old.k; q++) run.net.b2[q] = old.b2[q];
    }
    run.test = null;
  }
  if (!run.test) {
    run.test = [];
    var tn = trainTestSize(trainTarget(idx));
    for (var n = 0; n < tn; n++) run.test.push(t.gen(trainTarget(idx)));
    run.acc = trainAccuracy(run);
  }
  if (!run.sample) run.sample = t.gen(trainTarget(idx));
  return run;
}

function trainAccuracy(run) {
  var right = 0;
  run.test.forEach(function (s) { if (trainBest(trainForward(run.net, s.x).out) === s.y) right++; });
  return right / run.test.length;
}

function trainStatus(idx) {
  var run = trainRun(idx), target = trainTarget(idx);
  var need = trainNeedAcc(target), block = trainLevelBlock(idx);
  var ready = run.acc >= need && run.seen >= trainTaughtMin(target);
  var cost = trainCostFor(idx);
  return { run: run, target: target, need: need, block: block, ready: ready, stalled: ready && !!block, cost: cost, unaffordable: cost > trainDataCap() * 0.95 };
}

function trainVocabSize(idx, level) {
  var id = TRAIN_TRIALS[idx].id;
  if (id === "both") return trainBothCount(level) + 2 * trainPairCount(level);
  if (id === "opposites" || id === "pairs" || id === "cycles") return 2 * trainPairCount(level);
  return 0;
}

function trainNewWords(idx, from, to) {
  var id = TRAIN_TRIALS[idx].id, out = [];
  if (id === "both") {
    TRAIN_BOTH.slice(trainBothCount(from), trainBothCount(to)).forEach(function (w) { out.push(w); });
    TRAIN_PAIRS.slice(trainPairCount(from), trainPairCount(to)).forEach(function (p) { out.push(p[0], p[1]); });
  } else if (id === "opposites" || id === "pairs" || id === "cycles") {
    TRAIN_PAIRS.slice(trainPairCount(from), trainPairCount(to)).forEach(function (p) { out.push(p[0], p[1]); });
  }
  return out;
}

function trainLearn(idx, s) {
  var st = trainStatus(idx);
  if (st.stalled) return false;
  var t = TRAIN_TRIALS[idx], run = st.run;
  var cost = st.cost;
  if (st.unaffordable || trainPool() < cost) return false;
  trainSpend(cost);
  for (var p = 0; p < TRAIN_PASSES; p++) trainStep(run.net, s.x, s.y);
  run.seen += 1;
  run.acc = trainAccuracy(run);
  run.history.push(run.acc);
  if (run.history.length > TRAIN_HIST) run.history.shift();
  trainSave(idx);
  if (run.acc >= st.need && run.seen >= trainTaughtMin(st.target) && !st.block) {
    trainLevels()[t.id] = st.target;
    run.seen = 0;
    run.test = null;
    run.sample = null;
    run.history = [];
    trainRun(idx);
    var fresh = trainNewWords(idx, st.target, st.target + 1);
    if (typeof playMergeSound === "function") playMergeSound(Math.min(10, 2 + st.target));
    if (typeof aiSay === "function") aiSay("learned " + t.name + ", level " + st.target + ". i know " + aiKnow() + " now.");
    if (trainUI) trainUI.msg.textContent = t.name + " reached level " + st.target + (fresh.length ? ". new words: " + fresh.join(", ") + "." : ".");
  }
  return true;
}

function trainBuildUI() {
  var st = document.createElement("style");
  st.textContent =
    "#trainScreen { position: fixed; inset: 0; z-index: 900; background: var(--paper); color: var(--ink); display: none; overflow: auto; }" +
    "#trainScreen .train-box { max-width: 580px; margin: 0 auto; padding: 18px 16px 28px; }" +
    "#trainScreen .train-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }" +
    "#trainScreen .train-title { font-size: 18px; }" +
    "#trainScreen .train-cap { font-size: 11px; opacity: 0.65; }" +
    "#trainScreen .train-tabs { display: flex; gap: 4px; margin-top: 10px; flex-wrap: wrap; }" +
    "#trainScreen .train-tabs button { font-size: 11px; padding: 2px 8px; }" +
    "#trainScreen .train-tabs button.on { background: var(--ink); color: var(--paper); }" +
    "#trainScreen .train-prompt { border: 1px solid var(--ink); margin-top: 12px; padding: 22px 12px; text-align: center; min-height: 92px; box-sizing: border-box; }" +
    "#trainScreen .train-words { font-size: 30px; letter-spacing: 1px; }" +
    "#trainScreen .train-sep { margin: 0 14px; opacity: 0.4; }" +
    "#trainScreen .train-cells { display: flex; gap: 5px; justify-content: center; flex-wrap: wrap; }" +
    "#trainScreen .train-cell { min-width: 46px; border: 1px solid var(--ink); padding: 5px 3px; font-size: 12px; }" +
    "#trainScreen .train-cell.q { border-style: dashed; }" +
    "#trainScreen .train-cell b { display: block; font-weight: normal; font-size: 13px; }" +
    "#trainScreen .train-cell span { display: block; font-size: 15px; opacity: 0.7; min-height: 18px; }" +
    "#trainScreen .train-barline { display: flex; align-items: center; gap: 10px; margin: 6px auto; max-width: 320px; font-size: 12px; }" +
    "#trainScreen .train-barline span { width: 48px; text-align: right; }" +
    "#trainScreen .train-bar { flex: 1; height: 14px; border: 1px solid var(--ink); position: relative; }" +
    "#trainScreen .train-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); }" +
    "#trainScreen .train-opt { display: block; width: 100%; text-align: left; margin-top: 6px; padding: 0; position: relative; height: 30px; overflow: hidden; }" +
    "#trainScreen .train-opt i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); opacity: 0.16; }" +
    "#trainScreen .train-opt span { position: relative; display: flex; justify-content: space-between; padding: 0 10px; line-height: 30px; font-size: 13px; }" +
    "#trainScreen .train-opt:disabled { opacity: 0.4; }" +
    "#trainScreen .train-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 14px; margin-top: 14px; font-size: 12px; font-variant-numeric: tabular-nums; }" +
    "#trainScreen .train-stats div { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(128,128,128,0.35); padding-bottom: 2px; }" +
    "#trainScreen canvas.train-graph { width: 100%; height: 90px; border: 1px solid var(--ink); margin-top: 12px; display: block; }" +
    "#trainScreen .train-buttons { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }" +
    "#trainScreen .train-msg { margin-top: 8px; font-size: 12px; min-height: 16px; }";
  document.head.appendChild(st);

  var screen = trainMk("div");
  screen.id = "trainScreen";
  var box = trainMk("div", "train-box");
  screen.appendChild(box);

  var head = trainMk("div", "train-head");
  head.appendChild(trainMk("div", "train-title", "training program"));
  var close = trainMk("button", "", "close");
  close.addEventListener("click", trainClose);
  head.appendChild(close);
  box.appendChild(head);
  var sub = trainMk("div", "train-cap", "your ai knows nothing. teach it what you know: it learns exactly what you tell it, right or wrong. each answer costs data. more memory unlocks harder trials.");
  box.appendChild(sub);

  var tabs = trainMk("div", "train-tabs");
  var tabBtns = TRAIN_TRIALS.map(function (t, i) {
    var b = trainMk("button", "", (i + 1) + " " + t.name);
    b.addEventListener("click", function () { trainSelect(i); });
    tabs.appendChild(b);
    return b;
  });
  box.appendChild(tabs);

  var lesson = trainMk("div", "train-cap");
  lesson.style.marginTop = "8px";
  box.appendChild(lesson);

  var prompt = trainMk("div", "train-prompt");
  box.appendChild(prompt);

  var optWrap = trainMk("div");
  box.appendChild(optWrap);
  var warn = trainMk("div", "train-msg");
  warn.style.fontWeight = "bold";
  box.appendChild(warn);

  var buttons = trainMk("div", "train-buttons");
  var next = trainMk("button", "", "skip");
  buttons.appendChild(next);
  box.appendChild(buttons);

  var msg = trainMk("div", "train-msg");
  box.appendChild(msg);

  var stats = trainMk("div", "train-stats");
  var statNodes = {};
  [["accuracy", "accuracy"], ["need", "needed for next level"], ["level", "this trial's level"], ["vocab", "vocabulary"], ["neurons", "neurons (memory)"], ["gate", "memory"], ["seen", "taught this level"], ["model", "model storage (memory)"], ["data", "data"], ["handles", "machines it can handle"]].forEach(function (p) {
    var d = trainMk("div");
    d.appendChild(trainMk("span", "", p[1]));
    var v = trainMk("span");
    d.appendChild(v); stats.appendChild(d);
    statNodes[p[0]] = v;
  });
  box.appendChild(stats);

  var graph = trainMk("canvas", "train-graph");
  graph.width = 560; graph.height = 90;
  box.appendChild(graph);
  box.appendChild(trainMk("div", "train-cap", "accuracy on a fixed test it is never taught from"));

  document.body.appendChild(screen);

  next.addEventListener("click", function () { trainRun(trainCur).sample = TRAIN_TRIALS[trainCur].gen(trainTarget(trainCur)); trainDraw(); });
  trainUI = { warn: warn, screen: screen, tabs: tabBtns, lesson: lesson, prompt: prompt, optWrap: optWrap, opts: [], optFor: -1, msg: msg, stats: statNodes, graph: graph };
}

function trainSelect(i) {
  if (!trainUnlocked(i)) return;
  trainCur = i;
  trainUI.msg.textContent = "";
  trainDraw();
}

function trainAnswer(k) {
  var run = trainRun(trainCur), s = run.sample;
  if (!s) return;
  if (typeof playCardPickSound === "function") playCardPickSound();
  var guessed = trainBest(trainForward(run.net, s.x).out);
  var cost = trainCost();
  if (trainStatus(trainCur).stalled || trainStatus(trainCur).unaffordable) return;
  if (trainPool() < cost) { trainUI.msg.textContent = "not enough data. wait for it to collect."; return; }
  var right = s.y;
  trainUI.msg.textContent = "";
  trainLearn(trainCur, { x: s.x, y: k });
  var t = TRAIN_TRIALS[trainCur];
  if (!trainUI.msg.textContent) {
    trainUI.msg.textContent = k === right ? "right. you taught it " + t.labels[k] + (guessed === k ? ", which it already believed." : ", and it had guessed " + t.labels[guessed] + ".") : "wrong. it was " + t.labels[right] + ". it learned what you told it.";
  }
  run.sample = t.gen(trainTarget(trainCur));
  trainDraw();
}

function trainTick() {
  if (!trainOpen) return;
  trainDemo.data = Math.min(TRAIN_DEMO_CAP, trainDemo.data + TRAIN_DEMO_CAP * TRAIN_DEMO_FILL * 0.1);
  trainDraw();
}

function trainDraw() {
  if (!trainUI) return;
  var t = TRAIN_TRIALS[trainCur], run = trainRun(trainCur), st = trainStatus(trainCur);
  var u = trainUI;
  u.tabs.forEach(function (b, i) {
    var lv = trainLevel(TRAIN_TRIALS[i].id);
    b.disabled = !trainUnlocked(i);
    b.title = trainCap() < TRAIN_GATES[i] ? "needs " + aiFmtBytesSafe(TRAIN_GATES[i]) + " of memory" : (i > 0 && trainLevel(TRAIN_TRIALS[i - 1].id) < 1 ? "reach level 1 in " + TRAIN_TRIALS[i - 1].name + " first" : "");
    b.className = i === trainCur ? "on" : "";
    b.textContent = (i + 1) + " " + TRAIN_TRIALS[i].name + (lv > 0 ? " L" + lv : "");
  });
  u.lesson.textContent = t.lesson;

  if (u.optFor !== trainCur) {
    u.optWrap.innerHTML = "";
    u.opts = t.labels.map(function (name, k) {
      var b = trainMk("button", "train-opt");
      var bar = trainMk("i");
      var line = trainMk("span");
      var l = trainMk("b", "", name); l.style.fontWeight = "normal";
      var r = trainMk("em"); r.style.fontStyle = "normal";
      line.appendChild(l); line.appendChild(r);
      b.appendChild(bar); b.appendChild(line);
      b.addEventListener("click", function () { trainAnswer(k); });
      u.optWrap.appendChild(b);
      return { btn: b, bar: bar, pct: r };
    });
    u.optFor = trainCur;
  }

  u.prompt.innerHTML = "";
  run.sample.show(u.prompt);

  var out = trainForward(run.net, run.sample.x).out;
  var best = trainBest(out);
  var enough = trainPool() >= trainCost() && !st.stalled && !st.unaffordable;
  u.opts.forEach(function (o, idx) {
    o.bar.style.width = (out[idx] * 100).toFixed(1) + "%";
    o.pct.textContent = Math.round(out[idx] * 100) + "%" + (idx === best ? "  \u25c2" : "");
    o.btn.disabled = !enough;
  });
  u.warn.textContent = st.unaffordable ? "one lesson costs " + aiFmtBytesSafe(st.cost) + " but the data pool only holds " + aiFmtBytesSafe(trainDataCap()) + ". buy more memory." : st.stalled ? "learning has stalled: " + st.block + "." : (!st.ready && st.block && run.acc >= st.need * 0.97 ? "almost there. note: " + st.block + "." : "");
  var lv = trainLevel(t.id);

  var fmt = aiFmtBytesSafe;
  u.stats.accuracy.textContent = Math.round(run.acc * 1000) / 10 + "%";
  u.stats.need.textContent = (Math.round(st.need * 1000) / 10) + "% over " + run.test.length + " tests";
  u.stats.level.textContent = lv + " (aiming for " + st.target + ")";
  u.stats.vocab.textContent = trainVocabSize(trainCur, st.target) ? trainVocabSize(trainCur, st.target) + " words" : "-";
  u.stats.neurons.textContent = trainNeurons() + " (level " + st.target + " needs " + trainNeedNeurons(trainCur, st.target) + ")";
  u.stats.gate.textContent = aiFmtBytesSafe(trainCap()) + " (needs " + aiFmtBytesSafe(TRAIN_GATES[trainCur]) + ")";
  u.stats.seen.textContent = run.seen + " of " + trainTaughtMin(st.target);
  u.stats.model.textContent = fmt(trainModelBytes()) + " of " + fmt(trainBudget());
  u.stats.data.textContent = fmt(trainPool()) + " (" + fmt(trainCost()) + " per answer)" + (trainRealMemory() ? "" : " demo");
  u.stats.handles.textContent = typeof aiHandles === "function" ? fmtInt(aiHandles()) + " (you have " + fmtInt(aiMachines()) + ")" : "";

  var ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#000";
  var gc = u.graph.getContext("2d");
  var W = u.graph.width, H = u.graph.height;
  gc.clearRect(0, 0, W, H);
  gc.strokeStyle = ink;
  gc.globalAlpha = 0.25;
  gc.lineWidth = 1;
  var yLine = H - 4 - st.need * (H - 8);
  gc.setLineDash([4, 4]);
  gc.beginPath(); gc.moveTo(0, yLine); gc.lineTo(W, yLine); gc.stroke();
  gc.setLineDash([]);
  gc.globalAlpha = 1;
  var hist = run.history;
  if (hist.length > 1) {
    gc.lineWidth = 2;
    gc.beginPath();
    for (var p = 0; p < hist.length; p++) {
      var x = p / (TRAIN_HIST - 1) * W, y2 = H - 4 - hist[p] * (H - 8);
      if (p === 0) gc.moveTo(x, y2); else gc.lineTo(x, y2);
    }
    gc.stroke();
  }
}

function trainOpenScreen() {
  if (!trainUI) trainBuildUI();
  trainOpen = true;
  trainUI.screen.style.display = "block";
  trainUI.msg.textContent = "";
  trainDraw();
  if (!trainTimer) trainTimer = setInterval(trainTick, 100);
}

function trainClose() {
  trainOpen = false;
  if (trainUI) trainUI.screen.style.display = "none";
  if (trainTimer) { clearInterval(trainTimer); trainTimer = null; }
}

document.addEventListener("keydown", function (e) { if (e.key === "Escape" && trainOpen) trainClose(); });
