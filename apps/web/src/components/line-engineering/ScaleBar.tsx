'use client';

import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { metersToUnit, niceScaleBarMeters, formatMeters, type WorldUnit } from '@/lib/cad/world-scale';

/**
 * Dynamic scale bar for the 3D CAD editor (EPIC 0 — "rulers with real units").
 *
 * A precise edge ruler is fragile under a perspective camera, so instead we
 * derive the real-world scale by projecting a known ground baseline (10 m at the
 * look-at target) to screen pixels, then draw a tidy 1/2/5 bar in metres. Reads
 * the editor refs in a throttled rAF poll and snapshots only the bar width +
 * label into state, so it never re-renders the heavy editor.
 */

const TARGET_BAR_PX = 96; // preferred on-screen bar length before nice-rounding

export default function ScaleBar({
  ctxRef,
  cameraRef,
  controlsRef,
  mountRef,
  unit,
}: {
  ctxRef: React.MutableRefObject<{ s: number; W: number; H: number } | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  mountRef: React.MutableRefObject<HTMLDivElement | null>;
  unit: WorldUnit;
}) {
  const [bar, setBar] = useState<{ px: number; label: string } | null>(null);

  useEffect(() => {
    let raf = 0;
    let lastT = 0;
    let lastKey = '';
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const tick = (t: number) => {
      if (t - lastT > 110) {
        lastT = t;
        const ctx = ctxRef.current;
        const cam = cameraRef.current;
        const ctrl = controlsRef.current;
        const mount = mountRef.current;
        if (ctx && cam && mount && ctx.s) {
          const width = mount.clientWidth || 1;
          const height = mount.clientHeight || 1;
          // scene length of 10 m: world-units-per-metre × scene-per-world-unit
          const baseMeters = 10;
          const baseScene = metersToUnit(baseMeters, unit) * ctx.s;
          const tx = ctrl ? ctrl.target.x : 0;
          const tz = ctrl ? ctrl.target.z : 0;
          a.set(tx, 0, tz).project(cam);
          b.set(tx + baseScene, 0, tz).project(cam);
          const dxPx = ((b.x - a.x) / 2) * width;
          const dyPx = ((b.y - a.y) / 2) * height;
          const pxPerMeter = Math.hypot(dxPx, dyPx) / baseMeters;
          if (Number.isFinite(pxPerMeter) && pxPerMeter > 0.001) {
            const meters = niceScaleBarMeters(TARGET_BAR_PX / pxPerMeter);
            const px = Math.round(meters * pxPerMeter);
            const key = `${px}|${meters}`;
            if (px > 6 && px < width && key !== lastKey) {
              lastKey = key;
              setBar({ px, label: formatMeters(meters) });
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ctxRef, cameraRef, controlsRef, mountRef, unit]);

  if (!bar) return null;
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none" title="Escala aproximada">
      <div className="flex items-end gap-2">
        <div className="relative" style={{ width: bar.px, height: 8 }}>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/80" />
          <div className="absolute bottom-0 left-0 w-[2px] h-2 bg-white/80" />
          <div className="absolute bottom-0 right-0 w-[2px] h-2 bg-white/80" />
          <div className="absolute bottom-0 left-1/2 w-[1px] h-1.5 bg-white/60" />
        </div>
        <span className="text-[11px] font-medium text-white/90 leading-none mb-0.5 tabular-nums">{bar.label}</span>
      </div>
    </div>
  );
}
