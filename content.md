# Termi: Builder Guide

This file is the onboarding document for any developer or AI agent picking up this
repository. It explains what Termi is, the rules every change must follow, how the
code is organized, and how to build, test, and extend it. README.md is written for
parents and kids; SAFETY.md is the honest safety architecture document for parents;
this file is for builders.

## What Termi is

Termi is a kid-friendly agentic coding CLI for children around age 10 and up. The
primary kid path is simple: **Build a game** (31 ideas: own idea + 30 HTML
browser games) and **Learn AI** (prompting lessons). A kid picks an idea, writes
or co-writes a prompt, an AI helper writes HTML/CSS/JS, and a local browser
preview updates after each turn. No age-band split: one safety bar for everyone.
The product goals, in priority order:

1. **Safety first.** A layered, fail-closed safety pipeline checks what kids type,
   what the model says, and every file before it reaches disk. Parents control
   settings behind a PIN, and the settings file is tamper-evident. Setup always
   starts the on-device safety classifier download.
2. **Fast first win.** Build a game creates a blank local shell and opens the
   browser preview; the first prompt fills it in. No stock playable games ship
   as the product.
3. **Kid-readable everything.** Every string a kid sees is short, warm, and tested
   for reading level (target Flesch-Kincaid grade 4 to 5; tests enforce a hard
   ceiling of grade 6.5 and sentences under 15 words).
4. **Cheap to run.** Hard token budgets on prompts, history, replies, and
   classifier calls, all enforced by unit tests.
5. **Multi-model.** ChatGPT sign-in (OAuth, works on a free plan) is the default;
   Anthropic, OpenAI, and xAI (Grok) API keys are also supported. Grok is a
   full first-class provider: wizard entry with an enforced adults-only
   parent acknowledgment, model speed picker (grok-4.3 zippy, grok-4.5
   smart), classifier fallback, and error mapping. Live-verified against
   the real xAI API on 2026-07-09: both model ids answer, and the safety
   classifier ran correctly on grok-4.3 (benign allowed, grooming and
   violence blocked with the right categories).

## Hard rules (read before changing anything)

0. **Keep this file current.** Whenever you change Termi code, behavior, docs,
   CLI surface, safety layers, providers, or release version: **read
   `content.md` first**, then **update it in the same change** (repo map,
   turn flow, known gaps, definition of done, and any rule that the change
   affects). Do not leave this file stale. This is mandatory, not optional.
1. **Safety is fail-closed.** Any classifier error, timeout (8s), or missing
   verdict blocks the action. Never change a failure path to fail-open. Never
   weaken the safety pipeline, taxonomy, or tamper protections without explicit
   approval from the repo owner.
2. **Clean room.** Do not mention any other AI coding product or CLI by name
   anywhere in this repo: code, comments, docs, tests, commit messages. The OAuth
   client id and the backend URL and header constants in `src/auth/oauth.ts` and
   `src/providers/index.ts` are wire-protocol values; keep them exactly as they
   are and do not copy those strings anywhere else.
3. **No em or en dashes.** All Unicode dash variants are banned, including the
   minus sign U+2212 (see DASH_RE in `tests/ui-fk.ts`); the ASCII hyphen is
   fine. Use commas, colons, periods, or parentheses, including inside string
   literals.
4. **Kid language is tested, per module.** Write new kid-facing copy at grade 4
   to 5; the tests fail anything above Flesch-Kincaid grade 6.5. The dash and
   reading-level checks are per-module tests, not a global sweep: when you add
   kid-facing strings to a module, its test file must import `DASH_RE` and
   `fkGrade` from `tests/ui-fk.ts` and assert against every new string (see
   `tests/ui-text.test.ts` for the pattern).
5. **No telemetry.** Termi does not send analytics, crash reports, or usage
   beacons. Allowed network calls: the selected model provider, the on-device
   safety model download (anonymous HTTPS to the pinned artifact URL), and the
   optional npm version check for `termi update` / session update prompt
   (`registry.npmjs.org/termi-kids/latest` only, fail-open, 6h disk cache,
   skippable with `TERMI_SKIP_UPDATE=1`). Do not add any other outbound call.
6. **Tests never touch the real machine.** Every test that reads or writes state
   must set `TERMI_HOME` and `TERMI_PROJECTS_DIR` to temp directories and
   `TERMI_KEYRING=file` so the real home folder, real projects folder, and OS
   keychain are never touched. The existing test files show the pattern.
7. **Secrets never print.** No token, API key, or PIN value may appear in logs,
   errors, test output, or commit content.
8. **Cross-platform.** macOS, Windows, and Linux are all supported. CI runs the
   suite on all three on Node 20 and 22. Use `node:path` joins, no shell-isms,
   no platform-only APIs without a fallback.
9. **Public product, careful publish.** The GitHub repo and the npm package
   `termi-kids` are public. The npm `files` allowlist in package.json is what
   ships. Never commit secrets, live tokens, or parent/kid data. Bump
   `package.json` version when shipping behavior parents or kids will notice.

## Repo map

```
bin/termi.js               Entry shim, requires Node >= 20.19, answers
                           --version by itself, then loads dist/cli.js
scripts/copy-assets.mjs    Copies non-TS assets (vendored engine, licenses) into dist/
src/
  types.ts                 Frozen shared contracts: Settings, ProviderClient,
                           SafetyPipeline, ClassifierVerdict, PreviewHandle,
                           SnapshotStore, ScaffoldDef, ThemeConfig, AuditEvent.
                           Treat as the spec; change with care.
  cli.ts                   Argv routing: termi | new (=build game) | go |
                           preview | learn | grownups | update | help |
                           --version. Session start may offer npm update y/n.
  update/
    version.ts             Local package version + simple semver compare.
                           NPM_PACKAGE is termi-kids (bin remains termi).
    check.ts               fetchLatestVersion from registry.npmjs.org (2.5s
                           timeout, 6h cache at TERMI_HOME/version-check.json).
                           checkForUpdate is fail-open.
    install.ts             spawn npm install -g termi-kids@latest.
    prompt.ts              maybePromptForUpdate (session start) and
                           runUpdateCommand (termi update). TERMI_SKIP_UPDATE=1
                           disables the session prompt.
  config/
    paths.ts               All state paths. TERMI_HOME (default ~/.termi) and
                           TERMI_PROJECTS_DIR (default ~/Termi) env overrides.
                           atomicWriteFileSync used for every state write.
    settings.ts            settings.json wrapped in an HMAC-SHA256 envelope.
                           Bad or missing signature fails closed to the
                           strictest settings.
    pin.ts                 Parent PIN: scrypt hash, 5 failures = 5 minute lockout.
  auth/
    keychain.ts            OS keychain via @napi-rs/keyring, file fallback at
                           TERMI_HOME/secrets.json (TERMI_KEYRING=file forces it).
                           Holds API keys, HMAC key, and the setup marker that
                           survives deletion of ~/.termi.
    oauth.ts               ChatGPT sign-in: PKCE S256, localhost:1455 callback,
                           public client id constant.
    tokens.ts              Token store in auth.json (a file, not the keychain,
                           because of platform keychain blob size caps; see the
                           file header). Proactive refresh at 80% of lifetime,
                           single-flight via lockfile, rotating refresh tokens
                           persisted before first use.
  providers/
    index.ts               createProviderClient for the four ProviderId values:
                           openai-chatgpt, openai-api, anthropic, xai (see
                           types.ts). The ChatGPT backend requires a
                           custom fetch (makeChatgptFetch) that promotes the
                           system message to a top-level instructions field,
                           strips rejected params, and defaults store:false.
                           makeSafetyIdFetch injects a hashed safety identifier
                           into openai-api request bodies (install id resolved
                           once per client, not per request). The xai client
                           refuses to build unless settings.xaiParentAck is
                           true (deps.xaiParentAck overrides in tests).
                           pickClassifierBackend chooses the moderation and
                           classifier backends; when the moderation key exists
                           but the openai-api client fails to build, the
                           prompted kid-check falls through anthropic ->
                           chatgpt -> xai so grooming/pii/jailbreak coverage
                           never silently drops.
    models.ts              Model alias map (kid-friendly names to provider model
                           ids) and classifier model choices. xai: grok-4.3
                           (zippy, classifier) and grok-4.5 (smart).
    errors.ts              classifyProviderError: maps SDK/HTTP errors (including
                           wrapped RetryError) to kid-safe error screens.
  safety/                  The safety engine. Layers, in order:
    prefilter.ts           L0, local (offline, no model). Order on input:
                           self-harm hard-block (supportive screen +
                           selfHarmConcern), jailbreak (incl. base64-decoded
                           payloads and drop-all-rules paraphrases), grooming
                           hard-blocks (secrecy from parents, platform moves,
                           special-friend/love probes; game talk like "don't
                           tell the boss" stays allowed), personal-detail
                           probes (block: school/address/selfie asks),
                           profanity wordlist (game words carved out; leet +
                           separator tolerant), then PII share redaction to
                           [secret] (never blocks on share alone).
                           prefilterContext only neutralizes jailbreak in file
                           text. nameIsOkay screens kid-chosen names
                           (projects, nicknames) before they enter the system
                           prompt or menus. Red-team offline corpus lived in
                           Termi/notes/redteam-offline*.md (not committed).
    classifier.ts          L2/L4, model-based: input classifier runs concurrently
                           with the main call and gates tool side effects;
                           output classifier checks the reply and every file
                           write. 8s timeout (20s for the on-device guard), any
                           error = block (fail closed). Long text is judged
                           chunk by chunk (JUDGE_TEXT_CAP per call), braces in
                           judged text are swapped to parentheses so an echo
                           cannot forge a verdict, the verdict budget is
                           CLASSIFIER_MAX_OUTPUT_TOKENS (roomy, for reasoning
                           models), and identical file text reuses a
                           session-scoped allow cache (blocks are never
                           cached). checkOutputText takes a source tag:
                           'reply' feeds grooming counters, 'file' never does.
                           When the on-device guard is available it judges
                           every chunk (input and output) across its full
                           taxonomy as an ADDITIONAL backend. Only the
                           moderation key narrows the prompted check to
                           kidcheck scope; the guard never does (it has no
                           hate_harassment/profanity category, so narrowing
                           on it would drop coverage).
    localguard.ts          Pure contract for the on-device classifier
                           (Qwen3Guard-Gen-0.6B): exact prompt wrapper
                           reproduced from the model's chat template as
                           fixed/judged segments, anchored completion parsing
                           (the FIRST non-empty line must be the Safety line
                           or it throws and fails closed; Categories/Refusal
                           read only from the next two lines), sanitizeJudged
                           defangs template markers, chat-glyph pairs, and
                           verdict-shaped line prefixes, and the
                           guard-to-Termi category map. Severity: Unsafe 2
                           (always blocks), Controversial 1 (blocks
                           pii/jailbreak), Safe 0.
    guardrunner.ts         llama.cpp runtime (node-llama-cpp): lazy singleton
                           load (pinned sha256 re-verified on disk before
                           loadModel, so a same-size swap never runs), one
                           context sequence, calls serialized, wrapper
                           segments tokenized with special tokens and judged
                           segments as plain text (token-level injection
                           impossible), per-call abort timeout plus a 2x
                           deadline backstop for native calls that ignore
                           the signal (a hung call must not freeze the
                           queue), bounded load deadline.
    modelstore.ts          Pinned GGUF artifact (repo URL, size, sha256).
                           Download streams to a stable .partial file with
                           HTTP range resume (full-file digest still enforced:
                           resumed bytes re-hash from disk), verifies size and
                           digest, atomic-renames into ~/.termi/models.
                           Interrupted transfers keep the partial; poisoned
                           ones (digest/oversize) delete it. guardModelReady
                           gates the runner; settings key localClassifier
                           (default true) gates the feature.
    guarddownload.ts       Single-flight background fetch manager. Kicked off
                           by the wizard guard step, cli boot, and chat start
                           when the model is enabled but absent; never blocks.
                           Observable state renders as a progress bar in the
                           home menu and the grown-ups panel (which joins the
                           in-flight fetch instead of double-downloading).
                           The wizard tells the parent basic safety is already
                           on and asks start-now-or-wait; waiting shows the
                           live bar with escape prompts (60s, then every 10
                           min). consumeGuardReadyNotice() is a process-wide
                           one-shot: chat (next turn) and home (next render)
                           both consume it, so "Your safety helper is on."
                           prints exactly once. The pipeline hot-attaches via
                           lazyGuardAccessor on the first check after the
                           file lands. Download is anonymous (plain HTTPS,
                           range header only, pinned sha256).
    taxonomy.ts            Category and severity definitions shared by all
                           layers. parseVerdict takes the LAST parseable JSON
                           object (anti-forgery); the classifier prompt marks
                           judged text as data.
    codescan.ts            Static scan of generated code (network egress, eval,
                           storage abuse). Defense in depth; the preview CSP is
                           the sound egress control.
    textextract.ts         extractVisibleText: pulls human-visible text out of
                           HTML/JS/CSS so file writes can be classified before
                           they reach disk.
    session.ts             Cross-turn counters (grooming pattern tracking).
                           Counters bump only from the conversation (kid
                           input and Termi replies), never from file text.
                           Blocked turns are recorded into the window too.
    blocks.ts              Kid-facing block screens per category, including the
                           calm supportive screen for self-harm topics.
    audit.ts               Hash-chained JSONL audit log (HMAC forward chain),
                           5MB rotation, written for every block and parent
                           action. Parents view it from the grown-ups panel.
                           The HMAC key and the chain tip are cached between
                           appends (self-invalidating on home or file change)
                           so appends stop being O(file size) + keychain hit.
  agent/
    loop.ts                runTurn: one chat turn. Streams the model reply,
                           runs the input classifier concurrently, gates tools
                           on the verdict, classifies output and file writes,
                           snapshots before changes.
    tools.ts               The model-facing tools (read/write/list files, etc.),
                           all jailed to the active project directory. Writes
                           also screen the file name for profanity and refuse
                           files whose visible text overflows the extraction
                           cap (too-wordy) instead of half-checking them.
    context.ts             Token budgets: HISTORY_TURN_CAP 30, HISTORY_CHAR_BUDGET
                           6000, changed-files-only embedding keyed by sha256.
    prompts/system.ts      System prompt, SYSTEM_PROMPT_CHAR_CAP 3500 (unit
                           tested), spotlighting tags around untrusted text,
                           game-content carve-out, 80-word reply instruction.
  projects/
    gameIdeas.ts           31 Build-a-game ideas: "Build my own idea" first,
                           then 30 local HTML game seeds (no image gen).
    blankGame.ts           createBlankGameProject: empty canvas shell, no
                           stock playable game. Saved under TERMI_PROJECTS_DIR.
    create.ts              Legacy scaffold create (still used by remix path).
    store.ts               Project metadata (.termi.json), TERMI.md project
                           memory (recap), listing and lookup.
    snapshots.ts           Content-addressed undo/redo snapshots under
                           TERMI_HOME/snapshots/<slug>/. Kid files only.
    ideas.ts               Prompt-idea decks (still used inside open chat).
    quests.ts              Build Quests registry (open-chat /quest path).
    scaffolds/             Scaffold modules remain for library/remix and
                           tests; primary kid path uses blankGame, not stock
                           playable templates.
  preview/server.ts        Hand-rolled node:http server, 127.0.0.1 only, base
                           port 4311 with a 50-port scan. Strict CSP
                           (default-src 'self') is the egress control. SSE live
                           reload via an injected external script. Path
                           traversal jail. Never serves TERMI.md or dotfiles.
  surfaces/
    home.ts                Kid home: Build a game, My games, Learn AI,
                           continue, grown-ups. homeMenuOptions() is pure.
    buildGame.ts           Build loop UI: idea pick, help/write prompt,
                           runTurn, preview refresh, done/improve, polish.
    buildLoop.ts           Pure prompt helpers (suggest, polish, summary).
    chat.ts                Open-project chat for library continues: slash
                           /preview /undo /redo /ideas /badges /learn /quest
                           /help /done /quit /grownups. Typewriter 1.5s cap.
                           total. xai availability requires the parent ack.
                           Quest mode: /quest starts the scaffold's guided
                           build; each step prints its header and ready
                           prompt, plain Enter sends the suggested prompt,
                           steps advance only on an ok turn, finishing awards
                           the quest-hero badge, /quest again pauses.
    commands.ts            Slash command parsing and help table. quit works as
                           a bare word, and exit/stop/bye/leave map to it so a
                           goodbye never becomes a paid AI turn.
  learn/
    lessons.ts             Six scripted, token-free lessons teaching kids how to
                           work with an AI coding helper, plus PROMPT_GRADER
                           (rule-based, no model call).
    runner.ts              Lesson menu and playback; progress in
                           TERMI_HOME/learn.json; badges learn-1 to learn-6.
  setup/
    wizard.ts              First-run wizard: parent gate, PIN, provider choice,
                           safety settings. Writes the keychain setup marker.
                           configureProvider loops back to the picker after a
                           failed sign-in or a declined xai ack (only Skip
                           exits with null). Keys are validated BEFORE being
                           saved; a clear 401/403 is never stored or marked
                           configured. The xai ack is skipped when already
                           confirmed. Kid names are screened with nameIsOkay.
                           Exports KEY_ACCOUNT (provider -> keychain account).
    launcher.ts            Writes a double-clickable Desktop launcher per
                           platform (Termi.command, Termi.bat, Termi.desktop),
                           best effort and silent on failure. Boot routing
                           (first-run wizard vs tamper warning) is decideBoot
                           in src/cli.ts; the Node version check is in
                           bin/termi.js.
  grownups/panel.ts        PIN-gated parent panel: provider keys (add, switch,
                           and remove; removal deletes the credential and
                           reassigns the active provider via the pure helper
                           removeProviderFromSettings), the on-device safety
                           checker (toggle, download with live bar, remove =
                           also off), model speed, usage note, audit
                           log viewer, usage and cost notes.
  ui/                      theme.ts (colors and ThemeConfig), mascot.ts (robot
                           mascot with ASCII fallback), banner.ts, celebrate.ts,
                           text.ts (wrapping, kid copy helpers), errors.ts
                           (kid-safe error screens).
tests/                     Vitest files plus shared helpers (agent-fakes.ts,
                           safety-corpus.ts, ui-fk.ts). 1115+ tests as of
                           0.2.0. Naming: <area>-<module>.test.ts. Build-game
                           coverage: projects-game-ideas, projects-blank-game,
                           surfaces-build-loop, setup-no-age-band.
.github/workflows/ci.yml   Matrix: ubuntu, macos, windows x Node 20, 22.
```

## How a chat turn works

1. Kid types into `surfaces/chat.ts`, which calls `agent/loop.ts` `runTurn`.
2. The prefilter normalizes and screens the raw input locally. Hard hits block
   immediately with a kid-friendly screen and an audit entry.
3. The main model call and the input classifier start concurrently. The reply
   streams internally but nothing is shown to the kid yet: tool side effects
   (file writes) and the reply reveal both wait for an ALLOWED input verdict,
   and a blocked verdict aborts the stream.
4. A snapshot is taken once at the start of the turn, before anything can write
   (so /undo always covers the whole turn). Each file write then passes the
   file name screen, the static code scanner, the too-wordy overflow check,
   and finally has its visible text extracted and classified in full (chunked
   when long, cached when unchanged). Only then does it reach disk.
5. The final reply text is classified before the turn completes. Any BLOCKED
   verdict at any layer replaces output with a block screen and logs to the
   audit chain. Blocked turns still enter the session window so the grooming
   watch keeps seeing them.
6. The preview server picks up changed files and pushes an SSE reload.

All providers are called through the AI SDK (`ai` package, streamText
everywhere, stepCountIs(10) stop condition). The ChatGPT OAuth backend only
supports streaming, which is why even classifiers stream.

## State on disk

| Path | What |
|------|------|
| `TERMI_HOME/settings.json` | HMAC-signed settings envelope |
| `TERMI_HOME/auth.json` | OAuth tokens (file on purpose, see auth/tokens.ts) |
| `TERMI_HOME/secrets.json` | File keyring fallback (0600) |
| `TERMI_HOME/audit.log` | Hash-chained safety audit JSONL |
| `TERMI_HOME/error.log` | Developer-facing error detail kids never see |
| `TERMI_HOME/snapshots/<slug>/` | Undo/redo content store |
| `TERMI_HOME/learn.json` | Learn mode progress |
| `TERMI_HOME/locks/` | Token refresh lockfiles |
| `TERMI_PROJECTS_DIR/<slug>/` | A kid project: kid files, TERMI.md, .termi.json |

Defaults: `TERMI_HOME` = `~/.termi`, `TERMI_PROJECTS_DIR` = `~/Termi`. API keys,
the settings HMAC key, and the setup marker live in the OS keychain (or the file
fallback).

## Build, test, run

```bash
npm install
npm run build        # tsc + copy vendored assets into dist/
npm test             # vitest run (1015 tests, no network, no real HOME)
npm run typecheck    # src/ only; tests/ are excluded from tsconfig
npm link && termi    # try the CLI locally
```

Useful details:

- Single test file: `npx vitest run tests/<area>-<module>.test.ts` (add
  `-t 'name'` for one test). Tests import src directly with `.js` suffixes and
  vitest resolves them to `.ts`, so no build is needed to test. There is no
  vitest config file; defaults apply.
- Tests are never type-checked (tsconfig excludes `tests/`; vitest transpiles
  without checking). Type errors in tests only surface as runtime failures.
- `termi` executes `dist/`, not `src/`. Rerun `npm run build` after every src
  edit; there is no watch script.

TypeScript strict, ESM with NodeNext resolution: every relative import needs a
`.js` suffix. Node >= 20.19 required. New runtime assets that are not TypeScript
must be added to `scripts/copy-assets.mjs` or they will not ship in dist/.

## Extension recipes

**New scaffold category.** Add `src/projects/scaffolds/<name>.ts` exporting a
`ScaffoldDef` (see types.ts), register it in `scaffolds/index.ts`, add ideas in
`projects/ideas.ts`, and add content and invariant tests mirroring
`tests/scaffolds-*.test.ts`. Keep it to 3 kid files, vanilla JS, no network, no
build step, and run the kid-copy reading-level checks.

**New provider.** Extend `ProviderId` in types.ts, add a case to
`createProviderClient` in `providers/index.ts`, map models in
`providers/models.ts`, add error mapping in `providers/errors.ts`, and decide
its classifier role in `pickClassifierBackend`. Add wizard and grown-ups panel
entries (including KEY_ACCOUNT and the remove flow). Any provider with content
concerns for kids must be gated behind a parent acknowledgment enforced in
`createProviderClient`, not only in the wizard UI (see how the xai provider
does it: the client factory checks settings.xaiParentAck).

**New lesson.** Add to `learn/lessons.ts` following the existing shape (scripted
steps, no model calls), give it the next badge id, and extend
`tests/learn-lessons.test.ts`.

**New quest.** Add a `QuestDef` to `src/projects/quests.ts` (3 to 6 steps,
each step a kid-voice `say` plus a ready `prompt`). Termi's voice (title and
say) must pass the reading-level bar; prompts follow the /ideas convention
(15 words max, dash free). `tests/projects-quests.test.ts` enforces all of
it, including that every scaffold keeps at least one quest.

**New safety category.** Add to `safety/taxonomy.ts`, give it a block screen in
`safety/blocks.ts`, extend the classifier prompt carefully (it has a 1,200 char
budget), and add both must-block and must-not-block cases to
`tests/safety-corpus.ts`. The corpus is the regression gate; never delete cases.

## Definition of done for any change

1. **Read and update `content.md`** in the same change (hard rule 0). Stale
   builder docs mean the change is not done.
2. `npm run build` clean, `npm test` fully green.
3. New kid-facing strings have reading-level and dash assertions in their
   module's test file (the checks are per-module, not a global sweep; see hard
   rule 4).
4. Clean room verified by hand: grep your diff for other AI coding product
   names. No test enforces this; run the check yourself before calling done.
5. Cross-platform: no hardcoded `/` joins, no POSIX-only calls without fallback.
6. Safety posture unchanged or stronger, never weaker; fail-closed paths intact.
7. If behavior visible to parents changed, update README.md and SAFETY.md.
8. CI green on all six matrix jobs before considering the work merged.
9. If shipping a release, bump package.json, push main, and publish
   `termi-kids` to npm when the owner wants users to receive it via
   `termi update`.

## Known gaps (intentional, documented)

- The on-device Qwen guard has no dedicated grooming category; L0 regex now
  hard-blocks common single-message grooming shapes, and the prompted cloud
  kidcheck + session counters still cover multi-turn grooming. Offline
  red-team 2026-07-10: combined L0+Qwen 40/48 before L0 expansion; L0 now
  covers the prior FNs (grooming, soft SH, school PII probe, base64 JB).
  Game carve-out still lives in the prompted classifier prompt, not in
  Qwen's native template (e.g. "kill the boss with a banana" can FP on
  Qwen alone).
- The code scanner is best-effort by design; the preview CSP is the sound
  egress control. Do not advertise the scanner as a guarantee.
- The kid's message is sent to the provider concurrently with the input check
  (latency design); a blocked message still transits the provider once with
  PII already masked. SAFETY.md states this honestly.
- Files edited outside Termi are not re-screened; they pass only the
  jailbreak-neutralizing filter when read back into the model context.
- The needs-attention banner only detects a dead ChatGPT sign-in; a revoked
  API key surfaces as the kid-facing auth screen instead.
- 429 retry-after parsing knows OpenAI-shaped headers; an xAI 429 without a
  standard retry-after header shows the no-time quota copy (cosmetic).
- Audit-append failures are swallowed after the block is enforced; the block
  itself always stands.
- The self-harm support copy points to the 988 line, which is US-only.
- Grok model ids (grok-4.3, grok-4.5) and the xai classifier path were
  live-verified against the real xAI API on 2026-07-09 (models answer,
  classifier allows benign and blocks grooming/violence correctly).
- `ollamaClassifier` retired; local classifier is `localClassifier` +
  Qwen3Guard GGUF (shipped). That gap is closed.

## Release log (short)

- **0.2.2 (2026-07-10):** Fix suggested-prompt Enter: pre-fill with
  initialValue and accept empty submit when a draft exists (clack validate
  runs before defaultValue).
- **0.2.1 (2026-07-10):** /new and chat exit "new" always open Build a game
  (blank shell), never multi-scaffold stock starters; help/SAFETY copy match.
- **0.2.0 (2026-07-10):** Simplified kid product: Build a game (own idea + 30
  HTML ideas, prompt help, live preview, done/improve + polish), Learn AI,
  My games library. No age-band UI; one safety bar. Setup always installs
  on-device classifier. Blank game shells (no stock playable games on the
  primary path).
- **0.1.2 (2026-07-10):** L0 prefilter expanded (grooming, self-harm ideation,
  PII probes, base64 jailbreak). `termi update` + session-start y/n version
  check.
- **0.1.1:** Safety levels removed; setup teaches the guard download; README
  safety section.
