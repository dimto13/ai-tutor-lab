export type GuidedInstructionSegment =
  | {
      kind: "text";
      text: string;
    }
  | {
      /** A value the learner is expected to enter literally in the target runtime. */
      kind: "literal-input";
      text: string;
      /** Optional accessible context when the surrounding instruction is not sufficient. */
      accessibleLabel?: string;
    };

/**
 * Declarative guided-instruction content. Rendering belongs to the platform UI;
 * this contract deliberately contains no DOM, CSS, or product-specific behavior.
 */
export interface GuidedInstructionContent {
  segments: GuidedInstructionSegment[];
}

export type FilePathCaseSensitivity = "sensitive" | "insensitive";

/**
 * Neutral runtime capability used only when a learning contract compares file
 * names or paths. It must not be applied to code or free-text validation.
 */
export interface FilePathComparisonCapability {
  caseSensitivity: FilePathCaseSensitivity;
}

export interface PlatformShortcutVariant {
  platform: "windows" | "macos" | "linux";
  keys: string[];
  /** Optional learner-facing label such as "Windows" or "macOS". */
  label?: string;
}

/**
 * Declarative shortcut metadata. `primaryPlatform` controls presentation order;
 * all variants remain available to mouse, keyboard, and touch UIs.
 */
export interface PlatformShortcutMetadata {
  primaryPlatform: PlatformShortcutVariant["platform"];
  variants: PlatformShortcutVariant[];
}
