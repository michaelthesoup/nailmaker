"use strict";

// ----------------------------------------------------------------
// The news ticker: a small scrolling headline strip at the very top of the
// page, across the full width of the screen. It unlocks with the skyline
// (state.unlockedCity) AND needs an account, and only shows when there is
// something to say.
// The admin writes the headlines from the admin panel; they are stored in
// config/news as { headlines: [text, ...] } and fetched on login and every
// few minutes.
// ----------------------------------------------------------------

var NEWS_REFRESH_MS = 5 * 60 * 1000;
var NEWS_SPEED_PX_PER_SEC = 70; // "semi-fast"
var NEWS_SEPARATOR = "   \u25cf   ";

var newsHeadlines = [];
var newsShownKey = null;
var newsVisible = null; // so the page is only touched when visibility actually changes

function newsShouldShow() {
  return !!currentAuthUser() && !!state.unlockedCity && newsHeadlines.length > 0;
}

// Called whenever the headlines change and from render(), so the ticker appears the
// moment the skyline unlocks.
function newsRender() {
  var box = el.newsTicker;
  if (!box) return;
  var visible = newsShouldShow();
  if (visible !== newsVisible) {
    newsVisible = visible;
    box.style.display = visible ? "" : "none";
    document.documentElement.classList.toggle("news-on", visible); // makes room for it (see the page CSS)
    if (!visible) newsShownKey = null;
  }
  if (!visible) return;

  var text = newsHeadlines.join(NEWS_SEPARATOR);
  if (text === newsShownKey) return; // don't restart the scroll for nothing
  newsShownKey = text;

  el.newsTrack.textContent = text;
  newsSetSpeed();
}

// The track is padded by one screen width, so its width is the whole trip.
function newsSetSpeed() {
  el.newsTrack.style.animationDuration = Math.max(8, el.newsTrack.scrollWidth / NEWS_SPEED_PX_PER_SEC) + "s";
}

window.addEventListener("resize", function () { if (newsShownKey !== null) newsSetSpeed(); });

function newsFetch() {
  if (!currentAuthUser() || typeof db === "undefined") { newsHeadlines = []; newsRender(); return; }
  db.collection("config").doc("news").get().then(function (doc) {
    var list = doc.exists && Array.isArray(doc.data().headlines) ? doc.data().headlines : [];
    newsHeadlines = list.filter(function (h) { return typeof h === "string" && h.trim(); }).map(function (h) { return h.trim(); });
    newsRender();
  }).catch(function () { /* rules not published yet -- stay hidden */ });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function () { newsFetch(); });
}
setInterval(newsFetch, NEWS_REFRESH_MS);
