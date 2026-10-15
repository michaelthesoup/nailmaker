"use strict";

// ----------------------------------------------------------------
// Who is online. Every logged-in game writes a small heartbeat to
// presence/{uid} every couple of minutes; a player counts as ONLINE if their
// last heartbeat is recent. Leaderboard rows (and profiles) show a green dot
// beside online players. It is deliberately cheap on Firestore: one tiny write
// per player per PRESENCE_BEAT_MS, and one query for "who is online" per
// refresh (only the online players are read).
// ----------------------------------------------------------------

var PRESENCE_BEAT_MS = 2 * 60 * 1000;           // how often a game says "still here"
var PRESENCE_ONLINE_WINDOW_MS = 5 * 60 * 1000;  // seen within this long ago = online
var PRESENCE_MIN_REFRESH_MS = 20 * 1000;        // never ask "who's online" more often than this

var presenceOnline = {}; // uid -> true
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
  }).catch(function () { /* rules not published yet, or offline -- just no dot */ });
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
    map[user.uid] = true; // you are obviously online
    presenceOnline = map;
    if (typeof leaderboardRepaintPresence === "function") leaderboardRepaintPresence();
  }).catch(function () { /* nothing to show */ })
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
