"use strict";

// ----------------------------------------------------------------
// Medallions. At the end of each week the top three players on the weekly
// board (leaderboard.js) earn a gold, silver or bronze medallion. They are
// awarded by the admin from the admin panel (admin.js), never by a player's
// own game: the Firestore rules only let the admin account write to the
// "medallions" collection, so nobody can hand themselves one.
//
// One document per medallion: medallions/{weekId}_{rank}
//   { weekId, weekIndex, rank (1-3), medal ("gold"...), uid, name, score, karma, awardedAt }
// ----------------------------------------------------------------

var MEDALLION_NAMES = { 1: "gold", 2: "silver", 3: "bronze" };

function medallionWeekLabel(weekIndex) {
  return "week of " + new Date(weekStartMs(weekIndex)).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

// All the medallions a player holds, newest week first.
function fetchMedallions(uid) {
  return db.collection("medallions").where("uid", "==", uid).get().then(function (snap) {
    var list = [];
    snap.forEach(function (doc) { list.push(doc.data()); });
    list.sort(function (a, b) { return (b.weekIndex - a.weekIndex) || (a.rank - b.rank); });
    return list;
  });
}

// Counts and the list, in the stats-screen style (used on profiles).
function renderMedallionRows(parent, list) {
  if (list.length === 0) {
    sheetAddText(parent, "none yet \u2014 finish in the top three of a week to earn one");
    return;
  }
  var counts = { 1: 0, 2: 0, 3: 0 };
  for (var i = 0; i < list.length; i++) counts[list[i].rank] = (counts[list[i].rank] || 0) + 1;
  sheetAddRows(parent, [
    ["gold", String(counts[1])],
    ["silver", String(counts[2])],
    ["bronze", String(counts[3])]
  ]);
  var rows = [];
  for (var j = 0; j < list.length; j++) {
    var m = list[j];
    rows.push([MEDALLION_NAMES[m.rank] + " \u00b7 " + medallionWeekLabel(m.weekIndex), fmtInt(m.score) + " nails"]);
  }
  sheetAddRows(parent, rows);
}

// A toast the first time you log in after being awarded one.
function checkNewMedallions(user) {
  var key = "nailMakerMedallionsSeen_" + user.uid;
  fetchMedallions(user.uid).then(function (list) {
    var seen = -1;
    try { seen = parseInt(localStorage.getItem(key) || "-1", 10); } catch (e) {}
    var fresh = list.filter(function (m) { return m.weekIndex > seen; }).sort(function (a, b) { return a.weekIndex - b.weekIndex; });
    if (!fresh.length) return;
    for (var i = 0; i < fresh.length; i++) {
      var m = fresh[i];
      achievementToastQueue.push({ toastText: MEDALLION_NAMES[m.rank] + " medallion awarded \u2014 " + medallionWeekLabel(m.weekIndex) });
    }
    showNextAchievementToast();
    try { localStorage.setItem(key, String(fresh[fresh.length - 1].weekIndex)); } catch (e) {}
  }).catch(function () { /* rules not published yet, or offline -- nothing to show */ });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) checkNewMedallions(user);
  });
}
