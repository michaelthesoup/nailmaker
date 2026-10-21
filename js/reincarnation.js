"use strict";

// ----------------------------------------------------------------
// Reincarnation. Ending a life is a choice between two paths:
//  - Suicide (the "end run" button, in actions.js): karma resets to
//    zero. A true dead end -- you start over exactly like a brand new
//    player, no benefit at all, just a score on the leaderboard.
//  - Reincarnation (this file): your total karma decides how good
//    your next life's starting position is. The ritual is the same
//    flickering wall of characters either way -- almost all noise,
//    resolving into your fate once it settles.
//
// Being reborn means choosing a land (regions.js), then starting a fresh map 1
// (karma only adds deposits to it) and a small established business whose
// opening price is matched to the market and the land so it actually runs.
// The main parts of the game are already unlocked (the monastery still needs
// 3 tao, see monastery.js). The reveal shows the land map first, then the
// rest of your new life once a land is chosen, before you commit.
// ----------------------------------------------------------------

var RC_GRID_ROWS = 16;
var RC_GRID_COLS = 24;
var RC_DECOY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
var RC_FLICKER_INTERVAL_MS = 150;
var RC_FLICKER_FRACTION = 0.15; // fraction of cells re-randomized per tick
var RC_REVEAL_START_DELAY_MS = 120;
var RC_REVEAL_SPEEDUP = 0.92;
var RC_REVEAL_MIN_DELAY_MS = 4;
var RC_SUSPENSE_MS = 2200; // how long the noise flickers before resolving into your fate
var RC_BLOCK_STAGGER_SEC = 0.85; // gap between report sections fading in

var rc = null; // active ritual state while the overlay is open

// ---------------- the new world ----------------

// The highest price at which public demand still absorbs everything the
// starting nail makers produce. Without this you are reborn into a
// workshop at the first-life price of $0.08 with demand nowhere near
// matching your machines. (Same maths as publicDemandPD/avgNailsSoldPerSec,
// evaluated for the new life's tao and marketing.)
function rebirthDemandAt(price, marketingLevel, tao, regionId) {
  var mult = Math.pow(MARKETING_LEVEL_MULT, marketingLevel) * (1 + Math.max(0, tao) * YINYANG_PD_BONUS_PER_LEVEL) * regionMult("demandMult", regionId);
  var pd = mult * Math.pow(0.8 / price, PRICE_DEMAND_SENSITIVITY);
  return { pd: pd, sold: Math.min(1, pd / 100) * 7 * Math.pow(pd, DEMAND_CURVE_EXPONENT) };
}

function rebirthMatchedPrice(makers, marketingLevel, tao, regionId) {
  if (makers <= 0) return PRICE_MAX;
  var production = makers * NAILMAKER_RATE * (1 + Math.max(0, tao) * TAO_RATE_BONUS_PER_POINT);
  var lo = PRICE_MIN, hi = 10;
  if (rebirthDemandAt(lo, marketingLevel, tao, regionId).sold < production) return PRICE_MIN; // can't keep up even at the floor
  for (var i = 0; i < 50; i++) {
    var mid = (lo + hi) / 2;
    if (rebirthDemandAt(mid, marketingLevel, tao, regionId).sold >= production) lo = mid; else hi = mid;
  }
  return Math.max(PRICE_MIN, Math.floor(lo * 100) / 100);
}

// Builds the new life's world for a rolled result: breakers sized to feed the
// granted makers on a fresh map 1 (karma only adds deposits), and the opening
// market, for the chosen land (regionId). Called with state.karma already raised to the new total.
function planWorld(result, taoAward, granted, regionId) {
  var mult = 1 + taoAward * TAO_RATE_BONUS_PER_POINT; // mirrors productionRateBonusMultiplier() for the tao the NEW life starts with
  var makerRate = NAILMAKER_RATE * mult;
  var breakerRate = BREAKER_INTAKE_RATE * mult * regionMult("breakerSpeed", regionId);
  var ironDemand = granted.nailMakers * makerRate * IRON_PER_NAIL;

  var mapIndex = 1;
  var tiles = generateMapTiles(mapIndex, regionId);
  var ironTiles = 0, copperTiles = 0;
  for (var r = 0; r < MAP_ROWS; r++) for (var c = 0; c < MAP_COLS; c++) {
    if (tiles[r][c].remaining > 0) { if (tiles[r][c].type === "i") ironTiles++; else copperTiles++; }
  }
  // Breakers exist to feed the makers: none if there are no makers.
  var breakers = granted.nailMakers > 0
    ? Math.max(1, Math.round(ironDemand / (breakerRate * Math.max(1, ironTiles))))
    : 0;

  var capacity = depositCapacityForMap(mapIndex);
  var totalOre = mapRemainingWeight(tiles);
  var clearSec = breakers > 0 ? capacity / (breakers * breakerRate) : 0;

  var startPrice = rebirthMatchedPrice(granted.nailMakers, granted.marketingLevel, taoAward, regionId);
  var demand = rebirthDemandAt(startPrice, granted.marketingLevel, taoAward, regionId);
  var production = granted.nailMakers * makerRate;

  return {
    mapIndex: mapIndex, tiles: tiles,
    deposits: ironTiles + copperTiles, ironTiles: ironTiles, copperTiles: copperTiles,
    capacity: capacity, totalOre: totalOre, clearSec: clearSec,
    breakers: breakers,
    startPrice: startPrice, demandPct: Math.round(demand.pd),
    soldPerSec: Math.min(demand.sold, production),
    revenuePerSec: Math.min(demand.sold, production) * startPrice * regionMult("saleMult", regionId),
    production: production
  };
}

function worldSummaryRows(w) {
  var rows = [
    ["deposits", w.deposits + " (" + w.ironTiles + " iron \u00b7 " + w.copperTiles + " copper)"],
    ["size of each deposit", fmtWeight(w.capacity)],
    ["ore in the ground", fmtWeight(w.totalOre)]
  ];
  if (w.breakers > 0) rows.push(["your breakers clear it in about", fmtDuration(w.clearSec)]);
  return rows;
}

function marketSummaryRows(w) {
  var rows = [["opening price", fmtMoney(w.startPrice)]];
  if (w.production > 0) {
    rows.push(["demand", w.demandPct + "%"]);
    rows.push(["selling", fmtDecimal(w.soldPerSec) + " nails/s"]);
    rows.push(["revenue", fmtMoney(w.revenuePerSec) + "/s"]);
  }
  return rows;
}

// ---------------- starting the ritual ----------------

// How much karma the reincarnation in progress really adds: the tao earned, held to the karma cap.
var reincarnationKarmaGain = 0;

function startReincarnation() {
  var karmaAvailable = Math.floor(state.tao / KARMA_TAO_THRESHOLD);
  if (karmaAvailable < 1) return;

  var karmaGain = Math.min(karmaAvailable, Math.max(0, KARMA_CAP - state.karma));
  var newTotalKarma = state.karma + karmaGain;
  var confirmed = window.confirm(
    "Be reincarnated?\n\n" +
    (karmaGain > 0 ? "You'll gain " + karmaGain + " karma (" + newTotalKarma + " total, forever). " : "Your karma is already at its cap of " + KARMA_CAP + ", so this adds none. ") +
    "This life ends and you are reborn in a land of your choosing, on a fresh map (karma adds more deposits to it), with the game's main parts already unlocked and a head start that grows with karma. " +
    "Every starting bonus is rolled independently and nothing is guaranteed.\n\n" +
    "This can't be undone."
  );
  if (!confirmed) return;

  reincarnationKarmaGain = karmaGain;
  state.karma = newTotalKarma;
  runReincarnationRitual(rollStartingBonuses(newTotalKarma));
}

function runReincarnationRitual(result) {
  var scratch = defaultState();
  var before = {
    funds: scratch.funds, ironAmt: scratch.ironAmt, copperAmt: scratch.copperAmt,
    nailMakers: scratch.nailMakers, marketingLevel: scratch.marketingLevel, factories: scratch.factories
  };
  scratch.funds += result.granted.funds;
  scratch.ironAmt += result.granted.ironAmt;
  scratch.copperAmt += result.granted.copperAmt;
  scratch.nailMakers += result.granted.nailMakers;
  scratch.marketingLevel = clampMarketingLevel(scratch.marketingLevel + result.granted.marketingLevel);
  scratch.factories += result.granted.factories;
  var granted = {
    funds: Math.round((scratch.funds - before.funds) * 100) / 100,
    ironAmt: Math.round(scratch.ironAmt - before.ironAmt),
    copperAmt: Math.round(scratch.copperAmt - before.copperAmt),
    nailMakers: Math.round(scratch.nailMakers - before.nailMakers),
    marketingLevel: Math.round(scratch.marketingLevel - before.marketingLevel),
    factories: Math.round(scratch.factories - before.factories)
  };

  var taoAward = reincarnationTaoAward(result, state.karma);
  granted.breakers = 0; // sized once a land is chosen (rcChooseRegion), since the land changes the map and the breakers

  rc = {
    result: result,
    title: result.title,
    granted: granted,
    taoAward: taoAward,
    region: "",
    world: null,
    newMapIndex: 1,
    newMapTiles: null,
    cells: [],
    flickerTimer: null
  };

  buildGridNoise();
  el.reincarnateGrid.classList.remove("rc-resolved");
  el.reincarnateGrid.innerHTML = "";
  el.reincarnateStatus.textContent = "";
  el.btnReincarnateConfirm.style.display = "none";
  el.reincarnateOverlay.style.display = "flex";
  el.reincarnateOverlay.scrollTop = 0;

  revealGrid(0);
}

function buildGridNoise() {
  var totalCells = RC_GRID_ROWS * RC_GRID_COLS;
  var chars = new Array(totalCells);
  var offset = Math.floor(Math.random() * RC_DECOY_CHARS.length);
  for (var i = 0; i < totalCells; i++) {
    chars[i] = decoyCharAt(i + offset);
  }
  rc.chars = chars;
  rc.flickerStep = 0;
}

function decoyCharAt(index) {
  return RC_DECOY_CHARS.charAt(index % RC_DECOY_CHARS.length);
}

// Reveals cells one at a time, left to right, top to bottom, speeding
// up as it goes. Once the whole grid is in, it flickers a while for
// suspense, then resolves into a message revealing your next life.
function revealGrid(index) {
  var totalCells = RC_GRID_ROWS * RC_GRID_COLS;
  if (index >= totalCells) {
    startFlicker();
    setTimeout(resolveRitual, RC_SUSPENSE_MS);
    return;
  }

  var span = document.createElement("span");
  span.className = "rc-cell";
  span.textContent = rc.chars[index];
  el.reincarnateGrid.appendChild(span);
  rc.cells.push(span);

  if ((index + 1) % RC_GRID_COLS === 0) {
    el.reincarnateGrid.appendChild(document.createElement("br"));
  }

  var delay = Math.max(RC_REVEAL_MIN_DELAY_MS, RC_REVEAL_START_DELAY_MS * Math.pow(RC_REVEAL_SPEEDUP, index));
  setTimeout(function () { revealGrid(index + 1); }, delay);
}

function startFlicker() {
  rc.flickerTimer = setInterval(function () {
    rc.flickerStep += 1;
    for (var i = 0; i < rc.cells.length; i++) {
      if (Math.random() < RC_FLICKER_FRACTION) {
        rc.cells[i].textContent = decoyCharAt(i + rc.flickerStep);
      }
    }
  }, RC_FLICKER_INTERVAL_MS);
}

// ---------------- the reveal ----------------

// Adds one fading-in section to the report; sections appear one after another.
function rcAddBlock(parent, className, index) {
  var div = document.createElement("div");
  div.className = "rc-block " + className;
  div.style.animationDelay = (index * RC_BLOCK_STAGGER_SEC) + "s";
  parent.appendChild(div);
  return div;
}

// The noise settles into the title of your next life and the map of lands to choose from.
function resolveRitual() {
  clearInterval(rc.flickerTimer);
  var grid = el.reincarnateGrid;
  grid.innerHTML = "";
  grid.classList.add("rc-resolved");

  var title = rc.title, u = rc.world, g = rc.granted;
  var n = 0;

  var head = rcAddBlock(grid, "", n++);
  var heading = document.createElement("div");
  heading.style.fontWeight = "bold";
  heading.style.fontSize = title.isNirvana ? "28px" : "18px";
  heading.style.letterSpacing = "1px";
  heading.textContent = title.isNirvana ? "NIRVANA" : "your next life begins with " + title.label;
  head.appendChild(heading);

  var land = rcAddBlock(grid, "rc-card", n++);
  sheetAddHeading(land, "choose your land");
  var mapBox = document.createElement("div");
  land.appendChild(mapBox);
  rc.landInfo = document.createElement("div");
  land.appendChild(rc.landInfo);
  rc.grid = grid;
  rc.mapApi = buildRegionMap(mapBox, rcChooseRegion);
}

// Picking a land sizes the rest of the new life for it (map, breakers, opening price) and shows
// it. The first pick fades the rest of the report in; later picks just rewrite it. The begin
// button only appears once a land is chosen.
function rcChooseRegion(id) {
  if (!rc || !regionById(id)) return;
  var first = !rc.region;
  rc.region = id;
  rc.mapApi.select(id);

  var region = regionById(id);
  rc.landInfo.innerHTML = "";
  var nameLine = document.createElement("div");
  nameLine.style.fontWeight = "bold";
  nameLine.style.marginTop = "6px";
  nameLine.textContent = region.name;
  rc.landInfo.appendChild(nameLine);
  var lines = regionEffectLines(region);
  lines.forEach(function (line) {
    var d = document.createElement("div");
    d.textContent = (line[1] ? "+ " : "\u2212 ") + line[0];
    rc.landInfo.appendChild(d);
  });
  if (lines.length === 0) {
    var none = document.createElement("div");
    none.textContent = "no bonuses";
    rc.landInfo.appendChild(none);
  }

  rc.world = planWorld(rc.result, rc.taoAward, rc.granted, id);
  rc.granted.breakers = rc.world.breakers;
  rc.newMapIndex = rc.world.mapIndex;
  rc.newMapTiles = rc.world.tiles;

  if (first) {
    rc.bizBox = rcAddBlock(rc.grid, "rc-card", 0);
    rc.mktBox = rcAddBlock(rc.grid, "rc-card", 1);
    rc.codesBox = rcAddBlock(rc.grid, "rc-codes", 2);
  }
  rcRenderDependent();

  if (first) {
    rc.revealTimer = setTimeout(function () {
      el.reincarnateStatus.textContent = "";
      el.btnReincarnateConfirm.style.display = "inline-block";
      el.reincarnateOverlay.scrollTop = el.reincarnateOverlay.scrollHeight;
    }, 3 * RC_BLOCK_STAGGER_SEC * 1000 + 300);
  }
}

// The parts of the report that depend on the land: your business and the market.
function rcRenderDependent() {
  var g = rc.granted, u = rc.world;

  rc.bizBox.innerHTML = "";
  sheetAddHeading(rc.bizBox, "your business");
  var rows = [];
  if (g.nailMakers) rows.push(["nail makers", "+" + g.nailMakers]);
  if (g.breakers) rows.push(["nail breakers", "+" + g.breakers + " (sized to feed your makers)"]);
  if (g.factories) rows.push(["factories", "+" + g.factories]);
  if (g.marketingLevel) rows.push(["marketing", "+" + g.marketingLevel]);
  if (g.funds) rows.push(["starting funds", "+" + fmtMoney(g.funds)]);
  if (g.ironAmt) rows.push(["iron", "+" + fmtWeight(g.ironAmt)]);
  if (g.copperAmt) rows.push(["copper", "+" + fmtWeight(g.copperAmt)]);
  rows.push(["tao", rc.taoAward ? "+" + rc.taoAward : "none this life"]);
  sheetAddRows(rc.bizBox, rows);
  if (rows.length === 1) sheetAddText(rc.bizBox, "Nothing but your hands this time. The ground is yours again, with more deposits than before.");

  rc.mktBox.innerHTML = "";
  sheetAddHeading(rc.mktBox, "the market");
  sheetAddRows(rc.mktBox, marketSummaryRows(u));
  if (g.nailMakers > 0) sheetAddText(rc.mktBox, "Priced so public demand just absorbs what your makers produce. Raise it for more per nail, lower it to sell faster.");

  rc.codesBox.textContent = buildGrantedCodeSummary(g);
}

function buildGrantedCodeSummary(granted) {
  var parts = [];
  if (granted.funds) parts.push("$" + (granted.funds > 0 ? "+" : "") + granted.funds);
  if (granted.ironAmt) parts.push("ir" + (granted.ironAmt > 0 ? "+" : "") + granted.ironAmt);
  if (granted.copperAmt) parts.push("cu" + (granted.copperAmt > 0 ? "+" : "") + granted.copperAmt);
  if (granted.nailMakers) parts.push("nm" + (granted.nailMakers > 0 ? "+" : "") + granted.nailMakers);
  if (granted.breakers) parts.push("br" + (granted.breakers > 0 ? "+" : "") + granted.breakers);
  if (granted.marketingLevel) parts.push("mk" + (granted.marketingLevel > 0 ? "+" : "") + granted.marketingLevel);
  if (granted.factories) parts.push("fc" + (granted.factories > 0 ? "+" : "") + granted.factories);
  return parts.length ? parts.join("  ") : "nothing this time";
}

function buildGrantedText(granted) {
  var parts = [];
  if (granted.funds) parts.push("+" + fmtMoney(granted.funds) + " starting funds");
  if (granted.ironAmt) parts.push("+" + fmtWeight(granted.ironAmt) + " iron");
  if (granted.copperAmt) parts.push("+" + fmtWeight(granted.copperAmt) + " copper");
  if (granted.marketingLevel) parts.push("+" + granted.marketingLevel + " marketing");
  if (granted.nailMakers) parts.push("+" + granted.nailMakers + " nail makers");
  if (granted.breakers) parts.push("+" + granted.breakers + " nail breakers");
  if (granted.factories) parts.push("+" + granted.factories + " factories");
  return parts.length ? parts.join("  |  ") : "no starting bonuses";
}

el.btnReincarnate.addEventListener("click", startReincarnation);

el.btnReincarnateConfirm.addEventListener("click", function () {
  var ritual = rc;
  if (!ritual || !ritual.region) return; // a land has to be chosen first
  rc = null;
  el.reincarnateOverlay.style.display = "none";

  var user = currentAuthUser();
  var name = user ? (user.displayName || "player") : "anonymous"; // only logged-in players post scores
  // state.karma already includes the karma this life just earned; the weekly board shows the karma it STARTED with.
  var karmaAtStart = state.karma - reincarnationKarmaGain;
  submitScore(name, Math.floor(state.totalNailsMade), { karma: karmaAtStart, timeSec: state.simTime });

  var karmaCarried = state.karma;
  var nirvanaCarried = state.nirvanaAchieved || !!ritual.title.isNirvana;
  var guideSeenCarried = state.guideSeen;
  var floorUnlockedCarried = state.unlockedFloor; // modules themselves reset each life; the button stays
  var autoNextMapCarried = state.autoNextMap; // a preference toggle, unrelated to which map is loaded
  var yinYangCarried = {
    yin: state.yin,
    yang: state.yang
  };

  var justReachedNirvana = ritual.title.isNirvana && !state.nirvanaAchieved;

  // Log the life that's ending (karma was already added in startReincarnation).
  var karmaGained = reincarnationKarmaGain;
  var endedLife = buildLifeRecord({
    how: "reincarnated",
    karmaGained: karmaGained,
    karmaTotal: state.karma,
    title: ritual.title.label,
    nirvana: !!ritual.title.isNirvana
  });
  var pastLivesCarried = (state.pastLives || []).concat([endedLife]).slice(-PAST_LIVES_MAX);
  recordLifeEnd(endedLife, "reincarnated", null, endedLife.karmaTotal);

  deleteAllSaves();
  state = defaultState();
  state.region = ritual.region; // the land chosen in the ritual (regions.js)
  state.pastLives = pastLivesCarried;
  state.karma = karmaCarried;
  state.nirvanaAchieved = nirvanaCarried;
  // The main parts of the game are available from the first second of a new life.
  // The monastery is NOT in this list: it unlocks the usual way (a reincarnation AND 3 tao).
  state.unlockedMap = true;
  state.unlockedMachinery = true;
  state.unlockedFactorySquared = true;
  state.unlockedYinYang = true;
  state.unlockedSwarm = true;
  state.unlockedCity = true;
  state.guideSeen = guideSeenCarried;
  state.unlockedFloor = floorUnlockedCarried;
  state.mapIndex = ritual.newMapIndex;
  state.mapTiles = ritual.newMapTiles;
  state.mapTotalWeight = mapRemainingWeight(ritual.newMapTiles);
  state.autoNextMap = autoNextMapCarried;
  state.yin = yinYangCarried.yin;
  state.yang = yinYangCarried.yang;
  state.tao = ritual.taoAward;
  state.price = ritual.world.startPrice; // matched to the starting machines, not the first-life $0.08

  state.funds += ritual.granted.funds;
  state.ironAmt += ritual.granted.ironAmt;
  state.copperAmt += ritual.granted.copperAmt;
  state.nailMakers += ritual.granted.nailMakers;
  state.breakers += ritual.granted.breakers;
  state.marketingLevel = clampMarketingLevel(state.marketingLevel + ritual.granted.marketingLevel);
  state.factories += ritual.granted.factories;

  render();
  if (typeof currentAuthUser === "function" && currentAuthUser()) cloudSaveState();

  // The end screen replaces the old NIRVANA alert (it carries the same message).
  showEndScreen({
    kind: "reincarnated",
    life: endedLife,
    allLives: pastLivesCarried,
    ritual: ritual,
    nirvanaJustReached: justReachedNirvana
  });
});
