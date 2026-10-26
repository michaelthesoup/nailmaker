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
  if (card.rarity === 3) div.className += " legendary";
  div.setAttribute("role", "button");
  div.tabIndex = 0;

  var mark = document.createElement("div");
  mark.className = "card-mark";
  mark.textContent = card.rarity === 3 ? "\u2726" : (card.side === "black" ? "\u25cf" : "\u25cb"); // a star for a legendary card
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

// fade: the first hands fade in; later ones appear at once, so picking many cards stays quick.
function cardHandElement(cards, onPick, fade) {
  var hand = document.createElement("div");
  hand.className = "card-hand" + (fade ? " fade" : "");
  cards.forEach(function (card) { hand.appendChild(cardElement(card, function () { onPick(card); })); });
  return hand;
}

// How good a card looks to the "pick the rest for me" button: rarer is better, your own colour beats the other,
// and an effect your deck doesn't have yet beats a repeat (cards add up within a stat, so variety is worth more).
function cardAutoScore(card, deck, path) {
  var score = card.rarity * 10 + (card.side === path ? 5 : 0);
  for (var key in card.effects) {
    var have = deck.some(function (c) { return c.effects[key] !== undefined; });
    if (!have) score += 3;
  }
  return score;
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

  d.shown = null;
  d.choose = null;

  if (d.path === null) { // the fork
    var fork = cardFork(d.seed, d.karma);
    d.choose = function (card) {
      d.path = card.side;
      d.deck.push(card);
      d.index = 1;
      renderCardDraft();
    };
    d.shown = fork;
    box.appendChild(cardHandElement(fork, d.choose, true));
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

    var hand = cardHand(d.seed, d.index, d.path, d.karma, d.deck);
    d.choose = function (card) {
      d.deck.push(card);
      d.index += 1;
      renderCardDraft();
    };
    d.shown = hand;
    box.appendChild(cardHandElement(hand, d.choose, d.index === 1));
    box.appendChild(cardDeckElement(d.deck));

    if (d.index < d.picks) { // with only one hand left there is nothing to skip
      var rest = document.createElement("button");
      rest.textContent = "pick the rest for me";
      rest.style.marginTop = "14px";
      rest.addEventListener("click", function () {
        while (d.index <= d.picks) {
          var h = cardHand(d.seed, d.index, d.path, d.karma, d.deck);
          var best = h[0];
          for (var i = 1; i < h.length; i++) if (cardAutoScore(h[i], d.deck, d.path) > cardAutoScore(best, d.deck, d.path)) best = h[i];
          d.deck.push(best);
          d.index += 1;
        }
        renderCardDraft();
      });
      box.appendChild(rest);
    }
    return;
  }

  // every pick made: the deck is done
  d.finished = true;
  box.appendChild(cardDeckElement(d.deck));
  d.onDone(d.deck);
}

// Keys 1-4 pick the card in that position (1-2 at the fork), so a long draft doesn't need the mouse.
document.addEventListener("keydown", function (e) {
  var d = cardDraft;
  if (!d || d.finished || !d.shown || !d.choose) return;
  if (el.reincarnateOverlay.style.display !== "flex") return;
  var n = parseInt(e.key, 10);
  if (!(n >= 1 && n <= d.shown.length)) return;
  e.preventDefault();
  d.choose(d.shown[n - 1]);
});

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
    shown: null,
    choose: null,
    finished: false,
    onDone: onDone
  };
  renderCardDraft();
}
