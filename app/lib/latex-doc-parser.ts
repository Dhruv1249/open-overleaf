/**
 * Parse a LaTeX document for user-defined commands and environments.
 *
 * Detects:
 *  - \newcommand{\name}[N]{body}   → adds \name with N {} args
 *  - \renewcommand{\name}[N]{body} → same
 *  - \newcommand*{\name}[N]{body}  → same (starred form)
 *  - \def\name#1#2{body}           → counts #1 .. #9 args
 *  - \newenvironment{name}[N]{}{} → adds name to environment list
 *  - \DeclareMathOperator{\name}{} → adds \name as 0-arg command
 *  - \providecommand{\name}[N]{}   → same as newcommand
 */

export interface ParsedCommand {
  name: string;       // command name without \
  argCount: number;   // number of arguments
  isEnv: boolean;     // true if this is an environment name
  source: "newcommand" | "def" | "environment" | "mathop" | "newtheorem";
}

/**
 * Build the snippet insertText for a command with N args.
 * e.g. argCount=3 → "myCmd{$1}{$2}{$3}"
 */
export function buildInsertText(name: string, argCount: number): string {
  if (argCount === 0) return name;
  const args = Array.from({ length: argCount }, (_, i) => `{$${i + 1}}`).join("");
  return `${name}${args}`;
}

/** Parse all user-defined commands in the given document text. */
export function parseDocumentCommands(text: string): ParsedCommand[] {
  const results: ParsedCommand[] = [];
  const seen = new Set<string>();

  function add(cmd: ParsedCommand) {
    const key = `${cmd.isEnv ? "env:" : ""}${cmd.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(cmd);
    }
  }

  // ── \newcommand{\name}[N]{body}  /  \renewcommand  /  \providecommand ────
  // Pattern: \newcommand*?{ \name }[ N ]{ ... }
  const newCmdRe = /\\(?:new|renew|provide)command\*?\s*\{?\s*\\(\w+)\s*\}?(?:\s*\[(\d+)\])?/g;
  let m: RegExpExecArray | null;
  while ((m = newCmdRe.exec(text)) !== null) {
    const name = m[1];
    const argCount = m[2] ? parseInt(m[2], 10) : 0;
    add({ name, argCount, isEnv: false, source: "newcommand" });
  }

  // ── \def\name#1#2...{ ────────────────────────────────────────────────────
  // Count how many #1 #2 ... appear before the opening {
  const defRe = /\\def\\(\w+)((?:#\d)*)\s*\{/g;
  while ((m = defRe.exec(text)) !== null) {
    const name = m[1];
    // Count distinct #N markers
    const argMarkers = (m[2] || "").match(/#\d/g) || [];
    const argCount = argMarkers.length;
    add({ name, argCount, isEnv: false, source: "def" });
  }

  // ── \newenvironment{name}[N]{begin}{end} ─────────────────────────────────
  const newEnvRe = /\\(?:new|renew)environment\s*\{(\w+)\}(?:\s*\[(\d+)\])?/g;
  while ((m = newEnvRe.exec(text)) !== null) {
    const name = m[1];
    add({ name, argCount: 0, isEnv: true, source: "environment" });
  }

  // ── \DeclareMathOperator{\name}{symbol} ───────────────────────────────────
  const mathOpRe = /\\DeclareMathOperator\*?\s*\{?\s*\\(\w+)\s*\}?/g;
  while ((m = mathOpRe.exec(text)) !== null) {
    add({ name: m[1], argCount: 0, isEnv: false, source: "mathop" });
  }

  // ── \newtheorem{name}{Title} / \newtheorem*{name}{Title} ─────────────────
  const thmRe = /\\newtheorem\*?\s*\{(\w+)\}/g;
  while ((m = thmRe.exec(text)) !== null) {
    add({ name: m[1], argCount: 0, isEnv: true, source: "newtheorem" });
  }

  return results;
}
