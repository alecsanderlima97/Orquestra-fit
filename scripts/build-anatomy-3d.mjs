// Gera os modelos 3D do visualizador anatômico a partir das fotos existentes.
// As silhuetas de frente (alpha) e de lado (segmentação) servem de molde:
// cada linha da imagem vira uma seção elíptica, o volume é suavizado e a
// superfície é extraída com Surface Nets. Uso: node scripts/build-anatomy-3d.mjs
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = "public/anatomy-3d";
const STEP = 7; // pixels da imagem por voxel

async function rgba(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function alphaMask(img) {
  const mask = new Uint8Array(img.width * img.height);
  for (let i = 0; i < mask.length; i++) mask[i] = img.data[i * 4 + 3] > 110 ? 1 : 0;
  return mask;
}

function blur1d(src, out, n, stride, offset, r) {
  // média móvel com borda replicada
  let acc = 0;
  for (let k = -r; k <= r; k++) acc += src[offset + Math.min(n - 1, Math.max(0, k)) * stride];
  for (let i = 0; i < n; i++) {
    out[offset + i * stride] = acc / (2 * r + 1);
    acc += src[offset + Math.min(n - 1, i + r + 1) * stride] - src[offset + Math.max(0, i - r) * stride];
  }
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) blur1d(src, tmp, w, 1, y * w, r);
  for (let x = 0; x < w; x++) blur1d(tmp, out, h, w, x, r);
  return out;
}

// A foto lateral não tem transparência: o corpo é separado do brilho de fundo
// pela textura (diferença para uma versão bem desfocada da própria imagem).
function sideMask(img) {
  const { width: w, height: h } = img;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.3 * img.data[i * 4] + 0.59 * img.data[i * 4 + 1] + 0.11 * img.data[i * 4 + 2];
  let bg = lum; for (let k = 0; k < 3; k++) bg = boxBlur(bg, w, h, 22);
  const edge = new Float32Array(w * h);
  for (let i = 0; i < edge.length; i++) edge[i] = Math.abs(lum[i] - bg[i]) > 16 ? 1 : 0;
  // fechamento: dilata, preenche o interior e erode de volta
  const grown = boxBlur(edge, w, h, 9); const closed = new Uint8Array(w * h);
  for (let i = 0; i < closed.length; i++) closed[i] = grown[i] > 0.12 ? 1 : 0;
  const filled = fillHoles(keepLargest(closed, w, h), w, h);
  const shrunk = boxBlur(Float32Array.from(filled), w, h, 9); const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = shrunk[i] > 0.6 ? 1 : 0;
  const body = keepLargest(mask, w, h); const box = bbox(body, w, h);
  // cabeça lisa e clara quase não tem textura: preenche cada linha de ponta a ponta
  for (let y = box.y0; y < box.y0 + box.height * 0.11; y++) { const segs = segments(body, w, y); if (segs.length) for (let x = segs[0][0]; x < segs[segs.length - 1][1]; x++) body[y * w + x] = 1; }
  return body;
}

function fillHoles(mask, w, h) {
  const outside = new Uint8Array(w * h); const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) { const p = stack.pop(); if (outside[p] || mask[p]) continue; outside[p] = 1; const x = p % w, y = (p / w) | 0; if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1); if (y > 0) stack.push(p - w); if (y < h - 1) stack.push(p + w); }
  const out = new Uint8Array(w * h); for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1; return out;
}

function keepLargest(mask, w, h) {
  const label = new Int32Array(w * h); let best = 0, bestSize = 0, next = 1; const sizes = [0];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i]) continue;
    const stack = [i]; label[i] = next; let size = 0;
    while (stack.length) { const p = stack.pop(); size++; const x = p % w, y = (p / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const q = ny * w + nx; if (mask[q] && !label[q]) { label[q] = next; stack.push(q); } } }
    sizes.push(size); if (size > bestSize) { bestSize = size; best = next; } next++;
  }
  const out = new Uint8Array(w * h); for (let i = 0; i < out.length; i++) out[i] = label[i] === best ? 1 : 0; return out;
}

function segments(mask, w, y) {
  const segs = []; let start = -1;
  for (let x = 0; x <= w; x++) { const on = x < w && mask[y * w + x]; if (on && start < 0) start = x; if (!on && start >= 0) { segs.push([start, x]); start = -1; } }
  return segs.filter(([a, b]) => b - a > 3);
}

function bbox(mask, w, h) {
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, height: y1 - y0 };
}

function buildVolume(front, fw, fh, side, sw, sh) {
  const fb = bbox(front, fw, fh), sb = bbox(side, sw, sh);
  const k = fb.height / sb.height; // pixels de frente por pixel lateral
  const sideAt = (yFront) => {
    const ys = Math.round(sb.y0 + (yFront - fb.y0) / k);
    if (ys < sb.y0 || ys > sb.y1) return null;
    const segs = segments(side, sw, ys); if (!segs.length) return null;
    const z0 = (segs[0][0] - sb.cx) * k, z1 = (segs[segs.length - 1][1] - sb.cx) * k;
    return { z0, z1 };
  };
  const nx = Math.ceil(fw / STEP) + 4, ny = Math.ceil(fh / STEP) + 4;
  const zHalf = Math.ceil((sb.x1 - sb.x0) * k / 2 / STEP) + 6; const nz = zHalf * 2;
  const field = new Float32Array(nx * ny * nz).fill(-STEP * 3);
  const idx = (x, y, z) => (z * ny + y) * nx + x;
  for (let gy = 0; gy < ny; gy++) {
    const y = (gy - 2) * STEP; if (y < fb.y0 || y > fb.y1) continue;
    const segs = segments(front, fw, Math.round(y)); const depth = sideAt(y); if (!segs.length || !depth) continue;
    const core = new Set(); const central = segs.findIndex(([a, b]) => a <= fb.cx && b >= fb.cx);
    if (central >= 0) core.add(central);
    else { const order = segs.map((s, i) => [Math.abs((s[0] + s[1]) / 2 - fb.cx), i]).sort((a, b) => a[0] - b[0]); core.add(order[0][1]); if (order[1]) core.add(order[1][1]); }
    const coreCz = (depth.z0 + depth.z1) / 2, coreD = (depth.z1 - depth.z0) / 2;
    segs.forEach(([a, b], i) => {
      const cx = (a + b) / 2 - fb.cx, w = (b - a) / 2;
      const isCore = core.has(i); const d = isCore ? coreD : Math.min(w * 1.05, coreD * 0.9); const cz = isCore ? coreCz : coreCz - coreD * 0.05;
      const p = isCore && w > 60 ? 2.4 : 2.1; const r = Math.min(w, d);
      for (let gz = 0; gz < nz; gz++) {
        const z = (gz - zHalf) * STEP; const dz = Math.abs(z - cz) / d;
        for (let gx = 0; gx < nx; gx++) {
          const x = (gx - 2) * STEP - fb.cx; const dx = Math.abs(x - cx) / w;
          const v = (1 - Math.pow(Math.pow(dx, p) + Math.pow(dz, p), 1 / p)) * r;
          const j = idx(gx, gy, gz); if (v > field[j]) field[j] = v;
        }
      }
    });
  }
  smooth3(field, nx, ny, nz, 2);
  return { field, nx, ny, nz, zHalf, fb, sb, k };
}

function smooth3(f, nx, ny, nz, passes) {
  const tmp = new Float32Array(f.length);
  for (let p = 0; p < passes; p++) for (const [sx, sy, sz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    const stride = sx + sy * nx + sz * nx * ny;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = (z * ny + y) * nx + x; const ok = (sx ? x : sy ? y : z); const max = sx ? nx : sy ? ny : nz;
      const a = ok > 0 ? f[i - stride] : f[i], c = ok < max - 1 ? f[i + stride] : f[i];
      tmp[i] = 0.25 * a + 0.5 * f[i] + 0.25 * c;
    }
    f.set(tmp);
  }
}

// Surface Nets: um vértice por célula que cruza a superfície, quads entre células vizinhas.
function surfaceNets({ field, nx, ny, nz, zHalf, fb }) {
  const at = (x, y, z) => field[(z * ny + y) * nx + x];
  const vid = new Int32Array(nx * ny * nz).fill(-1); const pos = [];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let sx = 0, sy = 0, sz = 0, n = 0, inside = 0;
    const c = []; for (let i = 0; i < 8; i++) { const v = at(x + (i & 1), y + ((i >> 1) & 1), z + ((i >> 2) & 1)); c.push(v); if (v > 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) {
      if ((c[a] > 0) === (c[b] > 0)) continue; const t = c[a] / (c[a] - c[b]);
      sx += (a & 1) + t * ((b & 1) - (a & 1)); sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1)); sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1)); n++;
    }
    vid[(z * ny + y) * nx + x] = pos.length / 3;
    pos.push(((x + sx / n) - 2) * STEP - fb.cx, ((y + sy / n) - 2) * STEP, ((z + sz / n) - zHalf) * STEP);
  }
  const tri = []; const V = (x, y, z) => vid[(z * ny + y) * nx + x];
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const here = at(x, y, z) > 0;
    const quad = (a, b, c, d, flip) => { if ([a, b, c, d].some((v) => v < 0)) return; if (flip) tri.push(a, c, b, a, d, c); else tri.push(a, b, c, a, c, d); };
    if (here !== (at(x + 1, y, z) > 0)) quad(V(x, y - 1, z - 1), V(x, y, z - 1), V(x, y, z), V(x, y - 1, z), here);
    if (here !== (at(x, y + 1, z) > 0)) quad(V(x - 1, y, z - 1), V(x - 1, y, z), V(x, y, z), V(x, y, z - 1), here);
    if (here !== (at(x, y, z + 1) > 0)) quad(V(x - 1, y - 1, z), V(x, y - 1, z), V(x, y, z), V(x - 1, y, z), here);
  }
  return { pos: new Float32Array(pos), tri: new Uint32Array(tri) };
}

function relax(pos, tri, passes) {
  const n = pos.length / 3; const nbr = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < tri.length; i += 3) for (let j = 0; j < 3; j++) { nbr[tri[i + j]].add(tri[i + (j + 1) % 3]); nbr[tri[i + j]].add(tri[i + (j + 2) % 3]); }
  for (let p = 0; p < passes; p++) { const next = pos.slice(); for (let v = 0; v < n; v++) { if (!nbr[v].size) continue; let x = 0, y = 0, z = 0; for (const u of nbr[v]) { x += pos[u * 3]; y += pos[u * 3 + 1]; z += pos[u * 3 + 2]; } const s = nbr[v].size; next[v * 3] = pos[v * 3] * 0.5 + x / s * 0.5; next[v * 3 + 1] = pos[v * 3 + 1] * 0.5 + y / s * 0.5; next[v * 3 + 2] = pos[v * 3 + 2] * 0.5 + z / s * 0.5; } pos.set(next); }
}

async function writeModel(name, frontPath, sideImg, side) {
  const frontImg = await rgba(frontPath); const front = alphaMask(frontImg);
  const vol = buildVolume(front, frontImg.width, frontImg.height, side, sideImg.width, sideImg.height);
  const { pos, tri } = surfaceNets(vol); relax(pos, tri, 3);
  // normaliza: altura do corpo = 2 unidades, centro em 0, y para cima
  const { fb } = vol; const scale = 2 / fb.height; const midY = (fb.y0 + fb.y1) / 2;
  const q = new Int16Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) { q[i] = Math.round(pos[i] * scale * 16000); q[i + 1] = Math.round(-(pos[i + 1] - midY) * scale * 16000); q[i + 2] = Math.round(pos[i + 2] * scale * 16000); }
  const vertexCount = pos.length / 3; const index = vertexCount < 65536 ? Uint16Array.from(tri) : tri;
  const header = new Uint32Array([vertexCount, tri.length, index instanceof Uint16Array ? 16 : 32, 0]);
  await writeFile(`${OUT}/${name}.bin`, Buffer.concat([Buffer.from(header.buffer), Buffer.from(q.buffer), Buffer.from(index.buffer)]));
  console.log(name, "vértices", vertexCount, "triângulos", tri.length / 3);
  return { frontBox: fb, scale, midY };
}

await mkdir(OUT, { recursive: true });
const sideImg = await rgba("public/anatomy-body-side.png");
const side = sideMask(sideImg);
const sb = bbox(side, sideImg.width, sideImg.height);
// textura lateral com transparência, para projeção sem o brilho de fundo
const sideRgba = Buffer.from(sideImg.data); for (let i = 0; i < side.length; i++) sideRgba[i * 4 + 3] = side[i] ? 255 : 0;
await sharp(sideRgba, { raw: { width: sideImg.width, height: sideImg.height, channels: 4 } }).resize(512, 768).webp({ quality: 82, alphaQuality: 90 }).toFile(`${OUT}/side.webp`);
for (const n of ["base", "feminine", "back"]) await sharp(`public/anatomy-body-${n}.png`).resize(512, 768).webp({ quality: 82, alphaQuality: 90 }).toFile(`${OUT}/${n}.webp`);
const backImg = await rgba("public/anatomy-body-back.png"); const bb = bbox(alphaMask(backImg), backImg.width, backImg.height);
const male = await writeModel("male", "public/anatomy-body-base.png", sideImg, side);
const female = await writeModel("female", "public/anatomy-body-feminine.png", sideImg, side);
const box = (b) => ({ cx: b.cx, y0: b.y0, y1: b.y1 });
const calibration = { imageWidth: 1024, imageHeight: 1536, side: box(sb), back: box(bb), male: box(male.frontBox), female: box(female.frontBox) };
await writeFile(`${OUT}/calibration.json`, JSON.stringify(calibration, null, 2) + "\n");
console.log(calibration);
