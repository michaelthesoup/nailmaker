"use strict";

// ----------------------------------------------------------------
// The skill tree screen. It is not a screen of its own: it is the second half
// of reincarnation. The ritual's wall of flickering characters (reincarnation.js)
// resolves into this tree, you spend your skill points, and "begin new life" ends it.
// The tree itself (nodes, costs, effects, which nodes are visible) lives in skills.js;
// this file only draws it and handles the clicks.
//
// Only what you have learned, and the next step off each learned node, is drawn. Click a
// node to read it; the bar fixed to the bottom of the screen then offers to learn it (or take
// it back) and always shows your points and the begin button, however far down the tree you
// have scrolled. A filled node is learned, a heavy ring is one you can learn right now, a
// faint one is out of reach (too few points, or the other side of the tree). The number
// inside a node is its price.
// ----------------------------------------------------------------

var SKILL_COL_W = 160;
var SKILL_ROW_H = 132;
var SKILL_NODE_R = 30;
var SKILL_ROOT_R = 40;
var SKILL_MIN_HALF_W = 380;   // the picture is never narrower than this, so it stays big while the tree is small
var SKILL_PAD_X = 100;
var SKILL_PAD_TOP = 70;
var SKILL_PAD_BOTTOM = 110;   // room for the labels under the lowest nodes
var SVG_NS = "http://www.w3.org/2000/svg";

var skillSelected = null;
var skillTreeBox = null;      // where the tree is drawn (the ritual's grid)
var skillTreeFirstDraw = true;

function skillSvg(name, attrs) {
  var node = document.createElementNS(SVG_NS, name);
  for (var k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

// y grows downwards: greed is below the middle, enlightenment above it.
function skillNodePos(node) {
  var row = node.side === "up" ? -node.depth : node.depth;
  return { x: node.col * SKILL_COL_W, y: row * SKILL_ROW_H };
}

// Breaks a name into short lines so it fits under its node.
function skillLabelLines(name) {
  var words = name.split(" ");
  var lines = [], line = "";
  words.forEach(function (w) {
    if (line && (line + " " + w).length > 12) { lines.push(line); line = w; }
    else line = line ? line + " " + w : w;
  });
  if (line) lines.push(line);
  return lines;
}

function skillNodeClass(node) {
  if (node.id === "root") return "node root owned";
  if (skillHas(node.id)) return "node owned";
  return skillLearnBlock(node.id) === "" ? "node open" : "node locked";
}

function skillBuildTree() {
  var visible = [SKILL_ROOT].concat(SKILL_NODES.filter(skillVisible));

  // The picture grows with what you can see. The middle node stays centred sideways.
  var halfW = SKILL_MIN_HALF_W, top = 0, bottom = 0;
  visible.forEach(function (n) {
    var p = skillNodePos(n);
    halfW = Math.max(halfW, Math.abs(p.x) + SKILL_PAD_X);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  });
  var vbY = top - SKILL_PAD_TOP, vbH = bottom - top + SKILL_PAD_TOP + SKILL_PAD_BOTTOM;
  var svg = skillSvg("svg", { "class": "skill-tree", viewBox: (-halfW) + " " + vbY + " " + (2 * halfW) + " " + vbH, role: "img" });

  // branches first, so the nodes sit on top of them
  visible.forEach(function (node) {
    if (node.id === "root") return;
    var from = skillNodePos(skillNodeById(node.req)), to = skillNodePos(node);
    svg.appendChild(skillSvg("line", { "class": skillHas(node.id) ? "on" : "", x1: from.x, y1: from.y, x2: to.x, y2: to.y }));
  });

  visible.forEach(function (node) {
    var p = skillNodePos(node);
    var g = skillSvg("g", { "class": skillNodeClass(node) + (skillSelected === node.id ? " sel" : "") });
    var r = node.id === "root" ? SKILL_ROOT_R : SKILL_NODE_R;
    if (skillSelected === node.id) g.appendChild(skillSvg("circle", { "class": "selring", cx: p.x, cy: p.y, r: r + 9 }));
    g.appendChild(skillSvg("circle", { cx: p.x, cy: p.y, r: r }));

    var inside = skillSvg("text", { "class": "in", x: p.x, y: p.y + 6 });
    inside.textContent = node.id === "root" ? "\u262f" : (skillHas(node.id) ? "\u2713" : String(node.cost));
    g.appendChild(inside);

    var lines = node.id === "root" ? ["the middle"] : skillLabelLines(node.name);
    lines.forEach(function (text, i) {
      // a paper-coloured copy underneath, so branch lines running past don't strike through the words
      var y = p.y + r + 20 + i * 17;
      var halo = skillSvg("text", { "class": "halo", x: p.x, y: y });
      halo.textContent = text;
      g.appendChild(halo);
      var label = skillSvg("text", { "class": "label", x: p.x, y: y });
      label.textContent = text;
      g.appendChild(label);
    });

    g.addEventListener("click", function () {
      skillSelected = node.id;
      renderSkillTree();
    });
    svg.appendChild(g);
  });
  return svg;
}

function skillButton(text, onClick, disabled) {
  var b = document.createElement("button");
  b.textContent = text;
  b.disabled = !!disabled;
  b.addEventListener("click", onClick);
  return b;
}

// The fixed bar: your points, the node you have selected, and the buttons.
function skillRenderBar() {
  var box = el.reincarnateBarBody;
  box.innerHTML = "";

  var dir = skillDirection();
  var points = document.createElement("div");
  points.style.fontWeight = "bold";
  points.textContent = "skill points " + skillPointsFree() + " / " + skillPointsTotal() +
    " \u00b7 " + (dir === "up" ? "enlightenment" : (dir === "down" ? "greed" : "no path yet"));
  box.appendChild(points);

  var node = skillSelected ? skillNodeById(skillSelected) : null;
  var actions = document.createElement("div");
  actions.className = "rc-bar-actions";

  if (node && node.id !== "root") {
    var info = document.createElement("div");
    info.style.marginTop = "4px";
    var effects = skillEffectLines(node).map(function (line) { return (line[1] ? "+ " : "\u2212 ") + line[0]; }).join("   ");
    info.textContent = node.name + " (" + node.cost + " point" + (node.cost === 1 ? "" : "s") + "): " + effects;
    box.appendChild(info);

    if (skillHas(node.id)) {
      actions.appendChild(skillButton("take back", function () {
        if (skillTakeBack(node.id)) renderSkillTree();
      }, !skillCanTakeBack(node.id)));
    } else {
      var block = skillLearnBlock(node.id);
      actions.appendChild(skillButton("learn", function () {
        if (skillLearn(node.id)) renderSkillTree();
      }, block !== ""));
      if (block) {
        var why = document.createElement("div");
        why.className = "hint";
        why.textContent = block;
        box.appendChild(why);
      }
    }
  } else if (node) {
    var start = document.createElement("div");
    start.style.marginTop = "4px";
    start.textContent = "the middle: where everyone starts";
    box.appendChild(start);
  }

  actions.appendChild(skillButton("take back all", function () {
    skillTakeBackAll();
    renderSkillTree();
  }, skillOwned().length === 0));
  box.appendChild(actions);
}

// Draws (or redraws) the tree in the ritual's grid. Everything is rebuilt each time, but the
// screen is scrolled to keep the middle node exactly where it was, so the tree never jumps when it grows.
function renderSkillTree() {
  var box = skillTreeBox;
  var scroller = el.reincarnateOverlay;
  var oldRoot = box.querySelector("g.root");
  var before = oldRoot ? oldRoot.getBoundingClientRect() : null;

  box.innerHTML = "";
  box.appendChild(skillBuildTree());
  skillRenderBar();

  var after = box.querySelector("g.root").getBoundingClientRect();
  if (before && !skillTreeFirstDraw) scroller.scrollTop += after.top - before.top;
  else scroller.scrollTop += after.top - scroller.clientHeight * 0.4; // the first time: the middle a little above centre
  skillTreeFirstDraw = false;
}

// Called by the ritual when the noise has settled. box is the element the tree is drawn into.
function showSkillTree(box) {
  skillTreeBox = box;
  skillSelected = null;
  skillTreeFirstDraw = true;
  el.reincarnateBar.style.display = "";
  renderSkillTree();
}
