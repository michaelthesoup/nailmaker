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

function tick(dt) {
  state.simTime += dt;

  // Production: nail makers turn iron into unsold nails. The "nail
  // makers: ON/OFF" tuning toggle folds into nailMakerRateEffective().
  var wantToMake = state.nailMakers * nailMakerRateEffective() * dt;
  var ironAvailableAsNails = state.ironAmt / IRON_PER_NAIL;
  var actuallyMade = Math.min(wantToMake, ironAvailableAsNails);

  state.ironAmt -= actuallyMade * IRON_PER_NAIL;
  state.unsold += actuallyMade;
  state.totalNailsMade += actuallyMade;
  state.profitAccum += actuallyMade * IRON_PER_NAIL;

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
      state.funds += sold * state.price;
    }
  }

  // Yin & Yang settles on its own fixed one-second cadence, completely
  // independent of the breaker-count-based settle speed above -- tao
  // pacing shouldn't get faster just because your economy got smoother.
  state.yinYangAccum += dt;
  while (state.yinYangAccum >= 1) {
    state.yinYangAccum -= 1;
    settleYinYang();
  }

  // Factories: the yin-yang engine. Each completed cycle produces
  // either one nail maker or one nail breaker -- decided by a
  // Bresenham-style accumulator so the output ratio matches the
  // balance slider exactly over time, not just on average.
  if (state.factoriesOn) {
    var period = FACTORY_PERIOD_SEC;
    var cycleCopperCost = factoryCopperCostEffective();
    while (state.factoryTimers.length < state.factories) state.factoryTimers.push(0);
    for (var i = 0; i < state.factories; i++) {
      var fTimer = state.factoryTimers[i];
      if (fTimer < period) {
        fTimer = Math.min(period, fTimer + dt);
      }
      if (fTimer >= period && state.copperAmt >= cycleCopperCost) {
        state.copperAmt -= cycleCopperCost;
        fTimer -= period;

        state.factoryAllocAccum += state.factoryBalance / 100;
        if (state.factoryAllocAccum >= 1) {
          state.factoryAllocAccum -= 1;
          state.nailMakers += 1;
        } else {
          state.breakers += 1;
          state.unlockedMap = true;
        }
      }
      state.factoryTimers[i] = fTimer;
    }
  }

  checkYinYangUnlock();

  if (!mapHasDeposits(state.mapTiles)) {
    goToNextMap(); // calls render() itself
    return;
  }

  render();
}

setInterval(function () {
  tick(TICK_MS / 1000);
}, TICK_MS);

render();
renderLeaderboard();
