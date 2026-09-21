# CUIDA — Plataforma de coordinación de ayuda y cuidados a domicilio

> De una infraestructura de identificación y gestiones (IDENTIA) a una
> plataforma capaz de transformar una necesidad humana en un servicio
> organizado, asignado, realizado, seguido y cerrado.

Este repositorio contiene la **fase 1** de CUIDA: prototipo conceptual
funcional y técnico, sin identidad de marca todavía (ver
[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) para el razonamiento completo
y el roadmap de próximas fases).

Caso fundador: *Herminia necesita ayuda para hacer la compra y compañía
durante varios días porque su familia estará fuera.* Todo el sistema —
modelo de datos, API y las cuatro interfaces por rol— está construido y
verificado para resolver este caso de extremo a extremo:
**PERSONA → NECESIDAD → SOLICITUD → SERVICIO → VISITA → ACTUACIÓN → SEGUIMIENTO → HISTORIAL**.

Prototipo conceptual: no introducir datos reales de personas. Antes de
cualquier explotación real hay que validar el modelo jurídico de
prestación/intermediación, protección de datos, contratación y
responsabilidades (ver sección 14 del masterplan y `docs/ARQUITECTURA.md`).

## Estructura

```
backend/    API (Node + TypeScript + Express + Prisma + PostgreSQL)
frontend/   React + TypeScript + Vite + Tailwind, journeys por rol
docs/       Arquitectura y evolución del proyecto
```

## Arrancar en local

Requisitos: Node 20+, PostgreSQL.

```bash
# 1. Instalar dependencias (monorepo con npm workspaces)
npm install

# 2. Backend: configurar base de datos y aplicar el esquema
cd backend
cp .env.example .env        # ajustar DATABASE_URL si hace falta
npx prisma migrate dev
npm run seed                # carga el caso Herminia de extremo a extremo
npm run dev                 # http://localhost:4000

# 3. Frontend (en otra terminal)
cd frontend
npm run dev                 # http://localhost:5173 (proxy a /api -> :4000)
```

## Cómo actualizar tras un cambio (pasos fijos, siempre en este orden)

Sigue esto cada vez que se avise de una actualización de la web:

1. **Parar los servidores** si están corriendo: en cada terminal (backend y
   frontend), pulsa `Ctrl + C`.
2. **Traer los cambios**, desde la raíz del proyecto:
   ```bash
   cd ~/ruta/a/CUIDA        # ajusta a tu carpeta real
   git pull
   ```
3. **Instalar dependencias** (no hace nada si no cambió ninguna):
   ```bash
   npm install
   ```
4. **Aplicar cambios en la base de datos** (no hace nada si no hay
   migraciones nuevas) y **recargar los datos de ejemplo**:
   ```bash
   cd backend
   npx prisma migrate dev
   npm run seed
   ```
5. **Arrancar el backend** (déjalo corriendo en esta terminal):
   ```bash
   npm run dev              # http://localhost:4000
   ```
6. **En otra terminal, arrancar el frontend**:
   ```bash
   cd ~/ruta/a/CUIDA/frontend
   npm run dev               # http://localhost:5173
   ```
7. **En el navegador**: recarga forzando la caché (`Cmd + Shift + R` en
   Mac) en `http://localhost:5173` para asegurarte de que no ves una
   versión antigua guardada, y vuelve a entrar con un usuario de demo.

Si el paso 4 (`npx prisma migrate dev`) da un error de permisos o de
conexión, revisa que Postgres.app esté abierto antes de continuar.

### Usuarios de demo (tras `npm run seed`)

Contraseña para todos: `cuida2026`

| Email | Rol |
|---|---|
| `herminia@cuida.demo` | Persona atendida |
| `hija.herminia@cuida.demo` | Familiar autorizado |
| `carmen.profesional@cuida.demo` | Profesional |
| `coordinadora@cuida.demo` | Coordinadora de organización |

## Qué incluye esta fase 1

- **Modelo de datos completo** (`backend/prisma/schema.prisma`): identidad
  permanente heredada del patrón IDENTIA (Persona, Organización, roles,
  auditoría) + la cadena funcional propia de CUIDA (Necesidad, Solicitud,
  Plan, Servicio, Visita, Tarea, Actuación, Incidencia), multi-tenant desde
  el origen.
- **Máquinas de estado** de Solicitud, Servicio, Visita e Incidencia
  (`backend/src/services/estados.ts`), con historial de solo-inserción de
  cada transición.
- **Auth + RBAC** por actor (Persona, Familiar, Profesional, Coordinador,
  Organización, Admin, Superadmin), con minimización de acceso: un familiar
  solo ve lo que su relación autoriza; un coordinador solo su organización.
- **Auditoría** de accesos y acciones (`AuditLog`), append-only.
- **API REST P0** que cubre el MVP definido en el masterplan (sección 12):
  personas, familiares, catálogo de necesidades, solicitudes, planificación,
  asignación manual, agenda, visitas, tareas, observaciones, incidencias,
  notificaciones e historial.
- **Cuatro interfaces funcionales** (sin diseño de marca aún): Persona,
  Familia, Profesional y Organización/Coordinador, que recorren el caso
  Herminia de principio a fin.
- **Seed** que reproduce el caso Herminia completo como dato de demostración.

## Qué queda deliberadamente fuera (siguientes fases, ver roadmap del masterplan)

Pagos, matching automático, IA, API pública, white label, motor de
notificaciones real (email/SMS/push) e identidad de marca. Fase 1 se centra
en demostrar que la cadena funcional completa —no solo una agenda— funciona
de extremo a extremo con permisos y trazabilidad reales.
