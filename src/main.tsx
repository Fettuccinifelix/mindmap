import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  NodeResizer,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type NodeProps,
  type Connection,
} from "@xyflow/react";
import { get, set } from "idb-keyval";
import {
  Plus,
  Camera,
  Download,
  Upload,
  Undo2,
  Redo2,
  Trash2,
  X,
  ArrowUpRight,
  Layers,
  Check,
  StickyNote,
  MousePointer2,
  ImagePlus,
} from "lucide-react";
import {
  colors,
  emptyBoard,
  note,
  uid,
  importNotes,
  parseBackup,
  type Board,
  type Note,
  type Color,
  type Detection,
} from "./model";
import "@xyflow/react/dist/style.css";
import "./style.css";
const NoteContext = createContext<
  (id: string, patch: Partial<Note["data"]>) => void
>(() => {});
function NoteCard({ id, data, selected }: NodeProps<Note>) {
  const update = useContext(NoteContext);
  return (
    <div className={`note ${data.color} ${selected ? "selected" : ""}`}>
      <NodeResizer minWidth={160} minHeight={130} isVisible={selected} />
      <Handle type="target" position={Position.Top} id="in" />
      <div className="note-top">
        <span className="note-pin" />
        <span>NOTE</span>
      </div>
      <textarea
        className="nodrag nowheel"
        aria-label="Note text"
        placeholder="A thought worth keeping…"
        maxLength={10000}
        value={data.text}
        onChange={(e) => update(id, { text: e.target.value })}
      />
      <div className="note-bottom">
        <div className="swatches nodrag">
          {colors.map((c) => (
            <button
              key={c}
              aria-label={`Make note ${c}`}
              className={`swatch ${c} ${c === data.color ? "active" : ""}`}
              onClick={() => update(id, { color: c })}
            />
          ))}
        </div>
        <span>↗</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="out" />
    </div>
  );
}
const nodeTypes = { note: NoteCard };
const starter = () => {
  const b = emptyBoard("A little room for ideas");
  b.nodes = [
    note("Every good idea starts\nwith a little space.", 80, 70, "yellow"),
    note(
      "What’s on your mind?\n\nAdd a note. Make a connection.\nSee where it takes you.",
      410,
      180,
      "blue",
    ),
    note(
      "Your wall, reimagined.\n\nBring your real sticky notes\nhere with a photo.",
      90,
      350,
      "pink",
    ),
  ];
  b.edges = [
    {
      id: uid(),
      source: b.nodes[0].id,
      target: b.nodes[1].id,
      sourceHandle: "out",
      targetHandle: "in",
    },
  ];
  return b;
};
function App() {
  const [boards, setBoards] = useState<Board[]>([]),
    [active, setActive] = useState(""),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [photo, setPhoto] = useState<"new" | "current" | null>(null);
  const undo = useRef<Board[]>([]),
    redo = useRef<Board[]>([]),
    gesture = useRef(false),
    typing = useRef<{ id: string; time: number } | null>(null);
  const [, tick] = useState(0);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const backup = useRef<HTMLInputElement>(null);
  const board = boards.find((b) => b.id === active);
  const boardRef = useRef(board);
  boardRef.current = board;
  useEffect(() => {
    get("threadboard-v1")
      .then((v) => {
        const list = v?.boards?.length ? v.boards : [starter()];
        setBoards(list);
        setActive(
          v?.active && list.some((b: Board) => b.id === v.active)
            ? v.active
            : list[0].id,
        );
        setReady(true);
      })
      .catch(() =>
        setError(
          "Browser storage could not be opened. Enable site storage and reload before editing.",
        ),
      );
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaved(false);
    const timer = setTimeout(() => {
      set("threadboard-v1", { boards, active })
        .then(() => setSaved(true))
        .catch(() =>
          setError(
            "Could not save: browser storage may be full. Export a backup now.",
          ),
        );
    }, 350);
    return () => clearTimeout(timer);
  }, [boards, active, ready]);
  const checkpoint = () => {
    if (boardRef.current) {
      undo.current = [
        ...undo.current.slice(-79),
        structuredClone(boardRef.current),
      ];
      redo.current = [];
      tick((n) => n + 1);
    }
  };
  const commit = (next: Board, history = true) => {
    if (history) checkpoint();
    setBoards((bs) =>
      bs.map((b) =>
        b.id === next.id ? { ...next, updatedAt: Date.now() } : b,
      ),
    );
  };
  const switchBoard = (id: string) => {
    setActive(id);
    undo.current = [];
    redo.current = [];
    typing.current = null;
    setTimeout(() => fitView({ padding: 0.3 }), 80);
  };
  const addBoard = (b = emptyBoard()) => {
    setBoards((bs) => [...bs, b]);
    switchBoard(b.id);
  };
  const travel = (direction: "undo" | "redo") => {
    if (!board) return;
    const from = direction === "undo" ? undo : redo,
      to = direction === "undo" ? redo : undo;
    const previous = from.current.pop();
    if (previous) {
      to.current.push(structuredClone(board));
      commit(previous, false);
      typing.current = null;
      tick((n) => n + 1);
    }
  };
  const removeSelected = () => {
    if (!board) return;
    const ids = new Set(board.nodes.filter((n) => n.selected).map((n) => n.id));
    commit({
      ...board,
      nodes: board.nodes.filter((n) => !ids.has(n.id)),
      edges: board.edges.filter(
        (e) => !e.selected && !ids.has(e.source) && !ids.has(e.target),
      ),
    });
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (photo) return;
      if ((e.target as HTMLElement).closest("textarea,input,[contenteditable]"))
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        travel(e.shiftKey ? "redo" : "undo");
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const updateNote = useCallback((id: string, patch: Partial<Note["data"]>) => {
    const b = boardRef.current;
    if (!b) return;
    const now = Date.now();
    if (
      !typing.current ||
      typing.current.id !== id ||
      now - typing.current.time > 800 ||
      patch.color
    )
      checkpoint();
    typing.current = { id, time: now };
    commit(
      {
        ...b,
        nodes: b.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      },
      false,
    );
  }, []);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, boards }, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "threadboard-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  if (!ready || !board)
    return <div className="loading">{error || "Opening your space…"}</div>;
  return (
    <div className="app">
      <aside>
        <a className="brand" href="#" aria-label="Threadboard home">
          <span className="brand-icon">
            <Layers size={22} />
          </span>
          threadboard<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          YOUR WORKSPACE <span>LOCAL</span>
        </div>
        <div className="board-heading">
          Boards{" "}
          <button
            title="New board"
            aria-label="New board"
            onClick={() => addBoard()}
          >
            <Plus size={17} />
          </button>
        </div>
        <nav>
          {boards.map((b) => (
            <button
              className={`board-link ${b.id === active ? "active" : ""}`}
              key={b.id}
              onClick={() => switchBoard(b.id)}
            >
              <span className="board-symbol">
                <Layers size={16} />
              </span>
              <span>{b.name}</span>
              <small>{b.nodes.length}</small>
            </button>
          ))}
        </nav>
        <button className="new-board" onClick={() => addBoard()}>
          <Plus size={16} /> New board
        </button>
        <div className="sidebar-bottom">
          <div className="photo-promo">
            <span className="promo-icon">
              <Camera size={20} />
            </span>
            <h3>From wall to workspace.</h3>
            <p>
              Turn your real-life sticky notes into a board of possibilities.
            </p>
            <button onClick={() => setPhoto("new")}>
              Create board from photo <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="backup-tools">
            <button onClick={download}>
              <Download size={15} /> Export backup
            </button>
            <button onClick={() => backup.current?.click()}>
              <Upload size={15} /> Import backup
            </button>
          </div>
          <div className="local-status">
            <span /> Saved on this device
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumbs">
            My workspace <span>/</span> <strong>Board</strong>
          </div>
          <div className="header-right">
            <span className="save-status">
              <Check size={14} />
              {saved ? "All changes saved" : "Saving…"}
            </span>
            <span className="avatar">ME</span>
          </div>
        </header>
        <section className="board-title">
          <div>
            <div className="eyebrow">A SPACE TO CONNECT THE DOTS</div>
            <input
              aria-label="Board name"
              maxLength={200}
              value={board.name}
              onChange={(e) => commit({ ...board, name: e.target.value })}
            />
            <p>
              {board.nodes.length} notes <span>·</span> {board.edges.length}{" "}
              connections <span>·</span> A little chaos, a lot of possibility.
            </p>
          </div>
          <button className="outline" onClick={() => setPhoto("current")}>
            <Camera size={17} /> Import photo
          </button>
        </section>
        <div className="canvas">
          <div className="canvas-badge">
            <span /> YOUR IDEAS LIVE HERE
          </div>
          <NoteContext.Provider value={updateNote}>
            <ReactFlow
              nodes={board.nodes}
              edges={board.edges}
              nodeTypes={nodeTypes}
              onNodesChange={(changes) => {
                if (
                  changes.some(
                    (c) => c.type === "dimensions" && c.resizing === true,
                  ) &&
                  !gesture.current
                ) {
                  checkpoint();
                  gesture.current = true;
                }
                if (
                  changes.some(
                    (c) => c.type === "dimensions" && c.resizing === false,
                  )
                )
                  gesture.current = false;
                if (changes.some((c) => c.type === "remove")) checkpoint();
                setBoards((bs) =>
                  bs.map((b) =>
                    b.id === active
                      ? { ...b, nodes: applyNodeChanges(changes, b.nodes) }
                      : b,
                  ),
                );
              }}
              onEdgesChange={(changes) => {
                if (changes.some((c) => c.type === "remove")) checkpoint();
                setBoards((bs) =>
                  bs.map((b) =>
                    b.id === active
                      ? { ...b, edges: applyEdgeChanges(changes, b.edges) }
                      : b,
                  ),
                );
              }}
              onNodeDragStart={() => {
                if (!gesture.current) {
                  checkpoint();
                  gesture.current = true;
                }
              }}
              onNodeDragStop={() => {
                gesture.current = false;
              }}
              onConnect={(c: Connection) => {
                if (
                  c.source === c.target ||
                  board.edges.some(
                    (e) =>
                      (e.source === c.source && e.target === c.target) ||
                      (e.source === c.target && e.target === c.source),
                  )
                )
                  return;
                commit({
                  ...board,
                  edges: [...board.edges, { ...c, id: uid() }],
                });
              }}
              onNodesDelete={(nodes) => {
                const ids = new Set(nodes.map((n) => n.id));
                commit(
                  {
                    ...board,
                    nodes: board.nodes.filter((n) => !ids.has(n.id)),
                    edges: board.edges.filter(
                      (e) => !ids.has(e.source) && !ids.has(e.target),
                    ),
                  },
                  false,
                );
              }}
              deleteKeyCode={null}
              fitView
              fitViewOptions={{ padding: 0.35 }}
              minZoom={0.15}
              maxZoom={2}
              defaultEdgeOptions={{
                type: "default",
                style: { stroke: "#7a8d83", strokeWidth: 2 },
              }}
              proOptions={{ hideAttribution: false }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1}
                color="#d4d8d1"
              />
              <Controls showInteractive={false} />
            </ReactFlow>
          </NoteContext.Provider>
          <div className="floating-tools">
            <button
              className="add-note"
              onClick={() => {
                const p = screenToFlowPosition({
                  x: window.innerWidth * 0.58,
                  y: window.innerHeight * 0.48,
                });
                commit({
                  ...board,
                  nodes: [...board.nodes, note("", p.x, p.y)],
                });
              }}
            >
              <Plus size={18} /> Add note
            </button>
            <span className="tool-divider" />
            <button
              aria-label="Undo"
              title="Undo"
              disabled={!undo.current.length}
              onClick={() => travel("undo")}
            >
              <Undo2 size={18} />
            </button>
            <button
              aria-label="Redo"
              title="Redo"
              disabled={!redo.current.length}
              onClick={() => travel("redo")}
            >
              <Redo2 size={18} />
            </button>
            <button
              aria-label="Delete selected"
              title="Delete selected notes or strings"
              onClick={removeSelected}
            >
              <Trash2 size={17} />
            </button>
          </div>
          <div className="canvas-hint">
            <MousePointer2 size={13} /> Drag to arrange <span>·</span> Connect
            the dots to make a string
          </div>
          {!board.nodes.length && (
            <div className="empty">
              <StickyNote size={32} />
              <h2>Make room for a thought.</h2>
              <p>Add your first note, or bring your wall in with a photo.</p>
            </div>
          )}
        </div>
        <footer>
          <span>
            <span className="footer-dot" /> A place for your next big idea.
          </span>
          <span>PRIVATE BY DEFAULT. YOURS TO EXPLORE.</span>
        </footer>
      </main>
      <input
        ref={backup}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={async (e) => {
          try {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 20 * 1024 * 1024)
              throw Error("Backup must be 20 MB or smaller.");
            const imported = parseBackup(JSON.parse(await file.text()));
            setBoards((bs) => [...bs, ...imported]);
            switchBoard(imported[0].id);
          } catch (err) {
            setError((err as Error).message);
          }
          e.target.value = "";
        }}
      />
      {error && (
        <div className="toast" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {photo && (
        <PhotoImport
          mode={photo}
          onClose={() => setPhoto(null)}
          onImport={(notes, ratio) => {
            if (photo === "new") {
              const blank = emptyBoard("From my wall");
              addBoard(importNotes(blank, notes, ratio));
              undo.current = [blank];
              tick((n) => n + 1);
            } else {
              commit(importNotes(board, notes, ratio));
              setTimeout(() => fitView({ padding: 0.25 }), 100);
            }
            setPhoto(null);
          }}
        />
      )}
    </div>
  );
}
async function preparePhoto(
  file: File,
): Promise<{ url: string; blob: Blob; ratio: number }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error(
      "Please choose a JPEG, PNG, or WebP photo. Convert HEIC photos first.",
    );
  if (file.size > 10 * 1024 * 1024)
    throw Error("Photo must be 10 MB or smaller.");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("Unable to prepare photo."))),
      "image/jpeg",
      0.85,
    ),
  );
  return {
    url: URL.createObjectURL(blob),
    blob,
    ratio: canvas.width / canvas.height,
  };
}
function PhotoImport({
  mode,
  onClose,
  onImport,
}: {
  mode: "new" | "current";
  onClose: () => void;
  onImport: (notes: Detection[], ratio: number) => void;
}) {
  const [image, setImage] = useState<{
      url: string;
      blob: Blob;
      ratio: number;
    } | null>(null),
    [notes, setNotes] = useState<Detection[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(0),
    [placing, setPlacing] = useState(false);
  const [config, setConfig] = useState<{
    provider: string;
    model: string;
    local: boolean;
    timeoutMs: number;
  } | null>(null);
  useEffect(() => {
    let mounted = true;
    fetch("/api/photo-config")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((c) => {
        if (mounted) setConfig(c);
      })
      .catch(() => {
        if (mounted)
          setError(
            "Unable to read photo-analysis settings. Check that the server is running, then reopen this dialog.",
          );
      });
    return () => {
      mounted = false;
    };
  }, []);
  const controller = useRef<AbortController | null>(null),
    fileRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );
  useEffect(() => () => controller.current?.abort(), []);
  const analyze = async () => {
    if (!image) return;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    const timeout = setTimeout(
      () => controller.current?.abort(),
      (config?.timeoutMs ?? 180000) + 15000,
    );
    try {
      const form = new FormData();
      form.append("image", image.blob, "wall.jpg");
      const r = await fetch("/api/analyze-photo", {
        method: "POST",
        body: form,
        signal: controller.current.signal,
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Analysis failed. Try again.");
      setNotes(data.notes);
      setSelected(0);
    } catch (e) {
      setError(
        (e as Error).name === "AbortError"
          ? "Analysis stopped or timed out. Please retry."
          : (e as Error).message,
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  };
  const patch = (i: number, p: Partial<Detection>) =>
    setNotes((ns) => ns!.map((n, j) => (j === i ? { ...n, ...p } : n)));
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-title"
      >
        <div className="modal-heading">
          <div>
            <div className="eyebrow">BRING THE OUTSIDE IN</div>
            <h2 id="photo-title">
              {notes
                ? "A few notes, a fresh perspective."
                : "Your wall. A new perspective."}
            </h2>
          </div>
          <button aria-label="Close photo import" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <p className="modal-intro">
          {notes
            ? "Review the text and colors. Remove extras or click the photo to add a missed note."
            : `Turn a photo of sticky notes into ${mode === "new" ? "a new board" : "notes on this board"}. You’ll review everything first.`}
        </p>
        <div className="import-body">
          <div className="photo-column">
            {image ? (
              <div
                className={`photo-preview ${placing ? "placing" : ""}`}
                onClick={(e) => {
                  if (!placing || !notes) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.min(
                      0.85,
                      Math.max(0, (e.clientX - rect.left) / rect.width),
                    ),
                    y = Math.min(
                      0.85,
                      Math.max(0, (e.clientY - rect.top) / rect.height),
                    );
                  setNotes([
                    ...notes,
                    {
                      text: "",
                      color: "yellow",
                      x,
                      y,
                      width: 0.15,
                      height: 0.15,
                    },
                  ]);
                  setSelected(notes.length);
                  setPlacing(false);
                }}
              >
                <img src={image.url} alt="Your wall of sticky notes" />
                {notes?.map((n, i) => (
                  <button
                    key={i}
                    className={`detection ${selected === i ? "chosen" : ""}`}
                    aria-label={`Select detected note ${i + 1}`}
                    style={{
                      left: `${n.x * 100}%`,
                      top: `${n.y * 100}%`,
                      width: `${n.width * 100}%`,
                      height: `${n.height * 100}%`,
                    }}
                    onClick={(e) => {
                      if (!placing) {
                        e.stopPropagation();
                        setSelected(i);
                      }
                    }}
                  >
                    <span>{i + 1}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                className="upload-zone"
                onClick={() => fileRef.current?.click()}
              >
                <span>
                  <ImagePlus size={34} />
                </span>
                <h3>A real wall. Endless possibilities.</h3>
                <p>Choose a photo of your sticky notes</p>
                <strong>
                  Choose photo <ArrowUpRight size={16} />
                </strong>
                <small>JPEG, PNG or WebP · up to 10 MB</small>
              </button>
            )}
            <input
              ref={fileRef}
              aria-label="Wall photo"
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError("");
                try {
                  const prepared = await preparePhoto(file);
                  setImage(prepared);
                  setNotes(null);
                } catch (err) {
                  setError((err as Error).message);
                }
                e.target.value = "";
              }}
            />
            {image && !busy && (
              <button
                className="text-button"
                onClick={() => fileRef.current?.click()}
              >
                Choose another photo
              </button>
            )}
            {!notes && (
              <div className="privacy-note">
                <Layers size={16} />
                <p>
                  {config
                    ? config.provider === "ollama"
                      ? config.local
                        ? "Analyzed on your computer with Ollama. No API key or cloud upload. "
                        : "Sent to your configured Ollama server only when you click Analyze. "
                      : "Sent to the cloud model only when you click Analyze. "
                    : "Loading analysis settings. "}
                  The photo is never saved to your board or the app server.
                  {config && ` Model: ${config.model}.`}
                </p>
              </div>
            )}
          </div>
          {notes && (
            <div className="review-list">
              <div className="review-heading">
                <strong>{notes.length} notes found</strong>
                <button
                  className="text-button"
                  onClick={() => setPlacing((p) => !p)}
                >
                  {placing ? "Cancel placement" : "+ Add missed note"}
                </button>
              </div>
              {placing && (
                <p className="placement-tip">
                  Click where the missing note belongs in the photo.
                </p>
              )}
              {!notes.length && (
                <p>
                  No notes yet. Add a missed note manually, or try a clearer
                  photo.
                </p>
              )}
              {notes.map((n, i) => (
                <div
                  key={i}
                  className={`review-card ${selected === i ? "chosen" : ""}`}
                  onClick={() => setSelected(i)}
                >
                  <div>
                    <span className="review-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <button
                      aria-label={`Remove detected note ${i + 1}`}
                      onClick={() => setNotes(notes.filter((_, j) => i !== j))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <textarea
                    aria-label={`Detected note ${i + 1} text`}
                    maxLength={10000}
                    placeholder="Unreadable? Add the text here…"
                    value={n.text}
                    onChange={(e) => patch(i, { text: e.target.value })}
                  />
                  <div className="swatches">
                    {colors.map((c) => (
                      <button
                        aria-label={`Detected note ${i + 1} ${c}`}
                        key={c}
                        className={`swatch ${c} ${n.color === c ? "active" : ""}`}
                        onClick={() => patch(i, { color: c })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && (
          <div className="import-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <span>
            {notes
              ? "Your photo’s layout comes along, too."
              : "A little clarity goes a long way. Use a well-lit, straight-on photo."}
          </span>
          <div>
            <button className="outline" onClick={onClose}>
              Cancel
            </button>
            {notes ? (
              <button
                className="primary"
                disabled={!notes.length}
                onClick={() => onImport(notes, image!.ratio)}
              >
                Import {notes.length} notes <ArrowUpRight size={16} />
              </button>
            ) : (
              <button
                className="primary"
                disabled={!image || busy || !config}
                onClick={analyze}
              >
                {busy ? "Reading your wall…" : "Analyze photo"}{" "}
                <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </React.StrictMode>,
);
