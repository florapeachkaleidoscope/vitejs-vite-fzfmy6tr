import { jsPDF } from 'jspdf';

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_W = 8.5;   // inches
const PAGE_H = 11;    // inches
const MARGIN = 0.4;   // inches
const PRINT_W = PAGE_W - MARGIN * 2;
const PRINT_H = PAGE_H - MARGIN * 2;
const PT = 72;        // points per inch
const SCALE_BASE = 80; // canvas px per foot (must match Kaleidoprint.jsx)

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

// ── Scallop (semicircle) drawing ──────────────────────────────────────────────
// jsPDF doesn't have arc, so we approximate a semicircle with 2 bezier curves
// cx,cy = center of full circle, r = radius, flat side faces direction
function drawScallop(doc, cx, cy, r, side) {
  // Control point offset for bezier circle approximation
  const k = r * 0.5523;
  // We draw a semicircle dome pointing INWARD (toward board center)
  if (side === "top") {
    // dome points UP (toward top of page = away from board)
    // flat edge at cy, dome at cy - r
    doc.lines([[k,0],[r,r-k],[r,r]], cx - r, cy, [1,1], "F", true);
    // Actually use moveTo equivalent via a filled shape
    // Use path approach
    const pts = [];
    const steps = 12;
    for (let a = 0; a <= steps; a++) {
      const angle = Math.PI + (Math.PI * a / steps); // 180 to 360 = bottom semicircle
      pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    // close with flat line
    pts.push([cx + r, cy]);
    doc.moveTo(pts[0][0], pts[0][1]);
    // jsPDF path drawing
  }
}

// Draw scallop as filled polygon using jsPDF lines() API
// bx,by = top-left corner of this element's bounding box (in points)
// elemSize = width/height of the bounding box (in points)
function drawScallopPDF(doc, bx, by, elemSize, side) {
  const r = elemSize / 2;
  const steps = 16;
  const pts = [];

  if (side === "top") {
    // flat edge at by, dome bulges DOWN
    for (let a = 0; a <= steps; a++) {
      const angle = Math.PI * a / steps; // 0=left, PI=right along bottom arc
      pts.push([bx + r - r * Math.cos(angle), by + r * Math.sin(angle)]);
    }
    // close back to start along the flat edge
    pts.push([bx, by]);
  } else if (side === "bottom") {
    // flat edge at by+elemSize, dome bulges UP
    for (let a = 0; a <= steps; a++) {
      const angle = Math.PI * a / steps;
      pts.push([bx + r + r * Math.cos(angle), by + elemSize - r * Math.sin(angle)]);
    }
    pts.push([bx + elemSize, by + elemSize]);
  } else if (side === "left") {
    // flat edge at bx, dome bulges RIGHT
    const cy = by + r;
    for (let a = 0; a <= steps; a++) {
      const angle = Math.PI * a / steps;
      pts.push([bx + r * Math.sin(angle), cy - r * Math.cos(angle)]);
    }
    pts.push([bx, by]);
  } else {
    // flat edge at bx+elemSize, dome bulges LEFT
    const cy = by + r;
    for (let a = 0; a <= steps; a++) {
      const angle = Math.PI * a / steps;
      pts.push([bx + elemSize - r * Math.sin(angle), cy + r * Math.cos(angle)]);
    }
    pts.push([bx + elemSize, by + elemSize]);
  }

  if (pts.length < 3) return;

  // Use jsPDF lines() to draw and fill the polygon
  // lines() takes array of [x,y] relative moves, starting from first point
  const start = pts[0];
  const moves = [];
  for (let k = 1; k < pts.length; k++) {
    moves.push([pts[k][0] - pts[k-1][0], pts[k][1] - pts[k-1][1]]);
  }
  doc.lines(moves, start[0], start[1], [1, 1], "F", true);
}

// ── Registration / tile helpers ────────────────────────────────────────────────

// Given a real-world size in inches and page print area, return array of page tiles
// Each tile: { pageCol, pageRow, srcX, srcY, srcW, srcH, destX, destY, destW, destH }
// srcX/Y in inches (offset into the element), destX/Y in inches on the page
function getTiles(realW, realH) {
  const tiles = [];
  let y = 0;
  let row = 0;
  while (y < realH) {
    let x = 0;
    let col = 0;
    while (x < realW) {
      const srcW = Math.min(PRINT_W, realW - x);
      const srcH = Math.min(PRINT_H, realH - y);
      tiles.push({ col, row, srcX: x, srcY: y, srcW, srcH, destX: MARGIN, destY: MARGIN });
      x += PRINT_W;
      col++;
    }
    y += PRINT_H;
    row++;
  }
  return tiles;
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
        drawScallopPDF(doc, px, py, i(tileSize), side);
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
        drawScallopPDF(doc, px, py, i(tileSize), side);
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
    ["Letters", `${letters.length} letter${letters.length !== 1 ? "s" : ""} — printed at real-world board scale`],
    ["Phrases", `${phrases.length} phrase${phrases.length !== 1 ? "s" : ""} — tiled if larger than one page`],
    ["Clipart", `${images.length} image${images.length !== 1 ? "s" : ""} — tiled if larger than one page`],
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
    "• Each item prints at true size — cut and assemble",
    "• Items larger than one page: cut along dashed lines and tape pages together",
    "• Border strips: tape end-to-end along each edge of your board",
    "• Page labels show which row/column each tile belongs to",
  ];
  doc.setFont("helvetica", "normal"); setTextCol(doc, "#555555"); doc.setFontSize(9.5);
  instructions.forEach((line, idx) => doc.text(line, i(MARGIN + 0.2), i(instrY + 0.7 + idx * 0.33)));
}

// ── Border strip pages ─────────────────────────────────────────────────────────

function drawBorderPages(doc, state) {
  const { boardDims, bgColor } = state;
  const sides = [
    { side: "top",    label: "TOP" },
    { side: "bottom", label: "BOTTOM" },
    { side: "left",   label: "LEFT" },
    { side: "right",  label: "RIGHT" },
  ];

  sides.forEach(({ side, label }) => {
    const isVert = side === "left" || side === "right";
    const stripLen = isVert ? boardDims.h * 12 : boardDims.w * 12; // inches
    const bs2 = state.borderSize || 28;
    const BORDER_IN = ((bs2 - 16) / (52 - 16)) * (3 - 1) + 1;
    const stripThick = BORDER_IN;
    const numPages = Math.ceil(stripLen / PRINT_W);

    for (let p = 0; p < numPages; p++) {
      doc.addPage();

      const offsetIn = p * PRINT_W;
      const visLen = Math.min(PRINT_W, stripLen - offsetIn);

      // Page footer
      doc.setFont("helvetica", "bold"); setTextCol(doc, "#cccccc"); doc.setFontSize(7);
      doc.text(`KALEIDOPRINT — ${label} BORDER  |  strip ${p+1} of ${numPages}`,
        i(PAGE_W / 2), i(PAGE_H - 0.2), { align: "center" });

      // Background
      setFill(doc, bgColor || "#ffffff");
      doc.rect(i(MARGIN), i(MARGIN), i(visLen), i(stripThick), "F");

      // Draw border pattern
      drawBorderTile(doc, {
        ...state,
        tileX: offsetIn, tileY: 0,
        tileW: PRINT_W, tileH: stripThick,
        side,
      });

      // Cut line
      dashedRect(doc, i(MARGIN), i(MARGIN), i(visLen), i(stripThick),
        `${label} — ${offsetIn}"–${Math.min(offsetIn + PRINT_W, stripLen)}" of ${stripLen}"`);

      // Tape instruction
      doc.setFont("helvetica", "normal"); setTextCol(doc, "#aaaaaa"); doc.setFontSize(7.5);
      doc.text(`Tape to ${label.toLowerCase()} edge of board · Strip ${p+1}/${numPages}`,
        i(MARGIN), i(MARGIN + stripThick + 0.18));
    }
  });
}

// ── Generic tiled item pages ───────────────────────────────────────────────────
// Draws any item at true real-world scale, tiled across as many pages as needed

function drawTiledItem(doc, { realW, realH, label, drawContent, bgColor }) {
  const tiles = getTiles(realW, realH);
  const totalPages = tiles.length;

  tiles.forEach(({ col, row, srcX, srcY, srcW, srcH }) => {
    doc.addPage();

    // Page footer
    doc.setFont("helvetica", "bold"); setTextCol(doc, "#cccccc"); doc.setFontSize(7);
    const pageLabel = totalPages > 1
      ? `KALEIDOPRINT — ${label}  |  tile col ${col+1} row ${row+1} of ${Math.ceil(realW/PRINT_W)}×${Math.ceil(realH/PRINT_H)}`
      : `KALEIDOPRINT — ${label}`;
    doc.text(pageLabel, i(PAGE_W / 2), i(PAGE_H - 0.2), { align: "center" });

    // White background
    setFill(doc, bgColor || "#ffffff");
    doc.rect(i(MARGIN), i(MARGIN), i(srcW), i(srcH), "F");

    // Let caller draw content at this tile offset
    drawContent(doc, srcX, srcY, srcW, srcH);

    // Cut/tape guides
    const cutLabel = totalPages > 1
      ? `Cut · col ${col+1} row ${row+1} — tape pages together in order`
      : "Cut along dashed line";
    dashedRect(doc, i(MARGIN), i(MARGIN), i(srcW), i(srcH), cutLabel);

    // Tile alignment marks for multi-page items
    if (totalPages > 1) {
      doc.setFont("helvetica", "normal"); setTextCol(doc, "#cccccc"); doc.setFontSize(6);
      doc.text(`↕ ${(srcY).toFixed(1)}"–${(srcY + srcH).toFixed(1)}"  ↔ ${(srcX).toFixed(1)}"–${(srcX + srcW).toFixed(1)}"`,
        i(PAGE_W - MARGIN), i(PAGE_H - 0.2), { align: "right" });
    }
  });
}

// ── Letter pages ───────────────────────────────────────────────────────────────

function drawLetterPages(doc, { items, boardDims, bgColor }) {
  const letters = items.filter(it => it.type === "letter");
  if (!letters.length) return;

  letters.forEach((item, idx) => {
    // Real-world size from canvas px
    const realW = pxToIn(item.size * 0.75, boardDims); // approximate glyph width
    const realH = pxToIn(item.size, boardDims);

    drawTiledItem(doc, {
      realW, realH,
      label: `LETTER "${item.letter}" (${idx + 1}/${letters.length})`,
      bgColor,
      drawContent: (doc, srcX, srcY, srcW, srcH) => {
        // Center the letter on the visible tile area
        const [r,g,b] = hexToRgb(item.color || "#333333");
        doc.setTextColor(r,g,b);
        doc.setFont("helvetica", "bold");
        // Font size = realH converted to points, adjusted for tile crop
        const fs = i(realH * 0.85);
        doc.setFontSize(fs);
        // Position: center of tile, offset by srcX/srcY within the glyph
        const textX = i(MARGIN + realW / 2 - srcX);
        const textY = i(MARGIN + realH * 0.88 - srcY);
        // Only draw if text anchor is within tile
        doc.text(item.letter, textX, textY, { align: "center" });
      }
    });
  });
}

// ── Phrase pages ───────────────────────────────────────────────────────────────

function drawPhrasePages(doc, { items, boardDims, bgColor }) {
  const phrases = items.filter(it => it.type === "phrase");
  if (!phrases.length) return;

  phrases.forEach((item, idx) => {
    const realH = pxToIn(item.size, boardDims);
    // Estimate width: ~0.6 * size * charcount in px → inches
    const realW = pxToIn(item.size * 0.58 * item.text.length, boardDims);

    drawTiledItem(doc, {
      realW, realH,
      label: `PHRASE ${idx + 1}/${phrases.length}: "${item.text.slice(0, 20)}${item.text.length > 20 ? "…" : ""}"`,
      bgColor,
      drawContent: (doc, srcX, srcY, srcW, srcH) => {
        const [r,g,b] = hexToRgb(item.color || "#333333");
        doc.setTextColor(r,g,b);
        doc.setFont("helvetica", "bold");
        const fs = i(realH * 0.85);
        doc.setFontSize(fs);
        const textX = i(MARGIN + realW / 2 - srcX);
        const textY = i(MARGIN + realH * 0.85 - srcY);
        doc.text(item.text, textX, textY, { align: "center" });
      }
    });
  });
}

// ── Clipart pages ──────────────────────────────────────────────────────────────

function drawClipartPages(doc, { items, boardDims, bgColor }) {
  const images = items.filter(it => it.type === "image");
  if (!images.length) return;

  images.forEach((item, idx) => {
    const realW = pxToIn(item.w || item.size, boardDims);
    const realH = pxToIn(item.h || item.size, boardDims);

    drawTiledItem(doc, {
      realW, realH,
      label: `CLIPART ${idx + 1}/${images.length}`,
      bgColor,
      drawContent: (doc, srcX, srcY, srcW, srcH) => {
        // Draw the portion of the image that falls in this tile
        // jsPDF addImage draws the full image — we simulate cropping via positioning
        // by placing the full image offset so the right portion shows in the tile area
        try {
          const fmt = item.src.startsWith("data:image/png") ? "PNG" : "JPEG";
          // Place full image starting at (MARGIN - srcX, MARGIN - srcY)
          // so the srcX/srcY portion aligns with MARGIN
          doc.addImage(
            item.src, fmt,
            i(MARGIN - srcX), i(MARGIN - srcY),
            i(realW), i(realH)
          );
        } catch(e) {
          setFill(doc, "#eeeeee");
          doc.rect(i(MARGIN), i(MARGIN), i(srcW), i(srcH), "F");
          doc.setFont("helvetica", "normal"); setTextCol(doc, "#999999"); doc.setFontSize(10);
          doc.text("[Image]", i(MARGIN + srcW / 2), i(MARGIN + srcH / 2), { align: "center" });
        }
      }
    });
  });
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function exportPDF(state) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  const s = {
    borderEnabled: state.borderEnabled ?? true,
    borderStyle:   state.borderStyle   || "scallop",
    borderSize:    state.borderSize    || 28,
    borderColors:  state.borderColors  || ["#FF4E50"],
    borderPngs:    state.borderPngs    || {},
    bgColor:       state.printBg ? (state.bgColor || "#ffffff") : "#ffffff",
    boardDims:     state.boardDims     || { w: 4, h: 4 },
    items:         state.items         || [],
  };

  drawCoverPage(doc, s);
  drawBorderPages(doc, s);
  drawLetterPages(doc, s);
  drawPhrasePages(doc, s);
  drawClipartPages(doc, s);

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
