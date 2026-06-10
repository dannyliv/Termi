/**
 * Pixel Studio scaffold: a canvas pixel-art painter.
 * Kid files: index.html, style.css, game.js. Vanilla JS, zero network.
 */

import type { ScaffoldDef, ThemeConfig } from '../../types.js';

interface ArtExtras {
  paper: string;
  fileName: string;
  colors: string[];
  prompts: string[];
}

const freeDraw: ThemeConfig = {
  id: 'free-draw',
  label: 'Free Draw',
  emoji: '🌈',
  palette: { bg: '#1b1f3b', fg: '#f7f7ff', accent: '#ffd166' },
  glyphs: { brush: '🖌️', eraser: '🧽', fill: '🪣', clear: '✨', download: '💾' },
  strings: {
    studioName: 'Rainbow Studio',
    hint: 'Pick a color. Then click or drag to paint!',
    idea: 'Idea: paint a sunset over the sea.',
    brushTip: 'Brush time! Drag to paint squares.',
    eraserTip: 'Eraser ready. Rub out any square.',
    fillTip: 'Bucket ready! Click a spot to fill it.',
    cleared: 'Fresh paper! What will you make now?',
    saved: 'Saved! Check your downloads folder.',
    autoSaveNote: 'Your art saves itself while you paint.',
  },
  narrativeIntro: 'Welcome to your art studio. The paper is ready. What will you paint first?',
  nonViolent: true,
  nonCompetitive: true,
};

const petPortraits: ThemeConfig = {
  id: 'pet-portraits',
  label: 'Pet Portraits',
  emoji: '🐶',
  palette: { bg: '#2c1c12', fg: '#fff4e6', accent: '#ffb26b' },
  glyphs: { brush: '🖌️', eraser: '🧽', fill: '🪣', clear: '✨', download: '💾' },
  strings: {
    studioName: 'Pet Portrait Studio',
    hint: 'Paint a furry friend, square by square!',
    idea: 'Idea: paint a cat with bright green eyes.',
    brushTip: 'Brush time! Paint some soft fur.',
    eraserTip: 'Eraser ready. Fix any stray fur.',
    fillTip: 'Bucket ready! Fill the background fast.',
    cleared: 'Fresh paper! Time for a new pet.',
    saved: 'Saved! Check your downloads folder.',
    autoSaveNote: 'Your art saves itself while you paint.',
  },
  narrativeIntro: 'Every pet deserves a portrait. Paint a furry friend today.',
  nonViolent: true,
  nonCompetitive: true,
};

const EXTRAS: Record<string, ArtExtras> = {
  'free-draw': {
    paper: '#fffdf6',
    fileName: 'my-pixel-art',
    colors: [
      '#ff5d5d', '#ff9f43', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5',
      '#f15bb5', '#00c2a8', '#8d6e63', '#222831', '#b0bec5', '#ffffff',
    ],
    prompts: [
      'Add a hot pink color to my paint set.',
      'Make a rainbow button that paints with random colors.',
      'Add a big brush that paints four squares at once.',
      'Add a mirror mode that copies my left side to the right.',
      'Add a night mode with a dark paper color.',
    ],
  },
  'pet-portraits': {
    paper: '#fdf6ec',
    fileName: 'my-pet-portrait',
    colors: [
      '#fff3e0', '#f6d186', '#c98850', '#8d5a3c', '#5d4037', '#3e2723',
      '#9e9e9e', '#37474f', '#ffffff', '#f48fb1', '#66bb6a', '#42a5f5',
    ],
    prompts: [
      'Add more fur colors, like golden and spotted gray.',
      'Add a stamp that draws a paw print.',
      'Add a fancy gold frame around my painting.',
      'Make a button that draws cat whiskers for me.',
      'Add a little bone sticker I can place anywhere.',
    ],
  },
};

function extrasFor(id: string): ArtExtras {
  return EXTRAS[id] ?? (EXTRAS['free-draw'] as ArtExtras);
}

function s(theme: ThemeConfig, key: string): string {
  return theme.strings[key] ?? '';
}

function g(theme: ThemeConfig, key: string): string {
  return theme.glyphs[key] ?? '';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(theme: ThemeConfig, prettyName: string): string {
  const name = escapeHtml(prettyName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} ${theme.emoji}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="studio">
    <header>
      <h1>${theme.emoji} ${name}</h1>
      <p class="subtitle">${escapeHtml(s(theme, 'studioName'))}</p>
      <p class="intro">${escapeHtml(theme.narrativeIntro)}</p>
    </header>

    <section class="toolbar" aria-label="Tools">
      <button data-tool="brush" class="tool active">${g(theme, 'brush')} Brush</button>
      <button data-tool="eraser" class="tool">${g(theme, 'eraser')} Eraser</button>
      <button data-tool="fill" class="tool">${g(theme, 'fill')} Fill</button>
      <span class="divider"></span>
      <button data-size="16" class="size active">16 x 16</button>
      <button data-size="32" class="size">32 x 32</button>
      <span class="divider"></span>
      <button id="clear" class="action">${g(theme, 'clear')} Clear</button>
      <button id="download" class="action">${g(theme, 'download')} Save PNG</button>
    </section>

    <div id="swatches" class="swatches" aria-label="Paint colors"></div>

    <canvas id="paper" width="480" height="480"></canvas>

    <p id="message" class="message"></p>
    <footer>
      <p class="idea">${escapeHtml(s(theme, 'idea'))}</p>
      <p class="note">${escapeHtml(s(theme, 'autoSaveNote'))}</p>
    </footer>
  </main>
  <script src="game.js"></script>
</body>
</html>
`;
}

function buildCss(theme: ThemeConfig): string {
  const extra = extrasFor(theme.id);
  return `:root {
  --bg: ${theme.palette.bg};
  --fg: ${theme.palette.fg};
  --accent: ${theme.palette.accent};
  --paper: ${extra.paper};
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
  font-family: "Avenir Next", "Trebuchet MS", Verdana, sans-serif;
}

.studio {
  width: min(720px, 94vw);
  margin: 0 auto;
  padding: 18px 0 40px;
  text-align: center;
}

header h1 { margin: 8px 0 2px; font-size: 2rem; }
.subtitle { margin: 0; color: var(--accent); font-weight: bold; }
.intro { margin: 6px 0 14px; opacity: 0.85; }

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  align-items: center;
  margin-bottom: 12px;
}

.toolbar button {
  font: inherit;
  color: var(--fg);
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid transparent;
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
}

.toolbar button:hover { background: rgba(255, 255, 255, 0.16); }
.toolbar button.active { border-color: var(--accent); }

.divider {
  width: 2px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 14px;
}

.swatch {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.25);
  cursor: pointer;
  padding: 0;
}

.swatch.active {
  border-color: var(--accent);
  transform: scale(1.18);
}

#paper {
  width: min(480px, 92vw);
  aspect-ratio: 1 / 1;
  background: var(--paper);
  border: 4px solid var(--accent);
  border-radius: 12px;
  touch-action: none;
  image-rendering: pixelated;
  cursor: crosshair;
}

.message {
  min-height: 1.4em;
  margin: 12px 0 4px;
  color: var(--accent);
  font-weight: bold;
}

footer p { margin: 4px 0; opacity: 0.75; font-size: 0.95rem; }
`;
}

function buildJs(theme: ThemeConfig): string {
  const extra = extrasFor(theme.id);
  const themeData = {
    id: theme.id,
    studioName: s(theme, 'studioName'),
    hint: s(theme, 'hint'),
    paper: extra.paper,
    fileName: extra.fileName,
    colors: extra.colors,
    toolTips: {
      brush: s(theme, 'brushTip'),
      eraser: s(theme, 'eraserTip'),
      fill: s(theme, 'fillTip'),
    },
    clearedMessage: s(theme, 'cleared'),
    savedMessage: s(theme, 'saved'),
  };
  return `// ====================================================
// THEME SETTINGS
// These values set the colors and the words.
// Change one, save the file, and reload the page!
// ====================================================
const THEME = ${JSON.stringify(themeData, null, 2)};

// ----- find the page pieces -----
const canvas = document.getElementById("paper");
const ctx = canvas.getContext("2d");
const swatchBar = document.getElementById("swatches");
const messageBox = document.getElementById("message");

// ----- studio state -----
let gridSize = 16;
let cells = [];
let tool = "brush";
let paintColor = THEME.colors[0];
let painting = false;
let messageTimer = null;

// Each grid size keeps its own saved drawing.
function saveKey() {
  return "pixel-studio-" + THEME.id + "-" + gridSize;
}

function freshCells() {
  return new Array(gridSize * gridSize).fill("");
}

function loadCells() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(saveKey()));
  } catch (err) {
    saved = null;
  }
  const wanted = gridSize * gridSize;
  cells = Array.isArray(saved) && saved.length === wanted ? saved : freshCells();
}

function saveCells() {
  localStorage.setItem(saveKey(), JSON.stringify(cells));
}

// ----- drawing the paper -----
function draw() {
  const size = canvas.width / gridSize;
  ctx.fillStyle = THEME.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === "") continue;
    const x = (i % gridSize) * size;
    const y = Math.floor(i / gridSize) * size;
    ctx.fillStyle = cells[i];
    ctx.fillRect(x, y, size, size);
  }
  // light grid lines so squares are easy to see
  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
  ctx.lineWidth = 1;
  for (let n = 1; n < gridSize; n++) {
    const p = n * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, canvas.height);
    ctx.moveTo(0, p);
    ctx.lineTo(canvas.width, p);
    ctx.stroke();
  }
}

// ----- painting tools -----
function cellAt(event) {
  const rect = canvas.getBoundingClientRect();
  const col = Math.floor(((event.clientX - rect.left) / rect.width) * gridSize);
  const row = Math.floor(((event.clientY - rect.top) / rect.height) * gridSize);
  if (col < 0 || row < 0 || col >= gridSize || row >= gridSize) return -1;
  return row * gridSize + col;
}

function useToolAt(index) {
  if (index < 0) return;
  if (tool === "brush") cells[index] = paintColor;
  if (tool === "eraser") cells[index] = "";
  if (tool === "fill") fillArea(index);
  draw();
}

// The bucket fills every touching square that matches.
function fillArea(start) {
  const target = cells[start];
  if (target === paintColor) return;
  const spots = [start];
  while (spots.length > 0) {
    const i = spots.pop();
    if (cells[i] !== target) continue;
    cells[i] = paintColor;
    const col = i % gridSize;
    if (col > 0) spots.push(i - 1);
    if (col < gridSize - 1) spots.push(i + 1);
    if (i - gridSize >= 0) spots.push(i - gridSize);
    if (i + gridSize < cells.length) spots.push(i + gridSize);
  }
}

canvas.addEventListener("pointerdown", (event) => {
  painting = true;
  useToolAt(cellAt(event));
});

canvas.addEventListener("pointermove", (event) => {
  if (painting && tool !== "fill") useToolAt(cellAt(event));
});

window.addEventListener("pointerup", () => {
  if (!painting) return;
  painting = false;
  saveCells();
});

// ----- little helper messages -----
function toast(text) {
  messageBox.textContent = text;
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    messageBox.textContent = THEME.hint;
  }, 2500);
}

function selectButton(group, button) {
  document.querySelectorAll(group).forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
}

// ----- build the color swatches -----
THEME.colors.forEach((color, i) => {
  const b = document.createElement("button");
  b.className = "swatch" + (i === 0 ? " active" : "");
  b.style.background = color;
  b.title = "Paint with " + color;
  b.addEventListener("click", () => {
    paintColor = color;
    selectButton(".swatch", b);
    if (tool === "eraser") {
      tool = "brush";
      const brushButton = document.querySelector('[data-tool="brush"]');
      if (brushButton) selectButton("[data-tool]", brushButton);
    }
  });
  swatchBar.appendChild(b);
});

// ----- wire up the toolbar -----
document.querySelectorAll("[data-tool]").forEach((b) => {
  b.addEventListener("click", () => {
    tool = b.dataset.tool;
    selectButton("[data-tool]", b);
    toast(THEME.toolTips[tool]);
  });
});

document.querySelectorAll("[data-size]").forEach((b) => {
  b.addEventListener("click", () => {
    saveCells();
    gridSize = Number(b.dataset.size);
    selectButton("[data-size]", b);
    loadCells();
    draw();
    toast("Now painting on " + gridSize + " by " + gridSize + " paper.");
  });
});

document.getElementById("clear").addEventListener("click", () => {
  cells = freshCells();
  saveCells();
  draw();
  toast(THEME.clearedMessage);
});

// Turn the drawing into a PNG file, right on this computer.
document.getElementById("download").addEventListener("click", () => {
  const art = document.createElement("canvas");
  const scale = 16;
  art.width = gridSize * scale;
  art.height = gridSize * scale;
  const artCtx = art.getContext("2d");
  artCtx.fillStyle = THEME.paper;
  artCtx.fillRect(0, 0, art.width, art.height);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === "") continue;
    const x = (i % gridSize) * scale;
    const y = Math.floor(i / gridSize) * scale;
    artCtx.fillStyle = cells[i];
    artCtx.fillRect(x, y, scale, scale);
  }
  const link = document.createElement("a");
  link.download = THEME.fileName + ".png";
  link.href = art.toDataURL("image/png");
  link.click();
  toast(THEME.savedMessage);
});

// ----- start the studio -----
loadCells();
draw();
messageBox.textContent = THEME.hint;
`;
}

export const artScaffold: ScaffoldDef = {
  id: 'art',
  label: 'Pixel Studio',
  emoji: '🎨',
  ageNote: 'Calm and creative. Make art at your own pace.',
  themes: [freeDraw, petPortraits],
  files(theme: ThemeConfig, prettyName: string): Record<string, string> {
    return {
      'index.html': buildHtml(theme, prettyName),
      'style.css': buildCss(theme),
      'game.js': buildJs(theme),
    };
  },
  starterPrompts(theme: ThemeConfig): string[] {
    return [...extrasFor(theme.id).prompts];
  },
};

export default artScaffold;
