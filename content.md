# Termi: Builder Guide

This file is the onboarding document for any developer or AI agent picking up this
repository. It explains what Termi is, the rules every change must follow, how the
code is organized, and how to build, test, and extend it. README.md is written for
parents and kids; SAFETY.md is the honest safety architecture document for parents;
this file is for builders.

## What Termi is

Termi is a kid-friendly agentic coding CLI for children around age 10 and up. A kid
types what they want to build in plain language, an AI helper writes and edits the
files, and a local browser preview shows the result live. The product goals, in
priority order:

1. **Safety first.** A layered, fail-closed safety pipeline checks what kids type,
   what the model says, and every file before it reaches disk. Parents control
   settings behind a PIN, and the settings file is tamper-evident.
2. **Fast first win.** `termi new` scaffolds a working project and opens it in the
   browser within seconds. No build step, no network calls in kid projects.
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
5. **No telemetry.** Termi makes network calls only to the selected model
   provider and serves the preview on 127.0.0.1. Do not add analytics, crash
   reporting, update pings, or any other beacon. This is a deliberate
   privacy-for-children posture.
6. **Tests never touch the real machine.** Every test that reads or writes state
   must set `TERMI_HOME` and `TERMI_PROJECTS_DIR` to temp directories and
   `TERMI_KEYRING=file` so the real home folder, real projects folder, and OS
   keychain are never touched. The existing test files show the pattern.
7. **Secrets never print.** No token, API key, or PIN value may appear in logs,
   errors, test output, or commit content.
8. **Cross-platform.** macOS, Windows, and Linux are all supported. CI runs the
   suite on all three on Node 20 and 22. Use `node:path` joins, no shell-isms,
   no platform-only APIs without a fallback.
9. **This repo is private.** Do not publish, change visibility, or add the
   package to a registry. The npm `files` allowlist in package.json controls what
   would ship if it were ever packed.

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
  cli.ts                   Argv routing: termi | new | go | preview | ideas |
                           learn | grownups | help | --version
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
    prefilter.ts           L0, local: NFKC and de-leet normalization, profanity
                           wordlist (game words carved out), PII redaction to
                           [secret], jailbreak phrase blocks. Runs on input
                           before anything else. nameIsOkay screens kid-chosen
                           names (projects, nicknames) before they enter the
                           system prompt or menus.
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
                           taxonomy and the prompted check narrows to kidcheck
                           scope (grooming/pii/jailbreak).
    localguard.ts          Pure contract for the on-device classifier
                           (Qwen3Guard-Gen-0.6B): exact prompt wrapper
                           reproduced from the model's chat template as
                           fixed/judged segments, completion parsing
                           (first Safety/Categories/Refusal lines win),
                           and the guard-to-Termi category map. Severity:
                           Unsafe 2 (always blocks), Controversial 1 (blocks
                           pii/jailbreak), Safe 0.
    guardrunner.ts         llama.cpp runtime (node-llama-cpp): lazy singleton
                           load, one context sequence, calls serialized,
                           wrapper segments tokenized with special tokens and
                           judged segments as plain text (token-level
                           injection impossible), per-call abort timeout.
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
                           The pipeline hot-attaches via lazyGuardAccessor on
                           the first check after the file lands.
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
    create.ts              termi new flow: category, theme, name, scaffold copy,
                           preview launch.
    store.ts               Project metadata (.termi.json), TERMI.md project
                           memory (recap), listing and lookup.
    snapshots.ts           Content-addressed undo/redo snapshots under
                           TERMI_HOME/snapshots/<slug>/. Kid files only.
    ideas.ts               Rotating prompt-idea decks per category (15 each
                           plus generic fallbacks).
    quests.ts              Build Quests: one step-by-step guided build per
                           scaffold (5 steps: kid instruction + ready prompt).
                           Pure registry + questsFor/questById/questStepLine.
                           Quest prompts go through the normal chat turn, so
                           the full safety pipeline applies.
    scaffolds/             Nine scaffold modules: games (canvas), biggames
                           (vendored KAPLAY engine), art, music, pets, stories,
                           quizzes, websites, characters. index.ts is the
                           registry. Each scaffold: max 3 kid files, vanilla JS,
                           no build step, no network. vendor/ holds kaplay.mjs
                           and its license; copy-assets.mjs ships it.
  preview/server.ts        Hand-rolled node:http server, 127.0.0.1 only, base
                           port 4311 with a 50-port scan. Strict CSP
                           (default-src 'self') is the egress control. SSE live
                           reload via an injected external script. Path
                           traversal jail. Never serves TERMI.md or dotfiles.
  surfaces/
    home.ts                The landing screen (continue project, new, learn...).
    chat.ts                The chat loop UI: slash commands /preview /undo /redo
                           /new /ideas /badges /learn /quest /help /done /quit
                           /grownups. The typewriter reveal is capped at 1.5s
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
                           removeProviderFromSettings), safety level, audit
                           log viewer, usage and cost notes.
  ui/                      theme.ts (colors and ThemeConfig), mascot.ts (robot
                           mascot with ASCII fallback), banner.ts, celebrate.ts,
                           text.ts (wrapping, kid copy helpers), errors.ts
                           (kid-safe error screens).
tests/                     47 vitest files plus 3 shared helpers (agent-fakes.ts,
                           safety-corpus.ts, ui-fk.ts). 1015 tests. Naming:
                           <area>-<module>.test.ts.
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

1. `npm run build` clean, `npm test` fully green.
2. New kid-facing strings have reading-level and dash assertions in their
   module's test file (the checks are per-module, not a global sweep; see hard
   rule 4).
3. Clean room verified by hand: grep your diff for other AI coding product
   names. No test enforces this; run the check yourself before calling done.
4. Cross-platform: no hardcoded `/` joins, no POSIX-only calls without fallback.
5. Safety posture unchanged or stronger, never weaker; fail-closed paths intact.
6. If behavior visible to parents changed, update README.md and SAFETY.md.
7. CI green on all six matrix jobs before considering the work merged.

## Known gaps (intentional, documented)

- `safetyLevel` strict and standard currently behave identically; SAFETY.md says
  so honestly. Differentiating them is open work.
- `ollamaClassifier` settings flag is reserved but unimplemented (a future local
  classifier backend).
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
