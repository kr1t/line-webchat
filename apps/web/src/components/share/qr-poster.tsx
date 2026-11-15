"use client";

import { forwardRef, useMemo } from "react";
import QRCode from "qrcode";

const INK = "#1A1A1A";
const RED = "#F2483A";
const CREAM = "#FBF8F1";
const PINK = "#FDECE9";

export const POSTER_W = 1080;
export const POSTER_H = 1350;

/** Bumpy-edged rounded box, the same shape as น้องติ๊ก. */
function scallopPath(x: number, y: number, w: number, h: number, bumps = 14, r = 14) {
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) =>
    Array.from({ length: bumps }, (_, i) => {
      const t0 = i / bumps;
      const t1 = (i + 1) / bumps;
      const sx = ax + (bx - ax) * t0;
      const sy = ay + (by - ay) * t0;
      const ex = ax + (bx - ax) * t1;
      const ey = ay + (by - ay) * t1;
      return `Q ${((sx + ex) / 2 + nx * r).toFixed(1)} ${((sy + ey) / 2 + ny * r).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    }).join(" ");
  return [
    `M ${x} ${y}`,
    edge(x, y, x + w, y, 0, -1),
    edge(x + w, y, x + w, y + h, 1, 0),
    edge(x + w, y + h, x, y + h, 0, 1),
    edge(x, y + h, x, y, -1, 0),
    "Z",
  ].join(" ");
}

function star(cx: number, cy: number, r: number, fill: string) {
  const k = r * 0.3;
  return `M ${cx} ${cy - r} L ${cx + k} ${cy - k} L ${cx + r} ${cy} L ${cx + k} ${cy + k} L ${cx} ${cy + r} L ${cx - k} ${cy + k} L ${cx - r} ${cy} L ${cx - k} ${cy - k} Z|${fill}`;
}

/**
 * The share poster: น้องติ๊ก peeking over a scalloped card, a QR code with round dots,
 * red "eyes" and น้องติ๊ก in the middle (error correction H keeps it scannable).
 */
export const QrPoster = forwardRef<SVGSVGElement, { url: string; handle: string; mascotSrc: string }>(function QrPoster(
  { url, handle, mascotSrc },
  ref,
) {
  const qr = useMemo(() => QRCode.create(url, { errorCorrectionLevel: "H" }), [url]);
  const size = qr.modules.size;
  const box = 560;
  const cell = box / size;
  const qx = (POSTER_W - box) / 2;
  const qy = 470;

  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);
  const center = Math.floor(size / 2);
  const logoCells = Math.ceil(size * 0.22);
  const inLogo = (r: number, c: number) => Math.abs(r - center) <= logoCells / 2 && Math.abs(c - center) <= logoCells / 2;

  const dots: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!qr.modules.get(r, c) || inFinder(r, c) || inLogo(r, c)) continue;
      dots.push(`<circle cx="${qx + (c + 0.5) * cell}" cy="${qy + (r + 0.5) * cell}" r="${cell * 0.42}"/>`);
    }
  }
  const finders = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ].map(([r, c]) => {
    const x = qx + c * cell;
    const y = qy + r * cell;
    return `<rect x="${x + cell * 0.5}" y="${y + cell * 0.5}" width="${cell * 6}" height="${cell * 6}" rx="${cell * 1.8}" fill="none" stroke="${INK}" stroke-width="${cell}"/>
      <rect x="${x + cell * 2}" y="${y + cell * 2}" width="${cell * 3}" height="${cell * 3}" rx="${cell}" fill="${RED}"/>`;
  });
  const logo = logoCells * cell;
  const stars = [star(120, 210, 26, "#F7C948"), star(965, 300, 20, RED), star(95, 1080, 18, "#6EC1E4"), star(990, 1050, 26, "#F7C948")];
  const confetti = [
    [180, 90, RED],
    [880, 120, "#6EC1E4"],
    [70, 640, "#9AD9AE"],
    [1010, 700, RED],
    [210, 1270, "#F7C948"],
    [860, 1280, "#9DBDF2"],
  ] as const;

  const svg = `
    <rect width="${POSTER_W}" height="${POSTER_H}" fill="${CREAM}"/>
    ${confetti.map(([x, y, f]) => `<circle cx="${x}" cy="${y}" r="12" fill="${f}"/>`).join("")}
    ${stars.map((s) => { const [d, f] = s.split("|"); return `<path d="${d}" fill="${f}" stroke="${INK}" stroke-width="4"/>`; }).join("")}
    <path d="${scallopPath(110, 300, 860, 980)}" fill="#FFFFFF" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
    <circle cx="${POSTER_W / 2}" cy="250" r="130" fill="${PINK}" stroke="${INK}" stroke-width="10"/>
    <clipPath id="badge"><circle cx="${POSTER_W / 2}" cy="250" r="124"/></clipPath>
    <image href="${mascotSrc}" x="${POSTER_W / 2 - 150}" y="100" width="300" height="300" clip-path="url(#badge)"/>
    <g>
      <path d="M 700 120 h 260 a 36 36 0 0 1 36 36 v 70 a 36 36 0 0 1 -36 36 h -190 l -46 40 v -40 h -24 a 36 36 0 0 1 -36 -36 v -70 a 36 36 0 0 1 36 -36 z" fill="${RED}" stroke="${INK}" stroke-width="7"/>
      <text x="830" y="205" font-size="44" font-weight="800" fill="#fff" text-anchor="middle" font-family="IBM Plex Sans Thai, Sukhumvit Set, Thonburi, sans-serif">แอดเพื่อนกัน!</text>
    </g>
    <text x="${POSTER_W / 2}" y="430" font-size="50" font-weight="800" fill="${INK}" text-anchor="middle" font-family="IBM Plex Sans Thai, Sukhumvit Set, Thonburi, sans-serif">สแกนคุยกับน้องติ๊ก</text>
    <rect x="${qx - 26}" y="${qy - 26}" width="${box + 52}" height="${box + 52}" rx="44" fill="${CREAM}" stroke="${INK}" stroke-width="6" stroke-dasharray="2 16" stroke-linecap="round"/>
    <g fill="${INK}">${dots.join("")}</g>
    ${finders.join("")}
    <rect x="${POSTER_W / 2 - logo / 2 - 8}" y="${qy + box / 2 - logo / 2 - 8}" width="${logo + 16}" height="${logo + 16}" rx="${logo / 4}" fill="#fff" stroke="${INK}" stroke-width="5"/>
    <clipPath id="logo"><rect x="${POSTER_W / 2 - logo / 2}" y="${qy + box / 2 - logo / 2}" width="${logo}" height="${logo}" rx="${logo / 5}"/></clipPath>
    <image href="${mascotSrc}" x="${POSTER_W / 2 - logo / 2}" y="${qy + box / 2 - logo / 2}" width="${logo}" height="${logo}" clip-path="url(#logo)"/>
    <text x="${POSTER_W / 2}" y="1125" font-size="36" font-weight="600" fill="${INK}" text-anchor="middle" font-family="IBM Plex Sans Thai, Sukhumvit Set, Thonburi, sans-serif">แจ้งปัญหา · ติดตามงาน · คุยกับทีม ได้ในแชทเดียว</text>
    <rect x="${POSTER_W / 2 - 190}" y="1160" width="380" height="76" rx="38" fill="#06C755" stroke="${INK}" stroke-width="6"/>
    <text x="${POSTER_W / 2}" y="1211" font-size="38" font-weight="800" fill="#fff" text-anchor="middle" font-family="Inter, Arial, sans-serif">LINE ${handle}</text>
    <text x="${POSTER_W / 2}" y="1318" font-size="40" font-weight="800" fill="${INK}" text-anchor="middle" font-family="Inter, Arial, sans-serif">t<tspan fill="${RED}">i</tspan>ckget</text>
  `;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${POSTER_W} ${POSTER_H}`}
      width={POSTER_W}
      height={POSTER_H}
      className="h-auto w-full"
      role="img"
      aria-label={`QR code แอดเพื่อน LINE ${handle}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
