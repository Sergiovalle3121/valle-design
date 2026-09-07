"use client";

/**
 * LA INSIGNIA 3D DEL HERO.
 *
 * El hero vendía sólo el dibujo 2D — el plano dibujándose en `<PlanViewport>`,
 * que sigue siendo la prueba más fuerte de la página y no se toca. Pero desde
 * ADR-0016 la identidad del producto es «CAD 2D general y universal, y
 * modelador 3D de modelado directo» (`IDENTITY.md`), y el hero seguía sin
 * decirlo. Esta insignia cierra ESE hueco: un sólido facetado girando muy
 * despacio, junto al texto que nombra la capacidad.
 *
 * Deliberadamente NO usa `@react-three/fiber` — no es una dependencia del
 * proyecto y el resto del código (`lib/cad/*-three.ts`) habla Three.js crudo,
 * así que esto sigue la misma convención en vez de importar un wrapper nuevo.
 *
 * Carga perezosa a propósito: `import("three")` vive dentro de un efecto, así
 * que nunca se ejecuta en el servidor y nunca bloquea el primer render — el
 * hero pinta su H1 y su CTA antes de que el bundle de Three.js siquiera
 * empiece a descargarse.
 *
 * El sólido es UNA vitrina, no un ejercicio del kernel real: aquí no se
 * importa `@/lib/brep` (eso arrastraría el motor de booleanas entero a una
 * página pública). Es una geometría facetada construida a mano —a propósito,
 * porque el kernel real ES facetado (ADR-0016) y una insignia con caras
 * suaves mentiría sobre eso.
 */
import { useEffect, useRef, useState } from "react";

export function Brep3DBadge({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === "undefined") return;

    let disposed = false;
    let frame = 0;
    let cleanup: (() => void) | undefined;

    import("three")
      .then((THREE) => {
        if (disposed || !host) return;

        const size = host.clientWidth || 96;
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(2.1, 1.7, 2.6);
        camera.lookAt(0, 0.1, 0);

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(size, size);
        host.appendChild(renderer.domElement);

        // Un bloque con una cara achaflanada: legible en pequeño como sólido
        // FACETADO —el kernel real nunca produce una curva suave— y no
        // requiere una operación booleana de verdad para leerse como tal.
        const shape = new THREE.Shape();
        shape.moveTo(-0.9, -0.6);
        shape.lineTo(0.9, -0.6);
        shape.lineTo(0.9, 0.15);
        shape.lineTo(0.35, 0.75);
        shape.lineTo(-0.9, 0.75);
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: 1.1,
          bevelEnabled: false,
        });
        geometry.center();

        const material = new THREE.MeshStandardMaterial({
          color: 0x6b4def,
          flatShading: true,
          roughness: 0.45,
          metalness: 0.08,
        });
        const solid = new THREE.Mesh(geometry, material);
        scene.add(solid);

        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0x17130f, transparent: true, opacity: 0.35 }),
        );
        solid.add(edges);

        scene.add(new THREE.AmbientLight(0xffffff, 0.65));
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(3, 4, 2);
        scene.add(key);

        renderer.render(scene, camera);

        let visible = !document.hidden;
        const onVisibility = () => {
          visible = !document.hidden;
        };
        document.addEventListener("visibilitychange", onVisibility);

        const observer =
          typeof IntersectionObserver === "undefined"
            ? undefined
            : new IntersectionObserver(([entry]) => {
                visible = entry.isIntersecting && !document.hidden;
              });
        observer?.observe(host);

        const animate = () => {
          if (visible) {
            solid.rotation.y += 0.006;
            solid.rotation.x = 0.32 + Math.sin(solid.rotation.y * 0.6) * 0.05;
            renderer.render(scene, camera);
          }
          frame = window.requestAnimationFrame(animate);
        };
        if (!reduceMotion) {
          solid.rotation.x = 0.32;
          frame = window.requestAnimationFrame(animate);
        } else {
          // La regla de la casa: menos movimiento no es "sin contenido",
          // es el MISMO contenido en su fotograma final, ya colocado.
          solid.rotation.set(0.32, 0.6, 0);
          renderer.render(scene, camera);
        }

        cleanup = () => {
          window.cancelAnimationFrame(frame);
          document.removeEventListener("visibilitychange", onVisibility);
          observer?.disconnect();
          geometry.dispose();
          material.dispose();
          edges.geometry.dispose();
          (edges.material as InstanceType<typeof THREE.LineBasicMaterial>).dispose();
          renderer.dispose();
          host.removeChild(renderer.domElement);
        };
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  if (failed) return null;

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={className}
      style={{ aspectRatio: "1 / 1" }}
    />
  );
}
