# La cara de CUIDA

Las decisiones visuales, escritas para que dentro de seis meses nadie tenga
que adivinar por qué una tarjeta tiene el radio que tiene.

## De dónde salen los colores

Del logo, no de una paleta elegida aparte. El SVG de CUIDA tiene exactamente
dos colores y los dos son la base de todo lo demás:

| Color | Valor | Dónde manda |
|---|---|---|
| Teal CUIDA | `#1c4f61` (`brand-700`) | Barra lateral, botones principales, titulares |
| Verde menta CUIDA | `#5ab893` (`brand-green`) | Lo elegido, lo que va bien, la acción de crear |

De ahí salen las dos escalas completas (`brand-50…950`, `brand-green-50…900`)
y el lienzo sobre el que se apoya todo: `lienzo` = `#f3f7f6`, un gris con una
gota del verde de la marca. Nunca el gris neutro de fábrica, que al lado del
teal se ve azulado y sucio.

Los tintes de aviso —rosa, ámbar— son los de Tailwind sin tocar: son
convenciones que la gente ya sabe leer y reinventarlas no aporta nada.

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
  quince. El lleno para lo que hay que hacer ahora, el de contorno para lo
  demás, el verde para crear.
- **`.campo`** — un solo estilo de campo para toda la aplicación.
- **`.rotulo`** — el texto pequeño en versales que ordena una columna.

## La estructura

- **Cabecera fija**: el logo, de qué va esta parte y su lema, el buscador en el
  centro y a la derecha los avisos y quién eres. Se queda arriba porque el
  buscador y la campana se usan desde cualquier sitio.
- **Barra lateral oscura**, pegada al borde, con las entradas agrupadas por
  áreas y su cifra al lado. Abajo, el lema de la casa.
- **Contenido** sobre el lienzo, con las tarjetas encima.

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
