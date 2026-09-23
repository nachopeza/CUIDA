import { prisma } from "../lib/prisma.js";
import type { TokenPayload } from "../lib/jwt.js";

// Matriz de roles/permisos (sección 4). Minimización: el acceso a una
// persona concreta requiere ser la propia persona, un familiar autorizado no
// revocado, o pertenecer a la organización que la atiende.
export async function puedeAccederPersona(usuario: TokenPayload, personaId: string): Promise<boolean> {
  if (usuario.rol === "SUPERADMIN") return true;
  if (usuario.rol === "PERSONA") return usuario.personaId === personaId;

  if (usuario.rol === "FAMILIAR") {
    const relacion = await prisma.familiarRelacion.findFirst({
      where: { personaId, usuarioId: usuario.sub, revocadoAt: null },
    });
    return relacion !== null;
  }

  if (usuario.rol === "COORDINADOR" || usuario.rol === "ORGANIZACION" || usuario.rol === "ADMIN") {
    const persona = await prisma.persona.findUnique({ where: { id: personaId } });
    return persona?.organizacionId === usuario.organizacionId;
  }

  // Profesional: solo cuando tiene un servicio asignado para esa persona
  // (necesita el perfil — dirección, medicación, médico — para hacer la
  // visita; nunca la tarifa, que se filtra aparte).
  if (usuario.rol === "PROFESIONAL") {
    const servicio = await prisma.servicio.findFirst({
      where: { profesionalId: usuario.profesionalId ?? "__none__", solicitud: { personaId } },
    });
    return servicio !== null;
  }

  return false;
}

export function esGestorOrganizacion(usuario: TokenPayload): boolean {
  return ["COORDINADOR", "ORGANIZACION", "ADMIN", "SUPERADMIN"].includes(usuario.rol);
}

// La tarifa/importe de un servicio es información económica: la persona
// atendida nunca la ve (sección "que Herminia no debe ver"); un familiar la
// ve solo si su relación se lo autoriza explícitamente (puedeVerImportes).
// Los gestores de la organización siempre la ven; el profesional asignado no
// necesita verla para hacer su trabajo, así que tampoco se le muestra.
export async function puedeVerImportes(usuario: TokenPayload, personaId: string): Promise<boolean> {
  if (esGestorOrganizacion(usuario)) return true;
  if (usuario.rol === "FAMILIAR") {
    const relacion = await prisma.familiarRelacion.findFirst({
      where: { personaId, usuarioId: usuario.sub, revocadoAt: null },
    });
    return relacion?.puedeVerImportes ?? false;
  }
  return false;
}

const CAMPOS_TARIFA = [
  "tarifaImporte",
  "tarifaTipo",
  "tarifaNotas",
  "empresaColaboradora",
  "empresaColaboradoraId",
  "pagoProfesionalEstado",
  "comisionImporte",
  // El precio de la hora y el porcentaje de CUIDA faltaban en esta lista, así
  // que viajaban a cualquiera que no tuviera permiso para ver importes: con
  // el precio/hora y los minutos se reconstruye lo que paga la familia, y con
  // el porcentaje, el margen.
  "precioHora",
  "comisionPorcentaje",
  "importeProfesional",
  "facturaId",
  "ivaPorcentaje",
  "ivaImporte",
  "totalConIva",
  // El motor de tiempo dejó estas cifras escritas en cada jornada. Viajan con
  // la visita, no con el servicio, así que había que añadirlas: si no, el
  // importe que se le esconde en el servicio reaparecía en sus jornadas.
  "precioHoraCliente",
  "precioHoraProfesional",
  "importeCliente",
  "importeCuida",
] as const;

// Elimina del objeto Servicio (o de una Solicitud con .servicio anidado) los
// campos económicos cuando el solicitante no tiene permiso para verlos.
// Los mismos campos pueden venir en el objeto o en sus jornadas anidadas, así
// que el filtro baja también por ahí. Antes cada ruta tenía que acordarse de
// limpiar las visitas una por una, y basta con olvidar una para filtrar dinero.
function limpiarRecursivo(objeto: Record<string, unknown>, campos: readonly string[]): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...objeto };
  for (const campo of campos) delete copia[campo];

  if (Array.isArray(copia.visitas)) {
    copia.visitas = copia.visitas.map((v) => (v && typeof v === "object" ? limpiarRecursivo(v as Record<string, unknown>, campos) : v));
  }
  if (copia.visita && typeof copia.visita === "object") {
    copia.visita = limpiarRecursivo(copia.visita as Record<string, unknown>, campos);
  }
  if (copia.servicio && typeof copia.servicio === "object") {
    copia.servicio = limpiarRecursivo(copia.servicio as Record<string, unknown>, campos);
  }
  return copia;
}

export function ocultarTarifaSiProcede<T extends Record<string, unknown>>(servicio: T | null | undefined, visible: boolean): T | null | undefined {
  if (!servicio || visible) return servicio;
  return limpiarRecursivo(servicio, CAMPOS_TARIFA) as T;
}

// Lo que paga la familia y el margen de CUIDA no son asunto del profesional,
// pero lo que él cobra sí: es su nómina. La función de arriba lo borraba
// todo por igual, así que un profesional no podía ver lo que iba a cobrar.
// Esta deja su parte y esconde el resto.
const CAMPOS_SOLO_DE_COORDINACION = [
  "tarifaImporte",
  "tarifaNotas",
  // Con qué empresa se factura a la familia es un acuerdo de coordinación.
  "empresaColaboradora",
  "empresaColaboradoraId",
  "comisionImporte",
  "comisionPorcentaje",
  "precioHora",
  "ivaPorcentaje",
  "ivaImporte",
  "totalConIva",
  "facturaId",
  // Del motor de tiempo: lo que paga la familia y el margen no son asunto del
  // profesional. Su precio/hora y su importe sí se quedan: es su nómina.
  "precioHoraCliente",
  "importeCliente",
  "importeCuida",
];

export function soloLoQueCobraElProfesional<T extends Record<string, unknown>>(servicio: T | null | undefined): T | null | undefined {
  if (!servicio) return servicio;
  return limpiarRecursivo(servicio, CAMPOS_SOLO_DE_COORDINACION) as T;
}

export function scopeOrganizacion(usuario: TokenPayload): { organizacionId: string } | {} {
  if (usuario.rol === "SUPERADMIN") return {};
  return { organizacionId: usuario.organizacionId ?? "__none__" };
}

// Lo que nunca sale de coordinación, ni aunque el familiar esté autorizado a
// ver importes: el margen de CUIDA y lo que se le paga al profesional. La
// familia tiene derecho a saber qué paga y por qué; cuánto gana la empresa y
// cuánto cobra la cuidadora son acuerdos de otros dos contratos.
const CAMPOS_SOLO_INTERNOS = [
  "comisionImporte",
  "comisionPorcentaje",
  "importeProfesional",
  "precioHoraProfesional",
  "importeCuida",
];

// Un único sitio donde se decide qué parte de la economía ve cada rol, para no
// tener que acordarse en cada ruta:
//
//   coordinación   lo ve todo
//   profesional    lo que cobra él
//   familiar        lo que paga la familia, si su relación lo autoriza
//   persona         nada
export function filtrarEconomia<T extends Record<string, unknown>>(
  objeto: T | null | undefined,
  usuario: TokenPayload,
  veImportes: boolean,
): T | null | undefined {
  if (!objeto) return objeto;
  if (esGestorOrganizacion(usuario)) return objeto;
  if (usuario.rol === "PROFESIONAL") return soloLoQueCobraElProfesional(objeto);
  if (!veImportes) return ocultarTarifaSiProcede(objeto, false);
  return limpiarRecursivo(objeto, CAMPOS_SOLO_INTERNOS) as T;
}
