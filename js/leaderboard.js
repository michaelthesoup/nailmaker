"use strict";

// ----------------------------------------------------------------
// Leaderboard. Two tiers:
//  - Not logged in: a local top-10 list on this browser only (same as
//    before), stored in localStorage.
//  - Logged in: a global leaderboard in Firestore, one row per player
//    (keyed by their user id) holding their personal best score. Every
//    "end run" also still writes to the local list, so nothing is lost
//    if Firestore is briefly unreachable.
// ----------------------------------------------------------------

var LOCAL_LEADERBOARD_KEY = "nailMakerLeaderboard";
var LEADERBOARD_MAX_ENTRIES = 100;

function loadLocalLeaderboard() {
  try {
    var raw = localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    var list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function addLocalLeaderboardEntry(name, score) {
  var list = loadLocalLeaderboard();
  list.push({ name: name, score: score });
  list.sort(function (a, b) { return b.score - a.score; });
  list = list.slice(0, LEADERBOARD_MAX_ENTRIES);
  localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(list));
  return list;
}

function renderLeaderboardRows(list) {
  el.leaderboardList.innerHTML = "";
  if (!list || list.length === 0) {
    var empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "no runs yet -- click \"end run\" to bank your first score";
    el.leaderboardList.appendChild(empty);
    return;
  }
  for (var i = 0; i < list.length; i++) {
    var row = document.createElement("div");
    row.className = "row";
    var nameSpan = document.createElement("span");
    nameSpan.className = "label";
    nameSpan.textContent = (i + 1) + ". " + list[i].name;
    var scoreSpan = document.createElement("span");
    scoreSpan.className = "value";
    scoreSpan.textContent = fmtInt(list[i].score) + " nails";
    row.appendChild(nameSpan);
    row.appendChild(scoreSpan);
    el.leaderboardList.appendChild(row);
  }
}

function currentAuthUser() {
  return (typeof firebase !== "undefined" && firebase.auth) ? firebase.auth().currentUser : null;
}

// Renders whichever board applies right now. Logged in -> pull the
// global top 10 from Firestore. Logged out -> show the local list.
function renderLeaderboard() {
  var user = currentAuthUser();

  if (!user) {
    el.leaderboardNote.textContent = "local to this browser -- log in for a global leaderboard";
    renderLeaderboardRows(loadLocalLeaderboard());
    return;
  }

  el.leaderboardNote.textContent = "global -- top players";
  db.collection("scores").orderBy("score", "desc").limit(LEADERBOARD_MAX_ENTRIES).get()
    .then(function (snapshot) {
      var list = [];
      snapshot.forEach(function (doc) {
        list.push(doc.data());
      });
      renderLeaderboardRows(list);
    })
    .catch(function (err) {
      console.error("Failed to load global leaderboard", err);
      el.leaderboardNote.textContent = "couldn't reach the global leaderboard -- showing local instead";
      renderLeaderboardRows(loadLocalLeaderboard());
    });
}

// Called from the "end run" handler. Always banks locally; if signed
// in, also upserts the player's Firestore doc, but only when the new
// score beats whatever's already stored -- so the global board always
// shows each player's personal best, not just their latest run.
function submitScore(name, score) {
  addLocalLeaderboardEntry(name, score);

  var user = currentAuthUser();
  if (!user) {
    renderLeaderboard();
    return;
  }

  var ref = db.collection("scores").doc(user.uid);
  ref.get()
    .then(function (doc) {
      var best = doc.exists ? doc.data().score : -1;
      if (score > best) {
        return ref.set({
          name: name,
          score: score,
          uid: user.uid,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    })
    .then(function () {
      renderLeaderboard();
    })
    .catch(function (err) {
      console.error("Failed to submit global score", err);
      renderLeaderboard();
    });
}
