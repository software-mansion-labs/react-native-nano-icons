import { runFromCli } from "./pipeline/run.js";

runFromCli().catch((e) => {
  console.error(e);
  process.exit(1);
});
