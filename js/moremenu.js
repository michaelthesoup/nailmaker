"use strict";

// ----------------------------------------------------------------
// The "more" menu. Keeps the top of the page to the business (save, load,
// end run) and tucks everything else behind one button. The guide is always
// in it; achievements only appear once the player has earned one (see
// achievements.js), the map once they have reincarnated (landmap.js), and
// players only appear for logged-in accounts.
// ----------------------------------------------------------------

function moreMenuOpen() {
  return el.moreMenu.style.display === "flex";
}

function setMoreMenuOpen(open) {
  el.moreMenu.style.display = open ? "flex" : "none";
}

// Shows each item only when it is useful.
function updateMoreMenu() {
  if (el.btnLandMap) el.btnLandMap.style.display = (typeof landMapUnlocked === "function" && landMapUnlocked()) ? "" : "none";
  if (el.btnPlayers) el.btnPlayers.style.display = (typeof currentAuthUser === "function" && currentAuthUser()) ? "" : "none";
  if (el.btnAdmin) el.btnAdmin.style.display = (typeof isCheatAllowed === "function" && isCheatAllowed()) ? "" : "none";
  if (typeof updateAchievementButton === "function") updateAchievementButton();
}

el.btnMore.addEventListener("click", function () {
  updateMoreMenu();
  setMoreMenuOpen(!moreMenuOpen());
});

// Picking an item closes the menu (the item's own button opens its screen).
el.moreMenu.addEventListener("click", function (e) {
  if (e.target.closest("button")) setMoreMenuOpen(false);
});

document.addEventListener("click", function (e) {
  if (moreMenuOpen() && !el.moreWrap.contains(e.target)) setMoreMenuOpen(false);
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && moreMenuOpen()) setMoreMenuOpen(false);
});

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(updateMoreMenu);
}
updateMoreMenu();

// The version number, small and grey at the top middle of the page.
(function () {
  var tag = document.getElementById("versionTag");
  if (tag && typeof GAME_VERSION !== "undefined") tag.textContent = "v" + GAME_VERSION;
})();
