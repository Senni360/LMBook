process.argv.push("--production");
import("../server-dist/index.js").catch((error) => {
  process.parentPort?.postMessage({ type: "error", message: error.message });
  console.error(error);
  process.exit(1);
});
