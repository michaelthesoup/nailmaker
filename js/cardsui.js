"use strict";

// ----------------------------------------------------------------
// The card draft screen. It is not a screen of its own: it is the second half of
// reincarnation. The ritual's wall of flickering characters (reincarnation.js) settles
// into a black card and a white card, you choose your path, then pick one card from a hand
// of four for every karma you hold, and "begin new life" ends it. The cards themselves
// (what they do, how they are made, how they stack) live in cards.js; this file only
// draws them and handles the clicks.
// ----------------------------------------------------------------

var cardDraft = null; // { box, seed, karma, picks, path, deck, index, onDone }

// One card as a clickable element. Black cards are black, white cards are white, in both light and dark mode.
function cardElement(card, onPick) {
  var div = document.createElement("div");
  div.className = "card " + card.side + " r" + card.rarity;
  div.setAttribute("role", "button");
  div.tabIndex = 0;

  var mark = document.createElement("div");
  mark.className = "card-mark";
  mark.textContent = card.side === "black" ? "\u25cf" : "\u25cb";
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

  div.addEventListener("click", onPick);
  div.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); }
  });
  return div;
}

function cardHandElement(cards, onPick) {
  var hand = document.createElement("div");
  hand.className = "card-hand";
  cards.forEach(function (card) { hand.appendChild(cardElement(card, function () { onPick(card); })); });
  return hand;
}

// What the deck adds up to so far, as plain lines.
function cardDeckElement(deck) {
  var box = document.createElement("div");
  box.className = "card-deck";
  var lines = cardTotalsLines(deck);
  if (lines.length === 0) return box;
  var head = document.createElement("div");
  head.className = "sheet-heading";
  head.textContent = "your deck (" + deck.length + " card" + (deck.length === 1 ? "" : "s") + ")";
  box.appendChild(head);
  lines.forEach(function (line) {
    var d = document.createElement("div");
    d.textContent = line;
    box.appendChild(d);
  });
  return box;
}

function renderCardDraft() {
  var d = cardDraft;
  var box = d.box;
  box.innerHTML = "";

  if (d.path === null) { // the fork
    var fork = cardFork(d.seed, d.karma);
    box.appendChild(cardHandElement(fork, function (card) {
      d.path = card.side;
      d.deck.push(card);
      d.index = 1;
      renderCardDraft();
    }));
    var note = document.createElement("div");
    note.className = "card-note";
    note.textContent = "choose your path wisely";
    box.appendChild(note);
    return;
  }

  if (d.index <= d.picks) {
    var count = document.createElement("div");
    count.className = "hint";
    count.textContent = "card " + d.index + " of " + d.picks;
    box.appendChild(count);

    var hand = cardHand(d.seed, d.index, d.path, cardOppositeCount(d.deck, d.path), d.karma);
    box.appendChild(cardHandElement(hand, function (card) {
      d.deck.push(card);
      d.index += 1;
      renderCardDraft();
    }));
    box.appendChild(cardDeckElement(d.deck));
    return;
  }

  // every pick made: the deck is done
  box.appendChild(cardDeckElement(d.deck));
  d.onDone(d.deck);
}

// Called by the ritual when the noise has settled. box is where the cards are drawn; karma is the total this
// reincarnation will leave you with (one hand of four for each); onDone(deck) is called when the last card is picked.
function showCardDraft(box, karma, onDone) {
  cardDraft = {
    box: box,
    seed: state.draftSeed,
    karma: karma,
    picks: cardPickCount(karma),
    path: null,
    deck: [],
    index: 0,
    onDone: onDone
  };
  renderCardDraft();
}
