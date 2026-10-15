"use strict";

// ----------------------------------------------------------------
// Gifts from the admin. The admin panel drops a document into
// gifts/{uid}/items; the receiving player's game claims it here (on login and
// every minute after): it deletes the document first, so it can only be
// claimed once, then applies it to the live game. Only the admin account can
// create gifts (Firestore rules), so this is not something players can use
// on themselves. Only the keys below can be given.
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
