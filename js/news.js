"use strict";

var NEWS_REFRESH_MS = 5 * 60 * 1000;
var NEWS_SPEED_PX_PER_SEC = 70;
var NEWS_SEPARATOR = "   \u25cf   ";

var newsHeadlines = [];
var newsShownKey = null;
var newsVisible = null;

function newsShouldShow() {
  return !!currentAuthUser() && !!state.unlockedCity && newsHeadlines.length > 0;
}

function newsRender() {
  var box = el.newsTicker;
  if (!box) return;
  var visible = newsShouldShow();
  if (visible !== newsVisible) {
    newsVisible = visible;
    box.style.display = visible ? "" : "none";
    document.documentElement.classList.toggle("news-on", visible);
    if (!visible) newsShownKey = null;
  }
  if (!visible) return;

  var unit = newsHeadlines.join(NEWS_SEPARATOR) + NEWS_SEPARATOR;
  if (unit === newsShownKey) return;
  newsShownKey = unit;
  newsBuildTrack(unit);
}

function newsBuildTrack(unit) {
  var track = el.newsTrack;
  track.textContent = unit;
  var unitWidth = Math.max(1, track.scrollWidth);
  var copies = Math.max(1, Math.ceil(el.newsTicker.clientWidth / unitWidth));
  var half = new Array(copies + 1).join(unit);
  track.textContent = half + half;
  track.style.animationDuration = Math.max(4, (track.scrollWidth / 2) / NEWS_SPEED_PX_PER_SEC) + "s";
}

window.addEventListener("resize", function () { if (newsShownKey !== null) newsBuildTrack(newsShownKey); });

function newsFetch() {
  if (!currentAuthUser() || typeof db === "undefined") { newsHeadlines = []; newsRender(); return; }
  db.collection("config").doc("news").get().then(function (doc) {
    var list = doc.exists && Array.isArray(doc.data().headlines) ? doc.data().headlines : [];
    newsHeadlines = list.filter(function (h) { return typeof h === "string" && h.trim(); }).map(function (h) { return h.trim(); });
    newsRender();
  }).catch(function () {  });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function () { newsFetch(); });
}
setInterval(newsFetch, NEWS_REFRESH_MS);
