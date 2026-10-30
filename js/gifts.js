"use strict";

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
  if (gift.key !== "tao") next = Math.max(0, next);
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
  }).catch(function () {  })
    .then(function () { giftClaiming = false; });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) setTimeout(claimGifts, 3000);
  });
}
setInterval(claimGifts, GIFT_CLAIM_INTERVAL_MS);

var WIPE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
var wipeChecking = false;

function applyWipe(at) {
  var changed = state.tao !== 0 || state.karma !== 0;
  state.tao = 0;
  state.karma = 0;
  state.wipeApplied = at;
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
  if (typeof rc !== "undefined" && rc) return;
  if (typeof cloudAutosaveTimer === "undefined" || !cloudAutosaveTimer) return;
  wipeChecking = true;
  db.collection("config").doc("wipe").get().then(function (doc) {
    if (!doc.exists) return;
    var at = Number(doc.data().at);
    if (!isFinite(at) || at <= (state.wipeApplied || 0)) return;
    applyWipe(at);
  }).catch(function () {  })
    .then(function () { wipeChecking = false; });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) { setTimeout(checkWipe, 4000); setTimeout(checkWipe, 25000); }
  });
}
setInterval(checkWipe, WIPE_CHECK_INTERVAL_MS);

var RESET_KINDS = {
  factories:  { label: "factories",             apply: function () { state.factories = 0; state.autoFactories = 0; } },
  nailMakers: { label: "nail makers",           apply: function () { state.nailMakers = 0; } },
  breakers:   { label: "nail breakers",         apply: function () { state.breakers = 0; } },
  funds:      { label: "funds",                 apply: function () { state.funds = defaultState().funds; } },
  materials:  { label: "iron and copper",       apply: function () { state.ironAmt = 0; state.copperAmt = 0; } },
  unsold:     { label: "unsold nails",          apply: function () { state.unsold = 0; } },
  marketing:  { label: "marketing levels",      apply: function () { state.marketingLevel = 0; } },
  tao:        { label: "tao",                   apply: function () { state.tao = 0; } },
  karma:      { label: "karma",                 apply: function () { state.karma = 0; } },
  cards:      { label: "cards (deck and collection)", apply: function () { state.deck = []; state.collection = []; } },
  everything: { label: "progress (a brand new game)", apply: function () { var wiped = state.wipeApplied; state = defaultState(); if (wiped) state.wipeApplied = wiped; } }
};

var resetChecking = false;

function applyResets(doc) {
  var applied = state.resetApplied && typeof state.resetApplied === "object" ? state.resetApplied : {};
  var done = [];
  for (var kind in RESET_KINDS) {
    var entry = doc[kind];
    var at = entry ? Number(entry.at) : 0;
    if (!isFinite(at) || at <= (applied[kind] || 0)) continue;
    RESET_KINDS[kind].apply();
    applied[kind] = at;
    done.push(RESET_KINDS[kind].label);
  }
  if (!done.length) return;
  state.resetApplied = applied;
  achievementToastQueue.push({ toastText: "an admin reset everyone's " + done.join(", ") });
  showNextAchievementToast();
  render();
  if (typeof cloudSaveState === "function") cloudSaveState();
}

function checkResets() {
  var user = currentAuthUser();
  if (!user || resetChecking || typeof db === "undefined") return;
  if (typeof rc !== "undefined" && rc) return;
  if (typeof cloudAutosaveTimer === "undefined" || !cloudAutosaveTimer) return;
  resetChecking = true;
  db.collection("config").doc("resets").get().then(function (doc) {
    if (doc.exists) applyResets(doc.data() || {});
  }).catch(function () {  })
    .then(function () { resetChecking = false; });
}

if (typeof firebase !== "undefined" && firebase.auth) {
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) { setTimeout(checkResets, 4500); setTimeout(checkResets, 26000); }
  });
}
setInterval(checkResets, WIPE_CHECK_INTERVAL_MS);
