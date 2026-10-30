"use strict";

function moreMenuOpen() {
  return el.moreMenu.style.display === "flex";
}

function setMoreMenuOpen(open) {
  el.moreMenu.style.display = open ? "flex" : "none";
}

function updateMoreMenu() {
  if (el.btnPlayers) el.btnPlayers.style.display = (typeof currentAuthUser === "function" && currentAuthUser()) ? "" : "none";
  if (el.btnAdmin) el.btnAdmin.style.display = (typeof isCheatAllowed === "function" && isCheatAllowed()) ? "" : "none";
  if (typeof updateAchievementButton === "function") updateAchievementButton();
}

el.btnMore.addEventListener("click", function () {
  updateMoreMenu();
  setMoreMenuOpen(!moreMenuOpen());
});

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

(function () {
  var tag = document.getElementById("versionTag");
  if (tag && typeof GAME_VERSION !== "undefined") tag.textContent = "v" + GAME_VERSION;
})();
