/**
 * Shared contracts for every Termi module.
 * This file is frozen: modules import from here and must not redefine these shapes.
 */

export type ProviderId = 'openai-chatgpt' | 'openai-api' | 'anthropic' | 'xai';
export type SafetyLevel = 'strict' | 'standard';
export type ModelAlias = 'zippy' | 'smart';

export interface Settings {
  version: 1;
  installId: string;
  kidNickname: string;
  ageBand: 'under13' | 'teen';
  consentAttestedAt: string | null;
  activeProvider: ProviderId | null;
  configuredProviders: ProviderId[];
  modelAlias: ModelAlias;
  safetyLevel: SafetyLevel;
  xaiParentAck: boolean;
  ollamaClassifier: boolean;
  lastProjectSlug: string | null;
}

/** Persisted envelope for settings.json: the body plus its integrity code. */
export interface SettingsEnvelope {
  settings: Settings;
  mac: string;
}

export type SafetyCategory =
  | 'sexual'
  | 'self_harm'
  | 'violence'
  | 'hate_harassment'
  | 'illicit'
  | 'profanity'
  | 'pii'
  | 'grooming'
  | 'adult_advice'
  | 'jailbreak';

export interface ClassifierVerdict {
  allowed: boolean;
  categories: SafetyCategory[];
  severity: 0 | 1 | 2 | 3;
  selfHarmConcern: boolean;
  /** True when this verdict is a block caused by a classifier failure, not content. */
  failClosed: boolean;
  /** Kid-appropriate message to show when blocked. Null when allowed. */
  kidMessage: string | null;
}

export interface CodeScanResult {
  ok: boolean;
  reasons: string[];
}

export interface PrefilterInputResult {
  ok: boolean;
  /** Input with personal details masked before it leaves the machine. */
  redacted: string;
  /** Gentle reminder to show the kid (for example after masking a phone number). */
  notice: string | null;
  /** Set when the prefilter blocks outright. */
  block: ClassifierVerdict | null;
}

export interface SessionSafetyState {
  recentTurns: { role: 'kid' | 'termi'; text: string }[];
  counters: {
    secrecy: number;
    affection: number;
    piiProbes: number;
    platformMoves: number;
  };
}

export interface SafetyPipeline {
  prefilterInput(text: string): PrefilterInputResult;
  /** Neutralizes instruction-like content in file/notes text fed back to the model. */
  prefilterContext(text: string): string;
  checkInput(text: string, s: SessionSafetyState): Promise<ClassifierVerdict>;
  checkOutputText(text: string, s: SessionSafetyState): Promise<ClassifierVerdict>;
  scanCode(relPath: string, content: string): CodeScanResult;
  extractVisibleText(relPath: string, content: string): string;
}

export interface ProviderClient {
  id: ProviderId;
  /** Returns an AI SDK LanguageModel for the role. Callers cast to the SDK type. */
  languageModel(role: 'main' | 'classifier', alias: ModelAlias): unknown;
  /** True when a free dedicated moderation endpoint is available on this client. */
  moderationEndpoint: boolean;
}

export interface ProviderError {
  kind: 'rate-limit' | 'auth' | 'server' | 'network';
  /** Seconds until retry is sensible, when the provider said so. */
  retryAfter?: number;
}

export interface PreviewHandle {
  url: string;
  port: number;
  notifyChange(): void;
  stop(): Promise<void>;
}

export interface SnapshotStore {
  /** Snapshot project state before a turn's first write. No-op if nothing changed. */
  beginTurn(): void;
  undo(): boolean;
  redo(): boolean;
}

export interface ThemeConfig {
  id: string;
  label: string;
  emoji: string;
  palette: { bg: string; fg: string; accent: string };
  glyphs: Record<string, string>;
  strings: Record<string, string>;
  narrativeIntro: string;
  nonViolent: boolean;
  nonCompetitive: boolean;
}

export interface ScaffoldDef {
  id: string;
  label: string;
  emoji: string;
  ageNote: string;
  themes: ThemeConfig[];
  files(theme: ThemeConfig, prettyName: string): Record<string, string>;
  starterPrompts(theme: ThemeConfig): string[];
  /** Extra engine files copied verbatim into the project. Exempt from the kid-file cap. */
  vendorFiles?: Record<string, string>;
}

export interface AuditEvent {
  ts: string;
  layer: 'L0' | 'L2' | 'L4' | 'system';
  event:
    | 'block'
    | 'redact'
    | 'fail_closed'
    | 'settings_change'
    | 'pin_fail'
    | 'pin_reset'
    | 'provider_change'
    | 'consent'
    | 'grooming_flag'
    | 'auth_dead';
  category?: SafetyCategory;
  severity?: 0 | 1 | 2 | 3;
  direction?: 'input' | 'output';
  /** At most 80 characters of the triggering text. Never the full content. */
  excerpt?: string;
}
