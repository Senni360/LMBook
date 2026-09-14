import type { Turn } from "./model.ts";

export const MAX_SCRIPT_TURNS = 100;
export const MAX_TURN_CHARACTERS = 12_000;

/** Keep rejected edits intact and describe the exact boundary before saving. */
export function parseEditedScript(script: string, previous: Turn[]): Turn[] {
  const blocks = script.split(/(?=^[AB]:)/m).filter((block) => block.trim());
  if (blocks.length < 2)
    throw new Error("Use at least two speaker turns, beginning with A: or B:.");
  if (blocks.length > MAX_SCRIPT_TURNS)
    throw new Error(
      `This chapter has ${blocks.length} turns; the limit is ${MAX_SCRIPT_TURNS}. Split it into fewer turns before saving.`,
    );
  return blocks.map((block, index) => {
    const match = block.match(/^([AB]):\s*([\s\S]*)$/);
    if (!match)
      throw new Error(
        `Start turn ${index + 1} with A: or B:. Your edits are still here.`,
      );
    const text = match[2].trim();
    if (!text)
      throw new Error(
        `Turn ${index + 1} is empty. Add its spoken text before saving.`,
      );
    if (text.length > MAX_TURN_CHARACTERS)
      throw new Error(
        `Turn ${index + 1} has ${text.length.toLocaleString()} characters; the limit is ${MAX_TURN_CHARACTERS.toLocaleString()}. Split it into shorter speaker turns. Your edits are still here.`,
      );
    return {
      speaker: match[1] as "A" | "B",
      text,
      sourceIds:
        previous[index]?.text === text ? previous[index].sourceIds : [],
    };
  });
}
