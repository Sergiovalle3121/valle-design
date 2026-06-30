'use client';

import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  minimapScale,
  targetToWorld,
  worldToTarget,
  clampToFootprint,
  boxToMini,
  MINI_MAX_W,
  MINI_MAX_H,
  type MiniBox,
} from '@/lib/cad/minimap';

/**
 * Top-down overview minimap for the 3D CAD editor (EPIC 0). On a 200×150 m nave
 * the camera can wander far from the action; this renders the footprint, the
 * placed stations and equipment, and the current look-at target, and lets the
 * engineer click anywhere to recenter the view without losing zoom.
 *
 * Like the 2D `Minimap`, it reads the editor's refs inside a throttled rAF poll
 * and snapshots a tiny view-model into state — render never touches refs — so
 * its frequent refreshes never re-render the heavy editor.
 */

interface Placement { x: number; y: number; w: number; h: number; rotation: number }
interface Asset { id: string; kind: string; x: number; y: number; w: number; h: number; rotation: number; label?: string }

interface MiniSnap {
  scale: number;
  contentW: number;
  contentH: number;
  stations: MiniBox[];
  assets: MiniBox[];
  target: { x: number; y: number };
  cam: { x: number; y: number };
}

export default function PlantMinimap({
  ctxRef,
  placementsRef,
  assetsRef,
  cameraRef,
  controlsRef,
  accent = '#f43f5e',
}: {
  ctxRef: React.MutableRefObject<{ s: number; W: number; H: number } | null>;
  placementsRef: React.MutableRefObject<Map<string, Placement>>;
  assetsRef: React.MutableRefObject<Map<string, Asset>>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  accent?: string;
}) {
  const [snap, setSnap] = useState<MiniSnap | null>(null);

  useEffect(() => {
    let raf = 0;
    let lastT = 0;
    let lastKey = '';
    const tick = (t: number) => {
      if (t - lastT > 90) {
        lastT = t;
        const ctx = ctxRef.current;
        const ctrl = controlsRef.current;
        const cam = cameraRef.current;
        if (ctx && ctx.W && ctx.H) {
          const scale = minimapScale(ctx.W, ctx.H);
          const placements = [...placementsRef.current.values()];
          const assets = [...assetsRef.current.values()];
          const tgt = ctrl ? targetToWorld(ctrl.target.x, ctrl.target.z, ctx.s, ctx.W, ctx.H) : { x: ctx.W / 2, y: ctx.H / 2 };
          const camW = cam ? targetToWorld(cam.position.x, cam.position.z, ctx.s, ctx.W, ctx.H) : tgt;
          const sig = `${scale.toFixed(5)}|${tgt.x.toFixed(0)},${tgt.y.toFixed(0)}|${camW.x.toFixed(0)},${camW.y.toFixed(0)}|${placements
            .map((p) => `${p.x},${p.y},${p.w},${p.h}`)
            .join(';')}|${assets.map((a) => `${a.x},${a.y},${a.w},${a.h}`).join(';')}`;
          if (sig !== lastKey) {
            lastKey = sig;
            setSnap({
              scale,
              contentW: ctx.W * scale,
              contentH: ctx.H * scale,
              stations: placements.map((p) => boxToMini(p, scale)),
              assets: assets.map((a) => boxToMini(a, scale)),
              target: { x: tgt.x * scale, y: tgt.y * scale },
              cam: { x: camW.x * scale, y: camW.y * scale },
            });
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ctxRef, placementsRef, assetsRef, cameraRef, controlsRef]);

  const navigate = (e: React.MouseEvent<SVGSVGElement>) => {
    const ctx = ctxRef.current;
    const ctrl = controlsRef.current;
    const cam = cameraRef.current;
    if (!ctx || !ctrl || !snap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const wpt = clampToFootprint((e.clientX - rect.left) / snap.scale, (e.clientY - rect.top) / snap.scale, ctx.W, ctx.H);
    const nt = worldToTarget(wpt.x, wpt.y, ctx.s, ctx.W, ctx.H);
    // Move the camera by the same delta as the target so framing/zoom is kept.
    if (cam) {
      cam.position.x += nt.x - ctrl.target.x;
      cam.position.z += nt.z - ctrl.target.z;
    }
    ctrl.target.set(nt.x, ctrl.target.y, nt.z);
    ctrl.update();
  };

  return (
    <div
      className="absolute bottom-3 right-3 z-20 rounded-lg border border-white/15 bg-black/55 backdrop-blur shadow-lg"
      style={{ width: MINI_MAX_W + 8, height: MINI_MAX_H + 8, padding: 4 }}
      title="Minimapa — clic para centrar la vista"
    >
      <svg
        width={MINI_MAX_W}
        height={MINI_MAX_H}
        onMouseDown={navigate}
        style={{ cursor: 'pointer', display: 'block', overflow: 'hidden' }}
      >
        {snap && (
          <>
            <rect x={0} y={0} width={snap.contentW} height={snap.contentH} fill="rgba(148,163,184,0.10)" stroke="rgba(148,163,184,0.45)" />
            {snap.assets.map((b, i) => (
              <rect key={`a${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="rgba(100,116,139,0.55)" />
            ))}
            {snap.stations.map((b, i) => (
              <rect key={`s${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={accent} fillOpacity={0.7} />
            ))}
            {/* camera ground position → look-at target, to show orientation */}
            <line x1={snap.cam.x} y1={snap.cam.y} x2={snap.target.x} y2={snap.target.y} stroke="#38bdf8" strokeWidth={1} strokeOpacity={0.7} />
            <circle cx={snap.target.x} cy={snap.target.y} r={3.5} fill="none" stroke="#38bdf8" strokeWidth={1.4} />
            <circle cx={snap.target.x} cy={snap.target.y} r={1} fill="#38bdf8" />
          </>
        )}
      </svg>
    </div>
  );
}
