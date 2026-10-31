const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const order = "firebase-config cards state formulas dom theme audio render swarm floor city features leaderboard auth repeatbutton actions cloudsave reincarnation lives lifetime achievements profiles cardsui moremenu medallions gifts news presence chat admin resonance slots season engine".split(" ");

const src = "(function(){\n" + order.map(function (f) {
  return fs.readFileSync(path.join(__dirname, f + ".js"), "utf8").replace(/^"use strict";\r?\n/, "");
}).join("\n") + "\n})();";

const out = esbuild.transformSync(src, { minify: true, target: "es2017" });
fs.writeFileSync(path.join(__dirname, "game.js"), out.code);
