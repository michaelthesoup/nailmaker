"use strict";

// ----------------------------------------------------------------
// Achievements + the "stats & achievements" screen. Unlocks are stored
// in the lifetime record (lifetime.js), so they survive ending a run.
// Each test gets (state, lt): the live game state and the lifetime
// totals INCLUDING the life in progress.
// ----------------------------------------------------------------

var ACHIEVEMENTS = [
  { id: "hundred",     name: "Hammer and Iron",       desc: "Make 100 nails in one life.",                       test: function (s, lt) { return s.totalNailsMade >= 100; } },
  { id: "breaker",     name: "Into the Ground",       desc: "Own a nail breaker.",                               test: function (s) { return s.breakers >= 1; } },
  { id: "marketer",    name: "Brand Awareness",       desc: "Reach marketing level 10.",                         test: function (s) { return s.marketingLevel >= 10; } },
  { id: "factory",     name: "Assembly Line",         desc: "Own a factory.",                                    test: function (s) { return s.factories >= 1; } },
  { id: "map10",       name: "Deep Prospector",       desc: "Reach map 10.",                                     test: function (s, lt) { return lt.deepestMap >= 10; } },
  { id: "million",     name: "Million Nail Club",     desc: "Make 1 million nails in one life.",                 test: function (s, lt) { return lt.bestLifeNails >= 1e6; } },
  { id: "factory2",    name: "Factory of Factories",  desc: "Own a factory\u00b2.",                              test: function (s) { return s.factorySquared >= 1; } },
  { id: "billion",     name: "Billion Nail Club",     desc: "Make 1 billion nails in one life.",                 test: function (s, lt) { return lt.bestLifeNails >= 1e9; } },
  { id: "yinyang",     name: "Yin Meets Yang",        desc: "Unlock yin & yang.",                                test: function (s) { return !!s.unlockedYinYang; } },
  { id: "tao",         name: "The Way",               desc: "Hold 1 tao.",                                       test: function (s, lt) { return lt.highestTao >= 1; } },
  { id: "swarm",       name: "The Foundry Swarm",     desc: "Unlock the foundry swarm.",                         test: function (s) { return !!s.unlockedSwarm; } },
  { id: "collapse",    name: "Unstable",              desc: "Collapse the swarm and bank an unstable core.",     test: function (s, lt) { return lt.swarmCollapses >= 1; } },
  { id: "bomb",        name: "Nailbomb",              desc: "Drop a nailbomb.",                                  test: function (s, lt) { return lt.nailbombs >= 1; } },
  { id: "bombs5",      name: "Scorched Earth",        desc: "Drop 5 nailbombs in one life.",                     test: function (s, lt) { return lt.mostBombsInLife >= 5; } },
  { id: "hole",        name: "Karmic Debt",           desc: "Let your tao fall below zero.",                     test: function (s) { return s.tao < 0; } },
  { id: "reborn",      name: "Reborn",                desc: "Reincarnate for the first time.",                   test: function (s, lt) { return lt.reincarnations >= 1; } },
  { id: "lives5",      name: "Many Lives",            desc: "Finish 5 lives.",                                   test: function (s, lt) { return lt.livesLived >= 5; } },
  { id: "karma10",     name: "Old Soul",              desc: "Reach 10 total karma.",                             test: function (s, lt) { return lt.highestKarma >= 10; } },
  { id: "hour",        name: "Patience",              desc: "Play for a total of one hour.",                     test: function (s, lt) { return lt.totalTimeSec >= 3600; } },
  { id: "endrun",      name: "Full Stop",             desc: "End a run.",                                        test: function (s, lt) { return lt.runsEnded >= 1; } },
  { id: "nirvana",     name: "Nirvana",               desc: "Reach Nirvana.",                                    test: function (s, lt) { return !!s.nirvanaAchieved || lt.nirvanaLives >= 1; } }
];

// ---------------- toast ----------------

var achievementToastQueue = [];
var achievementToastShowing = false;
var achievementToastEl = document.createElement("div");
achievementToastEl.className = "achievement-toast";
achievementToastEl.style.display = "none";
document.body.appendChild(achievementToastEl);

function showNextAchievementToast() {
  if (achievementToastShowing || achievementToastQueue.length === 0) return;
  achievementToastShowing = true;
  var a = achievementToastQueue.shift();
  achievementToastEl.textContent = "achievement unlocked: " + a.name;
  achievementToastEl.style.display = "block";
  setTimeout(function () {
    achievementToastEl.style.display = "none";
    achievementToastShowing = false;
    setTimeout(showNextAchievementToast, 250);
  }, 3500);
}

// ---------------- checking ----------------

function achievementCount() {
  return Object.keys(lifetime.achievements).length;
}

function updateAchievementButton() {
  if (el.btnStats) el.btnStats.textContent = "stats & achievements (" + achievementCount() + "/" + ACHIEVEMENTS.length + ")";
}

function checkAchievements() {
  var lt = null;
  var unlockedAny = false;
  for (var i = 0; i < ACHIEVEMENTS.length; i++) {
    var a = ACHIEVEMENTS[i];
    if (lifetime.achievements[a.id]) continue;
    if (!lt) lt = lifetimeWithCurrent();
    var ok = false;
    try { ok = a.test(state, lt); } catch (e) { ok = false; }
    if (ok) {
      lifetime.achievements[a.id] = Date.now();
      achievementToastQueue.push(a);
      unlockedAny = true;
    }
  }
  if (unlockedAny) {
    saveLifetime();
    updateAchievementButton();
    showNextAchievementToast();
    if (el.statsOverlay.style.display === "flex") renderStatsScreen();
  }
}

setInterval(checkAchievements, 1000);
updateAchievementButton();

// ---------------- stats & achievements screen ----------------

function fmtDate(ms) {
  var d = new Date(ms);
  return d.toLocaleDateString();
}

function renderStatsScreen() {
  var lt = lifetimeWithCurrent();
  var body = el.statsBody;
  body.innerHTML = "";

  sheetAddHeading(body, "lifetime stats (including the life you're in)");
  sheetAddRows(body, [
    ["first played", fmtDate(lt.firstPlayedAt)],
    ["runs ended", String(lt.runsEnded)],
    ["current run / life", "run " + lt.currentRun + " \u00b7 life " + lt.currentLifeInRun],
    ["reincarnations", String(lt.reincarnations)],
    ["total nails made", fmtInt(lt.totalNails)],
    ["best single life", fmtInt(lt.bestLifeNails)],
    ["best run (all its lives)", fmtInt(lt.bestRunNails)],
    ["longest run (lives)", String(lt.longestRunLives)],
    ["total time played", fmtDuration(lt.totalTimeSec)],
    ["money earned", fmtMoney(lt.totalEarned)],
    ["nailbombs dropped", String(lt.nailbombs)],
    ["most bombs in one life", String(lt.mostBombsInLife)],
    ["swarm collapses", String(lt.swarmCollapses)],
    ["highest karma", String(lt.highestKarma)],
    ["highest tao held", String(Math.floor(lt.highestTao))],
    ["most nail makers", fmtInt(lt.mostMakers)],
    ["most nail breakers", fmtInt(lt.mostBreakers)],
    ["most factories", fmtInt(lt.mostFactories)],
    ["deepest map", String(lt.deepestMap)],
    ["Nirvana reached", lt.nirvanaLives > 0 ? "yes" : "not yet"]
  ]);

  sheetAddHeading(body, "achievements (" + achievementCount() + " / " + ACHIEVEMENTS.length + ")");
  var list = document.createElement("div");
  for (var i = 0; i < ACHIEVEMENTS.length; i++) {
    var a = ACHIEVEMENTS[i];
    var when = lifetime.achievements[a.id];
    var row = document.createElement("div");
    row.className = "ach-row" + (when ? "" : " locked");
    var mark = document.createElement("span");
    mark.className = "ach-mark";
    mark.textContent = when ? "\u2714" : "\u25cb";
    var text = document.createElement("span");
    text.className = "ach-text";
    var nm = document.createElement("strong");
    nm.textContent = a.name;
    var ds = document.createElement("span");
    ds.textContent = " \u2014 " + a.desc;
    text.appendChild(nm);
    text.appendChild(ds);
    var date = document.createElement("span");
    date.className = "ach-date";
    date.textContent = when ? fmtDate(when) : "";
    row.appendChild(mark);
    row.appendChild(text);
    row.appendChild(date);
    list.appendChild(row);
  }
  body.appendChild(list);

  var user = currentAuthUser();
  sheetAddText(body, user
    ? "These stats are synced to your account."
    : "Log in to sync these stats to your account. Until then they are only saved in this browser.");
}

el.btnStats.addEventListener("click", function () {
  renderStatsScreen();
  el.statsOverlay.style.display = "flex";
  el.statsOverlay.firstElementChild.scrollTop = 0;
});

el.btnStatsClose.addEventListener("click", function () {
  el.statsOverlay.style.display = "none";
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") el.statsOverlay.style.display = "none";
});
