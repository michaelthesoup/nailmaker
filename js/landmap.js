"use strict";

// ----------------------------------------------------------------
// The map screen, opened from the "more" menu (it appears once you have
// reincarnated). It shows your land and what it does for you, and the same
// map of lands you chose from: click any land to see its effects and which
// players live there.
//
// Where players live comes from their public profile ("region", written by
// cloudsave.js). The leaderboards already read every profile and keep them for
// a couple of minutes (fetchEveryone in leaderboard.js), so looking at the map
// costs no extra reads. You are always listed under your own land straight
// from the live game, so you never wait for your profile to catch up.
// ----------------------------------------------------------------

var landMapApi = null;
var landMapInfo = null;
var landMapSelected = "";
var landMapResidents = null; // land id -> [{ uid, name }], null until loaded
var landMapLoadFailed = false;
var landMapToken = 0;        // ignores a reply that arrives after the screen was closed or reopened

// Shown in the "more" menu only once there is something to see.
function landMapUnlocked() {
  return state.karma >= 1 || !!regionById(state.region);
}

function landMapSort(a, b) {
  var oa = isPlayerOnline(a.uid) ? 0 : 1, ob = isPlayerOnline(b.uid) ? 0 : 1;
  return (oa - ob) || String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase());
}

function landMapRenderInfo() {
  var box = landMapInfo;
  box.innerHTML = "";
  var land = regionById(landMapSelected);
  if (!land) return;

  var name = document.createElement("div");
  name.style.fontWeight = "bold";
  name.style.marginTop = "6px";
  name.textContent = land.name + (land.id === state.region ? " (your land)" : "");
  box.appendChild(name);
  regionEffectLines(land).forEach(function (line) {
    var d = document.createElement("div");
    d.textContent = (line[1] ? "+ " : "\u2212 ") + line[0];
    box.appendChild(d);
  });

  sheetAddHeading(box, "who lives here");
  if (!currentAuthUser()) { sheetAddText(box, "log in to see who lives here"); return; }
  if (landMapLoadFailed) { sheetAddText(box, "couldn't load the players"); return; }
  if (!landMapResidents) { sheetAddText(box, "loading\u2026"); return; }
  var list = landMapResidents[land.id] || [];
  if (list.length === 0) { sheetAddText(box, "no one yet"); return; }
  list.forEach(function (p) {
    var row = document.createElement("div");
    row.className = "profile-result";
    var nm = document.createElement("span");
    nm.textContent = p.name;
    row.appendChild(nm);
    if (isPlayerOnline(p.uid)) row.appendChild(presenceDot());
    row.addEventListener("click", function () { openProfile(p.uid, { name: p.name, uid: p.uid }); });
    box.appendChild(row);
  });
}

function landMapSelect(id) {
  landMapSelected = id;
  landMapApi.select(id);
  landMapRenderInfo();
}

function landMapLoadResidents(token) {
  var user = currentAuthUser();
  if (!user || typeof fetchEveryone !== "function") return;
  if (typeof presenceRefresh === "function") presenceRefresh(false);
  fetchEveryone().then(function (all) {
    if (token !== landMapToken) return;
    var byLand = {};
    all.players.forEach(function (p) {
      if (p.uid === user.uid || (all.banned && all.banned[p.uid]) || !regionById(p.region)) return;
      (byLand[p.region] = byLand[p.region] || []).push({ uid: p.uid, name: p.name });
    });
    if (regionById(state.region)) { // you, from the live game
      (byLand[state.region] = byLand[state.region] || []).push({ uid: user.uid, name: user.displayName || "player" });
    }
    var counts = {};
    for (var id in byLand) { byLand[id].sort(landMapSort); counts[id] = byLand[id].length; }
    landMapResidents = byLand;
    landMapApi.setCounts(counts);
    landMapRenderInfo();
  }).catch(function (err) {
    if (token !== landMapToken) return;
    console.warn("Couldn't load who lives where", err);
    landMapLoadFailed = true;
    landMapRenderInfo();
  });
}

function openLandMap() {
  var token = ++landMapToken;
  landMapResidents = null;
  landMapLoadFailed = false;

  var body = el.landMapBody;
  body.innerHTML = "";

  sheetAddHeading(body, "your land");
  var mine = regionById(state.region);
  if (mine) {
    var rows = [["land", mine.name]];
    regionEffectLines(mine).forEach(function (line) { rows.push([line[1] ? "benefit" : "drawback", line[0]]); });
    sheetAddRows(body, rows);
  } else {
    sheetAddText(body, "none yet");
  }

  sheetAddHeading(body, "the lands");
  var mapBox = document.createElement("div");
  body.appendChild(mapBox);
  landMapInfo = document.createElement("div");
  body.appendChild(landMapInfo);
  landMapApi = buildRegionMap(mapBox, landMapSelect);

  landMapSelected = mine ? mine.id : "";
  if (mine) landMapSelect(mine.id);

  landMapLoadResidents(token);
  el.landMapOverlay.style.display = "flex";
  el.landMapOverlay.firstElementChild.scrollTop = 0;
}

function closeLandMap() {
  landMapToken++;
  el.landMapOverlay.style.display = "none";
}

el.btnLandMap.addEventListener("click", openLandMap);
el.btnLandMapClose.addEventListener("click", closeLandMap);
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && el.landMapOverlay.style.display === "flex") closeLandMap();
});
