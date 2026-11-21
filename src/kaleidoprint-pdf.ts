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

// ── Flora Peach Kaleidoscope brand ─────────────────────────────────────────────
// Colours sampled from the FPK logo. Every PDF uses this one look.

const BRAND = {
  magenta: "#B9519F",
  indigo:  "#495BA6",
  orange:  "#EF8921",
  teal:    "#59C4BC",
  pink:    "#ED175E",
  ink:     "#1C1C1C", // headings
  body:    "#4A4A4A", // body text
  soft:    "#9A9A9A", // footer / small print
};
const BRAND_STRIPE = [BRAND.magenta, BRAND.indigo, BRAND.orange, BRAND.teal, BRAND.pink];
const SHOP_NAME = "FLORA PEACH KALEIDOSCOPE";
const FOOTER_NOTE = "Questions? Message me on Etsy  ·  For personal classroom use only  ·  Please don't share or resell";

// Set to true once the border strip pages are ready to ship again
const INCLUDE_BORDER_STRIPS = false;

// FPK logo, built into this file so there's no separate image to upload
const LOGO_URL = "data:image/png;base64,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";
const LOGO_RATIO = 328 / 300; // height / width of the logo file

// Pale version of a brand colour for tile backgrounds (amt = how much white)
function tint(hex, amt = 0.86) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (v) => Math.round(v + (255 - v) * amt).toString(16).padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

// Row letter for page labels: A, B, C … (AA after Z, just in case)
function rowLetter(r) {
  let s = "", n = r;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}
export function pageLabel(r, c) { return `${rowLetter(r)}${c + 1}`; }

async function loadLogoDataUrl() {
  try {
    const img: any = await loadImg(LOGO_URL);
    if (!img) return null;
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext("2d")!.drawImage(img, 0, 0);
    return cv.toDataURL("image/png");
  } catch { return null; }
}

// Thin five-colour stripe, like the logo shapes laid side by side
function drawStripe(doc, x, y, w, h) {
  const seg = w / BRAND_STRIPE.length;
  BRAND_STRIPE.forEach((col, k) => { setFill(doc, col); doc.rect(x + k * seg, y, seg + 0.5, h, "F"); });
}

// Same footer on every page
function drawFooters(doc) {
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    const y = i(PAGE_H - 0.2);
    doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.ink); doc.setFontSize(6.5);
    doc.text(SHOP_NAME, i(MARGIN), y, { charSpace: 0.6 });
    doc.setFont("helvetica", "normal"); setTextCol(doc, BRAND.soft); doc.setFontSize(6.5);
    doc.text(FOOTER_NOTE, i(PAGE_W / 2 + 0.35), y, { align: "center" });
    doc.text(`page ${p} of ${n}`, i(PAGE_W - MARGIN), y, { align: "right" });
  }
}

// Numbered circle used in step lists
function stepDot(doc, n, x, y, col) {
  setFill(doc, col); doc.circle(x, y, i(0.13), "F");
  doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255); doc.setFontSize(9);
  doc.text(String(n), x, y + 3.2, { align: "center" });
}

// ── Cover page ─────────────────────────────────────────────────────────────────
// Drawn last (onto page 1) so it can show the real page count.

function drawCoverPage(doc, { boardDims, items, boardName }, { logo, totalPages }) {
  doc.setPage(1);
  const cx = PAGE_W / 2;
  const pieces = items.filter(it => ["letter", "phrase", "image"].includes(it.type)).length;

  // Logo, centred like the START HERE guide
  let y = 0.6;
  if (logo) {
    const lw = 1.3, lh = lw * LOGO_RATIO;
    doc.addImage(logo, "PNG", i(cx - lw / 2), i(y), i(lw), i(lh));
    y += lh + 0.35;
  } else {
    doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.ink); doc.setFontSize(12);
    doc.text(SHOP_NAME, i(cx), i(y + 0.4), { align: "center", charSpace: 1.2 });
    y += 0.8;
  }
  drawStripe(doc, i(MARGIN + 1.2), i(y), i(PRINT_W - 2.4), i(0.07));
  y += 0.75;

  // Kit name
  const title = (boardName || "").trim() || "Bulletin Board Print Kit";
  doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.ink); doc.setFontSize(28);
  const titleLines = doc.splitTextToSize(title, i(PRINT_W - 0.6));
  titleLines.slice(0, 2).forEach((ln, k) => doc.text(ln, i(cx), i(y + k * 0.45), { align: "center" }));
  y += 0.45 * Math.min(2, titleLines.length) - 0.05;
  doc.setFont("helvetica", "italic"); setTextCol(doc, BRAND.indigo); doc.setFontSize(12);
  doc.text("Bulletin board print kit", i(cx), i(y + 0.12), { align: "center" });
  y += 0.55;

  // At-a-glance tiles
  const tiles = [
    { label: "FITS A BOARD", value: `${boardDims.w} ft × ${boardDims.h} ft`, sub: `${boardDims.w * 12}" × ${boardDims.h * 12}"`, col: BRAND.magenta },
    { label: "PAGES TO PRINT", value: String(totalPages), sub: `on 8.5" × 11" paper`, col: BRAND.indigo },
    { label: "PIECES TO CUT", value: String(pieces), sub: "letters, words and clipart", col: BRAND.teal },
  ];
  const gap = 0.2, tw = (PRINT_W - gap * 2) / 3, th = 1.05;
  tiles.forEach((t, k) => {
    const tx = MARGIN + k * (tw + gap);
    setFill(doc, tint(t.col)); doc.roundedRect(i(tx), i(y), i(tw), i(th), 6, 6, "F");
    setFill(doc, t.col); doc.rect(i(tx + 0.18), i(y + 0.16), i(0.35), i(0.05), "F");
    doc.setFont("helvetica", "bold"); setTextCol(doc, t.col); doc.setFontSize(7.5);
    doc.text(t.label, i(tx + 0.18), i(y + 0.4), { charSpace: 0.5 });
    setTextCol(doc, BRAND.ink); doc.setFontSize(18);
    doc.text(t.value, i(tx + 0.18), i(y + 0.72));
    doc.setFont("helvetica", "normal"); setTextCol(doc, BRAND.body); doc.setFontSize(8.5);
    doc.text(t.sub, i(tx + 0.18), i(y + 0.92));
  });
  y += th + 0.55;

  // Quick start
  doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.ink); doc.setFontSize(14);
  doc.text("Quick start", i(MARGIN), i(y));
  y += 0.4;
  const steps = [
    [`Print every page at "Actual size" / 100% (not "Fit to page").`, "Cardstock makes pieces sturdier. Laminate if you'd like to reuse the board."],
    ["Lay the pages out using the board map on page 2.", "Each page has its spot (A1, A2, B1 …) printed at the top."],
    ["Trim and overlap, then glue or tape the pages together.", "The pink dashed strip on each page is where the next page sits."],
    ["Cut out your letters, words and clipart along the light grey outline.", "Then pin everything up and enjoy your board!"],
  ];
  const stepCols = [BRAND.magenta, BRAND.indigo, BRAND.orange, BRAND.pink];
  steps.forEach(([main, sub], k) => {
    stepDot(doc, k + 1, i(MARGIN + 0.15), i(y - 0.04), stepCols[k]);
    doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.ink); doc.setFontSize(10.5);
    doc.text(main, i(MARGIN + 0.45), i(y));
    doc.setFont("helvetica", "normal"); setTextCol(doc, BRAND.body); doc.setFontSize(9.5);
    doc.text(sub, i(MARGIN + 0.45), i(y + 0.2));
    y += 0.62;
  });

  // Thank-you note
  y += 0.15;
  setFill(doc, tint(BRAND.orange, 0.88)); doc.roundedRect(i(MARGIN), i(y), i(PRINT_W), i(0.75), 6, 6, "F");
  doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.ink); doc.setFontSize(10.5);
  doc.text("Thank you for supporting my small shop!", i(cx), i(y + 0.3), { align: "center" });
  doc.setFont("helvetica", "normal"); setTextCol(doc, BRAND.body); doc.setFontSize(9.5);
  doc.text("If your board turned out great, I'd love a review. It helps more than you know.", i(cx), i(y + 0.53), { align: "center" });
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
    doc.text("BORDER STRIPS",
      i(PAGE_W / 2), i(PAGE_H - 0.2), { align: "center" });

    const LABEL_H = 0.2; // space for label above each strip
    for (let idx = 0; idx < batch.length; idx++) {
      const { side, label, seg, numSegments, stripLen, offsetIn } = batch[idx];
      const rowY = MARGIN + idx * (BORDER_IN + LABEL_H + STRIP_GAP) + LABEL_H;
      const visLen = Math.min(STRIP_W, stripLen - offsetIn);

      // Strip label
      doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.indigo); doc.setFontSize(8);
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
      const sz = 1024; // fixed size for consistent rendering
      const c = document.createElement("canvas");
      c.width = sz; c.height = sz;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
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
        const a = d[px+3] / 255;
        // Blend onto white using the real alpha so tile edges stay smooth
        const r0 = tintColor ? tintColor[0] : d[px];
        const g0 = tintColor ? tintColor[1] : d[px+1];
        const b0 = tintColor ? tintColor[2] : d[px+2];
        d[px]   = Math.round(r0 * a + 255 * (1 - a));
        d[px+1] = Math.round(g0 * a + 255 * (1 - a));
        d[px+2] = Math.round(b0 * a + 255 * (1 - a));
        d[px+3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      const jpeg = c.toDataURL("image/jpeg", 0.95);

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
const RENDER_DPI = 300;

// Hairline cut guide drawn just outside the white border of letters and phrases,
// so the cut line shows when printed on white paper. At 300 dpi one board px is
// 0.15", so CUT_LINE_W is tiny: 0.08 board px ≈ 0.3 mm total, ~0.15 mm per side.
// Raise to 0.12 for a bolder line, or change the colour to #999999 if it fades.
const CUT_LINE_COLOR = "#b0b0b0";
const CUT_LINE_W = 0.08;

function loadImg(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Bounding box of an item in board px (matches itemBounds in Kaleidoprint.tsx)
function unrotatedBoundsOf(it) {
  if (it.type === "image") return { x: it.x, y: it.y, w: it.w || it.size, h: it.h || it.size };
  if (it.type === "letter") return { x: it.x, y: it.y, w: it.size * 0.72, h: it.size };
  if (it.type === "phrase") return { x: it.x, y: it.y, w: it.text.length * it.size * 0.56 + 8, h: it.size * 1.2 };
  return { x: it.x, y: it.y, w: 60, h: 60 };
}

// Same box once the item is rotated, so a turned item that pokes onto a
// neighbouring page still gets drawn there. Rotates about the same centre as
// drawItemsOnCanvas below.
function boundsOf(it) {
  const b = unrotatedBoundsOf(it);
  if (!it.rotate) return b;
  let cx, cy;
  if (it.type === "letter") { cx = it.x + it.size * 0.36; cy = it.y + it.size * 0.5; }
  else if (it.type === "phrase") { cx = it.x + (it.text.length * it.size * 0.56) / 2; cy = it.y + it.size * 0.5; }
  else { cx = b.x + b.w / 2; cy = b.y + b.h / 2; }
  const a = it.rotate * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([px, py]) => [
    cx + (px - cx) * cos - (py - cy) * sin,
    cy + (px - cx) * sin + (py - cy) * cos,
  ]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
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
      const whiteW = it.type === "letter" ? 3 : 2;
      ctx.lineWidth = whiteW + CUT_LINE_W;
      ctx.strokeStyle = CUT_LINE_COLOR;
      ctx.strokeText(text, it.x, it.y + it.size);
      ctx.lineWidth = whiteW;
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
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
      const jpeg = canvas.toDataURL("image/jpeg", 0.95);

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
        try { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.12 })); setFill(doc, BRAND.pink); doc.rect(x, y, w, h, "F"); doc.restoreGraphicsState(); } catch { /* ignore */ }
      };
      setDraw(doc, BRAND.pink); doc.setLineWidth(0.8); doc.setLineDashPattern([5, 3], 0);
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
      const lbl = pageLabel(r, c);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      setFill(doc, BRAND.indigo); doc.roundedRect(m, m - 19, doc.getTextWidth(`Page ${lbl}`) + 12, 14, 3, 3, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(`Page ${lbl}`, m + 6, m - 9);
      doc.setFont("helvetica", "normal"); setTextCol(doc, BRAND.pink); doc.setFontSize(7.5);
      // Overlap note top-right, so the bottom edge stays clear for the footer
      const notes: string[] = [];
      if (hasRight) notes.push(`${pageLabel(r, c + 1)} goes on the right`);
      if (hasBelow) notes.push(`${pageLabel(r + 1, c)} goes below`);
      if (notes.length) doc.text(`${notes.join("  ·  ")}  (line up on the pink dashed lines)`, i(PAGE_W - MARGIN), m - 9, { align: "right" });
    }
  }
  return { cols, rows, printed: new Set(printed), imgCache };
}

// ── Assembly map (shows which page goes where) ────────────────────────────────

function drawAssemblyMap(doc, { boardDims, items, boardColor }, layout) {
  const { cols, rows, printed, imgCache } = layout;
  doc.addPage();
  drawStripe(doc, i(MARGIN), i(MARGIN), i(PRINT_W), i(0.06));
  doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.ink); doc.setFontSize(20);
  doc.text("Board map", i(PAGE_W / 2), i(0.95), { align: "center" });
  doc.setFont("helvetica", "normal"); setTextCol(doc, BRAND.body); doc.setFontSize(10);
  doc.text(`${boardDims.w} ft × ${boardDims.h} ft board  ·  ${printed.size} board page${printed.size !== 1 ? "s" : ""}  ·  find each page's label at its top-left corner`,
    i(PAGE_W / 2), i(1.22), { align: "center" });

  const areaW = PRINT_W, areaH = 5.2;
  const cellW = Math.min(areaW / cols, (areaH / rows) * (CELL_W / CELL_H));
  const cellH = cellW * (CELL_H / CELL_W);
  const ox = (PAGE_W - cellW * cols) / 2, oy = 1.5;
  // Mini picture of the whole board, drawn to the same scale as the grid
  const f = cellW / CELL_W; // paper inches per board inch
  const boardW = boardDims.w * 12, boardH = boardDims.h * 12;
  try {
    const dpi = 300;
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(boardW * f * dpi));
    cv.height = Math.max(1, Math.round(boardH * f * dpi));
    const cx2 = cv.getContext("2d");
    cx2.imageSmoothingEnabled = true; cx2.imageSmoothingQuality = "high";
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
      setDraw(doc, has ? BRAND.indigo : "#cccccc"); doc.setLineWidth(has ? 0.9 : 0.5);
      doc.rect(x, y, i(cellW), i(cellH), "S");
      const fs = Math.max(6, Math.min(10, cellW * 9));
      doc.setFontSize(fs);
      doc.setFont("helvetica", "bold");
      const label = has ? pageLabel(r, c) : "skip";
      const tw = doc.getTextWidth(label) + 6;
      if (has) { setFill(doc, BRAND.indigo); doc.roundedRect(x + 2, y + 2, tw, fs + 3, 2, 2, "F"); doc.setTextColor(255, 255, 255); }
      else { setFill(doc, "#ffffff"); doc.rect(x + 2, y + 2, tw, fs + 3, "F"); setTextCol(doc, "#aaaaaa"); doc.setFont("helvetica", "normal"); }
      doc.text(label, x + 5, y + 2 + fs);
    }
  }

  const iy = oy + rows * cellH + 0.45;
  const boxH = Math.min(2.55, PAGE_H - 0.5 - iy);
  setFill(doc, tint(BRAND.teal, 0.85));
  doc.roundedRect(i(MARGIN), i(iy), i(PRINT_W), i(boxH), 6, 6, "F");
  doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.ink); doc.setFontSize(12);
  doc.text("How to put the board together", i(MARGIN + 0.25), i(iy + 0.38));
  const lastRow = rowLetter(rows - 1);
  const steps = [
    ["Lay the pages out in order, matching the labels on this map.", ""],
    ["Trim the white margin off the top and left edge of each page.", `Use the grey trim marks. Row A pages keep their top edge; column 1 pages keep their left edge.`],
    ["Overlap each page onto the pink dashed strip of the page before it.", "Line up the trimmed edge with the pink dashed line, then glue or tape."],
    [`Squares marked "skip" have nothing on them, so they weren't printed.`, rows > 1 ? `Rows run A to ${lastRow} from top to bottom; columns run 1 to ${cols} from left to right.` : ""],
  ];
  const stepCols = [BRAND.magenta, BRAND.indigo, BRAND.orange, BRAND.pink];
  let sy = iy + 0.75;
  steps.forEach(([main, sub], k) => {
    stepDot(doc, k + 1, i(MARGIN + 0.38), i(sy - 0.04), stepCols[k]);
    doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.ink); doc.setFontSize(9.5);
    doc.text(main, i(MARGIN + 0.65), i(sy));
    if (sub) { doc.setFont("helvetica", "normal"); setTextCol(doc, BRAND.body); doc.setFontSize(8.5); doc.text(sub, i(MARGIN + 0.65), i(sy + 0.18)); }
    sy += sub ? 0.46 : 0.34;
  });
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
    doc.text("BORDER", i(PAGE_W/2), i(PAGE_H - 0.2), { align: "center" });

    const batch = allSegments.slice(s, s + stripsPerPage);
    for (let idx = 0; idx < batch.length; idx++) {
      const { label, seg, numSegments, len, offsetIn } = batch[idx];
      const rowY = MARGIN + idx * (BORDER_IN + LABEL_H + STRIP_GAP) + LABEL_H;
      const visLen = Math.min(STRIP_W, len - offsetIn);

      doc.setFont("helvetica", "bold"); setTextCol(doc, BRAND.indigo); doc.setFontSize(8);
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
    boardName:     state.boardName     || "",
  };
  const logo = await loadLogoDataUrl();

  // Page 1 is left empty for now; the cover is drawn last so it knows the page count.
  // Board pages go right after the cover; the map is inserted before them afterwards.
  const mapAt = doc.getNumberOfPages() + 1;
  const layout = await drawBoardPages(doc, s);
  drawAssemblyMap(doc, s, layout);
  doc.movePage(doc.getNumberOfPages(), mapAt);
  if (INCLUDE_BORDER_STRIPS) {
    await drawBorderPages(doc, s);
    if (s.builtinBorder !== "none") await drawBuiltinBorderPages(doc, s);
  }
  drawCoverPage(doc, s, { logo, totalPages: doc.getNumberOfPages() });
  drawFooters(doc);
  doc.setProperties({ title: s.boardName || "Bulletin Board Print Kit", author: "Flora Peach Kaleidoscope", creator: "Kaleidoprint" });

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
