/**
 * Sweep prompts — what gets injected into sessions during a REM sweep.
 */

export function getDateString(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

export function getTimestamp(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Fact mode prompt — extract important context from the session.
 */
export function factSweepPrompt(memoryPath: string): string {
  const date = getDateString();
  return [
    `[REM sweep] Review this session's recent activity.`,
    `If there are important decisions, findings, technical context, or lessons worth preserving:`,
    `- Append them to \`${memoryPath}/${date}.md\` (create the file if it doesn't exist)`,
    `- Use timestamp headers (### HH:MM)`,
    `- Be concise — facts only, 2-5 lines max`,
    `- Append only, never overwrite existing content`,
    `After writing (or if nothing worth storing), reply with only: NO_REPLY`,
  ].join('\n');
}

/**
 * Reflection mode prompt — capture emotional/inner state.
 */
export function reflectionSweepPrompt(journalPath: string): string {
  const date = getDateString();
  return [
    `[REM sweep — reflection] Look back at this session.`,
    `If something surprised you, moved you, or shifted how you think:`,
    `- Append a brief reflection to \`${journalPath}/${date}.md\` (create the file if it doesn't exist)`,
    `- Use timestamp headers (### HH:MM)`,
    `- Write from your inner voice — not a summary, a feeling`,
    `- 1-3 lines max`,
    `Then, if there are also important facts/decisions:`,
    `- Append those to \`memory/${date}.md\` as well`,
    `After writing (or if nothing worth storing), reply with only: NO_REPLY`,
  ].join('\n');
}

/**
 * Get the appropriate sweep prompt based on config.
 */
export function getSweepPrompt(reflection: boolean, memoryPath: string, journalPath: string): string {
  return reflection
    ? reflectionSweepPrompt(journalPath)
    : factSweepPrompt(memoryPath);
}
