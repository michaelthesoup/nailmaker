"use strict";

// ----------------------------------------------------------------
// The admin panel. Only accounts on CHEAT_ALLOWED_USERNAMES (state.js) see the
// button for it, in the "more" menu. This check is just for tidiness: what
// actually protects anything is the Firestore rules, which only let the admin
// ACCOUNT write medallions, gifts, bans and the news. The panel has four tabs:
//
//   me       give yourself resources, machines and progress with buttons
//   players  find a player, send them gifts, kick them off the leaderboards
//   weekly   look at a week's board, remove entries, award medallions
//   news     write the headlines in the scrolling ticker at the top of the page
//
// Kicking a player deletes their leaderboard entries (all-time and the last
// few weeks) and adds them to the "banned" collection, which the rules use to
// stop them posting again until you restore them.
//
// "sync scores from saves" (players tab) reads every player's cloud save and
// raises their board entries to the life they are in right now. It needs the
// admin read on saves and the admin write on scores and weeks in the rules.
// ----------------------------------------------------------------

var ADMIN_TABS = [["me", "me"], ["players", "players"], ["weekly", "weekly"], ["news", "news"]];
var ADMIN_KICK_WEEKS_BACK = 8;

var adminBuilt = false;
var adminPanels = {};
var adminTabButtons = {};
var adminValueUpdaters = [];
var adminTarget = null; // { uid, name }
var adminWeekOffset = -1; // 0 = this week, -1 = last week, ...
var adminWeekToken = 0;
var adminSearchToken = 0;
var adminSearchTimer = null;
var adminNewsDraft = [];
var adminRefreshTimer = null;

// ---------------- small helpers ----------------

function adminMake(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function adminAllowed() {
  return typeof isCheatAllowed === "function" && isCheatAllowed();
}

function adminAbbrev(n) {
  if (n >= 1e12) return (n / 1e12) + "T";
  if (n >= 1e9) return (n / 1e9) + "B";
  if (n >= 1e6) return (n / 1e6) + "M";
  if (n >= 1e3) return (n / 1e3) + "K";
  return String(n);
}

function adminButtons(parent, defs) {
  var wrap = adminMake("div", "admin-btns");
  for (var i = 0; i < defs.length; i++) {
    var b = adminMake("button", "", defs[i][0]);
    b.addEventListener("click", defs[i][1]);
    wrap.appendChild(b);
  }
  parent.appendChild(wrap);
  return wrap;
}

function adminStatus(parent) {
  var s = adminMake("div", "hint admin-status", "");
  parent.appendChild(s);
  return s;
}

function adminTextInput(placeholder, maxLen) {
  var input = adminMake("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  if (maxLen) input.maxLength = maxLen;
  input.className = "admin-input";
  return input;
}

// ---------------- tab "me": give yourself things ----------------

function adminRefreshValues() {
  for (var i = 0; i < adminValueUpdaters.length; i++) adminValueUpdaters[i]();
}

function adminAfter(key) {
  if (key === "factories") state.factoryProgress = Math.min(state.factoryProgress || 0, state.factories);
  if (key === "factorySquared") state.factorySquaredProgress = Math.min(state.factorySquaredProgress || 0, state.factorySquared);
  if (key === "breakers" && state.breakers > 0) state.unlockedMap = true;
  render();
  adminRefreshValues();
}

function adminAdd(key, delta, min, whole) {
  if (!adminAllowed()) return;
  var v = (state[key] || 0) + delta;
  if (whole) v = Math.floor(v);
  if (min !== undefined) v = Math.max(min, v);
  if (key === "marketingLevel") v = Math.min(MARKETING_LEVEL_MAX, v);
  state[key] = v;
  adminAfter(key);
}

function adminSet(key, value) {
  if (!adminAllowed()) return;
  state[key] = value;
  adminAfter(key);
}

function adminAmountButtons(key, amounts, opts) {
  opts = opts || {};
  var out = [];
  var i;
  function make(a) { return function () { adminAdd(key, a, opts.min, opts.whole); }; }
  if (opts.minus) {
    for (i = amounts.length - 1; i >= 0; i--) out.push(["\u2212" + adminAbbrev(amounts[i]), make(-amounts[i])]);
  }
  for (i = 0; i < amounts.length; i++) out.push(["+" + adminAbbrev(amounts[i]), make(amounts[i])]);
  if (opts.zero !== false) out.push(["zero", function () { adminSet(key, 0); }]);
  return out;
}

function adminRow(parent, label, getText, buttons) {
  var row = adminMake("div", "row");
  var l = adminMake("span", "label", label);
  var v = adminMake("span", "value", "");
  row.appendChild(l);
  row.appendChild(v);
  parent.appendChild(row);
  adminValueUpdaters.push(function () { v.textContent = getText(); });
  adminButtons(parent, buttons);
}

function adminUnlockEverything() {
  if (!adminAllowed()) return;
  state.unlockedMap = true;
  state.unlockedMachinery = true;
  state.unlockedFactorySquared = true;
  state.unlockedYinYang = true;
  state.unlockedSwarm = true;
  state.unlockedCity = true;
  state.unlockedMonastery = true;
  state.unlockedFloor = true;
  render();
}

function buildMePanel(p) {
  var big = [1e3, 1e6, 1e9, 1e12];
  sheetAddHeading(p, "resources");
  adminRow(p, "funds", function () { return fmtMoney(state.funds); }, adminAmountButtons("funds", big, { min: 0 }));
  adminRow(p, "unsold nails", function () { return fmtInt(state.unsold); }, adminAmountButtons("unsold", big, { min: 0 }));
  adminRow(p, "iron", function () { return fmtWeight(state.ironAmt); }, adminAmountButtons("ironAmt", big, { min: 0 }));
  adminRow(p, "copper", function () { return fmtWeight(state.copperAmt); }, adminAmountButtons("copperAmt", big, { min: 0 }));
  adminRow(p, "nails made (score)", function () { return fmtInt(state.totalNailsMade); }, adminAmountButtons("totalNailsMade", big, { min: 0 }));

  sheetAddHeading(p, "machines");
  var count = [1, 10, 100];
  var countBig = [1, 10, 100, 1000];
  adminRow(p, "nail makers", function () { return fmtInt(state.nailMakers); }, adminAmountButtons("nailMakers", countBig, { min: 0, whole: true, minus: true }));
  adminRow(p, "nail breakers", function () { return fmtInt(state.breakers); }, adminAmountButtons("breakers", countBig, { min: 0, whole: true, minus: true }));
  adminRow(p, "factories", function () { return fmtInt(state.factories); }, adminAmountButtons("factories", count, { min: 0, whole: true, minus: true }));
  adminRow(p, "factory\u00b2", function () { return fmtInt(state.factorySquared); }, adminAmountButtons("factorySquared", [1, 10], { min: 0, whole: true, minus: true }));
  adminRow(p, "marketing level", function () { return String(state.marketingLevel); }, adminAmountButtons("marketingLevel", count, { min: 0, whole: true, minus: true }));

  sheetAddHeading(p, "progress");
  adminRow(p, "tao", function () { return String(state.tao); }, adminAmountButtons("tao", count, { whole: true, minus: true }));
  adminRow(p, "karma", function () { return String(state.karma); }, adminAmountButtons("karma", [1, 5], { min: 0, whole: true, minus: true }));
  adminRow(p, "nailbombs dropped", function () { return String(state.cityBombs); }, adminAmountButtons("cityBombs", [1, 10], { min: 0, whole: true }));
  adminRow(p, "yin & yang", function () { return fmtInt(state.yin) + " / " + fmtInt(state.yang); }, [
    ["fill yin", function () { adminSet("yin", yinYangMax()); }],
    ["fill yang", function () { adminSet("yang", yinYangMax()); }],
    ["reset both", function () { if (adminAllowed()) { state.yin = 0; state.yang = 0; adminAfter("yin"); } }]
  ]);

  sheetAddHeading(p, "unlocks");
  adminButtons(p, [["unlock everything", adminUnlockEverything]]);
}

// ---------------- tab "players" ----------------

function adminSelectTarget(uid, name) {
  adminTarget = { uid: uid, name: name || "player" };
  adminPanels.players.targetLine.textContent = "selected: " + adminTarget.name;
  adminPanels.players.results.innerHTML = "";
  adminPanels.players.search.value = "";
  adminPanels.players.status.textContent = "";
  adminRefreshMedalList();
  db.collection("banned").doc(uid).get().then(function (doc) {
    if (adminTarget && adminTarget.uid === uid && doc.exists) {
      adminPanels.players.status.textContent = adminTarget.name + " is currently banned from the leaderboards.";
    }
  }).catch(function () {});
}

function adminSearchPlayers(raw) {
  var q = raw.trim().toLowerCase();
  var token = ++adminSearchToken;
  var box = adminPanels.players.results;
  box.innerHTML = "";
  if (!q) return;
  db.collection("profiles").orderBy("nameLower").startAt(q).endAt(q + "\uf8ff").limit(8).get().then(function (snap) {
    if (token !== adminSearchToken) return;
    if (snap.empty) { sheetAddText(box, "no player found"); return; }
    snap.forEach(function (doc) {
      var row = adminMake("div", "profile-result");
      row.appendChild(adminMake("span", "", doc.data().name || "player"));
      row.addEventListener("click", function () { adminSelectTarget(doc.id, doc.data().name); });
      box.appendChild(row);
    });
  }).catch(function (err) {
    console.error(err);
    sheetAddText(box, "couldn't search -- check the Firestore rules");
  });
}

function adminGive(key, amount) {
  var st = adminPanels.players.status;
  if (!adminTarget) { st.textContent = "select a player first"; return; }
  var target = adminTarget;
  db.collection("gifts").doc(target.uid).collection("items").add({
    key: key, amount: amount, from: "admin", createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function () {
    st.textContent = "sent " + giftText(key, amount) + " to " + target.name + " (they get it within a minute of being online)";
  }).catch(function (err) {
    console.error(err);
    st.textContent = "couldn't send -- check the Firestore rules for 'gifts'";
  });
}

function adminKickPlayer(uid, name, statusNode, done) {
  if (!window.confirm("Kick " + name + " off the leaderboards?\n\nThis deletes their all-time and recent weekly entries and stops them posting new scores or chatting until you restore them.")) return;
  var batch = db.batch();
  batch.delete(db.collection("scores").doc(uid));
  for (var i = 0; i <= ADMIN_KICK_WEEKS_BACK; i++) {
    batch.delete(db.collection("weeks").doc(weekIdFor(currentWeekIndex() - i)).collection("scores").doc(uid));
  }
  var me = currentAuthUser();
  batch.set(db.collection("banned").doc(uid), { name: name, by: me ? me.displayName : "admin", at: firebase.firestore.FieldValue.serverTimestamp() });
  batch.commit().then(function () {
    if (typeof everyoneCache !== "undefined") everyoneCache.at = 0; // the boards should re-read who is banned
    statusNode.textContent = name + " was kicked off the leaderboards and can't post or chat until restored.";
    if (done) done();
    if (typeof renderLeaderboard === "function") renderLeaderboard();
  }).catch(function (err) {
    console.error(err);
    statusNode.textContent = "couldn't kick -- check the Firestore rules for 'banned' and 'scores'";
  });
}

// Raises every player's leaderboard entries to the nail count of the life they are in right now, read
// from their cloud save. It only ever RAISES a score (never lowers or removes one) and skips banned players.
// The weekly board is only touched for players whose save was written this week.
var ADMIN_SYNC_BATCH = 400; // Firestore allows 500 writes per batch

function adminSyncScores(status) {
  if (!adminAllowed()) return;
  if (!window.confirm("Raise everyone's leaderboard score to the nails they have made in their current life?\n\nScores only ever go up, and banned players are skipped. This reads every player's cloud save.")) return;
  status.textContent = "reading saves...";

  var weekIndex = currentWeekIndex();
  var weekId = weekIdFor(weekIndex);
  var weekStart = weekStartMs(weekIndex);

  Promise.all([
    db.collection("saves").get(),
    db.collection("scores").get(),
    db.collection("weeks").doc(weekId).collection("scores").get(),
    db.collection("profiles").limit(1000).get(),
    db.collection("banned").get()
  ]).then(function (res) {
    var allTime = {}, weekly = {}, names = {}, banned = {};
    res[1].forEach(function (doc) { allTime[doc.id] = doc.data(); });
    res[2].forEach(function (doc) { weekly[doc.id] = doc.data(); });
    res[3].forEach(function (doc) { names[doc.id] = doc.data().name; });
    res[4].forEach(function (doc) { banned[doc.id] = true; });

    var writes = [];
    var raisedAll = 0, raisedWeek = 0, skipped = 0;

    res[0].forEach(function (doc) {
      var uid = doc.id;
      if (banned[uid]) return;
      var save = doc.data();
      var s;
      try { s = JSON.parse(save.data); } catch (e) { skipped++; return; }
      var nails = Math.floor(Number(s && s.totalNailsMade));
      if (!isFinite(nails) || nails <= 0) return;
      var name = String((allTime[uid] && allTime[uid].name) || names[uid] || "").slice(0, 30);
      if (!name) { skipped++; return; } // nothing to show on the board without a name

      var karma = Math.max(0, Math.floor(Number(s.karma) || 0)); // karma the life began with, same as an end-run score
      var timeSec = Math.max(0, Math.floor(Number(s.simTime) || 0));
      var stamp = firebase.firestore.FieldValue.serverTimestamp();

      var bestAll = allTime[uid] ? allTime[uid].score : -1;
      if (nails > bestAll) {
        writes.push({ ref: db.collection("scores").doc(uid), data: { name: name, score: nails, uid: uid, karma: karma, updatedAt: stamp } });
        raisedAll++;
      }

      var savedMs = save.updatedAt && save.updatedAt.toMillis ? save.updatedAt.toMillis() : 0;
      var bestWeek = weekly[uid] ? weekly[uid].score : -1;
      if (savedMs >= weekStart && nails > bestWeek) {
        writes.push({
          ref: db.collection("weeks").doc(weekId).collection("scores").doc(uid),
          data: { name: name, score: nails, uid: uid, karma: karma, timeSec: timeSec, weekId: weekId, updatedAt: stamp }
        });
        raisedWeek++;
      }
    });

    var commits = [];
    for (var i = 0; i < writes.length; i += ADMIN_SYNC_BATCH) {
      var batch = db.batch();
      writes.slice(i, i + ADMIN_SYNC_BATCH).forEach(function (w) { batch.set(w.ref, w.data); });
      commits.push(batch.commit());
    }
    return Promise.all(commits).then(function () {
      status.textContent = "raised " + raisedAll + " all-time and " + raisedWeek + " weekly scores (" + res[0].size + " saves read" +
        (skipped ? ", " + skipped + " skipped" : "") + ").";
      if (typeof renderLeaderboard === "function") renderLeaderboard();
    });
  }).catch(function (err) {
    console.error(err);
    status.textContent = "couldn't sync -- publish the updated Firestore rules (admin read on 'saves', admin write on 'scores' and 'weeks')";
  });
}

function adminRestorePlayer(uid, name, statusNode) {
  db.collection("banned").doc(uid).delete().then(function () {
    if (typeof everyoneCache !== "undefined") everyoneCache.at = 0;
    statusNode.textContent = name + " can post to the leaderboards again.";
  }).catch(function (err) {
    console.error(err);
    statusNode.textContent = "couldn't restore -- check the Firestore rules for 'banned'";
  });
}

// ---- medallions given by hand (any player, any time) ----
// A gift medallion is its own document with weekId "gift", so it never gets mixed up with a week's top three
// (the weekly tab only looks at documents for that week). It shows on the profile and as a gold dot on the boards.
function adminRefreshMedalList() {
  var box = adminPanels.players.medalBox;
  if (!box) return;
  box.innerHTML = "";
  if (!adminTarget) return;
  var target = adminTarget;
  db.collection("medallions").where("uid", "==", target.uid).get().then(function (snap) {
    if (!adminTarget || adminTarget.uid !== target.uid) return;
    box.innerHTML = "";
    if (snap.empty) { sheetAddText(box, target.name + " has no medallions"); return; }
    var docs = [];
    snap.forEach(function (doc) { docs.push({ id: doc.id, d: doc.data() }); });
    docs.sort(function (x, y) { return (y.d.weekIndex - x.d.weekIndex) || (x.d.rank - y.d.rank); });
    docs.forEach(function (item) {
      var row = adminMake("div", "row");
      var label = MEDALLION_NAMES[item.d.rank] + " \u00b7 " + (item.d.gift ? "special award" : medallionWeekLabel(item.d.weekIndex));
      row.appendChild(adminMake("span", "label", label));
      var rm = adminMake("button", "", "remove");
      rm.addEventListener("click", function () { adminRemoveMedallion(item.id, label); });
      row.appendChild(rm);
      box.appendChild(row);
    });
  }).catch(function (err) {
    console.error(err);
    sheetAddText(box, "couldn't read medallions -- check the Firestore rules for 'medallions'");
  });
}

function adminGiveMedallion(rank, status) {
  if (!adminTarget) { status.textContent = "select a player first"; return; }
  var target = adminTarget;
  if (!window.confirm("Give " + target.name + " a " + MEDALLION_NAMES[rank] + " medallion?")) return;
  db.collection("medallions").add({
    weekId: "gift", weekIndex: currentWeekIndex(), rank: rank, medal: MEDALLION_NAMES[rank],
    uid: target.uid, name: target.name, score: 0, karma: 0, gift: true,
    awardedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function () {
    if (typeof everyoneCache !== "undefined") everyoneCache.at = 0; // the boards should re-read who holds medallions
    status.textContent = "gave " + target.name + " a " + MEDALLION_NAMES[rank] + " medallion (they see a notice next time they log in).";
    adminRefreshMedalList();
    if (typeof renderLeaderboard === "function") renderLeaderboard();
  }).catch(function (err) {
    console.error(err);
    status.textContent = "couldn't give it -- check the Firestore rules for 'medallions'";
  });
}

function adminRemoveMedallion(id, label) {
  var status = adminPanels.players.status;
  if (!window.confirm("Remove the " + label + " from " + (adminTarget ? adminTarget.name : "this player") + "?")) return;
  db.collection("medallions").doc(id).delete().then(function () {
    if (typeof everyoneCache !== "undefined") everyoneCache.at = 0;
    status.textContent = "removed the " + label + ".";
    adminRefreshMedalList();
    if (typeof renderLeaderboard === "function") renderLeaderboard();
  }).catch(function (err) {
    console.error(err);
    status.textContent = "couldn't remove it -- check the Firestore rules for 'medallions'";
  });
}

function buildPlayersPanel(p) {
  sheetAddHeading(p, "find a player");
  var targetLine = adminMake("div", "hint", "no player selected");
  p.appendChild(targetLine);
  var search = adminTextInput("search a player's name", 30);
  search.addEventListener("input", function () {
    clearTimeout(adminSearchTimer);
    adminSearchTimer = setTimeout(function () { adminSearchPlayers(search.value); }, 300);
  });
  p.appendChild(search);
  var results = adminMake("div");
  p.appendChild(results);

  sheetAddHeading(p, "give to the selected player");
  var gifts = [
    ["+$1M", "funds", 1e6], ["+$1B", "funds", 1e9],
    ["+1M copper", "copperAmt", 1e6], ["+1M iron", "ironAmt", 1e6], ["+1M nails", "unsold", 1e6],
    ["+100 makers", "nailMakers", 100], ["+10 breakers", "breakers", 10],
    ["+5 factories", "factories", 5], ["+5 marketing", "marketingLevel", 5], ["+5 tao", "tao", 5]
  ];
  var defs = gifts.map(function (g) { return [g[0], function () { adminGive(g[1], g[2]); }]; });
  adminButtons(p, defs);

  sheetAddHeading(p, "medallions");
  var medalStatus = adminStatus(p);
  adminButtons(p, [
    ["give gold", function () { adminGiveMedallion(1, medalStatus); }],
    ["give silver", function () { adminGiveMedallion(2, medalStatus); }],
    ["give bronze", function () { adminGiveMedallion(3, medalStatus); }]
  ]);
  var medalBox = adminMake("div");
  p.appendChild(medalBox);

  sheetAddHeading(p, "leaderboards");
  var status = adminStatus(p);
  adminButtons(p, [
    ["sync scores from saves", function () { adminSyncScores(status); }],
    ["kick off leaderboards", function () {
      if (!adminTarget) { status.textContent = "select a player first"; return; }
      adminKickPlayer(adminTarget.uid, adminTarget.name, status);
    }],
    ["restore", function () {
      if (!adminTarget) { status.textContent = "select a player first"; return; }
      adminRestorePlayer(adminTarget.uid, adminTarget.name, status);
    }]
  ]);

  adminPanels.players.targetLine = targetLine;
  adminPanels.players.search = search;
  adminPanels.players.results = results;
  adminPanels.players.status = status;
  adminPanels.players.medalStatus = medalStatus;
  adminPanels.players.medalBox = medalBox;
}

// ---------------- tab "weekly" ----------------

function adminAwardMedallions(weekIndex, top, statusNode) {
  var weekId = weekIdFor(weekIndex);
  var names = top.map(function (d, i) { return MEDALLION_NAMES[i + 1] + ": " + d.name + " (" + fmtInt(d.score) + ")"; }).join("\n");
  if (!window.confirm("Award medallions for the " + medallionWeekLabel(weekIndex) + "?\n\n" + names + "\n\nCheck the board for cheaters first.")) return;
  var batch = db.batch();
  top.forEach(function (d, i) {
    batch.set(db.collection("medallions").doc(weekId + "_" + (i + 1)), {
      weekId: weekId, weekIndex: weekIndex, rank: i + 1, medal: MEDALLION_NAMES[i + 1],
      uid: d.uid, name: d.name, score: d.score, karma: d.karma || 0,
      awardedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  batch.commit().then(adminRenderWeek).catch(function (err) {
    console.error(err);
    statusNode.textContent = "couldn't award -- check the Firestore rules for 'medallions'";
  });
}

function adminRevokeMedallions(weekIndex, statusNode) {
  if (!window.confirm("Delete all three medallions for the " + medallionWeekLabel(weekIndex) + "? You can award them again afterwards.")) return;
  var weekId = weekIdFor(weekIndex);
  var batch = db.batch();
  for (var r = 1; r <= 3; r++) batch.delete(db.collection("medallions").doc(weekId + "_" + r));
  batch.commit().then(adminRenderWeek).catch(function (err) {
    console.error(err);
    statusNode.textContent = "couldn't revoke -- check the Firestore rules for 'medallions'";
  });
}

function adminRenderWeek() {
  var token = ++adminWeekToken;
  var box = adminPanels.weekly.dynamic;
  box.innerHTML = "";
  var idx = currentWeekIndex() + adminWeekOffset;
  var weekId = weekIdFor(idx);

  var nav = adminMake("div", "admin-btns");
  var earlier = adminMake("button", "", "\u2190 earlier");
  earlier.addEventListener("click", function () { adminWeekOffset -= 1; adminRenderWeek(); });
  var later = adminMake("button", "", "later \u2192");
  later.disabled = adminWeekOffset >= 0;
  later.addEventListener("click", function () { adminWeekOffset += 1; adminRenderWeek(); });
  nav.appendChild(earlier);
  nav.appendChild(later);
  box.appendChild(nav);
  sheetAddHeading(box, medallionWeekLabel(idx) + (adminWeekOffset === 0 ? " (this week, still running)" : (adminWeekOffset === -1 ? " (last week)" : "")));
  var status = adminStatus(box);
  status.textContent = "loading\u2026";

  Promise.all([
    db.collection("weeks").doc(weekId).collection("scores").orderBy("score", "desc").limit(15).get(),
    db.collection("medallions").where("weekId", "==", weekId).get()
  ]).then(function (results) {
    if (token !== adminWeekToken) return;
    status.textContent = "";
    var scores = [];
    results[0].forEach(function (doc) { scores.push(doc.data()); });
    var awarded = [];
    results[1].forEach(function (doc) { awarded.push(doc.data()); });
    awarded.sort(function (a, b) { return a.rank - b.rank; });

    if (scores.length === 0) sheetAddText(box, "no scores that week");
    scores.forEach(function (d, i) {
      var row = adminMake("div", "row");
      row.appendChild(adminMake("span", "label", (i + 1) + ". " + d.name + (d.karma > 0 ? " \u00b7 karma " + d.karma : "")));
      row.appendChild(adminMake("span", "value", fmtInt(d.score)));
      box.appendChild(row);
      adminButtons(box, [
        ["profile", function () { if (typeof openProfile === "function") openProfile(d.uid, d); }],
        ["select", function () { adminSelectTarget(d.uid, d.name); status.textContent = d.name + " selected (see the players tab)"; }],
        ["remove entry", function () {
          if (!window.confirm("Remove " + d.name + "'s entry from this week's board?")) return;
          db.collection("weeks").doc(weekId).collection("scores").doc(d.uid).delete().then(adminRenderWeek).catch(function (err) {
            console.error(err);
            status.textContent = "couldn't remove -- check the Firestore rules for 'weeks'";
          });
        }],
        ["kick", function () { adminKickPlayer(d.uid, d.name, status, adminRenderWeek); }]
      ]);
    });

    sheetAddHeading(box, "medallions");
    if (awarded.length > 0) {
      sheetAddText(box, "awarded: " + awarded.map(function (m) { return m.medal + " \u2013 " + m.name; }).join(" \u00b7 "));
      adminButtons(box, [["revoke medallions", function () { adminRevokeMedallions(idx, status); }]]);
    } else if (adminWeekOffset >= 0) {
      sheetAddText(box, "this week is still running. Medallions can be awarded once it ends.");
    } else if (scores.length === 0) {
      sheetAddText(box, "nothing to award.");
    } else {
      sheetAddText(box, "not awarded yet. The top " + Math.min(3, scores.length) + " would get medallions. Remove any cheaters first.");
      adminButtons(box, [["award medallions", function () { adminAwardMedallions(idx, scores.slice(0, 3), status); }]]);
    }
  }).catch(function (err) {
    if (token !== adminWeekToken) return;
    console.error(err);
    status.textContent = "couldn't load that week -- check the Firestore rules";
  });
}

function buildWeeklyPanel(p) {
  var dynamic = adminMake("div");
  p.appendChild(dynamic);
  adminPanels.weekly.dynamic = dynamic;
}

// ---------------- tab "news" ----------------

function adminRenderNewsList() {
  var list = adminPanels.news.list;
  list.innerHTML = "";
  if (adminNewsDraft.length === 0) sheetAddText(list, "no headlines -- the ticker stays hidden until there is at least one");
  adminNewsDraft.forEach(function (text, i) {
    var row = adminMake("div", "admin-news-row", text);
    list.appendChild(row);
    adminButtons(list, [
      ["up", function () { if (i > 0) { adminNewsDraft.splice(i - 1, 0, adminNewsDraft.splice(i, 1)[0]); adminRenderNewsList(); } }],
      ["down", function () { if (i < adminNewsDraft.length - 1) { adminNewsDraft.splice(i + 1, 0, adminNewsDraft.splice(i, 1)[0]); adminRenderNewsList(); } }],
      ["remove", function () { adminNewsDraft.splice(i, 1); adminRenderNewsList(); }]
    ]);
  });
}

function adminLoadNews() {
  db.collection("config").doc("news").get().then(function (doc) {
    adminNewsDraft = doc.exists && Array.isArray(doc.data().headlines) ? doc.data().headlines.slice() : [];
    adminRenderNewsList();
  }).catch(function () { adminRenderNewsList(); });
}

function buildNewsPanel(p) {
  sheetAddText(p, "These scroll in a small ticker across the top of the page for logged-in players who have unlocked the skyline. Add headlines, then publish.");
  sheetAddHeading(p, "headlines");
  var list = adminMake("div");
  p.appendChild(list);
  var input = adminTextInput("write a headline", 280);
  p.appendChild(input);
  var status = adminStatus(p);

  function addHeadline() {
    var text = input.value.trim();
    if (!text) return;
    adminNewsDraft.push(text);
    input.value = "";
    status.textContent = "";
    adminRenderNewsList();
  }
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") addHeadline(); });

  adminButtons(p, [
    ["add headline", addHeadline],
    ["publish", function () {
      db.collection("config").doc("news").set({
        headlines: adminNewsDraft, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () {
        status.textContent = "published. Players see it within a few minutes (you see it too once you have the skyline).";
        if (typeof newsFetch === "function") newsFetch();
      }).catch(function (err) {
        console.error(err);
        status.textContent = "couldn't publish -- check the Firestore rules for 'config'";
      });
    }],
    ["clear all", function () { adminNewsDraft = []; adminRenderNewsList(); }]
  ]);

  adminPanels.news.list = list;
}

// ---------------- the overlay ----------------

function adminShowTab(name) {
  for (var key in adminPanels) {
    adminPanels[key].root.style.display = key === name ? "" : "none";
    adminTabButtons[key].classList.toggle("lb-tab-active", key === name);
  }
  if (name === "weekly") adminRenderWeek();
  if (name === "news") adminLoadNews();
  if (name === "me") adminRefreshValues();
}

function adminBuild() {
  if (adminBuilt) return;
  adminBuilt = true;
  var body = el.adminBody;
  body.innerHTML = "";

  var tabs = adminMake("div", "admin-btns");
  body.appendChild(tabs);
  ADMIN_TABS.forEach(function (t) {
    var b = adminMake("button", "", t[1]);
    b.addEventListener("click", function () { adminShowTab(t[0]); });
    tabs.appendChild(b);
    adminTabButtons[t[0]] = b;
    var root = adminMake("div");
    body.appendChild(root);
    adminPanels[t[0]] = { root: root };
  });

  buildMePanel(adminPanels.me.root);
  buildPlayersPanel(adminPanels.players.root);
  buildWeeklyPanel(adminPanels.weekly.root);
  buildNewsPanel(adminPanels.news.root);
}

function adminOpen() {
  if (!adminAllowed()) return;
  adminBuild();
  el.adminOverlay.style.display = "flex";
  adminShowTab("me");
  clearInterval(adminRefreshTimer);
  adminRefreshTimer = setInterval(adminRefreshValues, 500);
}

function adminClose() {
  el.adminOverlay.style.display = "none";
  clearInterval(adminRefreshTimer);
  adminRefreshTimer = null;
}

el.btnAdmin.addEventListener("click", adminOpen);
el.btnAdminClose.addEventListener("click", adminClose);
el.adminOverlay.addEventListener("click", function (e) { if (e.target === el.adminOverlay) adminClose(); });
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && el.adminOverlay.style.display === "flex") adminClose();
});
