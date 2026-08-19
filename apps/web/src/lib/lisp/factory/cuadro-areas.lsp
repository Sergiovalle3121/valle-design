;;; ---------------------------------------------------------------------------
;;; CUADRO-AREAS.LSP — el cuadro de áreas del proyecto, sacado del modelo.
;;;
;;; Dibuja la tabla que se entrega con cada juego de planos: un renglón por
;;; local, con su área a ejes y su área útil. Los números NO se teclean ni se
;;; miden con DIST: salen de `(vd-areas)`, que recorre los ejes de los muros y
;;; se queda con las caras cerradas. Mueve un muro, vuelve a lanzar el comando,
;;; y la tabla dice lo que dice el plano.
;;;
;;; UNIDADES. `vd:factor-area` convierte el área del dibujo a la unidad de la
;;; tabla. Viene puesto para un dibujo en MILÍMETROS (1.000.000 mm² = 1 m²). Si
;;; tu despacho dibuja en metros, cambia esta única línea a 1.0.
;;; ---------------------------------------------------------------------------

(setq vd:factor-area 0.000001)
(setq vd:capa-cuadro "TEXTOS")
(setq vd:alto-renglon 250.0)
(setq vd:alto-texto 180.0)
(setq vd:columna-1 0.0)
(setq vd:columna-2 3000.0)
(setq vd:columna-3 5200.0)

;; Un renglón son tres textos alineados. Se saca a su propia función porque el
;; encabezado, los locales y el total son EL MISMO renglón con otro contenido:
;; escribirlo tres veces habría garantizado que uno se desalinease.
(defun vd:renglon (x y a b c)
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-cuadro)
                 (list 10 (+ x vd:columna-1) y 0.0)
                 (cons 1 a) (cons 40 vd:alto-texto)))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-cuadro)
                 (list 10 (+ x vd:columna-2) y 0.0)
                 (cons 1 b) (cons 40 vd:alto-texto)))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-cuadro)
                 (list 10 (+ x vd:columna-3) y 0.0)
                 (cons 1 c) (cons 40 vd:alto-texto)))
  y)

;; El área útil puede no estar definida —un local con lados paralelos
;; consecutivos no tiene esquina interior— y entonces `vd-areas` devuelve nil.
;; Se escribe un guion, que se VE, en vez del área a ejes disfrazada de útil.
(defun vd:medida (valor)
  (if valor (rtos (* valor vd:factor-area) 2 2) "—"))

(defun c:cuadroareas ( / origen locales x y total)
  (setq origen (getpoint "\nEsquina superior izquierda del cuadro de areas: "))
  (if (null origen)
    (progn (princ "\nCancelado: el cuadro necesita un punto de insercion.") nil)
    (progn
      (setq locales (vd-areas))
      (if (null locales)
        (progn
          (princ "\nNingun local cerrado: revisa que los muros se toquen en sus extremos.")
          nil)
        (progn
          (setq x (car origen))
          (setq y (cadr origen))
          (vd:renglon x y "LOCAL" "AREA EJES" "AREA UTIL")
          (setq total 0.0)
          (foreach local locales
            (setq y (- y vd:alto-renglon))
            (setq total (+ total (nth 1 local)))
            (vd:renglon x y (nth 0 local) (vd:medida (nth 1 local)) (vd:medida (nth 2 local))))
          (setq y (- y vd:alto-renglon))
          (vd:renglon x y "TOTAL" (vd:medida total) "")
          (princ (strcat "\n" (itoa (length locales)) " locales, "
                         (rtos (* total vd:factor-area) 2 2) " de area a ejes."))
          total)))))
