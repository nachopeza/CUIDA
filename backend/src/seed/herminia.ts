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

const NOMBRE_ORG_DEMO = "Ayuda a Domicilio Piloto";

// El seed debe poder relanzarse sin ir acumulando organizaciones duplicadas
// (los códigos CUI-/ORG-/... se generan por conteo, así que un upsert por
// código nunca encontraría el registro anterior). En vez de eso, limpiamos
// primero cualquier resto del mismo caso de demostración.
async function limpiarDemoAnterior() {
  const orgsExistentes = await prisma.organizacion.findMany({ where: { nombre: NOMBRE_ORG_DEMO } });
  for (const org of orgsExistentes) {
    await limpiarOrganizacion(org.id);
  }
}

async function limpiarOrganizacion(organizacionId: string) {

  const visitaIds = (await prisma.visita.findMany({ where: { servicio: { organizacionId } }, select: { id: true } })).map((v) => v.id);
  const servicioIds = (await prisma.servicio.findMany({ where: { organizacionId }, select: { id: true } })).map((s) => s.id);
  const solicitudIds = (await prisma.solicitud.findMany({ where: { organizacionId }, select: { id: true } })).map((s) => s.id);
  const personaIds = (await prisma.persona.findMany({ where: { organizacionId }, select: { id: true } })).map((p) => p.id);
  const profesionalIds = (await prisma.profesional.findMany({ where: { organizacionId }, select: { id: true } })).map((p) => p.id);
  const usuarioIds = (await prisma.usuario.findMany({ where: { organizacionId }, select: { id: true } })).map((u) => u.id);

  await prisma.auditLog.deleteMany({ where: { organizacionId } });
  await prisma.notificacion.deleteMany({ where: { usuarioId: { in: usuarioIds } } });
  await prisma.estadoHistorial.deleteMany({
    where: { OR: [{ solicitudId: { in: solicitudIds } }, { servicioId: { in: servicioIds } }, { visitaId: { in: visitaIds } }] },
  });
  await prisma.actuacion.deleteMany({ where: { visitaId: { in: visitaIds } } });
  await prisma.tarea.deleteMany({ where: { visitaId: { in: visitaIds } } });
  await prisma.incidencia.deleteMany({ where: { OR: [{ visitaId: { in: visitaIds } }, { servicioId: { in: servicioIds } }] } });
  await prisma.documento.deleteMany({
    where: { OR: [{ personaId: { in: personaIds } }, { servicioId: { in: servicioIds } }, { visitaId: { in: visitaIds } }, { profesionalId: { in: profesionalIds } }] },
  });
  await prisma.mensaje.deleteMany({ where: { personaId: { in: personaIds } } });
  await prisma.servicioInteres.deleteMany({ where: { servicioId: { in: servicioIds } } });
  await prisma.visita.deleteMany({ where: { id: { in: visitaIds } } });
  await prisma.plan.deleteMany({ where: { solicitudId: { in: solicitudIds } } });
  await prisma.factura.deleteMany({ where: { personaId: { in: personaIds } } });
  await prisma.servicio.deleteMany({ where: { id: { in: servicioIds } } });
  await prisma.solicitud.deleteMany({ where: { id: { in: solicitudIds } } });
  // Por personaId y también por usuarioId: si una ejecución anterior (antes
  // de esta limpieza existir) dejó relaciones cruzadas con otra organización
  // duplicada, igual bloquearían el borrado del usuario más abajo.
  await prisma.familiarRelacion.deleteMany({ where: { OR: [{ personaId: { in: personaIds } }, { usuarioId: { in: usuarioIds } }] } });
  // Los usuarios PERSONA/PROFESIONAL enlazan 1:1 con Persona/Profesional;
  // hay que desenlazarlos antes de poder borrar esas fichas.
  await prisma.usuario.updateMany({ where: { id: { in: usuarioIds } }, data: { personaId: null, profesionalId: null } });
  await prisma.persona.deleteMany({ where: { id: { in: personaIds } } });
  await prisma.profesional.deleteMany({ where: { organizacionId } });
  await prisma.empresaColaboradora.deleteMany({ where: { organizacionId } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
  await prisma.organizacion.delete({ where: { id: organizacionId } });
}

async function main() {
  console.log("Sembrando caso fundador Herminia...");

  await limpiarDemoAnterior();

  // 1. Organización piloto
  const orgCodigo = await generarCodigo("organizacion");
  const organizacion = await prisma.organizacion.create({
    data: { codigo: orgCodigo, nombre: NOMBRE_ORG_DEMO, estado: "ACTIVA" },
  });

  // 2. Catálogo de servicios (sección "Servicios son lo que ofrecemos:
  // acompañamiento, comidas, limpieza etc."): antes repartido entre
  // "necesidades" (cómo lo pide la persona) y un catálogo aparte solo para
  // el IVA de facturación — ahora es uno solo, cada uno con su % de IVA
  // (4% superreducido por defecto; 10% cuando es contratación particular
  // sin ayuda pública ni plaza concertada).
  const catalogo = [
    { codigo: "compra", nombre: "Ayuda con la compra", descripcion: "Realizar o acompañar la compra semanal", ivaPorcentaje: 4, precioBase: 12 },
    { codigo: "acompanamiento", nombre: "Acompañamiento", descripcion: "Acompañar a citas, paseos o gestiones", ivaPorcentaje: 10, precioBase: 15 },
    { codigo: "compania", nombre: "Compañía", descripcion: "Compañía y apoyo cotidiano en el domicilio", ivaPorcentaje: 4, precioBase: 10 },
    { codigo: "tareas_domesticas", nombre: "Tareas domésticas", descripcion: "Apoyo en tareas del hogar", ivaPorcentaje: 4, precioBase: 12 },
    { codigo: "comida", nombre: "Comida", descripcion: "Preparación o apoyo con la comida", ivaPorcentaje: 4, precioBase: 10 },
    { codigo: "recados", nombre: "Recados", descripcion: "Gestión de recados puntuales", ivaPorcentaje: 4, precioBase: 8 },
    { codigo: "paseo", nombre: "Paseo", descripcion: "Paseo y actividad física acompañada", ivaPorcentaje: 4, precioBase: 10 },
    { codigo: "citas", nombre: "Citas médicas", descripcion: "Acompañamiento a citas médicas", ivaPorcentaje: 4, precioBase: 12 },
    { codigo: "apoyo_puntual", nombre: "Apoyo puntual", descripcion: "Apoyo puntual no recurrente", ivaPorcentaje: 10, precioBase: 15 },
  ];
  for (const n of catalogo) {
    await prisma.necesidadCatalogo.upsert({ where: { codigo: n.codigo }, update: { ivaPorcentaje: n.ivaPorcentaje, precioBase: n.precioBase }, create: n });
  }
  const necesidadCompra = await prisma.necesidadCatalogo.findUniqueOrThrow({ where: { codigo: "compra" } });

  // 3. Coordinador de la organización
  const coordinador = await crearUsuario("coordinadora@cuida.demo", "COORDINADOR", { nombre: "Coordinación", organizacionId: organizacion.id });

  // 4. Persona: Herminia
  const codigoPersona = await generarCodigo("persona");
  const herminia = await prisma.persona.upsert({
    where: { codigo: codigoPersona },
    update: {},
    create: {
      codigo: codigoPersona,
      nombre: "Herminia",
      apellidos: "Ruiz Campos",
      telefono: "600 111 222",
      direccion: "Domicilio particular (demo)",
      preferencias: "Prefiere visitas por la mañana",
      medicacion: "Enalapril 10mg (mañana), Omeprazol 20mg (antes de comer)",
      medico: "Dr. Alonso — Centro de Salud Sant Fruitós",
      contactos: "Hija (representante): hija.herminia@cuida.demo — 600 333 444",
      recomendaciones: "Le cuesta oír bien de una oreja, hablar de frente y despacio",
      estado: "ACTIVA",
      organizacionId: organizacion.id,
    },
  });

  const usuarioHerminia = await crearUsuario("herminia@cuida.demo", "PERSONA", {
    nombre: "Herminia Ruiz Campos",
    organizacionId: organizacion.id,
    personaId: herminia.id,
  });

  // 5. Familiar autorizado
  const usuarioFamiliar = await crearUsuario("hija.herminia@cuida.demo", "FAMILIAR", { nombre: "Isabel Ruiz", organizacionId: organizacion.id });
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

  // 5b. Empresa colaboradora de ejemplo (sección 11: modelo híbrido).
  // No se subcontrata el caso de Herminia (se resuelve con Carmen, plantilla
  // interna); esta empresa solo sirve para poblar el catálogo del coordinador.
  const codigoEmpresa = await generarCodigo("empresaColaboradora");
  await prisma.empresaColaboradora.upsert({
    where: { codigo: codigoEmpresa },
    update: {},
    create: {
      codigo: codigoEmpresa,
      nombre: "Cuidados del Bages S.L.",
      contacto: "coordinacion@cuidadosdelbages.demo",
      cif: "B12345678",
      direccion: "Calle Mayor 12, Sant Fruitós",
      numeroCuenta: "ES00 0000 0000 0000 0000 0000",
      estado: "ACTIVA",
      organizacionId: organizacion.id,
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
      telefono: "600 555 666",
      zona: "Centro",
      dni: "12345678A",
      numeroCuenta: "ES00 1111 1111 1111 1111 1111",
      bizum: "600 555 666",
      foto: "https://i.pravatar.cc/300?img=47",
      biografia:
        "Auxiliar de ayuda a domicilio con 8 años de experiencia en atención a personas mayores. Certificado profesional en Atención Sociosanitaria a Personas Dependientes en el Domicilio. Especializada en movilidad reducida y acompañamiento. Habla catalán, castellano e inglés básico. \"Me gusta que las personas a las que cuido se sientan como en familia.\"",
      estado: "ACTIVO",
      organizacionId: organizacion.id,
    },
  });
  await crearUsuario("carmen.profesional@cuida.demo", "PROFESIONAL", {
    nombre: "Carmen López Vidal",
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

  // 11b. Tarifa estimada por la coordinadora: visible para la coordinadora y
  // para la hija (puedeVerImportes=true por defecto), nunca para Herminia.
  servicio = await prisma.servicio.update({
    where: { id: servicio.id },
    data: {
      tarifaImporte: 12.5,
      tarifaTipo: "PAGADO",
      tarifaNotas: "Tarifa estándar de servicio doméstico por hora",
      // Comisión de gestión (15% por defecto de la organización): mismo
      // cálculo que hace POST /servicios/:id/tarifa.
      comisionImporte: 1.88,
      importeProfesional: 10.62,
      // IVA (mismo cálculo que hace POST /servicios/:id/tarifa): plaza
      // concertada → 4% superreducido.
      ivaPorcentaje: 4,
      ivaImporte: 0.5,
      totalConIva: 13.0,
    },
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

  // 12b. Chat de ejemplo entre Herminia y Carmen (sección Usuario: "chat con
  // la profesional... estilo WhatsApp"), una única conversación por persona
  // y profesional, no una por cada servicio.
  await prisma.mensaje.create({
    data: { personaId: herminia.id, profesionalId: profesional.id, autorUsuarioId: usuarioFamiliar.id, texto: "Hola Carmen, gracias por venir hoy. ¿Todo bien con mi madre?" },
  });
  const usuarioCarmen = await prisma.usuario.findUnique({ where: { email: "carmen.profesional@cuida.demo" } });
  if (usuarioCarmen) {
    await prisma.mensaje.create({
      data: {
        personaId: herminia.id,
        profesionalId: profesional.id,
        autorUsuarioId: usuarioCarmen.id,
        texto: "¡Hola! Sí, todo perfecto. Hemos hecho la compra y está comiendo tranquila.",
      },
    });
  }

  // 14. Más solicitudes de ejemplo, cada una en un estado distinto, para que
  // el panel de coordinación se pueda probar sin tener que ir creando cada
  // caso a mano (sección "creas más solicitudes... una que esté por
  // verificar, una que no tenga asociado a alguien, una a la espera de que
  // llegue el día, una terminada, una con una incidencia, y otra con
  // alguna otra función").
  const necesidadTareas = await prisma.necesidadCatalogo.findUniqueOrThrow({ where: { codigo: "tareas_domesticas" } });
  const necesidadPaseo = await prisma.necesidadCatalogo.findUniqueOrThrow({ where: { codigo: "paseo" } });
  const necesidadCitas = await prisma.necesidadCatalogo.findUniqueOrThrow({ where: { codigo: "citas" } });
  const necesidadRecados = await prisma.necesidadCatalogo.findUniqueOrThrow({ where: { codigo: "recados" } });
  const necesidadAcompanamiento = await prisma.necesidadCatalogo.findUniqueOrThrow({ where: { codigo: "acompanamiento" } });

  function fechaEn(dias: number): Date {
    const f = new Date();
    f.setDate(f.getDate() + dias);
    return f;
  }

  // 14a. Sin profesional asignado todavía: publicada, visible en "Buscar
  // solicitudes" para los profesionales y en el grupo "Gestión".
  const solicitud2 = await prisma.solicitud.create({
    data: {
      codigo: await generarCodigo("solicitud"),
      descripcionLibre: "Necesito que alguien limpie la casa el viernes por la tarde.",
      necesidadId: necesidadTareas.id,
      personaId: herminia.id,
      organizacionId: organizacion.id,
      creadaPorUsuarioId: usuarioHerminia.id,
      estado: "ACEPTADA",
    },
  });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: "BORRADOR", estadoNuevo: "ACEPTADA", motivo: "Aceptada por coordinación (seed)", solicitudId: solicitud2.id });
  await prisma.plan.create({
    data: { solicitudId: solicitud2.id, fechaInicio: fechaEn(3), fechaFin: fechaEn(3), franjaHoraria: "Tarde" },
  });
  const servicio2 = await prisma.servicio.create({
    data: { codigo: await generarCodigo("servicio"), solicitudId: solicitud2.id, organizacionId: organizacion.id, estado: "PENDIENTE", tipoServicio: "PUNTUAL" },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "PENDIENTE", motivo: "Publicado, buscando profesional (seed)", servicioId: servicio2.id });

  // 14b. Confirmada y con profesional, esperando a que llegue el día.
  const solicitud3 = await prisma.solicitud.create({
    data: {
      codigo: await generarCodigo("solicitud"),
      descripcionLibre: "Necesito compañía para dar un paseo la semana que viene.",
      necesidadId: necesidadPaseo.id,
      personaId: herminia.id,
      organizacionId: organizacion.id,
      creadaPorUsuarioId: usuarioHerminia.id,
      estado: "ACEPTADA",
    },
  });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: "BORRADOR", estadoNuevo: "ACEPTADA", motivo: "Aceptada por coordinación (seed)", solicitudId: solicitud3.id });
  await prisma.plan.create({
    data: { solicitudId: solicitud3.id, fechaInicio: fechaEn(5), fechaFin: fechaEn(5), franjaHoraria: "Tarde", horaInicio: "17:00", horaFin: "18:00" },
  });
  const servicio3 = await prisma.servicio.create({
    data: {
      codigo: await generarCodigo("servicio"),
      solicitudId: solicitud3.id,
      organizacionId: organizacion.id,
      estado: "CONFIRMADO",
      tipoServicio: "PUNTUAL",
      profesionalId: profesional.id,
      tarifaImporte: 15,
      tarifaTipo: "PAGADO",
      comisionImporte: 2.25,
      importeProfesional: 12.75,
    },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "CONFIRMADO", motivo: `Asignado a ${profesional.codigo} y confirmado (seed)`, servicioId: servicio3.id });
  await prisma.visita.create({
    data: {
      codigo: await generarCodigo("visita"),
      fecha: fechaEn(5),
      horaInicioProg: "17:00",
      horaFinProg: "18:00",
      servicioId: servicio3.id,
      estado: "PROGRAMADA",
      tareas: { create: [{ descripcion: "Paseo por el barrio" }] },
    },
  });

  // 14c. Terminada de verdad (VALIDADO), con visita verificada y factura
  // generada — para probar Facturación con datos ya cargados.
  const solicitud4 = await prisma.solicitud.create({
    data: {
      codigo: await generarCodigo("solicitud"),
      descripcionLibre: "Necesito acompañamiento a una cita médica.",
      necesidadId: necesidadCitas.id,
      personaId: herminia.id,
      organizacionId: organizacion.id,
      creadaPorUsuarioId: usuarioHerminia.id,
      estado: "ACEPTADA",
    },
  });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: "BORRADOR", estadoNuevo: "ACEPTADA", motivo: "Aceptada por coordinación (seed)", solicitudId: solicitud4.id });
  await prisma.plan.create({
    data: { solicitudId: solicitud4.id, fechaInicio: fechaEn(-4), fechaFin: fechaEn(-4), franjaHoraria: "Mañana" },
  });
  const servicio4 = await prisma.servicio.create({
    data: {
      codigo: await generarCodigo("servicio"),
      solicitudId: solicitud4.id,
      organizacionId: organizacion.id,
      estado: "VALIDADO",
      tipoServicio: "PUNTUAL",
      profesionalId: profesional.id,
      tarifaImporte: 45,
      tarifaTipo: "PAGADO",
      comisionImporte: 6.75,
      importeProfesional: 38.25,
      ivaPorcentaje: 10,
      ivaImporte: 4.5,
      totalConIva: 49.5,
    },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "EN_CURSO", motivo: "Asignado, confirmado y realizado (seed)", servicioId: servicio4.id });
  const visita4 = await prisma.visita.create({
    data: {
      codigo: await generarCodigo("visita"),
      fecha: fechaEn(-4),
      horaInicioProg: "10:00",
      horaFinProg: "12:00",
      horaInicioReal: fechaEn(-4),
      horaFinReal: fechaEn(-4),
      servicioId: servicio4.id,
      estado: "REVISADA",
      tareas: { create: [{ descripcion: "Acompañar a la cita", completada: true }] },
    },
  });
  await registrarHistorial({ entidadTipo: "Visita", estadoAnterior: "FINALIZADA", estadoNuevo: "REVISADA", motivo: "Verificada con la familia (seed)", visitaId: visita4.id });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "EN_CURSO", estadoNuevo: "VALIDADO", motivo: "Todas las visitas verificadas con la familia (seed)", servicioId: servicio4.id });
  const factura = await prisma.factura.create({
    data: {
      codigo: await generarCodigo("factura"),
      mes: new Date().toISOString().slice(0, 7),
      importeTotal: 45,
      ivaTotal: 4.5,
      totalConIva: 49.5,
      comisionTotal: 6.75,
      importeProfesionales: 38.25,
      organizacionId: organizacion.id,
      personaId: herminia.id,
      servicios: { connect: [{ id: servicio4.id }] },
    },
  });

  // 14d. Con una incidencia abierta.
  const solicitud5 = await prisma.solicitud.create({
    data: {
      codigo: await generarCodigo("solicitud"),
      descripcionLibre: "Necesito ayuda con unos recados esta semana.",
      necesidadId: necesidadRecados.id,
      personaId: herminia.id,
      organizacionId: organizacion.id,
      creadaPorUsuarioId: usuarioHerminia.id,
      estado: "ACEPTADA",
    },
  });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: "BORRADOR", estadoNuevo: "ACEPTADA", motivo: "Aceptada por coordinación (seed)", solicitudId: solicitud5.id });
  await prisma.plan.create({ data: { solicitudId: solicitud5.id, fechaInicio: fechaEn(0), fechaFin: fechaEn(0), franjaHoraria: "Mañana" } });
  const servicio5 = await prisma.servicio.create({
    data: {
      codigo: await generarCodigo("servicio"),
      solicitudId: solicitud5.id,
      organizacionId: organizacion.id,
      estado: "EN_CURSO",
      tipoServicio: "PUNTUAL",
      profesionalId: profesional.id,
      tarifaImporte: 10,
      tarifaTipo: "PAGADO",
      comisionImporte: 1.5,
      importeProfesional: 8.5,
    },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "EN_CURSO", motivo: "Asignado, confirmado y en curso (seed)", servicioId: servicio5.id });
  const incidencia5 = await prisma.incidencia.create({
    data: {
      codigo: await generarCodigo("incidencia"),
      tipo: "GENERAL",
      servicioId: servicio5.id,
      descripcion: "La profesional no encuentra las llaves de repuesto para entrar.",
      prioridad: "ALTA",
      estado: "NUEVA",
    },
  });
  await registrarHistorial({ entidadTipo: "Incidencia", estadoAnterior: "NUEVA", estadoNuevo: "NUEVA", motivo: "Creación (seed)", incidenciaId: incidencia5.id });

  // 14e. Servicio recurrente e indefinido, pedido por la hija para su madre
  // (sección "si necesita a alguien para indefinido"): una visita ya
  // verificada y otra programada — el servicio sigue EN_CURSO porque, al
  // ser RECURRENTE, verificar una visita no lo cierra automáticamente.
  const solicitud6 = await prisma.solicitud.create({
    data: {
      codigo: await generarCodigo("solicitud"),
      descripcionLibre: "Necesito que todos los días de 9 a 13 venga una persona a acompañar a mi madre.",
      necesidadId: necesidadAcompanamiento.id,
      personaId: herminia.id,
      organizacionId: organizacion.id,
      creadaPorUsuarioId: usuarioFamiliar.id,
      estado: "ACEPTADA",
    },
  });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: "BORRADOR", estadoNuevo: "ACEPTADA", motivo: "Aceptada por coordinación (seed)", solicitudId: solicitud6.id });
  await prisma.plan.create({
    data: {
      solicitudId: solicitud6.id,
      fechaInicio: fechaEn(-1),
      fechaFin: null,
      recurrencia: "Todos los días",
      franjaHoraria: "Mañana",
      horaInicio: "09:00",
      horaFin: "13:00",
      notas: "Indefinido, hasta nuevo aviso",
    },
  });
  const servicio6 = await prisma.servicio.create({
    data: {
      codigo: await generarCodigo("servicio"),
      solicitudId: solicitud6.id,
      organizacionId: organizacion.id,
      estado: "EN_CURSO",
      tipoServicio: "RECURRENTE",
      profesionalId: profesional.id,
      tarifaImporte: 40,
      tarifaTipo: "PAGADO",
      comisionImporte: 6,
      importeProfesional: 34,
    },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "EN_CURSO", motivo: "Contrato recurrente confirmado (seed)", servicioId: servicio6.id });
  const visita6ayer = await prisma.visita.create({
    data: {
      codigo: await generarCodigo("visita"),
      fecha: fechaEn(-1),
      horaInicioProg: "09:00",
      horaFinProg: "13:00",
      servicioId: servicio6.id,
      estado: "REVISADA",
      tareas: { create: [{ descripcion: "Acompañamiento diario", completada: true }] },
    },
  });
  await registrarHistorial({ entidadTipo: "Visita", estadoAnterior: "FINALIZADA", estadoNuevo: "REVISADA", motivo: "Verificada con la familia (seed)", visitaId: visita6ayer.id });
  await prisma.visita.create({
    data: {
      codigo: await generarCodigo("visita"),
      fecha: fechaEn(0),
      horaInicioProg: "09:00",
      horaFinProg: "13:00",
      servicioId: servicio6.id,
      estado: "PROGRAMADA",
      tareas: { create: [{ descripcion: "Acompañamiento diario" }] },
    },
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
  console.log("\nSolicitudes adicionales de ejemplo (todos los estados del panel):");
  console.log(`  ${solicitud.codigo}  Por verificar (EN_CURSO, visita finalizada sin revisar)`);
  console.log(`  ${solicitud2.codigo}  Sin profesional (Gestión / disponible en el marketplace)`);
  console.log(`  ${solicitud3.codigo}  En proceso, esperando el día (CONFIRMADO)`);
  console.log(`  ${solicitud4.codigo}  Finalizada (VALIDADO) con factura ${factura.codigo} generada`);
  console.log(`  ${solicitud5.codigo}  Con incidencia abierta (${incidencia5.codigo})`);
  console.log(`  ${solicitud6.codigo}  Recurrente e indefinida (acompañamiento diario)`);
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
