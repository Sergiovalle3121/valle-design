;;; ---------------------------------------------------------------------------
;;; TABLA-MEDICION.LSP — medición por capas y volcado de tabla.
;;;
;;; Recorre una selección, suma la longitud de cada LINE y de cada LWPOLYLINE
;;; agrupando por capa, y escribe la tabla. Es el esqueleto de todo exportador a
;;; Excel que existe: la parte que cuesta no es el fichero, es medir bien.
;;;
;;; Ejercita a propósito:
;;;   · el recorrido clásico ssget → sslength → ssname → entget → assoc
;;;   · acumulación en una lista de asociación con `assoc` y `subst`
;;;   · la lectura POSICIONAL de los vértices de una polilínea, que `assoc` no
;;;     puede hacer porque sólo devuelve el primer código 10
;;;   · `rtos` para escribir la medida como la escribiría el plano
;;; ---------------------------------------------------------------------------

;; Longitud de una polilínea leyendo sus vértices EN ORDEN. `(assoc 10 ed)` daría
;; siempre el primero; hay que recorrer la lista entera quedándose con los pares
;; cuyo car es 10.
(defun vd:puntos-10 (ed / puntos)
  (setq puntos nil)
  (foreach par ed
    (if (and (listp par) (= (car par) 10) (listp (cdr par)))
      (setq puntos (cons (cdr par) puntos))))
  (reverse puntos))

(defun vd:longitud-polilinea (ed / puntos total previo)
  (setq puntos (vd:puntos-10 ed) total 0.0 previo nil)
  (foreach punto puntos
    (if previo (setq total (+ total (distance previo punto))))
    (setq previo punto))
  (if (= 1 (cdr (assoc 70 ed)))
    (+ total (distance (last puntos) (car puntos)))
    total))

(defun vd:longitud (ed / tipo)
  (setq tipo (cdr (assoc 0 ed)))
  (cond
    ((= tipo "LINE") (distance (cdr (assoc 10 ed)) (cdr (assoc 11 ed))))
    ((= tipo "LWPOLYLINE") (vd:longitud-polilinea ed))
    ((= tipo "CIRCLE") (* 2.0 pi (cdr (assoc 40 ed))))
    (T 0.0)))

;; Acumula (capa . longitud) sin duplicar la capa. `subst` sustituye el par
;; entero, que es el gesto idiomático: no se muta la celda, se reconstruye.
(defun vd:acumula (tabla capa longitud / actual)
  (setq actual (assoc capa tabla))
  (if actual
    (subst (cons capa (+ (cdr actual) longitud)) actual tabla)
    (cons (cons capa longitud) tabla)))

(defun vd:medir (ss / i tabla ed)
  (setq i 0 tabla nil)
  (while (< i (sslength ss))
    (setq ed (entget (ssname ss i)))
    (setq tabla (vd:acumula tabla (cdr (assoc 8 ed)) (vd:longitud ed)))
    (setq i (1+ i)))
  ;; Ordenada por capa: una tabla que sale en orden distinto en cada corrida no
  ;; se puede comparar con la de ayer, que es para lo que se hace una medición.
  (vl-sort tabla '(lambda (a b) (< (car a) (car b)))))

(defun vd:volcar (tabla / total)
  (setq total 0.0)
  (princ "CAPA;LONGITUD\n")
  (foreach fila tabla
    (princ (strcat (car fila) ";" (rtos (cdr fila) 2 2) "\n"))
    (setq total (+ total (cdr fila))))
  (princ (strcat "TOTAL;" (rtos total 2 2) "\n"))
  total)

(defun c:medir ( / ss)
  (setq ss (ssget))
  (if ss (vd:volcar (vd:medir ss)) (progn (princ "\nNada designado.") nil)))
