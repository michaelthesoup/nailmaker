"use strict";

// ----------------------------------------------------------------
// Reincarnation. Ending a life is a choice between two paths:
//  - Suicide (the "end run" button, in actions.js): karma resets to
//    zero. A true dead end -- you start over exactly like a brand new
//    player, no benefit at all, just a score on the leaderboard.
//  - Reincarnation (this file): your tao becomes karma, and the karma
//    becomes skill points to spend on the skill tree (skills.js).
//
// The screen is two halves. First the ritual: a wall of flickering characters
// that fills in, flickers for a while, and settles. Then the skill tree
// (skillsui.js), the only place in the game where it can be opened: spend your
// points (or take them back and spend them differently), then press "begin new
// life". You are reborn at the very beginning, like a brand new player: nothing
// is handed to you, nothing is already unlocked. Only what you have earned
// comes with you: your karma (which also makes the ground richer, 1 karma at
// a time), your skills, your past lives log and Nirvana.
// ----------------------------------------------------------------

var RC_GRID_ROWS = 16;
var RC_GRID_COLS = 24;
var RC_DECOY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
var RC_FLICKER_INTERVAL_MS = 150;
var RC_FLICKER_FRACTION = 0.15; // fraction of cells re-randomized per tick
var RC_REVEAL_START_DELAY_MS = 120;
var RC_REVEAL_SPEEDUP = 0.92;
var RC_REVEAL_MIN_DELAY_MS = 4;
var RC_SUSPENSE_MS = 2200; // how long the noise flickers before it settles into the tree

var rc = null; // active ritual state while the overlay is open

// ---------------- starting the ritual ----------------

// How much karma the reincarnation in progress will add: the tao earned, held to the karma cap.
var reincarnationKarmaGain = 0;

function startReincarnation() {
  var karmaAvailable = Math.floor(state.tao / KARMA_TAO_THRESHOLD);
  if (karmaAvailable < 1) return;

  var karmaGain = reincarnationKarmaGainNow();
  var newTotalKarma = state.karma + karmaGain;
  var confirmed = window.confirm(
    "Be reincarnated?\n\n" +
    (karmaGain > 0 ? "You'll gain " + karmaGain + " karma (" + newTotalKarma + " total, forever), which is " + (karmaGain * SKILL_POINTS_PER_KARMA) + " more skill points to spend. " : "Your karma is already at its cap of " + KARMA_CAP + ", so this adds none. ") +
    "This life ends and you begin again from the very beginning, on a fresh map (karma adds more deposits to it). Your karma and your skills come with you; nothing else does.\n\n" +
    "This can't be undone."
  );
  if (!confirmed) return;

  // The karma is NOT added yet: it lands when you press "begin new life", so a reload or an autosave
  // halfway through the ritual can't bank it while you keep the old life. The tree counts it meanwhile.
  reincarnationKarmaGain = karmaGain;
  skillKarmaPending = karmaGain;
  runReincarnationRitual(newTotalKarma >= NIRVANA_KARMA);
}

function runReincarnationRitual(isNirvana) {
  rc = {
    isNirvana: !!isNirvana,
    ready: false,     // true once the tree is on screen and the new life can begin
    cells: [],
    flickerTimer: null
  };

  buildGridNoise();
  el.reincarnateGrid.classList.remove("rc-resolved");
  el.reincarnateGrid.innerHTML = "";
  el.reincarnateStatus.textContent = "";
  el.reincarnateBar.style.display = "none";
  el.reincarnateOverlay.style.display = "flex";
  el.reincarnateOverlay.scrollTop = 0;

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

// ---------------- the tree ----------------

// The noise settles into the skill tree. (For a Nirvana life the word comes first.)
function resolveRitual() {
  clearInterval(rc.flickerTimer);
  var grid = el.reincarnateGrid;
  grid.innerHTML = "";
  grid.classList.add("rc-resolved");

  if (rc.isNirvana) {
    var head = document.createElement("div");
    head.style.fontWeight = "bold";
    head.style.fontSize = "28px";
    head.style.letterSpacing = "1px";
    head.textContent = "NIRVANA";
    grid.appendChild(head);
  }

  var treeBox = document.createElement("div");
  treeBox.className = "rc-block";
  grid.appendChild(treeBox);

  rc.ready = true;
  showSkillTree(treeBox);
}

el.btnReincarnate.addEventListener("click", startReincarnation);

el.btnReincarnateConfirm.addEventListener("click", function () {
  var ritual = rc;
  if (!ritual || !ritual.ready) return; // the tree has to have been shown
  rc = null;
  el.reincarnateOverlay.style.display = "none";
  el.reincarnateBar.style.display = "none";

  var user = currentAuthUser();
  var name = user ? (user.displayName || "player") : "anonymous"; // only logged-in players post scores
  // The weekly board shows the karma this life STARTED with; the karma it just earned is added only now.
  var karmaAtStart = state.karma;
  submitScore(name, Math.floor(state.totalNailsMade), { karma: karmaAtStart, timeSec: state.simTime });
  state.karma += reincarnationKarmaGain;
  skillKarmaPending = 0;

  var karmaCarried = state.karma;
  var nirvanaCarried = state.nirvanaAchieved || ritual.isNirvana;
  var guideSeenCarried = state.guideSeen;
  var autoNextMapCarried = state.autoNextMap; // a preference toggle, unrelated to how far you have got
  var skillsCarried = state.skills;           // as you just left them in the tree (ending a run is what wipes them)

  var justReachedNirvana = ritual.isNirvana && !state.nirvanaAchieved;

  // Log the life that's ending.
  var karmaGained = reincarnationKarmaGain;
  var endedLife = buildLifeRecord({
    how: "reincarnated",
    karmaGained: karmaGained,
    karmaTotal: state.karma,
    nirvana: ritual.isNirvana
  });
  var pastLivesCarried = (state.pastLives || []).concat([endedLife]).slice(-PAST_LIVES_MAX);
  recordLifeEnd(endedLife, "reincarnated", null, endedLife.karmaTotal);

  deleteAllSaves();

  // The very beginning: a brand new game, with only what you have earned put back.
  state = defaultState();
  state.skills = skillsCarried;
  state.pastLives = pastLivesCarried;
  state.karma = karmaCarried;
  state.nirvanaAchieved = nirvanaCarried;
  state.guideSeen = guideSeenCarried;
  state.autoNextMap = autoNextMapCarried;
  // Karma and the ore skills add deposits to the ground, so lay map 1 again now that they are in place.
  state.mapIndex = 1;
  state.mapTiles = generateMapTiles(1);
  state.mapTotalWeight = mapRemainingWeight(state.mapTiles);

  render();
  if (typeof currentAuthUser === "function" && currentAuthUser()) cloudSaveState();

  // The end screen replaces the old NIRVANA alert (it carries the same message).
  showEndScreen({
    kind: "reincarnated",
    life: endedLife,
    allLives: pastLivesCarried,
    nirvanaJustReached: justReachedNirvana
  });
});
