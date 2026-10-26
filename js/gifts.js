"use strict";

// ----------------------------------------------------------------
// Gifts from the admin. The admin panel drops a document into
// gifts/{uid}/items; the receiving player's game claims it here (on login and
// every minute after): it deletes the document first, so it can only be
// claimed once, then applies it to the live game. Only the admin account can
// create gifts (Firestore rules), so this is not something players can use
// on themselves. Only the keys below can be given.
//
// The same file carries out the admin's "wipe everyone's tao and karma". That is one
// marker document, config/wipe = { at: <ms> }, which every logged-in game looks at when it
// starts and every few minutes after. A game that hasn't yet applied a wipe at least that new
// (state.wipeApplied is the time of the last one it applied) sets its tao and karma to 0,
// once, and saves. Players who are offline simply get it when they next log in.
// ----------------------------------------------------------------

var GIFT_CLAIM_INTERVAL_MS = 60000;

var GIFT_KEYS = {
  funds:          { label: "funds",           money: true },
  unsold:         { label: "unsold nails" },
  ironAmt:        { label: "iron (g)" },
  copperAmt:      { label: "copper (g)" },
  nailMakers:     { label: "nail makers",     whole: true },
  breakers:       { label: "nail breakers",   whole: true },
  factories:      { label: "factories",       whole: true },
  marketingLevel: { label: "marketing levels", whole: true },
  tao:            { label: "tao",             whole: true }
};

function giftText(key, amount) {
  var def = GIFT_KEYS[key];
  if (!def) return "";
  var n = def.money ? fmtMoney(Math.abs(amount)) : fmtInt(Math.abs(amount));
  return (amount < 0 ? "-" : "+") + n + " " + def.label;
}

function applyGift(gift) {
  var def = GIFT_KEYS[gift.key];
  var amount = Number(gift.amount);
  if (!def || !isFinite(amount) || amount === 0) return;
  if (def.whole) amount = Math.floor(amount);

  var previous = state[gift.key] || 0;
  var next = previous + amount;
  if (gift.key !== "tao") next = Math.max(0, next); // only tao may go negative
  if (gift.key === "marketingLevel") {
    next = clampMarketingLevel(next);
    amount = next - previous;
    if (amount === 0) return;
  }
  state[gift.key] = next;
  if (gift.key === "breakers" && state.breakers > 0) state.unlockedMap = true;

  achievementToastQueue.push({ toastText: "gift: " + giftText(gift.key, amount) });
  showNextAchievementToast();
  render();
}

var giftClaiming = false;

function claimGifts() {
  var user = currentAuthUser();
  if (!user || giftClaiming || typeof db === "undefined") return;
  giftClaiming = true;
  db.collection("gifts").doc(user.uid).collection("items").get().then(function (snap) {
    var jobs = [];
    snap.forEach(function (doc) {
      var gift = doc.data();
      jobs.push(doc.ref.delete().then(function () { applyGift(gift); }));
    });
    return Promise.all(jobs);
  }).catch(function () { /* none waiting, or rules not published yet */ })
    .then(function () { giftClaiming = false; });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) setTimeout(claimGifts, 3000); // let the cloud save finish loading first
  });
}
setInterval(claimGifts, GIFT_CLAIM_INTERVAL_MS);

// ---------------- wiping everyone's tao and karma ----------------

var WIPE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
var wipeChecking = false;

function applyWipe(at) {
  var changed = state.tao !== 0 || state.karma !== 0;
  state.tao = 0;
  state.karma = 0;
  state.wipeApplied = at; // so this wipe is never applied twice, here or on another device (it is saved with the game)
  if (changed) {
    achievementToastQueue.push({ toastText: "an admin wiped everyone's tao and karma" });
    showNextAchievementToast();
  }
  render();
  if (typeof cloudSaveState === "function") cloudSaveState();
}

function checkWipe() {
  var user = currentAuthUser();
  if (!user || wipeChecking || typeof db === "undefined") return;
  if (typeof rc !== "undefined" && rc) return; // not in the middle of a reincarnation: the next check will do it
  // Wait until the cloud save has loaded (cloudsave.js starts its autosave when it has): the game is blank until then, and
  // saving a blank game would overwrite the real one.
  if (typeof cloudAutosaveTimer === "undefined" || !cloudAutosaveTimer) return;
  wipeChecking = true;
  db.collection("config").doc("wipe").get().then(function (doc) {
    if (!doc.exists) return;
    var at = Number(doc.data().at);
    if (!isFinite(at) || at <= (state.wipeApplied || 0)) return;
    applyWipe(at);
  }).catch(function () { /* none published, or rules not published yet */ })
    .then(function () { wipeChecking = false; });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) { setTimeout(checkWipe, 4000); setTimeout(checkWipe, 25000); } // after the cloud save has loaded (a slow one gets a second go)
  });
}
setInterval(checkWipe, WIPE_CHECK_INTERVAL_MS);
