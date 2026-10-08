"use strict";

// ----------------------------------------------------------------
// End-of-life screen and the past lives log.
//
//  - Every time a life ends (reincarnating OR ending the run) the
//    player gets an end screen summarizing that life and, across all
//    lives so far, the whole journey.
//  - Reincarnating appends the life that just ended to
//    state.pastLives, which carries into the next life (it's part of
//    the normal save).
//  - Ending the run wipes everything -- including this log -- because
//    defaultState() starts it empty.
// ----------------------------------------------------------------

var PAST_LIVES_MAX = 200;

function fmtDuration(totalSeconds) {
  var s = Math.max(0, Math.floor(totalSeconds));
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  if (h > 0) return h + "h " + m + "m";
  if (m > 0) return m + "m " + sec + "s";
  return sec + "s";
}

// Snapshot of the CURRENT state as a log entry. Call it before the
// state gets reset.
function buildLifeRecord(extra) {
  var log = state.pastLives || [];
  var rec = {
    life: log.length ? log[log.length - 1].life + 1 : 1,
    how: extra.how,
    nails: Math.floor(state.totalNailsMade),
    timeSec: Math.floor(state.simTime),
    earned: state.totalEarned || 0,
    makers: Math.floor(state.nailMakers),
    breakers: Math.floor(state.breakers),
    factories: Math.floor(state.factories),
    factorySquared: Math.floor(state.factorySquared),
    marketing: state.marketingLevel,
    map: state.mapIndex,
    collapses: state.swarmCollapses || 0,
    bombs: state.cityBombs,
    tao: state.tao,
    karmaGained: extra.karmaGained || 0,
    karmaTotal: extra.karmaTotal || 0,
    title: extra.title || "",
    nirvana: !!extra.nirvana
  };
  return rec;
}

function summarizeLives(lives) {
  var total = { count: lives.length, nails: 0, timeSec: 0, best: 0, bombs: 0 };
  for (var i = 0; i < lives.length; i++) {
    total.nails += lives[i].nails;
    total.timeSec += lives[i].timeSec;
    total.bombs += lives[i].bombs;
    if (lives[i].nails > total.best) total.best = lives[i].nails;
  }
  return total;
}

function sheetAddHeading(parent, text) {
  var h = document.createElement("div");
  h.className = "sheet-heading";
  h.textContent = text;
  parent.appendChild(h);
}

function sheetAddRows(parent, rows) {
  var table = document.createElement("div");
  table.className = "sheet-rows";
  for (var i = 0; i < rows.length; i++) {
    var row = document.createElement("div");
    row.className = "row";
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = rows[i][0];
    var value = document.createElement("span");
    value.className = "value";
    value.textContent = rows[i][1];
    row.appendChild(label);
    row.appendChild(value);
    table.appendChild(row);
  }
  parent.appendChild(table);
}

function sheetAddText(parent, text, className) {
  var p = document.createElement("div");
  p.className = className || "hint";
  p.textContent = text;
  parent.appendChild(p);
}

function taoText(n) {
  return (n > 0 ? "+" : "") + n;
}

// opts: { kind: "ended" | "reincarnated", life, allLives, karmaLost?, ritual?, nirvanaJustReached? }
function showEndScreen(opts) {
  var life = opts.life;
  var body = el.endScreenBody;
  body.innerHTML = "";

  var title = document.createElement("div");
  title.className = "sheet-title";
  var subtitle = "";
  if (opts.kind === "ended") {
    title.textContent = "THIS RUN IS OVER";
    subtitle = "You ended it for good. Your karma and your past lives are gone, and you start over like a brand new player.";
  } else if (life.nirvana) {
    title.textContent = "NIRVANA";
    subtitle = opts.nirvanaJustReached
      ? "Across every life you've lived, your karma has finally carried you all the way through. This is as close to beating Nail Maker as the game gets. You can keep playing -- there's no wall here, just the quiet feeling of having made it."
      : "Another life of Nirvana.";
  } else {
    title.textContent = "A LIFE ENDS";
    subtitle = "Your karma carries forward. Your next life begins with " + life.title + ".";
  }
  body.appendChild(title);
  sheetAddText(body, subtitle, "sheet-sub");

  sheetAddHeading(body, "this life (#" + life.life + ")");
  var machines = fmtInt(life.makers) + " makers \u00b7 " + fmtInt(life.breakers) + " breakers \u00b7 " + fmtInt(life.factories) + " factories" +
    (life.factorySquared > 0 ? " \u00b7 " + fmtInt(life.factorySquared) + " factory\u00b2" : "");
  sheetAddRows(body, [
    ["nails made (your score)", fmtInt(life.nails)],
    ["time lived", fmtDuration(life.timeSec)],
    ["money earned", fmtMoney(life.earned)],
    ["machines at the end", machines],
    ["marketing level", String(life.marketing)],
    ["map reached", String(life.map)],
    ["swarm collapses", String(life.collapses)],
    ["nailbombs dropped", String(life.bombs)],
    ["tao at the end", taoText(Math.floor(life.tao))]
  ]);

  if (opts.kind === "reincarnated") {
    sheetAddHeading(body, "karma");
    sheetAddRows(body, [
      ["gained this life", "+" + life.karmaGained],
      ["total karma", String(life.karmaTotal)]
    ]);
    if (opts.ritual) {
      sheetAddHeading(body, "your next life begins with");
      sheetAddText(body, buildGrantedText(opts.ritual.granted), "sheet-sub");
      sheetAddText(body, opts.ritual.taoAward ? "+" + opts.ritual.taoAward + " tao awarded" : "no tao awarded", "sheet-sub");
    }
  } else if (opts.karmaLost > 0) {
    sheetAddHeading(body, "karma");
    sheetAddRows(body, [["karma lost", String(opts.karmaLost)]]);
  }

  var sum = summarizeLives(opts.allLives);
  sheetAddHeading(body, opts.kind === "ended" ? "this whole run" : "across all your lives");
  sheetAddRows(body, [
    ["lives lived", String(sum.count)],
    ["total nails made", fmtInt(sum.nails)],
    ["best single life", fmtInt(sum.best)],
    ["total time played", fmtDuration(sum.timeSec)],
    ["nailbombs dropped", String(sum.bombs)]
  ]);

  if (opts.kind === "ended") {
    sheetAddText(body, "Your score was submitted to the leaderboard. The past lives log has been erased.", "sheet-sub");
  }

  el.endScreenOverlay.style.display = "flex";
  el.endScreenOverlay.firstElementChild.scrollTop = 0;
}

el.btnEndScreenClose.addEventListener("click", function () {
  el.endScreenOverlay.style.display = "none";
});

// ---------------- past lives log ----------------

function renderPastLives() {
  var log = state.pastLives || [];
  var body = el.pastLivesBody;
  body.innerHTML = "";

  if (log.length === 0) {
    sheetAddText(body, "no past lives yet -- reincarnate to start your log. Ending a run erases it.");
    return;
  }

  var sum = summarizeLives(log);
  sheetAddRows(body, [
    ["lives lived", String(sum.count)],
    ["total nails made", fmtInt(sum.nails)],
    ["best life", fmtInt(sum.best)],
    ["total time", fmtDuration(sum.timeSec)]
  ]);

  var wrap = document.createElement("div");
  wrap.className = "lives-wrap";
  var table = document.createElement("table");
  table.className = "lives-table";

  var head = document.createElement("tr");
  var cols = ["#", "nails", "time", "makers / breakers / factories", "map", "bombs", "karma", "began as"];
  for (var c = 0; c < cols.length; c++) {
    var th = document.createElement("th");
    th.textContent = cols[c];
    head.appendChild(th);
  }
  table.appendChild(head);

  for (var i = log.length - 1; i >= 0; i--) { // newest first
    var l = log[i];
    var tr = document.createElement("tr");
    var cells = [
      String(l.life),
      fmtInt(l.nails),
      fmtDuration(l.timeSec),
      fmtInt(l.makers) + " / " + fmtInt(l.breakers) + " / " + fmtInt(l.factories),
      String(l.map),
      String(l.bombs),
      "+" + l.karmaGained + " (" + l.karmaTotal + ")",
      l.nirvana ? "NIRVANA" : (l.title || "")
    ];
    for (var k = 0; k < cells.length; k++) {
      var td = document.createElement("td");
      td.textContent = cells[k];
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  wrap.appendChild(table);
  body.appendChild(wrap);
  sheetAddText(body, "\"began as\" is the title the NEXT life started with after that reincarnation. Karma shows gained (new total).");
}

el.btnPastLives.addEventListener("click", function () {
  renderPastLives();
  el.pastLivesOverlay.style.display = "flex";
  el.pastLivesOverlay.firstElementChild.scrollTop = 0;
});

el.btnPastLivesClose.addEventListener("click", function () {
  el.pastLivesOverlay.style.display = "none";
});

document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  el.pastLivesOverlay.style.display = "none";
  el.endScreenOverlay.style.display = "none";
});
