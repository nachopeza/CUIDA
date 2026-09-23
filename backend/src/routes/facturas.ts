import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion } from "../services/permisos.js";
import { comprobarCadena, registrarAlta, qrSvg } from "../services/registroFacturacion.js";
import {
  calcularVencimiento,
  partesDeLaFactura,
  problemasParaEmitir,
  redondear,
  referenciaFactura,
  siguienteNumero,
} from "../services/facturacion.js";

// Facturación mensual a la familia (sección "la función es cobrar por
// gestión un pequeño porcentaje... se le hará una cuenta mensual con los
// servicios solicitados y al final de mes se le cobrará el importe. Ese
// importe se dividirá y se entregará a los profesionales"). Fase 1: cálculo
// y registro; el cobro/pago real (pasarela, transferencia...) queda fuera de
// alcance, pero el dato queda preparado para conectarlo después.
export const facturasRouter = Router();
facturasRouter.use(autenticar);

const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

function rangoMes(mes: string): { desde: Date; hasta: Date } {
  const [anio, mesNum] = mes.split("-").map(Number);
  const desde = new Date(Date.UTC(anio, mesNum - 1, 1));
  const hasta = new Date(Date.UTC(anio, mesNum, 1));
  return { desde, hasta };
}

const generarSchema = z.object({
  personaId: z.string().min(1),
  mes: z.string().regex(mesRegex, "Formato esperado: AAAA-MM"),
});

// Agrupa los servicios PAGADO ya cerrados/validados de una persona en un mes
// natural que todavía no estén facturados, y calcula el total cobrado a la
// familia, la comisión de gestión retenida y el neto a repartir entre
// profesionales/empresas colaboradoras.
facturasRouter.post("/generar", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = generarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const usuario = req.usuario!;
  const persona = await prisma.persona.findUnique({ where: { id: parsed.data.personaId } });
  if (!persona || persona.organizacionId !== usuario.organizacionId) {
    return res.status(404).json({ error: "Persona no encontrada" });
  }

  const { desde, hasta } = rangoMes(parsed.data.mes);

  // La unidad económica de CUIDA es la jornada, no el servicio: el servicio es
  // el contrato y la jornada es la ejecución. Así que la factura se arma con
  // las jornadas del mes y con las cifras que el motor de tiempo ya dejó
  // escritas en cada una — el tiempo facturable y el importe a esa tarifa.
  //
  // Antes esto se calculaba aquí otra vez, a partir de las horas fichadas y
  // del precio del servicio, y podía no coincidir con lo que el desglose le
  // había enseñado a la familia. Dos cuentas distintas para el mismo dinero.
  const visitasDelMes = await prisma.visita.findMany({
    where: {
      facturaId: null,
      fecha: { gte: desde, lt: hasta },
      importeCliente: { not: null },
      estado: { in: ["FINALIZADA", "REVISADA", "CANCELADA", "NO_PRESENTADO"] },
      servicio: {
        organizacionId: usuario.organizacionId!,
        solicitud: { personaId: persona.id },
        tarifaTipo: "PAGADO",
      },
    },
    include: { servicio: { include: { solicitud: { include: { necesidad: true } } } } },
    orderBy: { fecha: "asc" },
  });

  // Una jornada con tiempo adicional sin decidir no se factura: cobrar de más
  // y devolverlo después cuesta una rectificativa y la confianza de la
  // familia. Se dice cuáles son, para poder resolverlas y reintentar.
  const sinDecidir = visitasDelMes.filter((v) => v.ajusteEstado === "PENDIENTE");
  if (sinDecidir.length > 0) {
    return res.status(409).json({
      error: `${sinDecidir.length === 1 ? "Una jornada tiene" : `${sinDecidir.length} jornadas tienen`} tiempo por encima de lo acordado sin aprobar (${sinDecidir
        .map((v) => v.codigo)
        .join(", ")}). Decide ese tiempo en su desglose antes de facturar el mes`,
    });
  }

  // Servicios PUNTUAL cerrados dentro del mes cuyas jornadas no pasaron por el
  // motor (las de antes de que existiera). Se facturan como siempre, para no
  // dejar fuera nada ya prestado.
  const yaCubiertos = new Set(visitasDelMes.map((v) => v.servicioId));
  const serviciosConDetalle = (
    await prisma.servicio.findMany({
      where: {
        organizacionId: usuario.organizacionId!,
        solicitud: { personaId: persona.id },
        tarifaTipo: "PAGADO",
        facturaId: null,
        estado: { in: ["VALIDADO", "CERRADO"] },
        createdAt: { gte: desde, lt: hasta },
      },
      include: { solicitud: { include: { necesidad: true } } },
    })
  ).filter((s) => !yaCubiertos.has(s.id));
  const servicios = serviciosConDetalle;

  if (servicios.length === 0 && visitasDelMes.length === 0) {
    return res.status(409).json({ error: "No hay servicios ni jornadas pendientes de facturar para esa persona en ese mes" });
  }

  const organizacion = await prisma.organizacion.findUnique({ where: { id: usuario.organizacionId! } });

  // Solo puede haber una factura por persona y mes: si ya se generó (por
  // ejemplo antes de verificar las últimas jornadas), se avisa en vez de
  // reventar con el error de unicidad de la base de datos.
  const yaExiste = await prisma.factura.findUnique({ where: { personaId_mes: { personaId: persona.id, mes: parsed.data.mes } } });
  if (yaExiste) {
    return res.status(409).json({ error: `Ya existe la factura ${yaExiste.codigo} para esa persona y ese mes` });
  }

  // Las líneas se escriben ahora y ya no se recalculan: una factura que se
  // deriva de las jornadas cada vez que se pinta cambia sola cuando alguien
  // verifica una más tarde, y entonces deja de coincidir con la copia que
  // tiene el cliente.
  const lineas: {
    orden: number;
    concepto: string;
    minutos: number | null;
    cantidad: number;
    precioUnitario: number;
    importe: number;
    ivaPorcentaje: number;
    ivaImporte: number;
    visitaId?: string | null;
  }[] = [];

  let importeTotal = 0;
  let ivaTotal = 0;
  let totalConIva = 0;
  let comisionTotal = 0;
  let importeProfesionales = 0;
  let orden = 0;

  const dia = (d: Date) => d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  const NO_PRESTADA: Record<string, string> = {
    CANCELADA: " · cancelada fuera de plazo",
    NO_PRESENTADO: " · la persona no estaba",
  };

  // Una línea por jornada, con su fecha: es lo que permite responder "¿por qué
  // este importe?" sin salir de la factura.
  for (const v of visitasDelMes) {
    const base = Number(v.importeCliente);
    const delProfesional = Number(v.importeProfesional ?? 0);
    const minutos = v.minutosFacturables ?? 0;
    const horas = redondear(minutos / 60);
    const ivaPct = Number(v.servicio.ivaPorcentaje ?? v.servicio.solicitud.necesidad.ivaPorcentaje);
    const iva = redondear(base * (ivaPct / 100));

    lineas.push({
      orden: orden++,
      concepto: `${v.servicio.solicitud.necesidad.nombre} · ${dia(v.fecha)}${NO_PRESTADA[v.estado] ?? ""}`,
      minutos,
      cantidad: horas > 0 ? horas : 1,
      precioUnitario: Number(v.precioHoraCliente ?? 0),
      importe: base,
      ivaPorcentaje: ivaPct,
      ivaImporte: iva,
      visitaId: v.id,
    });

    importeTotal += base;
    ivaTotal += iva;
    totalConIva += base + iva;
    // La comisión ya no es un porcentaje aplicado aquí: es lo que de verdad
    // queda entre lo cobrado y lo pagado en esa jornada. Si cobro y pago usan
    // tiempos distintos, el porcentaje habría mentido.
    comisionTotal += redondear(base - delProfesional);
    importeProfesionales += delProfesional;
  }

  // Camino antiguo, solo para lo que no pasó por el motor.
  for (const srv of serviciosConDetalle) {
    const base = Number(srv.tarifaImporte ?? 0);
    const minutos = srv.minutosPrevistos ?? null;
    const horas = minutos != null ? redondear(minutos / 60) : 1;
    lineas.push({
      orden: orden++,
      concepto: `${srv.solicitud.necesidad.nombre} · ${srv.codigo}`,
      minutos,
      cantidad: horas > 0 ? horas : 1,
      precioUnitario: horas > 0 ? redondear(base / horas) : base,
      importe: base,
      ivaPorcentaje: Number(srv.ivaPorcentaje ?? srv.solicitud.necesidad.ivaPorcentaje),
      ivaImporte: Number(srv.ivaImporte ?? 0),
    });
    importeTotal += base;
    ivaTotal += Number(srv.ivaImporte ?? 0);
    totalConIva += Number(srv.totalConIva ?? base);
    comisionTotal += Number(srv.comisionImporte ?? 0);
    importeProfesionales += Number(srv.importeProfesional ?? 0);
  }

  importeTotal = redondear(importeTotal);
  ivaTotal = redondear(ivaTotal);
  totalConIva = redondear(totalConIva);
  comisionTotal = redondear(comisionTotal);
  importeProfesionales = redondear(importeProfesionales);

  const datosCobro = await prisma.datosFacturacion.findUnique({ where: { personaId: persona.id } });
  const codigo = await generarCodigo("factura");
  const factura = await prisma.factura.create({
    data: {
      codigo,
      mes: parsed.data.mes,
      serie: organizacion?.serieFactura ?? "A",
      ejercicio: Number(parsed.data.mes.slice(0, 4)),
      formaPago: datosCobro?.formaPago ?? "DOMICILIACION",
      importeTotal,
      ivaTotal,
      totalConIva,
      comisionTotal,
      importeProfesionales,
      organizacionId: usuario.organizacionId!,
      personaId: persona.id,
      servicios: { connect: servicios.map((s) => ({ id: s.id })) },
      visitas: { connect: visitasDelMes.map((v) => ({ id: v.id })) },
      lineas: { create: lineas },
    },
    include: { servicios: true, visitas: true, persona: true, lineas: { orderBy: { orden: "asc" } } },
  });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: usuario.organizacionId,
    accion: "generar_factura",
    entidadTipo: "Factura",
    entidadId: factura.id,
    detalle: `${persona.codigo} · ${parsed.data.mes} · ${importeTotal.toFixed(2)} €`,
  });

  res.status(201).json(factura);
});

const INCLUDE_FICHA = {
  persona: { include: { datosFacturacion: { include: { mandatos: true } } } },
  lineas: { orderBy: { orden: "asc" } },
  mandatoSepa: true,
  remesa: true,
  facturaRectificada: { select: { id: true, codigo: true, serie: true, numero: true, ejercicio: true } },
  rectificativas: { select: { id: true, codigo: true, serie: true, numero: true, ejercicio: true, totalConIva: true } },
  servicios: { include: { solicitud: { include: { necesidad: true } }, profesional: true } },
  visitas: { include: { profesional: true, servicio: { include: { solicitud: { include: { necesidad: true } } } } } },
  // El registro del RD 1007/2023: la huella y el QR se imprimen en la factura,
  // así que viajan con ella.
  registroFacturacion: true,
} as const;

facturasRouter.get("/", async (req, res) => {
  const usuario = req.usuario!;
  let where: Record<string, unknown> = {};

  if (esGestorOrganizacion(usuario)) {
    where = { organizacionId: usuario.organizacionId ?? "__none__" };
  } else if (usuario.rol === "FAMILIAR") {
    const relaciones = await prisma.familiarRelacion.findMany({
      where: { usuarioId: usuario.sub, revocadoAt: null, puedeVerImportes: true },
      select: { personaId: true },
    });
    where = { personaId: { in: relaciones.map((r) => r.personaId) } };
  } else {
    // La persona atendida nunca ve importes/facturas (sección 4/14).
    return res.json([]);
  }

  const facturas = await prisma.factura.findMany({
    where,
    include: INCLUDE_FICHA,
    orderBy: [{ mes: "desc" }, { createdAt: "desc" }],
  });
  res.json(facturas);
});


facturasRouter.get("/:id", async (req, res) => {
  const factura = await prisma.factura.findUnique({ where: { id: req.params.id }, include: INCLUDE_FICHA });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  const usuario = req.usuario!;
  if (esGestorOrganizacion(usuario)) {
    if (factura.organizacionId !== usuario.organizacionId && usuario.rol !== "SUPERADMIN") return res.status(403).json({ error: "Sin permiso" });
  } else if (usuario.rol === "FAMILIAR") {
    const relacion = await prisma.familiarRelacion.findFirst({
      where: { usuarioId: usuario.sub, personaId: factura.personaId, revocadoAt: null, puedeVerImportes: true },
    });
    if (!relacion) return res.status(403).json({ error: "Sin permiso" });
  } else {
    // La persona atendida nunca ve importes (sección 4 y 14 del masterplan).
    return res.status(403).json({ error: "Sin permiso" });
  }
  // El QR se dibuja aquí y no se guarda: es una función de la URL de cotejo,
  // que sí está registrada. Guardar la imagen sería guardar dos veces el mismo
  // dato y arriesgarse a que dejen de coincidir.
  const qr = factura.registroFacturacion ? await qrSvg(factura.registroFacturacion.urlCotejo) : null;
  res.json({ ...factura, qrSvg: qr });
});

// Emitir: es el momento en que la factura deja de ser un borrador editable y
// pasa a ser un documento. Aquí toma número de serie, fecha y una copia
// congelada de los datos de las dos partes.
facturasRouter.post("/:id/emitir", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const factura = await prisma.factura.findUnique({ where: { id: req.params.id } });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  if (factura.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (factura.estado !== "BORRADOR") return res.status(409).json({ error: `La factura ${factura.codigo} ya está emitida` });

  const partes = await partesDeLaFactura(factura.personaId, factura.organizacionId);
  const datos = await prisma.datosFacturacion.findUnique({ where: { personaId: factura.personaId }, include: { mandatos: true } });
  const domiciliado = factura.formaPago === "DOMICILIACION";
  const mandato = datos?.mandatos.find((m) => m.estado === "ACTIVO") ?? null;

  const faltan = problemasParaEmitir(partes, domiciliado, mandato != null);
  if (faltan.length > 0) {
    return res.status(409).json({ error: `No se puede emitir todavía: falta ${faltan.join(", ")}.` });
  }

  const emision = new Date();
  // Los días de plazo salen de lo pactado con este cliente y, si no hay nada
  // pactado, de lo que la empresa tenga puesto por defecto. Antes había un 30
  // escrito en el código que nadie podía cambiar.
  const empresa = await prisma.organizacion.findUnique({
    where: { id: factura.organizacionId },
    select: { diasVencimiento: true, cif: true },
  });
  // Sin NIF no hay registro de facturación posible, y sin registro no se
  // puede emitir: el RD 1007/2023 no admite emitir primero y registrar luego.
  if (!empresa?.cif) {
    return res.status(409).json({ error: "Falta el CIF de la empresa: sin él no se puede generar el registro de facturación obligatorio." });
  }
  const numero = await siguienteNumero(factura.organizacionId, factura.serie, factura.ejercicio);
  const emitida = await prisma.factura.update({
    where: { id: factura.id },
    data: {
      estado: "EMITIDA",
      numero,
      fechaEmision: emision,
      fechaVencimiento: calcularVencimiento(emision, domiciliado, datos?.diaCobro ?? 5, datos?.diasVencimiento ?? empresa?.diasVencimiento ?? 30),
      mandatoSepaId: domiciliado ? mandato!.id : null,
      ...partes,
    },
    include: INCLUDE_FICHA,
  });

  // Registro de facturación encadenado con el anterior. Va después del update
  // porque necesita el número ya asignado, y antes de responder porque una
  // factura emitida sin su registro es justo lo que el reglamento prohíbe.
  const registro = await registrarAlta(
    {
      id: emitida.id,
      organizacionId: emitida.organizacionId,
      serie: emitida.serie,
      numero: numero,
      ejercicio: emitida.ejercicio,
      fechaEmision: emision,
      totalIva: emitida.ivaTotal,
      totalConIva: emitida.totalConIva,
      facturaRectificadaId: emitida.facturaRectificadaId,
    },
    empresa.cif,
  );

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: factura.organizacionId,
    accion: "emitir_factura",
    entidadTipo: "Factura",
    entidadId: factura.id,
    detalle: `${referenciaFactura(emitida.serie, emitida.ejercicio, numero)} · huella ${registro.huella.slice(0, 16)}…`,
  });

  res.json({ ...emitida, registroFacturacion: registro });
});

// Comprobar la cadena de registros. Es la respuesta a "¿y cómo sé que nadie ha
// tocado esto?": se recalculan todas las huellas y se dice si alguna no cuadra.
facturasRouter.get("/registro/cadena", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const organizacionId = req.usuario!.organizacionId;
  if (!organizacionId) return res.status(400).json({ error: "Sin organización" });
  res.json(await comprobarCadena(organizacionId));
});

const cobroSchema = z.object({ fechaCobro: z.string().optional(), referencia: z.string().optional() });

facturasRouter.post("/:id/cobrar", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = cobroSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const factura = await prisma.factura.findUnique({ where: { id: req.params.id } });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  if (factura.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (!["EMITIDA", "IMPAGADA"].includes(factura.estado)) {
    return res.status(409).json({ error: "Solo se puede cobrar una factura emitida" });
  }

  const actualizada = await prisma.factura.update({
    where: { id: factura.id },
    data: { estado: "PAGADA", fechaCobro: parsed.data.fechaCobro ? new Date(parsed.data.fechaCobro) : new Date(), motivoImpago: null },
    include: INCLUDE_FICHA,
  });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: factura.organizacionId,
    accion: "cobrar_factura",
    entidadTipo: "Factura",
    entidadId: factura.id,
  });
  res.json(actualizada);
});

const impagoSchema = z.object({ motivo: z.string().min(1) });

// Una devolución del banco no anula la factura ni la borra: la deja emitida
// y sin cobrar, con el motivo, para poder reclamar.
facturasRouter.post("/:id/impago", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = impagoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const factura = await prisma.factura.findUnique({ where: { id: req.params.id } });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  if (factura.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (factura.estado === "BORRADOR") return res.status(409).json({ error: "Una factura en borrador no se puede devolver" });

  const actualizada = await prisma.factura.update({
    where: { id: factura.id },
    data: { estado: "IMPAGADA", motivoImpago: parsed.data.motivo, fechaCobro: null },
    include: INCLUDE_FICHA,
  });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: factura.organizacionId,
    accion: "marcar_impago",
    entidadTipo: "Factura",
    entidadId: factura.id,
    detalle: parsed.data.motivo,
  });
  res.json(actualizada);
});

const rectificarSchema = z.object({ motivo: z.string().min(1), importe: z.number().optional() });

// Rectificar no es editar. La factura emitida se queda como está y se emite
// otra que la referencia y la compensa: es lo que permite que el número de
// una factura entregada signifique siempre lo mismo.
facturasRouter.post("/:id/rectificar", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = rectificarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const original = await prisma.factura.findUnique({ where: { id: req.params.id }, include: { lineas: { orderBy: { orden: "asc" } } } });
  if (!original) return res.status(404).json({ error: "No encontrada" });
  if (original.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (original.estado === "BORRADOR") return res.status(409).json({ error: "Un borrador se corrige directamente, no hace falta rectificarlo" });
  if (original.tipo === "RECTIFICATIVA") return res.status(409).json({ error: "Una rectificativa no se rectifica: emite otra sobre la original" });

  // Sin importe se rectifica entera; con importe, sólo esa parte. En los dos
  // casos los importes van en negativo, que es lo que compensa la original.
  const proporcion = parsed.data.importe != null && Number(original.totalConIva) > 0
    ? Math.min(1, parsed.data.importe / Number(original.totalConIva))
    : 1;
  const signo = -1;
  const emision = new Date();
  const numero = await siguienteNumero(original.organizacionId, original.serie, original.ejercicio);
  const codigo = await generarCodigo("factura");

  const rectificativa = await prisma.factura.create({
    data: {
      codigo,
      mes: original.mes,
      serie: original.serie,
      ejercicio: original.ejercicio,
      numero,
      tipo: "RECTIFICATIVA",
      estado: "EMITIDA",
      fechaEmision: emision,
      fechaVencimiento: emision,
      formaPago: original.formaPago,
      facturaRectificadaId: original.id,
      motivoRectificacion: parsed.data.motivo,
      titularNombre: original.titularNombre,
      titularNif: original.titularNif,
      titularDireccion: original.titularDireccion,
      emisorNombre: original.emisorNombre,
      emisorCif: original.emisorCif,
      emisorDireccion: original.emisorDireccion,
      emisorRegistro: original.emisorRegistro,
      importeTotal: redondear(signo * Number(original.importeTotal) * proporcion),
      ivaTotal: redondear(signo * Number(original.ivaTotal) * proporcion),
      totalConIva: redondear(signo * Number(original.totalConIva) * proporcion),
      comisionTotal: redondear(signo * Number(original.comisionTotal) * proporcion),
      importeProfesionales: redondear(signo * Number(original.importeProfesionales) * proporcion),
      organizacionId: original.organizacionId,
      personaId: original.personaId,
      lineas: {
        create: original.lineas.map((l) => ({
          orden: l.orden,
          concepto: `Rectificación · ${l.concepto}`,
          minutos: l.minutos,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          importe: redondear(signo * Number(l.importe) * proporcion),
          ivaPorcentaje: l.ivaPorcentaje,
          ivaImporte: redondear(signo * Number(l.ivaImporte) * proporcion),
          visitaId: l.visitaId,
        })),
      },
    },
    include: INCLUDE_FICHA,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: original.organizacionId,
    accion: "rectificar_factura",
    entidadTipo: "Factura",
    entidadId: rectificativa.id,
    detalle: `Rectifica ${referenciaFactura(original.serie, original.ejercicio, original.numero)} · ${parsed.data.motivo}`,
  });

  res.status(201).json(rectificativa);
});

const estadoSchema = z.object({ estado: z.enum(["EMITIDA", "PAGADA"]) });

facturasRouter.post("/:id/estado", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const factura = await prisma.factura.findUnique({ where: { id: req.params.id } });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  if (factura.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const secuencia: Record<string, string> = { BORRADOR: "EMITIDA", EMITIDA: "PAGADA" };
  if (secuencia[factura.estado] !== parsed.data.estado) {
    return res.status(409).json({ error: `No se puede pasar de ${factura.estado} a ${parsed.data.estado} directamente` });
  }

  const actualizada = await prisma.factura.update({ where: { id: factura.id }, data: { estado: parsed.data.estado } });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: factura.organizacionId,
    accion: "cambiar_estado_factura",
    entidadTipo: "Factura",
    entidadId: factura.id,
    detalle: `${factura.estado} → ${parsed.data.estado}`,
  });

  res.json(actualizada);
});
