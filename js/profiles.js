"use strict";

// ----------------------------------------------------------------
// Player profiles. Every logged-in player has a public "profiles"
// document (written by lifetime.js): their name, when they joined, their
// lifetime stats and their achievements. This screen lets anyone search
// for a player by name or open one straight from a leaderboard row.
//
// Stats on a profile are the ones recorded when a life ends, so the life
// someone is in the middle of is not counted until it finishes.
// ----------------------------------------------------------------

var PROFILE_SEARCH_LIMIT = 10;
var PROFILE_SEARCH_DEBOUNCE_MS = 300;

var profileSearchTimer = null;
var profileRequestToken = 0; // ignore replies from an older search/open

function profileOverlayOpen() {
  return el.profileOverlay.style.display === "flex";
}

function showProfileOverlay() {
  el.profileOverlay.style.display = "flex";
}

function closeProfileOverlay() {
  el.profileOverlay.style.display = "none";
}

function profileMessage(parent, text) {
  parent.innerHTML = "";
  sheetAddText(parent, text);
}

// ---------------- search ----------------

function searchProfiles(rawQuery) {
  var q = rawQuery.trim().toLowerCase();
  var token = ++profileRequestToken;
  el.profileResults.innerHTML = "";
  if (!q) return;

  if (typeof db === "undefined" || !db.collection) {
    profileMessage(el.profileResults, "profiles aren't available right now");
    return;
  }

  // Prefix match on the lowercased name.
  db.collection("profiles").orderBy("nameLower").startAt(q).endAt(q + "\uf8ff").limit(PROFILE_SEARCH_LIMIT).get()
    .then(function (snapshot) {
      if (token !== profileRequestToken) return;
      el.profileResults.innerHTML = "";
      if (snapshot.empty) {
        profileMessage(el.profileResults, "no player found starting with \"" + rawQuery.trim() + "\"");
        return;
      }
      snapshot.forEach(function (doc) {
        var d = doc.data();
        var row = document.createElement("div");
        row.className = "profile-result";
        var name = document.createElement("span");
        name.textContent = d.name || "player";
        var meta = document.createElement("span");
        meta.className = "ach-date";
        meta.textContent = (d.achievementCount || 0) + " / " + ACHIEVEMENTS.length + " achievements";
        row.appendChild(name);
        row.appendChild(meta);
        row.addEventListener("click", function () { openProfile(doc.id); });
        el.profileResults.appendChild(row);
      });
    })
    .catch(function (err) {
      if (token !== profileRequestToken) return;
      console.error("Profile search failed", err);
      profileMessage(el.profileResults, "couldn't search players -- check the Firestore rules for 'profiles'");
    });
}

el.profileSearch.addEventListener("input", function () {
  clearTimeout(profileSearchTimer);
  profileSearchTimer = setTimeout(function () { searchProfiles(el.profileSearch.value); }, PROFILE_SEARCH_DEBOUNCE_MS);
});

el.profileSearch.addEventListener("keydown", function (e) {
  if (e.key !== "Enter") return;
  clearTimeout(profileSearchTimer);
  searchProfiles(el.profileSearch.value);
});

// ---------------- opening a profile ----------------

// Opens the overlay on a given player's profile (called from leaderboard rows too).
// fallback (optional) is the leaderboard row that was clicked: if the player has no
// profile document yet, that is what gets shown instead of an error.
function openProfile(uid, fallback) {
  showProfileOverlay();
  var token = ++profileRequestToken;
  el.profileResults.innerHTML = "";
  profileMessage(el.profileBody, "loading\u2026");

  if (typeof db === "undefined" || !db.collection) {
    profileMessage(el.profileBody, "profiles aren't available right now");
    return;
  }

  db.collection("profiles").doc(uid).get()
    .then(function (doc) {
      if (token !== profileRequestToken) return;
      if (!doc.exists) {
        showProfileFallback(uid, fallback);
        return;
      }
      renderProfile(doc.data(), uid);
    })
    .catch(function (err) {
      if (token !== profileRequestToken) return;
      console.error("Couldn't load profile", err);
      showProfileFallback(uid, fallback);
    });
}

// A profile document is only written when a player logs in or finishes a life, so
// one can be missing. Never show a dead end: build yours from this browser's stats
// (and write it now), or show what the leaderboard row says about someone else.
function showProfileFallback(uid, fallback) {
  var me = currentAuthUser();
  if (me && me.uid === uid) {
    if (typeof cloudSaveLifetime === "function") cloudSaveLifetime();
    var created = me.metadata && me.metadata.creationTime ? Date.parse(me.metadata.creationTime) : NaN;
    renderProfile({ name: me.displayName || "player", createdAt: isNaN(created) ? undefined : created, stats: lifetime }, uid);
    return;
  }
  if (fallback && fallback.name) {
    var body = el.profileBody;
    body.innerHTML = "";
    var name = document.createElement("div");
    name.className = "sheet-title";
    name.textContent = fallback.name;
    body.appendChild(name);
    sheetAddHeading(body, "from the leaderboard");
    var rows = [["best score shown", fmtInt(fallback.score || 0) + " nails"]];
    if (fallback.karma > 0) rows.push(["karma that life began with", String(fallback.karma)]);
    sheetAddRows(body, rows);
    sheetAddText(body, "The full profile (records and achievements) appears once this player logs in again.");
    return;
  }
  profileMessage(el.profileBody, "this player has no profile yet");
}

function renderProfile(d, uid) {
  var stats = mergeLifetime(defaultLifetime(), d.stats || {}); // fills anything missing with zeros
  var body = el.profileBody;
  body.innerHTML = "";

  var name = document.createElement("div");
  name.className = "sheet-title";
  name.textContent = d.name || "player";
  if (typeof isPlayerOnline === "function" && isPlayerOnline(uid)) {
    name.appendChild(document.createTextNode(" "));
    name.appendChild(presenceDot());
  }
  body.appendChild(name);

  var joined = typeof d.createdAt === "number" && !isNaN(d.createdAt) ? d.createdAt : stats.firstPlayedAt;
  var me = currentAuthUser();
  sheetAddText(body, "joined " + fmtDate(joined) + (me && me.uid === uid ? " \u00b7 this is you" : ""), "sheet-sub");

  sheetAddHeading(body, "records");
  var records = [
    ["most nails in one life", fmtInt(stats.bestLifeNails)],
    ["total nails made", fmtInt(stats.totalNails)],
    ["best run (all its lives)", fmtInt(stats.bestRunNails)],
    ["lives lived", String(stats.livesLived)],
    ["reincarnations", String(stats.reincarnations)],
    ["runs ended", String(stats.runsEnded)],
    ["highest karma", String(stats.highestKarma)],
    ["time played", fmtDuration(stats.totalTimeSec)],
    ["nailbombs dropped", String(stats.nailbombs)],
    ["deepest map", String(stats.deepestMap)],
    ["Nirvana reached", stats.nirvanaLives > 0 ? "yes" : "not yet"]
  ];
  var land = typeof regionById === "function" ? regionById(d.region) : null;
  if (land) records.unshift(["land", land.name]);
  sheetAddRows(body, records);

  var medalBox = document.createElement("div");
  body.appendChild(medalBox);
  if (typeof fetchMedallions === "function") {
    fetchMedallions(uid).then(function (list) {
      sheetAddHeading(medalBox, "medallions");
      renderMedallionRows(medalBox, list);
    }).catch(function () { /* rules not published yet -- just no section */ });
  }

  var earned = 0;
  for (var k = 0; k < ACHIEVEMENTS.length; k++) if (stats.achievements[ACHIEVEMENTS[k].id]) earned++;
  sheetAddHeading(body, "achievements (" + earned + " / " + ACHIEVEMENTS.length + ")");
  var list = document.createElement("div");
  for (var i = 0; i < ACHIEVEMENTS.length; i++) {
    var a = ACHIEVEMENTS[i];
    var when = stats.achievements[a.id];
    var row = document.createElement("div");
    row.className = "ach-row" + (when ? "" : " locked");
    var mark = document.createElement("span");
    mark.className = "ach-mark";
    mark.textContent = when ? "\u2714" : "\u25cb";
    var text = document.createElement("span");
    text.className = "ach-text";
    var nm = document.createElement("strong");
    nm.textContent = a.name;
    var ds = document.createElement("span");
    ds.textContent = " \u2014 " + a.desc;
    text.appendChild(nm);
    text.appendChild(ds);
    var date = document.createElement("span");
    date.className = "ach-date";
    date.textContent = when ? fmtDate(when) : "";
    row.appendChild(mark);
    row.appendChild(text);
    row.appendChild(date);
    list.appendChild(row);
  }
  body.appendChild(list);

  sheetAddText(body, "Stats update when a life ends, so the life in progress isn't counted yet.");
  el.profileOverlay.firstElementChild.scrollTop = 0;
}

// ---------------- buttons ----------------

el.btnPlayers.addEventListener("click", function () {
  showProfileOverlay();
  el.profileSearch.focus();
});

el.btnProfileMine.addEventListener("click", function () {
  var user = currentAuthUser();
  if (!user) {
    profileMessage(el.profileBody, "log in to have a profile -- it is created from your account's stats");
    return;
  }
  el.profileSearch.value = "";
  openProfile(user.uid);
});

el.btnProfileClose.addEventListener("click", closeProfileOverlay);

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && profileOverlayOpen()) closeProfileOverlay();
});

// Clicking the dimmed area outside the box closes it too.
el.profileOverlay.addEventListener("click", function (e) {
  if (e.target === el.profileOverlay) closeProfileOverlay();
});
