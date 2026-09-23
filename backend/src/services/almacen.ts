import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Almacén de archivos
//
// Los ficheros no van en la base de datos: van a disco y en la base queda su
// ficha. En producción esta carpeta se sustituye por un bucket de objetos
// (S3 o equivalente) cambiando solo `guardar` y `leer` — el resto del sistema
// habla con este módulo y no sabe dónde están.
//
// Tres decisiones que no son opcionales cuando lo que se guarda es el DNI de
// alguien o un certificado de antecedentes:
//
//   1. El nombre del fichero lo pone el servidor, nunca quien sube. Un nombre
//      de fichero es texto del usuario y "../../etc/passwd" es un nombre.
//   2. El tipo se comprueba por los primeros bytes del contenido, no por la
//      cabecera Content-Type, que la escribe el cliente y puede mentir.
//   3. No hay carpeta pública: nada se sirve como estático. Se descarga por
//      un endpoint que antes comprueba quién pregunta.
// ---------------------------------------------------------------------------

// La carpeta del almacén, fuera del código y fuera de lo que se publica.
const RAIZ = resolve(process.env.ALMACEN_DIR ?? "almacen");

// 10 MB. Un PDF escaneado de un certificado cabe de sobra; una foto de móvil
// sin comprimir también. Por encima de eso casi siempre es un error.
export const BYTES_MAX = 10 * 1024 * 1024;

interface TipoPermitido {
  mime: string;
  extension: string;
  // Los primeros bytes que identifican el formato de verdad.
  firma: number[];
  // Algunos formatos tienen la firma desplazada (no es el caso de estos, pero
  // el campo evita tener que reescribir la comprobación si se añade uno).
  desplazamiento: number;
}

const TIPOS: TipoPermitido[] = [
  { mime: "application/pdf", extension: "pdf", firma: [0x25, 0x50, 0x44, 0x46], desplazamiento: 0 }, // %PDF
  { mime: "image/jpeg", extension: "jpg", firma: [0xff, 0xd8, 0xff], desplazamiento: 0 },
  { mime: "image/png", extension: "png", firma: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], desplazamiento: 0 },
];

export const TIPOS_ACEPTADOS = TIPOS.map((t) => t.mime);

// Qué es este contenido en realidad. Devuelve null si no es ninguno de los
// formatos que aceptamos, aunque la cabecera diga que sí.
function tipoReal(datos: Buffer): TipoPermitido | null {
  for (const tipo of TIPOS) {
    const trozo = datos.subarray(tipo.desplazamiento, tipo.desplazamiento + tipo.firma.length);
    if (trozo.length === tipo.firma.length && tipo.firma.every((b, i) => trozo[i] === b)) return tipo;
  }
  return null;
}

export class ArchivoRechazado extends Error {}

export interface ArchivoGuardado {
  ruta: string;
  hash: string;
  bytes: number;
  tipoMime: string;
  extension: string;
}

// Un nombre presentable para enseñar y para la descarga. No se usa como ruta:
// se limpia solo para que el navegador no reciba caracteres raros en la
// cabecera Content-Disposition.
export function nombreLimpio(nombre: string): string {
  const base = nombre.replace(/[\\/\u0000-\u001f]/g, " ").trim();
  return (base || "documento").slice(0, 120);
}

export async function guardar(datos: Buffer, organizacionId: string, id: string): Promise<ArchivoGuardado> {
  if (datos.length === 0) throw new ArchivoRechazado("El archivo está vacío");
  if (datos.length > BYTES_MAX) {
    throw new ArchivoRechazado(`El archivo pesa ${(datos.length / 1048576).toFixed(1)} MB y el máximo son ${BYTES_MAX / 1048576} MB`);
  }

  const tipo = tipoReal(datos);
  if (!tipo) {
    throw new ArchivoRechazado("Solo se aceptan PDF, JPG y PNG. Este archivo no es ninguno de los tres, aunque lo parezca por su nombre");
  }

  // La ruta la compone el servidor a partir del id que él mismo ha generado:
  // nada de lo que venga de fuera entra en ella.
  const ruta = join(organizacionId, `${id}.${tipo.extension}`);
  const destino = join(RAIZ, ruta);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, datos);

  return {
    ruta,
    hash: createHash("sha256").update(datos).digest("hex"),
    bytes: datos.length,
    tipoMime: tipo.mime,
    extension: tipo.extension,
  };
}

export async function leer(ruta: string): Promise<Buffer> {
  // Aunque la ruta la escribe el servidor, se comprueba que el camino
  // resultante siga cayendo dentro del almacén: si algún día una ruta llega
  // de otro sitio, no se sale de aquí.
  const destino = resolve(RAIZ, ruta);
  if (!destino.startsWith(RAIZ + "/")) throw new ArchivoRechazado("Ruta fuera del almacén");
  return readFile(destino);
}

export async function borrar(ruta: string): Promise<void> {
  const destino = resolve(RAIZ, ruta);
  if (!destino.startsWith(RAIZ + "/")) return;
  await unlink(destino).catch(() => {
    // Si el fichero ya no está, la ficha se borra igual: lo que no puede
    // quedar es una fila apuntando a algo que nadie puede leer.
  });
}
