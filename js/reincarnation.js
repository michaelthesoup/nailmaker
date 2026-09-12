"use strict";

// ----------------------------------------------------------------
// Reincarnation. Ending a life turns your banked tao into karma
// (permanent, never spent) and drops you into a wall of characters.
// Almost all of them are meaningless and keep re-randomizing. A
// handful are real stats for your next life, written as a short code
// plus a digit (like "nm3"), and they never flicker -- that stillness
// is the only clue. Your current karma total is how many of them
// you're allowed to actually set before starting over.
// ----------------------------------------------------------------

var RC_GRID_ROWS = 16;
var RC_GRID_COLS = 24;
var RC_DECOY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
var RC_FLICKER_INTERVAL_MS = 150;
var RC_FLICKER_FRACTION = 0.15; // fraction of decoy cells re-randomized per tick
var RC_REVEAL_START_DELAY_MS = 120;
var RC_REVEAL_SPEEDUP = 0.92;
var RC_REVEAL_MIN_DELAY_MS = 4;

// Each real stat is a 2-letter code plus one digit (0-9), applied to a
// fresh life. More of these can be added later without changing how
// the ritual works -- the grid just gets a little more interesting.
var REAL_STATS = [
  { code: "nm", label: "starting nail makers", apply: function (s, v) { s.nailMakers = v; } },
  { code: "br", label: "starting nail breakers", apply: function (s, v) { s.breakers = v; } },
  { code: "fe", label: "starting iron (x100g)", apply: function (s, v) { s.ironAmt += v * 100; } },
  { code: "cu", label: "starting copper (x100g)", apply: function (s, v) { s.copperAmt += v * 100; } },
  { code: "$$", label: "starting funds (x10)", apply: function (s, v) { s.funds += v * 10; } },
  { code: "mk", label: "starting marketing level", apply: function (s, v) { s.marketingLevel = v; } },
  { code: "tb", label: "starting permanent speed bonus (x10%)", apply: function (s, v) { s.taoBonusStack += v * 0.1; } },
  { code: "fc", label: "starting factories", apply: function (s, v) { for (var i = 0; i < v; i++) s.factories.push(0); } },
];

var rc = null; // active ritual state while the overlay is open

function startReincarnation() {
  var karmaAvailable = Math.floor(state.tao / KARMA_TAO_THRESHOLD);
  if (karmaAvailable < 1) return;

  var newTotalKarma = state.karma + karmaAvailable;
  var confirmed = window.confirm(
    "End this life?\n\n" +
    "You'll gain " + karmaAvailable + " karma (" + newTotalKarma + " total, forever). " +
    "Everything else about this life is lost. You'll get to rewrite " + newTotalKarma + " part" + (newTotalKarma === 1 ? "" : "s") + " of the next one.\n\n" +
    "This can't be undone."
  );
  if (!confirmed) return;

  state.karma = newTotalKarma;
  runReincarnationRitual(newTotalKarma);
}

function runReincarnationRitual(pickBudget) {
  rc = {
    budget: pickBudget,
    cells: [], // { el, isStat, statIndex (0,1,2 = which char of the token), code, digit, chosen }
    chosenCodes: {}, // code -> value
    flickerTimer: null
  };

  buildGridLayout();
  el.reincarnateGrid.innerHTML = "";
  el.reincarnateStatus.textContent = "";
  el.btnReincarnateConfirm.style.display = "none";
  el.reincarnateOverlay.style.display = "flex";

  revealGrid(0);
}

// Decides where each real stat token sits in the grid (3 consecutive
// cells: 2 letters + 1 digit), fills everything else with noise.
function buildGridLayout() {
  var totalCells = RC_GRID_ROWS * RC_GRID_COLS;
  var chars = new Array(totalCells);
  var statAt = new Array(totalCells).fill(null); // { code, part } or null

  for (var i = 0; i < totalCells; i++) {
    chars[i] = randomDecoyChar();
  }

  var usedStarts = [];
  function overlaps(start) {
    for (var i = 0; i < usedStarts.length; i++) {
      if (Math.abs(usedStarts[i] - start) < 4) return true; // leave a gap between tokens
    }
    return false;
  }

  for (var s = 0; s < REAL_STATS.length; s++) {
    var stat = REAL_STATS[s];
    var start;
    var attempts = 0;
    do {
      start = Math.floor(Math.random() * (totalCells - 3));
      attempts++;
    } while (overlaps(start) && attempts < 500);
    usedStarts.push(start);

    var digit = Math.floor(Math.random() * 10);
    chars[start] = stat.code.charAt(0);
    chars[start + 1] = stat.code.charAt(1);
    chars[start + 2] = String(digit);
    statAt[start] = { code: stat.code, part: 0, digit: digit };
    statAt[start + 1] = { code: stat.code, part: 1, digit: digit };
    statAt[start + 2] = { code: stat.code, part: 2, digit: digit };
  }

  rc.chars = chars;
  rc.statAt = statAt;
}

function randomDecoyChar() {
  return RC_DECOY_CHARS.charAt(Math.floor(Math.random() * RC_DECOY_CHARS.length));
}

// Reveals cells one at a time, left to right, top to bottom, speeding
// up as it goes. Once the whole grid is in, the flicker loop starts.
function revealGrid(index) {
  var totalCells = RC_GRID_ROWS * RC_GRID_COLS;
  if (index >= totalCells) {
    el.reincarnateStatus.textContent = "picks remaining: " + rc.budget;
    el.btnReincarnateConfirm.style.display = "inline-block";
    startFlicker();
    return;
  }

  var span = document.createElement("span");
  span.className = "rc-cell";
  span.textContent = rc.chars[index];

  var statInfo = rc.statAt[index];
  if (statInfo) {
    span.className += " rc-stat";
    span.dataset.code = statInfo.code;
    span.dataset.part = statInfo.part;
    span.addEventListener("click", function () {
      onStatCellClick(statInfo.code);
    });
  }

  el.reincarnateGrid.appendChild(span);
  rc.cells.push(span);

  if ((index + 1) % RC_GRID_COLS === 0) {
    el.reincarnateGrid.appendChild(document.createElement("br"));
  }

  var delay = Math.max(RC_REVEAL_MIN_DELAY_MS, RC_REVEAL_START_DELAY_MS * Math.pow(RC_REVEAL_SPEEDUP, index));
  setTimeout(function () { revealGrid(index + 1); }, delay);
}

function startFlicker() {
  rc.flickerTimer = setInterval(function () {
    for (var i = 0; i < rc.cells.length; i++) {
      if (rc.statAt[i]) continue; // real stat cells never flicker
      if (Math.random() < RC_FLICKER_FRACTION) {
        rc.cells[i].textContent = randomDecoyChar();
      }
    }
  }, RC_FLICKER_INTERVAL_MS);
}

function onStatCellClick(code) {
  var alreadyChosen = rc.chosenCodes.hasOwnProperty(code);
  if (!alreadyChosen && Object.keys(rc.chosenCodes).length >= rc.budget) {
    return; // no picks left, and this one hasn't been claimed
  }

  if (!alreadyChosen) {
    rc.chosenCodes[code] = 0;
  } else {
    rc.chosenCodes[code] = (rc.chosenCodes[code] + 1) % 10;
  }

  for (var i = 0; i < rc.cells.length; i++) {
    var info = rc.statAt[i];
    if (info && info.code === code) {
      rc.cells[i].classList.add("rc-chosen");
      if (info.part === 2) rc.cells[i].textContent = String(rc.chosenCodes[code]);
    }
  }

  var used = Object.keys(rc.chosenCodes).length;
  el.reincarnateStatus.textContent = "picks remaining: " + (rc.budget - used) +
    (used > 0 ? " \u2014 click a chosen code again to change its number" : "");
}

el.btnReincarnate.addEventListener("click", startReincarnation);

el.btnReincarnateConfirm.addEventListener("click", function () {
  clearInterval(rc.flickerTimer);
  el.reincarnateOverlay.style.display = "none";

  var karmaCarried = state.karma;
  var chosen = rc.chosenCodes;
  rc = null;

  deleteAllSaves();
  state = defaultState();
  state.karma = karmaCarried;

  for (var i = 0; i < REAL_STATS.length; i++) {
    var stat = REAL_STATS[i];
    if (chosen.hasOwnProperty(stat.code)) {
      stat.apply(state, chosen[stat.code]);
    }
  }

  render();
  if (typeof currentAuthUser === "function" && currentAuthUser()) cloudSaveState();
});
