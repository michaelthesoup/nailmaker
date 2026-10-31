"use strict";

var SEASON_CHECK_INTERVAL_MS = 5000;

function seasonReset(round) {
  var keepCollection = Array.isArray(state.collection) ? state.collection : [];
  var keepSerial = state.cardSerial || 1;
  var keepGuide = state.guideSeen;
  var keepWipe = state.wipeApplied;
  var keepResets = state.resetApplied;

  state = defaultState();
  state.collection = keepCollection;
  state.cardSerial = keepSerial;
  state.guideSeen = keepGuide;
  if (keepWipe) state.wipeApplied = keepWipe;
  if (keepResets) state.resetApplied = keepResets;
  state.seasonApplied = round;

  lifetime = defaultLifetime();
  saveLifetime();
  try { localStorage.removeItem("nailMakerSave"); } catch (e) { }

  achievementToastQueue.push({ toastText: "a new round began -- everything reset, your card collection was kept" });
  showNextAchievementToast();
  render();
  if (typeof cloudSaveState === "function") cloudSaveState();
  if (typeof renderLeaderboard === "function") renderLeaderboard();
}

function seasonCheck() {
  if (typeof rc !== "undefined" && rc) return;
  var round = currentWeekIndex();
  if (state.seasonApplied === null || state.seasonApplied === undefined) {
    state.seasonApplied = round;
    return;
  }
  if (round > state.seasonApplied) seasonReset(round);
}

setInterval(seasonCheck, SEASON_CHECK_INTERVAL_MS);
