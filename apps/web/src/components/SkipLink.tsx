/**
 * ENLACE DE SALTO AL CONTENIDO.
 *
 * `<main id="contenido">` existía en la portada y en `PublicPageShell` desde
 * hace tiempo, y NINGÚN enlace apuntaba a `#contenido`: era un ancla huérfana.
 * Un ancla sin enlace no ayuda a nadie — quien navega con teclado sigue
 * recorriendo la barra entera, enlace por enlace, en cada página que abre.
 *
 * CÓMO SE OCULTA IMPORTA. `display: none` o `visibility: hidden` lo sacarían
 * del orden de tabulación y entonces no existiría para quien lo necesita. Se
 * saca de la pantalla con posición absoluta y `sr-only`, y `focus:not-sr-only`
 * lo devuelve al recibir el foco: invisible con el ratón, primera parada con el
 * teclado.
 *
 * Va ANTES de la navegación en el árbol: si fuera después, saltarla exigiría
 * primero pasar por ella.
 */
export function SkipLink({ target = "#contenido" }: { target?: string }) {
  return (
    <a
      href={target}
      data-testid="skip-link"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-control focus:border focus:border-border focus:bg-card focus:px-4 focus:font-semibold focus:text-foreground focus:shadow-floating focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
    >
      Saltar al contenido
    </a>
  );
}
