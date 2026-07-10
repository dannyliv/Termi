<p align="center">
  <img src="https://raw.githubusercontent.com/dannyliv/Termi/main/assets/termi-hero.png" alt="Termi, a friendly robot popping out of a terminal window surrounded by pixel game elements" width="720">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/termi-kids"><img src="https://img.shields.io/npm/v/termi-kids" alt="npm version"></a>
  <a href="https://github.com/dannyliv/Termi/actions/workflows/ci.yml"><img src="https://github.com/dannyliv/Termi/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

# Termi

Termi is a friendly robot that helps you build things on a real computer.

You type what you want. Termi writes the code with you. Your game opens in the browser right away.

You can make dodge games, platform games, pixel art, dance music, virtual pets, adventure stories, quizzes, your own web page, and talking characters. If you change your mind, type `undo` and the last change is gone. When something works, you earn badges.

Termi is a computer program, an AI tool. It is not a person. A grown-up sets it up first.

Not sure what to say first? Type `/quest` inside any project. Termi walks you through a real build, step by step, with a ready idea at every step. Press Enter to use it, or type your own. Finish a quest and you earn the Quest Hero badge.

Want to get good at building with AI? Type `termi learn`. Six short lessons teach you how to be the boss of your AI helper. Each one earns a badge, and you can replay them any time.

Ready? Ask a grown-up to read the next part.

---

## For parents and guardians

Termi is a kids-friendly coding assistant that runs entirely in the terminal on your own computer. A kid describes what they want in plain words, an AI model you configure writes small web projects (plain HTML, CSS, and JavaScript), and a local preview shows the result instantly. Every message in and out passes a layered safety pipeline, and everything is stored locally. There are no Termi servers and no telemetry.

Please read [SAFETY.md](SAFETY.md) before handing the keyboard to your kid. It explains, honestly, how the safety system works, what it can and cannot stop, and how to remove everything.

### Requirements

- Node.js 20.19 or newer: https://nodejs.org
- macOS, Windows, or Linux
- An AI account you own (one of: a ChatGPT account, a Claude API key, an OpenAI API key, or a Grok API key)
- About 700 MB of free disk space for the on-device safety checker (recommended, on by default)

If Node is too old, Termi prints a plain message with the download link instead of starting.

### Install

One command:

```
npm install -g termi-kids
```

Then run `termi`. If npm reports a permission error, prefix the install with `sudo` on macOS and Linux, or run the terminal as administrator on Windows. To remove it later, run `npm rm -g termi-kids` (full cleanup steps are in SAFETY.md).

To hack on Termi instead, install from a clone:

```
git clone https://github.com/dannyliv/Termi.git
cd Termi
npm install
npm run build
npm link
```

### First run: the setup wizard

Run `termi`. The first run starts a setup wizard for a parent or guardian. It takes about five minutes:

1. **Create a grown-up PIN** (at least 4 characters). It guards the grown-up zone. Your kid should not know it.
2. **Age band and consent.** You pick "Under 13" or "13 or older" and confirm that Termi uses an AI account you own and that you agree to watch how your kid uses it. This consent is recorded in the local safety log.
3. **Pick an AI provider.** The default is "ChatGPT sign-in": your browser opens, you sign in to your own ChatGPT account, and no API key is needed. The other options are a Claude API key, an OpenAI API key, or a Grok API key. Grok requires an extra confirmation because the xAI API terms are adults-only (details in SAFETY.md). You can add several providers and choose which one is active.
4. **Pick a safety level.** Strict is the default and the right choice for most kids.
5. **Safety checker download.** Termi offers a small safety model (623 MB) that screens every message right on your computer, even with no internet. It is on by default and worth keeping. The download runs in the background: setup continues, your kid can start building right away, the home menu shows a progress bar, and the checker turns itself on the moment the verified file lands. An interrupted download resumes on the next start. Details are in [SAFETY.md](SAFETY.md).
6. **Hand the keyboard to your kid.** The kid picks a made-up nickname (Termi asks them not to use their real name) and sees a clear disclosure: "Termi is a computer program, an AI. It is a tool a grown-up set up for you. It is not a person."
7. **Desktop shortcut.** Termi offers to write a double-clickable launcher on the Desktop (`Termi.command` on macOS, `Termi.bat` on Windows, `Termi.desktop` on Linux) so your kid can come back tomorrow without typing commands.
8. **Optional first game.** Two keypresses later there is a running game in the browser.

If you skip the provider step, Termi runs in offline mode: your kid can still create projects, play them in the preview, undo changes, and browse ideas. The chat shows a kind "ask a grown-up to set up the AI helper" screen.

**If your kid does not know where to start:** every project type has a Build Quest (`/quest` in the chat), a five-step guided build with a ready prompt at each step, and a large idea deck (`/ideas`). Quest steps go through the same safety pipeline as any other message.

### Commands

| Command | What it does |
|---|---|
| `termi` | First run: setup wizard. After that: the home menu. |
| `termi new` | Start a new project. |
| `termi go [name]` | Open a project and build. With no name, pick from a list. |
| `termi preview [name]` | Open a project in the browser without the chat. |
| `termi ideas` | Print fun project ideas. |
| `termi learn` | Six short, replayable lessons on building with AI. Fully offline, no AI calls. |
| `termi grownups` | The grown-up zone. PIN required. |
| `termi help` | Show the command list. |
| `termi --version` | Show the version. |

Inside the build chat, these slash commands work:

| In chat | What it does |
|---|---|
| `/preview` | Open the project in the browser. |
| `/undo` | Take back the last change. |
| `/redo` | Bring a change back. |
| `/new` | Start a fresh project. |
| `/ideas` | Get fun ideas. |
| `/badges` | See earned badges. |
| `/learn` | Play the short AI lessons. |
| `/quest` | A step-by-step build guide with a ready prompt at each step. |
| `/help` | Show this list. |
| `/done` | Finish and celebrate. |
| `/quit` | Stop for today. Projects are saved. |
| `/grownups` | Grown-up zone, PIN required. |

Plain words work too: `undo`, `help`, `ideas`, `done`, `preview`, `badges`, `learn`, `quest`, and `quit` work on their own, no slash needed, and `exit`, `stop`, `bye`, and `leave` also quit. (`redo`, `new`, and `grownups` need the slash.) Misspelled commands get a "did you mean" suggestion.

In the grown-up zone you can add, switch, or remove providers, change the safety level, manage the on-device safety checker (turn it on or off, download or remove its model file), pick the model speed (Zippy, the fast default, or Extra smart for tricky asks), read the usage and quota note, review the safety log, and see exactly where your data lives. Removing a provider deletes its saved key or sign-in from this computer.

### The nine project types

| Project type | What your kid builds | Styles |
|---|---|---|
| 🎮 Games | A quick dodge game. A great first project. | Space Rocks, Neon Star Run, Spooky Bats, Soccer Headers |
| 🕹️ Big Games | A bigger platform game with two levels. The game engine ships as a local file, no internet needed. | Castle Quest, Blocky Mine World, Haunted House, Midnight Wolf Pack |
| 🎨 Pixel Studio | A pixel paint studio. Calm and creative. | Free Draw, Pet Portraits |
| 🎵 Dance Party | A music maker with sounds made right in the browser. | Robot Dance, Glow Disco |
| 🐾 My Pet | A virtual pet that remembers its care between visits. | Dragon, Wild Horses |
| 📖 Story Quest | A choose-your-own-adventure story engine. | Dragon Treasure, Mystery at School |
| ❓ Quiz Show | A quiz maker for friends and family. | Animal Trivia, Which Character Are You? |
| 🌐 My Page | A personal web page, saved only on this computer. | About Me, My Team |
| 🤖 Talking Character | A scripted talking character. The kid writes every line it can say. No AI runs inside the project. | Quiz Host, Sidekick Robot |

Projects live in `~/Termi/<project-name>/` as plain files (typically `index.html`, `style.css`, and one JavaScript file, plus a `TERMI.md` notes file). They are capped at 8 files of 256 KB each, use no build step, and work with zero network access. Once a kid has a project, `termi new` also offers "Remix one of your projects."

On the My Page projects, personal details like a name are typed directly on the page in the browser preview and saved to the browser's local storage on this computer. They never pass through the chat, so they never reach the AI provider.

### How the preview works

Each open project gets its own tiny web server bound to `127.0.0.1` only. It is not reachable from other devices on your network. It starts at port 4311 and scans upward if that port is busy. Every page is served with a strict Content-Security-Policy that blocks all outside network access from the project, and the page reloads automatically when Termi changes a file. Dotfiles and the `TERMI.md` notes are never served.

### More than one kid

Termi's v1 stance is simple: one operating system user account per kid. Settings, the PIN, projects, badges, and the safety log all live in the OS user profile, so separate OS accounts keep kids' worlds (and the audit trail) separate. There are no in-app profiles.

### Troubleshooting

- **"Termi needs a newer version of Node.js."** Install the current version from https://nodejs.org, then run `termi` again.
- **"The AI helper is not set up yet."** No provider is configured. Run `termi grownups`, open Providers, and add one. Projects, previews, undo, ideas, and badges all work without a provider.
- **"Termi used up its energy. It comes back at 4:30 PM."** Your AI plan or API key hit its rate limit. The time comes from the provider when it says how long to wait. Your kid can keep playing the preview, use `/undo`, and browse `/ideas` meanwhile.
- **"Termi needs a quick break. Try again in a minute."** A safety check could not finish (a timeout, a provider error, or a rate limit). Termi blocks rather than guesses, so it pauses the turn. Trying again usually works.
- **"The sign-in stopped working."** The saved ChatGPT sign-in can no longer refresh. Run `termi grownups`, open Providers, and sign in again.
- **"Termi found changed settings. Safe settings are on now."** The settings file failed its integrity check, so Termi reverted to strict defaults. Review the grown-up zone.
- **Crashes.** The kid sees a friendly screen; the technical details go to `~/.termi/error.log`.

### Uninstall

See "Your data and how to remove Termi" in [SAFETY.md](SAFETY.md) for the exact folders, files, and keychain entries.

## Disclaimer

Termi is free and open-source software, released under the MIT License and provided as-is, without warranty of any kind, express or implied. It is a personal, educational project. All use is at the user's own risk and sole responsibility: you, the parent or guardian who installs and configures Termi, are responsible for how it is set up, which AI accounts it connects to, and how children in your care use it. AI output is unpredictable; the safety layers reduce risk but cannot eliminate it, and children should use Termi with adult supervision. The authors and contributors accept no liability for any claim, damages, or other losses arising from the use of this software, as set out in the MIT License. Termi is an independent project and is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, xAI, the Qwen team, or any other AI provider.
