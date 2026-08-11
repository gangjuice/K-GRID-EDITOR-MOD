import React, { useState, useRef, useCallback } from "react";
import { Plus, Trash2, Link2, Download, Upload, ZoomIn, ZoomOut, Move, MousePointer2 } from "lucide-react";

// ---------- 단자 정의 (노드 타입별) ----------
// switch: 1~4번 단자가 다이아몬드로 배치 (원본 도면과 동일)
// pair_sl: S(상단)/L(하단) 2단자
// 그 외(전원/변압기/수용가): 단자 없음 -> 노드 중심이 단일 연결점
const SWITCH_TERMINALS = [
  { key: 1, x: 0, y: -11, label: "1" },
  { key: 2, x: -11, y: 0, label: "2" },
  { key: 3, x: 0, y: 11, label: "3" },
  { key: 4, x: 11, y: 0, label: "4" },
];
const PAIR_SL_TERMINALS = [
  { key: "S", x: 0, y: -9, label: "S" },
  { key: "L", x: 0, y: 9, label: "L" },
];
const getTerminalDefs = (type) => {
  if (type === "switch") return SWITCH_TERMINALS;
  if (type === "pair_sl") return PAIR_SL_TERMINALS;
  return null; // 단자 없음 = 중심 단일 연결점
};

// ---------- 샘플 데이터 (실제 추출 결과 일부를 정제 + 단자별 연결로 구성) ----------
const SAMPLE = {
  meta: { title: "동평택/덕풍", source: "ADMS 단선도", date: "2025-04-15" },
  nodes: [
    { id: "덕풍CB", type: "source", position: { x: 80, y: 300 } },
    { id: "고덕S3301", type: "switch", state: [1, 0, 1, 0], specs: ["CNCV(325)"], distance_km: 0.240, position: { x: 260, y: 300 } },
    { id: "고덕33301", type: "switch", state: [0, 1, 0, 1], specs: ["CNCV(400)"], distance_km: 1.302, position: { x: 420, y: 300 } },
    { id: "고덕S2203", type: "switch", state: [1, 0, 1, 0], specs: ["CNCV(325)", "CNCV(325)"], distance_km: 0.100, position: { x: 420, y: 120 } },
    { id: "고덕T2201", type: "pair_sl", specs: ["CNCV(325)"], distance_km: 0.100, position: { x: 420, y: 200 } },
    { id: "고덕S3403-2", type: "transformer", capacity_kva: 700, specs: ["TR-CNCE-W/AL(95)"], distance_km: 0.130, position: { x: 620, y: 120 } },
    { id: "비에스에듀타운", type: "customer", capacity_kva: 700, position: { x: 780, y: 120 } },
    { id: "고덕S3403-4", type: "transformer", capacity_kva: 850, specs: ["CNCV-W(100)"], distance_km: 0.140, position: { x: 620, y: 200 } },
    { id: "해솔디앤씨", type: "customer", capacity_kva: 850, position: { x: 780, y: 200 } },
    { id: "고덕33403-1", type: "switch", state: [1, 1, 0, 0], specs: ["CNCV(100)"], distance_km: 0.010, position: { x: 620, y: 300 } },
  ],
  edges: [
    { id: "e1", from: { node: "덕풍CB", terminal: null }, to: { node: "고덕S3301", terminal: 2 }, cable: "CNCV(325)", distance_km: 0.240, style: "solid" },
    { id: "e2", from: { node: "고덕S3301", terminal: 4 }, to: { node: "고덕33301", terminal: 2 }, cable: "CNCV(400)", distance_km: 1.302, style: "solid" },
    { id: "e3", from: { node: "고덕33301", terminal: 1 }, to: { node: "고덕T2201", terminal: "L" }, cable: "CNCV(325)", distance_km: 0.100, style: "solid" },
    { id: "e4", from: { node: "고덕T2201", terminal: "S" }, to: { node: "고덕S2203", terminal: 3 }, cable: "CNCV(325)", distance_km: 0.100, style: "solid" },
    { id: "e5", from: { node: "고덕S2203", terminal: 4 }, to: { node: "고덕S3403-2", terminal: null }, cable: "TR-CNCE-W/AL(95)", distance_km: 0.130, style: "solid" },
    { id: "e6", from: { node: "고덕S3403-2", terminal: null }, to: { node: "비에스에듀타운", terminal: null }, cable: "CNCV(325)", distance_km: 0.100, style: "solid" },
    { id: "e7", from: { node: "고덕S2203", terminal: 2 }, to: { node: "고덕S3403-4", terminal: null }, cable: "CNCV-W(100)", distance_km: 0.140, style: "solid" },
    { id: "e8", from: { node: "고덕S3403-4", terminal: null }, to: { node: "해솔디앤씨", terminal: null }, cable: "CNCV(100)", distance_km: 0.000, style: "solid" },
    { id: "e9", from: { node: "고덕33301", terminal: 4 }, to: { node: "고덕33403-1", terminal: 2 }, cable: "CNCV(100)", distance_km: 0.010, style: "solid" },
  ],
};

const TYPE_META = {
  source: { label: "전원(CB)", color: "#e34a4a" },
  switch: { label: "개폐기", color: "#e34a4a" },
  pair_sl: { label: "S/L", color: "#e34a4a" },
  transformer: { label: "변압기", color: "#8b5cf6" },
  customer: { label: "수용가", color: "#3fa864" },
};

let uid = 100;
const nextId = () => `node-${uid++}`;

// 구버전(문자열 from/to) JSON 호환: 불러오기 시 {node, terminal:null} 형태로 정규화
const normalizeRef = (ref) => (typeof ref === "string" ? { node: ref, terminal: null } : ref);
const normalizeData = (d) => ({
  ...d,
  edges: (d.edges || []).map((e) => ({ ...e, from: normalizeRef(e.from), to: normalizeRef(e.to) })),
});

export default function GyetongdoEditor() {
  const [data, setData] = useState(SAMPLE);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [mode, setMode] = useState("select"); // select | connect
  const [connectFrom, setConnectFrom] = useState(null); // {node, terminal}
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null);
  const [panning, setPanning] = useState(null);
  const svgRef = useRef(null);
  const fileInputRef = useRef(null);

  const selectedNode = data.nodes.find((n) => n.id === selectedId);
  const selectedEdge = data.edges.find((e) => e.id === selectedEdgeId);

  const screenToWorld = useCallback(
    (sx, sy) => {
      const rect = svgRef.current.getBoundingClientRect();
      return { x: (sx - rect.left - pan.x) / zoom, y: (sy - rect.top - pan.y) / zoom };
    },
    [pan, zoom]
  );

  const sameRef = (a, b) => a && b && a.node === b.node && a.terminal === b.terminal;

  const addEdge = (from, to) => {
    if (sameRef(from, to)) return; // 자기 자신 단자로 연결 방지
    const newEdge = { id: `e-${uid++}`, from, to, cable: "CNCV(100)", distance_km: 0, style: "solid" };
    setData((d) => ({ ...d, edges: [...d.edges, newEdge] }));
  };

  // 단자가 없는 타입(전원/변압기/수용가) 또는 노드 몸통을 눌렀을 때
  const handleNodeMouseDown = (e, node) => {
    e.stopPropagation();
    if (mode === "connect") {
      const key = { node: node.id, terminal: null };
      if (!connectFrom) setConnectFrom(key);
      else {
        addEdge(connectFrom, key);
        setConnectFrom(null);
      }
      return;
    }
    setSelectedId(node.id);
    setSelectedEdgeId(null);
    const world = screenToWorld(e.clientX, e.clientY);
    setDragging({ id: node.id, offX: world.x - node.position.x, offY: world.y - node.position.y });
  };

  // 개폐기/S·L쌍의 개별 단자를 눌렀을 때
  const handleTerminalMouseDown = (e, node, terminalKey) => {
    e.stopPropagation();
    if (mode !== "connect") {
      handleNodeMouseDown(e, node);
      return;
    }
    const key = { node: node.id, terminal: terminalKey };
    if (!connectFrom) setConnectFrom(key);
    else {
      addEdge(connectFrom, key);
      setConnectFrom(null);
    }
  };

  const handleEdgeMouseDown = (e, edge) => {
    e.stopPropagation();
    if (mode === "connect") return;
    setSelectedEdgeId(edge.id);
    setSelectedId(null);
  };

  const handleSvgMouseDown = (e) => {
    if (e.target === svgRef.current || e.target.tagName === "svg") {
      setSelectedId(null);
      setSelectedEdgeId(null);
      setPanning({ startX: e.clientX - pan.x, startY: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (dragging) {
      const world = screenToWorld(e.clientX, e.clientY);
      setData((d) => ({
        ...d,
        nodes: d.nodes.map((n) =>
          n.id === dragging.id ? { ...n, position: { x: world.x - dragging.offX, y: world.y - dragging.offY } } : n
        ),
      }));
    } else if (panning) {
      setPan({ x: e.clientX - panning.startX, y: e.clientY - panning.startY });
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
    setPanning(null);
  };

  const addNode = (type) => {
    const id = nextId();
    const newNode = {
      id,
      type,
      position: { x: (300 - pan.x) / zoom, y: (300 - pan.y) / zoom },
      ...(type === "switch" || type === "pair_sl" ? { state: [1, 0, 1, 0], specs: ["CNCV(100)"], distance_km: 0 } : {}),
      ...(type === "transformer" ? { capacity_kva: 100, specs: ["CNCV(100)"], distance_km: 0 } : {}),
      ...(type === "customer" ? { capacity_kva: 100 } : {}),
    };
    setData((d) => ({ ...d, nodes: [...d.nodes, newNode] }));
    setSelectedId(id);
    setSelectedEdgeId(null);
  };

  const deleteSelected = () => {
    if (selectedId) {
      setData((d) => ({
        nodes: d.nodes.filter((n) => n.id !== selectedId),
        edges: d.edges.filter((e) => e.from.node !== selectedId && e.to.node !== selectedId),
        meta: d.meta,
      }));
      setSelectedId(null);
    } else if (selectedEdgeId) {
      setData((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== selectedEdgeId) }));
      setSelectedEdgeId(null);
    }
  };

  const updateSelected = (patch) => {
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === selectedId ? { ...n, ...patch } : n)),
    }));
  };

  // 노드 타입을 바꿀 때, 공통 필드(id/position/specs/distance_km 등)는 최대한 보존하고
  // 타입별 필수 필드(state/capacity_kva)를 새로 채워 넣는다.
  const changeNodeType = (newType) => {
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => {
        if (n.id !== selectedId) return n;
        const base = { id: n.id, type: newType, position: n.position };
        if (newType === "switch") {
          return { ...base, state: n.state && n.state.length === 4 ? n.state : [1, 0, 1, 0], specs: n.specs || [], distance_km: n.distance_km ?? 0 };
        }
        if (newType === "pair_sl") {
          return { ...base, state: [1, 1], specs: n.specs || [], distance_km: n.distance_km ?? 0 };
        }
        if (newType === "transformer") {
          return { ...base, capacity_kva: n.capacity_kva ?? 100, specs: n.specs || [], distance_km: n.distance_km ?? 0 };
        }
        if (newType === "customer") {
          return { ...base, capacity_kva: n.capacity_kva ?? 100 };
        }
        return base; // source
      }),
      edges: d.edges.map((e) => ({
        // 단자 구조가 바뀌면 기존 단자 참조가 무효화될 수 있어 안전하게 terminal을 null로 초기화
        ...e,
        from: e.from.node === selectedId ? { node: e.from.node, terminal: null } : e.from,
        to: e.to.node === selectedId ? { node: e.to.node, terminal: null } : e.to,
      })),
    }));
  };

  const updateSelectedEdge = (patch) => {
    setData((d) => ({
      ...d,
      edges: d.edges.map((e) => (e.id === selectedEdgeId ? { ...e, ...patch } : e)),
    }));
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.meta.title || "gyetongdo"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        setData(normalizeData(parsed));
        setSelectedId(null);
        setSelectedEdgeId(null);
      } catch (err) {
        alert("JSON 파일을 읽을 수 없습니다: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  // 특정 단자(or 단자 없는 노드 중심)의 world 좌표 계산
  const getPoint = (ref) => {
    const node = data.nodes.find((n) => n.id === ref.node);
    if (!node) return null;
    const defs = getTerminalDefs(node.type);
    if (defs && ref.terminal != null) {
      const t = defs.find((d) => d.key === ref.terminal);
      if (t) return { x: node.position.x + t.x, y: node.position.y + t.y };
    }
    return { x: node.position.x, y: node.position.y };
  };

  const isTerminalActive = (nodeId, terminalKey) =>
    connectFrom && connectFrom.node === nodeId && connectFrom.terminal === terminalKey;

  const renderNodeShape = (node) => {
    const meta = TYPE_META[node.type] || TYPE_META.switch;
    const isSel = node.id === selectedId;
    const ring = isSel ? "#f5c542" : node.needs_review ? "#f59e0b" : "transparent";
    const defs = getTerminalDefs(node.type);

    if (node.type === "source") {
      return (
        <g>
          <circle r="16" fill="#0f1720" stroke={ring} strokeWidth="3" />
          <circle r="10" fill={meta.color} />
        </g>
      );
    }
    if (node.type === "customer") {
      return (
        <g>
          <rect x="-14" y="-14" width="28" height="28" rx="3" fill="#161b22" stroke={ring} strokeWidth="3" />
          <rect x="-8" y="-8" width="6" height="6" fill={meta.color} />
          <rect x="2" y="-8" width="6" height="6" fill={meta.color} />
          <rect x="-8" y="2" width="6" height="6" fill={meta.color} />
          <rect x="2" y="2" width="6" height="6" fill={meta.color} />
        </g>
      );
    }
    if (node.type === "transformer") {
      return (
        <g>
          <rect x="-16" y="-16" width="32" height="32" rx="3" fill="#161b22" stroke={ring} strokeWidth="3" />
          <rect x="-9" y="-9" width="7" height="7" fill={meta.color} />
          <rect x="2" y="-9" width="7" height="7" fill={meta.color} />
          <rect x="-9" y="2" width="7" height="7" fill={meta.color} />
          <rect x="2" y="2" width="7" height="7" fill={meta.color} />
        </g>
      );
    }
    // switch / pair_sl : 단자별로 독립 클릭 가능한 원
    const st = node.state || [1, 0, 1, 0];
    return (
      <g>
        <circle r="20" fill="none" stroke={ring} strokeWidth="3" />
        {defs.map((t, i) => {
          const active = isTerminalActive(node.id, t.key);
          const on = node.type === "switch" ? st[i] : true;
          return (
            <g key={t.key}>
              {/* 히트 영역(살짝 크게) */}
              <circle
                cx={t.x}
                cy={t.y}
                r="9.5"
                fill="transparent"
                stroke={active ? "#38bdf8" : "transparent"}
                strokeWidth="2.5"
                onMouseDown={(e) => handleTerminalMouseDown(e, node, t.key)}
                className="cursor-crosshair"
              />
              <circle
                cx={t.x}
                cy={t.y}
                r="7.5"
                fill={node.type === "switch" ? (on ? "#e34a4a" : "#3fa864") : "#e34a4a"}
                stroke="#0f1720"
                strokeWidth="1"
                onMouseDown={(e) => handleTerminalMouseDown(e, node, t.key)}
                className="cursor-crosshair pointer-events-none"
              />
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div className="w-full h-screen bg-[#0b0f14] text-slate-200 flex flex-col font-mono overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#11161d] border-b border-[#22293380] shrink-0">
        <span className="text-sm tracking-wide text-slate-400">계통도 편집기</span>
        <span className="text-xs text-slate-600">|</span>
        <input
          className="bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-[#f5c542] px-1"
          value={data.meta.title}
          onChange={(e) => setData((d) => ({ ...d, meta: { ...d.meta, title: e.target.value } }))}
        />
        <div className="flex-1" />
        <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-[#1a2029] hover:bg-[#232b37] text-slate-300">
          <Upload size={13} /> 불러오기
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={importJson} className="hidden" />
        <button onClick={exportJson} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-[#f5c542] hover:bg-[#e0b530] text-[#11161d] font-semibold">
          <Download size={13} /> JSON 내보내기
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left tool palette */}
        <div className="w-44 bg-[#11161d] border-r border-[#22293380] flex flex-col gap-1 p-3 shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">모드</div>
          <button
            onClick={() => { setMode("select"); setConnectFrom(null); }}
            className={`flex items-center gap-2 text-xs px-2.5 py-2 rounded ${mode === "select" ? "bg-[#f5c542] text-[#11161d] font-semibold" : "bg-[#1a2029] hover:bg-[#232b37]"}`}
          >
            <MousePointer2 size={13} /> 선택/이동
          </button>
          <button
            onClick={() => setMode("connect")}
            className={`flex items-center gap-2 text-xs px-2.5 py-2 rounded ${mode === "connect" ? "bg-[#f5c542] text-[#11161d] font-semibold" : "bg-[#1a2029] hover:bg-[#232b37]"}`}
          >
            <Link2 size={13} /> 단자 연결
          </button>
          {mode === "connect" && (
            <div className="text-[10px] text-sky-400 leading-snug px-1 mt-1">
              {connectFrom
                ? `${connectFrom.node}${connectFrom.terminal != null ? ` [${connectFrom.terminal}번]` : ""} → 대상 단자를 클릭`
                : "시작 단자(개폐기는 1~4번 원, 그 외는 노드 몸통)를 클릭하세요"}
            </div>
          )}

          <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-4 mb-1">노드 추가</div>
          {Object.entries(TYPE_META).map(([type, meta]) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className="flex items-center gap-2 text-xs px-2.5 py-2 rounded bg-[#1a2029] hover:bg-[#232b37] text-left"
            >
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: meta.color }} />
              <Plus size={12} className="text-slate-500" /> {meta.label}
            </button>
          ))}

          <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-4 mb-1">보기</div>
          <div className="flex gap-1">
            <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} className="flex-1 flex items-center justify-center py-1.5 rounded bg-[#1a2029] hover:bg-[#232b37]">
              <ZoomIn size={13} />
            </button>
            <button onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))} className="flex-1 flex items-center justify-center py-1.5 rounded bg-[#1a2029] hover:bg-[#232b37]">
              <ZoomOut size={13} />
            </button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="flex-1 flex items-center justify-center py-1.5 rounded bg-[#1a2029] hover:bg-[#232b37]">
              <Move size={13} />
            </button>
          </div>
          <div className="text-[10px] text-slate-600 mt-1">{Math.round(zoom * 100)}%</div>

          <div className="flex-1" />
          <div className="text-[10px] text-slate-600 leading-relaxed border-t border-[#22293380] pt-2">
            노드 {data.nodes.length}개 · 선로 {data.edges.length}개
            {data.nodes.some((n) => n.needs_review) && (
              <div className="text-amber-500 mt-1">
                ⚠ 검수 필요 {data.nodes.filter((n) => n.needs_review).length}개
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative bg-[#0b0f14] overflow-hidden">
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#1a2029" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* edges */}
              {data.edges.map((edge) => {
                const p1 = getPoint(edge.from);
                const p2 = getPoint(edge.to);
                if (!p1 || !p2) return null;
                const isSel = edge.id === selectedEdgeId;
                return (
                  <g key={edge.id} onMouseDown={(e) => handleEdgeMouseDown(e, edge)} className="cursor-pointer">
                    {/* 넓은 히트 영역 (클릭하기 쉽게) */}
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth="12" />
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={isSel ? "#f5c542" : edge.style === "dashed" ? "#5a6472" : "#38bdf8"}
                      strokeWidth={isSel ? 3 : 2}
                      strokeDasharray={edge.style === "dashed" ? "5,4" : undefined}
                    />
                    <text
                      x={(p1.x + p2.x) / 2}
                      y={(p1.y + p2.y) / 2 - 6}
                      fontSize="9"
                      fill={isSel ? "#f5c542" : "#5a6472"}
                      textAnchor="middle"
                    >
                      {edge.cable} {edge.distance_km}km
                    </text>
                  </g>
                );
              })}
              {/* nodes */}
              {data.nodes.map((node) => (
                <g
                  key={node.id}
                  transform={`translate(${node.position.x},${node.position.y})`}
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  className="cursor-pointer"
                >
                  {renderNodeShape(node)}
                  <text y="34" fontSize="10" fill="#c7cdd6" textAnchor="middle">
                    {node.id}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>

        {/* Right inspector */}
        <div className="w-72 bg-[#11161d] border-l border-[#22293380] p-4 shrink-0 overflow-y-auto">
          {!selectedNode && !selectedEdge && (
            <div className="text-xs text-slate-600 leading-relaxed">
              노드를 클릭하면 속성을, 선로(선)를 클릭하면 배선 정보를 편집할 수 있습니다. 개폐기·S/L쌍은 원 하나하나가 독립된 단자이니 "단자 연결" 모드에서 정확히 그 원을 클릭해서 이어주세요.
            </div>
          )}

          {selectedNode && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  {TYPE_META[selectedNode.type]?.label}
                </span>
                <button onClick={deleteSelected} className="text-red-400 hover:text-red-300">
                  <Trash2 size={14} />
                </button>
              </div>

              <label className="text-[10px] text-slate-500">타입</label>
              <select
                className="bg-[#1a2029] text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-[#f5c542]"
                value={selectedNode.type}
                onChange={(e) => changeNodeType(e.target.value)}
              >
                {Object.entries(TYPE_META).map(([type, meta]) => (
                  <option key={type} value={type}>{meta.label}</option>
                ))}
              </select>
              {selectedNode.needs_review && (
                <div className="text-[10px] text-amber-400 bg-amber-400/10 rounded px-2 py-1.5 leading-relaxed">
                  ⚠ 자동 변환 결과 - 원본 도면과 대조하여 타입/ID/상태를 확인하세요.
                </div>
              )}

              <label className="text-[10px] text-slate-500">ID / 명칭</label>
              <input
                className="bg-[#1a2029] text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-[#f5c542]"
                value={selectedNode.id}
                onChange={(e) => {
                  const newId = e.target.value;
                  setData((d) => ({
                    nodes: d.nodes.map((n) => (n.id === selectedId ? { ...n, id: newId } : n)),
                    edges: d.edges.map((ed) => ({
                      ...ed,
                      from: ed.from.node === selectedId ? { ...ed.from, node: newId } : ed.from,
                      to: ed.to.node === selectedId ? { ...ed.to, node: newId } : ed.to,
                    })),
                    meta: d.meta,
                  }));
                  setSelectedId(newId);
                }}
              />

              {(selectedNode.type === "switch" || selectedNode.type === "pair_sl") && (
                <>
                  <label className="text-[10px] text-slate-500">
                    {selectedNode.type === "switch" ? "접점 상태 (1~4번, 클릭 토글)" : "S/L 단자 (연결은 캔버스에서)"}
                  </label>
                  {selectedNode.type === "switch" ? (
                    <div className="flex gap-2">
                      {(selectedNode.state || [0, 0, 0, 0]).map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            const ns = [...(selectedNode.state || [0, 0, 0, 0])];
                            ns[i] = ns[i] ? 0 : 1;
                            updateSelected({ state: ns });
                          }}
                          className="w-8 h-8 rounded-full border border-[#2a3340] flex items-center justify-center text-[10px] font-bold"
                          style={{ background: s ? "#e34a4a" : "#3fa864" }}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500">상단 원 = S단자, 하단 원 = L단자</div>
                  )}
                </>
              )}

              {(selectedNode.type === "transformer" || selectedNode.type === "customer") && (
                <>
                  <label className="text-[10px] text-slate-500">용량 (kVA)</label>
                  <input
                    type="number"
                    className="bg-[#1a2029] text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-[#f5c542]"
                    value={selectedNode.capacity_kva ?? ""}
                    onChange={(e) => updateSelected({ capacity_kva: Number(e.target.value) })}
                  />
                </>
              )}

              {"specs" in selectedNode && (
                <>
                  <label className="text-[10px] text-slate-500">케이블 규격 (쉼표 구분)</label>
                  <input
                    className="bg-[#1a2029] text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-[#f5c542]"
                    value={(selectedNode.specs || []).join(", ")}
                    onChange={(e) => updateSelected({ specs: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  />
                </>
              )}

              {"distance_km" in selectedNode && (
                <>
                  <label className="text-[10px] text-slate-500">거리 (km)</label>
                  <input
                    type="number"
                    step="0.001"
                    className="bg-[#1a2029] text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-[#f5c542]"
                    value={selectedNode.distance_km ?? 0}
                    onChange={(e) => updateSelected({ distance_km: Number(e.target.value) })}
                  />
                </>
              )}

              <div className="text-[10px] text-slate-600 border-t border-[#22293380] pt-2 mt-1">
                위치: {Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}
              </div>
            </div>
          )}

          {selectedEdge && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">선로</span>
                <button onClick={deleteSelected} className="text-red-400 hover:text-red-300">
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="text-[11px] text-slate-400 leading-relaxed">
                {selectedEdge.from.node}
                {selectedEdge.from.terminal != null ? ` [${selectedEdge.from.terminal}]` : ""} →{" "}
                {selectedEdge.to.node}
                {selectedEdge.to.terminal != null ? ` [${selectedEdge.to.terminal}]` : ""}
              </div>

              <label className="text-[10px] text-slate-500">케이블 규격</label>
              <input
                className="bg-[#1a2029] text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-[#f5c542]"
                value={selectedEdge.cable}
                onChange={(e) => updateSelectedEdge({ cable: e.target.value })}
              />

              <label className="text-[10px] text-slate-500">거리 (km)</label>
              <input
                type="number"
                step="0.001"
                className="bg-[#1a2029] text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-[#f5c542]"
                value={selectedEdge.distance_km}
                onChange={(e) => updateSelectedEdge({ distance_km: Number(e.target.value) })}
              />

              <label className="text-[10px] text-slate-500">선 스타일</label>
              <div className="flex gap-2">
                {["solid", "dashed"].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateSelectedEdge({ style: s })}
                    className={`text-xs px-2.5 py-1.5 rounded ${selectedEdge.style === s ? "bg-[#f5c542] text-[#11161d] font-semibold" : "bg-[#1a2029] hover:bg-[#232b37]"}`}
                  >
                    {s === "solid" ? "실선" : "점선"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
