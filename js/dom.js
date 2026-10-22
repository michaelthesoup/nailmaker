"use strict";

// ----------------------------------------------------------------
// DOM refs
// ----------------------------------------------------------------

var el = {
  title: document.getElementById("titleCount"),
  funds: document.getElementById("valFunds"),
  unsold: document.getElementById("valUnsold"),
  price: document.getElementById("valPrice"),
  manualPriceWrap: document.getElementById("manualPriceWrap"),
  manualPrice: document.getElementById("inputPrice"),
  demand: document.getElementById("valDemand"),
  demandYYNote: document.getElementById("valDemandYYNote"),
  marketing: document.getElementById("valMarketing"),
  iron: document.getElementById("valIron"),
  copper: document.getElementById("valCopper"),
  nailMakers: document.getElementById("valNailMakers"),
  nailMakerBonus: document.getElementById("valNailMakerBonus"),
  breakerBonus: document.getElementById("valBreakerBonus"),
  factories: document.getElementById("valFactories"),
  factoryBonus: document.getElementById("valFactoryBonus"),
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
  btnDarkMode: document.getElementById("btnDarkMode"),
  guideOverlay: document.getElementById("guideOverlay"),
  btnGuideClose: document.getElementById("btnGuideClose"),

  valKarma: document.getElementById("valKarma"),
  btnReincarnate: document.getElementById("btnReincarnate"),
  btnPastLives: document.getElementById("btnPastLives"),
  btnStats: document.getElementById("btnStats"),
  statsOverlay: document.getElementById("statsOverlay"),
  statsBody: document.getElementById("statsBody"),
  btnStatsClose: document.getElementById("btnStatsClose"),
  pastLivesOverlay: document.getElementById("pastLivesOverlay"),
  pastLivesBody: document.getElementById("pastLivesBody"),
  btnPastLivesClose: document.getElementById("btnPastLivesClose"),
  endScreenOverlay: document.getElementById("endScreenOverlay"),
  endScreenBody: document.getElementById("endScreenBody"),
  btnEndScreenClose: document.getElementById("btnEndScreenClose"),
  reincarnateOverlay: document.getElementById("reincarnateOverlay"),
  reincarnateGrid: document.getElementById("reincarnateGrid"),
  reincarnateStatus: document.getElementById("reincarnateStatus"),
  btnReincarnateConfirm: document.getElementById("btnReincarnateConfirm"),
  leaderboardList: document.getElementById("leaderboardList"),
  leaderboardNote: document.getElementById("leaderboardNote"),
  leaderboardBody: document.getElementById("leaderboardBody"),
  btnToggleLeaderboard: document.getElementById("btnToggleLeaderboard"),
  leaderboardTabs: document.getElementById("leaderboardTabs"),
  leaderboardSignup: document.getElementById("leaderboardSignup"),
  btnLeaderboardSignup: document.getElementById("btnLeaderboardSignup"),
  btnLbWeek: document.getElementById("btnLbWeek"),
  btnLbAll: document.getElementById("btnLbAll"),
  btnLbChat: document.getElementById("btnLbChat"),
  chatView: document.getElementById("chatView"),
  chatList: document.getElementById("chatList"),
  chatHint: document.getElementById("chatHint"),
  chatInput: document.getElementById("chatInput"),
  btnChatSend: document.getElementById("btnChatSend"),
  chatAdmin: document.getElementById("chatAdmin"),
  btnChatClear: document.getElementById("btnChatClear"),
  btnPlayers: document.getElementById("btnPlayers"),
  btnMore: document.getElementById("btnMore"),
  reincarnateBar: document.getElementById("reincarnateBar"),
  reincarnateBarBody: document.getElementById("reincarnateBarBody"),
  moreWrap: document.getElementById("moreWrap"),
  moreMenu: document.getElementById("moreMenu"),
  profileOverlay: document.getElementById("profileOverlay"),
  profileSearch: document.getElementById("profileSearch"),
  btnProfileMine: document.getElementById("btnProfileMine"),
  profileResults: document.getElementById("profileResults"),
  profileBody: document.getElementById("profileBody"),
  btnProfileClose: document.getElementById("btnProfileClose"),

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
  mapMaterials: document.getElementById("mapMaterials"),
  btnBuyBreaker: document.getElementById("btnBuyBreaker"),
  newsTicker: document.getElementById("newsTicker"),
  newsTrack: document.getElementById("newsTrack"),
  btnAdmin: document.getElementById("btnAdmin"),
  adminOverlay: document.getElementById("adminOverlay"),
  adminBody: document.getElementById("adminBody"),
  btnAdminClose: document.getElementById("btnAdminClose"),

  factoryMaterialUse: document.getElementById("valFactoryMaterialUse"),
  factoryMakerRate: document.getElementById("valFactoryMakerRate"),
  factoryBreakerRate: document.getElementById("valFactoryBreakerRate"),
  sliderFactoryBalance: document.getElementById("sliderFactoryBalance"),
  factoryBreakerPct: document.getElementById("valFactoryBreakerPct"),
  factoryMakerPct: document.getElementById("valFactoryMakerPct"),

  factorySquaredSection: document.getElementById("factorySquaredSection"),
  factorySquaredCount: document.getElementById("valFactorySquaredCount"),
  factorySquaredBonus: document.getElementById("valFactorySquaredBonus"),
  factorySquaredMaterialUse: document.getElementById("valFactorySquaredMaterialUse"),
  factorySquaredOutputRate: document.getElementById("valFactorySquaredOutputRate"),
  btnBuyFactorySquared: document.getElementById("btnBuyFactorySquared"),

  nailMakerIronRate: document.getElementById("valNailMakerIronRate"),
  nailMakerNailsRate: document.getElementById("valNailMakerNailsRate"),
  breakerNailsRate: document.getElementById("valBreakerNailsRate"),
  breakerIronRate: document.getElementById("valBreakerIronRate"),
  breakerCopperRate: document.getElementById("valBreakerCopperRate"),

  machinerySection: document.getElementById("machinerySection"),
  postBreakerSection: document.getElementById("postBreakerSection"),
  factoryBalanceSliderWrap: document.getElementById("factoryBalanceSliderWrap"),
  floorWrap: document.getElementById("floorWrap"),
  btnFloor: document.getElementById("btnFloor"),
  floorOverlay: document.getElementById("floorOverlay"),
  floorBody: document.getElementById("floorBody"),
  btnFloorClose: document.getElementById("btnFloorClose"),
  mapSection: document.getElementById("mapSection"),

  yinYangSection: document.getElementById("yinYangSection"),
  yin: document.getElementById("valYin"),
  yang: document.getElementById("valYang"),
  yinLabel: document.getElementById("lblYin"),
  yangLabel: document.getElementById("lblYang"),
  yinYangLevel: document.getElementById("valYinYangLevel"),
  sliderYinYang: document.getElementById("sliderYinYang"),
  yinYangStatus: document.getElementById("valYinYangStatus"),

  monasterySection: document.getElementById("monasterySection"),
  monasteryCanvas: document.getElementById("monasteryCanvas"),
  monasteryHalls: document.getElementById("valMonasteryHalls"),
  monasteryMonks: document.getElementById("valMonasteryMonks"),
  monasteryMeditating: document.getElementById("valMonasteryMeditating"),
  monasteryMakerBonus: document.getElementById("valMonasteryMakerBonus"),
  monasteryBreakerBonus: document.getElementById("valMonasteryBreakerBonus"),
  btnBuildHall: document.getElementById("btnBuildHall"),
  btnMonkAdd: document.getElementById("btnMonkAdd"),
  btnMonkRemove: document.getElementById("btnMonkRemove"),
  btnForemanAdd: document.getElementById("btnForemanAdd"),
  btnForemanRemove: document.getElementById("btnForemanRemove"),
  monasterySeats: document.getElementById("valMonasterySeats"),
  monasteryForemen: document.getElementById("valMonasteryForemen"),
  monasteryDrain: document.getElementById("valMonasteryDrain"),
  monasteryFactoryBonus: document.getElementById("valMonasteryFactoryBonus"),
  communitySection: document.getElementById("communitySection"),
  communityCanvas: document.getElementById("communityCanvas"),
  communityMembers: document.getElementById("valCommunityMembers"),
  communityHarmony: document.getElementById("valCommunityHarmony"),
  communityRate: document.getElementById("valCommunityRate"),
  communityMerit: document.getElementById("valCommunityMerit"),
  btnRecruitMember: document.getElementById("btnRecruitMember"),

  swarmSection: document.getElementById("swarmSection"),
  swarmCanvas: document.getElementById("swarmCanvas"),
  swarmStatus: document.getElementById("swarmStatus"),
  swarmDotCounts: document.getElementById("swarmDotCounts"),
  swarmIronRates: document.getElementById("swarmIronRates"),
  swarmUnitCounts: document.getElementById("swarmUnitCounts"),
  swarmCostHint: document.getElementById("swarmCostHint"),

  citySection: document.getElementById("citySection"),
  cityCanvas: document.getElementById("cityCanvas"),
  cityBuffs: document.getElementById("cityBuffs"),
  cityBombCount: document.getElementById("valCityBombCount"),
  btnCityBomb: document.getElementById("btnCityBomb"),
  btnOptimalPrice: document.getElementById("btnOptimalPrice"),
  cityBombNumber: document.getElementById("valCityBombNumber"),
  coreNailsLabel: document.getElementById("valCoreNails"),
  coreNailsFill: document.getElementById("coreNailsFill"),
  coreIsotopesLabel: document.getElementById("valCoreIsotopes"),
  coreIsotopesFill: document.getElementById("coreIsotopesFill"),
  bombDropOverlay: document.getElementById("bombDropOverlay"),
  pageShakeWrap: document.getElementById("pageShakeWrap"),
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

// A per-second number with up to two decimals (never rounded away: 100 and 101 must not both read "100"),
// big ones named as usual. 0.9 -> "0.9", 12 -> "12", 0.125 -> "0.13".
function fmtRateNum(n) {
  if (!isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) return fmtAbbrev(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

// A weight per second (iron, copper) with the same care: grams keep their decimals, bigger ones use fmtWeight's units.
function fmtRate(grams) {
  if (!isFinite(grams)) return "0 g";
  if (grams < 1000) return fmtRateNum(grams) + " g";
  return fmtWeight(grams);
}

function fmtWeight(grams) {
  if (grams >= 1e15) return fmtAbbrev(grams / 1e6) + " t"; // beyond gigatons, just name the tonnage
  if (grams >= 1e12) return (grams / 1e12).toFixed(2) + " Gt";
  if (grams >= 1e9) return (grams / 1e9).toFixed(2) + " Mt";
  if (grams >= 1e6) return (grams / 1e6).toFixed(2) + " t";
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
