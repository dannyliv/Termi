/**
 * Minimal blank game project: no stock playable game, just a local HTML
 * shell the model fills in. Used by the Build a game flow.
 */

import fs from 'node:fs';
import path from 'node:path';
import { projectsDir } from '../config/paths.js';
import { slugifyName } from './create.js';
import {
  notesFileName,
  openProject,
  renderTermiMd,
  saveProjectMeta,
  type ProjectContext,
} from './store.js';

const BLANK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>__TITLE__</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1 id="title">__TITLE__</h1>
    <p id="hint">Your game will show up here after you build with Termi.</p>
    <canvas id="game" width="480" height="320" aria-label="game"></canvas>
  </main>
  <script src="game.js"></script>
</body>
</html>
`;

const BLANK_CSS = `* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
  display: grid;
  place-items: center;
}
main { text-align: center; padding: 1rem; }
h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
#hint { opacity: 0.8; margin-bottom: 1rem; }
canvas {
  background: #1e293b;
  border: 2px solid #38bdf8;
  border-radius: 12px;
  max-width: 100%;
}
`;

const BLANK_JS = `// Blank starter. Termi and the kid fill this in.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function frame() {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Ready to build!', canvas.width / 2, canvas.height / 2);
}
frame();
`;

function writeRel(dir: string, relPath: string, content: string): void {
  const target = path.join(dir, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

/**
 * Creates an empty local-browser game shell under the projects library.
 * scaffoldId stays "games" so existing badges and quests still recognize it.
 */
export function createBlankGameProject(
  prettyNameInput: string,
  ideaLabel = 'My game',
): ProjectContext {
  const trimmed = prettyNameInput.trim();
  const prettyName = trimmed.length > 0 ? trimmed : 'My Game';
  const { slug } = slugifyName(prettyName);
  const dir = path.join(projectsDir(), slug);
  fs.mkdirSync(dir, { recursive: true });

  const html = BLANK_HTML.replaceAll('__TITLE__', prettyName);
  writeRel(dir, 'index.html', html);
  writeRel(dir, 'style.css', BLANK_CSS);
  writeRel(dir, 'game.js', BLANK_JS);
  writeRel(
    dir,
    notesFileName,
    renderTermiMd(prettyName, {
      whatThisIs: `A browser game: ${ideaLabel}. Built with Termi.`,
      files: ['index.html', 'style.css', 'game.js'],
      builtSoFar: ['Blank game shell ready for the first prompt'],
      recapLine: `We started ${prettyName}.`,
    }),
  );

  const now = new Date().toISOString();
  saveProjectMeta({
    slug,
    prettyName,
    scaffoldId: 'games',
    themeId: 'blank',
    createdAt: now,
    lastOpenedAt: now,
  });

  const project = openProject(slug);
  if (project === null) {
    throw new Error('Something went wrong while making the project. Try again.');
  }
  return project;
}
