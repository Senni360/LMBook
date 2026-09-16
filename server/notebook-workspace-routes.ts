import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getVault, listVaults } from "./vault.ts";
import { getNotebook } from "./store.ts";
import {
  ensureNotebookWorkspace,
  notebookForVault,
  listWorkspaceLinks,
  syncNotebookWorkspace,
  createObsidianNotebookExport,
  workspaceIsTrashed,
} from "./notebook-workspace.ts";

export function registerNotebookWorkspaceRoutes(app: Express) {
  const route =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.setHeader("Cache-Control", "no-store");
        await fn(req, res);
      } catch (error) {
        next(error);
      }
    };
  const id = (req: Request) => z.string().uuid().parse(req.params.id);
  app.post(
    "/api/workspaces/connect-existing",
    route(async (_req, res) => {
      for (const vault of listVaults()) {
        if (!workspaceIsTrashed(vault.id)) await notebookForVault(vault.id);
      }
      res.json(listWorkspaceLinks());
    }),
  );
  app.post(
    "/api/vaults/:id/notebook",
    route(async (req, res) => {
      const link = await notebookForVault(id(req));
      res.json(getNotebook(link.notebookId));
    }),
  );
  app.post(
    "/api/notebooks/:id/workspace",
    route(async (req, res) => {
      const link = await ensureNotebookWorkspace(id(req));
      res.json({ link, vault: getVault(link.vaultId) });
    }),
  );
  app.post(
    "/api/notebooks/:id/workspace/sync",
    route(async (req, res) => res.json(await syncNotebookWorkspace(id(req)))),
  );
  app.get(
    "/api/notebooks/:id/vault-export",
    route(async (req, res) => {
      const stream = await createObsidianNotebookExport(id(req));
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="LMBook-vault.zip"',
      );
      stream.on("error", (error) => res.destroy(error));
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    }),
  );
}
