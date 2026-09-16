import { z } from "zod";

/** The durable relationship between an LMBook notebook and its Markdown workspace. */
export const notebookWorkspaceLinkSchema = z
  .object({
    notebookId: z.string().uuid(),
    vaultId: z.string().uuid(),
    managed: z.boolean(),
    root: z.string().min(1),
    warnings: z
      .array(z.object({ path: z.string().optional(), message: z.string() }))
      .optional(),
  })
  .strict();
export type NotebookWorkspaceLink = z.infer<typeof notebookWorkspaceLinkSchema>;

export type WorkspaceWarning = { path?: string; message: string };
export type WorkspaceSyncResult = {
  notebookId: string;
  imported: number;
  updated: number;
  unchanged: number;
  preservedRemoved: number;
  warnings: WorkspaceWarning[];
  excluded?: number;
};
