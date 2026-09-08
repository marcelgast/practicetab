import type { SongSection } from '../../domain/songMap';

export type DrawWaveformParams = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  peaks: number[];
  durationMs: number;
  startOffsetMs: number;
  sections: SongSection[];
  cursorMs: number | null;
  accentColor: string;
  dragSectionId?: string | null;
};

const BG_COLOR = '#0f1218';
const PEAK_ALPHA = 0.6;
const START_OFFSET_COLOR = '#f2c94c';
// Cursor uses accent color — set dynamically from accentColor param
const SECTION_LABEL_FONT = '11px sans-serif';
const SECTION_LABEL_PAD_X = 4;
const SECTION_LABEL_PAD_Y = 14;
const HANDLE_RADIUS = 8;
const HANDLE_OVERHANG = 6;

function msToX(ms: number, durationMs: number, width: number): number {
  if (durationMs <= 0) {
    return 0;
  }
  return (ms / durationMs) * width;
}

export function drawWaveform(params: DrawWaveformParams): void {
  const {
    ctx,
    width,
    height,
    peaks,
    durationMs,
    startOffsetMs,
    sections,
    cursorMs,
    accentColor,
    dragSectionId,
  } = params;

  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  // Draw peaks as a smooth filled waveform (mirrored top/bottom)
  if (peaks.length > 0 && width > 0) {
    const mid = height / 2;
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = PEAK_ALPHA;

    ctx.beginPath();
    // Top edge (left to right) — linear interpolation between adjacent peaks
    for (let x = 0; x < width; x++) {
      const peakIdx = (x / width) * peaks.length;
      const lo = Math.floor(peakIdx);
      const t = peakIdx - lo;
      const a = Math.abs(peaks[lo]);
      const b = Math.abs(peaks[Math.min(peaks.length - 1, lo + 1)]);
      let peakValue = a + (b - a) * t;
      peakValue = Math.min(1, peakValue);
      const amp = Math.max(0.5, peakValue * mid);
      if (x === 0) {
        ctx.moveTo(x, mid - amp);
      } else {
        ctx.lineTo(x, mid - amp);
      }
    }
    // Bottom edge (right to left) — linear interpolation between adjacent peaks
    for (let x = width - 1; x >= 0; x--) {
      const peakIdx = (x / width) * peaks.length;
      const lo = Math.floor(peakIdx);
      const t = peakIdx - lo;
      const a = Math.abs(peaks[lo]);
      const b = Math.abs(peaks[Math.min(peaks.length - 1, lo + 1)]);
      let peakValue = a + (b - a) * t;
      peakValue = Math.min(1, peakValue);
      const amp = Math.max(0.5, peakValue * mid);
      ctx.lineTo(x, mid + amp);
    }
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  // Draw section markers
  for (const section of sections) {
    const x = msToX(section.timestampMs, durationMs, width);
    const isDragging = dragSectionId === section.id;

    // Line
    ctx.strokeStyle = section.color;
    ctx.lineWidth = isDragging ? 3 : 2;
    ctx.globalAlpha = isDragging ? 1 : 0.9;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Drag handle (rounded rect at top, overhangs above canvas)
    const handleY = -HANDLE_OVERHANG;
    const handleH = HANDLE_RADIUS * 2 + HANDLE_OVERHANG;
    const handleW = HANDLE_RADIUS * 2;
    ctx.fillStyle = section.color;
    ctx.beginPath();
    ctx.roundRect(x - handleW / 2, handleY, handleW, handleH, 4);
    ctx.fill();

    // Section label
    ctx.fillStyle = section.color;
    ctx.font = SECTION_LABEL_FONT;
    ctx.fillText(
      section.label,
      x + SECTION_LABEL_PAD_X,
      handleH + SECTION_LABEL_PAD_Y,
    );
  }

  // Draw start offset handle
  const offsetX = msToX(startOffsetMs, durationMs, width);
  ctx.strokeStyle = START_OFFSET_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(offsetX, 0);
  ctx.lineTo(offsetX, height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Start offset handle — larger triangle overhanging top
  ctx.fillStyle = START_OFFSET_COLOR;
  ctx.beginPath();
  ctx.moveTo(offsetX - 10, -HANDLE_OVERHANG);
  ctx.lineTo(offsetX + 10, -HANDLE_OVERHANG);
  ctx.lineTo(offsetX, 12);
  ctx.closePath();
  ctx.fill();

  // Draw cursor (bright accent color)
  if (cursorMs !== null && cursorMs >= 0) {
    const cursorX = msToX(cursorMs, durationMs, width);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, height);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
