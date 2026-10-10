"use strict";

// ----------------------------------------------------------------
// The Community. Unlocks with your first reincarnation (any banked
// karma). A picture from the Buddhist notes made into a mechanic:
//   ฉัน  the dot            you. Its distance from the big circle is
//                            your karma progress toward Nirvana.
//   เรา  the spinning center your community. Members make merit; the
//                            more of them, the bigger it is and the
//                            faster it spins.
//   ทั้งหมด the big circle   the whole. Merit fills a ring around it;
//                            a full ring is +1 tao, then it resets.
//
// Members only make merit while the community is in HARMONY, and
// harmony follows how balanced your economy is -- but with inertia: it
// climbs slowly and falls faster. Past imbalance therefore costs you
// (you can't snap it back by fixing your build for a second), yet a
// steady balanced economy keeps it near full without you swinging
// back and forth by hand. (Tying it to the yin/yang bar positions was
// tried and rejected: those bars park at one end for minutes even in a
// well-built economy, which would have stalled the community.)
// All tunables are below.
// ----------------------------------------------------------------

var COMMUNITY_BASE_CAPACITY = 1;          // members allowed with the first karma, before the per-karma room below
var COMMUNITY_CAPACITY_PER_KARMA = 2;     // extra room per banked karma
var COMMUNITY_MEMBER_COST_BASE = 50;      // unsold nails for the first member...
var COMMUNITY_MEMBER_COST_GROWTH = 1.4;   // ...each further member costs this much more
var COMMUNITY_MERIT_PER_MEMBER_SEC = 0.25;
var COMMUNITY_MERIT_PER_TAO = 100;
var COMMUNITY_HARMONY_FALLOFF = 2;        // target harmony = 1 - |imbalance| * this (so 0 at 0.5 = the 3-to-1 collapse line)
var COMMUNITY_HARMONY_RISE_PER_SEC = 0.02; // harmony climbs slowly toward a better target (~50s from nothing to full)
var COMMUNITY_HARMONY_FALL_PER_SEC = 0.05; // ...and falls faster toward a worse one
var COMMUNITY_NIRVANA_KARMA = 80;         // the dot reaches the center at this karma (nirvana is ~44% likely per rebirth there)

function communityCapacity() {
  return COMMUNITY_BASE_CAPACITY + COMMUNITY_CAPACITY_PER_KARMA * Math.max(0, Math.floor(state.karma));
}

function communityMemberCost() {
  return Math.round(COMMUNITY_MEMBER_COST_BASE * Math.pow(COMMUNITY_MEMBER_COST_GROWTH, state.members));
}

// The community appears with your first reincarnation (banked karma).
function communityUnlocked() {
  return state.karma >= 1;
}

// What harmony is heading toward right now: 1 = perfectly balanced
// economy, 0 = at or past the collapse line. Zero while one side doesn't
// exist yet (nothing to balance).
function communityHarmonyTarget() {
  if (ironDemandRate() <= 0 || ironSupplyRate() <= 0) return 0;
  return Math.max(0, 1 - Math.abs(ironStructuralImbalance()) * COMMUNITY_HARMONY_FALLOFF);
}

function communityHarmony() {
  return Math.max(0, Math.min(1, state.harmony || 0));
}

// Only members who are meditating make merit; monks (see monastery.js) are
// members working in the monastery instead.
function communityMeritRate() {
  var meditating = Math.max(0, state.members - state.monks);
  return meditating * COMMUNITY_MERIT_PER_MEMBER_SEC * communityHarmony();
}

// Called every game tick (engine.js).
function communityTick(dt) {
  if (!communityUnlocked()) return;

  var target = communityHarmonyTarget();
  var h = communityHarmony();
  if (target > h) h = Math.min(target, h + COMMUNITY_HARMONY_RISE_PER_SEC * dt);
  else h = Math.max(target, h - COMMUNITY_HARMONY_FALL_PER_SEC * dt);
  state.harmony = h;

  if (state.members <= 0) return;
  state.merit += communityMeritRate() * dt;
  while (state.merit >= COMMUNITY_MERIT_PER_TAO) {
    state.merit -= COMMUNITY_MERIT_PER_TAO;
    state.tao += 1; // real tao: lifts negative tao back toward zero too
  }
}

el.btnRecruitMember.addEventListener("click", function () {
  var cost = communityMemberCost();
  if (state.members >= communityCapacity() || state.unsold < cost) return;
  state.unsold -= cost;
  state.members += 1;
  render();
});

// Called from render().
function renderCommunity() {
  el.communitySection.style.display = communityUnlocked() ? "" : "none";
  if (!communityUnlocked()) return;

  var cap = communityCapacity();
  var harmony = communityHarmony();
  var rate = communityMeritRate();
  el.communityMembers.textContent = state.members + " / " + cap + (state.monks > 0 ? " (" + (state.members - state.monks) + " meditating)" : "");
  var harmonyTarget = communityHarmonyTarget();
  var trend = harmonyTarget > harmony + 0.005 ? " \u2191" : (harmonyTarget < harmony - 0.005 ? " \u2193" : "");
  el.communityHarmony.textContent = Math.round(harmony * 100) + "%" + trend;
  el.communityRate.textContent = rate > 0
    ? "+" + rate.toFixed(2) + "/s (1 tao per " + fmtDuration(COMMUNITY_MERIT_PER_TAO / rate) + ")"
    : "none";
  el.communityMerit.textContent = Math.floor(state.merit) + " / " + COMMUNITY_MERIT_PER_TAO;

  var cost = communityMemberCost();
  if (state.members >= cap) {
    el.btnRecruitMember.textContent = "full \u2014 karma makes room";
    el.btnRecruitMember.disabled = true;
  } else {
    el.btnRecruitMember.textContent = "recruit (" + fmtInt(cost) + " nails)";
    el.btnRecruitMember.disabled = state.unsold < cost;
  }

  var karmaShown = Math.max(0, state.karma);
  el.communityHint.textContent = "karma " + karmaShown + " / " + COMMUNITY_NIRVANA_KARMA + " on the way to nirvana. " +
    (state.members === 0
      ? "Recruit members: they make merit while your makers and breakers stay balanced. 100 merit = 1 tao."
      : (harmony <= 0.01
          ? "The community is unsettled. Balance your makers and breakers and its harmony will recover."
          : "Harmony follows your balance, climbing slowly and falling fast. A full ring is +1 tao."));
}

// ---------------- drawing ----------------

var communityCtx = el.communityCanvas.getContext("2d");
var communitySpin = 0;
var communityLastFrame = Date.now();

function communityThemeColors() {
  var cs = getComputedStyle(document.documentElement);
  return {
    paper: cs.getPropertyValue("--paper").trim() || "#ffffff",
    ink: cs.getPropertyValue("--ink").trim() || "#000000"
  };
}

function drawTaijitu(ctx, x, y, r, angle, ink, paper) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ink;

  ctx.fillStyle = ink; // dark half (left)
  ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, true); ctx.fill();
  ctx.fillStyle = paper; // light half (right)
  ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); ctx.fill();

  ctx.fillStyle = ink; // dark head reaching into the light half
  ctx.beginPath(); ctx.arc(0, -r / 2, r / 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = paper; // light head reaching into the dark half
  ctx.beginPath(); ctx.arc(0, r / 2, r / 2, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = paper; ctx.beginPath(); ctx.arc(0, -r / 2, r / 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ink;   ctx.beginPath(); ctx.arc(0, r / 2, r / 6, 0, Math.PI * 2); ctx.fill();

  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawCommunity() {
  requestAnimationFrame(drawCommunity);
  var now = Date.now();
  var dt = Math.min(0.1, (now - communityLastFrame) / 1000);
  communityLastFrame = now;
  if (!communityUnlocked()) return;

  var ctx = communityCtx;
  var w = el.communityCanvas.width, h = el.communityCanvas.height;
  var colors = communityThemeColors();
  var ink = colors.ink, paper = colors.paper;
  var cx = w / 2, cy = h / 2 + 22, R = 128;

  // the center spins faster the more merit is flowing
  communitySpin += dt * (0.25 + communityMeritRate() * 1.6);

  ctx.clearRect(0, 0, w, h);

  // the whole (big circle) and the merit ring filling around it
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ink;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  var meritFrac = Math.min(1, state.merit / COMMUNITY_MERIT_PER_TAO);
  if (meritFrac > 0) {
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + meritFrac * Math.PI * 2);
    ctx.stroke();
  }

  // the "I" dot approaches the whole as karma grows, merging at the center
  var progress = Math.max(0, Math.min(1, state.karma / COMMUNITY_NIRVANA_KARMA));
  var dotStartY = 16;
  var dotY = dotStartY + progress * (cy - dotStartY);
  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.moveTo(cx, dotStartY); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.restore();

  // the community: grows with members
  var r = 14 + 7 * Math.sqrt(state.members);
  if (state.members === 0) r = 10;
  drawTaijitu(ctx, cx, cy, r, communitySpin, ink, paper);

  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.arc(cx, dotY, 5, 0, Math.PI * 2); ctx.fill();

  // labels (as in the original diagram)
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.font = "12px sans-serif";
  ctx.fillText("\u0e09\u0e31\u0e19", cx + 22, Math.min(dotY + 4, cy - 40));
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14", cx, cy - 78);
  ctx.fillText("\u0e17\u0e31\u0e49\u0e07\u0e21\u0e27\u0e25", cx, cy + 100);
  ctx.font = "13px sans-serif";
  ctx.fillText("\u0e40\u0e23\u0e32", cx, cy + r + 18);
}

requestAnimationFrame(drawCommunity);
