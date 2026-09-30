# Puntos débiles de la aplicación

Hallados recorriendo el ciclo entero con datos reales —entra un servicio, se asigna,
llega el día, se ficha, se verifica el tiempo, se termina, se cobra a la familia y se
paga a la profesional— y forzando los casos que suelen romperse. Cada punto dice si
está **arreglado** (y dónde se comprueba) o **abierto**.

## Arreglados en esta ronda

| # | Qué fallaba | Efecto | Arreglo |
|---|---|---|---|
| 1 | El servicio se quedaba en «confirmado» al fichar, verificar, cobrar y pagar | No se podía **terminar** ni cerrar nunca: era lo que se veía como «sigo sin poder terminar un servicio» | `services/ciclo.ts`: en curso al fichar; validado al verificar todo; **cerrado** al cobrar la familia y pagar a la profesional |
| 2 | La solicitud quedaba «aceptada» para siempre | Fila eterna en las listas de trabajo | Se cierra (o cancela) con su servicio |
| 3 | Cancelar por el desplegable no cancelaba la solicitud ni cerraba sus incidencias, y no avisaba a nadie | Solicitud viva detrás de un servicio muerto; la profesional seguía yendo | Un solo sitio (`cancelarServicio`) lo hace todo, lo usan el botón, el desplegable y la confirmación de una petición de la familia |
| 4 | No existía «terminar» y «cancelar» no pedía motivo ni explicaba | Nadie sabía qué provocaba | Modal con consecuencias y motivo obligatorio (`CierreServicioModal`), en la página y en la ventana de edición |
| 5 | No se podía eliminar un servicio equivocado | Basura permanente en las listas | Se elimina si nunca hubo actividad (jornada empezada, factura, liquidación, documento); si la hubo, se cancela |
| 6 | «Pagado a la profesional» se marcaba con la primera liquidación | Un recurrente decía «pagado» con meses por pagar | Sólo cuando toda su parte está en liquidaciones pagadas |
| 7 | Los servicios cancelados no aparecían en Servicios | «¿Dónde está lo que cancelé?» | Tarjeta y filtro **Cancelados** |
| 8 | «Vas a cobrar» de la profesional se calculaba con el importe del servicio | Mostraba 25,50 € y la liquidación pagaba 24,00 € | Usa el importe que el motor de tiempo dejó en la jornada |
| 9 | Al eliminar un servicio los avisos seguían apuntando a él | «No encontrada» al pincharlos | Se borran con él |
| 10 | El login no tenía freno | Contraseñas probables a ciegas sin límite | 8 fallos seguidos por cuenta y origen → 429 durante 15 min |
| 11 | Dos coordinadoras asignaban a la vez y la segunda pisaba a la primera | Dos profesionales con la propuesta | La escritura sólo vale si el servicio sigue como se leyó (409 si no) |
| 12 | Una baja no cortaba el acceso hasta que caducaba la sesión (12 h) | La profesional de baja seguía viendo datos | Se comprueba la cuenta activa en cada petición (memoria de 15 s) y la app vuelve al login si el servidor rechaza la sesión |
| 13 | Con `JWT_SECRET` sin definir se firmaba con «change-me-in-production» | Cualquiera podía fabricarse un token | En producción no arranca sin secreto propio |
| 14 | Foto de perfil rota en el formulario de profesional | Icono de imagen rota | Iniciales cuando no carga |
| 15 | **Una jornada verificada después de emitir la factura (o aprobar la liquidación) de su mes no se cobraba ni se pagaba nunca** | Dinero perdido en silencio: ya existe una factura por persona y mes, y buscando sólo por la fecha del mes ninguna posterior la recogía | Las facturas y las liquidaciones recogen también lo pendiente de meses anteriores; se cobra y se paga en la siguiente, con su fecha en la línea |

Todo lo del ciclo queda fijado en una prueba que se puede repetir:

```
cd backend && npm run seed && npm run prueba:ciclo   # con el servidor en marcha
```

Recorre el ciclo entero, cancelar, eliminar, terminar un recurrente (incluida la jornada
verificada tarde) y los permisos. Antes se comprobaba con scripts sueltos:
`ciclo.py` (servicio cerrado con solicitud cerrada y pago marcado),
`ciclo2.py` (cancelar, eliminar, terminar un recurrente y cerrarlo), pruebas de permisos
(la profesional y la familia reciben 403 en terminar, cancelar y economía) y navegador.

## Abiertos (por orden de riesgo)

1. **Sólo hay una prueba de humo**, no una suite. `npm run prueba:ciclo` cubre el ciclo y
   sus salidas, pero no corre sola en cada cambio (falta integración continua) y no cubre
   RRHH, RGPD, remesas SEPA ni la facturación legal.
2. **El día de una jornada depende del huso del servidor.** Las jornadas se guardan a la
   medianoche del huso del servidor; el navegador las lee en el suyo. Con el servidor en
   UTC y personas en España aparecen en el día anterior. Hay que fijar `TZ` en producción
   (o guardar el día como fecha, no como instante).
3. **Se factura lo fichado sin verificar.** La factura del mes incluye jornadas
   `FINALIZADA` (sin verificar). Si al verificar cambia el tiempo, la diferencia se
   arrastra a la factura siguiente (regla existente), pero es dinero cobrado antes de que
   nadie lo confirme.
4. **Un impago no reabre un servicio cerrado.** Si una factura pasa a `IMPAGADA` después
   de cerrar el servicio, éste sigue cerrado: el impago sólo se ve en Cobros.
5. **El freno del login vive en memoria.** Se pierde al reiniciar y no se comparte entre
   instancias. Con más de una instancia hay que moverlo a la base de datos o a un caché.
6. **La contraseña de demostración viene precargada en la pantalla de entrada** y los
   usuarios del seed usan todos `cuida2026`. Hay que quitar ambas cosas antes de abrir la
   aplicación a nadie.
7. **Las fotos de demostración se piden a un servicio externo** (`i.pravatar.cc`): cada
   apertura de una ficha filtra la IP de quien mira a un tercero. En producción, las fotos
   se suben al almacén propio.
8. **Verificar dos veces la misma jornada devuelve 200.** No duplica dinero (recalcula lo
   mismo) pero deja dos entradas en el historial.
9. **Reasignar a mitad de un recurrente** reparte lo trabajado entre dos profesionales:
   cada jornada conserva la suya, pero el «pagado a la profesional» del servicio sólo se
   marca cuando las dos partes están pagadas. Está bien, pero conviene una prueba
   automática.
10. **Fichas de persona y profesional** siguen siendo ventanas emergentes con
    formulario. La del servicio ya es una página completa; falta llevarles el mismo
    diseño (hace falta la maqueta de cada una).
