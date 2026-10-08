"use strict";

// ----------------------------------------------------------------
// Lifetime stats. These live OUTSIDE the game state on purpose:
// ending a run wipes the whole game state (karma, past lives log and
// all), but a player's history shouldn't vanish with it.
//
// Terms:
//  - a LIFE ends by reincarnating or by ending the run.
//  - a RUN is a chain of lives that finishes when the player ends the
//    run (reincarnating just continues the same run).
//
// Stored locally under LIFETIME_KEY, and -- when logged in -- synced to
// a "profiles" document in Firestore (also the groundwork for public
// player profiles). Finished lives are what get counted here; the
// stats screen adds the life in progress on top (lifetimeWithCurrent).
// ----------------------------------------------------------------

var LIFETIME_KEY = "nailMakerLifetime";
var LIFETIME_CLOUD_DEBOUNCE_MS = 4000;

function defaultLifetime() {
  return {
    firstPlayedAt: Date.now(),
    runsEnded: 0,
    livesLived: 0,
    reincarnations: 0,
    nirvanaLives: 0,
    totalNails: 0,
    totalTimeSec: 0,
    totalEarned: 0,
    nailbombs: 0,
    swarmCollapses: 0,
    bestLifeNails: 0,
    bestRunNails: 0,
    longestRunLives: 0,
    mostBombsInLife: 0,
    highestKarma: 0,
    highestTao: 0,
    mostMakers: 0,
    mostBreakers: 0,
    mostFactories: 0,
    deepestMap: 0,
    achievements: {} // id -> time unlocked (ms)
  };
}

// Combine two records (e.g. this device's with the account's cloud copy).
// Everything only ever grows, so taking the larger value of each field is
// safe against double counting; achievements are unioned.
function mergeLifetime(a, b) {
  var out = defaultLifetime();
  for (var key in out) {
    if (key === "achievements" || key === "firstPlayedAt") continue;
    var av = typeof a[key] === "number" ? a[key] : 0;
    var bv = typeof b[key] === "number" ? b[key] : 0;
    out[key] = Math.max(av, bv);
  }
  var times = [a.firstPlayedAt, b.firstPlayedAt].filter(function (t) { return typeof t === "number" && t > 0; });
  out.firstPlayedAt = times.length ? Math.min.apply(null, times) : Date.now();
  out.achievements = {};
  var sources = [a.achievements || {}, b.achievements || {}];
  for (var i = 0; i < sources.length; i++) {
    for (var id in sources[i]) {
      var t = sources[i][id];
      if (!out.achievements[id] || t < out.achievements[id]) out.achievements[id] = t;
    }
  }
  return out;
}

function loadLifetime() {
  try {
    var raw = localStorage.getItem(LIFETIME_KEY);
    if (raw) return mergeLifetime(defaultLifetime(), JSON.parse(raw));
  } catch (e) { /* unreadable -- start fresh */ }
  return defaultLifetime();
}

var lifetime = loadLifetime();

function saveLifetime() {
  try {
    localStorage.setItem(LIFETIME_KEY, JSON.stringify(lifetime));
  } catch (e) { /* storage unavailable -- stats just won't persist */ }
  scheduleLifetimeCloudSave();
}

// ---------------- cloud sync ----------------

var lifetimeCloudTimer = null;

function scheduleLifetimeCloudSave() {
  if (lifetimeCloudTimer) return;
  lifetimeCloudTimer = setTimeout(function () {
    lifetimeCloudTimer = null;
    cloudSaveLifetime();
  }, LIFETIME_CLOUD_DEBOUNCE_MS);
}

function cloudSaveLifetime() {
  var user = currentAuthUser();
  if (!user || typeof db === "undefined" || !db.collection) return;
  var name = user.displayName || "player";
  db.collection("profiles").doc(user.uid).set({
    uid: user.uid,
    name: name,
    nameLower: name.toLowerCase(),
    stats: lifetime,
    achievementCount: Object.keys(lifetime.achievements).length,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function (err) {
    console.warn("Profile sync failed -- check the Firestore rules for the 'profiles' collection", err);
  });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function (user) {
    if (!user || typeof db === "undefined" || !db.collection) return;
    db.collection("profiles").doc(user.uid).get().then(function (doc) {
      if (doc.exists && doc.data().stats) {
        lifetime = mergeLifetime(lifetime, doc.data().stats);
        try { localStorage.setItem(LIFETIME_KEY, JSON.stringify(lifetime)); } catch (e) {}
        if (typeof updateAchievementButton === "function") updateAchievementButton();
      }
      cloudSaveLifetime();
    }).catch(function (err) {
      console.warn("Couldn't load profile stats", err);
    });
  });
}

// ---------------- recording ----------------

function maxOf(a, b) { return a > b ? a : b; }

// Called once whenever a life ends. kind is "reincarnated" or "ended";
// for "ended" the whole run is over too, so allLives (every life in the run,
// including this one) is used to record run-level records.
function recordLifeEnd(life, kind, allLives, karmaAtEnd) {
  lifetime.livesLived += 1;
  lifetime.totalNails += life.nails;
  lifetime.totalTimeSec += life.timeSec;
  lifetime.totalEarned += life.earned;
  lifetime.nailbombs += life.bombs;
  lifetime.swarmCollapses += life.collapses;
  if (life.nirvana) lifetime.nirvanaLives += 1;
  if (kind === "reincarnated") lifetime.reincarnations += 1;

  lifetime.bestLifeNails = maxOf(lifetime.bestLifeNails, life.nails);
  lifetime.mostBombsInLife = maxOf(lifetime.mostBombsInLife, life.bombs);
  lifetime.highestKarma = maxOf(lifetime.highestKarma, maxOf(life.karmaTotal || 0, karmaAtEnd || 0));
  lifetime.highestTao = maxOf(lifetime.highestTao, life.tao);
  lifetime.mostMakers = maxOf(lifetime.mostMakers, life.makers);
  lifetime.mostBreakers = maxOf(lifetime.mostBreakers, life.breakers);
  lifetime.mostFactories = maxOf(lifetime.mostFactories, life.factories);
  lifetime.deepestMap = maxOf(lifetime.deepestMap, life.map);

  if (kind === "ended") {
    lifetime.runsEnded += 1;
    var run = summarizeLives(allLives);
    lifetime.bestRunNails = maxOf(lifetime.bestRunNails, run.nails);
    lifetime.longestRunLives = maxOf(lifetime.longestRunLives, run.count);
  }

  saveLifetime();
  if (typeof checkAchievements === "function") checkAchievements();
}

// The recorded totals plus the life (and run) in progress -- what the
// stats screen and the achievements check actually look at.
function lifetimeWithCurrent() {
  var c = JSON.parse(JSON.stringify(lifetime));
  var pastLives = state.pastLives || [];
  var runSoFar = summarizeLives(pastLives);

  c.totalNails += Math.floor(state.totalNailsMade);
  c.totalTimeSec += Math.floor(state.simTime);
  c.totalEarned += state.totalEarned || 0;
  c.nailbombs += state.cityBombs;
  c.swarmCollapses += state.swarmCollapses || 0;

  c.bestLifeNails = maxOf(c.bestLifeNails, Math.floor(state.totalNailsMade));
  c.mostBombsInLife = maxOf(c.mostBombsInLife, state.cityBombs);
  c.highestKarma = maxOf(c.highestKarma, state.karma);
  c.highestTao = maxOf(c.highestTao, state.tao);
  c.mostMakers = maxOf(c.mostMakers, Math.floor(state.nailMakers));
  c.mostBreakers = maxOf(c.mostBreakers, Math.floor(state.breakers));
  c.mostFactories = maxOf(c.mostFactories, Math.floor(state.factories));
  c.deepestMap = maxOf(c.deepestMap, state.mapIndex);
  c.bestRunNails = maxOf(c.bestRunNails, runSoFar.nails + Math.floor(state.totalNailsMade));
  c.longestRunLives = maxOf(c.longestRunLives, pastLives.length + 1);
  if (state.nirvanaAchieved) c.nirvanaLives = maxOf(c.nirvanaLives, 1);

  c.currentRun = lifetime.runsEnded + 1;
  c.currentLifeInRun = pastLives.length + 1;
  return c;
}
