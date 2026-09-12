"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type AnatomyMuscleZone = "shoulders" | "chest" | "arms" | "back" | "core" | "glutes" | "thighs" | "calves";

type AnatomyModel3DProps = {
  primary: Set<AnatomyMuscleZone>;
  secondary: Set<AnatomyMuscleZone>;
  profile: "masculino" | "feminino";
};

type ModelView = { yaw: number; pitch: number; zoom: number };

function activeMaterial(zone: AnatomyMuscleZone, primary: Set<AnatomyMuscleZone>, secondary: Set<AnatomyMuscleZone>) {
  if (primary.has(zone)) return new THREE.MeshPhysicalMaterial({ color: 0xff3f48, emissive: 0x71080e, emissiveIntensity: .58, roughness: .38, metalness: .05, clearcoat: .45, transparent: true, opacity: .86, depthWrite: false });
  if (secondary.has(zone)) return new THREE.MeshPhysicalMaterial({ color: 0xffa12e, emissive: 0x6b3100, emissiveIntensity: .5, roughness: .4, metalness: .04, clearcoat: .4, transparent: true, opacity: .82, depthWrite: false });
  return null;
}

function addHighlight(group: THREE.Group, zone: AnatomyMuscleZone, geometry: THREE.BufferGeometry, primary: Set<AnatomyMuscleZone>, secondary: Set<AnatomyMuscleZone>, position: [number, number, number], scale: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) {
  const material = activeMaterial(zone, primary, secondary);
  if (!material) {
    geometry.dispose();
    return;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.renderOrder = 3;
  group.add(mesh);
}

function buildHighlights(profile: "masculino" | "feminino", primary: Set<AnatomyMuscleZone>, secondary: Set<AnatomyMuscleZone>) {
  const highlights = new THREE.Group();
  const feminine = profile === "feminino";
  const shoulder = feminine ? .92 : 1;
  const hip = feminine ? 1.08 : 1;

  addHighlight(highlights, "chest", new THREE.SphereGeometry(1, 28, 18), primary, secondary, [-.3 * shoulder, 1.55, .47], [.35 * shoulder, .3, .12]);
  addHighlight(highlights, "chest", new THREE.SphereGeometry(1, 28, 18), primary, secondary, [.3 * shoulder, 1.55, .47], [.35 * shoulder, .3, .12]);
  addHighlight(highlights, "core", new THREE.CapsuleGeometry(.19, .78, 10, 20), primary, secondary, [0, .68, .43], [1.28, 1, .48]);
  addHighlight(highlights, "back", new THREE.SphereGeometry(1, 28, 18), primary, secondary, [-.28 * shoulder, 1.15, -.43], [.34 * shoulder, .62, .11], [0, 0, -.08]);
  addHighlight(highlights, "back", new THREE.SphereGeometry(1, 28, 18), primary, secondary, [.28 * shoulder, 1.15, -.43], [.34 * shoulder, .62, .11], [0, 0, .08]);

  [-1, 1].forEach((side) => {
    addHighlight(highlights, "shoulders", new THREE.SphereGeometry(1, 24, 16), primary, secondary, [side * .7 * shoulder, 1.63, .02], [.19, .28, .29]);
    addHighlight(highlights, "arms", new THREE.CapsuleGeometry(.105, .72, 8, 16), primary, secondary, [side * .82 * shoulder, .93, .02], [1, 1, 1], [0, 0, side * -.035]);
    addHighlight(highlights, "arms", new THREE.CapsuleGeometry(.075, .62, 8, 16), primary, secondary, [side * .84 * shoulder, .18, .02], [1, 1, 1]);
    addHighlight(highlights, "glutes", new THREE.SphereGeometry(1, 24, 16), primary, secondary, [side * .25 * hip, -.08, -.43], [.29 * hip, .32, .16]);
    addHighlight(highlights, "thighs", new THREE.CapsuleGeometry(.19, .92, 10, 18), primary, secondary, [side * .27 * hip, -.92, .18], [1, 1, .62]);
    addHighlight(highlights, "calves", new THREE.CapsuleGeometry(.115, .66, 10, 18), primary, secondary, [side * .26 * hip, -2.15, -.04], [1, 1, .86]);
  });
  return highlights;
}

function shapeProfile(model: THREE.Object3D, profile: "masculino" | "feminino") {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = object.geometry.clone();
    if (profile === "feminino") {
      const position = object.geometry.attributes.position;
      object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox;
      if (bounds && position) {
        const height = Math.max(.001, bounds.max.y - bounds.min.y);
        for (let index = 0; index < position.count; index += 1) {
          const y = position.getY(index);
          const level = (y - bounds.min.y) / height;
          const shoulderNarrowing = .09 * Math.exp(-Math.pow((level - .76) / .085, 2));
          const waistNarrowing = .1 * Math.exp(-Math.pow((level - .59) / .085, 2));
          const hipWidening = .1 * Math.exp(-Math.pow((level - .47) / .075, 2));
          position.setX(index, position.getX(index) * (1 - shoulderNarrowing - waistNarrowing + hipWidening));
        }
        position.needsUpdate = true;
        object.geometry.computeVertexNormals();
      }
    }
    const originalMaterials = Array.isArray(object.material) ? object.material : [object.material];
    originalMaterials.forEach((material) => material.dispose());
    object.material = new THREE.MeshPhysicalMaterial({ color: 0x8a969b, metalness: .24, roughness: .62, clearcoat: .18 });
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

export function AnatomyModel3D({ primary, secondary, profile }: AnatomyModel3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const targetView = useRef<ModelView>({ yaw: 0, pitch: 0, zoom: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinch = useRef<number | null>(null);
  const [preset, setPreset] = useState<"front" | "side" | "back" | "free">("front");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const primaryKey = [...primary].sort().join("|");
  const secondaryKey = [...secondary].sort().join("|");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setLoadState("loading");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
    camera.position.set(0, .05, 13.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe8f7ff, 0x11181b, 2.3));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(4, 6, 6);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x52d9e7, 2.2);
    rim.position.set(-5, 2, -5);
    scene.add(rim);
    const warm = new THREE.PointLight(0xffb769, 1.15, 20);
    warm.position.set(3, 0, 4);
    scene.add(warm);

    const bodyRoot = new THREE.Group();
    bodyRoot.rotation.order = "YXZ";
    scene.add(bodyRoot);
    const primarySet = new Set(primaryKey.split("|").filter(Boolean) as AnatomyMuscleZone[]);
    const secondarySet = new Set(secondaryKey.split("|").filter(Boolean) as AnatomyMuscleZone[]);
    const highlights = buildHighlights(profile, primarySet, secondarySet);
    bodyRoot.add(highlights);

    const floorMaterial = new THREE.ShadowMaterial({ color: 0x000000, opacity: .42 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.8, 48), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.28;
    floor.receiveShadow = true;
    scene.add(floor);

    let disposed = false;
    let loadedModel: THREE.Object3D | null = null;
    new GLTFLoader().load("/models/human-anatomy-base.glb", (gltf) => {
      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }
      loadedModel = gltf.scene;
      shapeProfile(loadedModel, profile);
      const sourceBounds = new THREE.Box3().setFromObject(loadedModel);
      const size = sourceBounds.getSize(new THREE.Vector3());
      const scale = 6.45 / Math.max(size.y, .001);
      const center = sourceBounds.getCenter(new THREE.Vector3());
      loadedModel.scale.setScalar(scale);
      loadedModel.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      bodyRoot.add(loadedModel);
      setLoadState("ready");
    }, undefined, () => { if (!disposed) setLoadState("error"); });

    const resize = () => {
      const width = mount.clientWidth || 278;
      const height = mount.clientHeight || 390;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    const render = () => {
      const target = targetView.current;
      bodyRoot.rotation.y += (target.yaw - bodyRoot.rotation.y) * .16;
      bodyRoot.rotation.x += (target.pitch - bodyRoot.rotation.x) * .16;
      camera.position.z += ((13.2 / target.zoom) - camera.position.z) * .15;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      disposeObject(highlights);
      if (loadedModel) disposeObject(loadedModel);
      floor.geometry.dispose();
      floorMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [primaryKey, profile, secondaryKey]);

  const changeZoom = (amount: number) => { targetView.current.zoom = Math.min(1.48, Math.max(.78, targetView.current.zoom + amount)); };
  const setModelPreset = (next: "front" | "side" | "back") => {
    setPreset(next);
    targetView.current.yaw = next === "front" ? 0 : next === "side" ? Math.PI / 2 : Math.PI;
    targetView.current.pitch = 0;
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 1) {
      targetView.current.yaw += (event.clientX - previous.x) * .012;
      targetView.current.pitch = Math.min(.22, Math.max(-.22, targetView.current.pitch + (event.clientY - previous.y) * .004));
      setPreset("free");
      return;
    }
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (lastPinch.current !== null) changeZoom((distance - lastPinch.current) * .006);
    lastPinch.current = distance;
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) lastPinch.current = null;
  };
  const reset = () => {
    targetView.current = { yaw: 0, pitch: 0, zoom: 1 };
    setPreset("front");
  };

  return <div className="anatomy-3d-shell">
    <div className="anatomy-3d-viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onWheel={(event: ReactWheelEvent<HTMLDivElement>) => { event.preventDefault(); changeZoom(event.deltaY < 0 ? .1 : -.1); }}>
      <div ref={mountRef} className="anatomy-3d-canvas" role="img" aria-label={`Manequim anatômico 3D ${profile}`} />
      {loadState === "loading" && <span className="anatomy-3d-status">Carregando modelo 3D…</span>}
      {loadState === "error" && <span className="anatomy-3d-status error">Não foi possível carregar o modelo 3D.</span>}
    </div>
    <div className="anatomy-view-presets" role="group" aria-label="Posição do manequim">
      <button type="button" className={preset === "front" ? "active" : ""} onClick={() => setModelPreset("front")}>Frente</button>
      <button type="button" className={preset === "side" ? "active" : ""} onClick={() => setModelPreset("side")}>Lado</button>
      <button type="button" className={preset === "back" ? "active" : ""} onClick={() => setModelPreset("back")}>Costas</button>
    </div>
    <div className="anatomy-controls" aria-label="Controles da visualização anatômica">
      <span>Arraste para girar em 3D · use dois dedos para zoom</span>
      <div><button type="button" aria-label="Diminuir zoom" onClick={() => changeZoom(-.1)}><ZoomOut /></button><button type="button" aria-label="Restaurar visualização" onClick={reset}><RotateCcw /></button><button type="button" aria-label="Aumentar zoom" onClick={() => changeZoom(.1)}><ZoomIn /></button></div>
    </div>
  </div>;
}
