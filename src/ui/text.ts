/**
 * The single registry of all kid-facing copy.
 * Rules: US grade 4-5 reading level, every sentence under 15 words,
 * warm but never babyish, never echo blocked content.
 * Placeholders use {curlyBraces} and are filled by callers.
 */

import type { SafetyCategory } from '../types.js';

/** Block messages by safety category. Kind, no echo, always a way forward. */
const blockByCategory = {
  sexual: 'That topic is not for Termi. Want to build something fun instead?',
  self_harm: 'Thank you for telling me. Let us pause and find help.',
  violence: 'That is too rough for our games. Try a softer idea, like dodging or racing.',
  hate_harassment: 'Those words can hurt people. Pick kind words and we will keep building.',
  illicit: 'I cannot help with that. Pick a project idea and we will build it.',
  profanity: 'Whoa, strong words! Keep it friendly and say it another way?',
  pii: 'Keep private stuff secret, like your name or address. Try asking without it.',
  grooming: 'Our chat stays about building. Want to pick a project idea?',
  adult_advice: 'That is a question for a grown-up you trust. Now, want to build?',
  jailbreak: 'Nice try! Termi sticks to its rules. Back to building?',
} satisfies Record<SafetyCategory, string>;

export const T = {
  home: {
    firstHello: 'Hi! I am Termi, your robot build buddy.',
    welcomeBack: 'Welcome back, {name}!',
    recapIntro: 'Last time: {recap}',
    nextStep: 'Want to keep going? I saved your spot.',
    menuNew: 'Make something new',
    menuGo: 'Open a project',
    menuPreview: 'Watch a project run',
    menuIdeas: 'Get ideas',
    menuBadges: 'See your badges',
    menuGrownups: 'Grown-up zone',
    menuHelp: 'Help',
    menuQuit: 'All done for now',
    goodbye: 'See you next time. Happy building!',
  },

  wizard: {
    parentIntro: 'Hi! This setup is for a parent or guardian. It takes about five minutes.',
    pinCreate: 'Create a grown-up PIN. Your kid should not know it.',
    pinConfirm: 'Type the PIN again to make sure.',
    consentIntro: 'Termi uses an AI account you own. You agree to watch how your kid uses it.',
    providerPick: 'Pick the AI helper account Termi will use.',
    xaiAck: 'This provider is for adults only. A parent must own it and watch it.',
    safetyPick: 'Pick a safety level. Strict is best for most kids.',
    handToKid: 'All set! Now hand the keyboard to your kid.',
    kidHello: 'Hi! I am Termi. I help you build games and more.',
    nicknamePrompt: 'Pick a fun made-up name. Not your real name!',
    aiDisclosure: 'Termi is a computer program, an AI. It is a tool a grown-up set up for you. It is not a person.',
    firstGameOffer: 'Want to make your first game right now?',
    launcherMade: 'I made a Termi shortcut so you can come back fast.',
    nodeTooOld: 'Termi needs a newer Node. Ask a grown-up to install it from nodejs.org.',
  },

  chat: {
    placeholder: 'Tell me what to build or change.',
    thinking: 'Thinking...',
    working: 'Building...',
    doneHint: 'Type /done when your project feels finished.',
    undoDone: 'Undone! Your last change is gone.',
    redoDone: 'Redone! The change is back.',
    nothingToUndo: 'There is nothing to undo yet.',
    nothingToRedo: 'There is nothing to redo.',
    didYouMean: 'Hmm, I do not know that one. Did you mean {command}?',
    unknownCommand: 'I do not know that command. Type /help to see them all.',
    previewOpened: 'Preview is open! Look at your browser.',
    piiReminder: 'Quick tip: keep your real name and address secret online. I hid that part for you.',
  },

  blocks: {
    byCategory: blockByCategory,
    generic: 'I cannot help with that one. Try saying it a new way?',
    rephraseTip: 'Want to try other words? I am ready.',
  },

  selfHarmSupport: {
    message:
      'Thank you for telling me. Your feelings matter. ' +
      'I am a computer program, so I cannot help with this part. ' +
      'Please talk to a trusted adult, like a parent or a teacher. ' +
      'They want to help you. ' +
      'In the US, you can call or text 988 any time. ' +
      'Someone kind will listen. You are not alone.',
  },

  errors: {
    oops: 'Oops! Termi hit a bump.',
    crash: 'Something went wrong inside Termi. It is not your fault.',
    crashSaved: 'I saved the details for a grown-up here:',
    crashRestart: 'Start Termi again and we will keep building.',
    failClosed: 'Termi needs a quick break. Try again in a minute.',
    auth: 'The sign-in stopped working. Ask a grown-up to fix it in the grown-up zone.',
    server: 'The AI helper is having a rough day. We can try again soon.',
    network: 'I cannot reach the internet. Check the wifi, then try again.',
    goodbye: 'Bye for now! Your projects are saved.',
  },

  offline: {
    noProvider: 'The AI helper is not set up yet. Ask a grown-up to set it up.',
    stillWorks: 'You can still make projects, play them, and get ideas.',
    network: 'No internet right now. Your projects still work!',
    retry: 'Check the connection, then try again.',
  },

  quota: {
    message: 'Termi used up its energy. It comes back at {time}.',
    messageNoTime: 'Termi used up its energy. It comes back soon.',
    stillWorksIntro: 'While we wait, you can still:',
    stillWorks: [
      'Play your game in the preview',
      'Undo a change with /undo',
      'Get ideas with /ideas',
      'See your badges with /badges',
    ],
  },

  grownups: {
    pinPrompt: 'Grown-up check. Please type the PIN.',
    wrongPin: 'That PIN is not right. Try again.',
    lockout: 'Too many tries. The lock opens in {minutes} minutes.',
    needsGrownup: 'This part needs a grown-up. Please go get one.',
    needsAttention: 'Termi needs a grown-up to check something.',
    kidStop: 'This screen is for grown-ups. Ask one to help you here.',
  },

  hints: [
    'Type /preview to watch your project run.',
    'Type /undo to take back the last change.',
    'Type /ideas if you feel stuck.',
    'Type /badges to see what you earned.',
    'Type /help to see every command.',
    'Type /new to start something fresh.',
    'Type /done when you finish your project.',
  ],

  celebrations: {
    generic: 'Look at you go!',
    firstProject: 'Your first project is alive!',
    firstChange: 'You changed real code. That is big!',
    gameShipped: 'You shipped a game! Builders say that when it is done.',
    bugSquasher: 'Bug fixed! You are a true bug squasher.',
    remixer: 'You remixed a project. Now it is something new!',
    fiveProjects: 'Five projects! You are on a roll.',
    badgeEarned: 'New badge: {badge}!',
  },
} as const;

export type KidText = typeof T;
