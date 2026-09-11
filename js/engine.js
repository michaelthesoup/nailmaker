"use strict";

// ----------------------------------------------------------------
// Game loop
// ----------------------------------------------------------------

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
  histPush(state.histNailsMade, actuallyMade);

  // Breakers and selling both settle once per real second, in a lump --
  // not continuously. This is what makes the sawtooth visible: unsold
  // inventory climbs smoothly every tick from production, then drops
  // all at once when the second ticks over, based on how many nails
  // breakers burned as ammo and how many the public bought.
  state.settleAccum += dt;
  while (state.settleAccum >= 1) {
    state.settleAccum -= 1;

    // Breakers get first claim on the inventory that's accumulated
    // this second. Each nail hits every remaining deposit once, so
    // 10 iron deposits and 5 copper deposits return 10g iron and 5g
    // copper per nail.
    var breakerRate = breakerIntakeEffective();
    if (state.breakers > 0 && breakerRate > 0 && state.unsold > 0 && mapHasDeposits(state.mapTiles)) {
      // Breakers get first claim on unsold nails. One nail hits every
      // currently active deposit exactly once.
      var breakerResult = processBreakerNails(state.breakers * breakerRate);
      if (breakerResult.nailsUsed > 0) {
        histPush(state.histBreakerNails, breakerResult.nailsUsed);
      }
      if (breakerResult.ironGot > 0) {
        state.ironAmt += breakerResult.ironGot;
        histPush(state.histBreakerIron, breakerResult.ironGot);
      }
      if (breakerResult.copperGot > 0) {
        state.copperAmt += breakerResult.copperGot;
        histPush(state.histBreakerCopper, breakerResult.copperGot);
      }
    }

    // Selling, Universal-Paperclips style: a deterministic rate
    // derived from price and marketing, settling once per second
    // like the original game -- not a continuous trickle. Steeply
    // super-linear once demand clears 100, which is what makes a
    // sharp price cut trigger a genuine mass sell-off the very next
    // second instead of a gentle nudge.
    var soldPerSec = avgNailsSoldPerSec();
    if (soldPerSec > 0 && state.unsold > 0) {
      var sold = Math.min(state.unsold, soldPerSec);
      state.unsold -= sold;
      var revenue = sold * state.price;
      state.funds += revenue;
      histPush(state.histRevenue, revenue);
    }

    // Yin & Yang: once per real second, whichever of harvesting or
    // profiting won that second ticks its bar up.
    settleYinYang();
  }

  // Factories: the yin-yang engine. Each completed cycle produces
  // either one nail maker or one nail breaker -- decided by a
  // Bresenham-style accumulator so the output ratio matches the
  // balance slider exactly over time, not just on average.
  if (state.factoriesOn) {
    var period = FACTORY_PERIOD_SEC;
    while (state.factoryTimers.length < state.factories) state.factoryTimers.push(0);
    for (var i = 0; i < state.factories; i++) {
      var fTimer = state.factoryTimers[i];
      if (fTimer < period) {
        fTimer = Math.min(period, fTimer + dt);
      }
      if (fTimer >= period &&
          state.ironAmt >= FACTORY_IRON_COST &&
          state.copperAmt >= FACTORY_COPPER_COST) {
        state.ironAmt -= FACTORY_IRON_COST;
        state.copperAmt -= FACTORY_COPPER_COST;
        fTimer -= period;

        state.factoryAllocAccum += state.factoryBalance / 100;
        if (state.factoryAllocAccum >= 1) {
          state.factoryAllocAccum -= 1;
          state.nailMakers += 1;
        } else {
          state.breakers += 1;
          state.unlockedMap = true;
        }

        histPush(state.histFactoryIron, FACTORY_IRON_COST);
        histPush(state.histFactoryCopper, FACTORY_COPPER_COST);
        histPush(state.histFactoryOutput, 1);
      }
      state.factoryTimers[i] = fTimer;
    }
  }

  // Prune all the rolling-average buffers to the trailing window.
  histPrune(state.histRevenue);
  histPrune(state.histNailsMade);
  histPrune(state.histFactoryIron);
  histPrune(state.histFactoryCopper);
  histPrune(state.histFactoryOutput);
  histPrune(state.histBreakerNails);
  histPrune(state.histBreakerIron);
  histPrune(state.histBreakerCopper);

  checkYinYangUnlock();

  if (state.autoNextMap && !mapHasDeposits(state.mapTiles)) {
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
