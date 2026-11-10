import type { Node, Edge } from "@xyflow/react";
export const colors = [
  "yellow",
  "pink",
  "blue",
  "green",
  "purple",
  "white",
] as const;
export type Color = (typeof colors)[number];
export type Note = Node<{ text: string; color: Color }, "note">;
export type Board = {
  id: string;
  name: string;
  nodes: Note[];
  edges: Edge[];
  updatedAt: number;
};
export type Detection = {
  text: string;
  color: Color;
  x: number;
  y: number;
  width: number;
  height: number;
};
export const uid = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
export const emptyBoard = (name = "Untitled board"): Board => ({
  id: uid(),
  name,
  nodes: [],
  edges: [],
  updatedAt: Date.now(),
});
export const note = (
  text = "",
  x = 0,
  y = 0,
  color: Color = "yellow",
): Note => ({
  id: uid(),
  type: "note",
  position: { x, y },
  data: { text, color },
  style: { width: 210, height: 170 },
});
export function importNotes(
  board: Board,
  notes: Detection[],
  ratio: number,
): Board {
  const offset = board.nodes.length
    ? Math.max(
        ...board.nodes.map((n) => n.position.x + Number(n.style?.width || 210)),
      ) + 100
    : 0;
  const width = 1000,
    height = width / ratio;
  return {
    ...board,
    nodes: [
      ...board.nodes,
      ...notes.map((n) => ({
        ...note(n.text, offset + n.x * width, n.y * height, n.color),
        style: {
          width: Math.max(160, n.width * width),
          height: Math.max(130, n.height * height),
        },
      })),
    ],
  };
}
export function parseBackup(raw: unknown): Board[] {
  const data = raw as { version: number; boards: Board[] };
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.boards) ||
    !data.boards.length ||
    data.boards.length > 100
  )
    throw Error("Invalid backup: expected a version 1 Threadboard file.");
  const ids = new Set();
  for (const b of data.boards) {
    if (
      !b ||
      typeof b.id !== "string" ||
      ids.has(b.id) ||
      typeof b.name !== "string" ||
      b.name.length > 200 ||
      !finite(b.updatedAt) ||
      !Array.isArray(b.nodes) ||
      b.nodes.length > 5000 ||
      !Array.isArray(b.edges) ||
      b.edges.length > 10000
    )
      throw Error("Invalid board in backup.");
    ids.add(b.id);
    const notes = new Set();
    for (const n of b.nodes) {
      if (
        !n ||
        typeof n.id !== "string" ||
        notes.has(n.id) ||
        n.type !== "note" ||
        !finite(n.position?.x) ||
        !finite(n.position?.y) ||
        typeof n.data?.text !== "string" ||
        n.data.text.length > 10000 ||
        !colors.includes(n.data.color) ||
        !finite(n.style?.width) ||
        !finite(n.style?.height) ||
        Number(n.style?.width) < 100 ||
        Number(n.style?.height) < 80
      )
        throw Error("Invalid note in backup.");
      notes.add(n.id);
    }
    const edges = new Set();
    for (const e of b.edges) {
      if (
        !e ||
        typeof e.id !== "string" ||
        edges.has(e.id) ||
        !notes.has(e.source) ||
        !notes.has(e.target)
      )
        throw Error("Invalid connection in backup.");
      edges.add(e.id);
    }
  }
  // Reconstruct allowed fields only; backup files cannot inject React Flow options or styles.
  return data.boards.map((b) => ({
    ...emptyBoard(b.name),
    nodes: b.nodes.map((n) => ({
      id: n.id,
      type: "note",
      position: { x: n.position.x, y: n.position.y },
      data: { text: n.data.text, color: n.data.color },
      style: { width: Number(n.style!.width), height: Number(n.style!.height) },
    })),
    edges: b.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  }));
}
