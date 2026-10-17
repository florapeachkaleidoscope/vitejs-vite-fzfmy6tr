import React, { useState, useRef, useEffect, useCallback } from "react";
import { exportPDF, CELL_W, CELL_H } from "./kaleidoprint-pdf";

const RAINBOW = ["#FF4E50","#FC913A","#F9D62E","#52D726","#1A91FF","#9B59B6","#FF69B4"];
const BOARD_PRESETS = { "4×4 ft": { w: 4, h: 4 }, "6×4 ft": { w: 6, h: 4 }, "8x4 ft": { w: 8, h: 4 } };
const FONTS = [
  "Fredoka One",
  "Nunito",
  "Paytone One",
  "Righteous",
  "Luckiest Guy",
  "Raleway",
  "Oswald",
  "Permanent Marker",
  "Satisfy",
  "Bebas Neue",
  "Playfair Display",
  "Abril Fatface",
];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const LETTER_COLORS = ["#FF4E50","#FC913A","#F9D62E","#4CAF50","#1A91FF","#9B59B6","#FF69B4","#00BCD4"];
const SCALE_BASE = 80;

function useGoogleFonts() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@700&family=Paytone+One&family=Righteous&family=Luckiest+Guy&family=Raleway:wght@700&family=Oswald:wght@700&family=Permanent+Marker&family=Satisfy&family=Bebas+Neue&family=Playfair+Display:wght@700&family=Abril+Fatface&family=Josefin+Sans:wght@700&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
}

// ── Border components ──────────────────────────────────────────────────────────

function ScallopBorder({ x, y, width, height, size, colors, side }) {
  const els = [];
  const r = size / 2;
  if (side === "top" || side === "bottom") {
    const count = Math.ceil(width / size);
    for (let i = 0; i < count; i++) {
      const bx = x + i * size;
      const color = colors[i % colors.length];
      if (side === "top") {
        const d = `M ${bx} ${y + size} A ${r} ${r} 0 0 1 ${bx + size} ${y + size} Z`;
        els.push(<path key={i} d={d} fill={color} />);
      } else {
        const d = `M ${bx} ${y + height - size} A ${r} ${r} 0 0 0 ${bx + size} ${y + height - size} Z`;
        els.push(<path key={i} d={d} fill={color} />);
      }
    }
  } else {
    const count = Math.ceil(height / size);
    for (let i = 0; i < count; i++) {
      const by = y + i * size;
      const color = colors[i % colors.length];
      if (side === "left") {
        const d = `M ${x + size} ${by} A ${r} ${r} 0 0 0 ${x + size} ${by + size} Z`;
        els.push(<path key={i} d={d} fill={color} />);
      } else {
        const d = `M ${x + width - size} ${by} A ${r} ${r} 0 0 1 ${x + width - size} ${by + size} Z`;
        els.push(<path key={i} d={d} fill={color} />);
      }
    }
  }
  return <>{els}</>;
}

function DotsBorder({ x, y, width, height, size, colors, side }) {
  const els = []; const sp = size * 1.4;
  if (side === "top" || side === "bottom") {
    const count = Math.ceil(width / sp);
    for (let i = 0; i < count; i++) {
      const cx = x + i * sp + sp / 2;
      const cy = side === "top" ? y + size / 2 : y + height - size / 2;
      els.push(<circle key={i} cx={cx} cy={cy} r={size * 0.38} fill={colors[i % colors.length]} />);
    }
  } else {
    const count = Math.ceil(height / sp);
    for (let i = 0; i < count; i++) {
      const cy = y + i * sp + sp / 2;
      const cx = side === "left" ? x + size / 2 : x + width - size / 2;
      els.push(<circle key={i} cx={cx} cy={cy} r={size * 0.38} fill={colors[i % colors.length]} />);
    }
  }
  return <>{els}</>;
}

function ZigzagBorder({ x, y, width, height, size, colors, side }) {
  const els = [];
  if (side === "top" || side === "bottom") {
    const count = Math.ceil(width / size);
    for (let i = 0; i < count; i++) {
      const bx = x + i * size;
      const by = side === "top" ? y : y + height - size;
      const pts = side === "top"
        ? `${bx},${by + size} ${bx + size / 2},${by} ${bx + size},${by + size}`
        : `${bx},${by} ${bx + size / 2},${by + size} ${bx + size},${by}`;
      els.push(<polygon key={i} points={pts} fill={colors[i % colors.length]} opacity={0.9} />);
    }
  } else {
    const count = Math.ceil(height / size);
    for (let i = 0; i < count; i++) {
      const bx = side === "left" ? x : x + width - size;
      const by = y + i * size;
      const pts = side === "left"
        ? `${bx + size},${by} ${bx},${by + size / 2} ${bx + size},${by + size}`
        : `${bx},${by} ${bx + size},${by + size / 2} ${bx},${by + size}`;
      els.push(<polygon key={i} points={pts} fill={colors[i % colors.length]} opacity={0.9} />);
    }
  }
  return <>{els}</>;
}

function BoardBorder({ x, y, width, height, style, size, elementSize, colors }) {
  const eSize = elementSize || size;
  const sides = ["top","bottom","left","right"];
  if (style === "solid") return (
    <>
      <rect x={x} y={y} width={width} height={size} fill={colors[0]} />
      <rect x={x} y={y + height - size} width={width} height={size} fill={colors[0]} />
      <rect x={x} y={y} width={size} height={height} fill={colors[0]} />
      <rect x={x + width - size} y={y} width={size} height={height} fill={colors[0]} />
    </>
  );
  return (
    <g>
      {sides.map(side => {
        const props = { x, y, width, height, size, colors, side, key: side };
        if (style === "scallop") return <ScallopBorder {...props} />;
        if (style === "dots") return <DotsBorder {...props} />;
        if (style === "triangle") return <ZigzagBorder {...props} />;
        return null;
      })}
    </g>
  );
}

// ── Built-in Wavy Border ─────────────────────────────────────────────────────
function WavyBorder({ x, y, width, height, thickness, color }) {
  const els = [];
  const amp = thickness * 0.3;
  const freq = thickness * 4;

  const sides = [
    { side: "top",    sx: x, sy: y,                 sw: width,  sh: thickness, horiz: true  },
    { side: "bottom", sx: x, sy: y+height-thickness, sw: width,  sh: thickness, horiz: true  },
    { side: "left",   sx: x, sy: y,                 sw: thickness, sh: height, horiz: false },
    { side: "right",  sx: x+width-thickness, sy: y,  sw: thickness, sh: height, horiz: false },
  ];

  sides.forEach(({ side, sx, sy, sw, sh, horiz }) => {
    const len = horiz ? sw : sh;
    const steps = 60;
    const pts = [];

    if (horiz) {
      const innerBase = side === "top" ? sy + thickness * 0.6 : sy + thickness * 0.4;
      const outerEdge = side === "top" ? sy : sy + thickness;
      const dir = side === "top" ? -1 : 1;
      for (let s = 0; s <= steps; s++) {
        const px = sx + (s / steps) * sw;
        const py = innerBase + dir * amp * Math.sin((s / steps) * len / freq * Math.PI * 2);
        pts.push(`${px},${py}`);
      }
      const waveStr = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(" ");
      const path = `${waveStr} L ${sx+sw},${outerEdge} L ${sx},${outerEdge} Z`;
      els.push(<path key={side} d={path} fill={color} />);
    } else {
      const innerBase = side === "left" ? sx + thickness * 0.6 : sx + thickness * 0.4;
      const outerEdge = side === "left" ? sx : sx + thickness;
      const dir = side === "left" ? -1 : 1;
      for (let s = 0; s <= steps; s++) {
        const py = sy + (s / steps) * sh;
        const px = innerBase + dir * amp * Math.sin((s / steps) * sh / freq * Math.PI * 2);
        pts.push(`${px},${py}`);
      }
      const waveStr = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(" ");
      const path = `${waveStr} L ${outerEdge},${sy+sh} L ${outerEdge},${sy} Z`;
      els.push(<path key={side} d={path} fill={color} />);
    }
  });
  return <g>{els}</g>;
}

function hexToRgb01(hex) {
  const h = hex.replace("#","");
  const r = parseInt(h.slice(0,2),16)/255;
  const g = parseInt(h.slice(2,4),16)/255;
  const b = parseInt(h.slice(4,6),16)/255;
  return [r,g,b];
}

function PngBorder({ x, y, width, height, size, pngs, patternSize }) {
  const sides = ["top","bottom","left","right"];
  const hasSide = sides.some(s => pngs[s]?.src);
  if (!hasSide) return null;

  const tileH = size;

  const strips = {
    top:    { rx: x,                ry: y,                 rw: width,  rh: size   },
    bottom: { rx: x,                ry: y + height - size,  rw: width,  rh: size   },
    left:   { rx: x,                ry: y,                 rw: size,   rh: height },
    right:  { rx: x + width - size, ry: y,                 rw: size,   rh: height },
  };

  return (
    <g>
      {sides.map(side => {
        const p = pngs[side];
        if (!p?.src) return null;
        const s = strips[side];
        const isVert = side === "left" || side === "right";
        const rot = p.rotate || 0;
        const tint = p.tint || null;
        const filterId = `btint-${side}`;
        const [tr,tg,tb] = tint ? hexToRgb01(tint) : [0,0,0];

        const tiles = [];
        const sideTileW = p.patternSize || patternSize || size;
        if (isVert) {
          const count = Math.ceil(s.rh / tileH) + 1;
          for (let i = 0; i < count; i++) {
            const ty = s.ry + i * tileH;
            if (ty > s.ry + s.rh) break;
            tiles.push(
              <image key={i} href={p.src}
                x={s.rx} y={ty}
                width={tileH} height={tileH}
                preserveAspectRatio="xMidYMid slice"
                transform={rot ? `rotate(${rot} ${s.rx + tileH/2} ${ty + tileH/2})` : undefined}
              />
            );
          }
        } else {
          const count = Math.ceil(s.rw / sideTileW) + 1;
          for (let i = 0; i < count; i++) {
            const tx = s.rx + i * sideTileW;
            if (tx > s.rx + s.rw) break;
            tiles.push(
              <image key={i} href={p.src}
                x={tx} y={s.ry}
                width={sideTileW} height={tileH}
                preserveAspectRatio="xMidYMid slice"
                transform={rot ? `rotate(${rot} ${tx + sideTileW/2} ${s.ry + tileH/2})` : undefined}
              />
            );
          }
        }

        return (
          <g key={side}>
            <defs>
              <clipPath id={`bc-${side}`}>
                <rect x={s.rx} y={s.ry} width={s.rw} height={s.rh} />
              </clipPath>
              {tint && <filter id={filterId} colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values={`0 0 0 0 ${tr}  0 0 0 0 ${tg}  0 0 0 0 ${tb}  0 0 0 1 0`} />
              </filter>}
            </defs>
            <g clipPath={`url(#bc-${side})`} filter={tint ? `url(#${filterId})` : undefined}>
              {tiles}
            </g>
          </g>
        );
      })}
    </g>
  );
}

// ── Item bounding box helpers ──────────────────────────────────────────────────

function itemBounds(item) {
  if (item.type === "image") return { x: item.x, y: item.y, w: item.w || item.size, h: item.h || item.size };
  if (item.type === "letter") {
    const s = item.size;
    return { x: item.x, y: item.y, w: s * 0.72, h: s };
  }
  if (item.type === "phrase") {
    const chars = item.text.length;
    return { x: item.x, y: item.y, w: chars * item.size * 0.56 + 8, h: item.size * 1.2 };
  }
  return { x: item.x, y: item.y, w: 60, h: 60 };
}

// ── Selection / resize overlay ────────────────────────────────────────────────

function SelectionBox({ item, scale, onResize }) {
  const b = itemBounds(item);
  const pad = 4;
  const bx = b.x - pad, by = b.y - pad, bw = b.w + pad * 2, bh = b.h + pad * 2;
  const handles = [
    { id: "br", cx: bx + bw, cy: by + bh, cursor: "nwse-resize" },
    { id: "bl", cx: bx,       cy: by + bh, cursor: "nesw-resize" },
    { id: "tr", cx: bx + bw, cy: by,       cursor: "nesw-resize" },
    { id: "tl", cx: bx,       cy: by,       cursor: "nwse-resize" },
    { id: "mr", cx: bx + bw, cy: by + bh/2, cursor: "ew-resize" },
    { id: "ml", cx: bx,       cy: by + bh/2, cursor: "ew-resize" },
    { id: "tm", cx: bx + bw/2, cy: by,       cursor: "ns-resize" },
    { id: "bm", cx: bx + bw/2, cy: by + bh,  cursor: "ns-resize" },
  ];

  const handleMouseDown = (e, handleId) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent && e.nativeEvent.stopImmediatePropagation && e.nativeEvent.stopImmediatePropagation();
    const startX = e.clientX, startY = e.clientY;
    const origB = { ...b };

    const onMove = (me) => {
      const dx = (me.clientX - startX) / scale;
      const dy = (me.clientY - startY) / scale;
      onResize(item.id, handleId, origB, dx, dy);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={bx} y={by} width={bw} height={bh}
        fill="none" stroke="#E8186D" strokeWidth={1.5} strokeDasharray="5,3" rx={3} />
      {handles.map(h => (
        <rect
          key={h.id}
          x={h.cx - 5} y={h.cy - 5} width={10} height={10}
          fill="#fff" stroke="#E8186D" strokeWidth={1.5} rx={2}
          data-resize="true"
          style={{ cursor: h.cursor, pointerEvents: "all" }}
          onMouseDown={(e) => handleMouseDown(e, h.id)}
          onClick={e => e.stopPropagation()}
        />
      ))}
    </g>
  );
}

// ── Draggable wrapper ──────────────────────────────────────────────────────────

function DraggableItem({ item, scale, selected, onSelect, onTap, onMove, onSnapshot, children }) {
  const dragging = useRef(false);
  const hasMoved = useRef(false);
  const startPos = useRef(null);

  const handleMouseDown = (e) => {
    e.stopPropagation();
    if (e.target.dataset && e.target.dataset.resize) { onSelect(item.id, e); return; }
    onSelect(item.id, e);
    dragging.current = true;
    hasMoved.current = false;
    startPos.current = { mx: e.clientX, my: e.clientY, ix: item.x, iy: item.y };
    const onM = (me) => {
      if (!dragging.current) return;
      if (!hasMoved.current) { onSnapshot && onSnapshot(); hasMoved.current = true; }
      const dx = (me.clientX - startPos.current.mx) / scale;
      const dy = (me.clientY - startPos.current.my) / scale;
      onMove(item.id, startPos.current.ix + dx, startPos.current.iy + dy);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onM);
      window.removeEventListener("mouseup", onUp);
      if (!hasMoved.current && onTap) onTap(item.id, e);
    };
    window.addEventListener("mousemove", onM);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <g style={{ cursor: selected ? "move" : "pointer" }} onMouseDown={handleMouseDown} onClick={e => e.stopPropagation()}>
      {children}
    </g>
  );
}

// ── Properties panel ────────────────────────────────────────────────────────

function PropertiesPanel({ item, onUpdate, onDelete, onZUp, onZDown }) {
  if (!item) return null;

  return (
    <div style={{ padding: 16, borderTop: "2px solid #E8186D", background: "#fff5f8" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#E8186D", letterSpacing: 1, textTransform: "uppercase" }}>
          Selected: {item.type}
        </span>
        <button onClick={onDelete} style={{
          background: "#ff4444", color: "#fff", border: "none", borderRadius: 6,
          padding: "3px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700
        }}>Delete</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={onZUp} title="Bring forward" style={zBtn}>↑ Forward</button>
        <button onClick={onZDown} title="Send backward" style={zBtn}>↓ Backward</button>
      </div>

      {(item.type === "letter" || item.type === "phrase") && (
        <div style={{ marginBottom: 10 }}>
          <div style={propLabel}>Font Size</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="range" min={16} max={120} value={item.size}
              onChange={e => onUpdate(item.id, { size: +e.target.value })}
              style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "#888", minWidth: 28 }}>{item.size}</span>
          </div>
        </div>
      )}

      {item.type === "image" && (
        <div style={{ marginBottom: 10 }}>
          <div style={propLabel}>Width</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="range" min={20} max={400} value={item.w || item.size}
              onChange={e => {
                const w = +e.target.value;
                const ratio = item.aspect || (item.h || item.size) / (item.w || item.size);
                onUpdate(item.id, { w, h: w * ratio });
              }}
      
              style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "#888", minWidth: 32 }}>{item.w || item.size}px</span>
          </div>
        </div>
      )}

      {(item.type === "letter" || item.type === "phrase") && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <div style={propLabel}>Color</div>
          <input type="color" value={item.color}
            onChange={e => onUpdate(item.id, { color: e.target.value })}
            style={{ width: 40, height: 30, borderRadius: 6, border: "1px solid #ddd", cursor: "pointer" }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {LETTER_COLORS.map(c => (
              <div key={c} onClick={() => onUpdate(item.id, { color: c })}
                style={{ width: 18, height: 18, borderRadius: 3, background: c,
                  border: item.color === c ? "2px solid #333" : "1px solid #ccc", cursor: "pointer" }} />
            ))}
          </div>
        </div>
      )}

      {(item.type === "letter" || item.type === "phrase") && (
        <div style={{ marginBottom: 10 }}>
          <div style={propLabel}>Font</div>
          <select value={item.font} onChange={e => onUpdate(item.id, { font: e.target.value })}
            style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #ddd", fontSize: 12, fontFamily: "'Nunito', sans-serif" }}>
            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      )}

      {item.type === "phrase" && (
        <div style={{ marginBottom: 10 }}>
          <div style={propLabel}>Text</div>
          <input value={item.text} onChange={e => onUpdate(item.id, { text: e.target.value })}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, fontFamily: "'Nunito', sans-serif", boxSizing: "border-box" }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <div style={{ flex: 1 }}>
          <div style={propLabel}>X</div>
          <input type="number" value={Math.round(item.x)} onChange={e => onUpdate(item.id, { x: +e.target.value })}
            style={{ width: "100%", padding: "4px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "'Nunito', sans-serif" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={propLabel}>Y</div>
          <input type="number" value={Math.round(item.y)} onChange={e => onUpdate(item.id, { y: +e.target.value })}
            style={{ width: "100%", padding: "4px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "'Nunito', sans-serif" }} />
        </div>
      </div>
    </div>
  );
}

const propLabel = { fontSize: 10, fontWeight: 700, color: "#E8186D", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 };
const zBtn = { flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 700, background: "#ede8ff", color: "#E8186D", border: "1px solid #c4aff8", borderRadius: 6, cursor: "pointer", fontFamily: "'Nunito', sans-serif" };

// ── Page grid overlay ────────────────────────────────────────────────────────

function PageGrid({ cw, ch, boardDims }) {
  // One grid cell = one printed board page (same sizes the PDF export uses)
  const pxPerIn = SCALE_BASE / 12;
  const pageW = CELL_W * pxPerIn;
  const pageH = CELL_H * pxPerIn;
  const lines = [];

  let x = pageW;
  let col = 1;
  while (x < cw) {
    lines.push(
      <g key={`col-${col}`}>
        <line x1={x} y1={0} x2={x} y2={ch}
          stroke="rgba(100,100,200,0.25)" strokeWidth={1} strokeDasharray="4,3" />
        <rect x={x - 18} y={2} width={36} height={13} rx={3} fill="rgba(100,100,200,0.12)" />
        <text x={x} y={12} textAnchor="middle" fontSize={8} fill="rgba(100,100,200,0.55)" fontFamily="sans-serif">
          col {col}|{col+1}
        </text>
      </g>
    );
    x += pageW;
    col++;
  }

  let y = pageH;
  let row = 1;
  while (y < ch) {
    lines.push(
      <g key={`row-${row}`}>
        <line x1={0} y1={y} x2={cw} y2={y}
          stroke="rgba(100,100,200,0.25)" strokeWidth={1} strokeDasharray="4,3" />
        <rect x={2} y={y - 8} width={36} height={13} rx={3} fill="rgba(100,100,200,0.12)" />
        <text x={20} y={y + 3} textAnchor="middle" fontSize={8} fill="rgba(100,100,200,0.55)" fontFamily="sans-serif">
          row {row}|{row+1}
        </text>
      </g>
    );
    y += pageH;
    row++;
  }

  const cols = Math.ceil(cw / pageW);
  const rows = Math.ceil(ch / pageH);

  // Small "R1 C1" tag in the corner of every page cell
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      lines.push(
        <text key={`cell-${r}-${c}`} x={c * pageW + 4} y={r * pageH + 24} fontSize={7}
          fill="rgba(100,100,200,0.45)" fontFamily="sans-serif">R{r + 1} C{c + 1}</text>
      );
    }
  }

  return (
    <g style={{ pointerEvents: "none" }}>
      {lines}
      <rect x={cw - 78} y={ch - 18} width={76} height={16} rx={3} fill="rgba(100,100,200,0.12)" />
      <text x={cw - 40} y={ch - 6} textAnchor="middle" fontSize={8} fill="rgba(100,100,200,0.55)" fontFamily="sans-serif">
        {cols}×{rows} = {cols * rows} pages
      </text>
    </g>
  );
}

// ── ID generator ──────────────────────────────────────────────────────────────
let idCounter = 1;
const uid = () => `item-${idCounter++}`;

// ── Demo items ────────────────────────────────────────────────────────────────
const DEMO_ITEMS = [
  { id: "demo-1", type: "phrase", text: "Welcome Back!", font: "Fredoka One", color: "#E8186D", size: 52, x: 60, y: 60 },
  { id: "demo-2", type: "letter", letter: "A", font: "Paytone One", color: "#FF4E50", size: 60, x: 60, y: 160 },
  { id: "demo-3", type: "letter", letter: "B", font: "Paytone One", color: "#FC913A", size: 60, x: 110, y: 160 },
  { id: "demo-4", type: "letter", letter: "C", font: "Paytone One", color: "#F9D62E", size: 60, x: 160, y: 160 },
  { id: "demo-5", type: "letter", letter: "D", font: "Paytone One", color: "#52D726", size: 60, x: 210, y: 160 },
  { id: "demo-6", type: "letter", letter: "E", font: "Paytone One", color: "#1A91FF", size: 60, x: 260, y: 160 },
  { id: "demo-7", type: "phrase", text: "Upload clipart & border tiles →", font: "Nunito", color: "#9B59B6", size: 22, x: 60, y: 260 },
];

// ── Main App ──────────────────────────────────────────────────────────────────
export default function Kaleidoprint() {
  useGoogleFonts();

  const [boardPreset, setBoardPreset] = useState("6x4 ft");
  const [boardDims, setBoardDims] = useState({ w: 6, h: 4 });
  const [borderEnabled, setBorderEnabled] = useState(true);
  const [borderStyle, setBorderStyle] = useState("scallop");
  const [borderSize] = useState(18);
  const [builtinBorder, setBuiltinBorder] = useState("wavy");
  const [builtinColor, setBuiltinColor] = useState("#F9D62E");
  const [builtinThickness, setBuiltinThickness] = useState(18);
  const [borderColors, setBorderColors] = useState(RAINBOW);
  const [borderPngs, setBorderPngs] = useState({ top: null, bottom: null, left: null, right: null });
  const setBorderSide = (side, patch) => setBorderPngs(prev => ({
    ...prev,
    [side]: patch === null ? null : { ...(prev[side] || { src: null, rotate: 0 }), ...patch }
  }));
  const [borderTileLibrary, setBorderTileLibrary] = useState([]);
  const [borderLibLoaded, setBorderLibLoaded] = useState(false);
  const [bgColor, setBgColor] = useState("#E3F2FD");
  const [items, setItems] = useState(DEMO_ITEMS);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [exporting, setExporting] = useState(false);
  const [printBg, setPrintBg] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(1.0);

  // ── Pan state ──────────────────────────────────────────────────────────────
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const canvasAreaRef = useRef();

  // Pinch-to-zoom via trackpad
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setZoom(z => Math.min(4, Math.max(0.25, +(z + delta).toFixed(2))));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const history = useRef([]);
  const isUndoing = useRef(false);

  const snapshot = useCallback(() => {
    history.current = [...history.current.slice(-49), items];
  }, [items]);

  const [clipartLibrary, setClipartLibrary] = useState([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get("kaleidoprint-clipart-library");
        if (result && result.value) {
          setClipartLibrary(JSON.parse(result.value));
        }
      } catch (_) {}
      setLibraryLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!libraryLoaded) return;
    (async () => {
      try {
        await window.storage.set("kaleidoprint-clipart-library", JSON.stringify(clipartLibrary));
      } catch (_) {}
    })();
  }, [clipartLibrary, libraryLoaded]);

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem("kp-border-tiles");
        if (raw) setBorderTileLibrary(JSON.parse(raw));
      } catch (_) {}
      setBorderLibLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!borderLibLoaded) return;
    try { localStorage.setItem("kp-border-tiles", JSON.stringify(borderTileLibrary)); } catch (_) {}
  }, [borderTileLibrary, borderLibLoaded]);

  const [activeTab, setActiveTab] = useState("board");
  const [letterFont, setLetterFont] = useState("Fredoka One");
  const [letterColorIdx, setLetterColorIdx] = useState(0);
  const [letterColor, setLetterColor] = useState(null);
  const [phrase, setPhrase] = useState("");
  const [phraseFont, setPhraseFont] = useState("Fredoka One");
  const [phraseColor, setPhraseColor] = useState("#FF4E50");
  const [phraseSize, setPhraseSize] = useState(36);

  const fileRef = useRef();
  const canvasRef = useRef();
  const borderTileRef = useRef();

  const cw = boardDims.w * SCALE_BASE;
  const ch = boardDims.h * SCALE_BASE;
  const DISPLAY_MAX = 580;
  const baseScale = Math.min(DISPLAY_MAX / cw, DISPLAY_MAX / ch, 1);
  const scale = baseScale * zoom;

  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;
  const selectedItem = selectedId ? (items.find(it => it.id === selectedId) || null) : null;

  // Always-current copies for drag/marquee handlers (avoids stale closures)
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // ── Drag-a-box (marquee) selection ──
  const [marquee, setMarquee] = useState(null);
  const startMarquee = (e) => {
    if (e.button !== 0 || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const toBoard = (ev) => ({ x: (ev.clientX - rect.left) / scale, y: (ev.clientY - rect.top) / scale });
    const additive = e.metaKey || e.ctrlKey || e.shiftKey;
    const base = additive ? new Set(selectedRef.current) : new Set();
    const p0 = toBoard(e);
    let moved = false;
    if (!additive) setSelectedIds(new Set());
    const onM = (me) => {
      const p = toBoard(me);
      if (!moved && Math.abs(p.x - p0.x) + Math.abs(p.y - p0.y) < 3) return;
      moved = true;
      const box = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
      setMarquee(box);
      const next = new Set(base);
      itemsRef.current.forEach(it => {
        const b = itemBounds(it);
        if (b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y) next.add(it.id);
      });
      setSelectedIds(next);
    };
    const onUp = () => {
      setMarquee(null);
      window.removeEventListener("mousemove", onM);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onM);
    window.addEventListener("mouseup", onUp);
  };

  // ── Scale a multi-selection together ──
  const [groupScale, setGroupScale] = useState(100);
  const groupBase = useRef(null);
  useEffect(() => { setGroupScale(100); groupBase.current = null; }, [selectedIds]);
  const applyGroupScale = (pct) => {
    if (!groupBase.current) {
      const base = itemsRef.current.filter(it => selectedRef.current.has(it.id));
      if (!base.length) return;
      snapshot();
      const bs = base.map(itemBounds);
      const minX = Math.min(...bs.map(b => b.x)), minY = Math.min(...bs.map(b => b.y));
      const maxX = Math.max(...bs.map(b => b.x + b.w)), maxY = Math.max(...bs.map(b => b.y + b.h));
      groupBase.current = { map: new Map(base.map(it => [it.id, it])), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }
    const { map, cx, cy } = groupBase.current;
    const s = pct / 100;
    setGroupScale(pct);
    setItems(prev => prev.map(it => {
      const b = map.get(it.id);
      if (!b) return it;
      const x = cx + (b.x - cx) * s, y = cy + (b.y - cy) * s;
      if (b.type === "image") return { ...it, x, y, w: (b.w || b.size) * s, h: (b.h || b.size) * s };
      return { ...it, x, y, size: Math.max(8, Math.round(b.size * s)) };
    }));
  };
  const endGroupScale = () => { groupBase.current = null; setGroupScale(100); };

  const addItem = useCallback((item) => {
    snapshot();
    setItems(prev => [...prev, { id: uid(), x: cw / 2 - 30, y: ch / 2 - 30, ...item }]);
  }, [cw, ch, snapshot]);

  const moveItem = useCallback((id, x, y) => {
    setItems(prev => {
      const dragged = prev.find(it => it.id === id);
      if (!dragged) return prev;
      const dx = x - dragged.x, dy = y - dragged.y;
      return prev.map(it => {
        if (it.id === id) return { ...it, x, y };
        if (selectedRef.current.has(it.id)) return { ...it, x: it.x + dx, y: it.y + dy };
        return it;
      });
    });
  }, []);

  const updateItem = useCallback((id, patch) => {
    snapshot();
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }, [snapshot]);

  const deleteItem = useCallback((id) => {
    snapshot();
    if (id) {
      setItems(prev => prev.filter(it => it.id !== id));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    } else {
      setItems(prev => prev.filter(it => !selectedIds.has(it.id)));
      setSelectedIds(new Set());
    }
  }, [snapshot, selectedIds]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (history.current.length === 0) return;
        const prev = history.current[history.current.length - 1];
        history.current = history.current.slice(0, -1);
        isUndoing.current = true;
        setItems(prev);
        setSelectedIds(new Set());
        isUndoing.current = false;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteItem(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteItem]);

  const zUp = useCallback((id) => {
    snapshot();
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === id);
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, [snapshot]);

  const zDown = useCallback((id) => {
    snapshot();
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, [snapshot]);

  const handleResize = useCallback((id, handleId, origB, dx, dy, isStart) => {
    if (isStart) snapshot();
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      let { x, y } = it;
      let w = origB.w, h = origB.h;

      if (handleId.includes("r")) w = Math.max(20, origB.w + dx);
      if (handleId.includes("l")) { w = Math.max(20, origB.w - dx); x = origB.x + origB.w - w; }
      if (handleId.includes("b")) h = Math.max(20, origB.h + dy);
      if (handleId.includes("t")) { h = Math.max(20, origB.h - dy); y = origB.y + origB.h - h; }

      if (it.type === "image") {
        const a = it.aspect || origB.h / origB.w;
        let nw = w, nh = h;
        if (handleId === "t" || handleId === "b") nw = nh / a;  // top/bottom edge handles
        else nh = nw * a;                                       // everything else follows width
        const nx = handleId.includes("l") ? origB.x + origB.w - nw : origB.x;
        const ny = handleId.includes("t") ? origB.y + origB.h - nh : origB.y;
        return { ...it, x: nx, y: ny, w: nw, h: nh };
      }
      if (it.type === "letter" || it.type === "phrase") {
        const newSize = Math.max(12, Math.round(it.size * (w / origB.w)));
        return { ...it, x, y, size: newSize };
      }
      return { ...it, x, y };
    }));
  }, []);

  const loadImageFile = (file, idx) => {
    if (!file) return;
    const name = file.name.replace(/\.[^.]+$/, "");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 120;
        const ratio = img.width / img.height;
        const w = ratio >= 1 ? maxDim : Math.round(maxDim * ratio);
        const h = ratio < 1 ? maxDim : Math.round(maxDim / ratio);
        const src = ev.target.result;
        setClipartLibrary(prev => {
          if (prev.some(c => c.src === src)) return prev;
          return [...prev, { id: `lib-${Date.now()}-${idx}`, src, name }];
        });
        addItem({
          type: "image",
          x: cw / 2 - 30 + idx * 24,
          y: ch / 2 - 30 + idx * 24,
          src,
          w,
          h,
          aspect: img.height / img.width,
        });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  const handleImageUpload = (e) => { Array.from(e.target.files || []).forEach((file, idx) => loadImageFile(file, idx)); e.target.value = ""; };

  const addLetter = (letter) => {
    const color = letterColor || LETTER_COLORS[letterColorIdx % LETTER_COLORS.length];
    addItem({ type: "letter", letter, font: letterFont, color, size: 60 });
    if (!letterColor) setLetterColorIdx(i => i + 1);
  };

  const addPhrase = () => {
    if (!phrase.trim()) return;
    addItem({ type: "phrase", text: phrase, font: phraseFont, color: phraseColor, size: phraseSize });
  };

  const handlePreset = (name) => {
    setBoardPreset(name);
    setBoardDims(BOARD_PRESETS[name]);
  };

  const innerX = borderSize;

  const tabs = [
    { id: "board", label: "Board" },
    { id: "letters", label: "Letters" },
    { id: "clipart", label: "Clipart" },
    { id: "phrases", label: "Phrases" },
  ];

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", display: "flex", height: "100vh", overflow: "hidden", background: "#f0ebff" }}>
      {/* ── Sidebar ── */}
      <div style={{ width: 288, minWidth: 288, background: "#fff", borderRight: "1px solid #e8e0f5", display: "flex", flexDirection: "column", overflowY: "auto" }}>

        {/* Logo */}
        <div style={{ padding: "12px 16px", background: "linear-gradient(135deg, #E8186D 0%, #F07A20 50%, #3DBFBF 100%)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "'Josefin Sans', sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: 2, textTransform: "uppercase" }}>Kaleidoprint</div>
              <div style={{ fontFamily: "'Josefin Sans', sans-serif", fontSize: 9, color: "rgba(255,255,255,0.85)", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 1 }}>by Flora Peach Kaleidoscope</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #e8e0f5", flexShrink: 0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex: 1, padding: "9px 4px", fontSize: 10, fontWeight: 700,
              background: activeTab === t.id ? "#fff0f5" : "transparent",
              color: activeTab === t.id ? "#E8186D" : "#999",
              border: "none", borderBottom: activeTab === t.id ? "2px solid #E8186D" : "2px solid transparent",
              cursor: "pointer", fontFamily: "'Nunito', sans-serif", letterSpacing: 0.3
            }}>{t.label}</button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: 16, flex: 1, overflowY: "auto" }}>
          {activeTab === "board" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Section title="Board Size">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.keys(BOARD_PRESETS).map(p => (
                    <button key={p} onClick={() => handlePreset(p)} style={{
                      padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: boardPreset === p ? "#E8186D" : "#fff0f5",
                      color: boardPreset === p ? "#fff" : "#E8186D",
                      border: "1.5px solid #7c3aed", cursor: "pointer"
                    }}>{p}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <label style={labelStyle}>W (ft)</label>
                  <input type="number" min={1} max={12} value={boardDims.w}
                    onChange={e => { setBoardPreset("custom"); setBoardDims(d => ({...d, w: +e.target.value})); }}
                    style={inputSmall} />
                  <label style={labelStyle}>H (ft)</label>
                  <input type="number" min={1} max={12} value={boardDims.h}
                    onChange={e => { setBoardPreset("custom"); setBoardDims(d => ({...d, h: +e.target.value})); }}
                    style={inputSmall} />
                </div>
              </Section>

              <Section title="Background">
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                    style={{ width: 36, height: 28, borderRadius: 6, border: "1px solid #ddd", cursor: "pointer" }} />
                  {["#FFFDE7","#E3F2FD","#F3E5F5","#E8F5E9","#FFF3E0","#ffffff","#FFF0F5"].map(c => (
                    <div key={c} onClick={() => setBgColor(c)} style={{
                      width: 20, height: 20, borderRadius: 4, background: c,
                      border: bgColor === c ? "2.5px solid #7c3aed" : "1px solid #ccc", cursor: "pointer"
                    }} />
                  ))}
                </div>
              </Section>

              <Section title="Built-in Border">
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[["none","Off"],["solid","Solid"],["wavy","Wavy"]].map(([val, label]) => (
                    <button key={val} onClick={() => setBuiltinBorder(val)} style={{
                      padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: builtinBorder === val ? "#db2777" : "#fff0f6",
                      color: builtinBorder === val ? "#fff" : "#db2777",
                      border: "1.5px solid #db2877", cursor: "pointer"
                    }}>{label}</button>
                  ))}
                </div>
                {builtinBorder !== "none" && <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <label style={labelStyle}>Color</label>
                    <input type="color" value={builtinColor} onChange={e => setBuiltinColor(e.target.value)}
                      style={{ width: 34, height: 28, borderRadius: 6, border: "1px solid #ddd", cursor: "pointer" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={labelStyle}>Thickness</label>
                    <input type="range" min={13} max={26} value={builtinThickness}
                      onChange={e => setBuiltinThickness(+e.target.value)} style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: "#888", minWidth: 40 }}>{((builtinThickness/80)*12).toFixed(1)}"</span>
                  </div>
                </>}
              </Section>

              <Section title="Border Tiles">
                <div style={{ fontSize: 11, color: "#aaa", marginBottom: 10 }}>
                  Upload square PNG tiles to your library, then assign them to each side. Tiles are saved permanently.
                </div>

                {[
                  { side: "top", label: "↑ Top" },
                  { side: "bottom", label: "↓ Bottom" },
                  { side: "left", label: "← Left" },
                  { side: "right", label: "→ Right" },
                ].map(({ side, label }) => {
                  const p = borderPngs[side];
                  return (
                    <div key={side} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f0ebff" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#E8186D", marginBottom: 5 }}>{label}</div>
                      {p?.src ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <img src={p.src} alt={side} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 5, border: "1px solid #e8e0f5", transform: `rotate(${p.rotate || 0}deg)` }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                              {[0, 90, 180, 270].map(deg => (
                                <button key={deg} onClick={() => setBorderSide(side, { rotate: deg })} style={{
                                  width: 28, height: 20, fontSize: 9, fontWeight: 700, borderRadius: 4,
                                  background: (p.rotate || 0) === deg ? "#E8186D" : "#fff0f5",
                                  color: (p.rotate || 0) === deg ? "#fff" : "#E8186D",
                                  border: "1px solid #c4aff8", cursor: "pointer"
                                }}>{deg}°</button>
                              ))}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                              <span style={{ fontSize: 9, color: "#aaa", minWidth: 24 }}>Size</span>
                              <input type="range" min={8} max={52} value={p.patternSize || 18}
                                onChange={e => setBorderSide(side, { patternSize: +e.target.value })}
                                style={{ flex: 1 }} />
                              <span style={{ fontSize: 9, color: "#888", minWidth: 28 }}>{((p.patternSize || 18)/80*12).toFixed(1)}"</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 9, color: "#aaa", minWidth: 24 }}>Tint</span>
                              <input type="color" value={p.tint || "#000000"}
                                onChange={e => setBorderSide(side, { tint: e.target.value })}
                                style={{ width: 24, height: 20, borderRadius: 4, border: "1px solid #e8e0f5", cursor: "pointer", padding: 1 }} />
                              {p.tint && (
                                <button onClick={() => setBorderSide(side, { tint: null })}
                                  style={{ fontSize: 9, color: "#888", background: "none", border: "1px solid #ddd", borderRadius: 3, padding: "1px 5px", cursor: "pointer" }}>Clear</button>
                              )}
                              {!p.tint && <span style={{ fontSize: 9, color: "#ccc" }}>none</span>}
                            </div>
                          </div>
                          <button onClick={() => setBorderSide(side, null)} style={{ fontSize: 11, color: "#e53935", border: "1px solid #e53935", background: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, color: "#bbb", fontStyle: "italic" }}>
                          Click a tile below to assign
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#E8186D", letterSpacing: 1, textTransform: "uppercase" }}>Library ({borderTileLibrary.length})</span>
                  <button onClick={() => borderTileRef.current.click()} style={{ fontSize: 10, color: "#E8186D", border: "1px solid #c4aff8", background: "#fff0f5", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>+ Upload</button>
                </div>
                <input ref={borderTileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={e => {
                    const f = e.target.files[0]; if (!f) return;
                    const name = f.name.replace(/\.[^.]+$/, "");
                    const r = new FileReader();
                    r.onload = ev => {
                      const src = ev.target.result;
                      setBorderTileLibrary(prev => prev.some(t => t.src === src) ? prev : [...prev, { id: `bt-${Date.now()}`, src, name }]);
                    };
                    r.readAsDataURL(f); e.target.value = "";
                  }}
                  style={{ display: "none" }} />

                {borderLibLoaded && borderTileLibrary.length === 0 && (
                  <div style={{ fontSize: 11, color: "#bbb", fontStyle: "italic" }}>No tiles yet — upload one above.</div>
                )}
                {borderLibLoaded && borderTileLibrary.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: "#aaa", marginBottom: 6 }}>Click a tile to assign to all 4 sides, or use the arrows for individual sides.</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
                      {borderTileLibrary.map(tile => (
                        <div key={tile.id} style={{ position: "relative" }}>
                          <div
                            onClick={() => {
                              ["top","bottom","left","right"].forEach(side => setBorderSide(side, { src: tile.src, rotate: 0 }));
                            }}
                            title={`${tile.name} — click to assign all sides`}
                            style={{ width: "100%", paddingBottom: "100%", position: "relative", borderRadius: 7, border: "1.5px solid #e8e0f5", background: "#fafafa", cursor: "pointer", overflow: "hidden" }}
                          >
                            <img src={tile.src} alt={tile.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                          <div style={{ display: "flex", gap: 2, marginTop: 3, justifyContent: "center" }}>
                            {["↑","↓","←","→"].map((arrow, i) => {
                              const sides = ["top","bottom","left","right"];
                              return (
                                <button key={i} onClick={() => setBorderSide(sides[i], { src: tile.src, rotate: 0 })}
                                  title={`Assign to ${sides[i]}`}
                                  style={{ flex: 1, fontSize: 9, padding: "1px 0", borderRadius: 3, border: "1px solid #c4aff8", background: "#fff0f5", color: "#E8186D", cursor: "pointer" }}>
                                  {arrow}
                                </button>
                              );
                            })}
                          </div>
                          <button onClick={() => setBorderTileLibrary(prev => prev.filter(t => t.id !== tile.id))}
                            style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#ff4444", color: "#fff", border: "none", fontSize: 9, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            </div>
          )}

          {activeTab === "letters" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Section title="Font">
                <select value={letterFont} onChange={e => setLetterFont(e.target.value)} style={selectStyle}>
                  {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Section>
              <Section title="Color">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input type="color" value={letterColor || LETTER_COLORS[letterColorIdx % LETTER_COLORS.length]}
                    onChange={e => setLetterColor(e.target.value)}
                    style={{ width: 36, height: 32, borderRadius: 6, border: "2px solid #e8e0f5", cursor: "pointer", padding: 1 }} />
                  <button onClick={() => { setLetterColor(null); setLetterColorIdx(0); }} style={{
                    fontSize: 11, color: "#E8186D", background: "none", border: "1px solid #c4aff8",
                    borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontFamily: "'Nunito', sans-serif",
                    opacity: letterColor ? 1 : 0.4
                  }}>Auto rainbow</button>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {LETTER_COLORS.map(c => (
                    <div key={c} onClick={() => setLetterColor(c)} style={{
                      width: 22, height: 22, borderRadius: 4, background: c,
                      border: letterColor === c ? "2.5px solid #333" : "1px solid #ccc",
                      cursor: "pointer"
                    }} />
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#aaa" }}>
                  {letterColor ? "Fixed color — all new letters use this color." : "Auto rainbow — each letter gets the next color."}
                </div>
              </Section>
              <Section title="Pick a Letter">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {LETTERS.map((l, i) => (
                    <button key={l} onClick={() => addLetter(l)} style={{
                      width: 30, height: 30, borderRadius: 6, fontSize: 14, fontWeight: 900,
                      fontFamily: letterFont,
                      background: letterColor || LETTER_COLORS[i % LETTER_COLORS.length],
                      color: "#fff", border: "none", cursor: "pointer",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.12)"
                    }}>{l}</button>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "#aaa" }}>
                  Click to place · Drag to move · Select to resize/recolor
                </div>
              </Section>
            </div>
          )}

          {activeTab === "clipart" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Section title="Upload to Library">
                <button onClick={() => fileRef.current.click()} style={primaryBtn}>📎 Upload PNG / JPG</button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
                  multiple onChange={handleImageUpload} style={{ display: "none" }} />
                <div style={{ marginTop: 8, fontSize: 11, color: "#aaa" }}>
                  Uploads save to your library permanently. Click any image to place it on the board.
                </div>
              </Section>

              <Section title={`Library (${clipartLibrary.length})`}>
                {!libraryLoaded && <div style={{ fontSize: 12, color: "#aaa" }}>Loading...</div>}
                {libraryLoaded && clipartLibrary.length === 0 && (
                  <div style={{ fontSize: 12, color: "#bbb", fontStyle: "italic" }}>No images yet — upload one above.</div>
                )}
                {libraryLoaded && clipartLibrary.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {clipartLibrary.map(clip => (
                      <div key={clip.id} style={{ position: "relative" }}>
                        <div
                          onClick={() => {
                            const img = new Image();
                            img.onload = () => {
                              const maxDim = 120;
                              const ratio = img.width / img.height;
                              const w = ratio >= 1 ? maxDim : Math.round(maxDim * ratio);
                              const h = ratio < 1 ? maxDim : Math.round(maxDim / ratio);
                              addItem({
                                type: "image",
                                src: clip.src,
                                w,
                                h,
                                aspect: img.height / img.width,   // ← add this
                              });
                              };
                            img.src = clip.src;
                          }}
                          title={clip.name}
                          style={{
                            width: "100%", paddingBottom: "100%", position: "relative",
                            borderRadius: 8, border: "1.5px solid #e8e0f5",
                            background: "#fafafa", cursor: "pointer", overflow: "hidden"
                          }}
                        >
                          <img src={clip.src} alt={clip.name} style={{
                            position: "absolute", inset: 0, width: "100%", height: "100%",
                            objectFit: "contain", padding: 4
                          }} />
                        </div>
                        <button
                          onClick={() => setClipartLibrary(prev => prev.filter(c => c.id !== clip.id))}
                          title="Remove from library"
                          style={{
                            position: "absolute", top: -5, right: -5,
                            width: 18, height: 18, borderRadius: "50%",
                            background: "#ff4444", color: "#fff", border: "none",
                            fontSize: 11, fontWeight: 700, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            lineHeight: 1, padding: 0
                          }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          )}

          {activeTab === "phrases" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Section title="Phrase Builder">
                <textarea value={phrase} onChange={e => setPhrase(e.target.value)}
                  placeholder="Type a phrase..." rows={2}
                  style={{ ...inputFull, resize: "vertical", marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <select value={phraseFont} onChange={e => setPhraseFont(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <input type="color" value={phraseColor} onChange={e => setPhraseColor(e.target.value)}
                    style={{ width: 36, height: 28, borderRadius: 6, border: "1px solid #ddd" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <label style={labelStyle}>Size</label>
                  <input type="range" min={14} max={80} value={phraseSize}
                    onChange={e => setPhraseSize(+e.target.value)} style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: "#888", minWidth: 22 }}>{phraseSize}</span>
                </div>
                <button onClick={addPhrase} style={primaryBtn}>➕ Add to Board</button>
              </Section>
            </div>
          )}
        </div>

        {/* Properties panel */}
        {selectedIds.size > 1 && (
          <div style={{ padding: "12px 16px", borderTop: "2px solid #E8186D", background: "#fff5f8" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#E8186D", marginBottom: 8 }}>
              {selectedIds.size} items selected
              </div>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>
              Drag any selected item to move them all
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: "#888", minWidth: 72 }}>Scale group</span>
              <input type="range" min={25} max={300} step={5} value={groupScale}
                onChange={e => applyGroupScale(+e.target.value)}
                onPointerUp={endGroupScale} onKeyUp={endGroupScale}
                style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: "#888", minWidth: 36 }}>{groupScale}%</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => deleteItem(null)} style={{
                flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 700,
                background: "#fff0f0", color: "#e53935", border: "1px solid #e53935",
                borderRadius: 6, cursor: "pointer", fontFamily: "'Nunito', sans-serif"
              }}>Delete all</button>
              <button onClick={() => setSelectedIds(new Set())} style={{
                flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 700,
                background: "#fff0f5", color: "#E8186D", border: "1px solid #c4aff8",
                borderRadius: 6, cursor: "pointer", fontFamily: "'Nunito', sans-serif"
              }}>Deselect</button>
            </div>
          </div>
        )}
        {selectedIds.size === 1 && selectedItem && (
          <PropertiesPanel
            item={selectedItem}
            onUpdate={updateItem}
            onDelete={() => deleteItem(selectedId)}
            onZUp={() => zUp(selectedId)}
            onZDown={() => zDown(selectedId)}
          />
        )}

        {/* Undo + Export */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #e8e0f5", flexShrink: 0 }}>
          <button
            onClick={() => {
              if (history.current.length === 0) return;
              const prev = history.current[history.current.length - 1];
              history.current = history.current.slice(0, -1);
              setItems(prev);
              setSelectedIds(new Set());
            }}
            style={{
              ...primaryBtn, background: "#fff0f5", color: history.current.length ? "#E8186D" : "#ccc",
              border: "1px solid #c4aff8", marginBottom: 8,
              opacity: history.current.length ? 1 : 0.5,
              cursor: history.current.length ? "pointer" : "default"
            }}
          >
            ↩ Undo {history.current.length > 0 ? `(${history.current.length})` : ""}
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
            <span style={{ fontSize: 11, color: "#666", fontFamily: "'Nunito', sans-serif" }}>
              Show page grid
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={printBg} onChange={e => setPrintBg(e.target.checked)} />
            <span style={{ fontSize: 11, color: "#666", fontFamily: "'Nunito', sans-serif" }}>
              Print background color
            </span>
          </label>
          <button
            onClick={async () => {
              setExporting(true);
              try {
                await exportPDF({ borderPngs, bgColor, boardDims, items, printBg, borderSize, builtinBorder, builtinColor, builtinThickness });
              } catch(e) { alert("Export failed: " + e.message); }
              setExporting(false);
            }}
            disabled={exporting}
            style={{ ...primaryBtn, background: "linear-gradient(135deg, #E8186D, #F07A20)", opacity: exporting ? 0.6 : 1, cursor: exporting ? "wait" : "pointer" }}
          >
            {exporting ? "⏳ Generating PDF..." : "📄 Export PDF"}
          </button>
          <div style={{ fontSize: 10, color: "#aaa", textAlign: "center", marginTop: 5 }}>
            Prints on standard 8.5×11 paper
          </div>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"#f0ebff" }}>
        {/* Toolbar */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 16px", background:"rgba(255,255,255,0.8)", borderBottom:"1px solid #e8e0f5", flexShrink:0 }}>
          <span style={{ fontSize:11, color:"#888", fontFamily:"'Nunito',sans-serif" }}>Zoom</span>
          <button onClick={() => setZoom(z => Math.max(0.25, +((z-0.25).toFixed(2))))} style={{ width:26, height:26, borderRadius:6, border:"1px solid #c4aff8", background:"#fff0f5", color:"#E8186D", fontSize:16, cursor:"pointer", lineHeight:1 }}>−</button>
          <span style={{ fontSize:12, fontWeight:700, color:"#E8186D", minWidth:36, textAlign:"center", fontFamily:"'Nunito',sans-serif" }}>{Math.round(zoom*100)}%</span>
          <button onClick={() => setZoom(z => Math.min(4, +((z+0.25).toFixed(2))))} style={{ width:26, height:26, borderRadius:6, border:"1px solid #c4aff8", background:"#fff0f5", color:"#E8186D", fontSize:16, cursor:"pointer", lineHeight:1 }}>+</button>
          <button onClick={() => setZoom(1)} style={{ fontSize:10, color:"#888", border:"1px solid #ddd", background:"#fff", borderRadius:6, padding:"2px 7px", cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>Reset</button>
          <input type="range" min={25} max={400} step={25} value={Math.round(zoom*100)} onChange={e => setZoom(+e.target.value/100)} style={{ flex:1, maxWidth:120 }} />
          <button onClick={() => setPan({ x: 0, y: 0 })} style={{ fontSize:10, color:"#888", border:"1px solid #ddd", background:"#fff", borderRadius:6, padding:"2px 7px", cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>Center</button>
          <span style={{ fontSize:10, color:"#bbb", fontFamily:"'Nunito',sans-serif", marginLeft:4 }}>Drag background to pan</span>
        </div>

        {/* Canvas scroll area with pan */}
        <div
          ref={canvasAreaRef}
          style={{ flex:1, overflow:"auto", padding:24, display:"flex", alignItems:"flex-start", justifyContent:"center", cursor: isPanning.current ? "grabbing" : "grab" }}
          onMouseDown={e => {
            // Only pan when clicking the background (not an item)
            if (e.target === canvasAreaRef.current || e.target.tagName === "DIV") {
              isPanning.current = true;
              panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
              e.currentTarget.style.cursor = "grabbing";
            }
          }}
          onMouseMove={e => {
            if (!isPanning.current) return;
            setPan({
              x: panStart.current.px + e.clientX - panStart.current.mx,
              y: panStart.current.py + e.clientY - panStart.current.my,
            });
          }}
          onMouseUp={e => {
            isPanning.current = false;
            e.currentTarget.style.cursor = "grab";
          }}
          onMouseLeave={e => {
            isPanning.current = false;
            e.currentTarget.style.cursor = "grab";
          }}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "top left",
              boxShadow: "0 8px 48px rgba(124,58,237,0.2)",
              borderRadius: 8,
              flexShrink: 0,
            }}
            onClick={e => e.stopPropagation()}
          >
            <svg
              ref={canvasRef}
              width={cw} height={ch}
              style={{ display: "block", borderRadius: 8 }}
              xmlns="http://www.w3.org/2000/svg"
              onMouseDown={startMarquee}
            >
              <rect x={0} y={0} width={cw} height={ch} fill={bgColor} style={{ cursor: "crosshair" }} />

              <PngBorder x={0} y={0} width={cw} height={ch} size={borderSize} pngs={borderPngs} patternSize={18} />
              {builtinBorder === "solid" && (
                <g>
                  <rect x={0} y={0} width={cw} height={builtinThickness} fill={builtinColor} />
                  <rect x={0} y={ch-builtinThickness} width={cw} height={builtinThickness} fill={builtinColor} />
                  <rect x={0} y={0} width={builtinThickness} height={ch} fill={builtinColor} />
                  <rect x={cw-builtinThickness} y={0} width={builtinThickness} height={ch} fill={builtinColor} />
                </g>
              )}
              {builtinBorder === "wavy" && (
                <WavyBorder x={0} y={0} width={cw} height={ch} thickness={builtinThickness} color={builtinColor} />
              )}

              {showGrid && <PageGrid cw={cw} ch={ch} boardDims={boardDims} />}

              {items.map(item => {
                const isSel = selectedIds.has(item.id);
                return (
                  <DraggableItem key={item.id} item={item} scale={scale}
                    selected={isSel}
                    onSelect={(id, e) => {
                      if (e && (e.metaKey || e.ctrlKey || e.shiftKey)) {
                        setSelectedIds(prev => {
                          const n = new Set(prev);
                          n.has(id) ? n.delete(id) : n.add(id);
                          return n;
                        });
                      } else if (!selectedRef.current.has(id)) {
                        setSelectedIds(new Set([id]));
                      }
                    }}
                    onTap={(id, e) => {
                      if (!(e.metaKey || e.ctrlKey || e.shiftKey) && selectedRef.current.size > 1) {
                        setSelectedIds(new Set([id]));
                      }
                    }}
                    onMove={moveItem}
                    onSnapshot={snapshot}>

                    {item.type === "letter" && (() => {
                      const cx = item.x + (item.size * 0.36);
                      const cy = item.y + (item.size * 0.5);
                      return <text
                        x={item.x} y={item.y + item.size}
                        fontFamily={`'${item.font}', cursive`}
                        fontSize={item.size} fill={item.color}
                        stroke="#fff" strokeWidth={3} paintOrder="stroke"
                        style={{ userSelect: "none" }}
                        transform={item.rotate ? `rotate(${item.rotate} ${cx} ${cy})` : undefined}
                      >{item.letter}</text>;
                    })()}

                    {item.type === "phrase" && (() => {
                      const pw = item.text.length * item.size * 0.56;
                      const cx = item.x + pw / 2;
                      const cy = item.y + item.size * 0.5;
                      return <text
                        x={item.x} y={item.y + item.size}
                        fontFamily={`'${item.font}', cursive`}
                        fontSize={item.size} fill={item.color}
                        stroke="#fff" strokeWidth={2} paintOrder="stroke"
                        style={{ userSelect: "none" }}
                        transform={item.rotate ? `rotate(${item.rotate} ${cx} ${cy})` : undefined}
                      >{item.text}</text>;
                    })()}

                    {item.type === "image" && (
                      <image
                        href={item.src}
                        x={item.x} y={item.y}
                        width={item.w || item.size} height={item.h || item.size}
                        preserveAspectRatio="xMidYMid meet"
                        transform={item.rotate ? `rotate(${item.rotate} ${item.x + (item.w||item.size)/2} ${item.y + (item.h||item.size)/2})` : undefined}
                      />
                    )}

                    {isSel && (
                      <SelectionBox item={item} scale={scale} onResize={handleResize} />
                    )}
                  </DraggableItem>
                );
              })}

              {marquee && (
                <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
                  fill="rgba(232,24,109,0.08)" stroke="#E8186D" strokeWidth={1 / scale}
                  strokeDasharray={`${4 / scale} ${3 / scale}`} pointerEvents="none" />
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#E8186D", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

const labelStyle = { fontSize: 11, color: "#999", whiteSpace: "nowrap", alignSelf: "center" };
const inputSmall = { width: 50, padding: "4px 6px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "'Nunito', sans-serif" };
const inputFull = { width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, fontFamily: "'Nunito', sans-serif", boxSizing: "border-box" };
const selectStyle = { padding: "5px 8px", borderRadius: 8, border: "1px solid #ddd", fontSize: 12, fontFamily: "'Nunito', sans-serif" };
const primaryBtn = { background: "#E8186D", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", width: "100%" };
