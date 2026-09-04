let bgCanvas: HTMLCanvasElement | null = null;
let bgCtx: CanvasRenderingContext2D | null = null;
let bgAnimationId: number | null = null;
let bgVisible = false;
let hexCenters: { x: number; y: number }[] = [];
let mouseX = -Infinity;
let mouseY = -Infinity;

const HEX_SIZE = 34;
const BASE_ALPHA = 0.09;
const GLOW_RADIUS = 260;
const GLOW_RADIUS_SQ = GLOW_RADIUS * GLOW_RADIUS; // Square distance for fast checks
const BASE_COLOR = { r: 56, g: 189, b: 248 };
const BRIGHT_COLOR = { r: 165, g: 243, b: 252 };
const DEFAULT_STROKE_STYLE = `rgba(${BASE_COLOR.r}, ${BASE_COLOR.g}, ${BASE_COLOR.b}, ${BASE_ALPHA})`;

// Precompute relative vertex offsets ONCE
const HEX_OFFSETS = Array.from({ length: 6 }, (_, i) => {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return {
    x: HEX_SIZE * Math.cos(angle),
    y: HEX_SIZE * Math.sin(angle),
  };
});

function traceHexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.moveTo(cx + HEX_OFFSETS[0].x, cy + HEX_OFFSETS[0].y);
  for (let i = 1; i < 6; i++) {
    ctx.lineTo(cx + HEX_OFFSETS[i].x, cy + HEX_OFFSETS[i].y);
  }
}

function colorForDistance(dist: number): string {
  const t = Math.max(0, 1 - dist / GLOW_RADIUS);
  const eased = t * t;
  const r = (BASE_COLOR.r + (BRIGHT_COLOR.r - BASE_COLOR.r) * eased) | 0;
  const g = (BASE_COLOR.g + (BRIGHT_COLOR.g - BASE_COLOR.g) * eased) | 0;
  const b = (BASE_COLOR.b + (BRIGHT_COLOR.b - BASE_COLOR.b) * eased) | 0;
  const alpha = BASE_ALPHA + (1 - BASE_ALPHA) * eased;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function computeHexCenters() {
  if (!bgCanvas) return;
  const { width, height } = bgCanvas;
  const hexWidth = Math.sqrt(3) * HEX_SIZE;
  const hexHeight = 1.5 * HEX_SIZE;
  const cols = Math.ceil(width / hexWidth) + 2;
  const rows = Math.ceil(height / hexHeight) + 2;

  hexCenters = [];
  for (let r = -1; r <= rows; r++) {
    const cy = r * hexHeight;
    const rowOffset = Math.abs(r % 2) === 1 ? hexWidth / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      hexCenters.push({ x: c * hexWidth + rowOffset, y: cy });
    }
  }
}

function drawFrame() {
  if (!bgVisible || !bgCanvas || !bgCtx) {
    bgAnimationId = null;
    return; // Exit loop completely when not visible
  }

  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  bgCtx.lineWidth = 1;

  // 1. Single-pass batch for static background hexes
  bgCtx.beginPath();
  bgCtx.strokeStyle = DEFAULT_STROKE_STYLE;
  for (let i = 0; i < hexCenters.length; i++) {
    const { x, y } = hexCenters[i];
    const dx = x - mouseX;
    const dy = y - mouseY;
    const distSq = dx * dx + dy * dy;

    // Only batch hexes outside the mouse glow radius
    if (distSq >= GLOW_RADIUS_SQ) {
      traceHexPath(bgCtx, x, y);
    }
  }
  bgCtx.stroke(); // Draw all static hexes in 1 GPU call

  // 2. Individual pass for glowing hexes near the mouse
  for (let i = 0; i < hexCenters.length; i++) {
    const { x, y } = hexCenters[i];
    const dx = x - mouseX;
    const dy = y - mouseY;
    const distSq = dx * dx + dy * dy;

    if (distSq < GLOW_RADIUS_SQ) {
      bgCtx.beginPath();
      bgCtx.strokeStyle = colorForDistance(Math.sqrt(distSq));
      traceHexPath(bgCtx, x, y);
      bgCtx.stroke();
    }
  }

  bgAnimationId = requestAnimationFrame(drawFrame);
}

function resizeCanvas() {
  if (!bgCanvas) return;
  bgCanvas.width = window.innerWidth;
  bgCanvas.height = window.innerHeight;
  computeHexCenters();
}

export function initLobbyHexBackground(): void {
  if (bgCanvas) return;

  bgCanvas = document.createElement("canvas");
  bgCanvas.id = "lobby-hex-bg";
  bgCanvas.style.position = "absolute";
  bgCanvas.style.inset = "0";
  bgCanvas.style.zIndex = "1";
  bgCanvas.style.pointerEvents = "none";
  document.body.appendChild(bgCanvas);

  bgCtx = bgCanvas.getContext("2d");
  resizeCanvas();

  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener(
    "mousemove",
    (e) => {
      if (!bgVisible) return;
      mouseX = e.clientX;
      mouseY = e.clientY;
    },
    { passive: true }
  );
}

export function setLobbyHexBackgroundVisible(visible: boolean): void {
  bgVisible = visible;
  if (bgCanvas) {
    bgCanvas.style.display = visible ? "block" : "none";
  }

  if (visible) {
    if (bgAnimationId === null) {
      bgAnimationId = requestAnimationFrame(drawFrame);
    }
  } else {
    if (bgAnimationId !== null) {
      cancelAnimationFrame(bgAnimationId);
      bgAnimationId = null;
    }
  }
}