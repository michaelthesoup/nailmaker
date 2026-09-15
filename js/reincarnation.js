"use strict";

// ----------------------------------------------------------------
// Reincarnation. Ending a life is a choice between two paths:
//  - Suicide (the "end run" button, in actions.js): karma resets to
//    zero. A true dead end -- you start over exactly like a brand new
//    player, no benefit at all, just a score on the leaderboard.
//  - Reincarnation (this file): your total karma decides how good
//    your next life's starting position is. The ritual is the same
//    flickering wall of characters either way -- almost all noise,
//    resolving into a message once it settles -- but what it reveals
//    now is your fate, not a puzzle to solve. Enough karma eventually
//    reaches Nirvana, a permanent achievement.
// ----------------------------------------------------------------

var RC_GRID_ROWS = 16;
var RC_GRID_COLS = 24;
var RC_DECOY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
var RC_FLICKER_INTERVAL_MS = 150;
var RC_FLICKER_FRACTION = 0.15; // fraction of cells re-randomized per tick
var RC_REVEAL_START_DELAY_MS = 120;
var RC_REVEAL_SPEEDUP = 0.92;
var RC_REVEAL_MIN_DELAY_MS = 4;
var RC_SUSPENSE_MS = 2200; // how long the noise flickers before resolving into your fate

var rc = null; // active ritual state while the overlay is open

function startReincarnation() {
  var karmaAvailable = Math.floor(state.tao / KARMA_TAO_THRESHOLD);
  if (karmaAvailable < 1) return;

  var newTotalKarma = state.karma + karmaAvailable;
  var confirmed = window.confirm(
    "Be reincarnated?\n\n" +
    "You'll gain " + karmaAvailable + " karma (" + newTotalKarma + " total, forever). " +
    "This life ends, but your karma carries forward. It improves the odds of stronger starting bonuses, but every stat is rolled independently and nothing is guaranteed.\n\n" +
    "This can't be undone."
  );
  if (!confirmed) return;

  state.karma = newTotalKarma;
  runReincarnationRitual(rollStartingBonuses(newTotalKarma));
}

function runReincarnationRitual(result) {
  var scratch = defaultState();
  var before = { funds: scratch.funds, nailMakers: scratch.nailMakers, breakers: scratch.breakers, marketingLevel: scratch.marketingLevel, factories: scratch.factories };
  scratch.funds += result.granted.funds;
  scratch.nailMakers += result.granted.nailMakers;
  scratch.breakers += result.granted.breakers;
  scratch.marketingLevel += result.granted.marketingLevel;
  scratch.factories += result.granted.factories;
  var granted = {
    funds: Math.round(scratch.funds - before.funds),
    nailMakers: Math.round(scratch.nailMakers - before.nailMakers),
    breakers: Math.round(scratch.breakers - before.breakers),
    marketingLevel: Math.round(scratch.marketingLevel - before.marketingLevel),
    factories: Math.round(scratch.factories - before.factories)
  };
  var taoAward = reincarnationTaoAward(result, state.karma);

  rc = { title: result.title, granted: granted, taoAward: taoAward, cells: [], flickerTimer: null };

  buildGridNoise();
  el.reincarnateGrid.innerHTML = "";
  el.reincarnateStatus.textContent = "";
  el.btnReincarnateConfirm.style.display = "none";
  el.reincarnateOverlay.style.display = "flex";

  revealGrid(0);
}

function buildGridNoise() {
  var totalCells = RC_GRID_ROWS * RC_GRID_COLS;
  var chars = new Array(totalCells);
  var offset = Math.floor(Math.random() * RC_DECOY_CHARS.length);
  for (var i = 0; i < totalCells; i++) {
    chars[i] = decoyCharAt(i + offset);
  }
  rc.chars = chars;
  rc.flickerStep = 0;
}

function decoyCharAt(index) {
  return RC_DECOY_CHARS.charAt(index % RC_DECOY_CHARS.length);
}

// Reveals cells one at a time, left to right, top to bottom, speeding
// up as it goes. Once the whole grid is in, it flickers a while for
// suspense, then resolves into a message revealing your next life.
function revealGrid(index) {
  var totalCells = RC_GRID_ROWS * RC_GRID_COLS;
  if (index >= totalCells) {
    startFlicker();
    setTimeout(resolveRitual, RC_SUSPENSE_MS);
    return;
  }

  var span = document.createElement("span");
  span.className = "rc-cell";
  span.textContent = rc.chars[index];
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
    rc.flickerStep += 1;
    for (var i = 0; i < rc.cells.length; i++) {
      if (Math.random() < RC_FLICKER_FRACTION) {
        rc.cells[i].textContent = decoyCharAt(i + rc.flickerStep);
      }
    }
  }, RC_FLICKER_INTERVAL_MS);
}

// The noise settles and the grid clears to reveal your next life.
function resolveRitual() {
  clearInterval(rc.flickerTimer);
  el.reincarnateGrid.innerHTML = "";

  var title = rc.title;
  var heading = title.isNirvana ? "NIRVANA" : "your next life begins with " + title.label;
  var msg = document.createElement("div");
  msg.style.fontWeight = "bold";
  msg.style.fontSize = title.isNirvana ? "28px" : "18px";
  msg.style.letterSpacing = "1px";
  msg.textContent = heading;
  el.reincarnateGrid.appendChild(msg);

  var bonusHeading = document.createElement("div");
  bonusHeading.style.marginTop = "16px";
  bonusHeading.style.fontWeight = "bold";
  bonusHeading.textContent = "starting bonuses";
  el.reincarnateGrid.appendChild(bonusHeading);

  var bonusLine = document.createElement("div");
  bonusLine.style.marginTop = "6px";
  bonusLine.style.fontFamily = "Arial, Helvetica, sans-serif";
  bonusLine.style.fontSize = "14px";
  bonusLine.textContent = buildGrantedText(rc.granted);
  el.reincarnateGrid.appendChild(bonusLine);

  var taoLine = document.createElement("div");
  taoLine.style.marginTop = "6px";
  taoLine.style.fontFamily = "Arial, Helvetica, sans-serif";
  taoLine.style.fontSize = "14px";
  taoLine.textContent = rc.taoAward ? "+" + rc.taoAward + " tao awarded" : "no tao awarded this life";
  el.reincarnateGrid.appendChild(taoLine);

  var codeLine = document.createElement("div");
  codeLine.style.marginTop = "10px";
  codeLine.style.fontFamily = "'Courier New', Courier, monospace";
  codeLine.style.fontSize = "14px";
  codeLine.style.letterSpacing = "2px";
  codeLine.textContent = buildGrantedCodeSummary(rc.granted);
  el.reincarnateGrid.appendChild(codeLine);

  el.reincarnateStatus.textContent = "";
  el.btnReincarnateConfirm.style.display = "inline-block";
}

function buildGrantedCodeSummary(granted) {
  var parts = [];
  if (granted.funds) parts.push("$" + (granted.funds > 0 ? "+" : "") + granted.funds);
  if (granted.nailMakers) parts.push("nm" + (granted.nailMakers > 0 ? "+" : "") + granted.nailMakers);
  if (granted.breakers) parts.push("br" + (granted.breakers > 0 ? "+" : "") + granted.breakers);
  if (granted.marketingLevel) parts.push("mk" + (granted.marketingLevel > 0 ? "+" : "") + granted.marketingLevel);
  if (granted.factories) parts.push("fc" + (granted.factories > 0 ? "+" : "") + granted.factories);
  return parts.length ? parts.join("  ") : "nothing this time";
}

function buildGrantedText(granted) {
  var parts = [];
  if (granted.funds) parts.push("+" + fmtMoney(granted.funds) + " starting funds");
  if (granted.marketingLevel) parts.push("+" + granted.marketingLevel + " marketing");
  if (granted.nailMakers) parts.push("+" + granted.nailMakers + " nail makers");
  if (granted.breakers) parts.push("+" + granted.breakers + " nail breakers");
  if (granted.factories) parts.push("+" + granted.factories + " factories");
  return parts.length ? parts.join("  |  ") : "no starting bonuses";
}

el.btnReincarnate.addEventListener("click", startReincarnation);

el.btnReincarnateConfirm.addEventListener("click", function () {
  var ritual = rc;
  rc = null;
  el.reincarnateOverlay.style.display = "none";

  var user = currentAuthUser();
  var name;
  if (user) {
    name = user.displayName || "player";
  } else {
    name = window.prompt("Name for the leaderboard:", "");
    if (name === null) name = "anonymous"; // reincarnation itself isn't cancellable at this point
    name = name.trim().slice(0, 20) || "anonymous";
  }
  submitScore(name, Math.floor(state.totalNailsMade));

  var karmaCarried = state.karma;
  var nirvanaCarried = state.nirvanaAchieved || !!ritual.title.isNirvana;
  var unlocksCarried = {
    unlockedMap: state.unlockedMap,
    unlockedMachinery: state.unlockedMachinery,
    unlockedTuning: state.unlockedTuning,
    unlockedYinYang: state.unlockedYinYang,
    guideSeen: state.guideSeen
  };
  var mapCarried = {
    mapIndex: state.mapIndex,
    mapTiles: state.mapTiles,
    mapTotalWeight: state.mapTotalWeight,
    autoNextMap: state.autoNextMap
  };
  var yinYangCarried = {
    yin: state.yin,
    yang: state.yang
  };

  var justReachedNirvana = ritual.title.isNirvana && !state.nirvanaAchieved;

  deleteAllSaves();
  state = defaultState();
  state.karma = karmaCarried;
  state.nirvanaAchieved = nirvanaCarried;
  state.unlockedMap = unlocksCarried.unlockedMap;
  state.unlockedMachinery = unlocksCarried.unlockedMachinery;
  state.unlockedTuning = unlocksCarried.unlockedTuning;
  state.unlockedYinYang = unlocksCarried.unlockedYinYang;
  state.guideSeen = unlocksCarried.guideSeen;
  state.mapIndex = mapCarried.mapIndex;
  state.mapTiles = mapCarried.mapTiles;
  state.mapTotalWeight = mapCarried.mapTotalWeight;
  state.autoNextMap = mapCarried.autoNextMap;
  state.yin = yinYangCarried.yin;
  state.yang = yinYangCarried.yang;
  state.tao = ritual.taoAward;
  state.taoBonusStack = 0;

  state.funds += ritual.granted.funds;
  state.nailMakers += ritual.granted.nailMakers;
  state.breakers += ritual.granted.breakers;
  state.marketingLevel += ritual.granted.marketingLevel;
  state.factories += ritual.granted.factories;

  render();
  if (typeof currentAuthUser === "function" && currentAuthUser()) cloudSaveState();

  if (justReachedNirvana) {
    window.alert(
      "NIRVANA.\n\n" +
      "Across every life you've lived, your karma has finally carried you all the way through. " +
      "This is as close to beating Nail Maker as the game gets.\n\n" +
      "You can keep playing -- there's no wall here, just the quiet feeling of having made it."
    );
  }
});
