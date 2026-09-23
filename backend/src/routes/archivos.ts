import { Router } from "express";
import express from "express";
import { prisma } from "../lib/prisma.js";
import { autenticar } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion, puedeAccederPersona } from "../services/permisos.js";
import { ArchivoRechazado, BYTES_MAX, TIPOS_ACEPTADOS, borrar, guardar, leer, nombreLimpio } from "../services/almacen.js";

// ---------------------------------------------------------------------------
// Subir y descargar archivos
//
// La subida llega como cuerpo en crudo, no como multipart: el navegador puede
// mandar un File tal cual y así no hace falta un parser de formularios — una
// pieza menos que mantener y una superficie menos donde equivocarse. El nombre
// viaja en un parámetro y el contenido es el cuerpo entero.
//
// La descarga nunca es un fichero estático: pasa por aquí, y aquí se pregunta
// quién es antes de devolver nada. Un DNI escaneado no puede quedar detrás de
// una URL que se pueda adivinar o reenviar.
// ---------------------------------------------------------------------------
export const archivosRouter = Router();
archivosRouter.use(autenticar);

// Quién puede ver este archivo. Un archivo no tiene permisos propios: los
// hereda de aquello a lo que está pegado, que es lo que evita que un permiso
// y el otro se vayan separando con el tiempo.
async function puedeVer(archivoId: string, usuario: Express.Request["usuario"]): Promise<boolean> {
  if (!usuario) return false;
  const archivo = await prisma.archivo.findUnique({
    where: { id: archivoId },
    include: {
      documentos: {
        select: {
          personaId: true,
          profesionalId: true,
          servicio: { select: { solicitud: { select: { personaId: true } } } },
          visita: { select: { servicio: { select: { solicitud: { select: { personaId: true } } } } } },
        },
      },
    },
  });
  if (!archivo) return false;
  if (archivo.organizacionId !== usuario.organizacionId && usuario.rol !== "SUPERADMIN") return false;
  if (esGestorOrganizacion(usuario)) return true;
  // Recién subido y todavía sin documento: solo quien lo subió.
  if (archivo.documentos.length === 0) return archivo.subidoPorId === usuario.sub;

  for (const doc of archivo.documentos) {
    if (usuario.rol === "PROFESIONAL" && doc.profesionalId && doc.profesionalId === usuario.profesionalId) return true;
    const personaId = doc.personaId ?? doc.servicio?.solicitud.personaId ?? doc.visita?.servicio.solicitud.personaId;
    if (personaId && (await puedeAccederPersona(usuario, personaId))) return true;
  }
  return false;
}

// Cuerpo en crudo, solo de los tipos que aceptamos y con tope de tamaño. Lo
// que llegue con otra cabecera no pasa de aquí, y lo que mienta en ella se
// caza después por los primeros bytes del contenido.
archivosRouter.post(
  "/",
  express.raw({ type: TIPOS_ACEPTADOS, limit: BYTES_MAX }),
  async (req, res) => {
    const usuario = req.usuario!;
    if (!usuario.organizacionId) return res.status(403).json({ error: "Sin organización" });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "No ha llegado ningún archivo. Se aceptan PDF, JPG y PNG" });
    }

    const nombre = nombreLimpio(String(req.query.nombre ?? "documento"));
    const id = crypto.randomUUID();
    try {
      const guardado = await guardar(req.body, usuario.organizacionId, id);
      const archivo = await prisma.archivo.create({
        data: {
          id,
          nombre,
          tipoMime: guardado.tipoMime,
          bytes: guardado.bytes,
          hash: guardado.hash,
          ruta: guardado.ruta,
          organizacionId: usuario.organizacionId,
          subidoPorId: usuario.sub,
        },
      });

      await registrarAuditoria({
        usuarioId: usuario.sub,
        organizacionId: usuario.organizacionId,
        accion: "subir_archivo",
        entidadTipo: "Archivo",
        entidadId: archivo.id,
        detalle: `${nombre} · ${(guardado.bytes / 1024).toFixed(0)} KB`,
      });

      res.status(201).json({ id: archivo.id, nombre: archivo.nombre, tipoMime: archivo.tipoMime, bytes: archivo.bytes });
    } catch (err) {
      if (err instanceof ArchivoRechazado) return res.status(400).json({ error: err.message });
      throw err;
    }
  },
);

archivosRouter.get("/:id", async (req, res) => {
  if (!(await puedeVer(req.params.id, req.usuario))) return res.status(403).json({ error: "Sin permiso" });
  const archivo = await prisma.archivo.findUnique({ where: { id: req.params.id } });
  if (!archivo) return res.status(404).json({ error: "No encontrado" });

  let datos: Buffer;
  try {
    datos = await leer(archivo.ruta);
  } catch {
    // La ficha existe pero el fichero no: pasa si se restaura una base de
    // datos sin restaurar el almacén. Decirlo es mejor que un 500 mudo.
    return res.status(410).json({ error: "El archivo ya no está disponible en el almacén" });
  }

  // "inline" para poder verlo en el navegador sin descargarlo; con ?descargar
  // se fuerza la descarga. El nombre va entre comillas y ya viene limpio.
  const disposicion = req.query.descargar !== undefined ? "attachment" : "inline";
  res.setHeader("Content-Type", archivo.tipoMime);
  res.setHeader("Content-Length", String(archivo.bytes));
  res.setHeader("Content-Disposition", `${disposicion}; filename="${archivo.nombre.replace(/"/g, "")}"`);
  // Nada de caché compartida: esto es documentación personal.
  res.setHeader("Cache-Control", "private, no-store");
  res.send(datos);
});

archivosRouter.delete("/:id", async (req, res) => {
  const usuario = req.usuario!;
  const archivo = await prisma.archivo.findUnique({ where: { id: req.params.id }, include: { documentos: { select: { id: true } } } });
  if (!archivo) return res.status(404).json({ error: "No encontrado" });
  if (archivo.organizacionId !== usuario.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (!esGestorOrganizacion(usuario) && archivo.subidoPorId !== usuario.sub) return res.status(403).json({ error: "Sin permiso" });
  if (archivo.documentos.length > 0) {
    return res.status(409).json({ error: "Hay un documento que usa este archivo: bórralo desde el documento" });
  }

  await borrar(archivo.ruta);
  await prisma.archivo.delete({ where: { id: archivo.id } });
  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: usuario.organizacionId,
    accion: "borrar_archivo",
    entidadTipo: "Archivo",
    entidadId: archivo.id,
  });
  res.status(204).end();
});
