"use strict";

// ----------------------------------------------------------------
// Game loop
// ----------------------------------------------------------------

// How often breakers/selling settle scales with breaker count -- one
// breaker settles once a second, ten breakers settle ten times a
// second (each settling a tenth as much), same total output either
// way, just smoother to watch as it scales up. Floored so it never
// gets fast enough to cause real performance trouble.
var SETTLE_INTERVAL_FLOOR_SEC = 0.05; // never settle faster than 20x/sec

// What the nail makers REALLY make, as opposed to what they could make with
// unlimited iron. Production is already capped by the iron on hand (below), so
// when iron runs dry the makers only turn out what arrives; this smoothed
// measurement is what the screen shows in that case. Not saved.
var RATE_SMOOTH_SEC = 3;
var actualNailsPerSec = 0;

function recordNailRate(made, dt) {
  if (!(dt > 0)) return;
  var k = 1 - Math.exp(-dt / RATE_SMOOTH_SEC);
  actualNailsPerSec += (made / dt - actualNailsPerSec) * k;
}

// Same idea for factories: cycles actually completed per second (smoothed), used by factoryOutputRates()
// to show what is really being built once copper has run short. Not saved.
var actualFactoryCyclesPerSec = 0;

function recordFactoryRate(cycles, dt) {
  if (!(dt > 0)) return;
  var k = 1 - Math.exp(-dt / RATE_SMOOTH_SEC);
  actualFactoryCyclesPerSec += (cycles / dt - actualFactoryCyclesPerSec) * k;
}

// Factory-floor yield bonuses (floor.js) give a fraction of an extra machine per cycle;
// the fraction is carried between cycles in state[key] so nothing is lost to rounding.
// With no bonus this returns exactly n.
function yieldWhole(key, n, bonus) {
  state[key] = (state[key] || 0) + n * (1 + bonus);
  var whole = Math.floor(state[key] + 1e-9);
  state[key] -= whole;
  return whole;
}

function tick(dt, skipRender) {
  state.simTime += dt;
  cityTick(dt);
  if (typeof communityTick === "function") communityTick(dt);
  if (typeof companyTick === "function") companyTick(dt);
  if (typeof monasteryTick === "function") monasteryTick(dt);

  // Production: nail makers turn iron into unsold nails. The "nail
  // makers: ON/OFF" tuning toggle folds into nailMakerRateEffective().
  var wantToMake = state.nailMakers * nailMakerRateEffective() * dt;
  var ironAvailableAsNails = state.ironAmt / IRON_PER_NAIL;
  var actuallyMade = Math.min(wantToMake, ironAvailableAsNails);

  state.ironAmt -= actuallyMade * IRON_PER_NAIL;
  if (state.ironAmt < 0) state.ironAmt = 0; // iron can run out, never go below zero
  state.unsold += actuallyMade;
  state.totalNailsMade += actuallyMade;
  recordNailRate(actuallyMade, dt);

  // Breakers and selling settle in chunks rather than continuously --
  // that's what makes the sawtooth visible: unsold inventory climbs
  // smoothly every tick from production, then drops in a chunk each
  // time a settle fires, based on how many nails breakers burned as
  // ammo and how many the public bought.
  var settleInterval = Math.max(SETTLE_INTERVAL_FLOOR_SEC, 1 / Math.max(1, state.breakers));
  state.settleAccum += dt;
  while (state.settleAccum >= settleInterval) {
    state.settleAccum -= settleInterval;

    // Breakers get first claim on the inventory that's accumulated
    // this settle. Each nail hits every remaining deposit once, so
    // 10 iron deposits and 5 copper deposits return 10g iron and 5g
    // copper per nail.
    var breakerRate = breakerIntakeEffective();
    if (state.breakers > 0 && breakerRate > 0 && state.unsold > 0 && mapHasDeposits(state.mapTiles)) {
      var breakerResult = processBreakerNails(state.breakers * breakerRate * settleInterval);
      if (breakerResult.ironGot > 0) state.ironAmt += breakerResult.ironGot;
      if (breakerResult.copperGot > 0) state.copperAmt += breakerResult.copperGot;
    }

    // Selling, Universal-Paperclips style: a deterministic rate
    // derived from price and marketing. Steeply super-linear once
    // demand clears 100, which is what makes a sharp price cut
    // trigger a genuine mass sell-off rather than a gentle nudge.
    var soldPerSec = avgNailsSoldPerSec();
    if (soldPerSec > 0 && state.unsold > 0) {
      var sold = Math.min(state.unsold, soldPerSec * settleInterval);
      state.unsold -= sold;
      var revenue = sold * state.price * cardMult("saleMult"); // cards can pay more per nail
      state.funds += revenue;
      state.totalEarned += revenue;
    }
  }

  // Yin & Yang settles on its own cadence. Tao speed upgrades shorten the
  // interval while each settlement still advances a bar by one.
  state.yinYangAccum += dt;
  var yinYangInterval = yinYangTickInterval();
  while (state.yinYangAccum >= yinYangInterval) {
    state.yinYangAccum -= yinYangInterval;
    settleYinYang();
  }

  // Factories: the yin-yang engine. Production is one continuous stream:
  // N factories complete N cycles per second, so owning more factories
  // means machines arrive faster and faster instead of in one batch each
  // second. Each completed cycle costs copper and produces either a nail
  // maker or a nail breaker -- decided by a Bresenham-style accumulator so
  // the output ratio matches the balance slider exactly over time. Cycles
  // are banked (up to one per factory) while copper is short.
  if (state.factoriesOn && state.factories > 0) {
    var cycleCopperCost = factoryCopperCostEffective();
    var factorySpeed = typeof moduleSpeedMult === "function" ? moduleSpeedMult() : 1; // batteries (floor.js)
    state.factoryProgress = Math.min(state.factories * Math.max(1, factorySpeed), (state.factoryProgress || 0) + state.factories * factorySpeed * dt / FACTORY_PERIOD_SEC);
    var cycles = Math.floor(state.factoryProgress + 1e-9);
    if (cycles > 0 && cycleCopperCost > 0) cycles = Math.min(cycles, Math.floor(state.copperAmt / cycleCopperCost));
    recordFactoryRate(cycles, dt);
    if (cycles > 0) {
      state.copperAmt -= cycles * cycleCopperCost;
      state.factoryProgress -= cycles;

      var allocTotal = (state.factoryAllocAccum || 0) + cycles * (state.factoryBalance / 100);
      var madeMakers = Math.min(cycles, Math.floor(allocTotal + 1e-9));
      state.factoryAllocAccum = allocTotal - madeMakers;
      var modBonus = typeof moduleBonuses === "function" ? moduleBonuses() : null; // maker / breaker dies (floor.js)
      state.nailMakers += yieldWhole("yieldAccumMakers", madeMakers, modBonus ? modBonus.makerYield : 0);
      if (cycles - madeMakers > 0) {
        var gotBreakers = yieldWhole("yieldAccumBreakers", cycles - madeMakers, modBonus ? modBonus.breakerYield : 0);
        state.breakers += gotBreakers;
        if (gotBreakers > 0) state.unlockedMap = true;
      }
    }
  } else {
    state.factoryProgress = 0;
    recordFactoryRate(0, dt);
  }

  checkYinYangUnlock();

  if (!mapHasDeposits(state.mapTiles)) {
    goToNextMap(); // calls render() itself
    return;
  }

  if (!skipRender) render();
}

// Browsers throttle timers in background tabs (often to ~1 call/sec, or
// worse), so counting every timer call as exactly TICK_MS of game time made
// the game crawl whenever the tab wasn't focused. Instead we measure the
// real time that passed since the last call and simulate all of it, in
// steps no bigger than TICK_MS so factories/settling behave exactly as
// they do at normal speed. The cap stops a long sleep/suspend from
// stalling the page with an enormous catch-up.
var MAX_CATCHUP_SEC = 600;
var lastTickWallMs = Date.now();

function runElapsedTime() {
  var now = Date.now();
  var elapsed = (now - lastTickWallMs) / 1000;
  lastTickWallMs = now;
  if (!(elapsed > 0)) return;
  if (elapsed > MAX_CATCHUP_SEC) elapsed = MAX_CATCHUP_SEC;

  var step = TICK_MS / 1000;
  while (elapsed > 1e-9) {
    var dt = Math.min(step, elapsed);
    elapsed -= dt;
    tick(dt, elapsed > 1e-9); // only the last step of a batch needs to redraw
  }
}

setInterval(runElapsedTime, TICK_MS);

render();
renderLeaderboard();
