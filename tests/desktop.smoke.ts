import test from "node:test";
import assert from "node:assert/strict";
import { _electron as electron } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

test(
  "desktop: isolated backend, sandbox, persistence and clean restart",
  { timeout: 120000 },
  async () => {
    const data = mkdtempSync(path.join(tmpdir(), "sennibook-desktop-"));
    // This existing smoke exercises an already-onboarded library. Account login
    // must not depend on a developer's credentials or spend allowance in CI.
    mkdirSync(path.join(data, "data"), { recursive: true });
    writeFileSync(
      path.join(data, "data", "codex-onboarding.json"),
      JSON.stringify({
        completedAt: "2026-01-01T00:00:00.000Z",
        checkedAt: "2026-01-01T00:00:00.000Z",
        planType: null,
        models: [{ id: "gpt-5.6-luna", displayName: "Luna" }],
        lunaAvailable: true,
      }),
    );
    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      SENNIBOOK_USER_DATA: data,
      SENNIBOOK_TEST_HIDDEN: "1",
    };
    delete env.ELECTRON_RUN_AS_NODE;
    let desktop: Awaited<ReturnType<typeof electron.launch>> | undefined;
    try {
      const launch = () =>
        electron.launch({
          args: process.env.SENNIBOOK_TEST_EXECUTABLE ? [] : ["."],
          executablePath: process.env.SENNIBOOK_TEST_EXECUTABLE,
          env,
        });
      desktop = await launch();
      const page = await desktop.firstWindow();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page
        .getByRole("heading", { name: "Your learning library." })
        .waitFor();
      const info = await page.evaluate(() =>
        window.sennibookDesktop!.getInfo(),
      );
      assert.equal(info.dataPath, path.join(data, "data"));
      const sandbox = await page.evaluate(() => ({
        require: typeof (window as any).require,
        node: typeof (window as any).process,
      }));
      assert.deepEqual(sandbox, { require: "undefined", node: "undefined" });
      const backendOrigin = readFileSync(
        path.join(data, "desktop.log"),
        "utf8",
      ).match(/ready at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      assert.ok(backendOrigin);
      assert.equal((await fetch(backendOrigin + "/api/notebooks")).status, 403);
      await page
        .getByRole("button", { name: "Create your first notebook" })
        .click();
      await page.getByLabel("Notebook name").fill("Desktop biology");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Create notebook", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Desktop biology", exact: true })
        .waitFor();
      // Hidden packaged windows can stall Windows screenshot capture. The
      // diagnostic image is optional; persistence and sandbox checks are not.
      if (process.env.SENNIBOOK_TEST_SCREENSHOT === "1") {
        mkdirSync("test-results", { recursive: true });
        await page.screenshot({ path: "test-results/desktop-app.png" });
      }
      assert.deepEqual(errors, []);
      await desktop.close();
      desktop = await launch();
      const reopened = await desktop.firstWindow();
      await reopened
        .getByRole("heading", { name: "Desktop biology", exact: true })
        .waitFor();
    } finally {
      await desktop?.close();
      if (
        path.resolve(data).startsWith(path.resolve(tmpdir()) + path.sep) &&
        path.basename(data).startsWith("sennibook-desktop-")
      )
        await rm(data, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
    }
  },
);
