"use strict";

// ----------------------------------------------------------------
// Slots. A small box with three smaller boxes in it. Type how much to bet, press spin: the three boxes cycle through
// 1-9 and stop one after another on a random digit. The bet is taken when you spin and any winnings are paid when the
// last box stops. Payouts are what you get back for the bet (the stake is not returned on top):
//   two the same        2x
//   three the same      9x
//   exactly two 7s      20x
//   three 7s            77x
// Each box is a fair 1-9, so these odds pay back MORE than the bet on average (about 139%). Change SLOT_PAYOUT to tune.
// Black cards can raise the 777 jackpot (slotJackpot) and make it spin faster (slotSpeed).
// The panel appears the first time you hold SLOT_UNLOCK_FUNDS (10,000) and stays for the life.
// Nothing about a spin is saved: it is over in two seconds.
// ----------------------------------------------------------------

var SLOT_PAYOUT = { pair: 2, triple: 9, twoSevens: 20, threeSevens: 77 };
var SLOT_STOP_MS = [900, 1350, 1800]; // when each box stops, from the moment you press spin
var SLOT_UNLOCK_FUNDS = 10000;        // funds needed to unlock the slot machine
var SLOT_SPIN_SPEED = 14;             // digits a second while a box is spinning at full speed
var SLOT_BRAKE_MS = 650;              // how long a box takes to slow down and settle on its digit
var SLOT_CELL = 54;                   // height of a box in pixels (one digit tall)

var slotUI = null;
var slotUI0 = null; // the line that lists the payouts
var slotSpinning = false;

// What the three digits pay, as a multiple of the bet (0 for nothing).
function slotMultiplier(d) {
  var sevens = (d[0] === 7 ? 1 : 0) + (d[1] === 7 ? 1 : 0) + (d[2] === 7 ? 1 : 0);
  if (sevens === 3) return SLOT_PAYOUT.threeSevens * cardMult("slotJackpot"); // the jackpot
  if (sevens === 2) return SLOT_PAYOUT.twoSevens;
  if (d[0] === d[1] && d[1] === d[2]) return SLOT_PAYOUT.triple;
  if (d[0] === d[1] || d[1] === d[2] || d[0] === d[2]) return SLOT_PAYOUT.pair;
  return 0;
}

// Reads what the player typed: 12, 12.5, 1.5k, 2m, 3b, 4t.
function slotParseBet(text) {
  var m = /^\s*\$?\s*([0-9]*\.?[0-9]+)\s*([kmbt]?)\s*$/i.exec(String(text || ""));
  if (!m) return 0;
  var mult = { "": 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2].toLowerCase()];
  var v = parseFloat(m[1]) * mult;
  return isFinite(v) ? v : 0;
}

function slotSay(text) { if (slotUI) slotUI.result.textContent = text; }

// Each box is a tall strip of the digits 1-9 (three times over, so it can wrap) that slides past a window. A spinning
// box slides smoothly at a steady speed, then eases to a stop exactly on its digit.
function slotPlace(i, pos) {
  slotUI.strips[i].style.transform = "translateY(" + (-((((pos % 9) + 9) % 9) + 9) * SLOT_CELL).toFixed(2) + "px)";
}

function slotSpin() {
  if (slotSpinning || !slotUI) return;
  var bet = Math.floor(slotParseBet(slotUI.input.value) * 100) / 100; // whole cents
  if (!(bet > 0)) { slotSay("type how much to bet"); return; }
  if (bet > state.funds) { slotSay("you only have " + fmtMoney(state.funds)); return; }

  state.funds -= bet;
  slotSpinning = true;
  slotUI.btn.disabled = true;
  slotUI.result.textContent = "";
  var digits = [1 + Math.floor(Math.random() * 9), 1 + Math.floor(Math.random() * 9), 1 + Math.floor(Math.random() * 9)];
  var speed = Math.max(0.2, cardMult("slotSpeed")); // cards make it spin quicker
  var v = SLOT_SPIN_SPEED * Math.min(speed, 2.5) / 1000; // digits per millisecond
  var brake = Math.min(SLOT_BRAKE_MS / speed, SLOT_STOP_MS[0] / speed * 0.7);
  var start = performance.now(), last = start;
  var pos = slotUI.pos.slice(), from = [0, 0, 0], target = [0, 0, 0], braking = [false, false, false], done = [false, false, false];
  slotUI.strips.forEach(function (st) { st.style.filter = "blur(0.6px)"; });

  function frame(now) {
    var t = now - start, dt = Math.min(50, now - last), finished = 0;
    last = now;
    for (var i = 0; i < 3; i++) {
      var stopAt = SLOT_STOP_MS[i] / speed;
      if (done[i]) { finished++; continue; }
      if (t < stopAt - brake) {
        pos[i] = pos[i] + v * dt; // steady slide
        slotPlace(i, pos[i]);
      } else {
        if (!braking[i]) { // work out where to land: a whole digit a little way ahead
          braking[i] = true;
          from[i] = pos[i] % 9;
          var travel = v * brake / 3 + 0.5, goal = digits[i] - 1;
          target[i] = from[i] + travel;
          target[i] = Math.ceil((target[i] - goal) / 9) * 9 + goal; // the next place that shows the digit
          slotUI.strips[i].style.filter = "none";
        }
        var u = Math.min(1, (t - (stopAt - brake)) / brake);
        var e = 1 - Math.pow(1 - u, 3);
        pos[i] = from[i] + (target[i] - from[i]) * e;
        slotPlace(i, pos[i]);
        if (u >= 1) { done[i] = true; pos[i] = digits[i] - 1; slotPlace(i, pos[i]); finished++; }
      }
    }
    if (finished < 3) { requestAnimationFrame(frame); return; }
    slotUI.pos = pos;
    var mult = slotMultiplier(digits), win = bet * mult;
    if (win > 0) {
      state.funds += win;
      slotSay("x" + Math.round(mult * 10) / 10 + "  +" + fmtMoney(win));
    } else {
      slotSay("no match");
    }
    slotSpinning = false;
    slotUI.btn.disabled = false;
  }
  requestAnimationFrame(frame);
}

function slotBuildUI() {
  var section = document.getElementById("slotSection");
  if (!section) return;
  var st = document.createElement("style");
  st.textContent =
    "#slotSection { grid-column: 1; grid-row: 3; align-self: start; }" +
    ".slot-reels { display: flex; gap: 6px; justify-content: center; border: 1px solid var(--ink); padding: 6px; }" +
    ".slot-box { width: 44px; height: 54px; border: 1px solid var(--ink); overflow: hidden; user-select: none; }" +
    ".slot-strip { will-change: transform; }" +
    ".slot-cell { height: 54px; display: flex; align-items: center; justify-content: center; font-size: 30px; font-variant-numeric: tabular-nums; }" +
    ".slot-bet { display: flex; gap: 4px; margin-top: 6px; }" +
    ".slot-bet input { flex: 1; min-width: 0; font-size: 12px; padding: 2px 4px; border: 1px solid var(--ink); background: var(--paper); color: var(--ink); }" +
    ".slot-bet button { font-size: 11px; padding: 1px 7px; }" +
    ".slot-result { min-height: 16px; margin-top: 5px; text-align: center; font-size: 12px; }" +
    ".slot-rules { margin-top: 3px; font-size: 10px; opacity: 0.7; text-align: center; }";
  document.head.appendChild(st);

  var body = section.querySelector(".panel-body");
  body.innerHTML = "";
  var reels = document.createElement("div");
  reels.className = "slot-reels";
  var boxes = [], strips = [];
  for (var i = 0; i < 3; i++) {
    var b = document.createElement("div");
    b.className = "slot-box";
    var strip = document.createElement("div");
    strip.className = "slot-strip";
    for (var c = 0; c < 27; c++) {
      var cell = document.createElement("div");
      cell.className = "slot-cell"; cell.textContent = (c % 9) + 1;
      strip.appendChild(cell);
    }
    b.appendChild(strip);
    reels.appendChild(b); boxes.push(b); strips.push(strip);
  }
  body.appendChild(reels);

  var bet = document.createElement("div");
  bet.className = "slot-bet";
  var input = document.createElement("input");
  input.type = "text"; input.placeholder = "bet"; input.setAttribute("inputmode", "decimal"); input.autocomplete = "off";
  var maxBtn = document.createElement("button"); maxBtn.textContent = "max"; maxBtn.title = "bet everything you have";
  var btn = document.createElement("button"); btn.textContent = "spin";
  bet.appendChild(input); bet.appendChild(maxBtn); bet.appendChild(btn);
  body.appendChild(bet);

  var result = document.createElement("div"); result.className = "slot-result";
  body.appendChild(result);
  var rules = document.createElement("div"); rules.className = "slot-rules";
  slotUI0 = rules;
  body.appendChild(rules);

  btn.addEventListener("click", slotSpin);
  maxBtn.addEventListener("click", function () { input.value = (Math.floor(state.funds * 100) / 100).toString(); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") slotSpin(); });
  slotUI = { section: section, boxes: boxes, strips: strips, pos: [6, 6, 6], input: input, btn: btn, result: result };
  for (var k = 0; k < 3; k++) slotPlace(k, 6); // start on 7
}

function renderSlots() {
  var section = document.getElementById("slotSection");
  if (!section) return;
  if (!slotUI) slotBuildUI();
  if (!state.unlockedSlots && state.funds >= SLOT_UNLOCK_FUNDS) state.unlockedSlots = true;
  section.style.display = state.unlockedSlots ? "" : "none";
  if (slotUI0) {
    var jackpot = Math.round(SLOT_PAYOUT.threeSevens * cardMult("slotJackpot") * 10) / 10;
    slotUI0.textContent = "pair x" + SLOT_PAYOUT.pair + " · three x" + SLOT_PAYOUT.triple + " · two 7s x" + SLOT_PAYOUT.twoSevens + " · 777 x" + jackpot;
  }
}
