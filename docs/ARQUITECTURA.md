# Arquitectura — de IDENTIA a CUIDA

## 1. Qué se hereda de IDENTIA

IDENTIA aportaba una infraestructura de identificación y gestiones: personas,
identificadores permanentes, datos, gestiones, estados, documentos, usuarios,
roles, historial y auditoría. Esa base es lo que CUIDA reutiliza como
patrón, no como código compartido literal (no existe un repositorio IDENTIA
accesible en este espacio de trabajo, así que fase 1 reconstruye el patrón
descrito en el masterplan, no copia un código heredado):

- **Identidad permanente**: cada Persona, Profesional y Organización tiene
  un código estable e inmutable (`CUI-xxxxxx`, `PRO-xxxxx`, `ORG-xxxxx`) que
  sobrevive a cualquier modificación administrativa.
- **Usuarios, roles y multi-tenant**: separación clara entre "quién soy"
  (Usuario/rol) y "a quién represento o pertenezco" (Persona, Organización),
  aislado por organización desde el primer día.
- **Estados y transiciones controladas**: nada cambia de estado libremente;
  cada máquina de estados define sus transiciones válidas.
- **Historial y auditoría append-only**: ninguna operación administrativa
  destruye el pasado. `EstadoHistorial` registra cada transición y
  `AuditLog` registra cada acción sensible.

## 2. Qué añade CUIDA

IDENTIA organizaba identidad y documentación. CUIDA introduce una nueva
unidad de negocio: **la necesidad de una persona**, y la convierte en una
atención realizada mediante la cadena:

```
PERSONA → NECESIDAD → SOLICITUD → PLAN → SERVICIO → ASIGNACIÓN → VISITA → ACTUACIÓN → SEGUIMIENTO → CIERRE → HISTORIAL
```

Regla de diseño explícita del masterplan que gobierna todo el modelo de
datos: **PERSONA ≠ SOLICITUD ≠ SERVICIO ≠ VISITA**. Una persona puede tener
muchas solicitudes y servicios a lo largo del tiempo; cada uno conserva su
propio historial independiente.

## 3. Decisiones de esta fase 1

| Decisión | Razón |
|---|---|
| PostgreSQL + Prisma | Relacional, con transacciones y migraciones versionadas; encaja con la necesidad de trazabilidad y estados (sección 13 del masterplan). |
| Multi-tenant desde el inicio (`organizacionId` en cada entidad operativa) | El masterplan lo marca como requisito desde el origen si el destino es SaaS (sección 13), no como algo a añadir después. |
| Asignación manual (sin motor automático) | El masterplan es explícito: "El MVP debe realizar asignación manual. El motor automático se incorpora después" (sección 10). |
| Sin IA, sin pagos, sin matching automático | Son P2/P3 en el MVP (sección 12); fase 1 se centra en demostrar el ciclo cerrado necesidad→servicio→seguimiento. |
| RBAC por minimización, no solo por rol | La AEPD señala que ser profesional no da acceso por sí mismo a información confidencial (sección 4/14); el acceso a una Persona concreta requiere ser ella misma, un familiar autorizado no revocado, o pertenecer a su organización. |
| Sin interfaz de marca todavía | Decisión explícita del encargo: primero la base funcional/técnica, después la identidad visual. Las pantallas actuales son neutras (tipografía del sistema, grises y acentos de estado) para no anclar decisiones de marca prematuramente. |
| Observaciones de visita como texto libre, nunca diagnóstico | Separación explícita: "ayuda cotidiana ≠ diagnóstico sanitario" (sección 14). El cuidador registra una observación, no una historia clínica. |

## 4. Lo que falta antes de ser un producto real

Esto es un **prototipo conceptual**, tal y como pide el masterplan (secciones
1 y 21). Antes de cualquier operación real con datos de personas reales hay
que resolver, como mínimo:

- Validación jurídica del modelo de prestación/intermediación (SaaS B2B vs.
  marketplace/B2B2C), contratación y responsabilidades.
- Cumplimiento RGPD/AEPD completo: base jurídica para datos de salud si
  los hubiera, registro de actividades de tratamiento, evaluación de
  impacto si procede, gestión de brechas, contratos de encargado de
  tratamiento, MFA para perfiles sensibles, cifrado en reposo.
- Notificaciones reales (email/push/SMS) — actualmente solo existe el
  modelo de datos (`Notificacion`), sin proveedor conectado.
- Pagos y facturación.
- Motor de asignación automático (sección 10) una vez validado el manual.

## 5. Próximos pasos naturales

1. Definir la identidad de marca (naming ya fijado: **CUIDA**; falta
   sistema visual, tono, logotipo).
2. Consolidar el catálogo de necesidades con usuarios reales (fase 0-1 del
   roadmap del masterplan: investigación y entrevistas).
3. Ampliar P1 del MVP: documentos, pagos, portal familiar avanzado.
4. Piloto con una organización real de ayuda a domicilio (fase 9-11 del
   roadmap).
