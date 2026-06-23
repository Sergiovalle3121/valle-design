'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Loader2, X, Save, Move3d, Grid3x3, RotateCw, Trash2, Download,
  Box as BoxIcon, Eye, MapPin, Maximize2, Layers,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/contexts/ToastContext';

/**
 * Full-screen interactive 3D layout editor. Each placed station is an extruded,
 * labelled block on the plant floor; drag a block on the floor to reposition it
 * (a raycast against the ground gives the new world x/y — exactly the same
 * placement data the 2D editor uses, so the two views stay in sync), place
 * unplaced stations from the tray, rotate/remove the selection, snap to grid,
 * and save back through the shared layout endpoint. three.js + OrbitControls,
 * lazy-loaded so it only ships when opened.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

interface St {
  id: string; station: string; line: string; ctq: boolean;
  x: number | null; y: number | null; w: number | null; h: number | null; rotation: number | null;
}
interface Cell { id: string; name: string; color: string; stationIds: string[] }
interface Conn { from: string; to: string; kind?: string }
interface Asset { id: string; kind: string; x: number; y: number; w: number; h: number; rotation: number; label?: string }
interface Footprint { footprintW: number; footprintH: number; unit: string; gridSize: number }
interface Layout {
  footprint: Footprint;
  stations: St[];
  cells?: Cell[];
  connectors?: Conn[];
  assets?: Asset[];
  annotations?: unknown[];
}
interface Placement { x: number; y: number; w: number; h: number; rotation: number }

const ROSE = 0xf43f5e;
const AMBER = 0xf59e0b;
const SELECT = 0x22d3ee;

function makeLabel(text: string, scale = 1.5): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const fontSize = 46;
  const m = canvas.getContext('2d')!;
  m.font = `bold ${fontSize}px sans-serif`;
  const tw = m.measureText(text).width;
  canvas.width = Math.ceil(tw + 30);
  canvas.height = fontSize + 24;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, r);
  ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, r);
  ctx.arcTo(0, canvas.height, 0, 0, r); ctx.arcTo(0, 0, canvas.width, 0, r); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(scale * aspect, scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const mesh = c as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((mm) => {
      const t = (mm as THREE.Material & { map?: THREE.Texture | null }).map;
      if (t) t.dispose();
      mm.dispose();
    });
  });
}

export default function Layout3DEditor({
  model, revision, open, onClose, onSaved,
}: {
  model: string;
  revision: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<Layout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set());

  // three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const blocksRef = useRef<THREE.Group | null>(null);
  const decoRef = useRef<THREE.Group | null>(null);
  const meshByIdRef = useRef<Map<string, THREE.Mesh>>(new Map());

  // layout state refs (placements drive both the scene and the save)
  const placementsRef = useRef<Map<string, Placement>>(new Map());
  const loadedPlacedRef = useRef<Set<string>>(new Set());
  const ctxRef = useRef<{ s: number; W: number; H: number } | null>(null);
  const selIdRef = useRef<string | null>(null);
  const snapRef = useRef(snap);
  useEffect(() => { snapRef.current = snap; }, [snap]);
  useEffect(() => { selIdRef.current = selId; }, [selId]);

  // ---- data ----
  useEffect(() => {
    if (!open || !model) return;
    let alive = true;
    setData(null); setError(null); setSelId(null); setDirty(false);
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/line-engineering/layout?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`);
        if (!alive) return;
        if (!r.ok) { setError('No se pudo cargar el layout.'); return; }
        const d = (await r.json()) as Layout;
        const pl = new Map<string, Placement>();
        d.stations.forEach((s) => {
          if (s.x !== null && s.y !== null) {
            pl.set(s.id, {
              x: s.x, y: s.y,
              w: s.w ?? Math.round(d.footprint.footprintW * 0.06),
              h: s.h ?? Math.round(d.footprint.footprintH * 0.08),
              rotation: s.rotation ?? 0,
            });
          }
        });
        placementsRef.current = pl;
        loadedPlacedRef.current = new Set(pl.keys());
        setPlacedIds(new Set(pl.keys()));
        setData(d);
      } catch {
        if (alive) setError('No se pudo cargar el layout.');
      }
    })();
    return () => { alive = false; };
  }, [open, model, revision]);

  const snapWorld = useCallback((v: number) => {
    const g = data?.footprint.gridSize || 1;
    return snapRef.current ? Math.round(v / g) * g : Math.round(v);
  }, [data]);

  // ---- (re)build the blocks group from placements ----
  const rebuildBlocks = useCallback(() => {
    const blocks = blocksRef.current; const ctx = ctxRef.current;
    if (!blocks || !ctx || !data) return;
    while (blocks.children.length) { const o = blocks.children[blocks.children.length - 1]; blocks.remove(o); disposeObject(o); }
    meshByIdRef.current = new Map();
    const { s, W, H } = ctx;
    const byId = new Map(data.stations.map((st) => [st.id, st]));
    placementsRef.current.forEach((p, id) => {
      const st = byId.get(id); if (!st) return;
      const hgt = Math.max(0.6, Math.min(p.w * s, p.h * s) * 0.7);
      const sel = id === selIdRef.current;
      const color = sel ? SELECT : st.ctq ? AMBER : ROSE;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(p.w * s, hgt, p.h * s),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.12, emissive: sel ? 0x0e7490 : 0x000000 }),
      );
      mesh.castShadow = true;
      mesh.userData.stationId = id;
      const cx = (p.x + p.w / 2 - W / 2) * s;
      const cz = (p.y + p.h / 2 - H / 2) * s;
      mesh.position.set(cx, hgt / 2, cz);
      mesh.rotation.y = -(p.rotation * Math.PI) / 180;
      blocks.add(mesh);
      meshByIdRef.current.set(id, mesh);
      const label = makeLabel(st.station);
      label.position.set(cx, hgt + 1.1, cz);
      label.userData.labelFor = id;
      blocks.add(label);
    });
    // connectors as arched tubes between placed block tops
    (data.connectors ?? []).forEach((cn) => {
      const a = placementsRef.current.get(cn.from); const b = placementsRef.current.get(cn.to);
      if (!a || !b) return;
      const ha = Math.max(0.6, Math.min(a.w * s, a.h * s) * 0.7);
      const hb = Math.max(0.6, Math.min(b.w * s, b.h * s) * 0.7);
      const start = new THREE.Vector3((a.x + a.w / 2 - W / 2) * s, ha + 0.2, (a.y + a.h / 2 - H / 2) * s);
      const end = new THREE.Vector3((b.x + b.w / 2 - W / 2) * s, hb + 0.2, (b.y + b.h / 2 - H / 2) * s);
      const mid = start.clone().add(end).multiplyScalar(0.5); mid.y += start.distanceTo(end) * 0.22 + 0.8;
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, mid, end), 24, 0.09, 7, false),
        new THREE.MeshStandardMaterial({ color: cn.kind === 'conveyor' ? 0x7c3aed : cn.kind === 'return' ? 0x94a3b8 : 0x3b82f6, roughness: 0.4 }),
      );
      blocks.add(tube);
    });
  }, [data]);

  // ---- scene lifecycle ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!open || !data || !mount) return;
    let raf = 0; let disposed = false;
    const width = mount.clientWidth || 1200;
    const height = mount.clientHeight || 700;
    const fp = data.footprint;
    const W = fp.footprintW || 1; const H = fp.footprintH || 1;
    const s = 30 / Math.max(W, H);
    ctxRef.current = { s, W, H };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1e);
    scene.fog = new THREE.Fog(0x0a0f1e, Math.max(W, H) * s * 1.4, Math.max(W, H) * s * 3.2);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 4000);
    camera.position.set(W * s * 0.45, Math.max(W, H) * s * 0.8, H * s * 1.0 + 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const hemi = new THREE.HemisphereLight(0x9bbcff, 0x1e293b, 0.5); scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.15);
    dir.position.set(W * s * 0.6, Math.max(W, H) * s * 1.2, H * s * 0.4);
    dir.castShadow = true;
    const sh = Math.max(W, H) * s;
    dir.shadow.camera.left = -sh; dir.shadow.camera.right = sh;
    dir.shadow.camera.top = sh; dir.shadow.camera.bottom = -sh;
    dir.shadow.mapSize.set(2048, 2048);
    scene.add(dir);

    // floor + grid + footprint outline
    const deco = new THREE.Group(); scene.add(deco); decoRef.current = deco;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W * s, H * s),
      new THREE.MeshStandardMaterial({ color: 0x14203a, roughness: 0.95, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0; ground.receiveShadow = true;
    groundRef.current = ground; deco.add(ground);
    const grid = new THREE.GridHelper(Math.max(W * s, H * s), Math.min(60, Math.max(8, Math.round(Math.max(W, H) / (fp.gridSize || 1) / 2))), 0x2a3a5c, 0x1b2640);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    grid.position.y = 0.01; deco.add(grid);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(W * s, H * s)),
      new THREE.LineBasicMaterial({ color: 0x64748b }),
    );
    edge.rotation.x = -Math.PI / 2; edge.position.y = 0.02; deco.add(edge);
    // cell floor tints
    (data.cells ?? []).forEach((c) => {
      const members = [...placementsRef.current.entries()].filter(([id]) => c.stationIds.includes(id)).map(([, p]) => p);
      if (!members.length) return;
      const pad = fp.gridSize || 0;
      const x0 = Math.min(...members.map((m) => m.x)) - pad, y0 = Math.min(...members.map((m) => m.y)) - pad;
      const x1 = Math.max(...members.map((m) => m.x + m.w)) + pad, y1 = Math.max(...members.map((m) => m.y + m.h)) + pad;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry((x1 - x0) * s, (y1 - y0) * s),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(c.color), transparent: true, opacity: 0.18 }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(((x0 + x1) / 2 - W / 2) * s, 0.03, ((y0 + y1) / 2 - H / 2) * s);
      deco.add(plane);
    });

    const blocks = new THREE.Group(); scene.add(blocks); blocksRef.current = blocks;
    rebuildBlocks();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.1;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 0, 0); controls.update();
    controlsRef.current = controls;

    // ---- drag a block on the floor ----
    const raycaster = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let dragId: string | null = null;
    let grabDX = 0, grabDZ = 0;

    const setPtr = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const onDown = (e: PointerEvent) => {
      setPtr(e); raycaster.setFromCamera(ptr, camera);
      const hits = raycaster.intersectObjects(blocks.children, false).filter((h) => (h.object as THREE.Mesh).userData?.stationId);
      if (hits.length) {
        const id = (hits[0].object as THREE.Mesh).userData.stationId as string;
        setSelId(id); selIdRef.current = id;
        raycaster.ray.intersectPlane(floorPlane, hit);
        const mesh = meshByIdRef.current.get(id)!;
        grabDX = mesh.position.x - hit.x; grabDZ = mesh.position.z - hit.z;
        dragId = id; controls.enabled = false;
        rebuildBlocks();
        renderer.domElement.setPointerCapture(e.pointerId);
      } else if (e.button === 0) {
        // clicked empty floor → deselect
        setSelId(null); selIdRef.current = null; rebuildBlocks();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragId) return;
      setPtr(e); raycaster.setFromCamera(ptr, camera);
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) return;
      const ctx = ctxRef.current!; const p = placementsRef.current.get(dragId); if (!p) return;
      // scene centre → world centre → top-left, snapped
      const cxScene = hit.x + grabDX, czScene = hit.z + grabDZ;
      const worldCX = cxScene / ctx.s + ctx.W / 2;
      const worldCY = czScene / ctx.s + ctx.H / 2;
      let nx = snapWorld(worldCX - p.w / 2);
      let ny = snapWorld(worldCY - p.h / 2);
      nx = Math.max(0, Math.min(ctx.W - p.w, nx));
      ny = Math.max(0, Math.min(ctx.H - p.h, ny));
      p.x = nx; p.y = ny;
      const mesh = meshByIdRef.current.get(dragId)!;
      const ncx = (nx + p.w / 2 - ctx.W / 2) * ctx.s;
      const ncz = (ny + p.h / 2 - ctx.H / 2) * ctx.s;
      mesh.position.x = ncx; mesh.position.z = ncz;
      const lab = blocks.children.find((o) => (o as THREE.Sprite).userData?.labelFor === dragId);
      if (lab) { lab.position.x = ncx; lab.position.z = ncz; }
    };
    const onUp = (e: PointerEvent) => {
      if (dragId) { dragId = null; controls.enabled = true; setDirty(true); rebuildBlocks(); }
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const onResize = () => {
      const w = mount.clientWidth || width; const hh = mount.clientHeight || height;
      renderer.setSize(w, hh); camera.aspect = w / hh; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize); ro.observe(mount);

    const animate = () => {
      if (disposed) return;
      controls.update(); renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true; cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      sceneRef.current = null; rendererRef.current = null; cameraRef.current = null;
      blocksRef.current = null; controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  // selection colour refresh
  useEffect(() => { if (open && data) rebuildBlocks(); }, [selId, open, data, rebuildBlocks]);

  // ---- actions ----
  const placeStation = (st: St) => {
    const ctx = ctxRef.current; if (!ctx || !data) return;
    const w = Math.round(data.footprint.footprintW * 0.06);
    const h = Math.round(data.footprint.footprintH * 0.08);
    const x = snapWorld(ctx.W / 2 - w / 2);
    const y = snapWorld(ctx.H / 2 - h / 2);
    placementsRef.current.set(st.id, { x, y, w, h, rotation: 0 });
    setPlacedIds((prev) => new Set(prev).add(st.id));
    setSelId(st.id); selIdRef.current = st.id;
    setDirty(true); rebuildBlocks();
  };
  const removeSelected = () => {
    if (!selId) return;
    placementsRef.current.delete(selId);
    setPlacedIds((prev) => { const n = new Set(prev); n.delete(selId); return n; });
    setSelId(null); selIdRef.current = null;
    setDirty(true); rebuildBlocks();
  };
  const rotateSelected = (deg: number) => {
    if (!selId) return;
    const p = placementsRef.current.get(selId); if (!p) return;
    p.rotation = ((p.rotation + deg) % 360 + 360) % 360;
    setDirty(true); rebuildBlocks();
  };
  const viewPreset = (preset: 'top' | 'iso' | 'front') => {
    const cam = cameraRef.current; const ctrl = controlsRef.current; const ctx = ctxRef.current;
    if (!cam || !ctrl || !ctx) return;
    const d = Math.max(ctx.W, ctx.H) * ctx.s;
    if (preset === 'top') cam.position.set(0.01, d * 1.5, 0.01);
    else if (preset === 'front') cam.position.set(0, d * 0.5, d * 1.3);
    else cam.position.set(d * 0.6, d * 0.85, d * 1.0);
    ctrl.target.set(0, 0, 0); ctrl.update();
  };
  const exportPng = () => {
    const r = rendererRef.current, sc = sceneRef.current, cam = cameraRef.current;
    if (!r || !sc || !cam) return;
    r.render(sc, cam);
    const a = document.createElement('a');
    a.href = r.domElement.toDataURL('image/png');
    a.download = `layout3d-${model}-${revision}.png`.replace(/[^\w.\-]+/g, '_');
    a.click();
  };
  const save = async () => {
    if (!model || !data) return;
    setSaving(true);
    try {
      const positions = [...placementsRef.current.entries()].map(([id, p]) => ({ id, ...p }));
      const cleared = [...loadedPlacedRef.current].filter((id) => !placementsRef.current.has(id));
      const r = await apiFetch(`${API_BASE}/line-engineering/layout`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, revision, footprint: data.footprint, positions, cleared,
          connectors: data.connectors ?? [], assets: data.assets ?? [],
          annotations: data.annotations ?? [], cells: data.cells ?? [],
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d?.message || 'No se pudo guardar.', '3D'); return; }
      toast.success('Layout 3D guardado.', '3D');
      loadedPlacedRef.current = new Set(placementsRef.current.keys());
      setDirty(false);
      onSaved?.();
    } catch { toast.error('Error de red.', '3D'); } finally { setSaving(false); }
  };

  if (!open || typeof document === 'undefined') return null;

  const tray = (data?.stations ?? []).filter((s) => !placedIds.has(s.id));
  const sel = selId ? (data?.stations ?? []).find((s) => s.id === selId) : null;
  const placedCount = placedIds.size;

  // Portal to <body> so the full-screen overlay escapes the editor's glass
  // container (backdrop-filter would otherwise be the containing block for our
  // position:fixed and trap it inside the box instead of the viewport).
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-950 text-white">
      {/* top bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 shrink-0 bg-gray-900/80 backdrop-blur">
        <BoxIcon className="w-4 h-4" style={{ color: '#f43f5e' }} />
        <span className="font-semibold text-sm">CAD 3D · {model} · {revision}</span>
        <span className="text-[11px] text-gray-400 ml-1">{placedCount} colocadas</span>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn active={snap} onClick={() => setSnap((v) => !v)} title="Snap a grilla"><Grid3x3 className="w-4 h-4" /></T3Btn>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn onClick={() => viewPreset('iso')} title="Vista isométrica"><Maximize2 className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={() => viewPreset('top')} title="Vista superior (planta)"><Eye className="w-4 h-4" /></T3Btn>
        <T3Btn onClick={() => viewPreset('front')} title="Vista frontal"><Layers className="w-4 h-4" /></T3Btn>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn onClick={exportPng} title="Exportar PNG"><Download className="w-4 h-4" /></T3Btn>
        <div className="flex-1" />
        <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium text-white disabled:opacity-50" style={{ background: '#f43f5e' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
        </button>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 ml-1"><X className="w-5 h-5" /></button>
      </div>

      {error ? (
        <div className="flex-1 grid place-items-center text-amber-400 text-sm">{error}</div>
      ) : !data ? (
        <div className="flex-1 grid place-items-center text-gray-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* tray */}
          <div className="w-56 shrink-0 border-r border-white/10 bg-gray-900/60 p-3 overflow-y-auto">
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Por colocar ({tray.length})</div>
            {tray.length === 0 ? (
              <p className="text-[12px] text-gray-500">Todas las estaciones están en el plano.</p>
            ) : tray.map((st) => (
              <button key={st.id} onClick={() => placeStation(st)} className="w-full text-left mb-1.5 px-2.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] transition-colors">
                <div className="text-sm font-medium">{st.station}</div>
                <div className="text-[11px] text-gray-400">{st.line} · clic para colocar</div>
              </button>
            ))}
            {sel && (
              <div className="mt-4 pt-3 border-t border-white/10">
                <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Selección</div>
                <div className="text-sm font-medium mb-2" style={{ color: '#22d3ee' }}>{sel.station}</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => rotateSelected(15)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"><RotateCw className="w-3.5 h-3.5" /> +15°</button>
                  <button onClick={() => rotateSelected(-15)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"><RotateCw className="w-3.5 h-3.5 -scale-x-100" /> −15°</button>
                  <button onClick={removeSelected} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[12px]"><Trash2 className="w-3.5 h-3.5" /> Quitar</button>
                </div>
              </div>
            )}
          </div>
          {/* 3D viewport */}
          <div className="relative flex-1 min-w-0">
            <div ref={mountRef} className="absolute inset-0" />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-gray-900/80 backdrop-blur border border-white/10 text-[11px] text-gray-300 inline-flex items-center gap-2 pointer-events-none">
              <Move3d className="w-3.5 h-3.5" /> Arrastra un bloque para moverlo · arrastra el fondo para orbitar · rueda = zoom
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function T3Btn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className={`p-1.5 rounded-lg transition-colors ${active ? 'text-white' : 'text-gray-400 hover:bg-white/10'}`} style={active ? { background: '#0e7490' } : undefined}>
      {children}
    </button>
  );
}
