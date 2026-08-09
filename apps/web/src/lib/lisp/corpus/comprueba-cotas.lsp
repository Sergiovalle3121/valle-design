;;; ---------------------------------------------------------------------------
;;; COMPRUEBA-COTAS.LSP — comprobación de norma: ninguna cota desasociada.
;;;
;;; Una cota que ha perdido su asociación deja de seguir a la geometría: el
;;; dibujo cambia y el número se queda como estaba. Es el defecto más caro de un
;;; plano de obra porque no se ve, y por eso todo estudio serio tiene una rutina
;;; que lo comprueba antes de emitir.
;;;
;;; La asociatividad se lee del par 290 (asociativa) y 291 (rota). En AutoCAD
;;; esa información vive en un diccionario de extensión que `entget` no
;;; devuelve; aquí el modelo canónico la tiene como campo propio y se expone,
;;; porque ocultarla haría imposible justamente esta comprobación. Va dicho en
;;; el traductor, junto al código que la emite.
;;;
;;; Ejercita a propósito:
;;;   · recorrido del dibujo entero con `entnext`, sin `ssget`
;;;   · construcción de un informe como lista de listas
;;;   · `vl-catch-all-apply`, para que una entidad rara no aborte la revisión
;;; ---------------------------------------------------------------------------

(defun vd:cota-p (ed) (= "DIMENSION" (cdr (assoc 0 ed))))

(defun vd:estado (ed)
  (cond
    ((= 1 (cdr (assoc 291 ed))) "ROTA")
    ((= 0 (cdr (assoc 290 ed))) "SIN ASOCIAR")
    (T "OK")))

;; El `vl-catch-all-apply` no es decorativo: un dibujo importado puede traer
;; entidades que este puente no sabe leer, y una revisión que aborta a la
;; primera rareza no revisa nada. Se anota el fallo y se sigue.
(defun vd:revisa-una (e / ed)
  (setq ed (vl-catch-all-apply 'entget (list e)))
  (cond
    ((vl-catch-all-error-p ed) (list e "ILEGIBLE"))
    ((null ed) nil)
    ((vd:cota-p ed) (list e (vd:estado ed)))
    (T nil)))

(defun vd:revisa ( / e fila informe)
  (setq e (entnext) informe nil)
  (while e
    (setq fila (vd:revisa-una e))
    (if fila (setq informe (cons fila informe)))
    (setq e (entnext e)))
  (reverse informe))

(defun vd:problemas (informe)
  (vl-remove-if '(lambda (fila) (= "OK" (cadr fila))) informe))

(defun c:cotas ( / informe malas)
  (setq informe (vd:revisa))
  (setq malas (vd:problemas informe))
  (princ (strcat "\nCotas revisadas: " (itoa (length informe))))
  (princ (strcat "\nCon problema: " (itoa (length malas))))
  (foreach fila malas (princ (strcat "\n  " (cadr fila))))
  malas)
