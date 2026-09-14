import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import type { Notebook } from "../shared/model.ts";

test(
  "local app: import, coverage, scripts, persistence, exports and desktop/mobile flows",
  { timeout: 120000 },
  async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "sennibook-test-"));
    let notebook: Notebook;
    // Deterministic local provider double. No paid model or speech calls in this suite.
    const mock = createServer(async (req, res) => {
      if (req.url === "/api/tags") {
        res.end(JSON.stringify({ models: [] }));
        return;
      }
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const prompt = body.messages[0].content;
      let answer: any;
      if (prompt.includes("Assess EVERY objective in this batch"))
        answer = {
          coverage: notebook.objectives.map((o, i) => ({
            objectiveId: o.id,
            status: "covered",
            explanation: "This passage supports the concept.",
            evidence: [
              {
                sourceId: notebook.sources[0].id,
                quote:
                  i === 0
                    ? "A coalition is an agreement between parties."
                    : "This invented quote must be rejected.",
              },
            ],
            searchQuery: o.text,
          })),
        };
      else if (prompt.includes("Plan a "))
        answer = {
          title: "A closer look at coalitions",
          chapters: [
            {
              title: "Why parties cooperate",
              summary: "Explain coalitions and their incentives.",
              objectiveIds: notebook.objectives.map((o) => o.id),
            },
          ],
        };
      else if (prompt.includes("Write chapter"))
        answer = {
          turns: [
            {
              speaker: "A",
              text: "A coalition is an agreement between parties. Let us examine what this means.",
              sourceIds: [notebook.sources[0].id],
            },
            {
              speaker: "B",
              text: "We should distinguish the agreement itself from the reasons each party accepts it.",
              sourceIds: [],
            },
          ],
        };
      else if (prompt.includes("Answer the user"))
        answer = {
          answer:
            "The source defines a coalition as an agreement between parties.",
          evidence: [
            {
              sourceId: notebook.sources[0].id,
              quote: "A coalition is an agreement between parties.",
            },
          ],
        };
      else if (prompt.includes("Extract explicitly"))
        answer = { items: [{ text: "Coalition formation", kind: "concept" }] };
      else answer = {};
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: { content: JSON.stringify(answer) } }));
    });
    await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve));
    const mockPort = (mock.address() as any).port;
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = (probe.address() as any).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts", "--production"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(port),
          DATA_DIR: dataDir,
          OLLAMA_BASE_URL: `http://127.0.0.1:${mockPort}`,
          GOOGLE_CLOUD_PROJECT: "",
          OPENCODE_API_KEY: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    const base = `http://127.0.0.1:${port}`;
    async function request(route: string, method = "GET", body?: any) {
      const form = body instanceof FormData;
      const r = await fetch(base + "/api" + route, {
        method,
        headers: {
          "x-sennibook": "1",
          ...(!form && body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body:
          body === undefined ? undefined : form ? body : JSON.stringify(body),
      });
      const json = await r.json();
      assert.ok(r.ok, JSON.stringify(json));
      return json;
    }
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(base + "/api/notebooks")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(ready, log);
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base);
      await page
        .getByRole("heading", { name: "Your material. A deeper conversation." })
        .waitFor();
      mkdirSync("test-results", { recursive: true });
      await page.screenshot({
        path: "test-results/welcome-desktop.png",
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Create your first notebook" })
        .click();
      await page.getByLabel("Notebook name").fill("Coalition studies");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Create notebook", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Coalition studies", exact: true })
        .waitFor();
      const list = await request("/notebooks");
      notebook = await request("/notebooks/" + list[0].id);
      const nid = notebook.id;
      notebook = await request(`/notebooks/${nid}`, "PATCH", {
        settings: {
          ...notebook.settings,
          provider: "ollama",
          model: "test-model",
          minutes: 5,
        },
      });
      const data = new FormData();
      data.append(
        "file",
        new Blob(
          [
            "A coalition is an agreement between parties. Parties can cooperate to assemble a majority.",
          ],
          { type: "text/plain" },
        ),
        "Lecture notes.txt",
      );
      notebook = await request(`/notebooks/${nid}/upload`, "POST", data);
      assert.equal(notebook.sources.length, 1);
      notebook = await request(`/notebooks/${nid}/objectives`, "PUT", [
        {
          id: crypto.randomUUID(),
          text: "Explain coalitions",
          kind: "goal",
          important: true,
        },
        {
          id: crypto.randomUUID(),
          text: "Electoral incentives",
          kind: "concept",
          important: true,
        },
      ]);
      notebook = await request(`/notebooks/${nid}/coverage`, "POST");
      assert.equal(notebook.coverage[0].status, "covered");
      assert.equal(notebook.coverage[1].status, "missing");
      assert.equal(notebook.coverage[1].evidence.length, 0);
      notebook = await request(`/notebooks/${nid}/chat`, "POST", {
        message: "What is a coalition?",
      });
      assert.equal(notebook.messages.length, 2);
      assert.equal(notebook.messages[1].evidence?.length, 1);
      notebook = await request(`/notebooks/${nid}/episodes`, "POST");
      const eid = notebook.episodes[0].id;
      assert.equal(notebook.episodes[0].chapters[0].objectiveIds.length, 2);
      await request(`/notebooks/${nid}/episodes/${eid}/script`, "POST");
      for (let i = 0; i < 50; i++) {
        notebook = await request(`/notebooks/${nid}`);
        if (notebook.episodes[0].chapters[0].turns.length) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(notebook.episodes[0].chapters[0].turns.length, 2);
      const exported = await (
        await fetch(`${base}/api/notebooks/${nid}/export`)
      ).text();
      assert.match(exported, /Lecture notes/);
      assert.match(exported, /Host/);
      const denied = await fetch(base + "/api/notebooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://malicious.example",
          "x-sennibook": "1",
        },
        body: JSON.stringify({ title: "bad" }),
      });
      assert.equal(denied.status, 403);
      const malformed = await fetch(base + "/api/notebooks/not-a-uuid", {
        method: "GET",
      });
      assert.equal(malformed.status, 400);
      const missingAuth = await fetch(
        base + `/api/notebooks/${nid}/episodes/${eid}/audio`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-sennibook": "1" },
          body: "{}",
        },
      );
      assert.equal(missingAuth.status, 400);
      await page.reload();
      await page
        .getByRole("button", { name: "Read Lecture notes.txt" })
        .waitFor();
      await page.screenshot({
        path: "test-results/sources-desktop.png",
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Learning goals 2", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Expand evidence" })
        .first()
        .click();
      await page.getByText("This passage supports the concept.").waitFor();
      await page.screenshot({
        path: "test-results/goals-desktop.png",
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Audio studio 1", exact: true })
        .click();
      await page
        .getByText("A closer look at coalitions", { exact: true })
        .waitFor();
      await page.screenshot({
        path: "test-results/studio-desktop.png",
        fullPage: true,
      });
      const desktopOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(desktopOverflow, false);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: "test-results/studio-mobile.png",
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      await page
        .getByRole("button", { name: "New notebook", exact: true })
        .click();
      await page.getByLabel("Notebook name").fill("Biology");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Create notebook", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Biology", exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
      await page.reload();
      await page
        .getByRole("heading", { name: "Biology", exact: true })
        .waitFor();
      assert.equal((await request("/notebooks")).length, 2);
      const biology = (await request("/notebooks")).find(
        (item: Notebook) => item.title === "Biology",
      );
      for (const extension of ["pdf", "docx"]) {
        const file = new FormData();
        file.append(
          "file",
          new Blob([readFileSync(`tests/fixtures/biology.${extension}`)]),
          `biology.${extension}`,
        );
        const imported = await request(
          `/notebooks/${biology.id}/upload`,
          "POST",
          file,
        );
        assert.match(
          imported.sources.at(-1).text,
          /Photosynthesis converts light energy into chemical energy/,
        );
        if (extension === "pdf")
          assert.match(imported.sources.at(-1).text, /\[Page 1\]/);
      }
    } finally {
      await browser?.close();
      child.kill();
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) resolve();
        else child.once("exit", () => resolve());
      });
      await new Promise<void>((resolve) => mock.close(() => resolve()));
      const target = path.resolve(dataDir);
      if (
        target.startsWith(path.resolve(tmpdir()) + path.sep) &&
        path.basename(target).startsWith("sennibook-test-")
      )
        rmSync(target, { recursive: true, force: true });
    }
  },
);
