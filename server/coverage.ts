import { z } from "zod";
import type { Coverage, Notebook } from "../shared/model.ts";
import { buildRequestContext } from "./request-context.ts";
import { parseJSON, validEvidence } from "./core.ts";
import { generate } from "./providers.ts";

const responseSchema = z.object({
  coverage: z
    .array(
      z.object({
        objectiveId: z.string(),
        status: z.enum(["covered", "partial", "missing"]),
        explanation: z.string().max(5000),
        evidence: z
          .array(
            z.object({ sourceId: z.string(), quote: z.string().max(20_000) }),
          )
          .max(8),
        searchQuery: z.string().max(500),
      }),
    )
    .max(30),
});

/** Assess small groups so every objective gets its own retrieval opportunity. */
export async function assessCoverage(
  notebook: Notebook,
  signal: AbortSignal | undefined,
  onProgress: (message: string) => void,
): Promise<Coverage[]> {
  const coverage: Coverage[] = [];
  const batchSize = 12;
  for (let start = 0; start < notebook.objectives.length; start += batchSize) {
    signal?.throwIfAborted();
    const goals = notebook.objectives.slice(start, start + batchSize);
    onProgress(
      `Mapping goals ${start + 1}–${start + goals.length} of ${notebook.objectives.length}`,
    );
    const context = buildRequestContext(
      notebook.sources,
      notebook.settings,
      goals,
    );
    const raw = responseSchema.parse(
      parseJSON(
        await generate(
          notebook.settings,
          `Assess EVERY objective in this batch against the supplied passages. Quotes must be exact excerpts. Covered means adequate to teach the objective, partial means only some aspects, missing means you found no usable evidence in this context. A selected subset cannot prove that the complete sources lack evidence. Suggest a web search query for gaps without claiming to have searched. Return JSON {"coverage":[{"objectiveId":"exact id","status":"covered|partial|missing","explanation":"...","evidence":[{"sourceId":"exact id","quote":"exact passage"}],"searchQuery":"query or empty"}]}.\nObjectives: ${JSON.stringify(goals)}\n${context.prompt}`,
          signal,
        ),
      ),
    );
    for (const goal of goals) {
      const row = raw.coverage.find((item) => item.objectiveId === goal.id);
      if (!row) {
        coverage.push({
          objectiveId: goal.id,
          status: "missing",
          evidence: [],
          explanation:
            "The model did not assess this objective. Its coverage is still unknown.",
          searchQuery: goal.text,
          context: context.summary,
        });
        continue;
      }
      const evidence = validEvidence(row.evidence, notebook, context.selection);
      coverage.push({
        ...row,
        evidence,
        status: evidence.length ? row.status : "missing",
        context: context.summary,
        explanation: !evidence.length
          ? context.selection.scope === "selected"
            ? "No supporting quote was verified in the selected passages. Other parts of your sources may still address this objective; review the consulted passages before adding material."
            : row.evidence.length
              ? "The proposed quotes could not be matched to the supplied sources. Review this objective; its coverage is not established."
              : "No supporting quote was found in the supplied source text. Review this objective before treating it as a confirmed gap."
          : row.explanation,
      });
    }
  }
  return coverage;
}
