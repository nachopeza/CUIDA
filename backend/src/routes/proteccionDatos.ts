import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { CATEGORIAS, politicaDe, vencidosDe, type Categoria } from "../services/conservacion.js";
import { borrar as borrarArchivo } from "../services/almacen.js";
import { puedeAccederPersona } from "../services/permisos.js";

// ---------------------------------------------------------------------------
// Protección de datos
//
// Tres cosas que el RGPD pide y que una aplicación que guarda la medicación de
// una persona mayor y el certificado de antecedentes de quien entra en su casa
// no puede no tener:
//
//   1. Un plazo por categoría, con la norma que lo sostiene (art. 5.1.e).
//   2. Poder borrar lo que ya no toca guardar, a conciencia y con registro.
//   3. Poder entregar a alguien todo lo que se sabe de él (arts. 15 y 20).
// ---------------------------------------------------------------------------
export const proteccionRouter = Router();
proteccionRouter.use(autenticar);

const soloGestion = requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN");

proteccionRouter.get("/politica", soloGestion, async (req, res) => {
  const politica = await politicaDe(req.usuario!.organizacionId!);
  res.json({ politica, categorias: CATEGORIAS });
});

const politicaSchema = z.object({
  mesesRegistroJornada: z.number().int().min(0).max(240),
  mesesDocumentacionLaboral: z.number().int().min(0).max(240),
  mesesFacturacion: z.number().int().min(0).max(240),
  mesesMandatoSepa: z.number().int().min(0).max(240),
  mesesDatosAsistenciales: z.number().int().min(0).max(240),
  mesesCertificadoPenales: z.number().int().min(0).max(240),
  mesesAuditoria: z.number().int().min(0).max(240),
  mesesMensajes: z.number().int().min(0).max(240),
  responsableNombre: z.string().optional().nullable(),
  responsableEmail: z.string().optional().nullable(),
  delegadoNombre: z.string().optional().nullable(),
  delegadoEmail: z.string().optional().nullable(),
});

proteccionRouter.put("/politica", soloGestion, async (req, res) => {
  const parsed = politicaSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const organizacionId = req.usuario!.organizacionId!;

  const guardada = await prisma.politicaConservacion.upsert({
    where: { organizacionId },
    update: parsed.data,
    create: { organizacionId, ...parsed.data },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId,
    accion: "editar_politica_conservacion",
    entidadTipo: "PoliticaConservacion",
    entidadId: guardada.id,
  });
  res.json(guardada);
});

proteccionRouter.get("/vencidos", soloGestion, async (req, res) => {
  res.json(await vencidosDe(req.usuario!.organizacionId!));
});

// Borrar lo que ya pasó su plazo. Se pide por categoría y una a una: una purga
// que se lleva ocho cosas de golpe es una purga que nadie ha mirado.
const purgaSchema = z.object({
  categoria: z.enum([
    "REGISTRO_JORNADA",
    "DOCUMENTACION_LABORAL",
    "FACTURACION",
    "MANDATO_SEPA",
    "DATOS_ASISTENCIALES",
    "CERTIFICADO_PENALES",
    "AUDITORIA",
    "MENSAJES",
  ]),
  // Se escribe el nombre de la categoría para confirmar. No es burocracia:
  // esto borra datos que no se pueden recuperar.
  confirmacion: z.string(),
});

function haceMeses(meses: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d;
}

// Quita los archivos del almacén de unos documentos y luego las fichas. Si se
// borrara solo la fila quedaría el fichero huérfano en disco, que es lo peor
// de los dos mundos: ocupa y ya nadie lo controla.
async function borrarDocumentos(where: object): Promise<number> {
  const documentos = await prisma.documento.findMany({ where, include: { archivo: true } });
  for (const doc of documentos) {
    if (doc.archivo) {
      await borrarArchivo(doc.archivo.ruta);
      await prisma.documento.update({ where: { id: doc.id }, data: { archivoId: null } });
      await prisma.archivo.delete({ where: { id: doc.archivo.id } }).catch(() => {});
    }
  }
  const { count } = await prisma.documento.deleteMany({ where });
  return count;
}

proteccionRouter.post("/purgar", soloGestion, async (req, res) => {
  const parsed = purgaSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { categoria, confirmacion } = parsed.data;
  const ficha = CATEGORIAS.find((c) => c.categoria === categoria)!;
  if (confirmacion.trim().toLowerCase() !== ficha.etiqueta.toLowerCase()) {
    return res.status(400).json({ error: `Para confirmar, escribe exactamente: ${ficha.etiqueta}` });
  }

  const organizacionId = req.usuario!.organizacionId!;
  const politica = await politicaDe(organizacionId);
  const corte = haceMeses(politica[ficha.campoMeses] as number);
  let borrados = 0;
  let detalle = "";

  switch (categoria as Categoria) {
    case "REGISTRO_JORNADA": {
      const mesCorte = `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, "0")}`;
      const { count } = await prisma.registroJornada.deleteMany({
        where: { profesional: { organizacionId }, mes: { lt: mesCorte } },
      });
      borrados = count;
      detalle = `registros de jornada anteriores a ${mesCorte}`;
      break;
    }
    case "DOCUMENTACION_LABORAL":
      borrados = await borrarDocumentos({
        tipo: { in: ["CONTRATO", "ALTA_SEGURIDAD_SOCIAL", "TITULACION"] },
        profesional: { organizacionId, fechaBaja: { not: null, lt: corte } },
      });
      detalle = "documentación laboral de profesionales dados de baja";
      break;
    case "CERTIFICADO_PENALES":
      borrados = await borrarDocumentos({
        tipo: "DELITOS_SEXUALES",
        profesional: { organizacionId, fechaBaja: { not: null, lt: corte } },
      });
      detalle = "certificados de antecedentes de profesionales dados de baja";
      break;
    case "MANDATO_SEPA": {
      const { count } = await prisma.mandatoSepa.deleteMany({
        where: { datosFacturacion: { persona: { organizacionId } }, revocadoAt: { not: null, lt: corte } },
      });
      borrados = count;
      detalle = "mandatos de domiciliación revocados";
      break;
    }
    case "AUDITORIA": {
      const { count } = await prisma.auditLog.deleteMany({ where: { organizacionId, createdAt: { lt: corte } } });
      borrados = count;
      detalle = "entradas del registro de accesos";
      break;
    }
    case "MENSAJES": {
      const { count } = await prisma.mensaje.deleteMany({
        where: { persona: { organizacionId }, createdAt: { lt: corte } },
      });
      borrados = count;
      detalle = "mensajes";
      break;
    }
    case "FACTURACION":
      // Una factura no se borra: es el soporte de un apunte contable y su
      // numeración tiene que seguir siendo correlativa y sin huecos. Pasado el
      // plazo lo que procede es sacarla del sistema vivo, no hacerla
      // desaparecer de la contabilidad.
      return res.status(409).json({
        error:
          "Las facturas no se borran desde aquí: su numeración debe seguir siendo correlativa y sin huecos. Pasado el plazo, expórtalas y archívalas fuera del sistema vivo.",
      });
    case "DATOS_ASISTENCIALES": {
      // No se borra a la persona: se le quitan los datos que la identifican y
      // los de salud, y se deja el historial de servicio. Un dato anonimizado
      // ya no es dato personal y deja de estar sujeto al RGPD, y así no se
      // destruye la contabilidad ni el registro de jornada asociados.
      const personas = await prisma.persona.findMany({
        where: {
          organizacionId,
          estado: "ARCHIVADA",
          solicitudes: { none: { servicio: { visitas: { some: { fecha: { gte: corte } } } } } },
        },
        select: { id: true, codigo: true },
      });
      for (const persona of personas) {
        await prisma.persona.update({
          where: { id: persona.id },
          data: {
            nombre: "Persona",
            apellidos: `anonimizada ${persona.codigo}`,
            fechaNacimiento: null,
            telefono: null,
            direccion: null,
            preferencias: null,
            contactos: null,
            medicacion: null,
            medico: null,
            recomendaciones: null,
          },
        });
        await prisma.mensaje.deleteMany({ where: { personaId: persona.id } });
        await prisma.familiarRelacion.deleteMany({ where: { personaId: persona.id } });
        await prisma.usuario.deleteMany({ where: { personaId: persona.id } });
      }
      borrados = personas.length;
      detalle = "personas archivadas anonimizadas (se conserva el historial sin datos identificativos)";
      break;
    }
  }

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId,
    accion: "purgar_datos",
    entidadTipo: "PoliticaConservacion",
    entidadId: categoria,
    detalle: `${ficha.etiqueta}: ${borrados} ${detalle} · plazo ${politica[ficha.campoMeses]} meses (${ficha.baseLegal})`,
  });

  res.json({ categoria, borrados, detalle });
});

// ---------------------------------------------------------------------------
// Derecho de acceso y portabilidad (arts. 15 y 20 del RGPD)
//
// Todo lo que CUIDA sabe de una persona, en un JSON legible y con el origen de
// cada bloque. El plazo de respuesta es de un mes, así que esto no puede ser
// una consulta que alguien improvise a mano el día que llegue la solicitud.
// ---------------------------------------------------------------------------
proteccionRouter.get("/personas/:id/expediente", async (req, res) => {
  const usuario = req.usuario!;
  // Lo puede pedir la propia persona, un familiar autorizado o coordinación:
  // es el mismo permiso que para ver su ficha.
  if (!(await puedeAccederPersona(usuario, req.params.id))) return res.status(403).json({ error: "Sin permiso" });

  const persona = await prisma.persona.findUnique({
    where: { id: req.params.id },
    include: {
      datosFacturacion: { include: { mandatos: true } },
      familiares: { include: { usuario: { select: { nombre: true, email: true } } } },
      documentos: { select: { nombre: true, tipo: true, fechaEmision: true, fechaCaducidad: true, createdAt: true } },
      facturas: { select: { codigo: true, mes: true, fechaEmision: true, totalConIva: true, estado: true } },
      mensajes: { select: { texto: true, createdAt: true, autor: { select: { nombre: true, email: true } } } },
      solicitudes: {
        include: {
          necesidad: { select: { nombre: true } },
          plan: true,
          servicio: {
            include: {
              profesional: { select: { nombre: true, apellidos: true } },
              visitas: {
                select: {
                  codigo: true,
                  fecha: true,
                  estado: true,
                  horaInicioProg: true,
                  horaFinProg: true,
                  horaInicioReal: true,
                  horaFinReal: true,
                  minutosFacturables: true,
                  importeCliente: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!persona || persona.organizacionId !== usuario.organizacionId) return res.status(404).json({ error: "No encontrada" });

  const politica = await politicaDe(persona.organizacionId);

  res.json({
    generado: new Date(),
    aviso:
      "Copia de los datos personales que CUIDA trata sobre esta persona, entregada conforme a los artículos 15 y 20 del Reglamento General de Protección de Datos.",
    responsable: {
      nombre: politica.responsableNombre,
      email: politica.responsableEmail,
      delegadoProteccionDatos: politica.delegadoNombre,
      delegadoEmail: politica.delegadoEmail,
    },
    bloques: [
      {
        titulo: "Datos identificativos y de contacto",
        finalidad: "Prestar y coordinar el servicio de ayuda a domicilio contratado",
        baseJuridica: "Ejecución del contrato (art. 6.1.b RGPD)",
        datos: {
          codigo: persona.codigo,
          nombre: persona.nombre,
          apellidos: persona.apellidos,
          fechaNacimiento: persona.fechaNacimiento,
          telefono: persona.telefono,
          direccion: persona.direccion,
          alta: persona.createdAt,
        },
      },
      {
        titulo: "Datos de salud y preferencias de cuidado",
        finalidad: "Que quien presta el servicio sepa cómo atenderla con seguridad",
        baseJuridica:
          "Categoría especial: asistencia sanitaria o social y gestión de los servicios (art. 9.2.h RGPD)",
        datos: {
          medicacion: persona.medicacion,
          medico: persona.medico,
          preferencias: persona.preferencias,
          recomendaciones: persona.recomendaciones,
          contactosDeEmergencia: persona.contactos,
        },
      },
      {
        titulo: "Personas autorizadas",
        finalidad: "Permitir que un familiar gestione el servicio en su nombre",
        baseJuridica: "Ejecución del contrato (art. 6.1.b RGPD)",
        datos: persona.familiares.map((f) => ({
          parentesco: f.parentesco,
          nombre: f.usuario.nombre ?? f.usuario.email,
          puedeVerImportes: f.puedeVerImportes,
          desde: f.createdAt,
          revocado: f.revocadoAt,
        })),
      },
      {
        titulo: "Servicios solicitados y prestados",
        finalidad: "Coordinar, verificar y facturar el servicio",
        baseJuridica: "Ejecución del contrato (art. 6.1.b RGPD)",
        datos: persona.solicitudes.map((s) => ({
          codigo: s.codigo,
          servicio: s.necesidad.nombre,
          estado: s.estado,
          solicitado: s.createdAt,
          plan: s.plan ? { desde: s.plan.fechaInicio, hasta: s.plan.fechaFin, recurrencia: s.plan.recurrencia } : null,
          profesional: s.servicio?.profesional
            ? `${s.servicio.profesional.nombre} ${s.servicio.profesional.apellidos}`
            : null,
          jornadas: s.servicio?.visitas ?? [],
        })),
      },
      {
        titulo: "Facturación y cobro",
        finalidad: "Cobrar el servicio y cumplir las obligaciones contables y fiscales",
        baseJuridica: "Obligación legal (art. 6.1.c RGPD)",
        conservacion: `${politica.mesesFacturacion} meses desde la fecha de la factura`,
        datos: {
          titular: persona.datosFacturacion
            ? { titular: persona.datosFacturacion.titular, nif: persona.datosFacturacion.nif, formaPago: persona.datosFacturacion.formaPago }
            : null,
          mandatos: (persona.datosFacturacion?.mandatos ?? []).map((m) => ({
            referencia: m.referencia,
            // El IBAN se enmascara: la persona ya sabe cuál es su cuenta y un
            // fichero de exportación circula por correo.
            iban: m.iban ? `****${m.iban.slice(-4)}` : null,
            firmado: m.fechaFirma,
            revocado: m.revocadoAt,
          })),
          facturas: persona.facturas,
        },
      },
      {
        titulo: "Mensajes",
        finalidad: "Comunicación entre la familia y quien presta el servicio",
        baseJuridica: "Ejecución del contrato (art. 6.1.b RGPD)",
        conservacion: `${politica.mesesMensajes} meses desde el envío`,
        datos: persona.mensajes,
      },
      {
        titulo: "Documentos",
        finalidad: "Acreditar lo necesario para prestar el servicio",
        baseJuridica: "Ejecución del contrato (art. 6.1.b RGPD)",
        datos: persona.documentos,
      },
    ],
    derechos:
      "Puede solicitar la rectificación o supresión de estos datos, oponerse a su tratamiento o limitarlo, dirigiéndose al responsable indicado arriba. También puede reclamar ante la Agencia Española de Protección de Datos.",
  });
});
