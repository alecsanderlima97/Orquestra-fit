"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import * as THREE from "three";

export type AnatomyMuscleZone = "shoulders" | "chest" | "arms" | "back" | "core" | "glutes" | "thighs" | "calves";

type AnatomyModel3DProps = {
  primary: Set<AnatomyMuscleZone>;
  secondary: Set<AnatomyMuscleZone>;
  profile: "masculino" | "feminino";
};

type ModelView = { yaw: number; pitch: number; zoom: number };

function createMaterial(zone: AnatomyMuscleZone | null, primary: Set<AnatomyMuscleZone>, secondary: Set<AnatomyMuscleZone>) {
  if (zone && primary.has(zone)) return new THREE.MeshStandardMaterial({ color: 0xff3f48, emissive: 0x5f070c, emissiveIntensity: .72, metalness: .18, roughness: .42 });
  if (zone && secondary.has(zone)) return new THREE.MeshStandardMaterial({ color: 0xffa12e, emissive: 0x5a2b00, emissiveIntensity: .62, metalness: .18, roughness: .42 });
  return new THREE.MeshStandardMaterial({ color: zone ? 0x66747a : 0x39464c, metalness: .58, roughness: .5 });
}

function addMesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function buildMannequin(profile: "masculino" | "feminino", primary: Set<AnatomyMuscleZone>, secondary: Set<AnatomyMuscleZone>) {
  const body = new THREE.Group();
  const feminine = profile === "feminino";
  const shoulderWidth = feminine ? .9 : 1;
  const waistWidth = feminine ? .86 : 1;
  const hipWidth = feminine ? 1.12 : 1;
  const limbWidth = feminine ? .9 : 1;
  const material = (zone: AnatomyMuscleZone | null = null) => createMaterial(zone, primary, secondary);

  addMesh(body, new THREE.SphereGeometry(1, 30, 24), material(), [0, 3.22, 0], [.43, .56, .42]);
  addMesh(body, new THREE.CylinderGeometry(.25, .31, .58, 24), material(), [0, 2.72, 0], [1, 1, .9]);
  addMesh(body, new THREE.SphereGeometry(1, 32, 22), material(), [0, 1.6, 0], [shoulderWidth, 1.16, .48]);
  addMesh(body, new THREE.CapsuleGeometry(.43, .86, 12, 24), material("core"), [0, .72, .02], [waistWidth, 1, .82]);
  addMesh(body, new THREE.SphereGeometry(1, 28, 20), material(), [0, .03, 0], [.72 * hipWidth, .43, .5]);

  addMesh(body, new THREE.SphereGeometry(1, 26, 18), material("chest"), [-.39 * shoulderWidth, 1.92, .36], [.5 * shoulderWidth, .43, .22]);
  addMesh(body, new THREE.SphereGeometry(1, 26, 18), material("chest"), [.39 * shoulderWidth, 1.92, .36], [.5 * shoulderWidth, .43, .22]);
  addMesh(body, new THREE.SphereGeometry(1, 26, 18), material("back"), [-.43 * shoulderWidth, 1.42, -.4], [.46 * shoulderWidth, .75, .16], [0, 0, -.12]);
  addMesh(body, new THREE.SphereGeometry(1, 26, 18), material("back"), [.43 * shoulderWidth, 1.42, -.4], [.46 * shoulderWidth, .75, .16], [0, 0, .12]);

  [-1, 1].forEach((side) => {
    addMesh(body, new THREE.SphereGeometry(1, 24, 18), material("shoulders"), [side * 1.02 * shoulderWidth, 2.02, 0], [.38 * limbWidth, .4, .39]);
    addMesh(body, new THREE.CapsuleGeometry(.22, .82, 10, 18), material("arms"), [side * 1.23 * shoulderWidth, 1.25, 0], [limbWidth, 1, limbWidth], [0, 0, side * -.12]);
    addMesh(body, new THREE.SphereGeometry(1, 20, 15), material(), [side * 1.34 * shoulderWidth, .7, 0], [.23 * limbWidth, .23, .23 * limbWidth]);
    addMesh(body, new THREE.CapsuleGeometry(.18, .78, 10, 18), material("arms"), [side * 1.43 * shoulderWidth, .12, 0], [limbWidth, 1, limbWidth], [0, 0, side * -.08]);
    addMesh(body, new THREE.CapsuleGeometry(.18, .2, 8, 16), material(), [side * 1.5 * shoulderWidth, -.48, .02], [.9 * limbWidth, 1, .62]);

    addMesh(body, new THREE.SphereGeometry(1, 24, 18), material("glutes"), [side * .35 * hipWidth, -.08, -.38], [.39 * hipWidth, .4, .31]);
    addMesh(body, new THREE.CapsuleGeometry(.35, 1.18, 12, 22), material("thighs"), [side * .43 * hipWidth, -.88, 0], [limbWidth, 1, limbWidth]);
    addMesh(body, new THREE.SphereGeometry(1, 20, 15), material(), [side * .43 * hipWidth, -1.7, .02], [.29 * limbWidth, .28, .3 * limbWidth]);
    addMesh(body, new THREE.CapsuleGeometry(.23, 1.02, 12, 20), material("calves"), [side * .43 * hipWidth, -2.4, -.02], [limbWidth, 1, limbWidth]);
    addMesh(body, new THREE.SphereGeometry(1, 20, 14), material(), [side * .43 * hipWidth, -3.09, .13], [.29 * limbWidth, .18, .5]);
  });

  body.rotation.order = "YXZ";
  return body;
}

export function AnatomyModel3D({ primary, secondary, profile }: AnatomyModel3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const targetView = useRef<ModelView>({ yaw: 0, pitch: 0, zoom: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinch = useRef<number | null>(null);
  const [preset, setPreset] = useState<"front" | "side" | "back">("front");
  const primaryKey = [...primary].sort().join("|");
  const secondaryKey = [...secondary].sort().join("|");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, .1, 100);
    camera.position.set(0, .05, 13.3);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x101519, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 3.3);
    key.position.set(4, 6, 6);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x56dbe8, 2.1);
    rim.position.set(-5, 2, -5);
    scene.add(rim);
    const warm = new THREE.PointLight(0xffbc73, 1.3, 20);
    warm.position.set(3, 0, 4);
    scene.add(warm);

    const body = buildMannequin(profile, new Set(primaryKey.split("|").filter(Boolean) as AnatomyMuscleZone[]), new Set(secondaryKey.split("|").filter(Boolean) as AnatomyMuscleZone[]));
    body.position.y = -.05;
    scene.add(body);

    const floorMaterial = new THREE.ShadowMaterial({ color: 0x000000, opacity: .45 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.1, 48), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.3;
    floor.receiveShadow = true;
    scene.add(floor);

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
      body.rotation.y += (target.yaw - body.rotation.y) * .16;
      body.rotation.x += (target.pitch - body.rotation.x) * .16;
      camera.position.z += ((13.3 / target.zoom) - camera.position.z) * .15;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      body.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((item) => item.dispose());
      });
      floor.geometry.dispose();
      floorMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [primaryKey, profile, secondaryKey]);

  const changeZoom = (amount: number) => {
    targetView.current.zoom = Math.min(1.48, Math.max(.78, targetView.current.zoom + amount));
  };
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
      setPreset("front");
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
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? .1 : -.1);
  };
  const reset = () => {
    targetView.current = { yaw: 0, pitch: 0, zoom: 1 };
    setPreset("front");
  };

  return <div className="anatomy-3d-shell">
    <div className="anatomy-3d-viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onWheel={onWheel}>
      <div ref={mountRef} className="anatomy-3d-canvas" role="img" aria-label={`Manequim anatômico 3D ${profile}`} />
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
