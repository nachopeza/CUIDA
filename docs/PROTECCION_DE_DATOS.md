# Protección de datos en CUIDA

> **Esto no es asesoría jurídica.** Los plazos y las bases que siguen son los
> que se citan habitualmente en España, puestos como punto de partida y
> configurables desde *Administración › Protección de datos*. Quien responde
> de que sean correctos es el responsable del tratamiento, no la aplicación.
> Confírmalos con vuestra asesoría antes de operar con datos reales.

CUIDA trata datos que no son cualquier dato: la **medicación y el estado de
salud** de una persona mayor, y el **certificado de antecedentes por delitos
sexuales** de quien entra en su casa. Los dos son categorías especiales o
próximas a ellas, y los dos exigen tratarse como lo que son.

---

## Qué se trata, para qué y con qué base

| Dato | Finalidad | Base jurídica |
|---|---|---|
| Identificación y contacto de la persona | Prestar y coordinar el servicio | Ejecución del contrato · art. 6.1.b |
| Medicación, médico, preferencias de cuidado | Que quien presta el servicio sepa atenderla con seguridad | Asistencia sanitaria o social · **art. 9.2.h** |
| Familiares autorizados | Que un familiar gestione en su nombre | Ejecución del contrato · art. 6.1.b |
| Jornadas, fichajes y verificación | Coordinar, verificar y facturar | Ejecución del contrato · art. 6.1.b |
| Facturas, IBAN y mandatos SEPA | Cobrar y cumplir obligaciones contables | Obligación legal · art. 6.1.c |
| Registro de jornada del profesional | Cumplir el Art. 34.9 ET | Obligación legal · art. 6.1.c |
| Certificado de delitos sexuales | Acreditar la aptitud legal para trabajar con personas vulnerables | Obligación legal · art. 6.1.c + art. 10 |
| Registro de accesos | Seguridad y trazabilidad | Interés legítimo · art. 6.1.f |

---

## Cuánto se guarda

Configurable en la aplicación. Los valores de fábrica:

| Categoría | Plazo | De dónde sale | ¿Obliga a guardar? |
|---|---|---|---|
| Registro de jornada | 4 años | Art. 34.9 ET | **Sí** |
| Documentación laboral | 4 años desde la baja | Art. 21 LISOS y obligaciones frente a la TGSS | **Sí** |
| Facturas y liquidaciones | 6 años | Art. 30 Código de Comercio (por encima de los 4 del art. 66 LGT) | **Sí** |
| Mandatos SEPA | 14 meses desde la revocación | Cuaderno SEPA: reclamación por adeudo no autorizado | **Sí** |
| Datos de la persona atendida | 5 años desde la última jornada | Art. 1964 Código Civil | No: solo limita |
| Certificado de delitos sexuales | 1 año desde la baja | Sin plazo fijado: minimización, art. 5.1.c | No: solo limita |
| Registro de accesos | 2 años | Esquema Nacional de Seguridad | No: solo limita |
| Mensajes | 1 año | Sin obligación de conservar | No: solo limita |

La columna de la derecha es la que más importa: **en las tres primeras, borrar
antes de tiempo es la infracción**; en las últimas, la infracción es guardar de
más. El RGPD se incumple por los dos lados.

### Cómo se borra

- **Nada se borra solo.** Un borrado automático mal configurado destruye justo
  la prueba que la ley obliga a conservar. La purga la pide una persona, que
  antes ve cuántos registros se lleva y desde cuándo.
- Para confirmar hay que **escribir el nombre de la categoría**. No es
  burocracia: esto borra datos que no se recuperan.
- Cada purga queda en **Actividad** con qué se borró, cuántos registros, el
  plazo aplicado y la norma.
- **Las facturas no se borran desde la aplicación.** Su numeración tiene que
  seguir siendo correlativa y sin huecos; pasado el plazo se exportan y se
  archivan fuera del sistema vivo.
- Los **datos de la persona no se borran: se anonimizan.** Se le quitan nombre,
  contacto, salud y preferencias, y se conserva el historial de servicio sin
  nada que la identifique. Un dato anonimizado deja de ser dato personal, y así
  no se destruye la contabilidad ni el registro de jornada asociados.

---

## Información y consentimientos

El RGPD no se cumple colgando una política en la web: hay que poder demostrar,
**persona a persona**, qué se le explicó y qué autorizó (arts. 5.2 y 7.1), y
dejar retirarlo con la misma facilidad con la que se dio (art. 7.3).

La ficha de cada persona tiene los cinco puntos del catálogo, contestados o no:

| Punto | Base jurídica | ¿Se puede decir que no? |
|---|---|---|
| Información entregada (art. 13) | Arts. 12 y 13 RGPD | No es una opción de la persona: es una obligación de la empresa |
| Datos de salud y cuidados | Art. 9.2.a (consentimiento explícito) | No, sin ellos no hay plan de cuidados |
| Sus datos llegan a quien la atiende | Art. 6.1.b y art. 28 para la colaboradora | No, nadie puede ir a una casa sin saber a dónde va |
| Imagen | Art. 6.1.a y LO 1/1982 | Sí, y el servicio es el mismo |
| Avisos y novedades | Art. 6.1.a y art. 21 LSSI | Sí, y el servicio es el mismo |

Que los dos últimos se puedan rechazar sin perder el servicio no es cortesía:
si no se pudiera, el consentimiento no sería libre (art. 7.4) y no valdría.

**Nada se sobrescribe.** Una respuesta nueva es una fila nueva, y retirar una
autorización deja el otorgamiento con su fecha de revocación al lado: lo hecho
hasta ese día era lícito y eso también hay que poder demostrarlo. Cada fila
guarda la **versión del texto** que se le leyó; si el texto cambia, la ficha
avisa de que hay que volver a informar.

*Sin preguntar* no es lo mismo que *dijo que no*: lo primero es una tarea
pendiente de coordinación y sale en la bandeja de trabajo como un asunto más.

### Encargados de tratamiento (art. 28)

Asignar un servicio a una empresa colaboradora le entrega el nombre, la
dirección y el plan de cuidados de la persona. Eso es un encargo de
tratamiento y el art. 28.3 exige el contrato **antes** de la cesión: sin él,
la responsable de la infracción es la organización. Por eso CUIDA no deja
asignar servicios a una colaboradora que no lo tenga marcado como firmado en
su ficha — ni directamente ni a través de una profesional suya.

### Registro de actividades (art. 30)

Se descarga desde *Protección de datos*. No es un texto que se redacte: se
genera de lo que la aplicación hace de verdad — los plazos de conservación que
aplica con su norma, los destinatarios reales, las colaboradoras dadas de alta
y las medidas de seguridad implementadas. Sigue necesitando que el responsable
lo revise y lo asuma, pero deja de ser un Word que envejece a la semana.

---

## Derechos de las personas

**Acceso y portabilidad (arts. 15 y 20).** Desde la ficha de cualquier persona,
*Copia de sus datos (RGPD)* descarga todo lo que CUIDA sabe de ella, en
bloques por finalidad y con la base jurídica de cada uno. El plazo legal de
respuesta es de un mes, así que no puede ser una consulta improvisada el día
que llega la petición. El IBAN sale enmascarado: el fichero circula por correo
y la persona ya sabe cuál es su cuenta.

**Rectificación, supresión, oposición y limitación.** Se atienden desde la
ficha y desde esta pantalla; la copia entregada incluye a quién dirigirse y la
mención a la Agencia Española de Protección de Datos.

---

## Medidas de seguridad implementadas

- **Acceso por rol y por vínculo**, no solo por rol: para ver a una persona hay
  que ser ella, un familiar autorizado no revocado, o pertenecer a la
  organización que la atiende.
- **Minimización en la respuesta**: lo que paga la familia, lo que cobra el
  profesional y el margen de CUIDA se filtran por separado y el filtro baja
  hasta las jornadas anidadas.
- **Documentos nunca públicos**: se descargan por un endpoint que comprueba
  quién pregunta, con el permiso heredado de aquello a lo que están pegados.
  El tipo de archivo se valida por sus bytes reales.
- **Fichajes inmutables**: corregir una hora añade una corrección con motivo,
  autor y fecha; el original no desaparece.
- **Auditoría de solo inserción** de cada acceso y cada cambio relevante.

## Lo que falta para operar con datos reales

Dicho claro, porque un prototipo que se presente como cumplidor sin serlo es
peor que uno que diga lo que le falta:

1. **Cifrado en reposo** de la base de datos y del almacén de archivos.
2. **Copias de seguridad** con su propio plazo de conservación y prueba de
   restauración.
3. **Firma del registro de actividades (art. 30)**: la aplicación lo genera,
   pero quien responde de que sea correcto y completo es el responsable del
   tratamiento, que tiene que revisarlo y asumirlo.
4. **Contrato de encargado de tratamiento con el proveedor de alojamiento.**
   El de las empresas colaboradoras ya se registra y bloquea la asignación sin
   él; el del hosting es un contrato que se firma fuera de la aplicación.
5. **Evaluación de impacto (art. 35)**: hay tratamiento a gran escala de datos
   de salud de personas vulnerables, así que es probable que sea exigible.
6. **Texto informativo real del art. 13.** La aplicación registra que se
   entregó y en qué versión; el contenido del documento que se entrega lo
   escribe la empresa con su asesoría, no el código.
