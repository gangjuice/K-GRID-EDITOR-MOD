import React, { useState, useRef, useCallback } from "react";
import { Plus, Trash2, Link2, Download, Upload, ZoomIn, ZoomOut, Move, MousePointer2 } from "lucide-react";

// ---------- 샘플 데이터 (실제 추출 결과 일부를 정제해 구성) ----------
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
    { id: "e1", from: "덕풍CB", to: "고덕S3301", cable: "CNCV(325)", distance_km: 0.240, style: "solid" },
    { id: "e2", from: "고덕S3301", to: "고덕33301", cable: "CNCV(400)", distance_km: 1.302, style: "solid" },
    { id: "e3", from: "고덕33301", to: "고덕S2203", cable: "CNCV(325)", distance_km: 0.100, style: "dashed" },
    { id: "e4", from: "고덕S2203", to: "고덕T2201", cable: "CNCV(325)", distance_km: 0.100, style: "solid" },
    { id: "e5", from: "고덕T2201", to: "고덕S3403-2", cable: "TR-CNCE-W/AL(95)", distance_km: 0.130, style: "solid" },
    { id: "e6", from: "고덕S3403-2", to: "비에스에듀타운", cable: "CNCV(325)", distance_km: 0.100, style: "solid" },
    { id: "e7", from: "고덕T2201", to: "고덕S3403-4", cable: "CNCV-W(100)", distance_km: 0.140, style: "solid" },
    { id: "e8", from: "고덕S3403-4", to: "해솔디앤씨", cable: "CNCV(100)", distance_km: 0.000, style: "solid" },
    { id: "e9", from: "고덕33301", to: "고덕33403-1", cable: "CNCV(100)", distance_km: 0.010, style: "solid" },
  ],
};

const TYPE_META = {
  source: { label: "전원(CB)", color: "#e34a4a", shape: "arrow" },
  switch: { label: "개폐기", color: "#e34a4a", shape: "quad" },
  pair_sl: { label: "S/L", color: "#e34a4a", shape: "pair" },
  transformer: { label: "변압기", color: "#8b5cf6", shape: "grid" },
  customer: { label: "수용가", color: "#3fa864", shape: "square" },
};

let uid = 100;
const nextId = () => `node-${uid++}`;

export default function GyetongdoEditor() {
  const [data, setData] = useState(SAMPLE);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("select"); // select | connect
  const [connectFrom, setConnectFrom] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null);
  const [panning, setPanning] = useState(null);
  const svgRef = useRef(null);
  const fileInputRef = useRef(null);

  const selectedNode = data.nodes.find((n) => n.id === selectedId);

  const screenToWorld = useCallback(
    (sx, sy) => {
      const rect = svgRef.current.getBoundingClientRect();
      return { x: (sx - rect.left - pan.x) / zoom, y: (sy - rect.top - pan.y) / zoom };
    },
    [pan, zoom]
  );

  const handleNodeMouseDown = (e, node) => {
    e.stopPropagation();
    if (mode === "connect") {
      if (!connectFrom) {
        setConnectFrom(node.id);
      } else if (connectFrom !== node.id) {
        const newEdge = { id: `e-${uid++}`, from: connectFrom, to: node.id, cable: "CNCV(100)", distance_km: 0, style: "solid" };
        setData((d) => ({ ...d, edges: [...d.edges, newEdge] }));
        setConnectFrom(null);
      }
      return;
    }
    setSelectedId(node.id);
    const world = screenToWorld(e.clientX, e.clientY);
    setDragging({ id: node.id, offX: world.x - node.position.x, offY: world.y - node.position.y });
  };

  const handleSvgMouseDown = (e) => {
    if (e.target === svgRef.current || e.target.tagName === "svg") {
      setSelectedId(null);
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
    const meta = TYPE_META[type];
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
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setData((d) => ({
      nodes: d.nodes.filter((n) => n.id !== selectedId),
      edges: d.edges.filter((e) => e.from !== selectedId && e.to !== selectedId),
      meta: d.meta,
    }));
    setSelectedId(null);
  };

  const updateSelected = (patch) => {
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === selectedId ? { ...n, ...patch } : n)),
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
        setData(parsed);
        setSelectedId(null);
      } catch (err) {
        alert("JSON 파일을 읽을 수 없습니다: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const renderNodeShape = (node) => {
    const meta = TYPE_META[node.type] || TYPE_META.switch;
    const isSel = node.id === selectedId;
    const isConnectSrc = node.id === connectFrom;
    const ring = isSel ? "#f5c542" : isConnectSrc ? "#38bdf8" : "transparent";

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
    // switch / pair_sl : 4-circle diamond cluster like the original diagram
    const st = node.state || [1, 0, 1, 0];
    const positions = [
      { x: 0, y: -11 },
      { x: -11, y: 0 },
      { x: 0, y: 11 },
      { x: 11, y: 0 },
    ];
    return (
      <g>
        <circle r="20" fill="none" stroke={ring} strokeWidth="3" />
        {positions.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="7.5" fill={st[i] ? "#e34a4a" : "#3fa864"} stroke="#0f1720" strokeWidth="1" />
        ))}
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
            <Link2 size={13} /> 선로 연결
          </button>
          {mode === "connect" && (
            <div className="text-[10px] text-sky-400 leading-snug px-1 mt-1">
              {connectFrom ? `${connectFrom} → 대상 노드를 클릭` : "시작 노드를 클릭하세요"}
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
                const from = data.nodes.find((n) => n.id === edge.from);
                const to = data.nodes.find((n) => n.id === edge.to);
                if (!from || !to) return null;
                return (
                  <g key={edge.id}>
                    <line
                      x1={from.position.x}
                      y1={from.position.y}
                      x2={to.position.x}
                      y2={to.position.y}
                      stroke={edge.style === "dashed" ? "#5a6472" : "#38bdf8"}
                      strokeWidth="2"
                      strokeDasharray={edge.style === "dashed" ? "5,4" : undefined}
                    />
                    <text
                      x={(from.position.x + to.position.x) / 2}
                      y={(from.position.y + to.position.y) / 2 - 6}
                      fontSize="9"
                      fill="#5a6472"
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
          {!selectedNode ? (
            <div className="text-xs text-slate-600 leading-relaxed">
              노드를 클릭하면 속성을 편집할 수 있습니다. 왼쪽에서 노드 종류를 골라 추가하거나, "선로 연결" 모드로 두 노드를 이어보세요.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  {TYPE_META[selectedNode.type]?.label}
                </span>
                <button onClick={deleteSelected} className="text-red-400 hover:text-red-300">
                  <Trash2 size={14} />
                </button>
              </div>

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
                      from: ed.from === selectedId ? newId : ed.from,
                      to: ed.to === selectedId ? newId : ed.to,
                    })),
                    meta: d.meta,
                  }));
                  setSelectedId(newId);
                }}
              />

              {(selectedNode.type === "switch" || selectedNode.type === "pair_sl") && (
                <>
                  <label className="text-[10px] text-slate-500">접점 상태 (클릭 토글)</label>
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
                </>
              )}

              {selectedNode.type === "transformer" || selectedNode.type === "customer" ? (
                <>
                  <label className="text-[10px] text-slate-500">용량 (kVA)</label>
                  <input
                    type="number"
                    className="bg-[#1a2029] text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-[#f5c542]"
                    value={selectedNode.capacity_kva ?? ""}
                    onChange={(e) => updateSelected({ capacity_kva: Number(e.target.value) })}
                  />
                </>
              ) : null}

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
        </div>
      </div>
    </div>
  );
}
