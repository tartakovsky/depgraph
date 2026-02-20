import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { scanDirectory, scanFromGit } from "./parse.js";
import { serializeGraph } from "./graph.js";
import { diffGraphs, isDiffEmpty } from "./diff.js";
import { formatScanSummary, formatDiffSummary } from "./format.js";

const program = new Command();

program
  .name("depgraph")
  .description("Tree-sitter class dependency graph extractor")
  .version("0.3.0");

program
  .command("scan")
  .description("Scan directory and output dependency graph")
  .argument("<dir>", "Directory to scan")
  .option("-o, --output <file>", "Write JSON output to file")
  .option("--json", "Output raw JSON instead of markdown summary")
  .option(
    "-l, --languages <langs>",
    "Comma-separated language filter (ts, java, swift, go)",
    (val: string) => val.split(",")
  )
  .action(async (dir: string, opts: { output?: string; json?: boolean; languages?: string[] }) => {
    const graph = await scanDirectory(dir, { languages: opts.languages });

    if (opts.output) {
      const json = serializeGraph(graph);
      writeFileSync(opts.output, json, "utf-8");
      console.error(
        `Wrote graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges → ${opts.output}`
      );
    } else if (opts.json) {
      process.stdout.write(serializeGraph(graph) + "\n");
    } else {
      console.log(formatScanSummary(graph));
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
  .option("--json", "Output raw JSON diff instead of markdown")
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
        console.log(formatDiffSummary(diff, previous, current));
      }
    }
  });

program
  .command("hook")
  .description("Git hook mode: output agent-readable diff summary")
  .argument("[dir]", "Directory to scan", ".")
  .option(
    "-r, --ref <ref>",
    "Git ref to compare against (default: HEAD)",
    "HEAD"
  )
  .option("--json", "Output raw JSON diff")
  .action(async (dir: string, opts: { ref: string; json?: boolean }) => {
    const [current, previous] = await Promise.all([
      scanDirectory(dir),
      scanFromGit(dir, opts.ref),
    ]);

    const diff = diffGraphs(previous, current);

    if (isDiffEmpty(diff)) return;

    if (opts.json) {
      process.stdout.write(JSON.stringify(diff, null, 2) + "\n");
    } else {
      process.stdout.write(formatDiffSummary(diff, previous, current) + "\n");
    }
  });

program.parse();
