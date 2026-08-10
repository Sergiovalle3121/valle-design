;;; ---------------------------------------------------------------------------
;;; CAJETIN-BLOQUE.LSP — cajetín parametrizado INSERTADO COMO BLOQUE.
;;;
;;; `cajetin.lsp` dibuja el cajetín con geometría suelta, que es como se hacía
;;; antes. Un estudio moderno tiene el cajetín como BLOQUE en su biblioteca y lo
;;; que la rutina hace es insertarlo con la escala del formato y rellenar los
;;; campos. Esta rutina es esa: la que de verdad corre cien veces al día.
;;;
;;; Ejercita a propósito:
;;;   · `entmake` de INSERT con nombre de bloque, escala y rotación
;;;   · una tabla de formatos como lista de asociación, con `assoc`
;;;   · `getkword` armado con `initget`, que es como se pregunta un formato
;;;   · `getpoint` para el punto de inserción, y el respeto por el Esc
;;;
;;; LÍMITE DECLARADO, y está aquí porque el usuario lo va a notar: una rutina
;;; puede INSERTAR un bloque que ya exista en el dibujo, pero no puede DEFINIR
;;; uno nuevo. El vocabulario canónico de mutación (`lib/cad/entity-commands.ts`)
;;; no tiene una orden de definición de bloque, y el subsistema LISP no se salta
;;; ese vocabulario ni siquiera para esto. Definir el bloque es un `BLOCK` desde
;;; el editor, o la biblioteca de bloques de la organización.
;;; ---------------------------------------------------------------------------

;; Formato → (ancho alto escala-del-cajetín). Los milímetros son los de la ISO
;; 5457, que es la norma que cita el pliego de cualquier obra pública.
(setq vd:formatos
  (list (list "A4" 210.0 297.0 1.0)
        (list "A3" 420.0 297.0 1.0)
        (list "A2" 594.0 420.0 1.414)
        (list "A1" 841.0 594.0 2.0)
        (list "A0" 1189.0 841.0 2.828)))

(defun vd:formato (nombre) (assoc nombre vd:formatos))

;; Inserción del bloque. Se aísla porque la usan la interactiva y las pruebas:
;; una rutina que sólo se puede ejercitar contestando preguntas no se prueba.
(defun vd:inserta-cajetin (bloque punto escala rotacion capa)
  (entmake (list (cons 0 "INSERT")
                 (cons 2 bloque)
                 (cons 8 capa)
                 (cons 10 punto)
                 (cons 41 escala)
                 (cons 42 escala)
                 (cons 43 1.0)
                 (cons 50 rotacion)))
  (entlast))

;; Los campos van FUERA del bloque, como texto propio del plano: dentro serían
;; atributos, y un atributo que no se puede editar desde la interfaz es peor que
;; un texto que sí.
(defun vd:campo (punto etiqueta valor altura capa)
  (entmake (list (cons 0 "MTEXT")
                 (cons 8 capa)
                 (cons 10 punto)
                 (cons 1 (strcat etiqueta ": " valor))
                 (cons 40 altura))))

;; La parametrizada. Devuelve el nombre de entidad del bloque insertado.
(defun vd:cajetin-bloque (bloque formato origen proyecto autor capa / f escala x y alt ins)
  (setq f (vd:formato formato))
  (if (null f) (progn (princ "formato desconocido") (exit)))
  (setq escala (nth 3 f))
  (setq x (car origen))
  (setq y (cadr origen))
  (setq alt (* 3.5 escala))
  (setq ins (vd:inserta-cajetin bloque origen escala 0.0 capa))
  ;; Los campos se apilan hacia arriba desde el origen, con el interlineado
  ;; escalado igual que el bloque: si no, en un A0 quedarían pegados.
  (vd:campo (list x (+ y (* 2.0 alt)) 0.0) "PROYECTO" proyecto alt capa)
  (vd:campo (list x (+ y alt) 0.0) "AUTOR" autor alt capa)
  (vd:campo (list x y 0.0) "FORMATO" formato alt capa)
  ins)

(defun c:CAJETINB ( / punto formato)
  (initget 1 "A4 A3 A2 A1 A0")
  (setq formato (getkword "Formato del plano [A4/A3/A2/A1/A0]"))
  (setq punto (getpoint "Punto de inserción del cajetín"))
  (if punto
    (progn
      (vd:cajetin-bloque "CAJETIN-ISO" formato punto "SIN NOMBRE" "SIN AUTOR" "CAJETIN")
      (princ (strcat "\ncajetín " formato " insertado")))
    (princ "\ncancelado"))
  (princ))
