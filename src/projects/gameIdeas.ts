/**
 * Kid-facing Build-a-game idea bank.
 *
 * Exactly 31 entries: "Build my own idea" first, then 30 browser HTML games.
 * Every idea is local-preview only (HTML/CSS/JS), no image generation, no
 * native installs. Pure data for tests and the Build a game menu.
 */

export interface GameIdea {
  /** Stable id used in tests and project notes. */
  id: string;
  /** Short menu label shown to the kid. */
  label: string;
  /** One-line kid-readable description. */
  blurb: string;
  /**
   * Seed the first build prompt. Empty for own-idea (the kid or the help
   * flow supplies the brief).
   */
  seedPrompt: string;
}

/** True for the custom entry that asks the kid for their own concept. */
export function isOwnIdea(idea: GameIdea): boolean {
  return idea.id === 'own';
}

/**
 * Menu order is fixed. First entry is always Build my own idea.
 * The remaining 30 are distinct local-browser game concepts.
 */
export const GAME_IDEAS: readonly GameIdea[] = [
  {
    id: 'own',
    label: 'Build my own idea',
    blurb: 'You invent the game. Termi helps you build it.',
    seedPrompt: '',
  },
  {
    id: 'dodge-rain',
    label: 'Dodge the rain',
    blurb: 'Move left and right. Catch drops or dodge them.',
    seedPrompt:
      'Make a simple canvas game where I move left and right to dodge falling rain drops. Add a score and a restart key.',
  },
  {
    id: 'catch-stars',
    label: 'Catch the stars',
    blurb: 'Catch falling stars before they hit the ground.',
    seedPrompt:
      'Make a canvas catch game. Stars fall from the top. I move a basket to catch them. Show the score and lives.',
  },
  {
    id: 'memory-cards',
    label: 'Memory cards',
    blurb: 'Flip cards and match pairs.',
    seedPrompt:
      'Make a memory match card game with 12 cards (6 pairs) using emoji. Click to flip. Count moves. Show a win message.',
  },
  {
    id: 'click-targets',
    label: 'Click the targets',
    blurb: 'Click circles before they vanish.',
    seedPrompt:
      'Make a click target game. Circles appear for a short time. Click them for points. Add a 30 second timer and a final score.',
  },
  {
    id: 'maze-escape',
    label: 'Maze escape',
    blurb: 'Find the exit in a simple maze.',
    seedPrompt:
      'Make a keyboard maze game on a canvas grid. Arrow keys move a square. Reach the green exit. Keep walls solid.',
  },
  {
    id: 'snake-lite',
    label: 'Snake lite',
    blurb: 'Grow a snake by eating dots.',
    seedPrompt:
      'Make a simple snake game on a grid. Arrow keys move. Eat food to grow. Hitting a wall or yourself restarts.',
  },
  {
    id: 'pong-solo',
    label: 'Pong solo',
    blurb: 'Bounce a ball with one paddle.',
    seedPrompt:
      'Make a one player pong game. Move the paddle with the mouse or arrows. Ball bounces. Score points. Restart on miss.',
  },
  {
    id: 'whack-moles',
    label: 'Whack a mole',
    blurb: 'Tap moles as they pop up.',
    seedPrompt:
      'Make a whack a mole game with a 3 by 3 grid of holes. Moles pop up briefly. Click them for points. Add a timer.',
  },
  {
    id: 'color-match',
    label: 'Color match',
    blurb: 'Match the word color to the right button.',
    seedPrompt:
      'Make a color word game. Show a color name in a random ink color. Kid clicks the button that matches the WORD meaning. Score streaks.',
  },
  {
    id: 'typing-race',
    label: 'Typing race',
    blurb: 'Type the word before time runs out.',
    seedPrompt:
      'Make a typing race. Show a simple word. Kid types it and presses Enter. Track speed and accuracy for 10 words.',
  },
  {
    id: 'platform-jump',
    label: 'Platform jumper',
    blurb: 'Jump across platforms to the flag.',
    seedPrompt:
      'Make a side view platformer on canvas. Arrow keys move and jump. Reach a flag on the right. Simple gravity and platforms.',
  },
  {
    id: 'balloon-pop',
    label: 'Balloon pop',
    blurb: 'Pop balloons before they float away.',
    seedPrompt:
      'Make a balloon pop game. Balloons float up. Click to pop them. Missed balloons cost a life. Show score.',
  },
  {
    id: 'quiz-sprint',
    label: 'Quiz sprint',
    blurb: 'Answer fun multiple choice questions.',
    seedPrompt:
      'Make a 5 question multiple choice quiz about animals. Show score at the end. Use big clear buttons.',
  },
  {
    id: 'simon-says',
    label: 'Simon says lights',
    blurb: 'Repeat the light pattern.',
    seedPrompt:
      'Make a Simon style memory game with 4 colored buttons. Play a growing pattern. Kid repeats it. Score the longest streak.',
  },
  {
    id: 'rock-paper',
    label: 'Rock paper scissors',
    blurb: 'Play against the computer. Pick rock, paper, or scissors.',
    seedPrompt:
      'Make rock paper scissors with three big buttons. Computer picks at random. Track wins, losses, and ties.',
  },
  {
    id: 'number-guess',
    label: 'Number guess',
    blurb: 'Guess the secret number.',
    seedPrompt:
      'Make a number guess game from 1 to 50. Kid types a guess. Say higher or lower. Count tries until they win.',
  },
  {
    id: 'breakout-lite',
    label: 'Breakout lite',
    blurb: 'Bounce a ball to break bricks.',
    seedPrompt:
      'Make a simple breakout game. Paddle at the bottom, ball, and one row of bricks. Clear the bricks to win.',
  },
  {
    id: 'flappy-lite',
    label: 'Flappy lite',
    blurb: 'Tap to flap between gaps.',
    seedPrompt:
      'Make a flappy style game. Space or click flaps up. Gravity pulls down. Fly through gaps in pipes. Score each pipe.',
  },
  {
    id: 'tic-tac-toe',
    label: 'Tic tac toe',
    blurb: 'Play X and O on a 3 by 3 board.',
    seedPrompt:
      'Make tic tac toe for two players on one keyboard. Click cells. Detect win and draw. Add a new game button.',
  },
  {
    id: 'collect-coins',
    label: 'Collect coins',
    blurb: 'Run around and grab all the coins.',
    seedPrompt:
      'Make a top down collect game. Arrow keys move a player. Coins sit on a small map. Collect all coins to win.',
  },
  {
    id: 'avoid-cars',
    label: 'Avoid the cars',
    blurb: 'Cross the road safely.',
    seedPrompt:
      'Make a cross the road game. Player moves up. Cars move left and right. Reach the top without hitting a car.',
  },
  {
    id: 'reaction-test',
    label: 'Reaction test',
    blurb: 'Click when the screen turns green.',
    seedPrompt:
      'Make a reaction time test. Screen starts red, then turns green after a random wait. Click as fast as you can. Show ms time.',
  },
  {
    id: 'word-scramble',
    label: 'Word scramble',
    blurb: 'Unscramble the letters.',
    seedPrompt:
      'Make a word scramble game with 8 easy words. Show mixed letters. Kid types the word. Track score out of 8.',
  },
  {
    id: 'tower-stack',
    label: 'Tower stack',
    blurb: 'Stack blocks as high as you can.',
    seedPrompt:
      'Make a stack game. A block slides left and right. Click or press space to drop it. Stack as high as you can without missing.',
  },
  {
    id: 'balloon-math',
    label: 'Balloon math',
    blurb: 'Pop the balloon with the right answer.',
    seedPrompt:
      'Make a math balloon game. Show a simple add or subtract problem. Three balloons show answers. Click the correct one.',
  },
  {
    id: 'day-night',
    label: 'Day and night runner',
    blurb: 'Run while the world switches day and night.',
    seedPrompt:
      'Make a runner where the player auto runs right. Jump over rocks. Every 10 seconds switch day and night colors. Track distance.',
  },
  {
    id: 'fruit-slice',
    label: 'Fruit slice',
    blurb: 'Swipe or click fruit, avoid bombs.',
    seedPrompt:
      'Make a fruit slice style game. Fruit flies up. Click fruit for points. Clicking a bomb ends the round. Show score.',
  },
  {
    id: 'hide-seek',
    label: 'Hide and seek dots',
    blurb: 'Find the odd color in the crowd.',
    seedPrompt:
      'Make a find the odd one out game. Show many colored dots. One is a slightly different color. Click it. Levels get harder.',
  },
  {
    id: 'space-lander',
    label: 'Soft lander',
    blurb: 'Land the ship gently on the pad.',
    seedPrompt:
      'Make a lander game. Ship falls with gravity. Arrow keys thrust and steer. Land softly on a pad. Crash if too fast.',
  },
  {
    id: 'story-choice',
    label: 'Choice adventure',
    blurb: 'A short story with choices you click.',
    seedPrompt:
      'Make a short click adventure with 4 scenes. Each scene has text and 2 choice buttons. End with a happy finish screen.',
  },
] as const;

/** Exactly one own-idea entry plus 30 game ideas. */
export const GAME_IDEA_COUNT = GAME_IDEAS.length;

/** Menu options for selects: value is idea id. */
export function gameIdeaMenuOptions(): { value: string; label: string; hint: string }[] {
  return GAME_IDEAS.map((idea) => ({
    value: idea.id,
    label: idea.label,
    hint: idea.blurb,
  }));
}

export function gameIdeaById(id: string): GameIdea | undefined {
  return GAME_IDEAS.find((idea) => idea.id === id);
}
