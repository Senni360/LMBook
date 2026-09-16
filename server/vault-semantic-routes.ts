import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  buildVaultSemanticIndex,
  cancelVaultSemanticIndex,
  getVaultSemanticIndex,
  getVaultSemanticPreference,
  searchVaultSemantic,
  setVaultSemanticPreference,
} from "./vault-semantic.ts";
import type { VaultEmbeddingProvider } from "../shared/vault-semantic.ts";

/** Register semantic endpoints without choosing the runtime/provider here. */
export function registerVaultSemanticRoutes(
  app: Express,
  resolveProvider: (
    req: Request,
    vaultId: string,
  ) => VaultEmbeddingProvider | null,
) {
  const queries = new Map<string, Set<AbortController>>();
  const id = (req: Request) => z.string().uuid().parse(req.params.vaultId);
  const route =
    (fn: (req: Request, res: Response) => unknown) =>
    async (req: Request, res: Response) => {
      try {
        res.setHeader("Cache-Control", "no-store");
        await fn(req, res);
      } catch (error) {
        const status =
          error && typeof error === "object" && "status" in error
            ? Number((error as { status: number }).status)
            : 400;
        res.status(status).json({
          error:
            error instanceof Error
              ? error.message
              : "Semantic vault operation failed.",
        });
      }
    };
  app.get(
    "/api/vaults/:vaultId/semantic",
    route((req, res) => {
      const vaultId = id(req),
        provider = resolveProvider(req, vaultId);
      res.json({
        ...getVaultSemanticIndex(vaultId, provider || undefined),
        preference: getVaultSemanticPreference(vaultId),
      });
    }),
  );
  app.put(
    "/api/vaults/:vaultId/semantic/preference",
    route(async (req, res) => {
      const vaultId = id(req);
      const mode = z
        .enum(["lexical", "local", "openrouter"])
        .parse(req.body.mode);
      for (const query of queries.get(vaultId) || []) query.abort();
      await cancelVaultSemanticIndex(vaultId);
      setVaultSemanticPreference(vaultId, mode);
      res.json({ mode });
    }),
  );
  app.post(
    "/api/vaults/:vaultId/semantic/index",
    route(async (req, res) => {
      const vaultId = id(req),
        provider = resolveProvider(req, vaultId);
      if (!provider)
        throw new Error("No embedding provider is configured for this vault.");
      res.json(
        await buildVaultSemanticIndex(vaultId, provider, {
          allowCloud: req.body.allowCloud === true,
        }),
      );
    }),
  );
  app.post(
    "/api/vaults/:vaultId/semantic/cancel",
    route(async (req, res) => {
      await cancelVaultSemanticIndex(id(req));
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/vaults/:vaultId/semantic/search",
    route(async (req, res) => {
      const vaultId = id(req),
        provider = resolveProvider(req, vaultId);
      if (!provider)
        throw new Error("No embedding provider is configured for this vault.");
      const controller = new AbortController();
      const active = queries.get(vaultId) || new Set<AbortController>();
      if (active.size >= 2)
        throw new Error("A search is already running. Wait for it to finish.");
      queries.set(vaultId, active);
      active.add(controller);
      const abort = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", abort);
      try {
        res.json(
          await searchVaultSemantic(
            vaultId,
            z.string().trim().max(500).parse(req.query.q),
            provider,
            z.coerce
              .number()
              .int()
              .min(1)
              .max(50)
              .default(20)
              .parse(req.query.limit),
            controller.signal,
          ),
        );
      } finally {
        res.off("close", abort);
        active.delete(controller);
        if (!active.size) queries.delete(vaultId);
      }
    }),
  );
}
