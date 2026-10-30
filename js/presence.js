"use strict";

var PRESENCE_BEAT_MS = 2 * 60 * 1000;
var PRESENCE_ONLINE_WINDOW_MS = 5 * 60 * 1000;
var PRESENCE_MIN_REFRESH_MS = 20 * 1000;

var presenceOnline = {};
var presenceLastRefresh = 0;
var presenceRefreshing = false;

function isPlayerOnline(uid) {
  return !!presenceOnline[uid];
}

function presenceDot() {
  var dot = document.createElement("span");
  dot.className = "online-dot";
  dot.title = "online now";
  return dot;
}

function presenceBeat() {
  var user = currentAuthUser();
  if (!user || typeof db === "undefined") return;
  db.collection("presence").doc(user.uid).set({
    uid: user.uid,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function () {  });
}

function presenceRefresh(force) {
  var user = currentAuthUser();
  if (!user || typeof db === "undefined" || presenceRefreshing) return;
  if (!force && Date.now() - presenceLastRefresh < PRESENCE_MIN_REFRESH_MS) return;
  presenceRefreshing = true;
  presenceLastRefresh = Date.now();

  var cutoff = firebase.firestore.Timestamp.fromMillis(Date.now() - PRESENCE_ONLINE_WINDOW_MS);
  db.collection("presence").where("lastSeen", ">", cutoff).get().then(function (snap) {
    var map = {};
    snap.forEach(function (doc) { map[doc.id] = true; });
    map[user.uid] = true;
    presenceOnline = map;
    if (typeof leaderboardRepaintPresence === "function") leaderboardRepaintPresence();
  }).catch(function () {  })
    .then(function () { presenceRefreshing = false; });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) { presenceBeat(); presenceRefresh(true); }
    else { presenceOnline = {}; if (typeof leaderboardRepaintPresence === "function") leaderboardRepaintPresence(); }
  });
}
setInterval(function () {
  if (!currentAuthUser()) return;
  presenceBeat();
  presenceRefresh(true);
}, PRESENCE_BEAT_MS);
