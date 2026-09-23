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
3. **Registro de actividades de tratamiento** formal (art. 30) firmado por el
   responsable: este documento es su borrador, no su sustituto.
4. **Contratos de encargado de tratamiento** (art. 28) con el proveedor de
   alojamiento y con cualquier empresa colaboradora que acceda a datos.
5. **Evaluación de impacto (art. 35)**: hay tratamiento a gran escala de datos
   de salud de personas vulnerables, así que es probable que sea exigible.
6. **Información y consentimiento** en el alta: hoy la aplicación no recoge ni
   registra la entrega de la información del art. 13.
