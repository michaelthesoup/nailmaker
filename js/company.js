"use strict";

// ----------------------------------------------------------------
// The Company. A black deck's counterpart to the community (community.js), and built the same way: a deck holds one
// colour, so a black run has the company and a white run has the community, never both. It exists only while you
// hold workers: a black deck always has one free, and black cards add more (cards.js, companyMembers).
//
//   workers    the community's members. They are not hired or bought. Overseers and foremen (the barracks,
//              monastery.js) come out of them and do not build.
//   manpower   the community's harmony, renamed: the force that keeps the workers together. It follows how balanced
//              your economy is (iron demand against iron supply, as in yin & yang), with inertia: it climbs slowly
//              and falls faster, so past imbalance costs you.
//   output     the community's merit. Each worker makes COMPANY_OUTPUT_PER_WORKER_SEC output a second times the
//              manpower; when the ring is full it builds ONE FACTORY (it takes COMPANY_COPPER_PER_FACTORY of
//              copper, and the ring waits full until there is enough). The factories it builds don't make the next
//              one you buy dearer (state.companyFactories, formulas.js).
//
// It is drawn like the community too: a ring that fills, a spinning shape in the middle that grows with the workers
// (a cog instead of the yin-yang symbol), and a couple of words beneath. Black cards can speed the building up
// (companySpeed).
// ----------------------------------------------------------------

var COMPANY_OUTPUT_PER_WORKER_SEC = 0.25;   // the community's merit rate per member
var COMPANY_OUTPUT_PER_FACTORY = 100;       // output for one factory (the ring)
var COMPANY_COPPER_PER_FACTORY = 3000000;   // grams of copper per factory built (3 tonnes)
var COMPANY_BALANCE_FALLOFF = 2;            // target manpower = 1 - |imbalance| * this (0 at the 3-to-1 collapse line)
var COMPANY_MANPOWER_RISE_PER_SEC = 0.02;   // manpower climbs slowly toward a better target...
var COMPANY_MANPOWER_FALL_PER_SEC = 0.05;   // ...and falls faster toward a worse one

// A black deck always has at least ONE worker, free, so every black player meets the company; black cards add more.
var COMPANY_FREE_WORKERS = 1;

function companyWorkers() {
  var fromCards = Math.max(0, Math.floor(cardAdd("companyMembers")));
  var black = typeof cardDeckSide === "function" && cardDeckSide() === "black";
  return black ? Math.max(COMPANY_FREE_WORKERS, fromCards) : fromCards;
}

var COMPANY_UNLOCK_TAO = 1;   // held tao needed (the cards that give workers only exist after a reincarnation)

// The company exists while a black deck holds at least one worker, and, like the monastery, it has to be earned
// again each life: reach 1 tao and it stays (state.unlockedCompany).
function companyUnlocked() {
  return !!state.unlockedCompany && typeof cardDeckSide === "function" && cardDeckSide() === "black" && companyWorkers() > 0;
}

function companyManpower() {
  return Math.max(0, Math.min(1, state.manpower || 0));
}

// What manpower is heading toward: 1 = a perfectly balanced economy, 0 = at or past the collapse line. Zero while one
// side doesn't exist yet (nothing to balance).
function companyManpowerTarget() {
  if (ironDemandRate() <= 0 || ironSupplyRate() <= 0) return 0;
  // a heavy barracks lean (monastery.js) drains manpower exactly as a monastery lean drains harmony
  return Math.max(0, 1 - Math.abs(ironStructuralImbalance()) * COMPANY_BALANCE_FALLOFF) * (1 - communityLeanDrain());
}

// Workers on the line: overseers and foremen (monastery.js, the barracks) are not building.
function companyWorking() {
  return Math.max(0, companyWorkers() - state.monks - (state.foremen || 0));
}

function companyOutputRate() {
  return companyWorking() * COMPANY_OUTPUT_PER_WORKER_SEC * companyManpower() * cardMult("companySpeed");
}

function companyCopperCost() {
  return COMPANY_COPPER_PER_FACTORY * cardMult("copperCost");
}

// Called every game tick (engine.js).
function companyTick(dt) {
  if (!state.unlockedCompany && state.tao >= COMPANY_UNLOCK_TAO && typeof cardDeckSide === "function" && cardDeckSide() === "black" && companyWorkers() > 0) state.unlockedCompany = true;
  if (!companyUnlocked()) return;
  var target = companyManpowerTarget();
  var m = companyManpower();
  if (target > m) m = Math.min(target, m + COMPANY_MANPOWER_RISE_PER_SEC * dt);
  else m = Math.max(target, m - COMPANY_MANPOWER_FALL_PER_SEC * dt);
  state.manpower = m;

  // the ring fills, and stops full while there is no copper for the factory
  state.companyProgress = Math.min(COMPANY_OUTPUT_PER_FACTORY, (state.companyProgress || 0) + companyOutputRate() * dt);
  var copperCost = companyCopperCost();
  if (state.companyProgress >= COMPANY_OUTPUT_PER_FACTORY && state.copperAmt >= copperCost) {
    state.copperAmt -= copperCost;
    state.companyProgress -= COMPANY_OUTPUT_PER_FACTORY;
    state.factories += 1;
    state.companyFactories = (state.companyFactories || 0) + 1;
  }
}

// ---------------- the panel ----------------

var companyEls = {
  section: document.getElementById("companySection"),
  canvas: document.getElementById("companyCanvas"),
  workers: document.getElementById("valCompanyWorkers"),
  manpower: document.getElementById("valCompanyManpower"),
  rate: document.getElementById("valCompanyRate"),
  output: document.getElementById("valCompanyOutput")
};

function renderCompany() {
  var e = companyEls;
  if (!e.section) return;
  var show = companyUnlocked();
  e.section.style.display = show ? "" : "none";
  if (!show) return;

  var m = companyManpower();
  var target = companyManpowerTarget();
  var trend = target > m + 0.005 ? " ↑" : (target < m - 0.005 ? " ↓" : "");
  e.workers.textContent = companyWorking() + " / " + companyWorkers();
  e.manpower.textContent = Math.round(m * 100) + "%" + trend;
  var rate = companyOutputRate();
  var waiting = (state.companyProgress || 0) >= COMPANY_OUTPUT_PER_FACTORY;
  e.rate.textContent = waiting
    ? "waiting for " + fmtWeight(companyCopperCost()) + " of copper"
    : (rate > 0 ? "+" + rate.toFixed(2) + "/s (1 factory per " + fmtDuration(COMPANY_OUTPUT_PER_FACTORY / rate) + ", " + fmtWeight(companyCopperCost()) + " of copper)" : "none");
  e.output.textContent = fmtInt(state.companyProgress || 0) + " / " + fmtInt(COMPANY_OUTPUT_PER_FACTORY);
}

// ---------------- drawing ----------------

var companyCtx = companyEls.canvas && companyEls.canvas.getContext ? companyEls.canvas.getContext("2d") : null;
var companySpin = 0;
var companyLastFrame = Date.now();

function companyThemeColors() {
  var cs = getComputedStyle(document.documentElement);
  return {
    paper: cs.getPropertyValue("--paper").trim() || "#ffffff",
    ink: cs.getPropertyValue("--ink").trim() || "#000000"
  };
}

// A cog: a toothed wheel with a hole in the middle.
function drawCog(ctx, x, y, r, angle, ink, paper) {
  var teeth = 10, inner = r * 0.8, hole = r * 0.32;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = ink;
  ctx.beginPath();
  for (var i = 0; i < teeth; i++) {
    var a = (i / teeth) * Math.PI * 2, step = Math.PI * 2 / teeth;
    var points = [[a, inner], [a + step * 0.12, r], [a + step * 0.38, r], [a + step * 0.5, inner]];
    for (var j = 0; j < points.length; j++) {
      var px = Math.cos(points[j][0]) * points[j][1], py = Math.sin(points[j][0]) * points[j][1];
      if (i === 0 && j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = paper;
  ctx.beginPath(); ctx.arc(0, 0, hole, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCompany() {
  requestAnimationFrame(drawCompany);
  var now = Date.now();
  var dt = Math.min(0.1, (now - companyLastFrame) / 1000);
  companyLastFrame = now;
  if (!companyCtx || !companyUnlocked()) return;

  var ctx = companyCtx;
  var w = companyEls.canvas.width, h = companyEls.canvas.height;
  var colors = companyThemeColors();
  var ink = colors.ink, paper = colors.paper;
  var cx = w / 2, cy = h / 2 + 22, R = 128;

  // the cog turns faster the more output is flowing
  companySpin += dt * (0.25 + companyOutputRate() * 1.6);

  ctx.clearRect(0, 0, w, h);

  // the big circle and the output ring filling around it
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ink;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  var frac = Math.min(1, (state.companyProgress || 0) / COMPANY_OUTPUT_PER_FACTORY);
  if (frac > 0) {
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }

  // the company: grows with workers
  var r = 14 + 7 * Math.sqrt(companyWorkers());
  drawCog(ctx, cx, cy, r, companySpin, ink, paper);

  // the words beneath, as in the community's diagram
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("the company", cx, cy + 100);
  ctx.font = "13px sans-serif";
  ctx.fillText("workers", cx, cy + r + 18);
}

requestAnimationFrame(drawCompany);
