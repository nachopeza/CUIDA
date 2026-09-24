# La cara de CUIDA

Las decisiones visuales, escritas para que dentro de seis meses nadie tenga
que adivinar por qué una tarjeta tiene el radio que tiene.

## De dónde salen los colores

De la maqueta, muestreados de la propia imagen píxel a píxel, no aproximados
a ojo:

| Color | Valor | Dónde manda |
|---|---|---|
| Teal de la barra lateral | `#0a2f3b` (`brand-900`) | El fondo del menú |
| Teal del botón principal | `#0c5a5e` (`brand-700`, `brand`) | Lo que hay que hacer ahora |
| Verde | `#1b8b7a` (`brand-green-500`) | Lo elegido en el menú y la acción de crear |
| Verde brillante | `#5bceaa` (`brand-green-300`) | La cifra al lado de cada entrada del menú |
| Lienzo | `#f3fafc` | El fondo sobre el que se apoyan las tarjetas |

Cada escala se construye alrededor de ese valor exacto, que queda siempre en
el peldaño que se usa de verdad: así se puede aclarar u oscurecer sin perder
el color de la maqueta. El logo de CUIDA se mantiene tal cual.

Las cuatro casillas de la cabecera también van con sus valores exactos, uno
por tinte: el fondo (un degradado de la esquina al blanco), el círculo del
icono, el número y la etiqueta. El enlace de abajo es el mismo gris azulado
(`#396377`) en las cuatro, para que no compita con la cifra.

## La tipografía

**Inter**, servida desde la propia aplicación (`@fontsource/inter`), no desde
Google. Estaba declarada en Tailwind pero no se cargaba, así que cada sistema
ponía la suya y el mismo dato se veía de una forma en un Mac y de otra en un
Windows. Va alojada aquí a propósito: pedirle la tipografía a Google significa
mandarle la IP de cada visitante, y en una aplicación que trata datos de salud
eso es una cesión que nadie ha autorizado.

Los iconos son los de la casa, de trazo simple de 2 px con remates redondos:
el mismo grosor que los de la maqueta.

## Las piezas

Están en `src/index.css` como clases de componente, no repetidas en cada
pantalla, para que "tarjeta" quiera decir lo mismo en las veinte secciones:

- **`.tarjeta`** — la caja blanca: radio de 16 px, borde casi invisible y
  sombra larga y suave. Lo que separa una tarjeta de la siguiente es el aire,
  no la raya.
- **`.pastilla`** — estados y prioridades, siempre en píldora y siempre con el
  texto en su color. Nunca sólo color: impreso en gris o para quien no
  distingue el ámbar del verde, la etiqueta sigue funcionando.
- **`.boton-principal` / `.boton-secundario` / `.boton-verde`** — tres, no
  quince, con el radio de 8 px de la maqueta. El relleno teal oscuro para lo
  que hay que hacer ahora, el blanco con borde para lo demás, el verde para
  crear. Y sus dos tamaños pequeños (`-sm`) para dentro de una fila de tabla.
- **`.campo`** — un solo estilo de campo para toda la aplicación.
- **`.rotulo`** — el texto pequeño en versales que ordena una columna.

## El escritorio

Es la disposición de la maqueta, rellena con nuestros datos. Dos columnas: a
la izquierda lo que se hace, a la derecha cómo va.

- **Mi día**: el saludo, la fecha y la hora, y cuatro casillas —urgentes,
  pendientes, visitas de hoy y profesionales activos—. En cada una, el icono
  en su círculo y **el número a su lado**, en la misma línea; debajo, lo que
  cuenta en el color de la casilla, y el enlace a donde se resuelve. Las
  cuatro miden lo mismo aunque el texto ocupe dos líneas.
- **Bandeja de trabajo**: prioridad · tipo · persona / servicio · **hora** ·
  acción. El tipo lleva debajo qué pasa, y la persona, de qué servicio se
  trata: el nombre solo no distingue dos servicios de la misma persona. La
  columna de la hora dice a qué hora hay que estar —"09:00", "Mañana 17:00",
  "Ayer 16:00"—, no cuánto lleva esperando; eso ya lo dice el orden de la
  lista. Lo crítico lleva el botón lleno y la hora en rojo; lo demás, el botón
  de contorno. Los anchos de columna son fijos a propósito: una descripción
  larga no puede empujar el botón que resuelve el asunto fuera de la tarjeta.
- **Agenda de hoy**: hora · punto de estado · quién recibe el servicio y de
  qué es · **la dirección** · en qué estado está · quién va. En pantalla ancha
  va en rejilla, para que las columnas de una fila caigan justo debajo de las
  de la anterior. Arriba a la derecha, "Hoy" y dos flechas: asomarse a mañana
  y volver, sin salir del escritorio.
- **El trío de abajo**: la rosquilla de cobertura del día con su leyenda en un
  recuadro, qué se hace hoy por tipo (un punto y la cifra, sin barras) y en qué
  punto están los servicios.
- **La columna de la derecha**: servicios en curso, el resumen económico del
  mes en cuatro casillas con su variación, las incidencias abiertas, el
  recordatorio de para qué es todo esto y las próximas acciones.

Lo que **no** está en la maqueta tampoco está aquí: la fila de avisos, la
carga de trabajo y la actividad reciente se fueron. No se perdió nada por el
camino: la carga de trabajo y la actividad tienen su propia sección, y lo que
detectaba cada aviso entró en la bandeja, que es donde se miran las tareas y
donde cada una lleva su acción al lado. Las novedades se quedan al final de la
columna de la derecha, que es donde se pidieron.

## La estructura

- **Cabecera fija**: el logo, de qué va esta parte y su lema, el buscador en el
  centro y a la derecha los avisos y quién eres. Se queda arriba porque el
  buscador y la campana se usan desde cualquier sitio.
- **Barra lateral oscura**, pegada al borde, con el menú de la maqueta entero:

  | Área | Entradas |
  |---|---|
  | — | Inicio |
  | Operación | Solicitudes · Servicios · Visitas · Calendario |
  | Personas | Personas · Familiares / Contactos |
  | Profesionales | Profesionales · Disponibilidad · Cobertura |
  | Seguimiento | Incidencias · Verificaciones · Historial |
  | Finanzas | Cobros · Pagos · Facturación · Liquidaciones |
  | Análisis | Indicadores · Servicios · Profesionales · Ingresos |
  | Administración | Usuarios · Permisos · Configuración |

  La cifra de cada entrada va en un **disco del mismo tamaño siempre**, no en
  una etiqueta que crece con el número, y dice cuántas cosas esperan ahí
  dentro, no cuántas filas tiene la tabla: un número que no cambia nunca deja
  de leerse a la semana. Tres tonos y sólo tres: **rojo** cuando alguien se
  queda sin servicio, **ámbar** cuando algo va tarde, **verde** cuando es sólo
  cuántos hay. Abajo, las dos hojas y el lema de la casa.
- **La barra es sólo menú.** Los botones de crear estaban ahí y se han ido a
  la cabecera de la pantalla donde se crea: "Nueva solicitud" pertenece a
  Solicitudes igual que "Nuevo usuario" pertenece a Personas.
- **Contenido** sobre el lienzo, con las tarjetas encima.

### Veintidós entradas, no veintinueve

Lo que antes eran entradas sueltas se ha replegado dentro de las de la
maqueta. No se ha quitado nada: se ha dejado de pedir que alguien recuerde
dónde vive cada cosa.

- **Configuración** es ahora una sola entrada con seis secciones dentro, en el
  orden de montar la casa: Mi empresa, Catálogo de servicios, Reglas de
  negocio, Empresas colaboradoras, Equipo interno y Protección de datos.
- **Dos pares de entradas comparten pantalla**, porque son la misma tabla
  mirada desde dos preguntas: Visitas enseña todas las jornadas y
  Verificaciones sólo las que esperan el visto bueno; Facturación y
  Liquidaciones enseñan las listas enteras, y Cobros y Pagos, sólo lo que
  queda pendiente.
- **Solicitudes y Servicios** son la misma cadena partida por donde cambia el
  trabajo: antes de que haya alguien confirmado se gestiona una petición; a
  partir de ahí se vigila un servicio en marcha.
- **Análisis** son cuatro entradas sobre los mismos datos, cada una con lo que
  contesta a su pregunta, para que cada pantalla conteste una y no cinco.
- **La bandeja de trabajo y el expediente de un profesional** no están en el
  menú a propósito: a la bandeja se llega desde el escritorio y al expediente,
  desde la fila que nombra a esa persona.

El buscador lo pinta cada panel —es quien sabe qué hay que buscar— pero
aparece en la cabecera: eso lo resuelve una **ranura** (`src/lib/ranuras.ts`),
un hueco con nombre en el que el panel mete lo suyo con un portal.

## El móvil no es la web encogida

- La navegación diaria va en una **barra de pestañas fija abajo**, al alcance
  del pulgar: cuatro entradas y "Menú" para el resto.
- El **cajón** es la barra lateral entera, con quién eres arriba del todo:
  en el móvil la cabecera es un logo y dos iconos, y es el único sitio donde
  cabe decirlo.
- La hamburguesa vive en la cabecera, no flotando en el contenido.

## Lo que no se toca

La factura y la liquidación **no llevan el estilo de la interfaz**: son
documentos en papel. Su caja es un folio A4 de 210 × 297 mm (`.hoja-a4`), se
ve así en pantalla —para que lo que se revisa sea lo que se va a entregar— y
se imprime con esas mismas medidas.
