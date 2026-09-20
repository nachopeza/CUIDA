import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { registrarHistorial } from "../services/estados.js";

// Caso fundador del masterplan (sección 3): Herminia necesita ayuda para
// hacer la compra y compañía durante varios días porque su familia estará
// fuera. Este seed recorre la cadena completa una vez para dejar el sistema
// en un estado demostrable de extremo a extremo. Prototipo conceptual: sin
// datos reales sensibles (sección 21).

const DEMO_PASSWORD = "cuida2026";

async function crearUsuario(email: string, rol: "PERSONA" | "FAMILIAR" | "PROFESIONAL" | "COORDINADOR" | "ORGANIZACION" | "ADMIN", extra: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.usuario.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, rol, ...extra },
  });
}

async function main() {
  console.log("Sembrando caso fundador Herminia...");

  // 1. Organización piloto
  const orgCodigo = await generarCodigo("organizacion");
  const organizacion = await prisma.organizacion.upsert({
    where: { codigo: orgCodigo },
    update: {},
    create: { codigo: orgCodigo, nombre: "Ayuda a Domicilio Piloto", estado: "ACTIVA" },
  });

  // 2. Catálogo de necesidades (sección 6)
  const catalogo = [
    { codigo: "compra", nombre: "Ayuda con la compra", descripcion: "Realizar o acompañar la compra semanal" },
    { codigo: "acompanamiento", nombre: "Acompañamiento", descripcion: "Acompañar a citas, paseos o gestiones" },
    { codigo: "compania", nombre: "Compañía", descripcion: "Compañía y apoyo cotidiano en el domicilio" },
    { codigo: "tareas_domesticas", nombre: "Tareas domésticas", descripcion: "Apoyo en tareas del hogar" },
    { codigo: "comida", nombre: "Comida", descripcion: "Preparación o apoyo con la comida" },
    { codigo: "recados", nombre: "Recados", descripcion: "Gestión de recados puntuales" },
    { codigo: "paseo", nombre: "Paseo", descripcion: "Paseo y actividad física acompañada" },
    { codigo: "citas", nombre: "Citas médicas", descripcion: "Acompañamiento a citas médicas" },
    { codigo: "apoyo_puntual", nombre: "Apoyo puntual", descripcion: "Apoyo puntual no recurrente" },
  ];
  for (const n of catalogo) {
    await prisma.necesidadCatalogo.upsert({ where: { codigo: n.codigo }, update: {}, create: n });
  }
  const necesidadCompra = await prisma.necesidadCatalogo.findUniqueOrThrow({ where: { codigo: "compra" } });

  // 3. Coordinador de la organización
  const coordinador = await crearUsuario("coordinadora@cuida.demo", "COORDINADOR", { organizacionId: organizacion.id });

  // 4. Persona: Herminia
  const codigoPersona = await generarCodigo("persona");
  const herminia = await prisma.persona.upsert({
    where: { codigo: codigoPersona },
    update: {},
    create: {
      codigo: codigoPersona,
      nombre: "Herminia",
      apellidos: "Ruiz Campos",
      direccion: "Domicilio particular (demo)",
      preferencias: "Prefiere visitas por la mañana",
      estado: "ACTIVA",
      organizacionId: organizacion.id,
    },
  });

  const usuarioHerminia = await crearUsuario("herminia@cuida.demo", "PERSONA", {
    organizacionId: organizacion.id,
    personaId: herminia.id,
  });

  // 5. Familiar autorizado
  const usuarioFamiliar = await crearUsuario("hija.herminia@cuida.demo", "FAMILIAR", { organizacionId: organizacion.id });
  await prisma.familiarRelacion.upsert({
    where: { personaId_usuarioId: { personaId: herminia.id, usuarioId: usuarioFamiliar.id } },
    update: {},
    create: {
      personaId: herminia.id,
      usuarioId: usuarioFamiliar.id,
      parentesco: "Hija",
      esRepresentante: true,
      puedeSolicitar: true,
      puedeVerHistorial: true,
    },
  });

  // 6. Profesional
  const codigoProfesional = await generarCodigo("profesional");
  const profesional = await prisma.profesional.upsert({
    where: { codigo: codigoProfesional },
    update: {},
    create: {
      codigo: codigoProfesional,
      nombre: "Carmen",
      apellidos: "López Vidal",
      zona: "Centro",
      estado: "ACTIVO",
      organizacionId: organizacion.id,
    },
  });
  await crearUsuario("carmen.profesional@cuida.demo", "PROFESIONAL", {
    organizacionId: organizacion.id,
    profesionalId: profesional.id,
  });

  // 7. Necesidad → Solicitud (sección 3, etapas 1-2)
  const codigoSolicitud = await generarCodigo("solicitud");
  let solicitud = await prisma.solicitud.upsert({
    where: { codigo: codigoSolicitud },
    update: {},
    create: {
      codigo: codigoSolicitud,
      descripcionLibre:
        "Necesito que alguien venga de lunes a viernes por las mañanas durante 10 días. Necesito compañía y que me ayude con la compra y la comida.",
      necesidadId: necesidadCompra.id,
      personaId: herminia.id,
      organizacionId: organizacion.id,
      creadaPorUsuarioId: usuarioFamiliar.id,
      estado: "BORRADOR",
    },
  });
  await registrarHistorial({
    entidadTipo: "Solicitud",
    estadoAnterior: "BORRADOR",
    estadoNuevo: "BORRADOR",
    motivo: "Creación (seed)",
    solicitudId: solicitud.id,
  });

  // 8. Plan (etapa 3): fechas + horas + tareas → Servicio definido
  const fechaInicio = new Date();
  const fechaFin = new Date(fechaInicio);
  fechaFin.setDate(fechaFin.getDate() + 10);
  await prisma.plan.upsert({
    where: { solicitudId: solicitud.id },
    update: {},
    create: {
      solicitudId: solicitud.id,
      fechaInicio,
      fechaFin,
      recurrencia: "Lunes a viernes",
      franjaHoraria: "Mañanas",
      tareasPrevistas: "Compra semanal, preparar comida, compañía",
      notas: "Familia ausente durante el periodo",
    },
  });

  // 9. Recorrido de estados de la solicitud hasta ACEPTADA (etapas 2-5)
  const secuenciaSolicitud: Array<{ estado: "ENVIADA" | "EN_REVISION" | "BUSCANDO" | "PROPUESTA" | "ACEPTADA"; motivo: string }> = [
    { estado: "ENVIADA", motivo: "Familia confirma la petición" },
    { estado: "EN_REVISION", motivo: "Coordinadora revisa la solicitud" },
    { estado: "BUSCANDO", motivo: "Buscando profesional disponible en zona Centro" },
    { estado: "PROPUESTA", motivo: "Propuesta de Carmen López Vidal" },
    { estado: "ACEPTADA", motivo: "Persona y familia aceptan la propuesta" },
  ];
  for (const paso of secuenciaSolicitud) {
    const anterior = solicitud.estado;
    solicitud = await prisma.solicitud.update({ where: { id: solicitud.id }, data: { estado: paso.estado } });
    await registrarHistorial({
      entidadTipo: "Solicitud",
      estadoAnterior: anterior,
      estadoNuevo: paso.estado,
      motivo: paso.motivo,
      solicitudId: solicitud.id,
    });
  }

  // 10. Solicitud → Servicio (etapa "Operación")
  const codigoServicio = await generarCodigo("servicio");
  let servicio = await prisma.servicio.upsert({
    where: { solicitudId: solicitud.id },
    update: {},
    create: { codigo: codigoServicio, solicitudId: solicitud.id, organizacionId: organizacion.id, estado: "PENDIENTE" },
  });

  // 11. Asignación (etapa 4) y confirmación (etapa 5)
  servicio = await prisma.servicio.update({
    where: { id: servicio.id },
    data: { estado: "ASIGNADO", profesionalId: profesional.id },
  });
  await registrarHistorial({
    entidadTipo: "Servicio",
    estadoAnterior: "PENDIENTE",
    estadoNuevo: "ASIGNADO",
    motivo: `Asignado a ${profesional.codigo}`,
    servicioId: servicio.id,
  });

  servicio = await prisma.servicio.update({ where: { id: servicio.id }, data: { estado: "CONFIRMADO" } });
  await registrarHistorial({
    entidadTipo: "Servicio",
    estadoAnterior: "ASIGNADO",
    estadoNuevo: "CONFIRMADO",
    motivo: "Persona/familia/proveedor confirman el servicio",
    servicioId: servicio.id,
  });

  // 12. Primera visita (etapa 6: Ejecución)
  const codigoVisita = await generarCodigo("visita");
  const visita = await prisma.visita.upsert({
    where: { codigo: codigoVisita },
    update: {},
    create: {
      codigo: codigoVisita,
      fecha: fechaInicio,
      horaInicioProg: "09:00",
      horaFinProg: "12:00",
      servicioId: servicio.id,
      estado: "PROGRAMADA",
      tareas: {
        create: [{ descripcion: "Realizar la compra semanal" }, { descripcion: "Preparar la comida" }, { descripcion: "Hacer compañía" }],
      },
    },
    include: { tareas: true },
  });

  await prisma.visita.update({ where: { id: visita.id }, data: { estado: "EN_CURSO", horaInicioReal: new Date() } });
  await registrarHistorial({ entidadTipo: "Visita", estadoAnterior: "PROGRAMADA", estadoNuevo: "EN_CURSO", visitaId: visita.id });

  await prisma.tarea.updateMany({ where: { visitaId: visita.id }, data: { completada: true } });
  await prisma.actuacion.create({
    data: { visitaId: visita.id, descripcion: "Compra realizada y comida preparada. Herminia se encuentra bien y contenta con la compañía." },
  });

  await prisma.visita.update({ where: { id: visita.id }, data: { estado: "FINALIZADA", horaFinReal: new Date() } });
  await registrarHistorial({ entidadTipo: "Visita", estadoAnterior: "EN_CURSO", estadoNuevo: "FINALIZADA", visitaId: visita.id });

  await prisma.servicio.update({ where: { id: servicio.id }, data: { estado: "EN_CURSO" } });
  await registrarHistorial({
    entidadTipo: "Servicio",
    estadoAnterior: "CONFIRMADO",
    estadoNuevo: "EN_CURSO",
    motivo: "Primera visita completada; servicio en curso durante los 10 días planificados",
    servicioId: servicio.id,
  });

  // 13. Notificación de seguimiento para la familia (etapa 7)
  await prisma.notificacion.create({
    data: {
      usuarioId: usuarioFamiliar.id,
      tipo: "seguimiento_visita",
      mensaje: `Visita ${visita.codigo} finalizada: compra y comida realizadas, Herminia bien.`,
    },
  });

  console.log("\nSeed completado. Cadena PERSONA → NECESIDAD → SOLICITUD → SERVICIO → VISITA → ACTUACIÓN → SEGUIMIENTO creada.");
  console.log(`Organización: ${organizacion.codigo} · Persona: ${herminia.codigo} · Solicitud: ${solicitud.codigo} · Servicio: ${servicio.codigo} · Visita: ${visita.codigo}`);
  console.log("\nUsuarios demo (contraseña para todos: cuida2026):");
  console.log(`  Coordinadora   coordinadora@cuida.demo`);
  console.log(`  Persona        herminia@cuida.demo`);
  console.log(`  Familiar       hija.herminia@cuida.demo`);
  console.log(`  Profesional    carmen.profesional@cuida.demo`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
