"use strict";

// ----------------------------------------------------------------
// The news ticker: a small scrolling headline strip at the very top of the
// page, about as wide as one column. It only appears for logged-in players
// (making an account unlocks it) and only when there is something to say.
// The admin writes the headlines from the admin panel; they are stored in
// config/news as { headlines: [text, ...] } and fetched on login and every
// few minutes.
// ----------------------------------------------------------------

var NEWS_REFRESH_MS = 5 * 60 * 1000;
var NEWS_SPEED_PX_PER_SEC = 70; // "semi-fast"
var NEWS_SEPARATOR = "   \u25cf   ";

var newsHeadlines = [];
var newsShownKey = null;

function newsRender() {
  var box = el.newsTicker;
  if (!box) return;
  var visible = !!currentAuthUser() && newsHeadlines.length > 0;
  box.style.display = visible ? "" : "none";
  if (!visible) { newsShownKey = null; return; }

  var text = newsHeadlines.join(NEWS_SEPARATOR);
  if (text === newsShownKey) return; // don't restart the scroll for nothing
  newsShownKey = text;

  el.newsTrack.textContent = text;
  var distance = el.newsTrack.scrollWidth; // the track is padded by one container width, so this is the whole trip
  el.newsTrack.style.animationDuration = Math.max(8, distance / NEWS_SPEED_PX_PER_SEC) + "s";
}

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
