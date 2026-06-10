/**
 * Quiz Show: one template, two modes picked by a QUIZ_TYPE const.
 * Trivia mode: score, kind feedback, end grade. Personality mode:
 * answers map to characters, fun result card. Kids edit plain arrays.
 */

import type { ScaffoldDef, ThemeConfig } from '../../types.js';

interface TriviaQuestion {
  q: string;
  answers: string[];
  correct: number;
  fact: string;
}

interface PersonalityAnswer {
  text: string;
  character: string;
}

interface PersonalityQuestion {
  q: string;
  answers: PersonalityAnswer[];
}

interface QuizCharacter {
  name: string;
  emoji: string;
  line: string;
}

interface QuizData {
  quizType: 'trivia' | 'personality';
  trivia: TriviaQuestion[];
  personality: PersonalityQuestion[];
  characters: Record<string, QuizCharacter>;
}

function jsData(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const animalsTheme: ThemeConfig = {
  id: 'animals',
  label: 'Animal Trivia',
  emoji: '\u{1F43E}',
  palette: { bg: '#14352a', fg: '#f2fff7', accent: '#ffd166' },
  glyphs: { trophy: '\u{1F3C6}', star: '\u{2B50}', spark: '\u{2728}' },
  strings: {
    tagline: 'How well do you know the animal kingdom?',
    praise1: 'Yes! You got it!',
    praise2: 'Right answer! Nice one.',
    praise3: 'Correct! You are on a roll.',
    wrongLead: 'Almost!',
    playAgain: 'Play again',
    next: 'Next question',
    finish: 'See my score',
    bestLabel: 'Best so far',
    resultLead: 'You are',
  },
  narrativeIntro: 'Octopus hearts, sleepy horses, speedy cheetahs. Time to test your animal smarts.',
  nonViolent: true,
  nonCompetitive: false,
};

const characterTheme: ThemeConfig = {
  id: 'which-character',
  label: 'Which Character Are You?',
  emoji: '\u{1F3AD}',
  palette: { bg: '#241b4d', fg: '#f6f1ff', accent: '#ff7ab6' },
  glyphs: { trophy: '\u{1F31F}', star: '\u{2B50}', spark: '\u{1F389}' },
  strings: {
    tagline: 'Answer six questions. Meet your inner hero.',
    praise1: 'Yes! You got it!',
    praise2: 'Right answer! Nice one.',
    praise3: 'Correct! You are on a roll.',
    wrongLead: 'Almost!',
    playAgain: 'Play again',
    next: 'Next question',
    finish: 'See my result',
    bestLabel: 'Best so far',
    resultLead: 'You are',
  },
  narrativeIntro: 'Four heroes, one quiz. Your answers reveal which one you are.',
  nonViolent: true,
  nonCompetitive: true,
};

const animalsData: QuizData = {
  quizType: 'trivia',
  trivia: [
    {
      q: 'How many hearts does an octopus have?',
      answers: ['One', 'Three', 'Eight'],
      correct: 1,
      fact: 'Two hearts pump to the gills. One pumps to the body.',
    },
    {
      q: 'Which animal can sleep standing up?',
      answers: ['Horse', 'Frog', 'Penguin'],
      correct: 0,
      fact: 'Horses can lock their leg joints while they snooze.',
    },
    {
      q: 'What do pandas eat most of all?',
      answers: ['Fish', 'Bamboo', 'Berries'],
      correct: 1,
      fact: 'A panda can munch bamboo for half the day.',
    },
    {
      q: 'Which of these birds cannot fly?',
      answers: ['Owl', 'Ostrich', 'Robin'],
      correct: 1,
      fact: 'Ostriches cannot fly, but they sprint super fast.',
    },
    {
      q: 'How do dolphins find food in dark water?',
      answers: ['Echo sounds', 'Smell', 'Tiny maps'],
      correct: 0,
      fact: 'It is called echolocation. Clicks bounce back like sonar.',
    },
    {
      q: 'Which animal can regrow its tail?',
      answers: ['Gecko', 'Goat', 'Goose'],
      correct: 0,
      fact: 'Many geckos drop their tails to escape, then grow new ones.',
    },
    {
      q: 'What is a group of lions called?',
      answers: ['A pack', 'A pride', 'A pod'],
      correct: 1,
      fact: 'A pod is for dolphins. A pack is for wolves.',
    },
    {
      q: 'Which is the tallest land animal?',
      answers: ['Elephant', 'Giraffe', 'Moose'],
      correct: 1,
      fact: 'A giraffe can grow about as tall as a two story house.',
    },
  ],
  personality: [
    {
      q: 'It is Saturday morning. What do you do first?',
      answers: [
        { text: 'Build a pillow fort', character: 'otter' },
        { text: 'Read about volcanoes', character: 'owl' },
        { text: 'Race outside', character: 'cheetah' },
        { text: 'Water my plants', character: 'tortoise' },
      ],
    },
    {
      q: 'Pick a snack.',
      answers: [
        { text: 'Anything I can share', character: 'otter' },
        { text: 'Brain food, like trail mix', character: 'owl' },
        { text: 'Something quick to grab', character: 'cheetah' },
        { text: 'A picnic I planned', character: 'tortoise' },
      ],
    },
    {
      q: 'Your team is losing. What do you do?',
      answers: [
        { text: 'Crack a joke to cheer us up', character: 'otter' },
        { text: 'Study the other team', character: 'owl' },
        { text: 'Sprint even harder', character: 'cheetah' },
        { text: 'Stick to our plan', character: 'tortoise' },
      ],
    },
    {
      q: 'Pick a superpower.',
      answers: [
        { text: 'Talking to animals', character: 'otter' },
        { text: 'Knowing every answer', character: 'owl' },
        { text: 'Super speed', character: 'cheetah' },
        { text: 'Never getting tired', character: 'tortoise' },
      ],
    },
    {
      q: 'Homework time. What is your style?',
      answers: [
        { text: 'Turn it into a game', character: 'otter' },
        { text: 'Extra credit, please', character: 'owl' },
        { text: 'Done in ten minutes', character: 'cheetah' },
        { text: 'A little bit each day', character: 'tortoise' },
      ],
    },
    {
      q: 'Pick a field trip.',
      answers: [
        { text: 'The splash park', character: 'otter' },
        { text: 'The science museum', character: 'owl' },
        { text: 'The go kart track', character: 'cheetah' },
        { text: 'The quiet forest trail', character: 'tortoise' },
      ],
    },
  ],
  characters: {
    otter: {
      name: 'Sunny the Otter',
      emoji: '\u{1F9A6}',
      line: 'Playful and kind. You make every day feel like recess.',
    },
    owl: {
      name: 'Sage the Owl',
      emoji: '\u{1F989}',
      line: 'Curious and wise. You ask the best questions.',
    },
    cheetah: {
      name: 'Dash the Cheetah',
      emoji: '\u{1F406}',
      line: 'Fast and bold. You jump in first and learn on the run.',
    },
    tortoise: {
      name: 'Pebble the Tortoise',
      emoji: '\u{1F422}',
      line: 'Calm and steady. You finish what you start.',
    },
  },
};

const characterData: QuizData = {
  quizType: 'personality',
  trivia: [
    {
      q: 'What is the biggest planet in our solar system?',
      answers: ['Jupiter', 'Mars', 'Saturn'],
      correct: 0,
      fact: 'More than 1,000 Earths could fit inside Jupiter.',
    },
    {
      q: 'How many sides does a hexagon have?',
      answers: ['Five', 'Six', 'Seven'],
      correct: 1,
      fact: 'Bees build hexagons in their honeycombs.',
    },
    {
      q: 'What do you call a baby kangaroo?',
      answers: ['A cub', 'A joey', 'A kit'],
      correct: 1,
      fact: "A joey rides in its mom's pouch.",
    },
    {
      q: 'Which gas do we breathe in to live?',
      answers: ['Oxygen', 'Helium', 'Steam'],
      correct: 0,
      fact: 'Plants make oxygen for us. Thanks, plants!',
    },
    {
      q: 'What is the fastest land animal?',
      answers: ['Cheetah', 'Horse', 'Hippo'],
      correct: 0,
      fact: 'Cheetahs can sprint near 70 miles per hour.',
    },
    {
      q: 'How many minutes are in one hour?',
      answers: ['Sixty', 'Thirty', 'One hundred'],
      correct: 0,
      fact: 'And sixty seconds make one minute.',
    },
    {
      q: 'Which ocean is the biggest?',
      answers: ['Atlantic', 'Pacific', 'Arctic'],
      correct: 1,
      fact: 'The Pacific covers about a third of Earth.',
    },
    {
      q: 'Which shape has no corners?',
      answers: ['Circle', 'Square', 'Triangle'],
      correct: 0,
      fact: 'No corners, no edges, just smooth all around.',
    },
  ],
  personality: [
    {
      q: 'A dragon blocks the bridge. What do you do?',
      answers: [
        { text: 'Stand tall and talk to it', character: 'nova' },
        { text: 'Build a dragon snack machine', character: 'pixel' },
        { text: 'Offer it soup and a nap', character: 'maple' },
        { text: 'Find a sneaky side path', character: 'comet' },
      ],
    },
    {
      q: 'Pick your gear.',
      answers: [
        { text: 'A shiny shield', character: 'nova' },
        { text: 'A gadget belt', character: 'pixel' },
        { text: 'A healing kit', character: 'maple' },
        { text: 'Springy boots', character: 'comet' },
      ],
    },
    {
      q: 'Your friend feels scared. What do you do?',
      answers: [
        { text: 'Say: stay behind me', character: 'nova' },
        { text: 'Invent a bravery hat', character: 'pixel' },
        { text: 'Listen and sit with them', character: 'maple' },
        { text: 'Scout ahead so it is safe', character: 'comet' },
      ],
    },
    {
      q: 'Pick a hideout.',
      answers: [
        { text: 'A castle tower', character: 'nova' },
        { text: 'A secret lab', character: 'pixel' },
        { text: 'A garden treehouse', character: 'maple' },
        { text: 'A cave behind a waterfall', character: 'comet' },
      ],
    },
    {
      q: 'The map is missing. What now?',
      answers: [
        { text: 'Lead on, no map needed', character: 'nova' },
        { text: 'Build a compass from junk', character: 'pixel' },
        { text: 'Ask a local owl politely', character: 'maple' },
        { text: 'Climb high and look around', character: 'comet' },
      ],
    },
    {
      q: 'Pick a victory snack.',
      answers: [
        { text: 'A feast for the whole team', character: 'nova' },
        { text: 'Freeze dried star candy', character: 'pixel' },
        { text: 'Warm berry pie', character: 'maple' },
        { text: 'Trail mix on the go', character: 'comet' },
      ],
    },
  ],
  characters: {
    nova: {
      name: 'Captain Nova',
      emoji: '\u{1F680}',
      line: 'Brave and loyal. Your crew follows you anywhere.',
    },
    pixel: {
      name: 'Pixel the Inventor',
      emoji: '\u{1F916}',
      line: 'Clever and curious. You fix problems with wild ideas.',
    },
    maple: {
      name: 'Maple the Healer',
      emoji: '\u{1F33F}',
      line: 'Kind and patient. You notice when friends need help.',
    },
    comet: {
      name: 'Comet the Scout',
      emoji: '\u{1F31F}',
      line: 'Quick and cheerful. You always find the secret path.',
    },
  },
};

function buildHtml(theme: ThemeConfig, prettyName: string): string {
  const s = theme.strings;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(prettyName)}</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="style.css">
  <script src="game.js" defer></script>
</head>
<body>
  <main class="frame">
    <header>
      <h1><span class="emoji">${theme.emoji}</span> ${escapeHtml(prettyName)}</h1>
      <p class="tagline">${s['tagline'] ?? ''}</p>
    </header>
    <section id="quiz" class="card">
      <div class="progress-row">
        <span id="progress"></span>
        <span id="best"></span>
      </div>
      <div class="bar"><div id="bar-fill"></div></div>
      <h2 id="question"></h2>
      <div id="answers"></div>
      <p id="feedback"></p>
      <button id="next" class="big hidden" type="button">${s['next'] ?? 'Next'}</button>
    </section>
    <section id="end" class="card center hidden">
      <div id="end-emoji"></div>
      <h2 id="end-title"></h2>
      <p id="end-copy"></p>
      <button id="play-again" class="big" type="button">${s['playAgain'] ?? 'Play again'}</button>
    </section>
    <p class="tip">Edit your questions in game.js. Flip QUIZ_TYPE to change the whole show!</p>
  </main>
</body>
</html>
`;
}

function buildCss(theme: ThemeConfig): string {
  const p = theme.palette;
  return `/* Quiz Show styles. Colors come from your THEME in game.js. */
* { box-sizing: border-box; }
:root {
  --bg: ${p.bg};
  --fg: ${p.fg};
  --accent: ${p.accent};
}
body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  background-image: radial-gradient(circle at 80% 0%, color-mix(in srgb, var(--accent) 18%, var(--bg)), var(--bg) 60%);
  color: var(--fg);
  font-family: system-ui, "Segoe UI", Roboto, Arial, sans-serif;
  display: flex;
  justify-content: center;
  padding: 28px 16px;
}
.frame { width: min(640px, 100%); }
header h1 { font-size: 1.7rem; margin: 0 0 4px; }
.tagline { margin: 0 0 18px; opacity: 0.85; }
.card {
  background: rgba(255, 255, 255, 0.07);
  background: color-mix(in srgb, var(--fg) 8%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--fg) 16%, var(--bg));
  border-radius: 16px;
  padding: 22px;
}
.center { text-align: center; }
.progress-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  opacity: 0.85;
  margin-bottom: 8px;
}
.bar {
  height: 8px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--fg) 14%, var(--bg));
  overflow: hidden;
  margin-bottom: 18px;
}
#bar-fill {
  height: 100%;
  width: 0%;
  background: var(--accent);
  border-radius: 99px;
  transition: width 0.3s ease;
}
#question { margin: 0 0 16px; font-size: 1.25rem; line-height: 1.4; }
#answers { display: grid; gap: 10px; }
.answer {
  background: color-mix(in srgb, var(--fg) 14%, var(--bg));
  color: var(--fg);
  border: 2px solid transparent;
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 1rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease;
}
.answer:hover:not(:disabled) { transform: translateY(-2px); border-color: var(--accent); }
.answer:focus-visible { outline: 3px solid var(--accent); }
.answer:disabled { cursor: default; opacity: 0.85; }
.answer.right { background: #2e9e6b; color: #ffffff; }
.answer.wrong { background: #c74f4f; color: #ffffff; animation: shake 0.3s ease; }
.answer.picked { border-color: var(--accent); transform: scale(0.98); }
#feedback { min-height: 2.4em; margin: 14px 0 4px; line-height: 1.45; }
.big {
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: 12px;
  padding: 12px 22px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.big:hover { transform: translateY(-2px); }
.big:focus-visible { outline: 3px solid var(--fg); }
.hidden { display: none; }
#end-emoji { font-size: 4rem; margin-bottom: 6px; }
#end-title { margin: 0 0 8px; }
#end-copy { margin: 0 0 18px; line-height: 1.5; }
.tip { opacity: 0.65; font-size: 0.85rem; margin-top: 16px; }
.confetti {
  position: fixed;
  top: -2rem;
  font-size: 1.5rem;
  pointer-events: none;
  animation: fall 2.2s linear forwards;
}
@keyframes fall { to { transform: translateY(110vh) rotate(360deg); } }
@keyframes shake {
  0% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
  100% { transform: translateX(0); }
}
`;
}

function buildGameJs(theme: ThemeConfig, data: QuizData): string {
  return `// Quiz Show: ${theme.label}. Made with Termi.
//
// HOW YOUR QUIZ WORKS:
// 1. QUIZ_TYPE picks the mode: "trivia" or "personality". Try flipping it!
// 2. Trivia questions live in TRIVIA_QUESTIONS. "correct" is the answer spot,
//    counting from 0.
// 3. Personality questions live in PERSONALITY_QUESTIONS. Each answer points
//    to a character in CHARACTERS.
// Save the file and refresh the page to see your changes.

const THEME = ${jsData({
    id: theme.id,
    label: theme.label,
    emoji: theme.emoji,
    palette: theme.palette,
    glyphs: theme.glyphs,
    strings: theme.strings,
  })};

// Pick your quiz style: "trivia" or "personality".
const QUIZ_TYPE = ${JSON.stringify(data.quizType)};

// === YOUR TRIVIA QUESTIONS (edit this part!) ===
const TRIVIA_QUESTIONS = ${jsData(data.trivia)};
// === END OF TRIVIA QUESTIONS ===

// === YOUR PERSONALITY QUIZ (edit this part!) ===
const PERSONALITY_QUESTIONS = ${jsData(data.personality)};
const CHARACTERS = ${jsData(data.characters)};
// === END OF PERSONALITY QUIZ ===

// ----- The quiz engine starts here. Curious? Read on! -----
const progressEl = document.getElementById("progress");
const bestEl = document.getElementById("best");
const barFillEl = document.getElementById("bar-fill");
const questionEl = document.getElementById("question");
const answersEl = document.getElementById("answers");
const feedbackEl = document.getElementById("feedback");
const nextBtn = document.getElementById("next");
const quizEl = document.getElementById("quiz");
const endEl = document.getElementById("end");
const endEmojiEl = document.getElementById("end-emoji");
const endTitleEl = document.getElementById("end-title");
const endCopyEl = document.getElementById("end-copy");
const playAgainBtn = document.getElementById("play-again");

const mode = QUIZ_TYPE === "personality" ? "personality" : "trivia";
const questions = mode === "personality" ? PERSONALITY_QUESTIONS : TRIVIA_QUESTIONS;
const BEST_KEY = "termi-quiz-best-" + THEME.id;
let index = 0;
let score = 0;
let tally = {};

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || "0");
  } catch (err) {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch (err) {
    // Storage is off. The quiz still plays fine.
  }
}

function updateBestNote() {
  if (mode !== "trivia") {
    bestEl.textContent = "";
    return;
  }
  const best = loadBest();
  bestEl.textContent = best > 0 ? THEME.strings.bestLabel + ": " + best : "";
}

function throwConfetti() {
  const bits = [THEME.glyphs.spark, THEME.glyphs.star, THEME.glyphs.trophy];
  for (let i = 0; i < 16; i += 1) {
    const bit = document.createElement("span");
    bit.className = "confetti";
    bit.textContent = bits[i % bits.length];
    bit.style.left = Math.floor(Math.random() * 100) + "%";
    bit.style.animationDelay = (Math.random() * 0.6).toFixed(2) + "s";
    document.body.appendChild(bit);
    setTimeout(function () {
      bit.remove();
    }, 2600);
  }
}

function renderQuestion() {
  feedbackEl.textContent = "";
  nextBtn.classList.add("hidden");
  answersEl.textContent = "";
  const q = questions[index];
  progressEl.textContent = "Question " + (index + 1) + " of " + questions.length;
  barFillEl.style.width = Math.round((index / questions.length) * 100) + "%";
  questionEl.textContent = q.q;
  q.answers.forEach(function (answer, i) {
    const btn = document.createElement("button");
    btn.className = "answer";
    btn.type = "button";
    btn.textContent = mode === "personality" ? answer.text : answer;
    btn.addEventListener("click", function () {
      if (mode === "personality") {
        pickPersonality(btn, answer);
      } else {
        pickTrivia(btn, i, q);
      }
    });
    answersEl.appendChild(btn);
  });
}

function pickPersonality(btn, answer) {
  const buttons = answersEl.querySelectorAll("button");
  buttons.forEach(function (b) {
    b.disabled = true;
  });
  btn.classList.add("picked");
  tally[answer.character] = (tally[answer.character] || 0) + 1;
  setTimeout(nextStep, 350);
}

function pickTrivia(btn, i, q) {
  const buttons = answersEl.querySelectorAll("button");
  buttons.forEach(function (b, bIndex) {
    b.disabled = true;
    if (bIndex === q.correct) {
      b.classList.add("right");
    }
  });
  if (i === q.correct) {
    score += 1;
    const praises = [THEME.strings.praise1, THEME.strings.praise2, THEME.strings.praise3];
    const praise = praises[Math.floor(Math.random() * praises.length)];
    feedbackEl.textContent = praise + " " + q.fact;
  } else {
    btn.classList.add("wrong");
    feedbackEl.textContent =
      THEME.strings.wrongLead + " The answer is " + q.answers[q.correct] + ". " + q.fact;
  }
  nextBtn.textContent = index + 1 >= questions.length ? THEME.strings.finish : THEME.strings.next;
  nextBtn.classList.remove("hidden");
}

function nextStep() {
  index += 1;
  if (index >= questions.length) {
    showEnd();
  } else {
    renderQuestion();
  }
}

function gradeCopy() {
  const share = score / questions.length;
  if (share >= 1) {
    return "Perfect round! You are a quiz champion.";
  }
  if (share >= 0.75) {
    return "Wow! You know so much.";
  }
  if (share >= 0.5) {
    return "Nice work! One more round will make you even sharper.";
  }
  return "Good try! Every round teaches you something new.";
}

function personalityWinner() {
  let bestId = null;
  let bestCount = -1;
  Object.keys(CHARACTERS).forEach(function (id) {
    const count = tally[id] || 0;
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  });
  return CHARACTERS[bestId];
}

function showEnd() {
  quizEl.classList.add("hidden");
  endEl.classList.remove("hidden");
  if (mode === "personality") {
    const winner = personalityWinner();
    endEmojiEl.textContent = winner.emoji;
    endTitleEl.textContent = THEME.strings.resultLead + " " + winner.name + "!";
    endCopyEl.textContent = winner.line;
  } else {
    endEmojiEl.textContent = THEME.glyphs.trophy;
    endTitleEl.textContent = "You got " + score + " of " + questions.length + "!";
    let copy = gradeCopy();
    const best = loadBest();
    if (score > best) {
      saveBest(score);
      if (best > 0) {
        copy += " New personal best!";
      }
    }
    endCopyEl.textContent = copy;
  }
  throwConfetti();
}

function restart() {
  index = 0;
  score = 0;
  tally = {};
  endEl.classList.add("hidden");
  quizEl.classList.remove("hidden");
  updateBestNote();
  renderQuestion();
}

nextBtn.addEventListener("click", nextStep);
playAgainBtn.addEventListener("click", restart);

updateBestNote();
renderQuestion();
`;
}

function buildTermiMd(theme: ThemeConfig, prettyName: string, data: QuizData): string {
  const modeLine =
    data.quizType === 'personality'
      ? `A personality quiz with ${data.personality.length} questions and ${Object.keys(data.characters).length} characters.`
      : `A trivia quiz with ${data.trivia.length} questions, scoring, and kind feedback.`;
  return [
    `# ${prettyName}`,
    '',
    '## What this is',
    `${modeLine} Flip QUIZ_TYPE in game.js to switch modes.`,
    '',
    '## Files',
    '- index.html: the page and its parts.',
    '- style.css: the colors and look.',
    '- game.js: the question lists at the top, then the quiz engine.',
    '',
    '## Built so far',
    `- Starter ${theme.label} quiz with both trivia and personality data ready.`,
    '',
    '## Recap line',
    `We built a ${theme.label} quiz that is ready to play.`,
    '',
  ].join('\n');
}

function dataFor(theme: ThemeConfig): QuizData {
  return theme.id === 'which-character' ? characterData : animalsData;
}

export const quizzesScaffold: ScaffoldDef = {
  id: 'quizzes',
  label: 'Quiz Show',
  emoji: '\u{2753}',
  ageNote: 'Great for ages 9 and up. Make quizzes for friends and family.',
  themes: [animalsTheme, characterTheme],
  files(theme: ThemeConfig, prettyName: string): Record<string, string> {
    const data = dataFor(theme);
    return {
      'index.html': buildHtml(theme, prettyName),
      'style.css': buildCss(theme),
      'game.js': buildGameJs(theme, data),
      'TERMI.md': buildTermiMd(theme, prettyName, data),
    };
  },
  starterPrompts(theme: ThemeConfig): string[] {
    if (theme.id === 'which-character') {
      return [
        'Add a new character called the dragon tamer',
        'Write three more questions about snacks and weekends',
        'Give each result card its own colors',
        'Add more confetti when I get my result',
        'Switch it to trivia mode with space questions',
      ];
    }
    return [
      'Add five more animal questions',
      'Make a question about sharks with a cool fact',
      'Add a timer so each question feels exciting',
      'Show a silly face when I get one wrong',
      'Switch it to a which animal are you quiz',
    ];
  },
};

export default quizzesScaffold;
