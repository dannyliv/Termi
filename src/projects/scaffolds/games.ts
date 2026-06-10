/**
 * "Sky Dash" scaffold: a canvas dodge game.
 * One template, four themes. Theme data is interpolated into game.js
 * as a const THEME block so kids and the AI can tweak it easily.
 */

import type { ScaffoldDef, ThemeConfig } from '../../types.js';

const themes: ThemeConfig[] = [
  {
    id: 'space-rocks',
    label: 'Space Rocks',
    emoji: '🚀',
    palette: { bg: '#0b1026', fg: '#e8ecff', accent: '#7dd3fc' },
    glyphs: { player: '🚀', obstacle: '🪨', bonus: '⭐' },
    strings: {
      obstacleWord: 'space rocks',
      bonusWord: 'stars',
      scoreLabel: 'Score',
      startHint: 'Press any key or tap to launch.',
      controlsHint: 'Move with arrow keys, WASD, or your finger.',
      retryHint: 'Press R, Space, or tap to fly again.',
      winTitle: 'You Made It!',
      winLine: 'You flew through the whole rock belt. The space station cheers for you.',
      loseTitle: 'Bonk!',
      loseLine: 'A space rock bumped your ship. The ship is fine. Ready to fly again?',
    },
    narrativeIntro:
      'You are a brave pilot in the rock belt. Dodge the space rocks. Grab the stars. Reach 150 points to get home.',
    nonViolent: true,
    nonCompetitive: true,
  },
  {
    id: 'neon-star-run',
    label: 'Neon Star Run',
    emoji: '🌟',
    palette: { bg: '#10001f', fg: '#f5e9ff', accent: '#ff4fd8' },
    glyphs: { player: '🏃', obstacle: '🔻', bonus: '🌟' },
    strings: {
      obstacleWord: 'laser spikes',
      bonusWord: 'neon stars',
      scoreLabel: 'Score',
      startHint: 'Press any key or tap to start the run.',
      retryHint: 'Press R, Space, or tap to run again.',
      controlsHint: 'Move with arrow keys, WASD, or your finger.',
      winTitle: 'Track Champion!',
      winLine: 'You lit up the whole track. The neon city glows just for you.',
      loseTitle: 'Zapped!',
      loseLine: 'A laser spike caught you. Shake it off, star runner. Go again?',
    },
    narrativeIntro:
      'Night race in the neon city. Dodge the laser spikes. Grab neon stars. Hit 150 points to set the track record.',
    nonViolent: true,
    nonCompetitive: false,
  },
  {
    id: 'spooky-bats',
    label: 'Spooky Bats',
    emoji: '🦇',
    palette: { bg: '#161021', fg: '#efe6d8', accent: '#ff9b3d' },
    glyphs: { player: '🧙', obstacle: '🦇', bonus: '🍬' },
    strings: {
      obstacleWord: 'bats',
      bonusWord: 'candy',
      scoreLabel: 'Score',
      startHint: 'Press any key or tap to take off.',
      controlsHint: 'Move with arrow keys, WASD, or your finger.',
      retryHint: 'Press R, Space, or tap to fly again.',
      winTitle: 'Sky Crossed!',
      winLine: 'You crossed the haunted sky. The bats squeak a friendly goodnight.',
      loseTitle: 'Swooped!',
      loseLine: 'A bat swooped you! It only wanted a hug. Try the night sky again?',
    },
    narrativeIntro:
      'It is a spooky night flight. Dodge the swooping bats. Catch falling candy. Reach 150 points to cross the sky.',
    nonViolent: false,
    nonCompetitive: true,
  },
  {
    id: 'soccer-headers',
    label: 'Soccer Headers',
    emoji: '⚽',
    palette: { bg: '#0e3320', fg: '#f2fff7', accent: '#ffd24a' },
    glyphs: { player: '🧤', obstacle: '🟥', bonus: '⚽' },
    strings: {
      obstacleWord: 'red cards',
      bonusWord: 'soccer balls',
      scoreLabel: 'Score',
      startHint: 'Press any key or tap for kickoff.',
      controlsHint: 'Move with arrow keys, WASD, or your finger.',
      retryHint: 'Press R, Space, or tap for a rematch.',
      winTitle: 'Champions!',
      winLine: 'What a save streak! The crowd goes wild. You win the cup.',
      loseTitle: 'Red Card!',
      loseLine: 'Oof, a red card hit you. Even pros miss sometimes. Rematch?',
    },
    narrativeIntro:
      'Big match day. Dodge the red cards. Catch soccer balls for extra points. Reach 150 to win the cup.',
    nonViolent: true,
    nonCompetitive: false,
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
  return tidy.length > 0 ? tidy : 'My Game';
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
      <p class="tagline">${escapeHtml(theme.narrativeIntro)}</p>
      <canvas id="game" width="480" height="640"></canvas>
      <p class="hint">${escapeHtml(str(theme, 'controlsHint'))} ${escapeHtml(str(theme, 'startHint'))}</p>
    </main>
    <script src="game.js"></script>
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
  margin: 8px 0;
  font-size: 1.6rem;
  letter-spacing: 1px;
  color: var(--accent);
}

.tagline {
  max-width: 480px;
  margin: 0 auto 12px;
  opacity: 0.85;
}

canvas {
  width: min(92vw, 480px);
  height: auto;
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
  return `// ${name} (a Sky Dash game)
// You steer the player. Dodge the ${str(theme, 'obstacleWord')}. Grab ${str(theme, 'bonusWord')} for points.
// You and Termi can change anything in this file. Have fun!

const THEME = ${themeBlock(theme)};

const GAME_NAME = ${JSON.stringify(name)};

// --- Canvas setup ---
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

// --- Game settings (easy to tweak!) ---
const WIN_SCORE = 150;        // reach this score to win
const PLAYER_SPEED = 5;       // how fast you move
const START_FALL_SPEED = 2.4; // how fast things fall at the start
const SPEED_RAMP = 0.0011;    // how much faster every frame

// --- Game state ---
let player;
let obstacles;
let bonuses;
let score;
let fallSpeed;
let spawnGap;
let frame;
let state = "start"; // "start", "play", "win", or "lose"
const keysDown = {};
let touchTarget = null;

function resetGame() {
  player = { x: W / 2, y: H - 80, size: 36 };
  obstacles = [];
  bonuses = [];
  score = 0;
  fallSpeed = START_FALL_SPEED;
  spawnGap = 55;
  frame = 0;
}
resetGame();

// --- Keyboard controls: arrow keys and WASD ---
window.addEventListener("keydown", function (event) {
  const key = event.key.toLowerCase();
  keysDown[key] = true;
  const gameKeys = ["arrowleft", "arrowright", "arrowup", "arrowdown", " "];
  if (gameKeys.includes(key)) event.preventDefault();
  if (state !== "play") startOrRetry(key);
});
window.addEventListener("keyup", function (event) {
  keysDown[event.key.toLowerCase()] = false;
});

function startOrRetry(key) {
  // Any key starts the game. R, Space, or Enter restarts it.
  const restartKeys = ["r", " ", "enter"];
  if (state === "start" || restartKeys.includes(key)) {
    resetGame();
    state = "play";
  }
}

// --- Touch controls: slide your finger to steer ---
canvas.addEventListener("touchstart", function (event) {
  event.preventDefault();
  if (state !== "play") {
    startOrRetry("r");
    return;
  }
  touchTarget = touchPoint(event);
}, { passive: false });
canvas.addEventListener("touchmove", function (event) {
  event.preventDefault();
  touchTarget = touchPoint(event);
}, { passive: false });
canvas.addEventListener("touchend", function () {
  touchTarget = null;
});
canvas.addEventListener("mousedown", function () {
  if (state !== "play") startOrRetry("r");
});

function touchPoint(event) {
  // Turn a finger spot on the screen into a spot on the canvas.
  const rect = canvas.getBoundingClientRect();
  const touch = event.touches[0];
  return {
    x: (touch.clientX - rect.left) * (W / rect.width),
    y: (touch.clientY - rect.top) * (H / rect.height),
  };
}

// --- Game logic ---
function update() {
  frame = frame + 1;

  // Your score climbs while you survive.
  if (frame % 6 === 0) score = score + 1;

  // The game slowly speeds up.
  fallSpeed = fallSpeed + SPEED_RAMP;
  if (spawnGap > 24) spawnGap = spawnGap - 0.012;

  movePlayer();

  // Drop in new things to dodge and grab.
  if (frame % Math.floor(spawnGap) === 0) spawnObstacle();
  if (frame % 240 === 120) spawnBonus();

  moveThings(obstacles);
  moveThings(bonuses);

  // Did something hit us?
  for (const thing of obstacles) {
    if (hits(player, thing)) {
      state = "lose";
      return;
    }
  }

  // Did we grab a bonus? Loop backwards so removing is safe.
  for (let i = bonuses.length - 1; i >= 0; i--) {
    if (hits(player, bonuses[i])) {
      score = score + 10;
      bonuses.splice(i, 1);
    }
  }

  if (score >= WIN_SCORE) state = "win";
}

function movePlayer() {
  let dx = 0;
  let dy = 0;
  if (keysDown["arrowleft"] || keysDown["a"]) dx = dx - 1;
  if (keysDown["arrowright"] || keysDown["d"]) dx = dx + 1;
  if (keysDown["arrowup"] || keysDown["w"]) dy = dy - 1;
  if (keysDown["arrowdown"] || keysDown["s"]) dy = dy + 1;
  if (touchTarget) {
    // Glide toward your finger.
    if (touchTarget.x > player.x + 6) dx = 1;
    if (touchTarget.x < player.x - 6) dx = -1;
    if (touchTarget.y > player.y + 6) dy = 1;
    if (touchTarget.y < player.y - 6) dy = -1;
  }
  player.x = clamp(player.x + dx * PLAYER_SPEED, 24, W - 24);
  player.y = clamp(player.y + dy * PLAYER_SPEED, H / 2, H - 24);
}

function spawnObstacle() {
  obstacles.push({
    x: 24 + Math.random() * (W - 48),
    y: -40,
    size: 26 + Math.random() * 18,
    drift: (Math.random() - 0.5) * 1.6,
  });
}

function spawnBonus() {
  bonuses.push({
    x: 24 + Math.random() * (W - 48),
    y: -40,
    size: 26,
    drift: 0,
  });
}

function moveThings(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    const thing = list[i];
    thing.y = thing.y + fallSpeed + thing.size * 0.02;
    thing.x = thing.x + thing.drift;
    if (thing.y > H + 60) list.splice(i, 1);
  }
}

function hits(a, b) {
  // True when two things are close enough to touch.
  const gap = (a.size + b.size) * 0.42;
  return Math.abs(a.x - b.x) < gap && Math.abs(a.y - b.y) < gap;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

// --- Drawing ---
function draw() {
  ctx.fillStyle = THEME.palette.bg;
  ctx.fillRect(0, 0, W, H);
  drawBackgroundDots();

  for (const thing of obstacles) drawGlyph(THEME.glyphs.obstacle, thing.x, thing.y, thing.size);
  for (const thing of bonuses) drawGlyph(THEME.glyphs.bonus, thing.x, thing.y, thing.size);
  drawGlyph(THEME.glyphs.player, player.x, player.y, player.size);

  // Score in the corner.
  ctx.fillStyle = THEME.palette.fg;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(THEME.strings.scoreLabel + ": " + score, 14, 32);

  if (state === "start") drawCard(GAME_NAME, THEME.narrative, THEME.strings.startHint, false);
  if (state === "lose") drawCard(THEME.strings.loseTitle, THEME.strings.loseLine, THEME.strings.retryHint, true);
  if (state === "win") drawCard(THEME.strings.winTitle, THEME.strings.winLine, THEME.strings.retryHint, true);
}

function drawBackgroundDots() {
  // Little drifting dots make it feel like you are moving.
  ctx.fillStyle = THEME.palette.accent;
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 26; i++) {
    const x = (i * 97) % W;
    const y = (i * 173 + frame * 1.5) % H;
    ctx.fillRect(x, y, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function drawGlyph(glyph, x, y, size) {
  ctx.font = size + "px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, x, y);
}

function drawCard(title, body, hint, showScore) {
  // A friendly message card in the middle of the screen.
  const top = H / 2 - 150;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(30, top, W - 60, 300);
  ctx.strokeStyle = THEME.palette.accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(30, top, W - 60, 300);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = THEME.palette.accent;
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(title, W / 2, top + 56);

  ctx.fillStyle = THEME.palette.fg;
  ctx.font = "19px sans-serif";
  const lines = wrapText(body, 38);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, top + 104 + i * 26);
  }

  if (showScore) {
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(THEME.strings.scoreLabel + ": " + score, W / 2, top + 228);
  }

  ctx.fillStyle = THEME.palette.accent;
  ctx.font = "16px sans-serif";
  ctx.fillText(hint, W / 2, top + 268);
}

function wrapText(text, maxChars) {
  // Splits long text into short lines that fit the card.
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars) {
      lines.push(line.trim());
      line = word;
    } else {
      line = line + " " + word;
    }
  }
  if (line.trim().length > 0) lines.push(line.trim());
  return lines;
}

// --- Main loop ---
function loop() {
  if (state === "play") update();
  draw();
  requestAnimationFrame(loop);
}
loop();
`;
}

export const gamesScaffold: ScaffoldDef = {
  id: 'games',
  label: 'Games',
  emoji: '🎮',
  ageNote: 'A quick dodge game. A great first project for ages 9 and up.',
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
      'give me 3 lives instead of 1',
      'make the ' + str(theme, 'obstacleWord') + ' spin as they fall',
      'add a power up that makes me super fast',
      'make the game get harder after 50 points',
      'change the background color when i grab ' + str(theme, 'bonusWord'),
    ];
  },
};

export default gamesScaffold;
