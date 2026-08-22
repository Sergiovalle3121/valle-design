/**
 * EL FONDO DEL HERO.
 *
 * Cablea cuatro utilidades que llevaban escritas en `globals.css` desde el
 * primer día con CERO usos: `.hero-orb` (×3), `.hero-conic`, `.aurora-bg` y la
 * retícula de plano `.mission-grid`. No se inventa nada nuevo — el sistema ya
 * tenía resuelto el desenfoque, la deriva y las opacidades por tema; lo único
 * que faltaba era alguien que las llamara.
 *
 * PROFUNDIDAD, NO DECORACIÓN. Las tres capas hacen tres trabajos distintos:
 *
 *   · La retícula da la textura de papel de plano. Es lo que dice «esto es una
 *     herramienta de dibujo» antes de leer una palabra.
 *   · Los orbes y la malla cónica dan color y movimiento lentísimo, para que la
 *     primera impresión se sienta viva en vez de impresa.
 *   · La máscara de desvanecido corta la retícula antes del final de la sección;
 *     sin ella, una retícula que muere a filo de borde parece un fallo de
 *     recorte.
 *
 * TODO decorativo, TODO `aria-hidden`, TODO detrás (-z-10) y nada captura el
 * puntero. Un fondo que intercepta un clic es peor que no tener fondo.
 * `prefers-reduced-motion` detiene las animaciones desde la regla global.
 */
export function HeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem] overflow-hidden"
    >
      <div className="aurora-bg absolute inset-0" />

      {/* Retícula de plano, desvanecida hacia abajo. */}
      <div
        className="mission-grid absolute inset-0 opacity-70 dark:opacity-50"
        style={{
          maskImage:
            "linear-gradient(to bottom, black 0%, black 45%, transparent 92%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 45%, transparent 92%)",
        }}
      />

      <div className="absolute inset-0 overflow-hidden">
        <div className="hero-conic absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2" />
        {/* Los orbes van al color PLENO: `.hero-orb` ya baja la opacidad a
            0,65 en claro y 0,5 en oscuro y encima aplica 72-80 px de
            desenfoque. Con el color además diluido, el resultado medido era un
            fondo plano — tres capas de atenuación multiplicándose. */}
        <div className="hero-orb hero-orb-1 left-[4%] top-[-8rem] h-[26rem] w-[26rem] bg-primary" />
        <div className="hero-orb hero-orb-2 right-[2%] top-[1rem] h-[30rem] w-[30rem] bg-brand-strong" />
        <div className="hero-orb hero-orb-3 left-[36%] top-[16rem] h-80 w-80 bg-primary" />
      </div>
    </div>
  );
}
