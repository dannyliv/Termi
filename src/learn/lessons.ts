/**
 * Learn mode lesson data: six scripted lessons about building with AI.
 *
 * Pure data plus one rule-based prompt grader. No model calls, no network,
 * no disk. Copy follows the kid rules: grade 4 to 5 reading level, every
 * sentence under 15 words, mascot voice, no dashes.
 */

/** One answer a kid can pick inside a choice step. */
export interface LessonChoiceOption {
  label: string;
  /** Exactly one option per choice carries true. */
  correct?: boolean;
  /** Kind one-liner shown right after the pick. */
  feedback: string;
}

/** A single beat of a lesson. The runner walks these in order. */
export type LessonStep =
  | { kind: 'say'; text: string }
  | { kind: 'choice'; question: string; options: LessonChoiceOption[] }
  | { kind: 'grade'; prompt: string; isGood: boolean; why: string }
  | { kind: 'mission'; text: string };

export interface Lesson {
  id: string;
  title: string;
  emoji: string;
  intro: string;
  steps: LessonStep[];
}

/** The six lessons, in teaching order. Ids double as badge ids. */
export const LESSONS: readonly Lesson[] = [
  {
    id: 'learn-1',
    title: 'Meet your AI helper',
    emoji: '\u{1F916}',
    intro: 'Let us meet the robot brain that helps you build.',
    steps: [
      { kind: 'say', text: 'Hi! I am Termi. An AI program does my thinking.' },
      {
        kind: 'say',
        text: 'An AI learned from millions of examples. It guesses what comes next.',
      },
      {
        kind: 'say',
        text: 'Good guesses look smart. But some guesses are wrong. That is normal.',
      },
      {
        kind: 'choice',
        question: 'Is the AI a person?',
        options: [
          {
            label: 'Yes, a tiny person lives in the computer',
            feedback: 'Good guess, but no. It is a program that guesses from patterns.',
          },
          {
            label: 'No, it is a computer program',
            correct: true,
            feedback: 'Right! It is a tool, like a super calculator for words.',
          },
          {
            label: 'Maybe it is a robot ghost',
            feedback: 'Ha! No ghosts here. It is a program that guesses from patterns.',
          },
        ],
      },
      {
        kind: 'choice',
        question: 'The AI sounds friendly. Does it have real feelings?',
        options: [
          {
            label: 'Yes, it likes me a lot',
            feedback: 'It sounds warm, but no. It makes friendly words without feeling them.',
          },
          {
            label: 'No, it only makes friendly words',
            correct: true,
            feedback: 'Right! Friendly words are part of its job. It feels nothing.',
          },
        ],
      },
      {
        kind: 'choice',
        question: 'What should you keep secret from an AI?',
        options: [
          {
            label: 'My real name, school, and address',
            correct: true,
            feedback: 'Yes! Keep real life info secret. Made up names are perfect.',
          },
          {
            label: 'My game ideas',
            feedback: 'Share those! Ideas are safe. Keep your real name and address secret.',
          },
          {
            label: 'Nothing at all',
            feedback: 'Careful! Keep your real name, school, and address secret.',
          },
        ],
      },
      { kind: 'say', text: 'Big rule: the AI is a tool. You are the human in charge.' },
      {
        kind: 'mission',
        text: 'Open any project. Then say: change the title to something silly. Watch your AI helper work.',
      },
    ],
  },
  {
    id: 'learn-2',
    title: 'Super prompts',
    emoji: '✨',
    intro: 'Strong asks get strong builds. Time to power up.',
    steps: [
      {
        kind: 'say',
        text: 'A super prompt tells three things. What to change. Where it is. How it should look.',
      },
      {
        kind: 'say',
        text: 'Weak ask: make it cool. Strong ask: make the player a red dragon.',
      },
      { kind: 'say', text: 'Now you be the judge. Grade these prompts.' },
      {
        kind: 'grade',
        prompt: 'make it better',
        isGood: false,
        why: 'Better how? It does not say what to change or how.',
      },
      {
        kind: 'grade',
        prompt: 'make the player a red dragon',
        isGood: true,
        why: 'It names the player and says how: a red dragon.',
      },
      {
        kind: 'grade',
        prompt: 'fix the game',
        isGood: false,
        why: 'Fix what? It does not say what looks wrong or where.',
      },
      {
        kind: 'grade',
        prompt: 'change the sky in my game to purple with stars',
        isGood: true,
        why: 'It says what, the sky, and how, purple with stars.',
      },
      { kind: 'say', text: 'Nice grading! Now write your own super prompt.' },
      {
        kind: 'mission',
        text: 'Open a project. Try your super prompt for real. Make it say what, where, and how.',
      },
    ],
  },
  {
    id: 'learn-3',
    title: 'Small steps win',
    emoji: '\u{1F422}',
    intro: 'Big projects grow one small step at a time.',
    steps: [
      { kind: 'say', text: 'Want a whole new game? Awesome. We build it in small steps.' },
      { kind: 'say', text: 'Ask for one change. Check the preview. Then ask for the next.' },
      {
        kind: 'choice',
        question: 'You want a faster player, a new boss, and new music. What do you ask first?',
        options: [
          {
            label: 'All three at once',
            feedback: 'Tempting! But big asks get tangled. One at a time wins.',
          },
          {
            label: 'Just the faster player',
            correct: true,
            feedback: 'Yes! One change, then a preview check. Then the next one.',
          },
        ],
      },
      {
        kind: 'choice',
        question: 'Your change landed. What comes next?',
        options: [
          {
            label: 'Check the preview',
            correct: true,
            feedback: 'Right! Look first, so you know it worked.',
          },
          {
            label: 'Ask for five more changes',
            feedback: 'Hold on! Check the preview first. Make sure it worked.',
          },
        ],
      },
      {
        kind: 'say',
        text: 'Small steps make bugs easy to spot. You always know what changed.',
      },
      {
        kind: 'mission',
        text: 'Pick one small change. Say: make the player a little faster. Then check the preview.',
      },
    ],
  },
  {
    id: 'learn-4',
    title: 'Be a code detective',
    emoji: '\u{1F50D}',
    intro: 'Grab your magnifying glass. We will track what the AI did.',
    steps: [
      { kind: 'say', text: 'When I build, I print activity lines. They say what I touched.' },
      { kind: 'say', text: 'A line like "edited game.js" means that file changed.' },
      {
        kind: 'choice',
        question: 'The line says "edited style.css". What changed?',
        options: [
          {
            label: 'The look, like colors and sizes',
            correct: true,
            feedback: 'Yes! Looks live in style.css: colors, sizes, and fonts.',
          },
          {
            label: 'The game rules',
            feedback: 'Not this time. Rules live in game.js. Looks live in style.css.',
          },
        ],
      },
      {
        kind: 'choice',
        question: 'Which file most likely holds the score code?',
        options: [
          {
            label: 'game.js',
            correct: true,
            feedback: 'Right! Game logic, like the score, lives in game.js.',
          },
          {
            label: 'style.css',
            feedback: 'Close! style.css is looks only. Score logic lives in game.js.',
          },
          {
            label: 'index.html',
            feedback: 'Good thought! That file is the page frame. Score code lives in game.js.',
          },
        ],
      },
      {
        kind: 'choice',
        question: 'You want to find the change inside a file. What is the fast way?',
        options: [
          {
            label: 'Search for words from your ask, like speed',
            correct: true,
            feedback: 'Smart! The change sits near words from your ask.',
          },
          {
            label: 'Read every single line',
            feedback: 'That works, but it is slow. Search for words from your ask.',
          },
        ],
      },
      { kind: 'say', text: 'Reading the changes teaches you real code, bit by bit.' },
      {
        kind: 'mission',
        text: 'Ask for one small change. Then read the activity lines and find the file that changed.',
      },
    ],
  },
  {
    id: 'learn-5',
    title: 'When it goes wrong',
    emoji: '\u{1F41B}',
    intro: 'Bugs happen to every builder. Even me. Beep.',
    steps: [
      { kind: 'say', text: 'A bug is when your project does something you did not want.' },
      { kind: 'say', text: 'Every builder makes bugs. The pros make them every day.' },
      {
        kind: 'choice',
        question: 'Your game broke after a change. Whose fault is it?',
        options: [
          {
            label: 'Mine. I am bad at this',
            feedback: 'No way! Bugs are normal for every builder. Never blame yourself.',
          },
          {
            label: 'Nobody. Bugs just happen when we build',
            correct: true,
            feedback: 'Right! Bugs are part of building. We find them and fix them.',
          },
        ],
      },
      {
        kind: 'say',
        text: 'To get a fix, tell me two things. What you SEE. What you WANTED.',
      },
      {
        kind: 'choice',
        question: 'Which bug report helps the most?',
        options: [
          {
            label: 'It is broken',
            feedback: 'Broken how? Say what you see and what you wanted.',
          },
          {
            label: 'The player sinks through the floor. I want it to stand',
            correct: true,
            feedback: 'Perfect! What you see, plus what you wanted. Easy to fix.',
          },
        ],
      },
      {
        kind: 'choice',
        question: 'A change made things worse. What is the safest move?',
        options: [
          {
            label: 'Type /undo',
            correct: true,
            feedback: 'Yes! Undo takes back the last change. It is always safe.',
          },
          {
            label: 'Pile on more changes',
            feedback: 'Risky! Changes can stack into a mess. Undo is the safe reset.',
          },
        ],
      },
      { kind: 'say', text: 'Remember: /undo is always safe. No mistake is stuck forever.' },
      {
        kind: 'mission',
        text: 'Spot something odd in a project. Say: I see this, but I wanted that. Then watch the fix.',
      },
    ],
  },
  {
    id: 'learn-6',
    title: 'You are the boss',
    emoji: '\u{1F451}',
    intro: 'Crown on. The AI works for you, boss.',
    steps: [
      { kind: 'say', text: 'The AI suggests ideas. You decide what your project becomes.' },
      {
        kind: 'choice',
        question: 'The AI suggests a blue ship. You wanted green. Who wins?',
        options: [
          {
            label: 'The AI. It is smarter',
            feedback: 'Nope! It only suggests. Ask for the green ship.',
          },
          {
            label: 'Me. It is my project',
            correct: true,
            feedback: 'Right! You decide. The AI helps, but you are the boss.',
          },
        ],
      },
      { kind: 'say', text: 'Do not like a suggestion? Skip it. Or remix it your way.' },
      {
        kind: 'choice',
        question: 'The AI gives you a boring idea. What can you do?',
        options: [
          {
            label: 'Use it anyway',
            feedback: 'You can, but you do not have to. Add your own twist!',
          },
          {
            label: 'Remix it with my own twist',
            correct: true,
            feedback: 'Yes! Your twist makes it yours. That is real creating.',
          },
        ],
      },
      {
        kind: 'choice',
        question: 'What makes a project truly yours?',
        options: [
          {
            label: 'The AI wrote most of the code',
            feedback: 'Code is one part. Your ideas and choices make it yours.',
          },
          {
            label: 'My ideas, my choices, my style',
            correct: true,
            feedback: 'Exactly! Your ideas and choices make it yours. The AI just helps.',
          },
        ],
      },
      {
        kind: 'say',
        text: 'That was the last lesson. You know the secrets now. Beep beep, proud robot noises.',
      },
      {
        kind: 'mission',
        text: 'Type /ideas in a project. Pick one idea. Then change it to fit your style.',
      },
    ],
  },
];

/** What the rule-based grader says about one typed prompt. */
export interface PromptGrade {
  good: boolean;
  /** Kind one-line tips, one per missed rule. Empty when the prompt is good. */
  tips: string[];
}

/** Doing words a strong prompt starts from. */
const ACTION_WORDS = [
  'make',
  'add',
  'change',
  'move',
  'fix',
  'turn',
  'give',
  'put',
  'paint',
  'color',
  'swap',
  'grow',
  'shrink',
  'show',
  'hide',
  'draw',
  'build',
  'remove',
  'delete',
  'rename',
  'set',
] as const;

/** Things and places a kid project usually has. */
const THING_WORDS = [
  'player',
  'title',
  'background',
  'score',
  'game',
  'ball',
  'sky',
  'enemy',
  'enemies',
  'button',
  'page',
  'music',
  'sound',
  'pet',
  'story',
  'level',
  'character',
  'star',
  'stars',
  'rock',
  'rocks',
  'cloud',
  'clouds',
  'text',
  'screen',
  'jump',
  'ship',
  'bat',
  'ghost',
  'boss',
  'wall',
  'floor',
  'platform',
  'colors',
  'dragon',
  'header',
  'board',
  'timer',
  'life',
  'lives',
  'coin',
  'coins',
  'monster',
  'hero',
  'world',
  'menu',
] as const;

/** Kid project file names also count as naming a place. */
const FILE_NAME_RE = /\b[\w-]+\.(?:js|html|css)\b/i;

/**
 * Simple personal-info patterns: names, addresses, phones, emails, schools.
 * Same intent as the safety prefilter, trimmed for practice text.
 */
const PII_RES: readonly RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i,
  /\+?\d(?:[\s().-]?\d){8,}/,
  /\bmy (?:real |full )?name is\b/i,
  /\bmy (?:home )?address is\b/i,
  /\bmy school is\b/i,
  /\b\d{1,5}\s+\w+\s+(?:street|avenue|road|lane|drive|st|ave|rd|ln|dr)\b/i,
];

const GRADER_TIPS = {
  action: 'Start with a doing word, like make, add, or change.',
  thing: 'Name the thing to change, like the player or the title.',
  length: 'Say a bit more. Tell what, where, and how.',
  pii: 'Keep real names, addresses, and numbers secret. Your project never needs them.',
} as const;

function hasWordFrom(text: string, words: readonly string[]): boolean {
  return words.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(text));
}

/**
 * Rule-based prompt check, no model call. A good prompt has a doing word,
 * names a thing or place, runs four or more words, and holds no personal info.
 */
export function gradePrompt(text: string): PromptGrade {
  const trimmed = text.trim();
  const tips: string[] = [];
  if (!hasWordFrom(trimmed, ACTION_WORDS)) {
    tips.push(GRADER_TIPS.action);
  }
  if (!hasWordFrom(trimmed, THING_WORDS) && !FILE_NAME_RE.test(trimmed)) {
    tips.push(GRADER_TIPS.thing);
  }
  const wordCount = trimmed.split(/\s+/).filter((word) => word.length > 0).length;
  if (wordCount < 4) {
    tips.push(GRADER_TIPS.length);
  }
  if (PII_RES.some((re) => re.test(trimmed))) {
    tips.push(GRADER_TIPS.pii);
  }
  return { good: tips.length === 0, tips };
}

/** The grader, packaged for lesson two's free-type finale. */
export const PROMPT_GRADER = { gradePrompt } as const;
