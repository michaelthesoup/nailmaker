"use strict";

// ----------------------------------------------------------------
// Reincarnation. Ending a life is a choice between two paths:
//  - Suicide (the "end run" button, in actions.js): karma resets to
//    zero. A true dead end -- you start over exactly like a brand new
//    player, no benefit at all, just a score on the leaderboard.
//  - Reincarnation (this file): your tao becomes karma, and the karma
//    becomes cards: a pack of five for every karma you hold, and a deck to carry them in.
//
// The screen is two halves. First the ritual: a wall of flickering characters
// that fills in, flickers for a while, and settles. Then the collection and
// loadout (cardsui.js, cards.js): a black card and a white card to choose your path, the packs
// your karma earned, and the slots to fill. Then "begin new life". You are reborn at the very beginning,
// like a brand new player: nothing is handed to you, nothing is already unlocked.
// The only things that come with you are your karma, your past lives log, Nirvana, your card deck and your collection;
// the next reincarnation lets you add to them, move them about and discard them.
// ----------------------------------------------------------------

var RC_GRID_ROWS = 16;
var RC_GRID_COLS = 24;
var RC_DECOY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
var RC_FLICKER_INTERVAL_MS = 150;
var RC_FLICKER_FRACTION = 0.15; // fraction of cells re-randomized per tick
var RC_REVEAL_START_DELAY_MS = 120;
var RC_REVEAL_SPEEDUP = 0.92;
var RC_REVEAL_MIN_DELAY_MS = 4;
var RC_SUSPENSE_MS = 2200; // how long the noise flickers before it settles into the cards

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
    (karmaGain > 0 ? "You'll gain " + karmaGain + " karma (" + newTotalKarma + " total, forever). " : "Your karma is already at its cap of " + KARMA_CAP + ", so this adds none. ") +
    "You'll open " + cardPackCount(newTotalKarma) + " pack" + (cardPackCount(newTotalKarma) === 1 ? "" : "s") + " of cards and fill " + cardSlots(newTotalKarma) + " slots in your deck. " +
    "This life ends and you begin again from the very beginning, on a fresh map. Only your karma and your cards (deck and collection) come with you.\n\n" +
    "This can't be undone."
  );
  if (!confirmed) return;

  // The karma is NOT added yet: it lands when you press "begin new life", so a reload or an autosave
  // halfway through the ritual can't bank it while you keep the old life. The draft counts it meanwhile.
  reincarnationKarmaGain = karmaGain;
  runReincarnationRitual(newTotalKarma, newTotalKarma >= NIRVANA_KARMA);
}

function runReincarnationRitual(karmaTotal, isNirvana) {
  rc = {
    karmaTotal: karmaTotal,
    isNirvana: !!isNirvana,
    ready: false,     // true once the loadout has a card in it (packs may be left unopened)
    gain: karmaTotal,  // packs = your total karma
    result: null,
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

// ---------------- the cards ----------------

// The noise settles into the cards. (For a Nirvana life the word comes first.)
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
    head.style.marginBottom = "12px";
    head.textContent = "NIRVANA";
    grid.appendChild(head);
  }

  var draftBox = document.createElement("div");
  draftBox.className = "rc-block";
  grid.appendChild(draftBox);

  var ritual = rc;
  showLoadout(draftBox, ritual.karmaTotal, ritual.gain, function (ready) {
    if (rc !== ritual) return;
    ritual.ready = !!ready;
    el.reincarnateBar.style.display = ready ? "" : "none";
  });
}

el.btnReincarnate.addEventListener("click", startReincarnation);

el.btnReincarnateConfirm.addEventListener("click", function () {
  var ritual = rc;
  if (!ritual || !ritual.ready) return; // the loadout needs a card (unopened packs are fine)
  rc = null;
  el.reincarnateOverlay.style.display = "none";
  el.reincarnateBar.style.display = "none";

  var user = currentAuthUser();
  var name = user ? (user.displayName || "player") : "anonymous"; // only logged-in players post scores
  // The weekly board shows the karma this life STARTED with; the karma it just earned is added only now.
  var karmaAtStart = state.karma;
  submitScore(name, Math.floor(state.totalNailsMade), { karma: karmaAtStart, timeSec: state.simTime });
  state.karma += reincarnationKarmaGain;

  var karmaCarried = state.karma;
  var nirvanaCarried = state.nirvanaAchieved || ritual.isNirvana;
  var guideSeenCarried = state.guideSeen;
  var autoNextMapCarried = state.autoNextMap; // a preference toggle, unrelated to how far you have got
  var chosen = loadoutResult();                 // the packs opened and the cards put in the slots
  var collectionCarried = state.collection || []; // the cards you have put aside: they outlast the life (ending the run is what wipes them)
  var cardSerialCarried = state.cardSerial || 1;
  var wipeAppliedCarried = state.wipeApplied; // which admin wipe this player has already had (gifts.js), so a new life isn't wiped for an old one
  var slotPityCarried = state.slotPity || 0; // a pity counter: it only ever goes back to nothing when a jackpot is hit (slots.js)
  var resetAppliedCarried = state.resetApplied; // the same for the admin's single-thing resets

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

  // The very beginning: a brand new game (with a new draft seed for the NEXT reincarnation), with only what
  // you have earned put back.
  state = defaultState();
  state.collection = collectionCarried;
  state.cardSerial = cardSerialCarried;
  state.deck = cardsCommit(chosen.equipped, chosen.kept); // the collection and the deck are both kept
  state.pastLives = pastLivesCarried;
  state.karma = karmaCarried;
  state.nirvanaAchieved = nirvanaCarried;
  state.guideSeen = guideSeenCarried;
  state.autoNextMap = autoNextMapCarried;
  if (wipeAppliedCarried) state.wipeApplied = wipeAppliedCarried;
  if (resetAppliedCarried) state.resetApplied = resetAppliedCarried;
  state.slotPity = slotPityCarried;
  // Deposit cards add deposits to the ground, so lay map 1 again now that the deck is in place.
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
    deck: state.deck,
    packs: chosen.packs,
    newCards: chosen.opened,
    collectionSize: state.collection.length,
    nirvanaJustReached: justReachedNirvana
  });
});
