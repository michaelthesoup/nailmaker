"use strict";

// ----------------------------------------------------------------
// Stock market. See the MARKET_* constants and comment in state.js for
// the design idea. The short version: the price is never "whatever
// was last written somewhere" -- it's a pure function of the current
// real-world time, computed identically by every browser. Firestore is
// used ONLY as a speed optimization (a checkpoint so a client doesn't
// have to replay the walk all the way from January 1st every time),
// never as the source of truth. If Firestore is unreachable, wrong, or
// a guest can't write to it, the price is still 100% correct --
// every client can derive it from nothing but math and a clock.
// ----------------------------------------------------------------

var MARKET_POLL_MS = 20000; // re-check for a new bucket every 20s while playing
var MARKET_INVEST_STEP = 5; // $ per +/- click on the invest amount stepper
var MARKET_INVEST_MIN = 5;

var marketCheckpoint = { bucket: 0, price: MARKET_START_PRICE }; // best known starting point for the replay
var marketCurrentPrice = MARKET_START_PRICE;
var marketCurrentBucket = 0;
var marketInvestAmount = 10;
var marketPollTimer = null;

function marketBucketForTime(nowMs) {
  return Math.max(0, Math.floor((nowMs - MARKET_GENESIS_MS) / MARKET_BUCKET_MS));
}

// One deterministic pseudo-random step for a given bucket index. Same
// bucket index always produces the same step, on any machine, forever
// -- that's the entire trick that makes this "global" without a server.
function marketStepForBucket(bucketIndex) {
  var seed = (Math.imul(bucketIndex, 2654435761) ^ MARKET_SEED_SALT) | 0;
  var rand = mulberry32(seed)();
  return (rand - 0.5) * 2 * MARKET_VOLATILITY;
}

// Replays the walk forward from a checkpoint to the target bucket.
// Cheap even over long real-world spans (a year of 5-minute buckets is
// about 105,000 iterations of simple arithmetic -- milliseconds).
function marketReplay(fromCheckpoint, toBucket) {
  var price = fromCheckpoint.price;
  for (var b = fromCheckpoint.bucket + 1; b <= toBucket; b++) {
    price = Math.max(MARKET_MIN_PRICE, price * (1 + marketStepForBucket(b)));
  }
  return price;
}

// Recomputes the current price from whatever checkpoint we have in
// memory, updates the display, and (best-effort, never required)
// tries to save a fresher checkpoint to Firestore so future loads
// -- on this device or any other -- can start closer to "now".
function marketRefresh() {
  var nowBucket = marketBucketForTime(Date.now());
  if (nowBucket === marketCurrentBucket && marketCurrentPrice !== undefined) {
    return; // no new bucket yet, nothing to do
  }

  marketCurrentPrice = marketReplay(marketCheckpoint, nowBucket);
  marketCurrentBucket = nowBucket;
  marketCheckpoint = { bucket: nowBucket, price: marketCurrentPrice };

  if (typeof db !== "undefined" && currentAuthUser()) {
    db.collection("market").doc("main").set({
      bucket: nowBucket,
      price: marketCurrentPrice,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function (err) {
      console.error("Market checkpoint save failed (harmless, price is still correct locally)", err);
    });
  }

  render();
}

// One-time startup: try to pull a Firestore checkpoint so we don't
// have to replay from January 1st on a brand new device. If this
// fails for any reason (offline, guest without read access, no doc
// yet), we just fall back to replaying from genesis -- still correct,
// just a few extra milliseconds of computation.
function marketLoadCheckpoint() {
  if (typeof db === "undefined") {
    marketRefresh();
    return;
  }

  db.collection("market").doc("main").get().then(function (doc) {
    if (doc.exists) {
      var data = doc.data();
      if (typeof data.bucket === "number" && typeof data.price === "number" && data.bucket > marketCheckpoint.bucket) {
        marketCheckpoint = { bucket: data.bucket, price: data.price };
      }
    }
    marketRefresh();
  }).catch(function (err) {
    console.error("Could not read market checkpoint, replaying from genesis instead", err);
    marketRefresh();
  });
}

function marketPortfolioValue() {
  return state.stockShares * marketCurrentPrice;
}

function marketGainLoss() {
  return marketPortfolioValue() - state.stockCostBasis;
}

el.btnStockAmountMinus.addEventListener("click", function () {
  marketInvestAmount = Math.max(MARKET_INVEST_MIN, marketInvestAmount - MARKET_INVEST_STEP);
  render();
});

el.btnStockAmountPlus.addEventListener("click", function () {
  marketInvestAmount = Math.min(state.funds, marketInvestAmount + MARKET_INVEST_STEP);
  if (marketInvestAmount < MARKET_INVEST_MIN) marketInvestAmount = MARKET_INVEST_MIN;
  render();
});

el.btnStockBuy.addEventListener("click", function () {
  var amount = Math.min(marketInvestAmount, state.funds);
  if (amount < MARKET_INVEST_MIN || marketCurrentPrice <= 0) return;

  var sharesBought = amount / marketCurrentPrice;
  state.funds -= amount;
  state.stockShares += sharesBought;
  state.stockCostBasis += amount;
  render();
  if (el.stockHint) {
    var old = el.stockHint.textContent;
    el.stockHint.textContent = "bought " + sharesBought.toFixed(4) + " shares for " + fmtMoney(amount);
    setTimeout(function () { if (el.stockHint) el.stockHint.textContent = old; }, 1500);
  }
});

el.btnStockSellAll.addEventListener("click", function () {
  if (state.stockShares <= 0) return;
  var proceeds = marketPortfolioValue();
  state.funds += proceeds;
  state.stockShares = 0;
  state.stockCostBasis = 0;
  render();
  if (el.stockHint) {
    var old = el.stockHint.textContent;
    el.stockHint.textContent = "sold everything for " + fmtMoney(proceeds);
    setTimeout(function () { if (el.stockHint) el.stockHint.textContent = old; }, 1500);
  }
});

function renderMarket() {
  if (!el.marketSection) return;

  el.stockPrice.textContent = fmtMoney(marketCurrentPrice);
  el.stockShares.textContent = state.stockShares.toFixed(4);
  el.stockValue.textContent = fmtMoney(marketPortfolioValue());

  var gainLoss = marketGainLoss();
  el.stockGainLoss.textContent = (gainLoss >= 0 ? "+" : "") + fmtMoney(gainLoss);
  el.stockGainLoss.style.color = gainLoss > 0 ? "#0a0" : (gainLoss < 0 ? "#c00" : "");

  if (marketInvestAmount > state.funds && state.funds >= MARKET_INVEST_MIN) {
    marketInvestAmount = state.funds;
  }
  el.stockAmount.textContent = fmtMoney(marketInvestAmount);
  el.btnStockBuy.disabled = state.funds < MARKET_INVEST_MIN;
  el.btnStockSellAll.disabled = state.stockShares <= 0;
}

marketLoadCheckpoint();
marketPollTimer = setInterval(marketRefresh, MARKET_POLL_MS);
