import { jsPDF } from 'jspdf';

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_W = 8.5;   // inches
const PAGE_H = 11;    // inches
const MARGIN = 0.4;   // inches
const PRINT_W = PAGE_W - MARGIN * 2;
const PRINT_H = PAGE_H - MARGIN * 2;
const PT = 72;        // points per inch
const SCALE_BASE = 80; // canvas px per foot (must match Kaleidoprint.jsx)

// Board page grid: each page covers one CELL of the board plus an OVERLAP strip
// of the next cell (right and below) for lining pages up. The app's grid uses these too.
export const OVERLAP = 0.5;               // inches
export const CELL_W = PRINT_W - OVERLAP;  // 7.2"
export const CELL_H = PRINT_H - OVERLAP;  // 9.7"

// Convert inches to points
function i(v) { return v * PT; }

// Canvas px → real inches
// boardDims.w feet wide = boardDims.w * SCALE_BASE canvas px wide
function pxToIn(px, boardDims) {
  // 1 ft = SCALE_BASE px = 12 inches
  return (px / SCALE_BASE) * 12;
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = (hex || "#000000").replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function setFill(doc, hex) { const [r,g,b] = hexToRgb(hex); doc.setFillColor(r,g,b); }
function setDraw(doc, hex) { const [r,g,b] = hexToRgb(hex); doc.setDrawColor(r,g,b); }
function setTextCol(doc, hex) { const [r,g,b] = hexToRgb(hex); doc.setTextColor(r,g,b); }

// ── Dashed rect ────────────────────────────────────────────────────────────────

function dashedRect(doc, x, y, w, h, label) {
  doc.setLineDashPattern([0.08, 0.08], 0);
  setDraw(doc, "#aaaaaa");
  doc.setLineWidth(0.008 * PT);
  doc.rect(x, y, w, h, "S");
  doc.setLineDashPattern([], 0);
  if (label) {
    doc.setFont("helvetica", "normal");
    setTextCol(doc, "#aaaaaa");
    doc.setFontSize(6.5);
    doc.text(label, x + w / 2, y - i(0.07), { align: "center" });
  }
}

// ── Scallop drawing ───────────────────────────────────────────────────────────
// cx = center x, flatY = y of flat edge, r = radius, domeDown = dome direction
function drawScallopHorizPDF(doc, cx, flatY, r, domeDown) {
  const steps = 16;
  const pts = [];
  for (let a = 0; a <= steps; a++) {
    const angle = Math.PI * a / steps;
    pts.push([
      cx - r * Math.cos(angle),
      flatY + (domeDown ? 1 : -1) * r * Math.sin(angle)
    ]);
  }
  pts.push([cx - r, flatY]); // close flat edge
  const start = pts[0];
  const moves = pts.slice(1).map((p, k) => [p[0] - pts[k][0], p[1] - pts[k][1]]);
  doc.lines(moves, start[0], start[1], [1, 1], "F", true);
}

// cy = center y, flatX = x of flat edge, r = radius, domeRight = dome direction  
function drawScallopVertPDF(doc, flatX, cy, r, domeRight) {
  const steps = 16;
  const pts = [];
  for (let a = 0; a <= steps; a++) {
    const angle = Math.PI * a / steps;
    pts.push([
      flatX + (domeRight ? 1 : -1) * r * Math.sin(angle),
      cy - r * Math.cos(angle)
    ]);
  }
  pts.push([flatX, cy - r]); // close flat edge
  const start = pts[0];
  const moves = pts.slice(1).map((p, k) => [p[0] - pts[k][0], p[1] - pts[k][1]]);
  doc.lines(moves, start[0], start[1], [1, 1], "F", true);
}

// ── Border drawing on a page ───────────────────────────────────────────────────

function drawBorderTile(doc, { borderStyle, borderColors, borderEnabled, borderPngs, bgColor, boardDims, borderSize, tileX, tileY, tileW, tileH, side }) {
  // tileX/Y = where in the real board (inches) this page starts
  // tileW/H = how much of the real board this page shows
  // side = "top"|"bottom"|"left"|"right"

  // Map slider range (16-52px) to print range (1-3 inches)
  const bs = borderSize || 28;
  const BORDER_IN = ((bs - 16) / (52 - 16)) * (3 - 1) + 1;
  const colors = borderColors && borderColors.length ? borderColors : ["#FF4E50"];

  // Draw the border strip that falls within this tile
  const boardW = boardDims.w * 12; // inches
  const boardH = boardDims.h * 12;

  // Strip real coords (in board inches)
  const strips = {
    top:    { rx: 0,              ry: 0,              rw: boardW, rh: BORDER_IN },
    bottom: { rx: 0,              ry: boardH-BORDER_IN, rw: boardW, rh: BORDER_IN },
    left:   { rx: 0,              ry: 0,              rw: BORDER_IN, rh: boardH },
    right:  { rx: boardW-BORDER_IN, ry: 0,            rw: BORDER_IN, rh: boardH },
  };

  const strip = strips[side];

  // Clip to this tile
  const visX = Math.max(strip.rx, tileX);
  const visY = Math.max(strip.ry, tileY);
  const visX2 = Math.min(strip.rx + strip.rw, tileX + tileW);
  const visY2 = Math.min(strip.ry + strip.rh, tileY + tileH);
  if (visX2 <= visX || visY2 <= visY) return; // not visible on this tile

  const pageX = i(MARGIN + (visX - tileX));
  const pageY = i(MARGIN + (visY - tileY));
  const pageW = i(visX2 - visX);
  const pageH = i(visY2 - visY);

  const png = borderPngs && borderPngs[side];
  if (png?.src) {
    try {
      const fmt = png.src.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(png.src, fmt, pageX, pageY, pageW, pageH);
    } catch(e) {}
    return;
  }

  if (!borderEnabled) return;

  // Draw tiled pattern
  const isVert = side === "left" || side === "right";
  const tileSize = BORDER_IN; // each element is BORDER_IN × BORDER_IN inches
  const stripStart = isVert ? visY : visX;
  const stripEnd = isVert ? visY2 : visX2;
  const count = Math.ceil((stripEnd - stripStart) / tileSize) + 1;

  for (let idx = 0; idx < count; idx++) {
    const color = colors[idx % colors.length];
    const [r,g,b] = hexToRgb(color);
    doc.setFillColor(r,g,b);

    if (isVert) {
      const elemY = stripStart + idx * tileSize;
      const px = pageX;
      const py = i(MARGIN + (elemY - tileY));
      const cx = px + pageW / 2;
      const cy = py + i(tileSize / 2);
      if (borderStyle === "solid") { doc.rect(pageX, pageY, pageW, pageH, "F"); return; }
      if (borderStyle === "scallop") {
        const [rc,gc,bc] = hexToRgb(color); doc.setFillColor(rc,gc,bc);
        const flatX = side === "left" ? px : px + pageW;
        drawScallopVertPDF(doc, flatX, cy, i(tileSize / 2), side === "left");
      }
      if (borderStyle === "dots")    doc.circle(cx, cy, i(tileSize * 0.38), "F");
      if (borderStyle === "triangle") {
        if (side === "left")  doc.triangle(px + pageW, py, px, cy, px + pageW, py + i(tileSize), "F");
        else                  doc.triangle(px, py, px + pageW, cy, px, py + i(tileSize), "F");
      }
    } else {
      const elemX = stripStart + idx * tileSize;
      const px = i(MARGIN + (elemX - tileX));
      const py = pageY;
      const cx = px + i(tileSize / 2);
      const cy = py + pageH / 2;
      if (borderStyle === "solid") { doc.rect(pageX, pageY, pageW, pageH, "F"); return; }
      if (borderStyle === "scallop") {
        const [rc,gc,bc] = hexToRgb(color); doc.setFillColor(rc,gc,bc);
        const flatY = side === "top" ? py : py + pageH;
        drawScallopHorizPDF(doc, cx, flatY, i(tileSize / 2), side === "top");
      }
      if (borderStyle === "dots")    doc.circle(cx, cy, i(tileSize * 0.38), "F");
      if (borderStyle === "triangle") {
        if (side === "top")    doc.triangle(px, py + pageH, cx, py, px + i(tileSize), py + pageH, "F");
        else                   doc.triangle(px, py, cx, py + pageH, px + i(tileSize), py, "F");
      }
    }
  }
}

// ── Cover page ─────────────────────────────────────────────────────────────────

function drawCoverPage(doc, { boardDims, items, borderStyle, borderEnabled }) {
  const cx = PAGE_W / 2;
  const letters = items.filter(it => it.type === "letter");
  const phrases = items.filter(it => it.type === "phrase");
  const images  = items.filter(it => it.type === "image");

  doc.setFont("helvetica", "bold");
  setTextCol(doc, "#7c3aed");
  doc.setFontSize(28);
  doc.text("Kaleidoprint", i(cx), i(1.2), { align: "center" });

  doc.setFont("helvetica", "normal");
  setTextCol(doc, "#555555");
  doc.setFontSize(13);
  doc.text("Bulletin Board Print Kit", i(cx), i(1.65), { align: "center" });

  setFill(doc, "#f3eeff");
  doc.roundedRect(i(MARGIN), i(2.1), i(PRINT_W), i(1.5), 4, 4, "F");

  doc.setFont("helvetica", "bold");
  setTextCol(doc, "#7c3aed");
  doc.setFontSize(11);
  doc.text("Board Size", i(MARGIN + 0.2), i(2.45));
  doc.setFont("helvetica", "normal");
  setTextCol(doc, "#333333");
  doc.setFontSize(10);
  doc.text(`${boardDims.w} ft × ${boardDims.h} ft  (${boardDims.w * 12}" × ${boardDims.h * 12}")`, i(MARGIN + 0.2), i(2.7));

  doc.setFont("helvetica", "bold");
  setTextCol(doc, "#7c3aed");
  doc.setFontSize(11);
  doc.text("Border", i(cx), i(2.45));
  doc.setFont("helvetica", "normal");
  setTextCol(doc, "#333333");
  doc.setFontSize(10);
  doc.text(borderEnabled ? borderStyle : "PNG tiles only", i(cx), i(2.7));

  // How many pages per item type
  const countBorderPages = () => {
    let total = 0;
    ["top","bottom","left","right"].forEach(side => {
      const isVert = side === "left" || side === "right";
      const realLen = isVert ? boardDims.h * 12 : boardDims.w * 12;
      total += Math.ceil(realLen / PRINT_W);
    });
    return total;
  };

  const rows = [
    ["Border strips", `${countBorderPages()} pages (tiles across full board length)`],
    ["Board pages", `${letters.length + phrases.length + images.length} items printed exactly where they sit on the board`],
    ["Letters / phrases", `${letters.length} letter${letters.length !== 1 ? "s" : ""}, ${phrases.length} phrase${phrases.length !== 1 ? "s" : ""}`],
    ["Clipart", `${images.length} image${images.length !== 1 ? "s" : ""}`],
  ];

  let ry = 4.0;
  doc.setFont("helvetica", "bold");
  setTextCol(doc, "#333333");
  doc.setFontSize(12);
  doc.text("What's in this PDF", i(cx), i(ry - 0.15), { align: "center" });

  rows.forEach(([label, val], idx) => {
    const rowY = ry + 0.35 + idx * 0.42;
    if (idx % 2 === 0) { setFill(doc, "#fafafa"); doc.rect(i(MARGIN), i(rowY - 0.18), i(PRINT_W), i(0.36), "F"); }
    doc.setFont("helvetica", "bold"); setTextCol(doc, "#555555"); doc.setFontSize(10);
    doc.text(label, i(MARGIN + 0.2), i(rowY + 0.08));
    doc.setFont("helvetica", "normal");
    doc.text(val, i(PAGE_W - MARGIN - 0.2), i(rowY + 0.08), { align: "right" });
  });

  const instrY = 6.6;
  setFill(doc, "#fff8e1");
  doc.roundedRect(i(MARGIN), i(instrY), i(PRINT_W), i(2.8), 4, 4, "F");
  doc.setFont("helvetica", "bold"); setTextCol(doc, "#f57f17"); doc.setFontSize(11);
  doc.text("Print Instructions", i(MARGIN + 0.2), i(instrY + 0.35));

  const instructions = [
    "• Print all pages on standard 8.5\" × 11\" paper",
    "• Use cardstock for letters and clipart (recommended)",
    "• Board pages print at true size, in the same rows/columns as the app's grid",
    "• See the Board Page Map (next page) for where each page goes and how to overlap them",
    "• Border strips: tape end-to-end along each edge of your board",
    "• Page labels show which row/column each tile belongs to",
  ];
  doc.setFont("helvetica", "normal"); setTextCol(doc, "#555555"); doc.setFontSize(9.5);
  instructions.forEach((line, idx) => doc.text(line, i(MARGIN + 0.2), i(instrY + 0.7 + idx * 0.33)));
}

// ── Border strip pages (landscape, multiple strips per page) ──────────────────

async function drawBorderPages(doc, state) {
  const { boardDims, bgColor } = state;
  // Skip if no PNG borders are uploaded
  const hasPngBorder = state.borderPngs && Object.values(state.borderPngs).some(p => p?.src);
  if (!hasPngBorder) return;

  const BORDER_IN = 2.75; // strip always prints at 2.75" tall
  // ps is now per-side — see BORDER_IN_PX in drawBorderStripDirect

  // Portrait dimensions
  const PW = PAGE_W;  // 8.5" wide
  const PH = PAGE_H;  // 11" tall
  const STRIP_W = PW - MARGIN * 2; // printable width per strip
  const STRIP_GAP = 0.3; // gap between strips on same page

  // How many strips fit on one portrait page
  const LABEL_H = 0.2;
  const stripsPerPage = Math.max(1, Math.floor((PH - MARGIN * 2 + STRIP_GAP) / (BORDER_IN + LABEL_H + STRIP_GAP)));

  const sides = [
    { side: "top",    label: "TOP" },
    { side: "bottom", label: "BOTTOM" },
    { side: "left",   label: "LEFT" },
    { side: "right",  label: "RIGHT" },
  ];

  // Collect all strip segments across all sides
  const allSegments = [];
  sides.forEach(({ side, label }) => {
    const isVert = side === "left" || side === "right";
    const stripLen = isVert ? boardDims.h * 12 : boardDims.w * 12;
    const numSegments = Math.ceil(stripLen / STRIP_W);
    for (let seg = 0; seg < numSegments; seg++) {
      allSegments.push({ side, label, seg, numSegments, stripLen, offsetIn: seg * STRIP_W });
    }
  });

  // Pack segments onto landscape pages
  for (let s = 0; s < allSegments.length; s += stripsPerPage) {
    doc.addPage();

    const batch = allSegments.slice(s, s + stripsPerPage);

    // Footer
    doc.setFont("helvetica", "bold"); setTextCol(doc, "#cccccc"); doc.setFontSize(7);
    doc.text("KALEIDOPRINT — BORDER STRIPS",
      i(PAGE_W / 2), i(PAGE_H - 0.2), { align: "center" });

    const LABEL_H = 0.2; // space for label above each strip
    for (let idx = 0; idx < batch.length; idx++) {
      const { side, label, seg, numSegments, stripLen, offsetIn } = batch[idx];
      const rowY = MARGIN + idx * (BORDER_IN + LABEL_H + STRIP_GAP) + LABEL_H;
      const visLen = Math.min(STRIP_W, stripLen - offsetIn);

      // Strip label
      doc.setFont("helvetica", "bold"); setTextCol(doc, "#7c3aed"); doc.setFontSize(8);
      doc.text(`${label}  ${seg + 1}/${numSegments}`,
        i(MARGIN), i(rowY - 0.05));

      // Background
      setFill(doc, bgColor || "#ffffff");
      doc.rect(i(MARGIN), i(rowY), i(visLen), i(BORDER_IN), "F");

      const isVertSide = side === "left" || side === "right";
      await drawBorderStripDirect(doc, {
        ...state,
        BORDER_IN,
        BORDER_IN_PX: (state.borderPngs && state.borderPngs[side]?.patternSize) || state.patternSize || 18,
        stripOffsetX: i(MARGIN),
        stripOffsetY: i(rowY),
        stripWidthPt: i(visLen),
        stripHeightPt: i(BORDER_IN),
        side,
        segOffsetIn: offsetIn,
        isVertSide, // flag to rotate tile for vertical application
      });

      // Cut line
      dashedRect(doc, i(MARGIN), i(rowY), i(visLen), i(BORDER_IN),
        `${label} · ${offsetIn.toFixed(1)}"–${Math.min(offsetIn + STRIP_W, stripLen).toFixed(1)}" of ${stripLen}"`);
    }
  }
}

// Draw border pattern directly at given page coordinates (no board-space clipping needed)
async function drawBorderStripDirect(doc, { borderStyle, borderColors, borderEnabled, borderPngs, bgColor, BORDER_IN_PX,
  BORDER_IN, stripOffsetX, stripOffsetY, stripWidthPt, stripHeightPt, side, segOffsetIn, isVertSide }) {

  const png = borderPngs && borderPngs[side];
  if (png?.src) {
    try {
      const tileInches = (BORDER_IN_PX / 80) * 12;
      const tilePt = i(tileInches);
      const tileCount = Math.ceil(stripWidthPt / tilePt) + 2;

      // Draw white background behind entire strip first
      doc.setFillColor(255, 255, 255);
      doc.rect(stripOffsetX, stripOffsetY, stripWidthPt, stripHeightPt, "F");

      // Convert PNG to JPEG via canvas with white background
      const tileImg = new Image();
      tileImg.crossOrigin = "anonymous";
      await new Promise((res, rej) => {
        tileImg.onload = res;
        tileImg.onerror = rej;
        tileImg.src = png.src;
      });
      const sz = 512; // fixed size for consistent rendering
      const c = document.createElement("canvas");
      c.width = sz; c.height = sz;
      const ctx = c.getContext("2d");
      // Apply rotation: user setting + extra 90deg for vertical sides
      const baseRot = png.rotate || 0;
      const rot = isVertSide ? (baseRot + 90) % 360 : baseRot;

      // Draw image on transparent canvas first
      ctx.clearRect(0, 0, sz, sz);
      if (rot) {
        ctx.translate(sz / 2, sz / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(tileImg, -sz / 2, -sz / 2, sz, sz);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        ctx.drawImage(tileImg, 0, 0, sz, sz);
      }

      // Apply tint to non-transparent pixels
      const imgData = ctx.getImageData(0, 0, sz, sz);
      const d = imgData.data;
      const tintColor = png.tint ? hexToRgb(png.tint) : null;
      for (let px = 0; px < d.length; px += 4) {
        const alpha = d[px+3];
        if (alpha > 10) {
          if (tintColor) {
            d[px]   = tintColor[0];
            d[px+1] = tintColor[1];
            d[px+2] = tintColor[2];
          }
          // Make fully opaque for JPEG (white background for transparent areas)
          d[px+3] = 255;
        } else {
          // Transparent = white background
          d[px]   = 255;
          d[px+1] = 255;
          d[px+2] = 255;
          d[px+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      const jpeg = c.toDataURL("image/jpeg", 0.9);

      // All sides tile horizontally as strips — left/right just have more segments
      for (let t = 0; t < tileCount; t++) {
        const tx = stripOffsetX + t * tilePt;
        if (tx >= stripOffsetX + stripWidthPt) break;
        doc.addImage(jpeg, "JPEG", tx, stripOffsetY, tilePt, tilePt,
          `t${side}${Math.round(stripOffsetY)}x${t}`);
      }
    } catch(e) { console.error("PNG border error:", e); }
    return;
  }

  if (!borderEnabled) return;

  const colors = borderColors && borderColors.length ? borderColors : ["#FF4E50"];

  if (borderStyle === "solid") {
    setFill(doc, colors[0]);
    doc.rect(stripOffsetX, stripOffsetY, stripWidthPt, stripHeightPt, "F");
    return;
  }

  const MAX_ELEM_PT = i(0.75);
  const elemPt = Math.min(stripHeightPt, MAX_ELEM_PT);
  const dotRadius = elemPt * 0.46;
  const vertOffset = (stripHeightPt - elemPt) / 2;
  const count = Math.ceil(stripWidthPt / elemPt) + 2;

  // Calculate how many whole elements fit before this segment starts
  // so the color pattern continues seamlessly across pages
  const elemsPerInch = 1 / (elemPt / 72); // elements per inch in real space
  const globalStartElem = Math.round((segOffsetIn || 0) * elemsPerInch);

  for (let idx = 0; idx < count; idx++) {
    const color = colors[(globalStartElem + idx) % colors.length];
    const [r,g,b] = hexToRgb(color);
    doc.setFillColor(r,g,b);

    const bx = stripOffsetX + idx * elemPt;
    const by = stripOffsetY + vertOffset;
    const cx = bx + elemPt / 2;
    const cy = by + elemPt / 2;

    if (borderStyle === "dots") {
      doc.circle(cx, cy, dotRadius, "F");
    }
    if (borderStyle === "scallop") {
      const flatY = side === "top" ? by : by + elemPt;
      drawScallopHorizPDF(doc, cx, flatY, elemPt / 2, side === "top");
    }
    if (borderStyle === "triangle") {
      if (side === "top")    doc.triangle(bx, by + elemPt, cx, by, bx + elemPt, by + elemPt, "F");
      else                   doc.triangle(bx, by, cx, by + elemPt, bx + elemPt, by, "F");
    }
  }
}

// ── Board pages (WYSIWYG) ─────────────────────────────────────────────────────
// The board is split into page cells exactly like the grid in the app.
// Each printed page shows its cell plus a 0.5" strip of the next cell to the
// right and below, so neighbouring pages overlap and can be lined up and glued.

const PX_TO_IN = 12 / SCALE_BASE; // board px → inches
const RENDER_DPI = 150;

function loadImg(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Bounding box of an item in board px (matches itemBounds in Kaleidoprint.tsx)
function boundsOf(it) {
  if (it.type === "image") return { x: it.x, y: it.y, w: it.w || it.size, h: it.h || it.size };
  if (it.type === "letter") return { x: it.x, y: it.y, w: it.size * 0.72, h: it.size };
  if (it.type === "phrase") return { x: it.x, y: it.y, w: it.text.length * it.size * 0.56 + 8, h: it.size * 1.2 };
  return { x: it.x, y: it.y, w: 60, h: 60 };
}

export function boardPageGrid(boardDims) {
  const boardW = boardDims.w * 12, boardH = boardDims.h * 12;
  return { cols: Math.max(1, Math.ceil(boardW / CELL_W)), rows: Math.max(1, Math.ceil(boardH / CELL_H)), boardW, boardH };
}

// Draw every board item onto a 2D canvas context that is already in board-px space
function drawItemsOnCanvas(ctx, items, imgCache) {
  items.forEach(it => {
    ctx.save();
    if (it.type === "letter" || it.type === "phrase") {
      const text = it.type === "letter" ? it.letter : it.text;
      const pw = it.type === "letter" ? it.size * 0.72 : it.text.length * it.size * 0.56;
      const cx = it.x + (it.type === "letter" ? it.size * 0.36 : pw / 2);
      const cy = it.y + it.size * 0.5;
      if (it.rotate) { ctx.translate(cx, cy); ctx.rotate(it.rotate * Math.PI / 180); ctx.translate(-cx, -cy); }
      ctx.font = `${it.size}px '${it.font}', cursive`;
      ctx.textBaseline = "alphabetic";
      ctx.lineJoin = "round";
      ctx.lineWidth = it.type === "letter" ? 3 : 2;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText(text, it.x, it.y + it.size);
      ctx.fillStyle = it.color || "#333333";
      ctx.fillText(text, it.x, it.y + it.size);
    } else if (it.type === "image") {
      const img = imgCache.get(it.src);
      const bw = it.w || it.size, bh = it.h || it.size;
      if (img) {
        const cx = it.x + bw / 2, cy = it.y + bh / 2;
        if (it.rotate) { ctx.translate(cx, cy); ctx.rotate(it.rotate * Math.PI / 180); ctx.translate(-cx, -cy); }
        const s = Math.min(bw / img.naturalWidth, bh / img.naturalHeight); // keep ratio ("contain")
        const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        ctx.drawImage(img, it.x + (bw - dw) / 2, it.y + (bh - dh) / 2, dw, dh);
      }
    }
    ctx.restore();
  });
}

async function drawBoardPages(doc, { items, boardDims, bgColor, printBg }) {
  const { cols, rows, boardW, boardH } = boardPageGrid(boardDims);
  const total = cols * rows;

  // Make sure fonts and images are ready before drawing
  const fonts = [...new Set(items.filter(it => it.font).map(it => `${Math.round(it.size)}px '${it.font}'`))];
  try { await Promise.all(fonts.map(f => document.fonts.load(String(f)))); await document.fonts.ready; } catch { /* ignore */ }
  const imgCache = new Map();
  for (const it of items) {
    if (it.type === "image" && it.src && !imgCache.has(it.src)) imgCache.set(it.src, await loadImg(it.src));
  }

  const k = RENDER_DPI * PX_TO_IN; // canvas px per board px
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(PRINT_W * RENDER_DPI);
  canvas.height = Math.round(PRINT_H * RENDER_DPI);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const printed = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Page region in board inches
      const x0 = c * CELL_W, y0 = r * CELL_H;
      // Which items touch this page?
      const onPage = items.filter(it => {
        const b = boundsOf(it);
        const bx = b.x * PX_TO_IN, by = b.y * PX_TO_IN, bw = b.w * PX_TO_IN, bh = b.h * PX_TO_IN;
        return bx < x0 + PRINT_W && bx + bw > x0 && by < y0 + PRINT_H && by + bh > y0;
      });
      if (!onPage.length && !printBg) continue;

      // Render this page region
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, -(x0 / PX_TO_IN) * k, -(y0 / PX_TO_IN) * k);
      if (printBg) { ctx.fillStyle = bgColor || "#ffffff"; ctx.fillRect(0, 0, boardW / PX_TO_IN, boardH / PX_TO_IN); }
      drawItemsOnCanvas(ctx, onPage, imgCache);

      // Skip pages that came out blank (unless the background colour is being printed)
      if (!printBg) {
        const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let inked = false;
        for (let p = 0; p < px.length; p += 16) {
          if (px[p] < 245 || px[p + 1] < 245 || px[p + 2] < 245) { inked = true; break; }
        }
        if (!inked) continue;
      }
      printed.push(`${r},${c}`);
      const jpeg = canvas.toDataURL("image/jpeg", 0.92);

      doc.addPage();
      doc.addImage(jpeg, "JPEG", i(MARGIN), i(MARGIN), i(PRINT_W), i(PRINT_H), undefined, "FAST");

      // Board edge (last column / row pages extend past the board)
      const edgeX = boardW - x0, edgeY = boardH - y0;
      if (edgeX < PRINT_W || edgeY < PRINT_H) {
        doc.setLineDashPattern([2, 2], 0); setDraw(doc, "#999999"); doc.setLineWidth(0.6);
        if (edgeX < PRINT_W) doc.line(i(MARGIN + edgeX), i(MARGIN), i(MARGIN + edgeX), i(MARGIN + Math.min(edgeY, PRINT_H)));
        if (edgeY < PRINT_H) doc.line(i(MARGIN), i(MARGIN + edgeY), i(MARGIN + Math.min(edgeX, PRINT_W)), i(MARGIN + edgeY));
        doc.setLineDashPattern([], 0);
      }

      // Overlap strips (shared with the page to the right / below)
      const hasRight = c < cols - 1, hasBelow = r < rows - 1;
      const tint = (x, y, w, h) => {
        try { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.12 })); setFill(doc, "#E8186D"); doc.rect(x, y, w, h, "F"); doc.restoreGraphicsState(); } catch { /* ignore */ }
      };
      setDraw(doc, "#E8186D"); doc.setLineWidth(0.8); doc.setLineDashPattern([5, 3], 0);
      if (hasRight) {
        tint(i(MARGIN + CELL_W), i(MARGIN), i(OVERLAP), i(PRINT_H));
        doc.line(i(MARGIN + CELL_W), i(MARGIN), i(MARGIN + CELL_W), i(MARGIN + PRINT_H));
      }
      if (hasBelow) {
        tint(i(MARGIN), i(MARGIN + CELL_H), i(hasRight ? CELL_W : PRINT_W), i(OVERLAP));
        doc.line(i(MARGIN), i(MARGIN + CELL_H), i(MARGIN + PRINT_W), i(MARGIN + CELL_H));
      }
      doc.setLineDashPattern([], 0);

      // Trim marks on the top / left edges (cut these off when overlapping a neighbour)
      setDraw(doc, "#888888"); doc.setLineWidth(0.5);
      const m = i(MARGIN), tick = i(0.25);
      if (c > 0) { doc.line(m, m - tick, m, m - 2); doc.line(m, m + i(PRINT_H) + 2, m, m + i(PRINT_H) + tick); }
      if (r > 0) { doc.line(m - tick, m, m - 2, m); doc.line(m + i(PRINT_W) + 2, m, m + i(PRINT_W) + tick, m); }

      // Labels
      doc.setFont("helvetica", "bold"); setTextCol(doc, "#7c3aed"); doc.setFontSize(11);
      doc.text(`ROW ${r + 1} · COLUMN ${c + 1}`, m, m - 8);
      doc.setFont("helvetica", "normal"); setTextCol(doc, "#E8186D"); doc.setFontSize(7);
      if (hasRight) doc.text(`overlap: Row ${r + 1} · Col ${c + 2} lines up on the right dashed line`, i(PAGE_W - MARGIN), m - 8, { align: "right" });
      if (hasBelow) doc.text(`overlap: Row ${r + 2} · Col ${c + 1} lines up on the bottom dashed line`, m, i(PAGE_H - MARGIN) + 9);
      doc.setFont("helvetica", "bold"); setTextCol(doc, "#cccccc"); doc.setFontSize(7);
      doc.text(`KALEIDOPRINT — BOARD PAGE  row ${r + 1} of ${rows}, column ${c + 1} of ${cols}  (${total} grid pages)`,
        i(PAGE_W - MARGIN), i(PAGE_H - 0.12), { align: "right" });
    }
  }
  return { cols, rows, printed: new Set(printed), imgCache };
}

// ── Assembly map (shows which page goes where) ────────────────────────────────

function drawAssemblyMap(doc, { boardDims, items, boardColor }, layout) {
  const { cols, rows, printed, imgCache } = layout;
  doc.addPage();
  doc.setFont("helvetica", "bold"); setTextCol(doc, "#7c3aed"); doc.setFontSize(18);
  doc.text("Board Page Map", i(PAGE_W / 2), i(0.9), { align: "center" });
  doc.setFont("helvetica", "normal"); setTextCol(doc, "#555555"); doc.setFontSize(10);
  doc.text(`${boardDims.w} ft × ${boardDims.h} ft board · ${cols} columns × ${rows} rows · matches the grid in the app`,
    i(PAGE_W / 2), i(1.2), { align: "center" });

  const areaW = PRINT_W, areaH = 5.2;
  const cellW = Math.min(areaW / cols, (areaH / rows) * (CELL_W / CELL_H));
  const cellH = cellW * (CELL_H / CELL_W);
  const ox = (PAGE_W - cellW * cols) / 2, oy = 1.5;
  // Mini picture of the whole board, drawn to the same scale as the grid
  const f = cellW / CELL_W; // paper inches per board inch
  const boardW = boardDims.w * 12, boardH = boardDims.h * 12;
  try {
    const dpi = 150;
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(boardW * f * dpi));
    cv.height = Math.max(1, Math.round(boardH * f * dpi));
    const cx2 = cv.getContext("2d");
    const kk = (f * dpi) * PX_TO_IN; // canvas px per board px
    cx2.fillStyle = boardColor || "#ffffff";
    cx2.fillRect(0, 0, cv.width, cv.height);
    cx2.setTransform(kk, 0, 0, kk, 0, 0);
    drawItemsOnCanvas(cx2, items, imgCache);
    doc.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", i(ox), i(oy), i(boardW * f), i(boardH * f), undefined, "FAST");
  } catch { /* map picture is optional */ }

  // Page cells on top of the picture
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = i(ox + c * cellW), y = i(oy + r * cellH);
      const has = printed.has(`${r},${c}`);
      if (!has) {
        // Fade pages that won't be printed
        try { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.6 })); setFill(doc, "#ffffff"); doc.rect(x, y, i(cellW), i(cellH), "F"); doc.restoreGraphicsState(); } catch { /* ignore */ }
      }
      setDraw(doc, has ? "#7c3aed" : "#cccccc"); doc.setLineWidth(has ? 0.9 : 0.5);
      doc.rect(x, y, i(cellW), i(cellH), "S");
      const fs = Math.max(5, Math.min(9, cellW * 8));
      doc.setFontSize(fs);
      doc.setFont("helvetica", has ? "bold" : "normal");
      const label = has ? `R${r + 1} C${c + 1}` : "blank";
      const tw = doc.getTextWidth(label) + 4;
      setFill(doc, "#ffffff"); doc.rect(x + 1.5, y + 1.5, tw, fs + 2, "F");
      setTextCol(doc, has ? "#7c3aed" : "#aaaaaa");
      doc.text(label, x + 3.5, y + 1.5 + fs);
    }
  }

  const iy = oy + rows * cellH + 0.45;
  setFill(doc, "#fff8e1");
  doc.roundedRect(i(MARGIN), i(iy), i(PRINT_W), i(2.3), 4, 4, "F");
  doc.setFont("helvetica", "bold"); setTextCol(doc, "#f57f17"); doc.setFontSize(11);
  doc.text("How to put the board together", i(MARGIN + 0.2), i(iy + 0.35));
  const steps = [
    "1. Lay the pages out by their ROW · COLUMN label, matching this map.",
    "2. Trim the white margin off the TOP and LEFT edges of each page (use the grey trim marks).",
    "    Skip the left trim on column 1 pages and the top trim on row 1 pages.",
    "3. Each page's pink dashed strip is shared with the next page. Lay the next page on top",
    "    so its trimmed edge sits exactly on the pink dashed line, then glue or tape.",
    "4. Faded 'blank' squares have nothing on them, so they were not printed.",
  ];
  doc.setFont("helvetica", "normal"); setTextCol(doc, "#555555"); doc.setFontSize(9.5);
  steps.forEach((line, idx) => doc.text(line, i(MARGIN + 0.2), i(iy + 0.68 + idx * 0.27)));
}

// ── Main export ────────────────────────────────────────────────────────────────

// ── Built-in border pages ─────────────────────────────────────────────────────

async function drawBuiltinBorderPages(doc, state) {
  const { boardDims, builtinBorder, builtinColor, builtinThickIn } = state;
  const BORDER_IN = builtinThickIn || 2.75;
  const [r,g,b] = hexToRgb(builtinColor || "#FF4E50");

  const sides = [
    { side: "top",    label: "TOP",    len: boardDims.w * 12 },
    { side: "bottom", label: "BOTTOM", len: boardDims.w * 12 },
    { side: "left",   label: "LEFT",   len: boardDims.h * 12 },
    { side: "right",  label: "RIGHT",  len: boardDims.h * 12 },
  ];

  const STRIP_W = PAGE_W - MARGIN * 2;
  const STRIP_GAP = 0.3;
  const LABEL_H = 0.2;
  const stripsPerPage = Math.max(1, Math.floor((PAGE_H - MARGIN * 2 + STRIP_GAP) / (BORDER_IN + LABEL_H + STRIP_GAP)));

  const allSegments = [];
  sides.forEach(({ side, label, len }) => {
    const numSegments = Math.ceil(len / STRIP_W);
    for (let seg = 0; seg < numSegments; seg++) {
      allSegments.push({ side, label, seg, numSegments, len, offsetIn: seg * STRIP_W });
    }
  });

  for (let s = 0; s < allSegments.length; s += stripsPerPage) {
    doc.addPage();
    doc.setFont("helvetica", "bold"); setTextCol(doc, "#cccccc"); doc.setFontSize(7);
    doc.text("KALEIDOPRINT — BUILT-IN BORDER", i(PAGE_W/2), i(PAGE_H - 0.2), { align: "center" });

    const batch = allSegments.slice(s, s + stripsPerPage);
    for (let idx = 0; idx < batch.length; idx++) {
      const { label, seg, numSegments, len, offsetIn } = batch[idx];
      const rowY = MARGIN + idx * (BORDER_IN + LABEL_H + STRIP_GAP) + LABEL_H;
      const visLen = Math.min(STRIP_W, len - offsetIn);

      doc.setFont("helvetica", "bold"); setTextCol(doc, "#7c3aed"); doc.setFontSize(8);
      doc.text(`${label}  ${seg+1}/${numSegments}`, i(MARGIN), i(rowY - 0.05));

      // Draw the strip
      doc.setFillColor(r, g, b);

      if (builtinBorder === "solid") {
        doc.rect(i(MARGIN), i(rowY), i(visLen), i(BORDER_IN), "F");

      } else if (builtinBorder === "wavy") {
        // Sample sine wave points and draw as filled polygon
        const steps = 80;
        const amp = BORDER_IN * 0.3;
        const freq = BORDER_IN * 4.0; // match canvas freq
        const outerY = i(rowY);           // straight outer edge (top of strip)
        const innerBase = i(rowY + BORDER_IN * 0.65); // wave baseline
        const sx = i(MARGIN);
        const ex = i(MARGIN + visLen);

        // Build wave points along inner edge
        const pts = [];
        for (let s = 0; s <= steps; s++) {
          const px = sx + (s / steps) * i(visLen);
          const py = innerBase + i(amp) * Math.sin((s / steps) * (visLen / freq) * Math.PI * 2);
          pts.push([px, py]);
        }

        // Draw as polygon: wave edge + straight outer edge
        const startPt = pts[0];
        const moves = pts.slice(1).map((p, k) => [p[0] - pts[k][0], p[1] - pts[k][1]]);
        // Close: go to outer edge and back
        moves.push([ex - pts[pts.length-1][0], outerY - pts[pts.length-1][1]]);
        moves.push([sx - ex, 0]);
        doc.lines(moves, startPt[0], startPt[1], [1,1], "F", true);
      }

      dashedRect(doc, i(MARGIN), i(rowY), i(visLen), i(BORDER_IN),
        `${label} · ${offsetIn.toFixed(1)}"–${Math.min(offsetIn+STRIP_W, len).toFixed(1)}" of ${len}"`);
    }
  }
}

export async function exportPDF(state) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  const s = {
    borderEnabled: false,
    borderStyle:   "none",
    borderColors:  [],
    borderPngs:    state.borderPngs    || {},
    builtinBorder: state.builtinBorder || "none",
    builtinColor:  state.builtinColor  || "#FF4E50",
    builtinThickIn: ((state.builtinThickness || 18) / 80) * 12, // canvas px to inches
    bgColor:       state.printBg ? (state.bgColor || "#ffffff") : "#ffffff",
    boardColor:    state.bgColor || "#ffffff",
    boardDims:     state.boardDims     || { w: 4, h: 4 },
    items:         state.items         || [],
    printBg:       !!state.printBg,
    patternSize:   state.patternSize   || 18,
    borderSize:    state.borderSize    || 18,
  };

  drawCoverPage(doc, s);
  // Board pages go right after the cover; the map is inserted before them afterwards
  const mapAt = doc.getNumberOfPages() + 1;
  const layout = await drawBoardPages(doc, s);
  drawAssemblyMap(doc, s, layout);
  doc.movePage(doc.getNumberOfPages(), mapAt);
  await drawBorderPages(doc, s);
  if (s.builtinBorder !== "none") await drawBuiltinBorderPages(doc, s);

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
