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
  var before = {
    funds: scratch.funds, ironAmt: scratch.ironAmt, copperAmt: scratch.copperAmt,
    nailMakers: scratch.nailMakers, marketingLevel: scratch.marketingLevel, factories: scratch.factories
  };
  scratch.funds += result.granted.funds;
  scratch.ironAmt += result.granted.ironAmt;
  scratch.copperAmt += result.granted.copperAmt;
  scratch.nailMakers += result.granted.nailMakers;
  scratch.marketingLevel += result.granted.marketingLevel;
  scratch.factories += result.granted.factories;
  var granted = {
    funds: Math.round((scratch.funds - before.funds) * 100) / 100,
    ironAmt: Math.round(scratch.ironAmt - before.ironAmt),
    copperAmt: Math.round(scratch.copperAmt - before.copperAmt),
    nailMakers: Math.round(scratch.nailMakers - before.nailMakers),
    marketingLevel: Math.round(scratch.marketingLevel - before.marketingLevel),
    factories: Math.round(scratch.factories - before.factories)
  };

  var taoAward = reincarnationTaoAward(result, state.karma);

  // Nail breakers are NOT an independent roll -- they're sized to
  // structurally balance the granted nail makers, using the same
  // demand/supply math the rest of the game already runs on (see
  // ironDemandRate()/ironSupplyRate() in formulas.js). This also picks
  // a fresh map sized so those breakers take roughly a minute of
  // active mining to clear it, instead of dropping the player onto a
  // tiny map 1 or carrying over whatever map they happened to die on.
  var newLifeMultiplier = 1 + taoAward * TAO_RATE_BONUS_PER_POINT; // mirrors productionRateBonusMultiplier() for the tao the NEW life starts with
  var newLifeMakerRate = NAILMAKER_RATE * newLifeMultiplier;
  var newLifeBreakerRate = BREAKER_INTAKE_RATE * newLifeMultiplier;
  var ironDemand = granted.nailMakers * newLifeMakerRate * IRON_PER_NAIL;

  // Pass 1: rough breaker estimate using an EXPECTED iron-tile count
  // (maps are ~50/50 iron/copper, so about half of DEPOSITS_PER_MAP) --
  // just enough to pick a map size in the right ballpark.
  var expectedIronTiles = DEPOSITS_PER_MAP / 2;
  var roughBreakers = Math.max(1, Math.round(ironDemand / (newLifeBreakerRate * expectedIronTiles)));

  var desiredClearSeconds = 60;
  var desiredCapacity = desiredClearSeconds * roughBreakers * newLifeBreakerRate;
  var newMapIndex = Math.max(1, Math.round(1 + Math.log(Math.max(1, desiredCapacity / DEPOSIT_CAPACITY_BASE)) / Math.log(DEPOSIT_CAPACITY_GROWTH)));
  var newMapTiles = generateMapTiles(newMapIndex);

  // Pass 2: refine breakers using the REAL iron-tile count of the map
  // we actually generated, for an exact match instead of an estimate.
  var realIronTiles = 0;
  for (var mr = 0; mr < MAP_ROWS; mr++) {
    for (var mc = 0; mc < MAP_COLS; mc++) {
      if (newMapTiles[mr][mc].type === "i") realIronTiles++;
    }
  }
  granted.breakers = Math.max(1, Math.round(ironDemand / (newLifeBreakerRate * Math.max(1, realIronTiles))));

  rc = {
    title: result.title,
    granted: granted,
    taoAward: taoAward,
    newMapIndex: newMapIndex,
    newMapTiles: newMapTiles,
    cells: [],
    flickerTimer: null
  };

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
  if (granted.ironAmt) parts.push("ir" + (granted.ironAmt > 0 ? "+" : "") + granted.ironAmt);
  if (granted.copperAmt) parts.push("cu" + (granted.copperAmt > 0 ? "+" : "") + granted.copperAmt);
  if (granted.nailMakers) parts.push("nm" + (granted.nailMakers > 0 ? "+" : "") + granted.nailMakers);
  if (granted.breakers) parts.push("br" + (granted.breakers > 0 ? "+" : "") + granted.breakers);
  if (granted.marketingLevel) parts.push("mk" + (granted.marketingLevel > 0 ? "+" : "") + granted.marketingLevel);
  if (granted.factories) parts.push("fc" + (granted.factories > 0 ? "+" : "") + granted.factories);
  return parts.length ? parts.join("  ") : "nothing this time";
}

function buildGrantedText(granted) {
  var parts = [];
  if (granted.funds) parts.push("+" + fmtMoney(granted.funds) + " starting funds");
  if (granted.ironAmt) parts.push("+" + fmtWeight(granted.ironAmt) + " iron");
  if (granted.copperAmt) parts.push("+" + fmtWeight(granted.copperAmt) + " copper");
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
  var autoNextMapCarried = state.autoNextMap; // a preference toggle, unrelated to which map is loaded
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
  state.mapIndex = ritual.newMapIndex;
  state.mapTiles = ritual.newMapTiles;
  state.mapTotalWeight = mapRemainingWeight(ritual.newMapTiles);
  state.autoNextMap = autoNextMapCarried;
  state.yin = yinYangCarried.yin;
  state.yang = yinYangCarried.yang;
  state.tao = ritual.taoAward;

  state.funds += ritual.granted.funds;
  state.ironAmt += ritual.granted.ironAmt;
  state.copperAmt += ritual.granted.copperAmt;
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
