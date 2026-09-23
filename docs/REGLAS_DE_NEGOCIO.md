# Reglas de negocio de tiempo y facturación

CUIDA no vende "servicios de ayuda a domicilio": vende **tiempo de atención
coordinado, registrado, verificado y convertido en una operación económica
trazable**. Todo el dinero del sistema sale de una cifra de minutos, así que
las reglas que convierten minutos en euros son la pieza más delicada del
producto — y la que hay que decidir explícitamente, no sobre la marcha.

Este documento recoge las cuarenta decisiones, la respuesta que CUIDA trae por
defecto y dónde se cambia. Las que llevan **(configurable)** se editan en
*Administración › Reglas de negocio* y no requieren tocar código.

---

## Los cuatro tiempos

Una jornada tiene cuatro cifras distintas, y confundirlas es lo que rompe
estos sistemas en cuanto aparece un caso real:

| Tiempo | Qué es | Ejemplo |
|---|---|---|
| **Acordado** (programado) | lo que se pactó en el plan | 09:00 → 12:00 = 3 h |
| **Fichado** (real) | lo que marcaron entrada y salida | 09:04 → 11:58 = 2 h 54 min |
| **Se cobra** (facturable) | lo que entra en la factura de la familia | 3 h |
| **Se paga** (liquidable) | lo que entra en la liquidación del profesional | 3 h |

> El tiempo registrado y el tiempo económicamente liquidable no tienen por qué
> ser idénticos. Lo decide la regla, no el fichaje.

La unidad económica de CUIDA es **el tiempo facturable y liquidable de una
visita**, no el servicio. El servicio es el contrato; la visita es la
ejecución; el tiempo es lo que genera dinero.

---

## Tiempo

| # | Pregunta | Respuesta de CUIDA |
|---|---|---|
| 1 | ¿Se cobra tiempo acordado o real? | **Acordado** (configurable: acordado / real / el menor / el mayor) |
| 2 | ¿Se paga al profesional acordado o real? | **Acordado** (configurable, independiente del anterior) |
| 3 | ¿Cuál es el mínimo de tiempo? | **Sin mínimo** de fábrica; la demo usa 1 h (configurable) |
| 4 | ¿Se redondean los minutos? | **No** de fábrica; la demo redondea (configurable) |
| 5 | ¿A qué intervalo? | Configurable en minutos, con modo arriba / abajo / al más cercano |
| 6 | ¿Qué ocurre con los retrasos? | Se **registran** siempre y se muestran en el desglose; no alteran el importe por sí solos |
| 7 | ¿Y con las salidas anticipadas? | Igual: quedan como desviación negativa; con base "acordado" no reducen el cobro |
| 8 | ¿Y con el tiempo adicional? | No se cobra solo: pasa a **pendiente de aprobación** si supera la tolerancia |
| 9 | ¿Necesita aprobación? | **Sí** (configurable). Aprobarlo pasa esa jornada a tiempo real; rechazarlo la deja en lo acordado |
| 10 | ¿Se permiten pausas? | No modeladas todavía: una pausa larga se resuelve como dos jornadas o como corrección de fichaje |

## Fichaje

| # | Pregunta | Respuesta de CUIDA |
|---|---|---|
| 11 | ¿Quién puede iniciar? | El profesional asignado a esa jornada |
| 12 | ¿Quién puede finalizar? | El mismo profesional, confirmando las horas |
| 13 | ¿Puede hacerlo coordinación? | Sí, como **cierre manual**, y queda marcado como tal — nunca se presenta como un fichaje |
| 14 | ¿Se permite corregir? | Sí, coordinación, con motivo obligatorio |
| 15 | ¿Cómo se registra la corrección? | En `CorreccionFichaje`: valor anterior, valor nuevo, quién y cuándo. **El original nunca se borra** |
| 16 | ¿Qué pasa si se olvida fichar la salida? | El escritorio avisa de las jornadas abiertas pasadas N horas (configurable), con llamar o cerrar a mano |
| 17 | ¿Se puede fichar fuera de la ubicación prevista? | Sí: no hay restricción por ubicación |
| 18 | ¿Se registra ubicación? | **No.** Es dato personal del trabajador y no hace falta para facturar; añadirlo exigiría base legal e información previa |

## Cancelaciones

| # | Pregunta | Respuesta de CUIDA |
|---|---|---|
| 19 | ¿Cuándo es gratuita? | Con **24 h** de preaviso (configurable) |
| 20 | ¿Cuándo genera coste? | Por debajo de ese preaviso |
| 21 | ¿Se paga al profesional? | El **50 %** de lo acordado (configurable): había reservado el hueco |
| 22 | ¿Se cobra a la persona? | El **50 %** de lo acordado (configurable) |
| 23 | ¿Cómo se registra? | Estado `CANCELADA` de la jornada, con motivo, y el desglose explica el porcentaje aplicado |

## Incidencias

| # | Caso | Cómo lo trata CUIDA |
|---|---|---|
| 24 | No presentado | Estado propio `NO_PRESENTADO` + incidencia automática. Cobro y pago al **100 %** de lo acordado (configurable): el profesional se desplazó |
| 25 | Llegada tarde | Retraso calculado y guardado; visible en el desglose |
| 26 | Salida anticipada | Desviación negativa; visible en el desglose |
| 27 | Tiempo adicional | Aprobación explícita con motivo (petición de la familia, necesidad del servicio, incidencia, error de fichaje, otro) |
| 28 | Error de fichaje | Corrección auditada, con el valor original conservado |
| 29 | Servicio incompleto | Incidencia sobre la jornada; coordinación decide al verificar |
| 30 | Sustitución | Reemplazo de profesional; las jornadas ya hechas conservan su profesional para que la liquidación de cada uno siga siendo correcta |

## Cuando no va nadie

Una jornada que no se presta puede fallar por dos lados distintos, y no es lo
mismo: si la persona atendida no estaba, el profesional se desplazó; si el que
falta es el profesional, no hay nada que cobrar ni nada que pagar. Por eso son
dos estados, no uno con matices.

| # | Caso | Estado de la jornada | Se cobra | Se paga |
|---|---|---|---|---|
| 30 bis | La persona no estaba o no abrió | `NO_PRESENTADO` | 100 % de lo acordado (configurable) | 100 % de lo acordado (configurable) |
| 30 ter | No fue nadie a prestar el servicio | `FALTA_PROFESIONAL` | **0 %** | **0 %** |

Las dos abren **incidencia automática**, colgando a la vez del servicio y de la
jornada, para que se puedan tramitar como cualquier otra. La de
`FALTA_PROFESIONAL` entra con **prioridad alta**: que no vaya nadie a casa de
una persona que espera es lo más grave que puede pasar aquí, y no puede quedar
sólo como un apunte contable.

Una **ausencia aprobada** (baja médica, vacaciones, permiso) hace lo mismo sin
esperar al día: al aprobarla se abre una incidencia por cada servicio que deja
sin cubrir, diciendo cuántas jornadas son y de quién, para que coordinación
busque reemplazo antes de que llegue la fecha.

### Tramitar el reemplazo

Desde la ficha de la incidencia se pone a otra persona en el servicio, y de ahí
salen cuatro consecuencias:

1. El **servicio** pasa al sustituto, y con él las jornadas que todavía no han
   empezado. Las ya trabajadas no se tocan: siguen contando para quien las hizo,
   y su liquidación sigue siendo correcta.
2. La **jornada perdida** se puede recuperar otro día. Recuperarla es **crear
   una jornada nueva**, nunca reescribir la que no se hizo: aquel día no fue
   nadie y eso queda registrado como pasó.
3. Al sustituto se le aplican **las mismas comprobaciones que a cualquier
   asignación** —documentos obligatorios al día (certificado de delitos
   sexuales incluido), contrato de encargo de tratamiento firmado si viene de
   una empresa colaboradora, y ninguna ausencia aprobada ese día—. Un reemplazo
   de urgencia es justo cuando más fácil es saltárselas, así que se comprueban
   igual y el motivo del rechazo se dice por escrito.
4. La incidencia queda **en resolución, no cerrada**: todavía falta avisar a la
   familia, y eso lo da por hecho una persona cuando lo ha hecho.


### El repaso de lo que viene

Todo lo anterior actúa cuando la jornada ya se ha perdido. Para no llegar
siempre tarde, Cobertura repasa las jornadas de los **próximos 14 días** y
señala una a una las que, tal como están, no se van a poder prestar:

- no hay nadie asignado;
- quien tiene que ir no tiene los papeles obligatorios al día;
- viene de una empresa colaboradora sin encargo de tratamiento firmado;
- tiene una ausencia aprobada justo ese día.

Son **las mismas comprobaciones que se hacen al asignar**, ejecutadas por el
mismo código, para que el aviso de hoy y el bloqueo de mañana nunca digan
cosas distintas. Cada línea lleva escrito el motivo y enlaza a donde se
resuelve: a la incidencia abierta sobre esa jornada si ya la hay, o a la
solicitud si todavía no. El número que sale en el menú cuenta sólo las que
bloquean; un servicio asignado pero sin confirmar avisa, no bloquea.


## Dinero

| # | Pregunta | Respuesta de CUIDA |
|---|---|---|
| 31 | ¿Precio al cliente? | De la **tarifa vigente** ese día; si no hay tarifa, del precio acordado en el servicio |
| 32 | ¿Tarifa del profesional? | De la misma tarifa vigente; si no hay, del precio del servicio menos la comisión |
| 33 | ¿Comisión de CUIDA? | La diferencia entre ambas. Es **ingreso de gestión, no beneficio**: de ahí salen impuestos, seguros, pasarela y administración |
| 34 | ¿IVA? | Del catálogo de servicios (4 % o 10 %), congelado en el servicio al fijar la tarifa |
| 35 | ¿Cuándo se considera cobrado? | Cuando la factura se marca como cobrada o llega el adeudo SEPA de la remesa |
| 36 | ¿Cuándo es liquidable? | Cuando la jornada está **verificada** y sin ajuste pendiente |
| 37 | ¿Cuándo se paga al profesional? | En la liquidación mensual, con IRPF si es autónomo y sin él si es laboral |
| 38 | ¿Reembolsos? | Factura rectificativa que compensa; la original nunca se edita |
| 39 | ¿Ajustes? | Mismo camino: rectificativa, nunca reescritura |
| 40 | ¿Impagos? | La factura queda pendiente y el adeudo devuelto se gestiona sobre la remesa |

---

## Lo que el sistema tiene que poder responder

Es la prueba de calidad del desarrollo. Con los datos de la demo:

- **"¿Por qué paga 42,50 €?"** → 2 h 30 min facturables × 17,00 €/h
- **"¿Por qué cobra 30,00 €?"** → 2 h 30 min liquidables × 12,00 €/h
- **"¿Qué se lleva CUIDA?"** → 12,50 €, la diferencia
- **"¿Por qué 2 h 30 min, si fichó 3 h 15 min?"** → porque se cobra el tiempo
  acordado y los 45 min de más están pendientes de aprobación

Las cuatro respuestas están en la misma pantalla: *ficha de la solicitud →
jornada → **Desglose***.

## Dos reglas técnicas que no se negocian

1. **Un fichaje no se sobrescribe.** Corregir es añadir una corrección, no
   cambiar el dato.
2. **Una tarifa no se edita.** Se cierra y se crea la siguiente, y cada
   jornada guarda la instantánea de la que se le aplicó. Subir el precio en
   octubre no puede reescribir lo prestado en septiembre.

Cambiar una regla **no recalcula el pasado**: solo afecta a las jornadas que
se cierren a partir de ese momento.

---

## Quién ve qué del dinero

Comprobado por API en los cuatro roles:

| Rol | Lo que paga la familia | Lo que cobra el profesional | Ingreso de CUIDA |
|---|---|---|---|
| Coordinación | sí | sí | sí |
| Familiar autorizado | sí | no | no |
| Familiar sin autorización | no | no | no |
| Persona atendida | no | no | no |
| Profesional | no | **su parte, sí** | no |

Un familiar autorizado tiene derecho a saber qué paga y por qué; cuánto gana
la empresa y cuánto cobra la cuidadora son los otros dos contratos, y no le
corresponden. El profesional ve su nómina y nada más.

## El mismo importe en los cuatro sitios

El motor escribe las cifras una vez, al cerrar la jornada, y desde entonces
las leen todos: el desglose, Verificación, la factura y la liquidación. Con
los datos de la demo, la jornada del 21 de septiembre de Dolores:

```
desglose      2 h 30 min × 17,00 €/h = 42,50 €   profesional 30,00 €   CUIDA 12,50 €
Verificación  Profesional 30,00 € · CUIDA 12,50 € · Familia 46,75 € (con IVA)
factura       una línea por jornada, 42,50 € de base, 46,75 € con IVA
liquidación   2 h 30 min liquidables × 12,00 €/h = 30,00 €
```

Y el cuadre se cumple en la propia factura: **cobrado − pagado = ingreso de
CUIDA**.

## Verificada → liquidable → liquidada

- Una jornada con tiempo adicional **sin decidir** no se factura ni se liquida:
  la generación de la factura del mes se detiene y dice qué jornadas son.
- Aprobar la liquidación marca sus jornadas como `LIQUIDADA`, así que no pueden
  volver a entrar en la del mes siguiente.
- Un borrador de factura no tiene número fiscal: se le asigna al emitir.

---

## Documentos: el papel, no la anotación

Un documento obligatorio **solo cuenta si está**: con su fichero subido o, al
menos, con un enlace a dónde vive. Una fila con el nombre del papel y nada
detrás deja de dar a nadie por resuelto.

| Situación | Cómo lo cuenta CUIDA | ¿Puede trabajar? |
|---|---|---|
| Ni anotado | `falta` | No |
| Anotado sin fichero | `sin_archivo` | **No** |
| Con fichero, vigente | — | Sí |
| Con fichero, caduca pronto | `por_caducar` | Sí, con aviso |
| Con fichero, caducado | `caducado` | No |

`sin_archivo` se distingue de `falta` a propósito: en el expediente se ve la
fila y parece que ya está, y es justo el caso que engañaba.

### Cómo se guardan

- Se aceptan **PDF, JPG y PNG**, hasta **10 MB**.
- El tipo se comprueba por los **primeros bytes del contenido**, no por la
  cabecera que manda el navegador: un `.exe` renombrado a `.pdf` se rechaza.
- El nombre del fichero en disco lo pone el servidor; el nombre original solo
  se guarda para enseñarlo y para la descarga.
- De cada archivo se guarda su **SHA-256**, para detectar que ha cambiado.
- **No hay carpeta pública.** La descarga pasa siempre por un endpoint que
  comprueba quién pregunta, y el permiso se hereda de aquello a lo que el
  documento está pegado: coordinación siempre; el profesional, los suyos; la
  familia, los de la persona a su cargo.
- En la demo los ficheros viven en `backend/almacen/` (fuera del repositorio).
  En producción eso se sustituye por un bucket de objetos cambiando solo
  `guardar` y `leer` en `services/almacen.ts` — el resto del sistema no sabe
  dónde están.


---

## Lo mínimo que se puede pagar por hora

Las reglas de la casa incluyen un **suelo por hora de trabajo**. Ninguna tarifa
nueva puede pagar por debajo: una tarifa mal puesta no se arregla con una
rectificación, se convierte en meses de nóminas mal pagadas y eso lo persigue
la Inspección de Trabajo.

El valor de fábrica es el suelo del SMI — 1.184 €/mes × 14 pagas ÷ 1.826 horas
de jornada anual máxima (RD 87/2025 y art. 34 del Estatuto de los Trabajadores),
unos 9,08 €/h. **El convenio de ayuda a domicilio que aplique suele estar por
encima**, así que es configurable y hay que subirlo a lo que diga el convenio:
la aplicación solo impide lo que es ilegal en cualquier caso.


---

## Cuando el tiempo se decide después de facturar o de pagar

La familia llama una semana más tarde: ese cuarto de hora de más se lo pidieron
ellos. La jornada pasa a valer 3 h 15 min en vez de 3 h, y eso cambia **los
tres importes a la vez**: lo que paga la familia, lo que cobra quien trabajó y
el ingreso de gestión, todos al precio/hora congelado de esa jornada.

Tres reglas sostienen ese caso:

1. **Se puede volver a decidir.** Aprobar o rechazar el tiempo de más no es una
   puerta de un solo sentido: la decisión se puede cambiar, y el historial
   guarda las dos con su motivo, su autor y su fecha.
2. **La decisión manda sobre la regla de la casa, y manda siempre.** Una
   jornada con tiempo aprobado se calcula sobre el tiempo fichado aunque la
   regla general diga "se cobra lo acordado", y sigue haciéndolo cada vez que
   el motor rehace la cuenta. Antes bastaba con corregir después una hora de
   fichaje para que el recálculo se llevara por delante la decisión —y con
   ella el dinero prometido a quien trabajó.
3. **La diferencia se arrastra, no se pierde ni se apaña.** Si esa jornada ya
   está en una factura emitida o en una liquidación aprobada, esos documentos
   no se tocan —una factura emitida se rectifica, no se edita, y una
   liquidación aprobada es lo que se le prometió a alguien—: la diferencia
   entra como **línea de regularización** en la siguiente factura y en la
   siguiente nómina, diciendo de qué jornada y de qué día viene. Cuando esa
   línea se aprueba, la suma vuelve a cuadrar y la regularización desaparece
   sola. Funciona en los dos sentidos: lo cobrado de más sale en negativo y se
   devuelve.

El desglose de la jornada avisa antes de decidir: "esta jornada ya está en la
factura A/2026/0002; la diferencia entrará como regularización en la siguiente".
