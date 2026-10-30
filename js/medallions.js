"use strict";

var MEDALLION_NAMES = { 1: "gold", 2: "silver", 3: "bronze" };

function medallionWeekLabel(weekIndex) {
  return "week of " + new Date(weekStartMs(weekIndex)).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function fetchMedallions(uid) {
  return db.collection("medallions").where("uid", "==", uid).get().then(function (snap) {
    var list = [];
    snap.forEach(function (doc) { list.push(doc.data()); });
    list.sort(function (a, b) { return (b.weekIndex - a.weekIndex) || (a.rank - b.rank); });
    return list;
  });
}

function medallionDot(count) {
  var dot = document.createElement("span");
  dot.className = "medal-dot";
  dot.title = count === 1 ? "1 medallion" : count + " medallions";
  return dot;
}

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
    if (m.gift) {
      var when = m.awardedAt && m.awardedAt.toMillis ? new Date(m.awardedAt.toMillis()).toLocaleDateString() : "";
      rows.push([MEDALLION_NAMES[m.rank] + " \u00b7 special award", when]);
    } else {
      rows.push([MEDALLION_NAMES[m.rank] + " \u00b7 " + medallionWeekLabel(m.weekIndex), fmtInt(m.score) + " nails"]);
    }
  }
  sheetAddRows(parent, rows);
}

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
  }).catch(function () {  });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) checkNewMedallions(user);
  });
}
