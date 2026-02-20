import type { GraphDiff } from "./diff.js";

export function formatDiffForAgent(diff: GraphDiff): string {
  const lines: string[] = [];

  lines.push("## Architecture Changes");
  lines.push("");

  if (diff.addedNodes.length > 0) {
    lines.push("### New types");
    for (const node of diff.addedNodes) {
      lines.push(`+ ${node.name} (${node.kind}) in ${node.file}`);
    }
    lines.push("");
  }

  if (diff.removedNodes.length > 0) {
    lines.push("### Removed types");
    for (const node of diff.removedNodes) {
      lines.push(`- ${node.name} (${node.kind}) was in ${node.file}`);
    }
    lines.push("");
  }

  if (diff.addedEdges.length > 0) {
    lines.push("### New dependencies");
    for (const edge of diff.addedEdges) {
      lines.push(`+ ${edge.from} -> ${edge.to} (${edge.kind})`);
    }
    lines.push("");
  }

  if (diff.removedEdges.length > 0) {
    lines.push("### Removed dependencies");
    for (const edge of diff.removedEdges) {
      lines.push(`- ${edge.from} -> ${edge.to} (${edge.kind})`);
    }
    lines.push("");
  }

  const totalTypes = diff.addedNodes.length + diff.removedNodes.length;
  const totalEdges = diff.addedEdges.length + diff.removedEdges.length;

  lines.push("### Summary");
  const parts: string[] = [];
  if (diff.addedNodes.length > 0)
    parts.push(`${diff.addedNodes.length} type(s) added`);
  if (diff.removedNodes.length > 0)
    parts.push(`${diff.removedNodes.length} type(s) removed`);
  if (diff.addedEdges.length > 0)
    parts.push(`${diff.addedEdges.length} dependency(ies) added`);
  if (diff.removedEdges.length > 0)
    parts.push(`${diff.removedEdges.length} dependency(ies) removed`);

  if (parts.length === 0) {
    lines.push("No architectural changes detected.");
  } else {
    lines.push(parts.join(". ") + ".");
  }

  return lines.join("\n");
}
