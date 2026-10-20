"use strict";

// ----------------------------------------------------------------
// Lands. Everyone starts their first life in the capital, in the middle of the
// map, which has no bonuses. When you reincarnate you choose where to be
// reborn: the capital again, or one of the islands around it. Every island has
// one or two big bonuses (and no drawbacks) that apply for that whole life.
// Nothing is granted or set up at birth: the game just asks regionMult() and
// friends whenever it works something out, so a land can never leave the game
// in a half-built state.
//
// The text shown to the player is generated from the numbers below, so the
// ritual, the map screen and the numbers themselves can never disagree.
//
// An effect is one of three kinds:
//   mult  a multiplier, 1 = no change         (most of them)
//   add   a number added to something          (deposits)
//   set   replaces a game number outright      (factoryGrowth)
//
//   machineCost   price of makers, breakers and factories
//   factoryCost   price of a factory only                    (spare)
//   factoryGrowth how much dearer each factory makes the next (the game's own number is FACTORY_COST_GROWTH)
//   copperCost    copper a factory cycle uses
//   breakerSpeed  ore per nail the breakers take             (spare)
//   saleMult      money per nail sold
//   demandMult    public demand
//   marketingCost price of marketing levels                  (spare)
//   yinYangSpeed  how fast the yin & yang bars fill
//   deposits      deposits added to every map
// ----------------------------------------------------------------

var REGIONS = [
  { id: "capital",    name: "the capital",   glyph: "#", effects: {} },
  { id: "holy",       name: "israel",     glyph: "+", effects: { yinYangSpeed: 2 } },
  { id: "gilded",     name: "gilded shore",  glyph: "$", effects: { saleMult: 1.5 } },
  { id: "rusthaven",  name: "rusthaven",     glyph: "^", effects: { deposits: 15 } },
  { id: "lanternport", name: "lanternport",  glyph: "*", effects: { demandMult: 1.5 } },
  { id: "gearhold",   name: "gearhold",      glyph: "%", effects: { machineCost: 0.5, factoryGrowth: 1.1 } },
  { id: "verdigris",  name: "verdigris",     glyph: "=", effects: { copperCost: 0.5 } }
];

// The picture: digits are lands (1 = the first above, the capital in the middle), anything else is sea.
var REGION_MAP_COLS = 30;
var REGION_MAP_ROWS = [
  "..............................",
  "...22222222........33333333...",
  "..2222222222......3333333333..",
  "...22222222........33333333...",
  "...........11111111...........",
  "..44444.....1111111111.55555..",
  ".4444444....1111111111..555555",
  ".4444444....1111111111..555555",
  "..44444.....1111111111.55555..",
  "...........11111111...........",
  "...66666666........77777777...",
  "..6666666666......7777777777..",
  "...66666666........77777777...",
  ".............................."
];

function regionPct(n) { return String(Math.round(Math.abs(n) * 100)); }

// text for each effect. mult: whether a higher number is good for the player, and the words for up and down.
var REGION_EFFECT_TEXT = {
  machineCost:   { kind: "mult", goodWhen: "low",  up: "machines {p}% dearer",            down: "machines {p}% cheaper" },
  factoryCost:   { kind: "mult", goodWhen: "low",  up: "factories {p}% dearer",           down: "factories {p}% cheaper" },
  copperCost:    { kind: "mult", goodWhen: "low",  up: "factory copper cost {p}% higher", down: "factory copper cost {p}% lower" },
  breakerSpeed:  { kind: "mult", goodWhen: "high", up: "breakers {p}% faster",            down: "breakers {p}% slower" },
  saleMult:      { kind: "mult", goodWhen: "high", up: "nails sell for {p}% more",        down: "nails sell for {p}% less" },
  demandMult:    { kind: "mult", goodWhen: "high", up: "public demand {p}% higher",       down: "public demand {p}% lower" },
  marketingCost: { kind: "mult", goodWhen: "low",  up: "marketing {p}% dearer",           down: "marketing {p}% cheaper" },
  yinYangSpeed:  { kind: "mult", goodWhen: "high", up: "yin & yang {p}% faster",          down: "yin & yang {p}% slower" },
  deposits:      { kind: "add",  text: function (n) { return n + " more deposits on every map"; } },
  factoryGrowth: { kind: "set",  text: function (v) {
    return "each factory is only " + regionPct(v - 1) + "% dearer than the last (not " + regionPct(FACTORY_COST_GROWTH - 1) + "%)";
  } }
};

function regionById(id) {
  for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
  return null;
}

// The raw number a land gives for one thing, or undefined. With no id given it uses the land of the
// life being played. (The ritual passes the land being looked at instead.)
function regionEffect(key, regionId) {
  if (regionId === undefined) regionId = (typeof state !== "undefined" && state) ? state.region : "";
  var region = regionById(regionId);
  return region ? region.effects[key] : undefined;
}

function regionMult(key, regionId) {
  var v = regionEffect(key, regionId);
  return typeof v === "number" ? v : 1;
}

function regionAdd(key, regionId) {
  var v = regionEffect(key, regionId);
  return typeof v === "number" ? v : 0;
}

function regionSet(key, fallback, regionId) {
  var v = regionEffect(key, regionId);
  return typeof v === "number" ? v : fallback;
}

// [[text, isGood], ...] with the good ones first. Empty for the capital.
function regionEffectLines(region) {
  var lines = [];
  for (var key in region.effects) {
    var t = REGION_EFFECT_TEXT[key];
    var v = region.effects[key];
    if (!t || typeof v !== "number") continue;
    if (t.kind === "mult") {
      if (v === 1) continue;
      var up = v > 1;
      lines.push([(up ? t.up : t.down).replace("{p}", regionPct(v - 1)), (t.goodWhen === "high") === up]);
    } else {
      lines.push([t.text(v), true]);
    }
  }
  lines.sort(function (a, b) { return (b[1] ? 1 : 0) - (a[1] ? 1 : 0); });
  return lines;
}

// Draws the map and a row of names into container. onPick(id) is called when a land is clicked.
// Returns { select(id), setCounts(counts) } so the caller can mark the chosen land and show player counts.
function buildRegionMap(container, onPick) {
  container.innerHTML = "";
  var map = document.createElement("div");
  map.className = "region-map";
  var cells = [];
  var buttons = [];

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
