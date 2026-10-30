"use strict";

var featureState = { leaderboards: 0, chat: 0 };
var featureSignature = "";
var featureUnsub = null;

function featureOn(name) {
  return !(Number(featureState[name]) > Date.now());
}

function featureMinutesLeft(name) {
  return Math.max(0, Math.ceil((Number(featureState[name]) - Date.now()) / 60000));
}

function featureOffText(name) {
  var m = featureMinutesLeft(name);
  var what = name === "chat" ? "chat" : "the leaderboards";
  return what + " are switched off for " + (m >= 120 ? Math.round(m / 60) + " hours" : (m >= 60 ? "about an hour" : m + " min")) + " or so";
}

function featureApply() {
  var sig = (featureOn("leaderboards") ? "1" : "0") + (featureOn("chat") ? "1" : "0");
  if (sig === featureSignature) return;
  featureSignature = sig;
  if (!featureOn("chat") && typeof chatClose === "function") chatClose();
  if (typeof renderLeaderboard === "function") renderLeaderboard();
}

function featureSwitchOff(names, minutes, status) {
  if (typeof isCheatAllowed !== "function" || !isCheatAllowed() || typeof db === "undefined") return;
  var until = minutes > 0 ? Date.now() + minutes * 60000 : 0;
  var data = {};
  names.forEach(function (n) { data[n] = until; });
  data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  db.collection("config").doc("features").set(data, { merge: true }).then(function () {
    names.forEach(function (n) { featureState[n] = until; });
    featureApply();
    if (status) status.textContent = until ? names.join(" and ") + " switched off until " + new Date(until).toLocaleTimeString() + "." : names.join(" and ") + " switched back on.";
  }).catch(function (err) {
    console.error(err);
    if (status) status.textContent = "couldn't save -- check the Firestore rules for 'config'";
  });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function (user) {
    if (featureUnsub) { featureUnsub(); featureUnsub = null; }
    featureState = { leaderboards: 0, chat: 0 };
    if (!user || typeof db === "undefined") { featureApply(); return; }
    featureUnsub = db.collection("config").doc("features").onSnapshot(function (doc) {
      var d = doc.exists ? doc.data() : {};
      featureState = { leaderboards: Number(d.leaderboards) || 0, chat: Number(d.chat) || 0 };
      featureApply();
    }, function () { });
  });
}
setInterval(featureApply, 15000);
