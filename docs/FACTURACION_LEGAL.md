# Facturación: lo que la ley exige y dónde está en CUIDA

Notas de lo implementado, con la norma al lado. **No es asesoría jurídica**:
los criterios hay que confirmarlos con la asesoría de la empresa, que es quien
responde ante Hacienda.

---

## Quién emite

Una factura sin identidad fiscal del emisor no es una factura. En
*Administración › Mi empresa* están la razón social, el CIF, el domicilio
fiscal y los datos del Registro Mercantil, que una sociedad debe hacer constar
en sus facturas (art. 24 de la Ley de Sociedades de Capital). El pie registral
se **congela** en la factura al emitirla, junto con el resto de la identidad de
las dos partes: si mañana la empresa cambia de domicilio, lo ya emitido sigue
diciendo lo que decía.

La pantalla distingue lo que **bloquea** (sin CIF no se emite, sin IBAN ni
identificador de acreedor no hay remesa, con el seguro de responsabilidad
civil caducado no se debería prestar servicio) de lo que conviene tener.

## Numeración

Serie más número correlativo dentro del ejercicio, sin huecos. Un borrador
**no ocupa número**: lo toma al emitirse, y desde entonces no cambia. La serie
no se puede cambiar si ya hay facturas emitidas en el ejercicio, porque
cambiarla rompería la correlatividad.

## Una factura emitida no se modifica

Se rectifica con una factura nueva que referencia a la anterior. Es lo que
exige el reglamento de facturación (RD 1619/2012) y lo que hace la aplicación:
el botón de *Rectificar* crea una rectificativa, no edita la original.

## Registro de facturación (RD 1007/2023)

Cada factura que se emite genera un **registro de alta** encadenado con el
anterior mediante una huella SHA-256 calculada con los campos y el orden que
fija la Orden HAC/1177/2024:

```
IDEmisorFactura & NumSerieFactura & FechaExpedicionFactura & TipoFactura
& CuotaTotal & ImporteTotal & Huella(anterior) & FechaHoraHusoGenRegistro
```

La cadena es lo que hace que no se pueda borrar, cambiar ni reordenar una
factura sin que se note: alterar cualquier cosa rompe todas las huellas
posteriores. *Cobros y pagos › Comprobar la cadena de facturas* recalcula las
huellas y dice si alguna no cuadra.

La factura imprime el **QR de cotejo**, la huella, el tipo de registro (F1
completa, R1 rectificativa) y el sistema informático que la generó, como pide
el reglamento.

**Lo que esta instalación no hace, y hay que saberlo:**

- No remite los registros a la AEAT. Esa es la modalidad *Veri\*factu*, que
  necesita el servicio web de la Agencia y un certificado electrónico.
- No sustituye a la **declaración responsable** que el fabricante del software
  debe emitir conforme al art. 13 del RD 1007/2023.

Ambas cosas están escritas también al pie de la propia factura, para que nadie
dé por hecho lo que no es.

## IVA

Cada servicio del catálogo lleva su tipo: 4 % superreducido para la prestación
vinculada a dependencia o plaza concertada, 10 % reducido para la contratación
particular. La factura desglosa la base y la cuota **por tipo**, no en una suma
única, que es como debe desglosarse.

## Cobro

Domiciliación con mandato SEPA: el mandato tiene su referencia, su fecha de
firma y su estado, y el fichero de remesas sale con el identificador de
acreedor de la empresa. Un mandato revocado no puede domiciliar.

Los días de vencimiento salen de lo pactado con cada cliente y, si no hay nada
pactado, del valor por defecto de la empresa.

## Conservación

Seis años desde la emisión, por el art. 30 del Código de Comercio, que es más
largo que los cuatro de prescripción tributaria del art. 66 de la Ley General
Tributaria: manda el más largo. La purga de datos **se niega** a borrar
facturación aunque esté fuera de plazo; lo que toca es exportarla y archivarla
fuera del sistema vivo.
