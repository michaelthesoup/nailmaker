"use strict";

var LOCAL_LEADERBOARD_KEY = "nailMakerLeaderboard";
var LEADERBOARD_MAX_ENTRIES = 100;
var LEADERBOARD_ONLINE_MAX = 500;
var EVERYONE_CACHE_MS = 2 * 60 * 1000;
var everyoneCache = { at: 0, players: null, banned: null, medals: null };

function fetchEveryone() {
  if (everyoneCache.players && Date.now() - everyoneCache.at < EVERYONE_CACHE_MS) return Promise.resolve(everyoneCache);
  return Promise.all([
    db.collection("profiles").limit(1000).get(),
    db.collection("banned").get().catch(function () { return null; }),
    db.collection("medallions").get().catch(function () { return null; })
  ]).then(function (res) {
    var players = [];
    res[0].forEach(function (doc) {
      var p = doc.data();
      players.push({ uid: p.uid || doc.id, name: p.name || "player" });
    });
    var banned = {};
    if (res[1]) res[1].forEach(function (doc) { banned[doc.id] = true; });
    var medals = {};
    if (res[2]) res[2].forEach(function (doc) { var uid = doc.data().uid; if (uid) medals[uid] = (medals[uid] || 0) + 1; });
    everyoneCache = { at: Date.now(), players: players, banned: banned, medals: medals };
    return everyoneCache;
  });
}

function withEveryone(list) {
  return fetchEveryone().then(function (all) {
    var seen = {};
    list.forEach(function (e) { if (e.uid) seen[e.uid] = true; });
    var merged = list.filter(function (e) { return !(e.uid && all.banned[e.uid]); });
    all.players.forEach(function (p) {
      if (!seen[p.uid] && !all.banned[p.uid]) merged.push({ name: p.name, score: 0, uid: p.uid, karma: 0 });
    });
    merged.sort(function (a, b) {
      return (b.score - a.score) || String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase());
    });
    return merged;
  }).catch(function () { return list; });
}

var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
var WEEK_EPOCH_OFFSET_MS = 4 * 24 * 60 * 60 * 1000;

function weekIndexAt(ms) { return Math.floor((ms - WEEK_EPOCH_OFFSET_MS) / WEEK_MS); }
function currentWeekIndex() { return weekIndexAt(Date.now()); }
function weekIdFor(index) { return "w" + index; }
function weekStartMs(index) { return index * WEEK_MS + WEEK_EPOCH_OFFSET_MS; }
function msUntilWeekEnds() { return weekStartMs(currentWeekIndex() + 1) - Date.now(); }

function fmtWeekCountdown(ms) {
  var mins = Math.max(0, Math.floor(ms / 60000));
  var d = Math.floor(mins / 1440);
  var h = Math.floor((mins % 1440) / 60);
  var m = mins % 60;
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}

var leaderboardTab = "week";
var leaderboardRenderToken = 0;
var leaderboardWeekShown = null;

function weeklyNoteText() {
  var start = new Date(weekStartMs(currentWeekIndex()));
  var text = "this week (from " + start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) +
    ") \u00b7 resets in " + fmtWeekCountdown(msUntilWeekEnds());
  if (!currentAuthUser()) text += " \u00b7 log in to compete";
  return text;
}

function setLeaderboardTab(tab) {
  leaderboardTab = tab;
  if (tab === "chat" && typeof chatMarkRead === "function") chatMarkRead();
  renderLeaderboard();
}

function updateLeaderboardTabs() {
  if (el.btnLbWeek) el.btnLbWeek.classList.toggle("lb-tab-active", leaderboardTab === "week");
  if (el.btnLbAll) el.btnLbAll.classList.toggle("lb-tab-active", leaderboardTab === "all");
  if (el.btnLbChat) el.btnLbChat.classList.toggle("lb-tab-active", leaderboardTab === "chat");
}

if (el.btnLeaderboardSignup) el.btnLeaderboardSignup.addEventListener("click", function () {
  if (typeof showAuthOverlay === "function") showAuthOverlay("signup");
});
if (el.btnLbWeek) el.btnLbWeek.addEventListener("click", function () { setLeaderboardTab("week"); });
if (el.btnLbAll) el.btnLbAll.addEventListener("click", function () { setLeaderboardTab("all"); });

setInterval(function () {
  if (leaderboardTab !== "week") return;
  if (typeof featureOn === "function" && !featureOn("leaderboards")) return;
  if (leaderboardWeekShown !== null && leaderboardWeekShown !== currentWeekIndex()) {
    renderLeaderboard();
  } else if (el.leaderboardNote) {
    el.leaderboardNote.textContent = weeklyNoteText();
  }
}, 60000);

var leaderboardOpen = true;

function setLeaderboardOpen(open) {
  leaderboardOpen = open;
  if (el.leaderboardBody) el.leaderboardBody.style.display = open ? "" : "none";
  if (el.btnToggleLeaderboard) el.btnToggleLeaderboard.textContent = open ? "hide" : "show";
}

if (el.btnToggleLeaderboard) {
  el.btnToggleLeaderboard.addEventListener("click", function () {
    setLeaderboardOpen(!leaderboardOpen);
  });
}

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
    var nameText = document.createElement("span");
    nameText.textContent = (i + 1) + ". " + list[i].name;
    nameSpan.appendChild(nameText);
    if (list[i].uid && typeof openProfile === "function") {
      nameText.className = "lb-name-link";
      nameText.title = "view profile";
      (function (entry) {
        nameText.addEventListener("click", function () { openProfile(entry.uid, entry); });
      })(list[i]);
    }
    var medalCount = list[i].uid && everyoneCache.medals ? everyoneCache.medals[list[i].uid] : 0;
    if (medalCount > 0 && typeof medallionDot === "function") nameSpan.appendChild(medallionDot(medalCount));
    if (list[i].uid && typeof presenceDot === "function") {
      var dot = presenceDot();
      dot.setAttribute("data-uid", list[i].uid);
      dot.style.display = isPlayerOnline(list[i].uid) ? "" : "none";
      nameSpan.appendChild(dot);
    }
    if (list[i].karma > 0) {
      var karmaSpan = document.createElement("span");
      karmaSpan.className = "lb-karma";
      karmaSpan.textContent = " \u00b7 karma " + list[i].karma;
      nameSpan.appendChild(karmaSpan);
    }
    var scoreSpan = document.createElement("span");
    scoreSpan.className = "value";
    scoreSpan.textContent = fmtInt(list[i].score) + " nails";
    row.appendChild(nameSpan);
    row.appendChild(scoreSpan);
    el.leaderboardList.appendChild(row);
  }
}

function leaderboardRepaintPresence() {
  if (!el.leaderboardList || !el.leaderboardList.querySelectorAll) return;
  var dots = el.leaderboardList.querySelectorAll(".online-dot[data-uid]");
  for (var i = 0; i < dots.length; i++) {
    dots[i].style.display = isPlayerOnline(dots[i].getAttribute("data-uid")) ? "" : "none";
  }
}

function currentAuthUser() {
  return (typeof firebase !== "undefined" && firebase.auth) ? firebase.auth().currentUser : null;
}

function renderLeaderboard() {
  var signedIn = !!currentAuthUser();
  var lbOn = typeof featureOn !== "function" || featureOn("leaderboards");
  var chatOnNow = typeof featureOn !== "function" || featureOn("chat");
  if (!chatOnNow && leaderboardTab === "chat") leaderboardTab = "week";
  if (el.btnLbChat) el.btnLbChat.style.display = chatOnNow ? "" : "none";
  if (el.leaderboardTabs) el.leaderboardTabs.style.display = signedIn ? "" : "none";
  var chatTab = signedIn && leaderboardTab === "chat";
  if (el.leaderboardNote) el.leaderboardNote.style.display = signedIn && !chatTab ? "" : "none";
  if (el.leaderboardList) el.leaderboardList.style.display = signedIn && !chatTab ? "" : "none";
  if (el.chatView) el.chatView.style.display = chatTab ? "" : "none";
  if (el.leaderboardSignup) el.leaderboardSignup.style.display = signedIn ? "none" : "";
  if (!signedIn) {
    leaderboardRenderToken++;
    leaderboardWeekShown = null;
    if (typeof chatClose === "function") chatClose();
    return;
  }

  if (chatOnNow) { if (typeof chatOpen === "function") chatOpen(); } else if (typeof chatClose === "function") chatClose();
  if (typeof presenceRefresh === "function") presenceRefresh(false);
  updateLeaderboardTabs();
  if (chatTab) {
    leaderboardWeekShown = null;
    leaderboardRenderToken++;
    return;
  }
  if (!lbOn) {
    leaderboardWeekShown = null;
    leaderboardRenderToken++;
    if (el.leaderboardNote) el.leaderboardNote.textContent = featureOffText("leaderboards");
    if (el.leaderboardList) el.leaderboardList.style.display = "none";
    return;
  }
  if (leaderboardTab === "week") {
    renderWeeklyBoard();
    return;
  }
  leaderboardWeekShown = null;
  el.leaderboardNote.textContent = "global -- top players";
  var allToken = ++leaderboardRenderToken;
  db.collection("scores").orderBy("score", "desc").limit(LEADERBOARD_ONLINE_MAX).get()
    .then(function (snapshot) {
      var list = [];
      snapshot.forEach(function (doc) {
        list.push(doc.data());
      });
      return withEveryone(list);
    })
    .then(function (merged) {
      if (allToken !== leaderboardRenderToken || leaderboardTab !== "all") return;
      renderLeaderboardRows(merged);
    })
    .catch(function (err) {
      console.error("Failed to load global leaderboard", err);
      el.leaderboardNote.textContent = "couldn't reach the global leaderboard -- showing local instead";
      renderLeaderboardRows(loadLocalLeaderboard());
    });
}

function renderWeeklyBoard() {
  var weekIndex = currentWeekIndex();
  leaderboardWeekShown = weekIndex;
  var token = ++leaderboardRenderToken;
  el.leaderboardNote.textContent = weeklyNoteText();

  db.collection("weeks").doc(weekIdFor(weekIndex)).collection("scores")
    .orderBy("score", "desc").limit(LEADERBOARD_ONLINE_MAX).get()
    .then(function (snapshot) {
      var list = [];
      snapshot.forEach(function (doc) { list.push(doc.data()); });
      return withEveryone(list);
    })
    .then(function (merged) {
      if (token !== leaderboardRenderToken || leaderboardTab !== "week") return;
      renderLeaderboardRows(merged);
    })
    .catch(function (err) {
      if (token !== leaderboardRenderToken) return;
      console.error("Failed to load the weekly leaderboard", err);
      el.leaderboardNote.textContent = "couldn't reach the weekly board -- check the Firestore rules for 'weeks'";
      renderLeaderboardRows([]);
    });
}

function submitScore(name, score, extra) {
  extra = extra || {};
  var user = currentAuthUser();
  if (!user) return;
  addLocalLeaderboardEntry(name, score);
  if (typeof featureOn === "function" && !featureOn("leaderboards")) return;

  var karma = Math.max(0, Math.floor(extra.karma || 0));
  var allTimeRef = db.collection("scores").doc(user.uid);
  var weekRef = db.collection("weeks").doc(weekIdFor(currentWeekIndex())).collection("scores").doc(user.uid);

  function upsertIfBetter(ref, data) {
    return ref.get().then(function (doc) {
      var best = doc.exists ? doc.data().score : -1;
      if (score > best) return ref.set(data);
    });
  }

  var base = { name: name, score: score, uid: user.uid, karma: karma, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  var weekData = { name: name, score: score, uid: user.uid, karma: karma, timeSec: Math.floor(extra.timeSec || 0), weekId: weekIdFor(currentWeekIndex()), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

  Promise.all([
    upsertIfBetter(allTimeRef, base),
    upsertIfBetter(weekRef, weekData).catch(function (err) {
      console.warn("Weekly score not saved -- check the Firestore rules for 'weeks'", err);
    })
  ])
    .then(function () { renderLeaderboard(); })
    .catch(function (err) {
      console.error("Failed to submit global score", err);
      renderLeaderboard();
    });
}
