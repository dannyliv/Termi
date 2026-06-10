// Engine vendored from the npm package kaplay@3001.0.19 (see vendor/KAPLAY-LICENSE.txt).
/**
 * "Big Games" scaffold: a KAPLAY platformer with two short levels.
 * The engine ships as a local file (vendor/kaplay.mjs), so the game
 * needs zero network access. Theme data lands in game.js as a const
 * THEME block that kids and the AI can tweak easily.
 */

import { readFileSync } from 'node:fs';
import type { ScaffoldDef, ThemeConfig } from '../../types.js';

const themes: ThemeConfig[] = [
  {
    id: 'castle-quest',
    label: 'Castle Quest',
    emoji: '🏰',
    palette: { bg: '#2b2150', fg: '#f3ecff', accent: '#f5b83d' },
    glyphs: { player: '🤺', coin: '🪙', hazard: '🐉', flag: '🚩', deco: '☁️' },
    strings: {
      collectWord: 'gold coins',
      hazardWord: 'dragon',
      scoreLabel: 'Gold',
      levelLabel: 'Level',
      goalHint: 'Reach the flag!',
      startHint: 'Press any key or tap to start your quest.',
      controlsHint: 'Run with arrow keys or WASD. Jump with Space, Up, or W.',
      touchHint: 'On touch: hold the sides to run. Tap the middle to jump.',
      retryHint: 'Press R, Space, or tap to try again.',
      winTitle: 'Quest Complete!',
      winLine: 'You reached the castle gate. The whole kingdom cheers for you.',
      loseTitle: 'Dragon Huff!',
      loseLine: 'The dragon huffed at you! Brave knights never quit. Try again?',
    },
    narrativeIntro:
      'You are a brave knight on a quest. Grab the gold coins. Slip past the dragon. Reach the flag in both levels.',
    nonViolent: true,
    nonCompetitive: true,
  },
  {
    id: 'blocky-mine',
    label: 'Blocky Mine World',
    emoji: '⛏️',
    palette: { bg: '#26211b', fg: '#f0ead8', accent: '#5fbf4f' },
    glyphs: { player: '👷', coin: '💎', hazard: '🐍', flag: '🚩', deco: '🪨' },
    strings: {
      collectWord: 'gems',
      hazardWord: 'cave snake',
      scoreLabel: 'Gems',
      levelLabel: 'Level',
      goalHint: 'Reach the flag!',
      startHint: 'Press any key or tap to start digging.',
      controlsHint: 'Run with arrow keys or WASD. Jump with Space, Up, or W.',
      touchHint: 'On touch: hold the sides to run. Tap the middle to jump.',
      retryHint: 'Press R, Space, or tap to try again.',
      winTitle: 'Mine Cleared!',
      winLine: 'You explored every tunnel. Your gem bag sparkles all the way home.',
      loseTitle: 'Sss!',
      loseLine: 'The cave snake surprised you. Grab your helmet and dig back in?',
    },
    narrativeIntro:
      'Deep in the blocky mine. Collect the shiny gems. Watch out for the cave snake. Find the flag to climb out.',
    nonViolent: true,
    nonCompetitive: true,
  },
  {
    id: 'haunted-house',
    label: 'Haunted House',
    emoji: '👻',
    palette: { bg: '#191325', fg: '#e8e3f2', accent: '#9b6df2' },
    glyphs: { player: '🧒', coin: '🔮', hazard: '👻', flag: '🚪', deco: '🕸️' },
    strings: {
      collectWord: 'glow orbs',
      hazardWord: 'ghost',
      scoreLabel: 'Orbs',
      levelLabel: 'Level',
      goalHint: 'Find the door!',
      startHint: 'Press any key or tap to tiptoe inside.',
      controlsHint: 'Run with arrow keys or WASD. Jump with Space, Up, or W.',
      touchHint: 'On touch: hold the sides to run. Tap the middle to jump.',
      retryHint: 'Press R, Space, or tap to try again.',
      winTitle: 'You Escaped!',
      winLine: 'You found the way out. The old house giggles a friendly goodbye.',
      loseTitle: 'Boo!',
      loseLine: 'The ghost spooked you. Take a deep breath and tiptoe back in?',
    },
    narrativeIntro:
      'You are inside a haunted house. Collect the glow orbs. Sneak past the ghost. Find the door in both levels.',
    nonViolent: false,
    nonCompetitive: true,
  },
  {
    id: 'midnight-wolf',
    label: 'Midnight Wolf Pack',
    emoji: '🐺',
    palette: { bg: '#0e1626', fg: '#e6eefc', accent: '#8fb7ff' },
    glyphs: { player: '🐺', coin: '🌕', hazard: '🐗', flag: '🐾', deco: '🌲' },
    strings: {
      collectWord: 'moonstones',
      hazardWord: 'grumpy boar',
      scoreLabel: 'Moons',
      levelLabel: 'Level',
      goalHint: 'Follow the paw prints!',
      startHint: 'Press any key or tap to start running.',
      controlsHint: 'Run with arrow keys or WASD. Jump with Space, Up, or W.',
      touchHint: 'On touch: hold the sides to run. Tap the middle to jump.',
      retryHint: 'Press R, Space, or tap to run again.',
      winTitle: 'Awooo!',
      winLine: 'You found your pack under the full moon. They howl with joy.',
      loseTitle: 'Bumped!',
      loseLine: 'The grumpy boar bumped you. Shake your fur and run again?',
    },
    narrativeIntro:
      'You are a young wolf far from home. Collect moonstones. Dodge the grumpy boar. Follow the paw prints to your pack.',
    nonViolent: true,
    nonCompetitive: true,
  },
];

/** Builds the JSON for the const THEME block at the top of game.js. */
function themeBlock(theme: ThemeConfig): string {
  return JSON.stringify(
    {
      id: theme.id,
      label: theme.label,
      palette: theme.palette,
      glyphs: theme.glyphs,
      strings: theme.strings,
      narrative: theme.narrativeIntro,
    },
    null,
    2,
  );
}

/** Makes a name safe to drop into HTML text. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Keeps a kid-typed name to one tidy line. */
function cleanName(name: string): string {
  const tidy = name.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return tidy.length > 0 ? tidy : 'My Big Game';
}

function str(theme: ThemeConfig, key: string): string {
  return theme.strings[key] ?? '';
}

function indexHtml(theme: ThemeConfig, prettyName: string): string {
  const name = escapeHtml(cleanName(prettyName));
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main>
      <h1>${theme.emoji} ${name}</h1>
      <canvas id="game"></canvas>
      <p class="hint">${escapeHtml(str(theme, 'controlsHint'))} ${escapeHtml(str(theme, 'touchHint'))}</p>
    </main>
    <script type="module" src="game.js"></script>
  </body>
</html>
`;
}

function styleCss(theme: ThemeConfig, prettyName: string): string {
  return `/* Styles for ${cleanName(prettyName)}. The colors come from your theme. */
:root {
  --bg: ${theme.palette.bg};
  --fg: ${theme.palette.fg};
  --accent: ${theme.palette.accent};
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  color: var(--fg);
  font-family: "Trebuchet MS", "Segoe UI", sans-serif;
  text-align: center;
}

main {
  padding: 16px;
}

h1 {
  margin: 8px 0 12px;
  font-size: 1.6rem;
  letter-spacing: 1px;
  color: var(--accent);
}

canvas {
  width: min(94vw, 880px);
  aspect-ratio: 22 / 13;
  border: 3px solid var(--accent);
  border-radius: 12px;
  background: var(--bg);
  touch-action: none;
  box-shadow: 0 0 28px rgba(0, 0, 0, 0.5);
}

.hint {
  font-size: 0.9rem;
  opacity: 0.8;
}
`;
}

function gameJs(theme: ThemeConfig, prettyName: string): string {
  const name = cleanName(prettyName);
  return `// ${name} (a platform adventure)
// Run and jump. Grab ${str(theme, 'collectWord')}. Dodge the ${str(theme, 'hazardWord')}. Reach the goal!
// You and Termi can change anything in this file. Try the starter ideas!
// The game engine is the local file kaplay.mjs. No internet needed.

import kaplay from "./kaplay.mjs";

const THEME = ${themeBlock(theme)};

const GAME_NAME = ${JSON.stringify(name)};

// --- Engine setup ---
const TILE = 48;        // size of one level block
const MOVE_SPEED = 220; // how fast you run
const JUMP_POWER = 700; // how high you jump

const k = kaplay({
  canvas: document.getElementById("game"),
  width: 880,
  height: 520,
  stretch: true,
  letterbox: true,
  background: THEME.palette.bg,
  global: false,
});

k.setGravity(1400);

const accent = k.Color.fromHex(THEME.palette.accent);
const fgColor = k.Color.fromHex(THEME.palette.fg);

// --- The levels ---
// "=" is solid ground. "o" is something to collect.
// "^" is where the hazard starts. "F" is the goal.
const LEVELS = [
  [
    "                        ",
    "                        ",
    "       oo               ",
    "      ====       o      ",
    "  o          o  ===     ",
    "          ^          F  ",
    "========================",
  ],
  [
    "                              ",
    "       oo             o       ",
    "      ====           ===      ",
    "  o           o               ",
    " ===   ===   ====   ^     F   ",
    "=============   ==============",
  ],
];

// --- The start screen ---
k.scene("start", function () {
  k.add([
    k.text(GAME_NAME, { size: 44 }),
    k.pos(k.width() / 2, 110),
    k.anchor("center"),
    k.color(accent),
  ]);
  k.add([
    k.text(THEME.narrative, { size: 22, width: 660, align: "center" }),
    k.pos(k.width() / 2, 230),
    k.anchor("center"),
    k.color(fgColor),
  ]);
  k.add([
    k.text(THEME.strings.controlsHint + " " + THEME.strings.touchHint, { size: 17, width: 720, align: "center" }),
    k.pos(k.width() / 2, 350),
    k.anchor("center"),
    k.color(fgColor),
    k.opacity(0.8),
  ]);
  k.add([
    k.text(THEME.strings.startHint, { size: 22 }),
    k.pos(k.width() / 2, 440),
    k.anchor("center"),
    k.color(accent),
  ]);
  function begin() {
    k.go("game", { level: 0, score: 0 });
  }
  k.onKeyPress(begin);
  k.onMousePress(begin);
});

// --- The main game ---
k.scene("game", function (data) {
  const rows = LEVELS[data.level];
  const levelWidth = rows[0].length * TILE;
  const levelTop = k.height() - rows.length * TILE;
  let score = data.score;

  k.addLevel(rows, {
    tileWidth: TILE,
    tileHeight: TILE,
    pos: k.vec2(0, levelTop),
    tiles: {
      "=": function () {
        return [
          k.rect(TILE, TILE),
          k.color(accent),
          k.outline(3, k.Color.fromHex(THEME.palette.bg)),
          k.area(),
          k.body({ isStatic: true }),
          "ground",
        ];
      },
      "o": function () {
        return [k.text(THEME.glyphs.coin, { size: 30 }), k.area(), "coin"];
      },
      "^": function () {
        return [k.text(THEME.glyphs.hazard, { size: 34 }), k.area(), "hazard"];
      },
      "F": function () {
        return [k.text(THEME.glyphs.flag, { size: 40 }), k.area(), "flag"];
      },
    },
  });

  // Soft background decorations.
  for (let i = 0; i < Math.floor(levelWidth / 300); i++) {
    k.add([
      k.text(THEME.glyphs.deco, { size: 40 }),
      k.pos(i * 300 + 140, levelTop + 30 + (i % 3) * 50),
      k.opacity(0.35),
      k.z(-10),
    ]);
  }

  // The player drops in near the left edge.
  const player = k.add([
    k.text(THEME.glyphs.player, { size: 36 }),
    k.pos(TILE * 1.5, levelTop),
    k.anchor("center"),
    k.area(),
    k.body(),
    k.z(10),
    "player",
  ]);

  // Score and level signs that stay on screen.
  const scoreText = k.add([
    k.text(THEME.strings.scoreLabel + ": " + score, { size: 22 }),
    k.pos(14, 12),
    k.color(fgColor),
    k.fixed(),
    k.z(100),
  ]);
  k.add([
    k.text(THEME.strings.levelLabel + " " + (data.level + 1) + " of " + LEVELS.length, { size: 22 }),
    k.pos(k.width() - 14, 12),
    k.anchor("topright"),
    k.color(fgColor),
    k.fixed(),
    k.z(100),
  ]);
  const goalSign = k.add([
    k.text(THEME.strings.goalHint, { size: 22 }),
    k.pos(k.width() / 2, 52),
    k.anchor("center"),
    k.color(accent),
    k.fixed(),
    k.z(100),
  ]);
  k.wait(3, function () {
    k.destroy(goalSign);
  });

  // --- Keyboard controls: arrows and WASD ---
  function tryJump() {
    if (player.isGrounded()) player.jump(JUMP_POWER);
  }
  k.onKeyDown("left", function () { player.move(-MOVE_SPEED, 0); });
  k.onKeyDown("a", function () { player.move(-MOVE_SPEED, 0); });
  k.onKeyDown("right", function () { player.move(MOVE_SPEED, 0); });
  k.onKeyDown("d", function () { player.move(MOVE_SPEED, 0); });
  k.onKeyPress("space", tryJump);
  k.onKeyPress("up", tryJump);
  k.onKeyPress("w", tryJump);

  // --- Touch controls: hold the sides to run, tap the middle to jump ---
  let touchDir = 0;
  k.onMousePress(function () {
    const x = k.mousePos().x;
    if (x < k.width() / 3) touchDir = -1;
    else if (x > (k.width() * 2) / 3) touchDir = 1;
    else tryJump();
  });
  k.onMouseRelease(function () {
    touchDir = 0;
  });

  // The hazard walks back and forth near its home spot.
  k.onUpdate("hazard", function (hazard) {
    if (hazard.homeX === undefined) {
      hazard.homeX = hazard.pos.x;
      hazard.dir = 1;
    }
    hazard.move(hazard.dir * 70, 0);
    if (hazard.pos.x > hazard.homeX + TILE * 2) hazard.dir = -1;
    if (hazard.pos.x < hazard.homeX - TILE * 2) hazard.dir = 1;
  });

  // --- Touching things ---
  player.onCollide("coin", function (coin) {
    k.destroy(coin);
    score = score + 10;
    scoreText.text = THEME.strings.scoreLabel + ": " + score;
  });
  player.onCollide("hazard", function () {
    k.go("lose", { level: data.level, scoreAtStart: data.score, scoreNow: score });
  });
  player.onCollide("flag", function () {
    if (data.level + 1 < LEVELS.length) {
      k.go("game", { level: data.level + 1, score: score + 25 });
    } else {
      k.go("win", { score: score + 25 });
    }
  });

  // Camera follows you. Falling off the world means a retry.
  k.onUpdate(function () {
    if (touchDir !== 0) player.move(touchDir * MOVE_SPEED, 0);
    const camX = Math.min(Math.max(player.pos.x, k.width() / 2), levelWidth - k.width() / 2);
    k.setCamPos(k.vec2(camX, k.height() / 2));
    if (player.pos.y > k.height() + 200) {
      k.go("lose", { level: data.level, scoreAtStart: data.score, scoreNow: score });
    }
  });
});

// --- The retry screen ---
k.scene("lose", function (data) {
  k.add([
    k.text(THEME.strings.loseTitle, { size: 40 }),
    k.pos(k.width() / 2, 140),
    k.anchor("center"),
    k.color(accent),
  ]);
  k.add([
    k.text(THEME.strings.loseLine, { size: 24, width: 640, align: "center" }),
    k.pos(k.width() / 2, 240),
    k.anchor("center"),
    k.color(fgColor),
  ]);
  k.add([
    k.text(THEME.strings.scoreLabel + ": " + data.scoreNow, { size: 24 }),
    k.pos(k.width() / 2, 330),
    k.anchor("center"),
    k.color(fgColor),
  ]);
  k.add([
    k.text(THEME.strings.retryHint, { size: 20 }),
    k.pos(k.width() / 2, 410),
    k.anchor("center"),
    k.color(accent),
  ]);
  function retry() {
    k.go("game", { level: data.level, score: data.scoreAtStart });
  }
  k.onKeyPress("r", retry);
  k.onKeyPress("space", retry);
  k.onKeyPress("enter", retry);
  k.onMousePress(retry);
});

// --- The win screen ---
k.scene("win", function (data) {
  k.add([
    k.text(THEME.strings.winTitle, { size: 44 }),
    k.pos(k.width() / 2, 140),
    k.anchor("center"),
    k.color(accent),
  ]);
  k.add([
    k.text(THEME.strings.winLine, { size: 24, width: 640, align: "center" }),
    k.pos(k.width() / 2, 240),
    k.anchor("center"),
    k.color(fgColor),
  ]);
  k.add([
    k.text(THEME.strings.scoreLabel + ": " + data.score, { size: 24 }),
    k.pos(k.width() / 2, 330),
    k.anchor("center"),
    k.color(fgColor),
  ]);
  k.add([
    k.text(THEME.strings.retryHint, { size: 20 }),
    k.pos(k.width() / 2, 410),
    k.anchor("center"),
    k.color(accent),
  ]);
  function playAgain() {
    k.go("game", { level: 0, score: 0 });
  }
  k.onKeyPress("r", playAgain);
  k.onKeyPress("space", playAgain);
  k.onKeyPress("enter", playAgain);
  k.onMousePress(playAgain);
});

k.go("start");
`;
}

let cachedEngine: string | null = null;

/** Reads the vendored engine once. Works from src (tests) and dist (build). */
function engineSource(): string {
  if (cachedEngine === null) {
    cachedEngine = readFileSync(new URL('./vendor/kaplay.mjs', import.meta.url), 'utf8');
  }
  return cachedEngine;
}

export const bigGamesScaffold: ScaffoldDef = {
  id: 'biggames',
  label: 'Big Games',
  emoji: '🕹️',
  ageNote: 'A bigger platform game with two levels. For ages 9 and up.',
  themes,
  files(theme: ThemeConfig, prettyName: string): Record<string, string> {
    return {
      'index.html': indexHtml(theme, prettyName),
      'style.css': styleCss(theme, prettyName),
      'game.js': gameJs(theme, prettyName),
    };
  },
  starterPrompts(theme: ThemeConfig): string[] {
    return [
      'make the player jump higher',
      'add a third level with lava',
      'make the ' + str(theme, 'hazardWord') + ' move faster',
      'give me a double jump',
      'make the ' + str(theme, 'collectWord') + ' worth 25 points',
    ];
  },
  get vendorFiles(): Record<string, string> {
    return { 'kaplay.mjs': engineSource() };
  },
};

export default bigGamesScaffold;
