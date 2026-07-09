/**
 * Build Quests: step-by-step guided builds, one per project type.
 * A quest is a short trail of steps. Each step tells the kid what we are
 * doing and hands them a ready prompt, so "I do not know what to say"
 * never blocks a first build. Quests cost nothing extra: the prompts go
 * through the normal chat turn, safety pipeline and all.
 */

export interface QuestStep {
  /** What we are doing and why, in kid words. */
  say: string;
  /** A ready chat prompt the kid can send as-is. */
  prompt: string;
}

export interface QuestDef {
  id: string;
  scaffoldId: string;
  title: string;
  emoji: string;
  steps: QuestStep[];
}

export const QUESTS: readonly QuestDef[] = [
  {
    id: 'quest-games',
    scaffoldId: 'games',
    title: 'Make your dodge game yours',
    emoji: '\u{1F3AE}',
    steps: [
      {
        say: 'First, let us make the game feel right. We start with speed.',
        prompt: 'Make the player move a little faster.',
      },
      {
        say: 'Great! Now give yourself room to make mistakes.',
        prompt: 'Give the player three lives and show them on screen.',
      },
      {
        say: 'Time for treasure. A bonus makes dodging worth it.',
        prompt: 'Add a bonus star that gives 10 points when you grab it.',
      },
      {
        say: 'Let us make it exciting. The game should grow with you.',
        prompt: 'Make the game speed up a little every 20 points.',
      },
      {
        say: 'Last step: brag rights. A high score keeps you coming back.',
        prompt: 'Add a high score that saves on this computer.',
      },
    ],
  },
  {
    id: 'quest-biggames',
    scaffoldId: 'biggames',
    title: 'Level up your platform game',
    emoji: '\u{1F579}',
    steps: [
      {
        say: 'Let us tune the jump first. Jumping is the whole game.',
        prompt: 'Make the player jump a little higher.',
      },
      {
        say: 'Now add more shiny things to hunt for.',
        prompt: 'Add three more things to collect in level one.',
      },
      {
        say: 'A moving platform makes players plan their jumps.',
        prompt: 'Add a platform that moves up and down.',
      },
      {
        say: 'Every good game hides a secret. Let us hide one.',
        prompt: 'Add a secret room with a big bonus inside.',
      },
      {
        say: 'Finish strong: a timer turns your level into a race.',
        prompt: 'Add a timer that shows how fast you finish the level.',
      },
    ],
  },
  {
    id: 'quest-art',
    scaffoldId: 'art',
    title: 'Build a super paint studio',
    emoji: '\u{1F3A8}',
    steps: [
      {
        say: 'Every artist needs colors. Let us add your favorite.',
        prompt: 'Add a bright new color to the paint set.',
      },
      {
        say: 'Mistakes happen. An eraser makes them no big deal.',
        prompt: 'Add an eraser so I can fix mistakes.',
      },
      {
        say: 'Now the fun one: a brush that changes color as you draw.',
        prompt: 'Add a rainbow brush that changes color as you draw.',
      },
      {
        say: 'Stamps make art fast and silly. Pick fun shapes.',
        prompt: 'Add a stamp tool with a star, a heart, and a smiley.',
      },
      {
        say: 'Last step: keep your art. Let us add saving.',
        prompt: 'Let me save my picture to the computer.',
      },
    ],
  },
  {
    id: 'quest-music',
    scaffoldId: 'music',
    title: 'Drop your first beat',
    emoji: '\u{1F3B5}',
    steps: [
      {
        say: 'Every song starts with a beat. Let us add a drum.',
        prompt: 'Add one new drum sound.',
      },
      {
        say: 'Now make it move. A little faster feels more alive.',
        prompt: 'Make the beat a little faster.',
      },
      {
        say: 'Lights make it a show, not just a song.',
        prompt: 'Make the lights flash with the beat.',
      },
      {
        say: 'Give yourself a speed control, like a real DJ.',
        prompt: 'Add a slider that changes the speed.',
      },
      {
        say: 'Big finish: a song that builds up and then drops.',
        prompt: 'Make a song that builds up and then drops.',
      },
    ],
  },
  {
    id: 'quest-pets',
    scaffoldId: 'pets',
    title: 'Raise a happy pet',
    emoji: '\u{1F43E}',
    steps: [
      {
        say: 'Pets love snacks. Let us add a new one.',
        prompt: 'Give my pet a new snack to eat.',
      },
      {
        say: 'Now let us see its feelings. Hearts work great.',
        prompt: 'Add a happiness meter with hearts.',
      },
      {
        say: 'Pets need play time. A tiny game inside is perfect.',
        prompt: 'Add a play button with a tiny game inside.',
      },
      {
        say: 'Style time! Every pet looks better in a hat.',
        prompt: 'Add a closet with hats for my pet.',
      },
      {
        say: 'Last step: teach it a trick. Treats help.',
        prompt: 'Let my pet learn a trick after ten treats.',
      },
    ],
  },
  {
    id: 'quest-stories',
    scaffoldId: 'stories',
    title: 'Write a story with a twist',
    emoji: '\u{1F4D6}',
    steps: [
      {
        say: 'Choices make stories fun. Let us add one more.',
        prompt: 'Add one more choice to the first scene.',
      },
      {
        say: 'Give a character a line people will remember.',
        prompt: 'Give a character a funny catchphrase.',
      },
      {
        say: 'Now the twist. Every good story has one.',
        prompt: 'Add a new scene with a surprise twist.',
      },
      {
        say: 'Add an item readers can grab now and use later.',
        prompt: 'Add an item you can pick up and use later.',
      },
      {
        say: 'End big: a happy ending worth finding.',
        prompt: 'Make a new ending where everyone celebrates.',
      },
    ],
  },
  {
    id: 'quest-quizzes',
    scaffoldId: 'quizzes',
    title: 'Host your own quiz show',
    emoji: '❓',
    steps: [
      {
        say: 'Every quiz needs questions. Add one you love.',
        prompt: 'Add one new question to the quiz.',
      },
      {
        say: 'Silly wrong answers make everyone laugh.',
        prompt: 'Add a silly wrong answer to a question.',
      },
      {
        say: 'Reward the champs with a happy message.',
        prompt: 'Show a happy message for a perfect score.',
      },
      {
        say: 'A timer turns questions into a game show.',
        prompt: 'Add a timer for each question.',
      },
      {
        say: 'Grand finale: one big question worth double.',
        prompt: 'Add a final boss question worth double points.',
      },
    ],
  },
  {
    id: 'quest-websites',
    scaffoldId: 'websites',
    title: 'Make your page pop',
    emoji: '\u{1F310}',
    steps: [
      {
        say: 'Your page, your colors. Let us start there.',
        prompt: 'Change the page colors to my favorites.',
      },
      {
        say: 'A big welcome banner says this page is yours.',
        prompt: 'Add a big welcome banner at the top.',
      },
      {
        say: 'Little moves make pages feel alive.',
        prompt: 'Make the buttons wiggle when you point at them.',
      },
      {
        say: 'Day and night mode is a classic. Add the switch.',
        prompt: 'Add a day and night switch.',
      },
      {
        say: 'Sneaky finish: hide a tiny game on the page.',
        prompt: 'Hide a tiny game somewhere on the page.',
      },
    ],
  },
  {
    id: 'quest-characters',
    scaffoldId: 'characters',
    title: 'Bring your character to life',
    emoji: '\u{1F916}',
    steps: [
      {
        say: 'First words matter. Give your character a fresh hello.',
        prompt: 'Give your character a new greeting.',
      },
      {
        say: 'A good joke makes a character a friend.',
        prompt: 'Add a joke your character can tell.',
      },
      {
        say: 'Let players ask something new.',
        prompt: 'Add a new question players can ask.',
      },
      {
        say: 'Moods make characters feel real. Add two.',
        prompt: 'Give your character a happy mood and a grumpy mood.',
      },
      {
        say: 'Last step: a sidekick who butts in sometimes.',
        prompt: 'Add a second character who butts in sometimes.',
      },
    ],
  },
];

/** Quests that fit the given project type. */
export function questsFor(scaffoldId: string): QuestDef[] {
  return QUESTS.filter((quest) => quest.scaffoldId === scaffoldId);
}

/** Looks up one quest by id. */
export function questById(id: string): QuestDef | undefined {
  return QUESTS.find((quest) => quest.id === id);
}

/** The kid-facing header line for one step of a quest. */
export function questStepLine(quest: QuestDef, stepIndex: number): string {
  const step = quest.steps[stepIndex];
  if (step === undefined) {
    return '';
  }
  return `${quest.emoji} Step ${stepIndex + 1} of ${quest.steps.length}: ${step.say}`;
}
