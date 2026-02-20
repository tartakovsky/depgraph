import type { DependencyGraph, GraphNode, GraphEdge } from "./graph.js";
import type { GraphDiff } from "./diff.js";

interface TypeStats {
  name: string;
  kind: string;
  file: string;
  outgoing: number;
  incoming: number;
}

function computeTypeStats(graph: DependencyGraph): Map<string, TypeStats> {
  const stats = new Map<string, TypeStats>();
  for (const node of graph.nodes) {
    stats.set(node.name, {
      name: node.name,
      kind: node.kind,
      file: node.file,
      outgoing: 0,
      incoming: 0,
    });
  }
  for (const edge of graph.edges) {
    const from = stats.get(edge.from);
    if (from) from.outgoing++;
    const to = stats.get(edge.to);
    if (to) to.incoming++;
  }
  return stats;
}

function countByKind(items: { kind: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.kind] = (counts[item.kind] || 0) + 1;
  }
  return counts;
}

function topN<T>(items: T[], key: (item: T) => number, n: number): T[] {
  return [...items].sort((a, b) => key(b) - key(a)).slice(0, n);
}

function dirFromFile(file: string): string {
  const parts = file.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
}

export function formatScanSummary(graph: DependencyGraph): string {
  const lines: string[] = [];
  const stats = computeTypeStats(graph);
  const allStats = Array.from(stats.values());

  // Header
  const files = new Set(graph.nodes.map((n) => n.file));
  lines.push("## Dependency Graph Summary");
  lines.push("");
  lines.push(
    `**${graph.nodes.length}** types across **${files.size}** files, **${graph.edges.length}** dependencies`
  );
  lines.push("");

  // Type breakdown
  const nodeKinds = countByKind(graph.nodes);
  const pluralize = (word: string, count: number) => {
    if (count <= 1) return word;
    if (word.endsWith("s")) return word + "es";
    return word + "s";
  };
  const kindParts = Object.entries(nodeKinds)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${pluralize(k, v)}`);
  lines.push("**Types:** " + kindParts.join(", "));

  // Edge breakdown
  const edgeKinds = countByKind(graph.edges);
  const edgeParts = Object.entries(edgeKinds)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k}`);
  lines.push("**Edges:** " + edgeParts.join(", "));
  lines.push("");

  // Top hubs by total connections (outgoing + incoming)
  const hubs = topN(allStats, (s) => s.outgoing + s.incoming, 10).filter(
    (s) => s.outgoing + s.incoming > 0
  );
  if (hubs.length > 0) {
    lines.push("### Most connected types");
    lines.push("");
    for (const hub of hubs) {
      const total = hub.outgoing + hub.incoming;
      lines.push(
        `- **${hub.name}** (${hub.kind}) — ${total} connections (${hub.outgoing} out, ${hub.incoming} in) — \`${hub.file}\``
      );
    }
    lines.push("");
  }

  // Most depended-on types (highest incoming)
  const depTargets = topN(allStats, (s) => s.incoming, 5).filter(
    (s) => s.incoming > 1
  );
  if (depTargets.length > 0) {
    lines.push("### Most depended-on types");
    lines.push("");
    for (const t of depTargets) {
      const dependents = graph.edges
        .filter((e) => e.to === t.name)
        .map((e) => e.from);
      const uniqueDeps = [...new Set(dependents)];
      lines.push(
        `- **${t.name}** — used by ${uniqueDeps.length} type${uniqueDeps.length > 1 ? "s" : ""}: ${uniqueDeps.join(", ")}`
      );
    }
    lines.push("");
  }

  // Directory breakdown
  const dirs = new Map<string, number>();
  for (const node of graph.nodes) {
    const dir = dirFromFile(node.file);
    dirs.set(dir, (dirs.get(dir) || 0) + 1);
  }
  if (dirs.size > 1) {
    const topDirs = topN(
      Array.from(dirs.entries()),
      ([, count]) => count,
      8
    );
    lines.push("### Type distribution");
    lines.push("");
    for (const [dir, count] of topDirs) {
      lines.push(`- \`${dir}/\` — ${count} type${count > 1 ? "s" : ""}`);
    }
    lines.push("");
  }

  // Orphans count
  const connected = new Set([
    ...graph.edges.map((e) => e.from),
    ...graph.edges.map((e) => e.to),
  ]);
  const orphanCount = graph.nodes.filter((n) => !connected.has(n.name)).length;
  if (orphanCount > 0) {
    lines.push(
      `*${orphanCount} type${orphanCount > 1 ? "s" : ""} with no dependencies (standalone).*`
    );
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function formatDiffSummary(
  diff: GraphDiff,
  before: DependencyGraph,
  after: DependencyGraph
): string {
  const lines: string[] = [];
  const beforeStats = computeTypeStats(before);
  const afterStats = computeTypeStats(after);

  lines.push("## Architecture Changes");
  lines.push("");

  // Net stats
  const nodeDelta = after.nodes.length - before.nodes.length;
  const edgeDelta = after.edges.length - before.edges.length;
  const deltaStr = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  lines.push(
    `**Before:** ${before.nodes.length} types, ${before.edges.length} dependencies`
  );
  lines.push(
    `**After:** ${after.nodes.length} types, ${after.edges.length} dependencies`
  );
  lines.push(
    `**Delta:** ${deltaStr(nodeDelta)} types, ${deltaStr(edgeDelta)} dependencies`
  );
  lines.push("");

  // Added types
  if (diff.addedNodes.length > 0) {
    lines.push("### New types");
    lines.push("");
    for (const node of diff.addedNodes) {
      const stat = afterStats.get(node.name);
      const conns = stat ? stat.outgoing + stat.incoming : 0;
      lines.push(
        `+ **${node.name}** (${node.kind}) in \`${node.file}\` — ${conns} connection${conns !== 1 ? "s" : ""}`
      );
    }
    lines.push("");
  }

  // Removed types
  if (diff.removedNodes.length > 0) {
    lines.push("### Removed types");
    lines.push("");
    for (const node of diff.removedNodes) {
      lines.push(
        `- **${node.name}** (${node.kind}) was in \`${node.file}\``
      );
    }
    lines.push("");
  }

  // Added edges with context
  if (diff.addedEdges.length > 0) {
    lines.push("### New dependencies");
    lines.push("");
    for (const edge of diff.addedEdges) {
      const fromStat = afterStats.get(edge.from);
      const beforeFromStat = beforeStats.get(edge.from);
      let context = "";
      if (fromStat) {
        const now = fromStat.outgoing;
        const was = beforeFromStat ? beforeFromStat.outgoing : 0;
        if (was > 0) {
          context = ` — ${edge.from} now has ${now} outgoing deps (was ${was})`;
        }
      }
      lines.push(
        `+ ${edge.from} → ${edge.to} (${edge.kind})${context}`
      );
    }
    lines.push("");
  }

  // Removed edges
  if (diff.removedEdges.length > 0) {
    lines.push("### Removed dependencies");
    lines.push("");
    for (const edge of diff.removedEdges) {
      lines.push(`- ${edge.from} → ${edge.to} (${edge.kind})`);
    }
    lines.push("");
  }

  // Types with most coupling change
  const couplingChanges: { name: string; before: number; after: number }[] = [];
  const allNames = new Set([
    ...before.nodes.map((n) => n.name),
    ...after.nodes.map((n) => n.name),
  ]);
  for (const name of allNames) {
    const bStat = beforeStats.get(name);
    const aStat = afterStats.get(name);
    const bTotal = bStat ? bStat.outgoing + bStat.incoming : 0;
    const aTotal = aStat ? aStat.outgoing + aStat.incoming : 0;
    const delta = aTotal - bTotal;
    if (delta !== 0) {
      couplingChanges.push({ name, before: bTotal, after: aTotal });
    }
  }

  const bigChanges = couplingChanges
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))
    .slice(0, 5)
    .filter((c) => Math.abs(c.after - c.before) > 1);

  if (bigChanges.length > 0) {
    lines.push("### Coupling changes");
    lines.push("");
    for (const c of bigChanges) {
      const delta = c.after - c.before;
      lines.push(
        `- **${c.name}**: ${c.before} → ${c.after} connections (${deltaStr(delta)})`
      );
    }
    lines.push("");
  }

  // Summary line
  lines.push("### Summary");
  const parts: string[] = [];
  if (diff.addedNodes.length > 0)
    parts.push(`${diff.addedNodes.length} type${diff.addedNodes.length > 1 ? "s" : ""} added`);
  if (diff.removedNodes.length > 0)
    parts.push(`${diff.removedNodes.length} type${diff.removedNodes.length > 1 ? "s" : ""} removed`);
  if (diff.addedEdges.length > 0)
    parts.push(`${diff.addedEdges.length} dep${diff.addedEdges.length > 1 ? "s" : ""} added`);
  if (diff.removedEdges.length > 0)
    parts.push(`${diff.removedEdges.length} dep${diff.removedEdges.length > 1 ? "s" : ""} removed`);

  if (parts.length === 0) {
    lines.push("No architectural changes detected.");
  } else {
    lines.push(parts.join(", ") + `. Net coupling: ${deltaStr(edgeDelta)}.`);
  }

  return lines.join("\n").trimEnd();
}
