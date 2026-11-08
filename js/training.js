"use strict";

var trainUI = null;
var trainOpen = false;
var trainTimer = null;
var trainNote = "";

var trainB = { cols: 0, rows: 0, page: "", marks: [], fill: 0 };
var trainCw = 7;
var trainLh = 13;

function trainMk(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function trainBits(n) {
  var out = "";
  while (out.length < n) out += aiBalancedLine();
  return out.slice(0, n);
}

function trainBuildUI() {
  var st = document.createElement("style");
  st.textContent =
    "#trainScreen { position: fixed; inset: 0; z-index: 900; background: var(--paper); color: var(--ink); display: none; flex-direction: column; padding: 10px; box-sizing: border-box; font-family: ui-monospace, Menlo, Consolas, 'Courier New', monospace; font-size: 12px; line-height: 14px; }" +
    "#trainScreen.open { display: flex; }" +
    "#trainScreen .tm-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-size: 11px; }" +
    "#trainScreen .tm-bar button { background: var(--paper); color: var(--ink); border: 1px solid var(--ink); padding: 0 10px; font-family: inherit; text-transform: uppercase; font-size: 11px; cursor: pointer; }" +
    "#trainScreen .tm-box { flex: 1; min-height: 0; border: 2px solid var(--ink); display: flex; flex-direction: column; padding: 4px 6px; overflow: hidden; }" +
    "#trainScreen .tm-head { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.55; white-space: nowrap; overflow: hidden; height: 14px; flex: none; }" +
    "#trainScreen .tm-pane { flex: 1; min-height: 0; overflow: hidden; }" +
    "#trainScreen .tm-grid { font-size: 11px; line-height: 13px; letter-spacing: 1px; white-space: pre; margin: 0; font-family: inherit; }" +
    "#trainScreen .tm-grid .bad { background: var(--ink); color: var(--paper); cursor: pointer; }" +
    "#trainScreen .tm-grid .cur { background: var(--ink); color: var(--paper); }" +
    "#trainScreen .tm-grid .wait { opacity: 0.28; }" +
    "#trainScreen .tm-stat { display: flex; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-top: 6px; padding-top: 4px; border-top: 1px solid var(--ink); font-size: 11px; }" +
    "#trainScreen .tm-msg { margin-top: 6px; font-size: 11px; min-height: 15px; }";
  document.head.appendChild(st);

  var screen = trainMk("div");
  screen.id = "trainScreen";

  var bar = trainMk("div", "tm-bar");
  bar.appendChild(trainMk("span", "", "ai-os 1.0 :: write"));
  var close = trainMk("button", "", "exit");
  close.addEventListener("click", trainClose);
  bar.appendChild(close);
  screen.appendChild(bar);

  var box = trainMk("div", "tm-box");
  var head = trainMk("div", "tm-head");
  var pane = trainMk("div", "tm-pane");
  var grid = trainMk("pre", "tm-grid");
  pane.appendChild(grid);
  box.appendChild(head); box.appendChild(pane);
  screen.appendChild(box);
  grid.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.dataset || t.dataset.i === undefined) return;
    var i = parseInt(t.dataset.i, 10);
    if (!trainB.marks[i]) return;
    trainB.marks[i] = 0;
    aiFix();
    if (typeof playSlotTickSound === "function") playSlotTickSound(1.4);
    trainDraw();
  });

  var msg = trainMk("div", "tm-msg");
  screen.appendChild(msg);
  var stat = trainMk("div", "tm-stat");
  var cells = {};
  ["w", "q", "a", "f", "p", "o"].forEach(function (k) { var sp = trainMk("span"); stat.appendChild(sp); cells[k] = sp; });
  screen.appendChild(stat);

  document.body.appendChild(screen);
  var probe = trainMk("span", "tm-grid");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
  probe.textContent = "0000000000000000000000000000000000000000";
  screen.appendChild(probe);
  trainUI = { screen: screen, head: head, pane: pane, grid: grid, msg: msg, cells: cells, probe: probe };
}

function trainMeasure() {
  var u = trainUI;
  var w = u.probe.getBoundingClientRect().width / 40;
  if (w > 2) trainCw = w;
  var cols = Math.max(1, Math.floor((u.pane.clientWidth - 4) / trainCw));
  var rows = Math.max(1, Math.floor((u.pane.clientHeight - 2) / trainLh));
  if (cols !== trainB.cols || rows !== trainB.rows) {
    trainB.cols = cols; trainB.rows = rows;
    trainPage();
  }
}

function trainPage() {
  var n = trainB.cols * trainB.rows;
  trainB.page = trainBits(n);
  trainB.marks = new Array(n);
  for (var i = 0; i < n; i++) trainB.marks[i] = 0;
  trainB.fill = 0;
}

function trainDraw() {
  if (!trainUI) return;
  var u = trainUI, b = trainB;
  trainMeasure();
  var n = b.page.length, f = Math.min(n, Math.floor(b.fill)), i;
  var gray = Math.min(n - f, Math.floor(aiQueue()));
  var html = "", run = "", bad = false;
  var wrap = function (idx) { return (idx + 1) % b.cols === 0 && idx + 1 < n ? "\n" : ""; };
  var flush = function () { if (run) html += bad ? '<span class="bad">' + run + "</span>" : run; run = ""; };
  for (i = 0; i < f; i++) {
    if (b.marks[i]) {
      flush();
      html += '<span class="bad" data-i="' + i + '">' + (b.page.charAt(i) === "0" ? "1" : "0") + "</span>" + wrap(i);
    } else run += b.page.charAt(i) + wrap(i);
  }
  flush();
  if (f < n) {
    html += '<span class="cur">' + b.page.charAt(f) + "</span>" + wrap(f);
    var g = "", k;
    for (k = f + 1; k < f + gray && k < n; k++) g += b.page.charAt(k) + wrap(k);
    html += '<span class="wait">' + g + "</span>";
    var blank = "";
    for (k = f + gray; k < n; k++) blank += (k > f ? " " : "") + wrap(k);
    html += blank;
  }
  u.grid.innerHTML = html;

  var cap = aiCapacity();
  var c = u.cells;
  u.head.textContent = "machines +" + aiFmtBytes(aiMachineRate()) + "/s · ai writes " + aiFmtBytes(aiWriteRate() * aiPowerFrac()) + "/s · " + Math.round(aiErrRate() * 100) + "% wrong · highlighted bits are mistakes: click to flip";
  c.w.textContent = "written " + aiFmtBytes(aiData()) + " / " + aiFmtBytes(cap);
  c.q.textContent = "waiting " + aiFmtBytes(aiQueue());
  c.a.textContent = "clean " + Math.round(aiAcc() * 100) + "%";
  c.f.textContent = "flipped " + fmtInt(state.aiFlips || 0);
  c.p.textContent = "power " + (aiDraw() > 0 ? (aiPowerFrac() < 0.99 ? "short" : "ok") : "idle");
  c.o.textContent = "overclock " + aiBuffText();
  var m;
  if (cap <= 0) m = "no memory. buy some in the motherboard.";
  else if (aiCaughtUp()) m = "it has caught up with your machines. it can balance them now.";
  else if (aiData() + aiQueue() >= cap - 1) m = "memory is full. more memory lets it hold more.";
  else m = "grey is data from your machines. it writes it over in black. flip the highlighted mistakes: that is how it learns balance.";
  u.msg.textContent = "> " + m;
}

function trainTick() {
  if (!trainOpen) return;
  var b = trainB;
  if (b.cols) {
    var cells = b.cols * b.rows;
    var step = Math.min(cells * 0.5, (state.aiWriteNow || 0) * 0.1);
    var from = Math.floor(b.fill);
    b.fill += step;
    var err = aiErrRate();
    for (var i = from; i < Math.min(cells, Math.floor(b.fill)); i++) b.marks[i] = Math.random() < err ? 1 : 0;
    if (b.fill >= cells) trainPage();
  }
  trainDraw();
}

function trainOpenScreen() {
  if (!trainUI) trainBuildUI();
  trainOpen = true;
  trainB.cols = 0;
  trainUI.screen.classList.add("open");
  trainDraw();
  if (!trainTimer) trainTimer = setInterval(trainTick, 100);
}

function trainClose() {
  trainOpen = false;
  if (trainUI) trainUI.screen.classList.remove("open");
  if (trainTimer) { clearInterval(trainTimer); trainTimer = null; }
}

window.addEventListener("resize", function () { if (trainOpen) { trainB.cols = 0; trainDraw(); } });
document.addEventListener("keydown", function (e) { if (trainOpen && e.key === "Escape") trainClose(); });
