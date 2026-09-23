import "dotenv/config";
import bcrypt from "bcryptjs";
import { liquidarVisita } from "../services/visitaEconomia.js";
import { guardar } from "../services/almacen.js";
import { pdfDeUnaPagina } from "./pdfDemo.js";
import { randomUUID } from "node:crypto";
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
  // El `update` no puede quedar vacío: si una siembra anterior dejó la cuenta
  // colgando de otra organización, un upsert que no toca nada la deja apuntando
  // al resto viejo y el usuario entra a una demo fantasma.
  return prisma.usuario.upsert({
    where: { email },
    update: { passwordHash, rol, ...extra },
    create: { email, passwordHash, rol, ...extra },
  });
}

// Marca de tiempo real de una jornada. Antes el seed ponía `new Date()` como
// hora de entrada y de salida, así que todas las visitas "trabajadas" salían
// a 0,0 h y la facturación por horas no se podía probar.
// Mismo reparto que hace el backend al fijar el precio: el seed no inventa
// importes, los calcula, para que lo que se ve en pantalla cuadre siempre.
function tarifaPorHora(precioHora: number, minutos: number, ivaPorcentaje: number, comisionPorcentaje = 15) {
  const base = Math.round((minutos / 60) * precioHora * 100) / 100;
  const comisionImporte = Math.round(base * (comisionPorcentaje / 100) * 100) / 100;
  const ivaImporte = Math.round(base * (ivaPorcentaje / 100) * 100) / 100;
  return {
    precioHora,
    minutosPrevistos: minutos,
    comisionPorcentaje,
    tarifaImporte: base,
    comisionImporte,
    importeProfesional: Math.round((base - comisionImporte) * 100) / 100,
    ivaPorcentaje,
    ivaImporte,
    totalConIva: Math.round((base + ivaImporte) * 100) / 100,
  };
}

function enHora(fecha: Date, hora: string): Date {
  const [h, m] = hora.split(":").map(Number);
  const d = new Date(fecha);
  d.setHours(h, m, 0, 0);
  return d;
}

const NOMBRE_ORG_DEMO = "CUIDA Cantabria";
const CORREO_DEMO = "@cuida.demo";

// El seed debe poder relanzarse sin ir acumulando organizaciones duplicadas
// (los códigos CUI-/ORG-/... se generan por conteo, así que un upsert por
// código nunca encontraría el registro anterior). En vez de eso, limpiamos
// primero cualquier resto del mismo caso de demostración.
async function limpiarDemoAnterior() {
  const ids = new Set<string>();
  for (const org of await prisma.organizacion.findMany({ where: { nombre: NOMBRE_ORG_DEMO } })) {
    ids.add(org.id);
  }
  // El nombre de la organización se edita desde el panel de empresa, así que el
  // seed no se puede reconocer solo por él: en cuanto alguien lo cambia, la
  // siembra siguiente crea una organización nueva y deja la anterior viva con
  // las cuentas colgando de ella. Cualquier organización a la que pertenezca
  // una cuenta @cuida.demo es, por definición, un resto de la demostración.
  const cuentasDemo = await prisma.usuario.findMany({
    where: { email: { endsWith: CORREO_DEMO } },
    select: { organizacionId: true },
  });
  for (const cuenta of cuentasDemo) {
    if (cuenta.organizacionId) ids.add(cuenta.organizacionId);
  }
  for (const id of ids) {
    await limpiarOrganizacion(id);
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
  // Cobro y pago, y lo que cuelga de ellos. El orden importa: primero las
  // líneas, después su cabecera, y la remesa antes que las facturas que
  // apunta.
  await prisma.lineaLiquidacion.deleteMany({ where: { liquidacion: { profesionalId: { in: profesionalIds } } } });
  await prisma.liquidacion.deleteMany({ where: { profesionalId: { in: profesionalIds } } });
  await prisma.registroJornada.deleteMany({ where: { profesionalId: { in: profesionalIds } } });
  await prisma.ausencia.deleteMany({ where: { profesionalId: { in: profesionalIds } } });
  await prisma.lineaFactura.deleteMany({ where: { factura: { personaId: { in: personaIds } } } });
  await prisma.factura.updateMany({ where: { personaId: { in: personaIds } }, data: { remesaId: null, mandatoSepaId: null } });
  await prisma.remesa.deleteMany({ where: { organizacionId } });
  await prisma.mandatoSepa.deleteMany({ where: { datosFacturacion: { personaId: { in: personaIds } } } });
  await prisma.datosFacturacion.deleteMany({ where: { personaId: { in: personaIds } } });
  await prisma.correccionFichaje.deleteMany({ where: { visitaId: { in: visitaIds } } });
  await prisma.documento.deleteMany({ where: { profesional: { organizacionId } } });
  await prisma.archivo.deleteMany({ where: { organizacionId } });
  await prisma.tarifa.deleteMany({ where: { organizacionId } });
  await prisma.reglasNegocio.deleteMany({ where: { organizacionId } });
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
    data: {
      codigo: orgCodigo,
      nombre: NOMBRE_ORG_DEMO,
      estado: "ACTIVA",
      // Identidad fiscal de quien emite: sin esto una factura no se puede
      // entregar a nadie. Datos de demostración, no de una empresa real.
      razonSocial: "CUIDA Servicios a Domicilio S.L.",
      cif: "B12345678",
      direccionFiscal: "Calle Mayor 14, 2º",
      codigoPostal: "39001",
      municipio: "Santander",
      provincia: "Cantabria",
      telefono: "942 000 000",
      emailFacturacion: "facturacion@cuida.demo",
      serieFactura: "A",
      ibanCobro: "ES9121000418450200051332",
      identificadorAcreedor: "ES12ZZZB12345678",
      bicCobro: "CAIXESBBXXX",
      // La ficha completa de la empresa: lo que sale impreso en cada factura y
      // lo que hace falta para operar como entidad de servicios sociales.
      formaJuridica: "Sociedad Limitada",
      web: "https://cuida.example",
      registroMercantil: "Registro Mercantil de Cantabria",
      registroTomo: "412",
      registroFolio: "88",
      registroHoja: "S-9021",
      cnae: "8810 - Actividades de servicios sociales sin alojamiento para personas mayores",
      epigrafeIae: "952 - Asistencia y servicios sociales para niños, jóvenes, disminuidos y ancianos",
      ivaPorDefecto: 10,
      diasVencimiento: 30,
      seguroAseguradora: "Mutua Cántabra de Seguros",
      seguroPoliza: "RC-2026-004471",
      seguroCobertura: 600000,
      // Vence dentro de cinco meses: ni caducada ni en el aviso de sesenta
      // días, para que la demo arranque sin alarmas falsas.
      seguroVencimiento: fechaEn(150),
      registroEntidadesNumero: "E-CANT-0472",
      registroEntidadesOrgano: "Consejería de Inclusión Social del Gobierno de Cantabria",
    },
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
  const empresaBages = await prisma.empresaColaboradora.upsert({
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
      comunidad: "CB",
      municipio: "Santander",
      zona: "Centro",
      carneConducir: "B",
      vehiculoPropio: false,
      titulacion: "ATENCION_SOCIOSANITARIA",
      dni: "12345678A",
      numeroCuenta: "ES00 1111 1111 1111 1111 1111",
      bizum: "600 555 666",
      foto: "https://i.pravatar.cc/300?img=47",
      biografia:
        "Auxiliar de ayuda a domicilio con 8 años de experiencia en atención a personas mayores. Certificado profesional en Atención Sociosanitaria a Personas Dependientes en el Domicilio. Especializada en movilidad reducida y acompañamiento. Habla catalán, castellano e inglés básico. \"Me gusta que las personas a las que cuido se sientan como en familia.\"",
      disponibilidad: JSON.stringify({ dias: ["L", "M", "X", "J", "V"], franja: "Mañana" }),
      estado: "ACTIVO",
      organizacionId: organizacion.id,
    },
  });
  await crearUsuario("carmen.profesional@cuida.demo", "PROFESIONAL", {
    nombre: "Carmen López Vidal",
    organizacionId: organizacion.id,
    profesionalId: profesional.id,
  });

  // 6b. Más profesionales, para que la plantilla no sea una sola persona.
  // Con un único profesional no se puede probar nada de lo que de verdad hace
  // coordinación: elegir entre candidatos, repartir por zona, sustituir a
  // quien se pone enfermo o verificar a quien acaba de darse de alta.
  async function crearProfesional(datos: {
    nombre: string;
    apellidos: string;
    telefono: string;
    municipio: string;
    zona?: string;
    carneConducir?: "NO" | "B" | "A" | "C" | "D";
    vehiculoPropio?: boolean;
    titulacion?: "SIN_TITULACION" | "ATENCION_SOCIOSANITARIA" | "AUXILIAR_ENFERMERIA" | "ENFERMERIA" | "TRABAJO_SOCIAL" | "FISIOTERAPIA" | "TERAPIA_OCUPACIONAL" | "PSICOLOGIA" | "OTRA";
    foto: string;
    biografia: string;
    dias: string[];
    franja: string;
    estado: "PENDIENTE" | "VERIFICADO" | "ACTIVO" | "SUSPENDIDO" | "INACTIVO";
    email?: string;
    empresaColaboradoraId?: string;
  }) {
    const profesional = await prisma.profesional.create({
      data: {
        codigo: await generarCodigo("profesional"),
        nombre: datos.nombre,
        apellidos: datos.apellidos,
        telefono: datos.telefono,
        comunidad: "CB",
        municipio: datos.municipio,
        zona: datos.zona,
        carneConducir: datos.carneConducir ?? "NO",
        vehiculoPropio: datos.vehiculoPropio ?? false,
        titulacion: datos.titulacion,
        foto: datos.foto,
        biografia: datos.biografia,
        disponibilidad: JSON.stringify({ dias: datos.dias, franja: datos.franja }),
        estado: datos.estado,
        organizacionId: organizacion.id,
        empresaColaboradoraId: datos.empresaColaboradoraId,
      },
    });
    if (datos.email) {
      await crearUsuario(datos.email, "PROFESIONAL", {
        nombre: `${datos.nombre} ${datos.apellidos}`,
        organizacionId: organizacion.id,
        profesionalId: profesional.id,
      });
    }
    return profesional;
  }

  const rosa = await crearProfesional({
    nombre: "Rosa",
    apellidos: "Martín Peña",
    telefono: "600 777 888",
    municipio: "Torrelavega",
    carneConducir: "B",
    vehiculoPropio: true,
    titulacion: "AUXILIAR_ENFERMERIA",
    foto: "https://i.pravatar.cc/300?img=32",
    biografia:
      "Doce años en atención domiciliaria, los seis últimos en Cuidados del Bages. Formación en demencias y Alzheimer, y en manejo de grúas y transferencias. Trabaja tardes y fines de semana.",
    dias: ["J", "V", "S", "D"],
    franja: "Tarde",
    estado: "ACTIVO",
    email: "rosa.profesional@cuida.demo",
    empresaColaboradoraId: empresaBages.id,
  });

  const javier = await crearProfesional({
    nombre: "Javier",
    apellidos: "Ortega Ruiz",
    telefono: "600 999 000",
    municipio: "Camargo",
    carneConducir: "B",
    vehiculoPropio: true,
    titulacion: "AUXILIAR_ENFERMERIA",
    foto: "https://i.pravatar.cc/300?img=12",
    biografia:
      "Técnico en cuidados auxiliares de enfermería. Acostumbrado a acompañamientos a consultas y pruebas médicas, y al control de medicación pautada. Coche propio.",
    dias: ["L", "M", "X", "J", "V"],
    franja: "Mañana",
    estado: "ACTIVO",
    email: "javier.profesional@cuida.demo",
  });

  // Recién dada de alta: aparece en el aviso "profesionales por verificar"
  // del escritorio hasta que coordinación revisa su documentación.
  await crearProfesional({
    nombre: "Nadia",
    apellidos: "Bouzid",
    telefono: "600 222 333",
    municipio: "Santander",
    zona: "Puertochico",
    carneConducir: "NO",
    titulacion: "ATENCION_SOCIOSANITARIA",
    foto: "https://i.pravatar.cc/300?img=45",
    biografia: "Recién titulada en Atención Sociosanitaria. Prácticas en residencia de mayores. Busca empezar con acompañamientos y tareas domésticas.",
    dias: ["L", "M", "X"],
    franja: "Tarde",
    estado: "PENDIENTE",
    email: "nadia.profesional@cuida.demo",
  });

  // 6c. Más personas atendidas, cada una con su situación: la lista de
  // usuarios con una sola persona no enseña nada.
  async function crearPersona(datos: {
    nombre: string;
    apellidos: string;
    telefono: string;
    direccion: string;
    preferencias: string;
    recomendaciones: string;
    email: string;
    familiar?: { email: string; nombre: string; parentesco: string };
  }) {
    const persona = await prisma.persona.create({
      data: {
        codigo: await generarCodigo("persona"),
        nombre: datos.nombre,
        apellidos: datos.apellidos,
        telefono: datos.telefono,
        direccion: datos.direccion,
        preferencias: datos.preferencias,
        recomendaciones: datos.recomendaciones,
        estado: "ACTIVA",
        organizacionId: organizacion.id,
      },
    });
    const usuario = await crearUsuario(datos.email, "PERSONA", {
      nombre: `${datos.nombre} ${datos.apellidos}`,
      organizacionId: organizacion.id,
      personaId: persona.id,
    });
    let usuarioFam = null;
    if (datos.familiar) {
      usuarioFam = await crearUsuario(datos.familiar.email, "FAMILIAR", { nombre: datos.familiar.nombre, organizacionId: organizacion.id });
      await prisma.familiarRelacion.create({
        data: {
          personaId: persona.id,
          usuarioId: usuarioFam.id,
          parentesco: datos.familiar.parentesco,
          esRepresentante: true,
          puedeSolicitar: true,
          puedeVerHistorial: true,
        },
      });
    }
    return { persona, usuario, usuarioFamiliar: usuarioFam };
  }

  const manuel = await crearPersona({
    nombre: "Manuel",
    apellidos: "Prats Soler",
    telefono: "600 444 555",
    direccion: "Domicilio particular (demo) — Zona Norte",
    preferencias: "Prefiere las tardes; ve la televisión a las 20:00 y no quiere que le interrumpan",
    recomendaciones: "Camina con andador. No dejar alfombras sueltas en el pasillo",
    email: "manuel@cuida.demo",
    familiar: { email: "hijo.manuel@cuida.demo", nombre: "Jordi Prats", parentesco: "Hijo" },
  });

  const dolores = await crearPersona({
    nombre: "Dolores",
    apellidos: "Aguirre Vega",
    telefono: "600 666 777",
    direccion: "Domicilio particular (demo) — Zona Sur",
    preferencias: "Mañanas temprano. Le gusta que le lean el periódico",
    recomendaciones: "Diabética: cuidado con la merienda. Tiene un perro muy ladrador pero inofensivo",
    email: "dolores@cuida.demo",
    familiar: { email: "hija.dolores@cuida.demo", nombre: "Marta Aguirre", parentesco: "Hija" },
  });

  // Vive solo y sin familia cerca: gestiona él mismo sus solicitudes. Es el
  // caso que prueba que el sistema no da por hecho que siempre hay un
  // familiar detrás.
  const amadeo = await crearPersona({
    nombre: "Amadeo",
    apellidos: "Costa Riera",
    telefono: "600 888 999",
    direccion: "Domicilio particular (demo) — Centro",
    preferencias: "Le da apuro pedir ayuda; conviene confirmarle las visitas por teléfono el día antes",
    recomendaciones: "Vive solo, sin familia en la zona. Oye bien pero lee con dificultad",
    email: "amadeo@cuida.demo",
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
      tarifaTipo: "PAGADO",
      tarifaNotas: "Tarifa estándar de servicio doméstico",
      // 3 h a 12,50 €/h, IVA superreducido por plaza concertada.
      ...tarifaPorHora(12.5, 180, 4),
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
      // Sello de quién la hizo: sin él, la jornada no aparecía al filtrar
      // por profesional.
      profesionalId: profesional.id,
      estado: "PROGRAMADA",
      tareas: {
        create: [{ descripcion: "Realizar la compra semanal" }, { descripcion: "Preparar la comida" }, { descripcion: "Hacer compañía" }],
      },
    },
    include: { tareas: true },
  });

  await prisma.visita.update({ where: { id: visita.id }, data: { estado: "EN_CURSO", horaInicioReal: enHora(fechaInicio, "09:05") } });
  await registrarHistorial({ entidadTipo: "Visita", estadoAnterior: "PROGRAMADA", estadoNuevo: "EN_CURSO", visitaId: visita.id });

  await prisma.tarea.updateMany({ where: { visitaId: visita.id }, data: { completada: true } });
  await prisma.actuacion.create({
    data: { visitaId: visita.id, descripcion: "Compra realizada y comida preparada. Herminia se encuentra bien y contenta con la compañía." },
  });

  await prisma.visita.update({ where: { id: visita.id }, data: { estado: "FINALIZADA", horaFinReal: enHora(fechaInicio, "12:10") } });
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
  // Quién abre cada incidencia: casi siempre la profesional que está en casa,
  // porque es quien lo ve. La ficha lo enseña para saber a quién preguntar.
  const usuarioRosa = await prisma.usuario.findUnique({ where: { email: "rosa.profesional@cuida.demo" } });
  const usuarioJavier = await prisma.usuario.findUnique({ where: { email: "javier.profesional@cuida.demo" } });
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
      tarifaTipo: "PAGADO",
      ...tarifaPorHora(15, 60, 10),
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
      profesionalId: profesional.id,
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
      tarifaTipo: "PAGADO",
      ...tarifaPorHora(22.5, 120, 10),
    },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "EN_CURSO", motivo: "Asignado, confirmado y realizado (seed)", servicioId: servicio4.id });
  const visita4 = await prisma.visita.create({
    data: {
      codigo: await generarCodigo("visita"),
      fecha: fechaEn(-4),
      horaInicioProg: "10:00",
      horaFinProg: "12:00",
      horaInicioReal: enHora(fechaEn(-4), "10:00"),
      horaFinReal: enHora(fechaEn(-4), "12:15"),
      servicioId: servicio4.id,
      profesionalId: profesional.id,
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
      tarifaTipo: "PAGADO",
      ...tarifaPorHora(10, 120, 10),
    },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "EN_CURSO", motivo: "Asignado, confirmado y en curso (seed)", servicioId: servicio5.id });
  const incidencia5 = await prisma.incidencia.create({
    data: {
      codigo: await generarCodigo("incidencia"),
      tipo: "GENERAL",
      motivo: "ACCESO",
      servicioId: servicio5.id,
      descripcion: "La profesional no encuentra las llaves de repuesto para entrar.",
      prioridad: "ALTA",
      estado: "NUEVA",
      creadoPorUsuarioId: usuarioCarmen?.id,
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
      tarifaTipo: "PAGADO",
      ...tarifaPorHora(10, 240, 10),
    },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "EN_CURSO", motivo: "Contrato recurrente confirmado (seed)", servicioId: servicio6.id });
  const visita6ayer = await prisma.visita.create({
    data: {
      codigo: await generarCodigo("visita"),
      fecha: fechaEn(-1),
      horaInicioProg: "09:00",
      horaFinProg: "13:00",
      horaInicioReal: enHora(fechaEn(-1), "09:00"),
      horaFinReal: enHora(fechaEn(-1), "13:20"),
      servicioId: servicio6.id,
      profesionalId: profesional.id,
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
      profesionalId: profesional.id,
      estado: "PROGRAMADA",
      tareas: { create: [{ descripcion: "Acompañamiento diario" }] },
    },
  });

  // 14f. Casos de las otras personas, repartidos entre los profesionales:
  // así los listados enseñan de verdad diferencias — distintas personas,
  // distintas zonas, distintos profesionales y distintos estados — en vez de
  // seis filas con el mismo nombre.

  // Manuel: recurrente de tardes con Rosa, ya rodado, con una jornada
  // trabajada la semana pasada y la siguiente en la agenda.
  const solicitudManuel = await prisma.solicitud.create({
    data: {
      codigo: await generarCodigo("solicitud"),
      descripcionLibre: "Mi padre necesita compañía por las tardes, de jueves a domingo.",
      necesidadId: necesidadAcompanamiento.id,
      personaId: manuel.persona.id,
      organizacionId: organizacion.id,
      creadaPorUsuarioId: manuel.usuarioFamiliar!.id,
      estado: "ACEPTADA",
    },
  });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: "BORRADOR", estadoNuevo: "ACEPTADA", motivo: "Aceptada por coordinación (seed)", solicitudId: solicitudManuel.id });
  await prisma.plan.create({
    data: {
      solicitudId: solicitudManuel.id,
      fechaInicio: fechaEn(-14),
      fechaFin: null,
      recurrencia: "J, V, S, D",
      franjaHoraria: "Tarde",
      horaInicio: "17:00",
      horaFin: "20:00",
      notas: "Indefinido",
    },
  });
  const servicioManuel = await prisma.servicio.create({
    data: {
      codigo: await generarCodigo("servicio"),
      solicitudId: solicitudManuel.id,
      organizacionId: organizacion.id,
      estado: "EN_CURSO",
      tipoServicio: "RECURRENTE",
      profesionalId: rosa.id,
      tarifaTipo: "PAGADO",
      ...tarifaPorHora(14, 180, 10),
    },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "EN_CURSO", motivo: "Contrato recurrente de tardes con Rosa (seed)", servicioId: servicioManuel.id });
  const visitaManuel = await prisma.visita.create({
    data: {
      codigo: await generarCodigo("visita"),
      fecha: fechaEn(-3),
      horaInicioProg: "17:00",
      horaFinProg: "20:00",
      horaInicioReal: enHora(fechaEn(-3), "17:00"),
      horaFinReal: enHora(fechaEn(-3), "20:00"),
      servicioId: servicioManuel.id,
      profesionalId: rosa.id,
      estado: "REVISADA",
      tareas: { create: [{ descripcion: "Compañía y merienda", completada: true }] },
    },
  });
  await registrarHistorial({ entidadTipo: "Visita", estadoAnterior: "FINALIZADA", estadoNuevo: "REVISADA", motivo: "Verificada con el hijo (seed)", visitaId: visitaManuel.id });
  await prisma.visita.create({
    data: {
      codigo: await generarCodigo("visita"),
      fecha: fechaEn(1),
      horaInicioProg: "17:00",
      horaFinProg: "20:00",
      servicioId: servicioManuel.id,
      profesionalId: rosa.id,
      estado: "PROGRAMADA",
      tareas: { create: [{ descripcion: "Compañía y merienda" }] },
    },
  });

  // Dolores: acompañamiento a consulta con Javier, cerrado la semana pasada
  // pero con la jornada todavía por verificar — es el caso que llega a
  // coordinación esperando el visto bueno.
  const solicitudDolores = await prisma.solicitud.create({
    data: {
      codigo: await generarCodigo("solicitud"),
      descripcionLibre: "Necesito que alguien acompañe a mi madre al oftalmólogo, no ve para ir sola.",
      necesidadId: necesidadCitas.id,
      personaId: dolores.persona.id,
      organizacionId: organizacion.id,
      creadaPorUsuarioId: dolores.usuarioFamiliar!.id,
      estado: "ACEPTADA",
    },
  });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: "BORRADOR", estadoNuevo: "ACEPTADA", motivo: "Aceptada por coordinación (seed)", solicitudId: solicitudDolores.id });
  await prisma.plan.create({
    data: { solicitudId: solicitudDolores.id, fechaInicio: fechaEn(-2), fechaFin: fechaEn(-2), franjaHoraria: "Mañana", horaInicio: "09:30", horaFin: "12:00" },
  });
  const servicioDolores = await prisma.servicio.create({
    data: {
      codigo: await generarCodigo("servicio"),
      solicitudId: solicitudDolores.id,
      organizacionId: organizacion.id,
      estado: "EN_CURSO",
      tipoServicio: "PUNTUAL",
      profesionalId: javier.id,
      tarifaTipo: "PAGADO",
      ...tarifaPorHora(15.2, 150, 10),
    },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "EN_CURSO", motivo: "Asignado a Javier y realizado (seed)", servicioId: servicioDolores.id });
  await prisma.visita.create({
    data: {
      codigo: await generarCodigo("visita"),
      fecha: fechaEn(-2),
      horaInicioProg: "09:30",
      horaFinProg: "12:00",
      horaInicioReal: enHora(fechaEn(-2), "09:25"),
      horaFinReal: enHora(fechaEn(-2), "12:40"),
      servicioId: servicioDolores.id,
      profesionalId: javier.id,
      estado: "FINALIZADA",
      tareas: { create: [{ descripcion: "Acompañar al oftalmólogo", completada: true }] },
      actuaciones: { create: [{ descripcion: "La consulta se retrasó cuarenta minutos. Todo bien, le han cambiado la graduación." }] },
    },
  });

  // Amadeo: lo pide él mismo y todavía no tiene a nadie asignado — aparece
  // en el marketplace para los profesionales, con Javier ya interesado.
  const solicitudAmadeo = await prisma.solicitud.create({
    data: {
      codigo: await generarCodigo("solicitud"),
      descripcionLibre: "Necesitaría que alguien me ayudara con la compra los lunes, se me hace cuesta arriba.",
      necesidadId: necesidadRecados.id,
      personaId: amadeo.persona.id,
      organizacionId: organizacion.id,
      creadaPorUsuarioId: amadeo.usuario.id,
      estado: "ACEPTADA",
    },
  });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: "BORRADOR", estadoNuevo: "ACEPTADA", motivo: "Aceptada por coordinación (seed)", solicitudId: solicitudAmadeo.id });
  await prisma.plan.create({
    data: { solicitudId: solicitudAmadeo.id, fechaInicio: fechaEn(2), fechaFin: null, recurrencia: "Lunes", franjaHoraria: "Mañana", horaInicio: "10:00", horaFin: "12:00" },
  });
  const servicioAmadeo = await prisma.servicio.create({
    data: {
      codigo: await generarCodigo("servicio"),
      solicitudId: solicitudAmadeo.id,
      organizacionId: organizacion.id,
      estado: "PENDIENTE",
      tipoServicio: "RECURRENTE",
      tarifaTipo: "PAGADO",
      ...tarifaPorHora(12, 120, 10),
    },
  });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: "PENDIENTE", estadoNuevo: "PENDIENTE", motivo: "Publicado, buscando profesional (seed)", servicioId: servicioAmadeo.id });
  await prisma.servicioInteres.create({
    data: { servicioId: servicioAmadeo.id, profesionalId: javier.id, mensaje: "Me pilla de camino y tengo coche, puedo llevarle la compra a casa." },
  });

  // Amadeo, segunda: recién enviada, sin revisar todavía por coordinación.
  const solicitudNueva = await prisma.solicitud.create({
    data: {
      codigo: await generarCodigo("solicitud"),
      descripcionLibre: "También me vendría bien que alguien me acompañara a dar un paseo alguna tarde.",
      necesidadId: necesidadPaseo.id,
      personaId: amadeo.persona.id,
      organizacionId: organizacion.id,
      creadaPorUsuarioId: amadeo.usuario.id,
      estado: "ENVIADA",
    },
  });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: "BORRADOR", estadoNuevo: "ENVIADA", motivo: "Enviada por la persona (seed)", solicitudId: solicitudNueva.id });
  await prisma.plan.create({
    data: { solicitudId: solicitudNueva.id, fechaInicio: fechaEn(7), fechaFin: fechaEn(7), franjaHoraria: "Tarde", horaInicio: "18:00", horaFin: "19:30" },
  });

  // Una incidencia ya resuelta, para que la bandeja no sea solo cosas
  // ardiendo y se pueda probar el filtro por estado y por motivo.
  const incidenciaResuelta = await prisma.incidencia.create({
    data: {
      codigo: await generarCodigo("incidencia"),
      tipo: "GENERAL",
      motivo: "RETRASO",
      servicioId: servicioDolores.id,
      descripcion: "La consulta se retrasó casi una hora y la jornada se alargó más de lo previsto.",
      prioridad: "BAJA",
      estado: "RESUELTA",
      creadoPorUsuarioId: usuarioJavier?.id,
    },
  });
  await registrarHistorial({ entidadTipo: "Incidencia", estadoAnterior: "NUEVA", estadoNuevo: "RESUELTA", motivo: "Hablado con la hija: conforme con las horas de más (seed)", incidenciaId: incidenciaResuelta.id });

  const incidenciaSalud = await prisma.incidencia.create({
    data: {
      codigo: await generarCodigo("incidencia"),
      tipo: "GENERAL",
      motivo: "SALUD",
      servicioId: servicioManuel.id,
      descripcion: "Manuel ha tenido un mareo al levantarse del sofá. No se ha caído, pero conviene avisar al médico.",
      prioridad: "ALTA",
      estado: "EN_REVISION",
      creadoPorUsuarioId: usuarioRosa?.id,
    },
  });
  await registrarHistorial({ entidadTipo: "Incidencia", estadoAnterior: "NUEVA", estadoNuevo: "EN_REVISION", motivo: "Avisado el hijo; pendiente de hablar con el centro de salud (seed)", incidenciaId: incidenciaSalud.id });

  // 13. Notificación de seguimiento para la familia (etapa 7)
  await prisma.notificacion.create({
    data: {
      usuarioId: usuarioFamiliar.id,
      tipo: "seguimiento_visita",
      mensaje: `Visita ${visita.codigo} finalizada: compra y comida realizadas, Herminia bien.`,
      // Sin referencia la notificación no llevaba a ninguna parte: se
      // pinchaba y no pasaba nada.
      entidadTipo: "Solicitud",
      entidadId: solicitud.id,
    },
  });

  // 14. Cobro y pago: a quién se factura, con qué cuenta y cómo trabaja cada
  // profesional. Sin esto el módulo de facturación arranca vacío y no se
  // puede ver funcionando.
  const clientes = [
    { personaId: herminia.id, titular: "Isabel Ruiz Campos", nif: "20304050K", iban: "ES7921000813610123456789", email: "hija.herminia@cuida.demo", parentesco: "la hija" },
    { personaId: manuel.persona.id, titular: "Manuel Prats Soler", nif: "13579246B", iban: "ES6000491500051234567892", email: "manuel@cuida.demo", parentesco: "él mismo" },
    { personaId: dolores.persona.id, titular: "Carmen Aguirre Vega", nif: "86420975N", iban: "ES1000492352082414205416", email: "hija.dolores@cuida.demo", parentesco: "la hija" },
  ];
  for (const cliente of clientes) {
    const datos = await prisma.datosFacturacion.create({
      data: {
        personaId: cliente.personaId,
        titular: cliente.titular,
        nif: cliente.nif,
        direccionFiscal: "Domicilio particular (demo)",
        codigoPostal: "39001",
        municipio: "Santander",
        provincia: "Cantabria",
        email: cliente.email,
        formaPago: "DOMICILIACION",
        diaCobro: 5,
        notas: `Paga ${cliente.parentesco}`,
      },
    });
    await prisma.mandatoSepa.create({
      data: {
        referencia: await generarCodigo("mandato"),
        datosFacturacionId: datos.id,
        titular: cliente.titular,
        iban: cliente.iban,
        fechaFirma: fechaEn(-60),
      },
    });
  }

  // Amadeo paga por transferencia: sirve para ver que no todo se domicilia y
  // que la remesa lo deja fuera.
  await prisma.datosFacturacion.create({
    data: {
      personaId: amadeo.persona.id,
      titular: "Amadeo Costa Riera",
      nif: "45678912C",
      direccionFiscal: "Domicilio particular (demo) — Centro",
      codigoPostal: "39002",
      municipio: "Santander",
      provincia: "Cantabria",
      formaPago: "TRANSFERENCIA",
      diasVencimiento: 15,
      notas: "Prefiere pagar por transferencia, sin domiciliar",
    },
  });

  // Plantilla mixta: dos en nómina y dos autónomas, que es como está montada
  // casi cualquier empresa del sector.
  await prisma.profesional.update({ where: { id: profesional.id }, data: { tipoRelacion: "LABORAL", horasSemanales: 30 } });
  await prisma.profesional.update({ where: { id: rosa.id }, data: { tipoRelacion: "LABORAL", horasSemanales: 20 } });
  await prisma.profesional.update({ where: { id: javier.id }, data: { tipoRelacion: "AUTONOMO", irpfPorcentaje: 15 } });

  // 15. Expedientes de personal. Tres situaciones distintas a propósito: una
  // en regla, otra con el certificado a punto de caducar y otra a la que le
  // falta — que es la que no debería poder entrar en ninguna casa.
  const expedientes = [
    {
      profesional,
      contrato: { tipoContrato: "INDEFINIDO" as const, fechaAlta: fechaEn(-900), categoria: "Auxiliar de ayuda a domicilio" },
      documentos: [
        { tipo: "DNI" as const, nombre: "DNI 12345678A", fechaEmision: fechaEn(-1200), fechaCaducidad: fechaEn(1500) },
        { tipo: "DELITOS_SEXUALES" as const, nombre: "Certificación negativa del Registro Central", fechaEmision: fechaEn(-200), fechaCaducidad: fechaEn(165) },
        { tipo: "TITULACION" as const, nombre: "Certificado de Atención Sociosanitaria a Personas Dependientes", fechaEmision: fechaEn(-1800), fechaCaducidad: null },
        { tipo: "CONTRATO" as const, nombre: "Contrato indefinido a tiempo parcial (30 h)", fechaEmision: fechaEn(-900), fechaCaducidad: null },
        { tipo: "ALTA_SEGURIDAD_SOCIAL" as const, nombre: "Alta en el régimen general", fechaEmision: fechaEn(-900), fechaCaducidad: null },
      ],
    },
    {
      profesional: rosa,
      contrato: { tipoContrato: "TEMPORAL" as const, fechaAlta: fechaEn(-300), categoria: "Auxiliar de ayuda a domicilio" },
      documentos: [
        { tipo: "DNI" as const, nombre: "DNI 87654321B", fechaEmision: fechaEn(-800), fechaCaducidad: fechaEn(900) },
        // Caduca dentro de tres semanas: debe salir como aviso, no como
        // impedimento — todavía puede trabajar.
        { tipo: "DELITOS_SEXUALES" as const, nombre: "Certificación negativa del Registro Central", fechaEmision: fechaEn(-345), fechaCaducidad: fechaEn(20) },
        { tipo: "CONTRATO" as const, nombre: "Contrato temporal a tiempo parcial (20 h)", fechaEmision: fechaEn(-300), fechaCaducidad: fechaEn(65) },
      ],
    },
    {
      profesional: javier,
      contrato: { tipoContrato: "MERCANTIL" as const, fechaAlta: fechaEn(-150), categoria: "Acompañamiento y transporte" },
      documentos: [
        { tipo: "DNI" as const, nombre: "DNI 11223344C", fechaEmision: fechaEn(-600), fechaCaducidad: fechaEn(1100) },
        { tipo: "CARNE_CONDUCIR" as const, nombre: "Permiso B", fechaEmision: fechaEn(-1500), fechaCaducidad: fechaEn(400) },
        // A Javier le falta el certificado de delitos sexuales: el sistema
        // debe impedir que se le asigne a nadie hasta que lo aporte.
      ],
    },
  ];

  // Cada documento del expediente lleva su PDF de verdad en el almacén: un
  // documento obligatorio sin fichero cuenta como que falta, así que sin esto
  // la demo saldría con toda la plantilla bloqueada.
  const cuentaCoordinacion = await prisma.usuario.findFirstOrThrow({ where: { email: "coordinadora@cuida.demo" } });
  let pdfsGenerados = 0;
  for (const expediente of expedientes) {
    await prisma.profesional.update({ where: { id: expediente.profesional.id }, data: expediente.contrato });
    for (const doc of expediente.documentos) {
      const idArchivo = randomUUID();
      const pdf = pdfDeUnaPagina(doc.nombre, [
        `${expediente.profesional.nombre} ${expediente.profesional.apellidos}`,
        doc.fechaEmision ? `Emitido el ${doc.fechaEmision.toLocaleDateString("es-ES")}` : "Sin fecha de emisión",
        doc.fechaCaducidad ? `Válido hasta el ${doc.fechaCaducidad.toLocaleDateString("es-ES")}` : "Sin caducidad",
        "",
        "Documento de ejemplo generado por el seed de CUIDA.",
      ]);
      const guardado = await guardar(pdf, organizacion.id, idArchivo);
      await prisma.archivo.create({
        data: {
          id: idArchivo,
          nombre: `${doc.nombre}.pdf`,
          tipoMime: guardado.tipoMime,
          bytes: guardado.bytes,
          hash: guardado.hash,
          ruta: guardado.ruta,
          organizacionId: organizacion.id,
          subidoPorId: cuentaCoordinacion.id,
        },
      });
      pdfsGenerados += 1;

      await prisma.documento.create({
        data: {
          profesionalId: expediente.profesional.id,
          tipo: doc.tipo,
          nombre: doc.nombre,
          archivoId: idArchivo,
          url: "",
          fechaEmision: doc.fechaEmision,
          fechaCaducidad: doc.fechaCaducidad,
        },
      });
    }
  }

  // Y uno anotado sin el papel, a propósito: Nadia tiene la fila del
  // certificado en el expediente pero no el documento. Antes eso la daba por
  // resuelta; ahora sigue contando como que falta, que es lo que es.
  const nadia = await prisma.profesional.findFirst({ where: { organizacionId: organizacion.id, nombre: "Nadia" } });
  if (nadia) {
    await prisma.documento.create({
      data: {
        profesionalId: nadia.id,
        tipo: "DELITOS_SEXUALES",
        nombre: "Certificación negativa (pendiente de recibir el original)",
        url: "",
        fechaEmision: fechaEn(-10),
        fechaCaducidad: fechaEn(350),
      },
    });
  }
  console.log(`\nAlmacén: ${pdfsGenerados} documentos con su PDF, y uno anotado sin fichero para ver el caso.`);

  // Una ausencia aprobada y otra pendiente de responder, para que la bandeja
  // de coordinación no arranque vacía.
  await prisma.ausencia.create({
    data: {
      profesionalId: rosa.id,
      tipo: "VACACIONES",
      estado: "APROBADA",
      desde: fechaEn(12),
      hasta: fechaEn(22),
      motivo: "Vacaciones de otoño",
      resueltaAt: fechaEn(-5),
    },
  });
  await prisma.ausencia.create({
    data: {
      profesionalId: profesional.id,
      tipo: "ASUNTOS_PROPIOS",
      estado: "SOLICITADA",
      desde: fechaEn(30),
      hasta: fechaEn(30),
      motivo: "Cita médica familiar",
    },
  });

  console.log("\nSeed completado. Cadena PERSONA → NECESIDAD → SOLICITUD → SERVICIO → VISITA → ACTUACIÓN → SEGUIMIENTO creada.");
  // -------------------------------------------------------------------------
  // Motor de tiempo: reglas de la casa y tarifas con vigencia
  //
  // CUIDA Cantabria cobra lo acordado (no los cuatro minutos de más o de menos
  // del fichaje) y hace que coordinación apruebe el tiempo extra antes de
  // facturarlo. Es la combinación que menos sorpresas da en la factura.
  // -------------------------------------------------------------------------
  await prisma.reglasNegocio.create({
    data: {
      organizacionId: organizacion.id,
      baseCobro: "PROGRAMADO",
      baseLiquidacion: "PROGRAMADO",
      redondeoMinutos: 15,
      redondeoModo: "CERCANO",
      minimoMinutos: 60,
      toleranciaRetrasoMinutos: 10,
      toleranciaExcesoMinutos: 10,
      aprobarTiempoExtra: true,
      horasVisitaAbierta: 4,
      cancelacionAvisoHoras: 24,
      cancelacionTardiaCobro: 50,
      cancelacionTardiaPago: 50,
      noPresentadoCobro: 100,
      noPresentadoPago: 100,
    },
  });

  // La tarifa vive aparte del servicio y tiene fechas: subirla en octubre no
  // puede reescribir lo que se prestó en septiembre.
  const tarifaGeneral = await prisma.tarifa.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "General 2026",
      precioHoraCliente: 17,
      precioHoraProfesional: 12,
      vigenteDesde: new Date("2026-01-01"),
    },
  });
  await prisma.tarifa.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Acompañamiento 2026",
      necesidadId: necesidadAcompanamiento.id,
      precioHoraCliente: 19,
      precioHoraProfesional: 13.5,
      vigenteDesde: new Date("2026-01-01"),
    },
  });
  // Tarifa vieja, ya cerrada: sirve para ver que el histórico no se toca.
  await prisma.tarifa.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "General 2025",
      precioHoraCliente: 15.5,
      precioHoraProfesional: 11,
      vigenteDesde: new Date("2025-01-01"),
      vigenteHasta: new Date("2025-12-31"),
      activa: false,
    },
  });

  // Las jornadas ya fichadas pasan por el motor para que tengan sus cuatro
  // tiempos, su tarifa congelada y sus tres importes desde el primer arranque.
  const yaFichadas = await prisma.visita.findMany({
    where: { servicio: { organizacionId: organizacion.id }, horaFinReal: { not: null } },
    select: { id: true },
  });
  for (const v of yaFichadas) await liquidarVisita(v.id);
  console.log(`\nMotor de tiempo: reglas de la casa, 3 tarifas (vigente: ${tarifaGeneral.nombre}) y ${yaFichadas.length} jornadas con su desglose calculado.`);

  console.log(`Organización: ${organizacion.codigo} · Persona: ${herminia.codigo} · Solicitud: ${solicitud.codigo} · Servicio: ${servicio.codigo} · Visita: ${visita.codigo}`);
  console.log("\nSolicitudes adicionales de ejemplo (todos los estados del panel):");
  console.log(`  ${solicitud.codigo}  Por verificar (EN_CURSO, visita finalizada sin revisar)`);
  console.log(`  ${solicitud2.codigo}  Sin profesional (Gestión / disponible en el marketplace)`);
  console.log(`  ${solicitud3.codigo}  En proceso, esperando el día (CONFIRMADO)`);
  console.log(`  ${solicitud4.codigo}  Finalizada (VALIDADO) con factura ${factura.codigo} generada`);
  console.log(`  ${solicitud5.codigo}  Con incidencia abierta (${incidencia5.codigo})`);
  console.log(`  ${solicitud6.codigo}  Recurrente e indefinida (acompañamiento diario)`);
  console.log(`  ${solicitudManuel.codigo}  Manuel · recurrente de tardes con Rosa (empresa colaboradora)`);
  console.log(`  ${solicitudDolores.codigo}  Dolores · acompañamiento con Javier, por verificar`);
  console.log(`  ${solicitudAmadeo.codigo}  Amadeo · sin profesional, con un candidato interesado`);
  console.log(`  ${solicitudNueva.codigo}  Amadeo · recién enviada, sin revisar`);
  console.log("\nUsuarios demo (contraseña para todos: cuida2026):");
  console.log(`  Coordinadora   coordinadora@cuida.demo`);
  console.log(`  Personas       herminia@cuida.demo · manuel@cuida.demo · dolores@cuida.demo · amadeo@cuida.demo`);
  console.log(`  Familiares     hija.herminia@cuida.demo · hijo.manuel@cuida.demo · hija.dolores@cuida.demo`);
  console.log(`  Profesionales  carmen.profesional@cuida.demo · rosa.profesional@cuida.demo · javier.profesional@cuida.demo`);
  console.log(`                 nadia.profesional@cuida.demo (pendiente de verificar)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
