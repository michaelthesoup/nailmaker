"use strict";

// ----------------------------------------------------------------
// The packs and loadout screen. It is not a screen of its own: it is the second half of
// reincarnation. The ritual's wall of flickering characters (reincarnation.js) settles
// into a black card and a white card, you choose your path (that card goes straight into a
// slot), then you open the packs your karma earned, one at a time. Click a card to take it: it goes to
// your deck, or to your collection if the deck is full; whatever you leave is gone when the next pack
// opens. The deck and the collection (12 places) are both kept from life to life. Clicking a card in the
// deck moves it to the collection and the other way round, and every card has a discard button. "Open all"
// opens every pack in a quick run and chooses for you. "Begin new life" ends it. The cards themselves (what they do,
// how they are made, how they stack) live in cards.js; this file only draws them and handles
// the clicks.
//
// Nothing here touches the saved game until "begin new life" (reincarnation.js calls cardsCommit),
// so closing the page halfway loses nothing.
// ----------------------------------------------------------------

var loadout = null; // { box, seed, karma, slots, path, packsTotal, packsOpened, opened, current, kept, equipped, message, busy, reel, onReady, shown, choose }

// One card as a clickable element. Black cards are black, white cards are white, in both light and dark mode.
// opts: { mini, equipped }
function cardElement(card, onPick, opts) {
  opts = opts || {};
  var div = document.createElement("div");
  div.className = "card " + card.side + " r" + card.rarity;
  if (card.rarity === 3) div.className += " legendary";
  if (opts.mini) div.className += " mini";
  if (opts.equipped) div.className += " equipped";
  div.setAttribute("role", "button");
  div.tabIndex = 0;

  var mark = document.createElement("div");
  mark.className = "card-mark";
  mark.textContent = card.rarity === 3 ? "✦" : (card.side === "black" ? "●" : "○"); // a star for a legendary card
  div.appendChild(mark);

  var text = document.createElement("div");
  text.className = "card-text";
  cardLines(card).forEach(function (line) {
    var p = document.createElement("div");
    p.textContent = line;
    text.appendChild(p);
  });
  div.appendChild(text);

  var rarity = document.createElement("div");
  rarity.className = "card-rarity";
  rarity.textContent = CARD_RARITY_NAMES[card.rarity];
  div.appendChild(rarity);

  if (onPick) {
    div.addEventListener("click", onPick);
    div.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); }
    });
  } else {
    div.style.cursor = "default";
  }
  return div;
}

function loadoutText(className, text) {
  var d = document.createElement("div");
  d.className = className;
  d.textContent = text;
  return d;
}

function loadoutButton(label, onClick, disabled) {
  var b = document.createElement("button");
  b.textContent = label;
  b.style.marginRight = "8px";
  if (disabled) b.disabled = true;
  b.addEventListener("click", onClick);
  return b;
}

// What the loadout adds up to so far, as plain lines.
function cardDeckElement(deck) {
  var box = document.createElement("div");
  box.className = "card-deck";
  var lines = cardTotalsLines(deck);
  if (lines.length === 0) return box;
  box.appendChild(loadoutText("sheet-heading", "your deck adds up to"));
  lines.forEach(function (line) { box.appendChild(loadoutText("", line)); });
  return box;
}

function loadoutReady() {
  var d = loadout;
  return !!d && !d.busy && d.path !== null && d.equipped.length > 0;
}

function loadoutChanged() {
  var d = loadout;
  d.onReady(loadoutReady());
  renderLoadout();
}

function loadoutRemoveFromPack(card) {
  var i = loadout.current.indexOf(card);
  if (i >= 0) loadout.current.splice(i, 1);
}

function loadoutChoosePath(card) {
  var d = loadout;
  // Picking the other colour from your last life resets your deck: its cards go to the collection (12 places, the
  // rest are discarded). Ask first. Picking the same colour as last time, or having no deck yet, asks nothing.
  var oldDeck = d.equipped;
  if (oldDeck.length > 0 && oldDeck[0].side !== card.side) {
    var room = Math.max(0, CARD_COLLECTION_MAX - d.kept.length);
    var toCollection = Math.min(oldDeck.length, room), discarded = oldDeck.length - toCollection;
    var ok = window.confirm(
      "Your deck is " + oldDeck[0].side + ", and you chose " + card.side + ". A deck holds one colour, so this resets your deck:\n\n" +
      toCollection + " of its " + oldDeck.length + " card" + (oldDeck.length === 1 ? "" : "s") + " move" + (toCollection === 1 ? "s" : "") + " to your collection" +
      (discarded > 0 ? ", and " + discarded + " " + (discarded === 1 ? "is" : "are") + " discarded because the collection is full" : "") + ".\n\nContinue?");
    if (!ok) return;
  }
  d.path = card.side;
  // The deck is saved from life to life, so it comes in with you. Any card that the new path has no room for
  // (the other colour is limited) goes to the collection, or is lost if that is full.
  var carried = d.equipped;
  d.equipped = [];
  var moved = 0, lost = 0;
  carried.forEach(function (c) {
    if (!cardLoadoutBlock(d.equipped, c, d.slots, d.path)) d.equipped.push(c);
    else if (d.kept.length < CARD_COLLECTION_MAX) { d.kept.push(c); moved++; }
    else lost++;
  });
  var note = moved || lost ? (moved + lost) + " card" + (moved + lost === 1 ? "" : "s") + " from your last deck did not fit this path: " + moved + " moved to your collection" + (lost ? ", " + lost + " discarded" : "") + "." : "";
  loadoutTake(card, "fork"); // the fork card is a free pick
  var placed = d.equipped.indexOf(card) >= 0 || d.kept.indexOf(card) >= 0;
  d.message = note + (placed ? "" : " Your deck and collection are full, so the card you chose was discarded.");
  loadoutChanged();
}

function loadoutOpenPack() {
  var d = loadout;
  if (d.busy || d.packsOpened >= d.packsTotal) return;
  d.packsOpened += 1;
  d.current = cardPack(d.seed, d.packsOpened, d.path, d.karma);
  d.opened += d.current.length;
  d.message = "";
  loadoutChanged();
}

// A card from the pack: it goes to the deck, or to the collection if the deck is full. With both full it stays in the
// pack until you discard something.
function loadoutTake(card, from) {
  var d = loadout;
  d.message = "";
  if (!cardLoadoutBlock(d.equipped, card, d.slots, d.path)) {
    d.equipped.push(card);
  } else if (d.kept.length < CARD_COLLECTION_MAX) {
    d.kept.push(card);
  } else {
    if (from !== "fork") { d.message = "your deck and your collection are full: discard a card to make room."; renderLoadout(); }
    return;
  }
  loadoutRemoveFromPack(card);
  loadoutChanged();
}

// A card in the deck goes to the collection. With the collection full, you have to discard something first.
function loadoutToCollection(card) {
  var d = loadout;
  if (d.busy) return;
  if (d.kept.length >= CARD_COLLECTION_MAX) { d.message = "your collection is full: discard a card to make room."; renderLoadout(); return; }
  var i = d.equipped.indexOf(card);
  if (i >= 0) d.equipped.splice(i, 1);
  d.kept.push(card);
  d.message = "";
  loadoutChanged();
}

// A card in the collection goes to the deck, if the deck has room for it.
function loadoutToDeck(card) {
  var d = loadout;
  if (d.busy) return;
  var why = cardLoadoutBlock(d.equipped, card, d.slots, d.path);
  if (why) { d.message = "can't put it in your deck: " + why + "."; renderLoadout(); return; }
  d.kept.splice(d.kept.indexOf(card), 1);
  d.equipped.push(card);
  d.message = "";
  loadoutChanged();
}

// Gets rid of a card for good, from the deck or the collection.
function loadoutDiscard(card) {
  var d = loadout;
  if (d.busy) return;
  var i = d.equipped.indexOf(card);
  if (i >= 0) d.equipped.splice(i, 1);
  i = d.kept.indexOf(card);
  if (i >= 0) d.kept.splice(i, 1);
  i = d.current.indexOf(card);
  if (i >= 0) d.current.splice(i, 1);
  d.message = "";
  loadoutChanged();
}

function loadoutOpenAll() {
  var d = loadout;
  if (d.busy || d.packsOpened >= d.packsTotal) return;
  var total = d.packsTotal - d.packsOpened;
  var delay = Math.max(30, Math.min(170, Math.round(3200 / total)));
  var tally = { packs: 0, legendary: 0, banked: 0 };
  var run = loadout;
  d.busy = true;
  d.message = "";
  d.current = [];
  d.onReady(false);

  function step() {
    if (loadout !== run) return; // the ritual was abandoned
    if (d.packsOpened >= d.packsTotal) { finish(); return; }
    d.packsOpened += 1;
    var pack = cardPack(d.seed, d.packsOpened, d.path, d.karma);
    d.opened += pack.length;
    var stats = cardAutoPack(pack, { kept: d.kept });
    tally.packs += 1;
    tally.banked += stats.banked;
    tally.legendary += pack.filter(function (c) { return c.rarity === 3; }).length;
    d.reel = { pack: pack, tally: tally };
    renderLoadout();
    setTimeout(step, delay);
  }

  function finish() {
    d.busy = false;
    d.reel = null;
    d.current = [];
    d.message = "opened " + tally.packs + " pack" + (tally.packs === 1 ? "" : "s") + ": " + tally.legendary + " legendary" +
      (tally.legendary ? " (" + tally.banked + " put in your collection" + (tally.legendary > tally.banked ? ", the rest had no room" : "") + ")" : "") +
      ". Your deck is as you left it.";
    loadoutChanged();
  }

  renderLoadout();
  setTimeout(step, 250);
}

function renderReel(box) {
  var d = loadout;
  var r = d.reel;
  box.appendChild(loadoutText("sheet-heading", "opening packs... " + d.packsOpened + " of " + d.packsTotal));
  if (!r) return;
  var legendary = r.pack.some(function (c) { return c.rarity === 3; });
  var row = document.createElement("div");
  row.className = "card-hand reel" + (legendary ? " reel-legend" : "");
  r.pack.forEach(function (c) { row.appendChild(cardElement(c, null, { mini: true })); });
  box.appendChild(row);
  box.appendChild(loadoutText("hint", legendary ? "✦ legendary ✦" : " "));
  box.appendChild(loadoutText("hint", r.tally.legendary + " legendary so far, " + r.tally.banked + " in your collection"));
}

function renderLoadout() {
  var d = loadout;
  var box = d.box;
  var overlay = el.reincarnateOverlay;
  var scroll = overlay ? overlay.scrollTop : 0;
  box.innerHTML = "";
  d.shown = null;
  d.choose = null;

  if (d.path === null) { // the fork
    var fork = cardFork(d.seed, d.karma);
    d.choose = loadoutChoosePath;
    d.shown = fork;
    var forkRow = document.createElement("div");
    forkRow.className = "card-hand fade";
    var oldSide = state.deck && state.deck.length ? state.deck[0].side : null;
    if (oldSide) box.appendChild(loadoutText("hint", "your deck is " + oldSide + ". Choosing " + (oldSide === "black" ? "white" : "black") + " moves it to your collection (12 places; any cards that don't fit are discarded)."));
    fork.forEach(function (card) { forkRow.appendChild(cardElement(card, function () { loadoutChoosePath(card); })); });
    box.appendChild(forkRow);
    box.appendChild(loadoutText("card-note", "choose your path wisely"));
    return;
  }

  if (d.busy) {
    renderReel(box);
    if (overlay) overlay.scrollTop = scroll;
    return;
  }

  // ---- packs ----
  var left = d.packsTotal - d.packsOpened;
  box.appendChild(loadoutText("sheet-heading", "packs (" + d.packsOpened + " of " + d.packsTotal + " opened)"));
  if (left > 0) {
    box.appendChild(loadoutText("hint", "each karma you hold is a pack of five. Whatever you don't take is gone when the next pack opens."));
    box.appendChild(loadoutButton("open a pack", loadoutOpenPack));
    if (left > 1) box.appendChild(loadoutButton("open all " + left, loadoutOpenAll));
  } else {
    box.appendChild(loadoutText("hint", "all packs opened."));
  }
  if (d.current.length > 0) {
    box.appendChild(loadoutText("hint", "click a card to take it. It goes to your deck, or to your collection if the deck is full."));
    var row = document.createElement("div");
    row.className = "card-hand";
    d.current.forEach(function (c) {
      var tile = document.createElement("div");
      tile.className = "card-tile";
      tile.appendChild(cardElement(c, function () { loadoutTake(c, "pack"); }, { mini: true }));
      row.appendChild(tile);
    });
    box.appendChild(row);
  }

  // ---- deck ----
  box.appendChild(loadoutText("sheet-heading", "your deck (" + d.equipped.length + " of " + d.slots + ")"));
  var slotsRow = document.createElement("div");
  slotsRow.className = "card-slots";
  for (var i = 0; i < d.slots; i++) {
    var card = d.equipped[i];
    if (card) {
      var tile = document.createElement("div");
      tile.className = "card-tile";
      tile.appendChild(cardElement(card, (function (c) { return function () { loadoutToCollection(c); }; })(card), { mini: true }));
      tile.appendChild(loadoutButton("discard", (function (c) { return function () { loadoutDiscard(c); }; })(card), false)).className = "card-keep";
      slotsRow.appendChild(tile);
    } else {
      var slot = document.createElement("div");
      slot.className = "card-slot-empty";
      slot.textContent = "empty";
      slotsRow.appendChild(slot);
    }
  }
  box.appendChild(slotsRow);
  box.appendChild(loadoutText("hint", "click a card in your deck to move it to your collection. Your deck holds " + d.path + " cards only; the collection can hold either colour."));
  box.appendChild(loadoutButton("equip best", function () {
    var all = d.equipped.concat(d.kept);
    var best = cardAutoLoadout(all, d.slots, d.path);
    d.kept = cardSorted(all.filter(function (c) { return best.indexOf(c) < 0; })).slice(0, CARD_COLLECTION_MAX);
    d.equipped = best;
    d.message = "";
    loadoutChanged();
  }));
  box.appendChild(loadoutText("hint", "equip best picks the strongest deck from your deck and your collection."));

  if (d.message) box.appendChild(loadoutText("card-warn", d.message));
  box.appendChild(cardDeckElement(d.equipped));
  if (d.equipped.length === 0) box.appendChild(loadoutText("hint", "put at least one card in a slot, then begin (you can begin before every pack is open)."));

  // ---- collection ----
  box.appendChild(loadoutText("sheet-heading", "your collection (" + d.kept.length + " of " + CARD_COLLECTION_MAX + ")"));
  box.appendChild(loadoutText("hint", d.kept.length === 0
    ? "cards you put here are saved from life to life."
    : "click a card to put it in your deck."));
  if (d.kept.length > 0) {
    var grid = document.createElement("div");
    grid.className = "card-hand";
    d.kept.forEach(function (c) {
      var tile = document.createElement("div");
      tile.className = "card-tile";
      tile.appendChild(cardElement(c, function () { loadoutToDeck(c); }, { mini: true }));
      tile.appendChild(loadoutButton("discard", function () { loadoutDiscard(c); }, false)).className = "card-keep";
      grid.appendChild(tile);
    });
    box.appendChild(grid);
  }

  if (overlay) overlay.scrollTop = scroll;
}

// Keys 1 and 2 pick the card at the fork.
document.addEventListener("keydown", function (e) {
  var d = loadout;
  if (!d || !d.shown || !d.choose || d.path !== null) return;
  if (el.reincarnateOverlay.style.display !== "flex") return;
  var n = parseInt(e.key, 10);
  if (!(n >= 1 && n <= d.shown.length)) return;
  e.preventDefault();
  d.choose(d.shown[n - 1]);
});

// Called by the ritual when the noise has settled. box is where the cards are drawn; karma is the total this
// reincarnation will leave you with; packs is how many packs to open (your total karma);
// onReady(true/false) is called whenever the loadout becomes ready (or stops being) to begin.
function showLoadout(box, karma, packs, onReady) {
  loadout = {
    box: box,
    seed: state.draftSeed,
    karma: karma,
    slots: cardSlots(karma),
    path: null,
    packsTotal: cardPackCount(packs),
    packsOpened: 0,
    opened: 0,
    current: [],
    kept: Array.isArray(state.collection) ? state.collection.slice() : [],  // the collection and the deck are both kept from life to life
    equipped: Array.isArray(state.deck) ? state.deck.slice() : [],
    message: "",
    busy: false,
    reel: null,
    onReady: onReady,
    shown: null,
    choose: null
  };
  onReady(false);
  renderLoadout();
}

// What the player chose, for reincarnation.js to commit: { equipped, kept, opened, packs, path }
function loadoutResult() {
  var d = loadout;
  if (!d) return null;
  return { equipped: d.equipped.slice(), kept: d.kept.slice(), opened: d.opened + (d.path ? 1 : 0), packs: d.packsOpened, path: d.path };
}


// ---------------- "deck & collection" in the more menu ----------------
// Shows the cards you hold (the deck and the collection) outside a reincarnation. Built here, so it needs no markup.

(function () {
  var menu = el.moreMenu;
  if (!menu) return;
  var btn = document.createElement("button");
  btn.id = "btnCards";
  btn.textContent = "deck & collection";
  btn.style.display = "none";
  var anchor = document.getElementById("btnStats");
  menu.insertBefore(btn, anchor || menu.firstChild);

  var overlay = document.createElement("div");
  overlay.id = "cardsOverlay";
  overlay.className = "sheet-overlay";
  var box = document.createElement("div");
  box.className = "sheet-box";
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function holdsCards() {
    return (Array.isArray(state.deck) && state.deck.length > 0) || (Array.isArray(state.collection) && state.collection.length > 0);
  }

  function cardGrid(cards) {
    var grid = document.createElement("div");
    grid.className = "card-hand";
    cards.forEach(function (c) {
      var tile = document.createElement("div");
      tile.className = "card-tile";
      tile.appendChild(cardElement(c, null, { mini: true }));
      grid.appendChild(tile);
    });
    return grid;
  }

  function render() {
    box.innerHTML = "";
    var title = document.createElement("div");
    title.className = "sheet-title";
    title.textContent = "deck & collection";
    box.appendChild(title);

    var deck = Array.isArray(state.deck) ? state.deck : [];
    var kept = Array.isArray(state.collection) ? state.collection : [];
    box.appendChild(loadoutText("sheet-heading", "your deck (" + deck.length + " of " + cardSlots(state.karma) + " places)"));
    if (deck.length === 0) box.appendChild(loadoutText("hint", "empty."));
    else { box.appendChild(cardGrid(deck)); box.appendChild(cardDeckElement(deck)); }

    box.appendChild(loadoutText("sheet-heading", "your collection (" + kept.length + " of " + CARD_COLLECTION_MAX + " places)"));
    if (kept.length === 0) box.appendChild(loadoutText("hint", "empty."));
    else box.appendChild(cardGrid(kept));
    box.appendChild(loadoutText("hint", "You can change them when you reincarnate."));

    var actions = document.createElement("div");
    actions.className = "sheet-actions";
    actions.appendChild(loadoutButton("close", function () { overlay.style.display = "none"; }));
    box.appendChild(actions);
  }

  btn.addEventListener("click", function () {
    render();
    overlay.style.display = "flex";
    box.scrollTop = 0;
  });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.style.display = "none"; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") overlay.style.display = "none"; });
  if (el.btnMore) el.btnMore.addEventListener("click", function () { btn.style.display = holdsCards() ? "" : "none"; });
})();
