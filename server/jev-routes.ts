import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  checkJevConnection,
  connectJev,
  getJevFeatures,
  jevConnectionStatus,
  saveJevFeatures,
  saveJevKey,
} from "./jev.ts";
import { jevFeaturesSchema } from "../shared/jev.ts";

const route =
  (fn: (req: Request, res: Response) => unknown) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

export function registerJevRoutes(app: Express) {
  app.get(
    "/api/connections/jev",
    route((_req, res) => res.json(jevConnectionStatus())),
  );
  app.post(
    "/api/connections/jev",
    route(async (req, res) => {
      const input = z.object({ apiKey: z.string().max(512) }).parse(req.body);
      res.json(await connectJev(input.apiKey));
    }),
  );
  app.post(
    "/api/connections/jev/check",
    route(async (_req, res) => res.json(await checkJevConnection())),
  );
  app.delete(
    "/api/connections/jev",
    route((_req, res) => {
      saveJevKey("");
      const status = jevConnectionStatus();
      res.json({
        ok: true,
        message: status.configured
          ? "Saved key removed. TypeSafe is still connected through this computer's environment setting."
          : "TypeSafe disconnected.",
      });
    }),
  );
  app.get(
    "/api/jev/features",
    route((_req, res) => res.json(getJevFeatures())),
  );
  app.put(
    "/api/jev/features",
    route((req, res) =>
      res.json(saveJevFeatures(jevFeaturesSchema.parse(req.body))),
    ),
  );
}
