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
  var likelyTier = karmaTierFor(newTotalKarma);
  var confirmed = window.confirm(
    "Be reincarnated?\n\n" +
    "You'll gain " + karmaAvailable + " karma (" + newTotalKarma + " total, forever). " +
    "This life ends, but your karma carries forward -- with that much karma you're most likely looking at something around " + likelyTier.label + ", though it's never guaranteed. Better karma just means better odds.\n\n" +
    "This can't be undone."
  );
  if (!confirmed) return;

  state.karma = newTotalKarma;
  var tier = pickKarmaTier(newTotalKarma); // the real roll happens now
  runReincarnationRitual(tier);
}

function runReincarnationRitual(tier) {
  // Roll the actual granted amounts once, right now -- so what gets
  // shown during the reveal is exactly what gets applied later, not a
  // second re-roll that could disagree with it.
  var scratch = defaultState();
  var before = { funds: scratch.funds, nailMakers: scratch.nailMakers, breakers: scratch.breakers, marketingLevel: scratch.marketingLevel, factories: scratch.factories };
  tier.apply(scratch);
  var granted = {
    funds: Math.round(scratch.funds - before.funds),
    nailMakers: Math.round(scratch.nailMakers - before.nailMakers),
    breakers: Math.round(scratch.breakers - before.breakers),
    marketingLevel: Math.round(scratch.marketingLevel - before.marketingLevel),
    factories: Math.round(scratch.factories - before.factories)
  };

  rc = { tier: tier, granted: granted, cells: [], flickerTimer: null };

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
  for (var i = 0; i < totalCells; i++) {
    chars[i] = randomDecoyChar();
  }
  rc.chars = chars;
}

function randomDecoyChar() {
  return RC_DECOY_CHARS.charAt(Math.floor(Math.random() * RC_DECOY_CHARS.length));
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
    for (var i = 0; i < rc.cells.length; i++) {
      if (Math.random() < RC_FLICKER_FRACTION) {
        rc.cells[i].textContent = randomDecoyChar();
      }
    }
  }, RC_FLICKER_INTERVAL_MS);
}

// The noise settles and the grid clears to reveal your next life.
function resolveRitual() {
  clearInterval(rc.flickerTimer);
  el.reincarnateGrid.innerHTML = "";

  var tier = rc.tier;
  var heading = tier.isNirvana ? "NIRVANA" : "your next life begins with " + tier.label;
  var msg = document.createElement("div");
  msg.style.fontWeight = "bold";
  msg.style.fontSize = tier.isNirvana ? "28px" : "18px";
  msg.style.letterSpacing = "1px";
  msg.textContent = heading;
  el.reincarnateGrid.appendChild(msg);

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

el.btnReincarnate.addEventListener("click", startReincarnation);

el.btnReincarnateConfirm.addEventListener("click", function () {
  var tier = rc.tier;
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
  var nirvanaCarried = state.nirvanaAchieved || !!tier.isNirvana;
  var unlocksCarried = {
    unlockedMap: state.unlockedMap,
    unlockedMachinery: state.unlockedMachinery,
    unlockedTuning: state.unlockedTuning,
    unlockedYinYang: state.unlockedYinYang
  };

  var justReachedNirvana = tier.isNirvana && !state.nirvanaAchieved;

  deleteAllSaves();
  state = defaultState();
  state.karma = karmaCarried;
  state.nirvanaAchieved = nirvanaCarried;
  state.unlockedMap = unlocksCarried.unlockedMap;
  state.unlockedMachinery = unlocksCarried.unlockedMachinery;
  state.unlockedTuning = unlocksCarried.unlockedTuning;
  state.unlockedYinYang = unlocksCarried.unlockedYinYang;

  state.funds += rc.granted.funds;
  state.nailMakers += rc.granted.nailMakers;
  state.breakers += rc.granted.breakers;
  state.marketingLevel += rc.granted.marketingLevel;
  state.factories += rc.granted.factories;

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
