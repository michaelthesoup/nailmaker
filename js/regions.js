"use strict";

// ----------------------------------------------------------------
// Lands. When you reincarnate you choose where to be reborn from a small
// map. Every land has a few effects, each a plain multiplier (1 = no change),
// that apply for that whole life. Nothing is granted or set up at birth: the
// game just asks regionMult() whenever it works something out, so a land can
// never leave the game in a half-built state. Someone who has never
// reincarnated has no land, and every multiplier is 1.
//
// The text shown to the player is generated from the numbers below, so the
// ritual, the stats screen and the numbers themselves can never disagree.
//
//   factoryCost   price of a factory                 machineCost  price of makers, breakers and factories
//   copperCost    copper a factory cycle uses        breakerSpeed ore per nail the breakers take
//   saleMult      money per nail sold                demandMult   public demand
//   marketingCost price of marketing levels          yinYangSpeed how fast the yin & yang bars fill
//   deposits      how many deposits each map gets
// ----------------------------------------------------------------

var REGIONS = [
  { id: "peaks",    name: "Iron peaks",     glyph: "^", effects: { factoryCost: 0.85, saleMult: 0.90 } },
  { id: "basin",    name: "Copper basin",   glyph: ":", effects: { copperCost: 0.80, breakerSpeed: 0.90 } },
  { id: "coast",    name: "Merchant coast", glyph: "~", effects: { saleMult: 1.15, factoryCost: 1.20 } },
  { id: "holy",     name: "Holy land",      glyph: "+", effects: { yinYangSpeed: 1.15, factoryCost: 1.15 } },
  { id: "capital",  name: "The capital",    glyph: "#", effects: { demandMult: 1.20, marketingCost: 1.25 } },
  { id: "forest",   name: "Old forest",     glyph: "T", effects: { deposits: 1.25, yinYangSpeed: 0.90 } },
  { id: "frontier", name: "Frontier",       glyph: ",", effects: { machineCost: 0.90, demandMult: 0.85 } }
];

// The picture: digits are lands (1 = the first above), anything else is sea.
var REGION_MAP_COLS = 30;
var REGION_MAP_ROWS = [
  "..............................",
  "....11111111.....33333333.....",
  "...1111111111...3333333333....",
  "...111111111112333333333333...",
  "....222222.555555555.444444...",
  "..2222222225555555555444444444",
  "...222222225555555555444444...",
  "....66666665555555777444444...",
  ".....666666666777777777.......",
  "......6666666677777777........",
  ".......66666...777777.........",
  ".............................."
];

// text for each effect: whether a higher number is good for the player, and the words for up and down
var REGION_EFFECT_TEXT = {
  factoryCost:   { goodWhen: "low",  up: "factories {p}% dearer",         down: "factories {p}% cheaper" },
  machineCost:   { goodWhen: "low",  up: "machines {p}% dearer",          down: "machines {p}% cheaper" },
  copperCost:    { goodWhen: "low",  up: "factory copper cost {p}% higher", down: "factory copper cost {p}% lower" },
  breakerSpeed:  { goodWhen: "high", up: "breakers {p}% faster",          down: "breakers {p}% slower" },
  saleMult:      { goodWhen: "high", up: "nails sell for {p}% more",      down: "nails sell for {p}% less" },
  yinYangSpeed:  { goodWhen: "high", up: "yin & yang {p}% faster",        down: "yin & yang {p}% slower" },
  demandMult:    { goodWhen: "high", up: "public demand {p}% higher",     down: "public demand {p}% lower" },
  marketingCost: { goodWhen: "low",  up: "marketing {p}% dearer",         down: "marketing {p}% cheaper" },
  deposits:      { goodWhen: "high", up: "{p}% more deposits",            down: "{p}% fewer deposits" }
};

function regionById(id) {
  for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
  return null;
}

// The multiplier a land applies to one thing; 1 when there is no land. With no id given it
// uses the land of the life being played. (The ritual passes the land being looked at instead.)
function regionMult(key, regionId) {
  if (regionId === undefined) regionId = (typeof state !== "undefined" && state) ? state.region : "";
  var region = regionById(regionId);
  if (!region) return 1;
  var v = region.effects[key];
  return typeof v === "number" ? v : 1;
}

// [[text, isGood], ...] with the good ones first
function regionEffectLines(region) {
  var lines = [];
  for (var key in region.effects) {
    var t = REGION_EFFECT_TEXT[key];
    var v = region.effects[key];
    if (!t || typeof v !== "number" || v === 1) continue;
    var up = v > 1;
    lines.push([(up ? t.up : t.down).replace("{p}", String(Math.round(Math.abs(v - 1) * 100))), (t.goodWhen === "high") === up]);
  }
  lines.sort(function (a, b) { return (b[1] ? 1 : 0) - (a[1] ? 1 : 0); });
  return lines;
}

// Draws the map and a row of names into container. onPick(id) is called when a land is clicked.
// Returns { select(id) } so the caller can mark the chosen land.
function buildRegionMap(container, onPick) {
  container.innerHTML = "";
  var map = document.createElement("div");
  map.className = "region-map";
  var cells = [];

  function paint(hoverId, selectedId) {
    for (var i = 0; i < cells.length; i++) {
      var id = cells[i].getAttribute("data-region");
      cells[i].className = "land" + (id === selectedId ? " sel" : (id === hoverId ? " hov" : ""));
    }
  }
  var selected = null;
  var api = {
    select: function (id) {
      selected = id;
      paint(null, id);
      for (var k = 0; k < buttons.length; k++) buttons[k].btn.className = buttons[k].id === id ? "region-name on" : "region-name";
    },
    // counts: land id -> number of players; shown beside the name when above zero
    setCounts: function (counts) {
      for (var k = 0; k < buttons.length; k++) {
        var n = counts[buttons[k].id] || 0;
        buttons[k].btn.textContent = regionById(buttons[k].id).name + (n > 0 ? " (" + n + ")" : "");
      }
    }
  };

  for (var r = 0; r < REGION_MAP_ROWS.length; r++) {
    for (var c = 0; c < REGION_MAP_COLS; c++) {
      var ch = REGION_MAP_ROWS[r].charAt(c);
      var index = parseInt(ch, 10);
      var span = document.createElement("span");
      if (index >= 1 && index <= REGIONS.length) {
        var region = REGIONS[index - 1];
        span.className = "land";
        span.textContent = region.glyph;
        span.title = region.name;
        span.setAttribute("data-region", region.id);
        (function (id) {
          span.addEventListener("mouseenter", function () { paint(id, selected); });
          span.addEventListener("mouseleave", function () { paint(null, selected); });
          span.addEventListener("click", function () { onPick(id); });
        })(region.id);
        cells.push(span);
      } else {
        span.className = "sea";
        span.textContent = "\u00b7";
      }
      map.appendChild(span);
    }
    map.appendChild(document.createTextNode("\n"));
  }
  container.appendChild(map);

  var names = document.createElement("div");
  names.className = "region-names";
  var buttons = [];
  REGIONS.forEach(function (region) {
    var btn = document.createElement("button");
    btn.className = "region-name";
    btn.textContent = region.name;
    btn.addEventListener("click", function () { onPick(region.id); });
    names.appendChild(btn);
    buttons.push({ id: region.id, btn: btn });
  });
  container.appendChild(names);
  return api;
}
