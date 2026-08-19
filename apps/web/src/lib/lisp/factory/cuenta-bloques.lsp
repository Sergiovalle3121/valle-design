;;; ---------------------------------------------------------------------------
;;; CUENTA-BLOQUES.LSP — cuántas veces está insertado cada bloque.
;;;
;;; El recuento que se hace antes de cada entrega y antes de cada pedido: cuántos
;;; muebles de baño, cuántas luminarias, cuántos registros. Se designa una zona
;;; —o todo el plano con Enter— y sale la lista ordenada por nombre de bloque,
;;; con su total.
;;;
;;; No usa ninguna consulta del producto a propósito: recorre la selección con
;;; `ssget`, `ssname` y `entget` y agrupa con `assoc` y `subst`. Es el patrón con
;;; el que están escritas las rutinas que un despacho trae de AutoCAD, y sirve
;;; de plantilla para adaptarlas: si esto corre, las suyas corren.
;;; ---------------------------------------------------------------------------

(setq vd:capa-recuento "TEXTOS")
(setq vd:cb-renglon 250.0)
(setq vd:cb-texto 180.0)
(setq vd:cb-columna 3000.0)

;; Acumula (nombre . veces) sin duplicar el nombre. `subst` sustituye el par
;; entero: no se muta la celda, se reconstruye. Es el gesto idiomático.
(defun vd:cb-suma (tabla nombre / actual)
  (setq actual (assoc nombre tabla))
  (if actual
    (subst (cons nombre (1+ (cdr actual))) actual tabla)
    (cons (cons nombre 1) tabla)))

(defun vd:cb-recorre (ss / i tabla ed nombre)
  (setq i 0)
  (setq tabla nil)
  (while (< i (sslength ss))
    (setq ed (entget (ssname ss i)))
    (if (= (cdr (assoc 0 ed)) "INSERT")
      (progn
        (setq nombre (cdr (assoc 2 ed)))
        (if nombre (setq tabla (vd:cb-suma tabla nombre)))))
    (setq i (1+ i)))
  ;; Ordenada por nombre: un recuento que sale en distinto orden en cada corrida
  ;; no se puede comparar con el de ayer, que es para lo que se hace.
  (vl-sort tabla '(lambda (a b) (< (car a) (car b)))))

(defun vd:cb-escribe (tabla origen / x y total)
  (setq x (car origen))
  (setq y (cadr origen))
  (setq total 0)
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                 (list 10 x y 0.0) (cons 1 "BLOQUE") (cons 40 vd:cb-texto)))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                 (list 10 (+ x vd:cb-columna) y 0.0) (cons 1 "CANT") (cons 40 vd:cb-texto)))
  (foreach fila tabla
    (setq y (- y vd:cb-renglon))
    (setq total (+ total (cdr fila)))
    (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                   (list 10 x y 0.0) (cons 1 (car fila)) (cons 40 vd:cb-texto)))
    (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                   (list 10 (+ x vd:cb-columna) y 0.0)
                   (cons 1 (itoa (cdr fila))) (cons 40 vd:cb-texto))))
  (setq y (- y vd:cb-renglon))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                 (list 10 x y 0.0) (cons 1 "TOTAL") (cons 40 vd:cb-texto)))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                 (list 10 (+ x vd:cb-columna) y 0.0)
                 (cons 1 (itoa total)) (cons 40 vd:cb-texto)))
  total)

(defun c:cuentabloques ( / ss tabla origen)
  (setq ss (ssget))
  (if (null ss)
    (progn (princ "\nNada designado.") nil)
    (progn
      (setq tabla (vd:cb-recorre ss))
      (if (null tabla)
        (progn (princ "\nEn lo designado no hay ninguna insercion de bloque.") nil)
        (progn
          (setq origen (getpoint "\nEsquina superior izquierda del recuento: "))
          (if (null origen)
            (progn (princ "\nCancelado: el recuento necesita un punto de insercion.") nil)
            (vd:cb-escribe tabla origen)))))))
