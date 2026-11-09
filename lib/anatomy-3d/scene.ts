import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, Mesh, PerspectiveCamera, Scene, ShaderMaterial,
  SRGBColorSpace, Texture, TextureLoader, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type AnatomyProfile = "masculino" | "feminino";
export type AnatomyCameraView = "front" | "side" | "back";
/** Contornos SVG (viewBox 320×560, mesma base das fotos 2D) a destacar nas vistas de frente e costas. */
export type AnatomyHighlight = Record<"front" | "back", { primary: string[]; secondary: string[] }>;

type Box = { cx: number; y0: number; y1: number };
type Calibration = { imageWidth: number; imageHeight: number; side: Box; back: Box; male: Box; female: Box };

const BASE = "/anatomy-3d";
const CAMERA_DISTANCE = 4.6;
const VIEW_DIRECTION: Record<AnatomyCameraView, Vector3> = {
  front: new Vector3(0, 0.04, 1), back: new Vector3(0, 0.04, -1), side: new Vector3(-1, 0.04, 0),
};

const vertexShader = /* glsl */`
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewNormal;
  void main() {
    vPos = position; vNormal = normal; vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const fragmentShader = /* glsl */`
  uniform sampler2D mapFront; uniform sampler2D mapBack; uniform sampler2D mapSide;
  uniform sampler2D maskFront; uniform sampler2D maskBack;
  uniform vec4 projFront; uniform vec4 projBack; uniform vec4 projSide;
  uniform vec3 primaryColor; uniform vec3 secondaryColor;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewNormal;
  vec2 uvOf(vec4 p, float coord) { return vec2(p.x + p.y * coord, p.z + p.w * vPos.y); }
  void main() {
    vec3 n = normalize(vNormal);
    vec2 uvF = uvOf(projFront, vPos.x); vec2 uvB = uvOf(projBack, vPos.x); vec2 uvS = uvOf(projSide, vPos.z);
    vec4 cF = texture2D(mapFront, uvF); vec4 cB = texture2D(mapBack, uvB); vec4 cS = texture2D(mapSide, uvS);
    float wF = pow(max(n.z, 0.0), 2.0) * cF.a; float wB = pow(max(-n.z, 0.0), 2.0) * cB.a; float wS = pow(abs(n.x), 2.0) * cS.a;
    float total = wF + wB + wS;
    vec3 base = total > 0.02 ? (cF.rgb * wF + cB.rgb * wB + cS.rgb * wS) / total : vec3(0.55);
    if (total < 0.25) base = mix(vec3(0.55), base, total / 0.25);
    // destaque vem só das vistas frente/costas: a projeção lateral confunde ombro e peito
    float hF = smoothstep(-0.18, 0.18, n.z);
    vec2 m = texture2D(maskFront, uvF).rg * hF + texture2D(maskBack, uvB).rg * (1.0 - hF);
    float luma = dot(base, vec3(0.299, 0.587, 0.114));
    vec3 color = base;
    color = mix(color, secondaryColor * (0.55 + 0.75 * luma), clamp(m.g * (1.0 - m.r), 0.0, 1.0) * 0.82);
    color = mix(color, primaryColor * (0.55 + 0.75 * luma), clamp(m.r, 0.0, 1.0) * 0.88);
    vec3 vn = normalize(vViewNormal);
    float light = 0.74 + 0.34 * max(dot(vn, normalize(vec3(0.35, 0.45, 1.0))), 0.0);
    float rim = pow(1.0 - max(vn.z, 0.0), 3.0) * 0.18;
    gl_FragColor = vec4(color * light + rim, 1.0);
    #include <colorspace_fragment>
  }`;

async function loadMesh(profile: AnatomyProfile) {
  const response = await fetch(`${BASE}/${profile === "feminino" ? "female" : "male"}.bin`);
  if (!response.ok) throw new Error("anatomy_mesh_unavailable");
  const buffer = await response.arrayBuffer();
  const [vertexCount, indexCount, indexBits] = new Uint32Array(buffer, 0, 4);
  const quantized = new Int16Array(buffer, 16, vertexCount * 3);
  const positions = new Float32Array(vertexCount * 3); for (let i = 0; i < positions.length; i++) positions[i] = quantized[i] / 16000;
  const indexOffset = 16 + vertexCount * 6;
  const index = indexBits === 16 ? new Uint16Array(buffer.slice(indexOffset, indexOffset + indexCount * 2)) : new Uint32Array(buffer.slice(indexOffset, indexOffset + indexCount * 4));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function projections(cal: Calibration, profile: AnatomyProfile) {
  const body = profile === "feminino" ? cal.female : cal.male;
  const height = body.y1 - body.y0, scale = 2 / height, midY = (body.y0 + body.y1) / 2;
  const W = cal.imageWidth, H = cal.imageHeight;
  // u = a + b·coord ; v = c + d·y (coord = x para frente/costas e z para o lado)
  const front: [number, number, number, number] = [body.cx / W, 1 / scale / W, midY / H, -1 / scale / H];
  const view = (box: Box, mirror: number): [number, number, number, number] => {
    const k = (box.y1 - box.y0) / height;
    return [box.cx / W, mirror * k / scale / W, (box.y0 + (midY - body.y0) * k) / H, -k / scale / H];
  };
  return { front, back: view(cal.back, -1), side: view(cal.side, 1) };
}

function maskTexture(paths: { primary: string[]; secondary: string[] }) {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 768;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("canvas_unavailable");
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 512, 768);
  // a foto 1024×1536 é exibida com "slice" no viewBox 320×560 (escala 560/1536, deslocamento −26,67)
  const k = (1536 / 560) * 0.5;
  ctx.setTransform(k, 0, 0, k, ((1024 - (320 * 1536) / 560) / 2) * 0.5, 0);
  ctx.filter = "blur(1.2px)"; ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgb(0,255,0)"; paths.secondary.forEach((d) => ctx.fill(new Path2D(d)));
  ctx.fillStyle = "rgb(255,0,0)"; paths.primary.forEach((d) => ctx.fill(new Path2D(d)));
  const texture = new CanvasTexture(canvas); texture.flipY = false; return texture;
}

export type AnatomyStage = {
  setView: (view: AnatomyCameraView) => void;
  zoomBy: (factor: number) => void;
  reset: () => void;
  dispose: () => void;
};

export async function createAnatomyStage(container: HTMLElement, options: { profile: AnatomyProfile; highlight: AnatomyHighlight; view: AnatomyCameraView; reducedMotion?: boolean; onZoom?: (percent: number) => void }): Promise<AnatomyStage> {
  const loader = new TextureLoader();
  const loadTexture = (name: string) => loader.loadAsync(`${BASE}/${name}.webp`).then((texture: Texture) => { texture.flipY = false; texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4; return texture; });
  const [geometry, calibration, front, back, side] = await Promise.all([
    loadMesh(options.profile),
    fetch(`${BASE}/calibration.json`).then((response) => response.json() as Promise<Calibration>),
    loadTexture(options.profile === "feminino" ? "feminine" : "base"), loadTexture("back"), loadTexture("side"),
  ]);
  const proj = projections(calibration, options.profile);
  const masks = { front: maskTexture(options.highlight.front), back: maskTexture(options.highlight.back) };
  const material = new ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      mapFront: { value: front }, mapBack: { value: back }, mapSide: { value: side },
      maskFront: { value: masks.front }, maskBack: { value: masks.back },
      projFront: { value: proj.front }, projBack: { value: proj.back }, projSide: { value: proj.side },
      primaryColor: { value: new Color("#ff3b30").convertSRGBToLinear() }, secondaryColor: { value: new Color("#ff9a2e").convertSRGBToLinear() },
    },
  });
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";
  const scene = new Scene(); scene.add(new Mesh(geometry, material));
  const camera = new PerspectiveCamera(28, 1, 0.05, 50);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !options.reducedMotion; controls.dampingFactor = 0.09;
  controls.minDistance = 1.3; controls.maxDistance = 9; controls.screenSpacePanning = true;
  controls.rotateSpeed = 0.9; controls.zoomSpeed = 1.1;
  const place = (view: AnatomyCameraView) => { camera.position.copy(VIEW_DIRECTION[view]).normalize().multiplyScalar(CAMERA_DISTANCE); controls.target.set(0, 0, 0); controls.update(); };
  place(options.view);

  let needsRender = true; let frame = 0; let tween: { from: Vector3; to: Vector3; target: Vector3; start: number } | null = null;
  const reportZoom = () => options.onZoom?.(Math.round((CAMERA_DISTANCE / camera.position.distanceTo(controls.target)) * 100));
  controls.addEventListener("change", () => { needsRender = true; reportZoom(); });
  const resize = () => { const { clientWidth: w, clientHeight: h } = container; if (!w || !h) return; renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%"; camera.aspect = w / h; camera.updateProjectionMatrix(); needsRender = true; };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  const loop = (time: number) => {
    frame = requestAnimationFrame(loop);
    if (tween) {
      const t = Math.min(1, (time - tween.start) / 650); const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const dir = tween.from.clone().lerp(tween.to, e).normalize().multiplyScalar(tween.from.length() + (tween.to.length() - tween.from.length()) * e);
      controls.target.lerp(tween.target, e); camera.position.copy(controls.target).add(dir); needsRender = true;
      if (t >= 1) tween = null;
    }
    if (controls.update() || needsRender) { renderer.render(scene, camera); needsRender = false; }
  };
  frame = requestAnimationFrame(loop);

  const animateTo = (direction: Vector3, distance: number) => {
    const to = direction.clone().normalize().multiplyScalar(distance);
    if (options.reducedMotion) { camera.position.copy(to); controls.target.set(0, 0, 0); controls.update(); return; }
    tween = { from: camera.position.clone().sub(controls.target), to, target: new Vector3(0, 0, 0), start: performance.now() };
  };
  return {
    setView: (view) => animateTo(VIEW_DIRECTION[view], CAMERA_DISTANCE),
    zoomBy: (factor) => {
      const offset = camera.position.clone().sub(controls.target);
      const distance = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() / factor));
      camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(distance)); controls.update(); needsRender = true; reportZoom();
    },
    reset: () => animateTo(camera.position.clone().sub(controls.target).setY(0.04 * CAMERA_DISTANCE), CAMERA_DISTANCE),
    dispose: () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); geometry.dispose(); material.dispose();
      [front, back, side, masks.front, masks.back].forEach((texture) => texture.dispose());
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
