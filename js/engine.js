"use strict";

var SETTLE_INTERVAL_FLOOR_SEC = 0.05;

var RATE_SMOOTH_SEC = 3;
var actualNailsPerSec = 0;

function recordNailRate(made, dt) {
  if (!(dt > 0)) return;
  var k = 1 - Math.exp(-dt / RATE_SMOOTH_SEC);
  actualNailsPerSec += (made / dt - actualNailsPerSec) * k;
}

var actualFactoryCyclesPerSec = 0;

function recordFactoryRate(cycles, dt) {
  if (!(dt > 0)) return;
  var k = 1 - Math.exp(-dt / RATE_SMOOTH_SEC);
  actualFactoryCyclesPerSec += (cycles / dt - actualFactoryCyclesPerSec) * k;
}

function yieldWhole(key, n, bonus) {
  state[key] = (state[key] || 0) + n * (1 + bonus);
  var whole = Math.floor(state[key] + 1e-9);
  state[key] -= whole;
  return whole;
}

function tick(dt, skipRender) {
  state.simTime += dt;
  cityTick(dt);
  if (typeof resonanceTick === "function") resonanceTick(dt);

  var wantToMake = state.nailMakers * nailMakerRateEffective() * dt;
  var ironAvailableAsNails = state.ironAmt / IRON_PER_NAIL;
  var actuallyMade = Math.min(wantToMake, ironAvailableAsNails);

  state.ironAmt -= actuallyMade * IRON_PER_NAIL;
  if (state.ironAmt < 0) state.ironAmt = 0;
  state.unsold += actuallyMade;
  state.totalNailsMade += actuallyMade;
  recordNailRate(actuallyMade, dt);

  var settleInterval = Math.max(SETTLE_INTERVAL_FLOOR_SEC, 1 / Math.max(1, state.breakers));
  state.settleAccum += dt;
  while (state.settleAccum >= settleInterval) {
    state.settleAccum -= settleInterval;

    var breakerRate = breakerIntakeEffective();
    if (state.breakers > 0 && breakerRate > 0 && state.unsold > 0 && mapHasDeposits(state.mapTiles)) {
      var breakerResult = processBreakerNails(state.breakers * breakerRate * settleInterval);
      if (breakerResult.ironGot > 0) state.ironAmt += breakerResult.ironGot;
      if (breakerResult.copperGot > 0) state.copperAmt += breakerResult.copperGot;
    }

    var soldPerSec = avgNailsSoldPerSec();
    if (soldPerSec > 0 && state.unsold > 0) {
      var sold = Math.min(state.unsold, soldPerSec * settleInterval);
      state.unsold -= sold;
      var revenue = sold * state.price * cardMult("saleMult");
      state.funds += revenue;
      state.totalEarned += revenue;
    }
  }

  state.yinYangAccum += dt;
  var yinYangInterval = yinYangTickInterval();
  while (state.yinYangAccum >= yinYangInterval) {
    state.yinYangAccum -= yinYangInterval;
    settleYinYang();
  }

  if (state.factoriesOn && state.factories > 0) {
    var cycleCopperCost = factoryCopperCostEffective();
    var factorySpeed = typeof moduleSpeedMult === "function" ? moduleSpeedMult() : 1;
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
      var modBonus = typeof moduleBonuses === "function" ? moduleBonuses() : null;
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
    goToNextMap();
    return;
  }

  if (!skipRender) render();
}

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
    tick(dt, elapsed > 1e-9);
  }
}

setInterval(runElapsedTime, TICK_MS);

render();
renderLeaderboard();
