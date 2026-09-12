"use strict";

// ----------------------------------------------------------------
// DOM refs
// ----------------------------------------------------------------

var el = {
  title: document.getElementById("titleCount"),
  funds: document.getElementById("valFunds"),
  unsold: document.getElementById("valUnsold"),
  price: document.getElementById("valPrice"),
  demand: document.getElementById("valDemand"),
  demandYYNote: document.getElementById("valDemandYYNote"),
  marketing: document.getElementById("valMarketing"),
  iron: document.getElementById("valIron"),
  copper: document.getElementById("valCopper"),
  nailMakers: document.getElementById("valNailMakers"),
  factories: document.getElementById("valFactories"),
  breakers: document.getElementById("valBreakers"),
  avgRev: document.getElementById("valAvgRev"),
  avgNails: document.getElementById("valAvgNails"),
  btnPriceMinus: document.getElementById("btnPriceMinus"),
  btnPricePlus: document.getElementById("btnPricePlus"),
  btnMakeNail: document.getElementById("btnMakeNail"),
  btnBuyMarketing: document.getElementById("btnBuyMarketing"),
  btnBuyIron: document.getElementById("btnBuyIron"),
  btnSellCopper: document.getElementById("btnSellCopper"),
  btnBuyNailMaker: document.getElementById("btnBuyNailMaker"),
  btnBuyFactory: document.getElementById("btnBuyFactory"),
  btnSave: document.getElementById("btnSave"),
  btnLoad: document.getElementById("btnLoad"),
  btnEndRun: document.getElementById("btnEndRun"),
  btnGuide: document.getElementById("btnGuide"),
  guideOverlay: document.getElementById("guideOverlay"),
  btnGuideClose: document.getElementById("btnGuideClose"),

  valKarma: document.getElementById("valKarma"),
  btnReincarnate: document.getElementById("btnReincarnate"),
  reincarnateHint: document.getElementById("reincarnateHint"),
  reincarnateOverlay: document.getElementById("reincarnateOverlay"),
  reincarnateGrid: document.getElementById("reincarnateGrid"),
  reincarnateStatus: document.getElementById("reincarnateStatus"),
  btnReincarnateConfirm: document.getElementById("btnReincarnateConfirm"),
  leaderboardList: document.getElementById("leaderboardList"),
  leaderboardNote: document.getElementById("leaderboardNote"),

  btnAuthToggle: document.getElementById("btnAuthToggle"),
  authOverlay: document.getElementById("authOverlay"),
  authTitle: document.getElementById("authTitle"),
  authError: document.getElementById("authError"),
  authUsername: document.getElementById("authUsername"),
  authPassword: document.getElementById("authPassword"),
  btnAuthSubmit: document.getElementById("btnAuthSubmit"),
  btnAuthClose: document.getElementById("btnAuthClose"),
  linkAuthSwitch: document.getElementById("linkAuthSwitch"),
  mapDisplay: document.getElementById("mapDisplay"),
  mapIndexLabel: document.getElementById("mapIndexLabel"),
  mapHealthText: document.getElementById("mapHealthText"),
  mapHealthFill: document.getElementById("mapHealthFill"),
  btnBuyBreaker: document.getElementById("btnBuyBreaker"),
  btnNextMap: document.getElementById("btnNextMap"),
  btnAutoNextMap: document.getElementById("btnAutoNextMap"),
  cheatBox: document.getElementById("cheatBox"),

  factoryIronRate: document.getElementById("valFactoryIronRate"),
  factoryCopperRate: document.getElementById("valFactoryCopperRate"),
  factoryOutputRate: document.getElementById("valFactoryOutputRate"),
  sliderFactoryBalance: document.getElementById("sliderFactoryBalance"),

  breakerNailsRate: document.getElementById("valBreakerNailsRate"),
  breakerIronRate: document.getElementById("valBreakerIronRate"),
  breakerCopperRate: document.getElementById("valBreakerCopperRate"),

  btnToggleNailMakers: document.getElementById("btnToggleNailMakers"),
  btnToggleFactories: document.getElementById("btnToggleFactories"),
  btnToggleBreakers: document.getElementById("btnToggleBreakers"),

  machinerySection: document.getElementById("machinerySection"),
  tuningSection: document.getElementById("tuningSection"),
  mapSection: document.getElementById("mapSection"),

  yinYangSection: document.getElementById("yinYangSection"),
  yin: document.getElementById("valYin"),
  yang: document.getElementById("valYang"),
  yinYangLevel: document.getElementById("valYinYangLevel"),
  sliderYinYang: document.getElementById("sliderYinYang"),
  yinYangStatus: document.getElementById("valYinYangStatus"),
  yinYangHint: document.getElementById("yinYangHint"),
};

// ----------------------------------------------------------------
// Formatting
// ----------------------------------------------------------------

// Once numbers get big, long digit strings stop being readable at a
// glance -- so past 1000 we switch to "14.4 million" style names
// instead. Below 1000, still just show the plain number.
var NUMBER_SCALE_NAMES = [
  "", " thousand", " million", " billion", " trillion", " quadrillion",
  " quintillion", " sextillion", " septillion", " octillion",
  " nonillion", " decillion", " undecillion", " duodecillion"
];

function fmtAbbrev(n) {
  var neg = n < 0;
  n = Math.abs(n);
  if (n < 1000) return (neg ? "-" : "") + Math.floor(n).toLocaleString();

  var tier = Math.min(Math.floor(Math.log10(n) / 3), NUMBER_SCALE_NAMES.length - 1);
  var scaled = n / Math.pow(1000, tier);
  var decimals = scaled < 10 ? 2 : (scaled < 100 ? 1 : 0);
  return (neg ? "-" : "") + scaled.toFixed(decimals) + NUMBER_SCALE_NAMES[tier];
}

function fmtMoney(n) {
  var neg = n < 0;
  var abs = Math.abs(n);
  if (abs >= 1000) return (neg ? "-$" : "$") + fmtAbbrev(abs);
  if (abs < 0.01) return (neg ? "-$" : "$") + abs.toFixed(4);
  if (abs < 1) return (neg ? "-$" : "$") + abs.toFixed(3);
  return (neg ? "-$" : "$") + abs.toFixed(2);
}

function fmtInt(n) {
  return fmtAbbrev(Math.floor(n));
}

function fmtDecimal(n, places) {
  if (Math.abs(n) >= 1000) return fmtAbbrev(n);
  return n.toFixed(places === undefined ? 1 : places);
}

function fmtWeight(grams) {
  if (grams >= 1000000000000) return fmtAbbrev(grams / 1000000) + " t"; // past a million tons, name the tons
  if (grams >= 1000000) return (grams / 1000000).toFixed(2) + " t";
  if (grams >= 1000) return (grams / 1000).toFixed(2) + " kg";
  return fmtInt(grams) + " g";
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function buyButtonLabel(btn, cooldownUntil, readyText) {
  var ready = Date.now() >= cooldownUntil;
  if (!ready) {
    var secs = Math.max(0, (cooldownUntil - Date.now()) / 1000);
    btn.textContent = "wait " + secs.toFixed(1) + "s";
  } else {
    btn.textContent = readyText;
  }
  return ready;
}
