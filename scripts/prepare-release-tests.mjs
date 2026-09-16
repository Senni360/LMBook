import { readFile, writeFile } from "node:fs/promises";

// Historical app code and behavioral assertions stay unchanged. Only the
// integration harness's startup allowance is raised for cold Windows runners.
const file = "tests/integration.test.ts";
const text = await readFile(file, "utf8");
const before = "for (let i = 0; i < 100; i++)";
const after = "for (let i = 0; i < 450; i++)";
if (text.includes(after)) {
  console.log("Integration startup allowance is already 45 seconds.");
} else if (
  text.split(before).length === 2 &&
  text.includes("assert.ok(ready, log)")
) {
  await writeFile(file, text.replace(before, after));
  console.log(
    "Historical integration startup allowance: 10 → 45 seconds. Assertions unchanged.",
  );
} else {
  throw new Error(
    "Unexpected historical integration harness; inspect before changing it.",
  );
}
