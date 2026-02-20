import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { scanDirectory, scanFromGit } from "./parse.js";
import { serializeGraph } from "./graph.js";
import { diffGraphs, isDiffEmpty } from "./diff.js";
import { formatDiffForAgent } from "./hook.js";

const program = new Command();

program
  .name("depgraph")
  .description("Tree-sitter class dependency graph extractor")
  .version("0.1.0");

program
  .command("scan")
  .description("Scan directory and output class dependency graph")
  .argument("<dir>", "Directory to scan")
  .option("-o, --output <file>", "Write output to file instead of stdout")
  .option(
    "-l, --languages <langs>",
    "Comma-separated language filter (ts, java, swift)",
    (val: string) => val.split(",")
  )
  .action(async (dir: string, opts: { output?: string; languages?: string[] }) => {
    const graph = await scanDirectory(dir, { languages: opts.languages });

    const json = serializeGraph(graph);
    if (opts.output) {
      writeFileSync(opts.output, json, "utf-8");
      console.error(
        `Wrote graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges -> ${opts.output}`
      );
    } else {
      process.stdout.write(json + "\n");
    }
  });

program
  .command("diff")
  .description("Show dependency graph changes vs previous commit")
  .argument("<dir>", "Directory to scan")
  .option(
    "-r, --ref <ref>",
    "Git ref to compare against (default: HEAD~1)",
    "HEAD~1"
  )
  .option("--json", "Output raw JSON diff instead of formatted text")
  .action(async (dir: string, opts: { ref: string; json?: boolean }) => {
    const [current, previous] = await Promise.all([
      scanDirectory(dir),
      scanFromGit(dir, opts.ref),
    ]);

    const diff = diffGraphs(previous, current);

    if (opts.json) {
      process.stdout.write(JSON.stringify(diff, null, 2) + "\n");
    } else {
      if (isDiffEmpty(diff)) {
        console.log("No architectural changes detected.");
      } else {
        console.log(formatDiffForAgent(diff));
      }
    }
  });

program
  .command("hook")
  .description("Pre-commit hook mode: output agent-readable diff summary")
  .argument("[dir]", "Directory to scan", ".")
  .option(
    "-r, --ref <ref>",
    "Git ref to compare against (default: HEAD)",
    "HEAD"
  )
  .action(async (dir: string, opts: { ref: string }) => {
    const [current, previous] = await Promise.all([
      scanDirectory(dir),
      scanFromGit(dir, opts.ref),
    ]);

    const diff = diffGraphs(previous, current);

    if (!isDiffEmpty(diff)) {
      process.stdout.write(formatDiffForAgent(diff) + "\n");
    }
  });

program.parse();
