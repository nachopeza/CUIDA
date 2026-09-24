import { IconCheck, IconX } from "../../components/icons.js";

// ---------------------------------------------------------------------------
// Permisos
//
// Quién ve qué. No es una pantalla de configuración: los permisos de CUIDA
// no son casillas que alguien marca a gusto, son reglas del sistema —muchas
// de ellas obligaciones legales— y el servidor las aplica en cada llamada,
// no la pantalla.
//
// Esto es esa tabla, escrita para poder enseñársela a quien pregunte: a una
// familia que quiere saber qué ve el profesional que entra en casa, o a una
// inspección que pregunta por el principio de mínimo acceso del art. 5.1.c
// del RGPD.
//
// Lo único que sí se toca persona a persona son los tres permisos del
// familiar autorizado, y se tocan donde tienen sentido: en la ficha de la
// persona a la que representa.
// ---------------------------------------------------------------------------

type Nivel = true | false | "propio" | "parcial";

interface Fila {
  que: string;
  nota?: string;
  persona: Nivel;
  familiar: Nivel;
  profesional: Nivel;
  coordinacion: Nivel;
}

const FILAS: Fila[] = [
  {
    que: "Sus propios datos y servicios",
    persona: true,
    familiar: "parcial",
    profesional: "propio",
    coordinacion: true,
    nota: "El familiar ve los de la persona que representa, si se le ha concedido.",
  },
  {
    que: "Datos de otras personas atendidas",
    persona: false,
    familiar: false,
    profesional: "parcial",
    coordinacion: true,
    nota: "El profesional ve sólo a quien tiene asignado, y sólo mientras lo tiene asignado.",
  },
  {
    que: "Datos de salud y plan de cuidados",
    persona: true,
    familiar: "parcial",
    profesional: "parcial",
    coordinacion: true,
    nota: "Al profesional le llega lo que necesita para prestar el servicio, no la historia entera.",
  },
  {
    que: "Lo que se le cobra a la familia",
    persona: false,
    familiar: "parcial",
    profesional: false,
    coordinacion: true,
    nota: "La persona atendida nunca ve importes; el familiar, sólo con el permiso de ver importes.",
  },
  {
    que: "Lo que cobra el profesional",
    persona: false,
    familiar: false,
    profesional: "propio",
    coordinacion: true,
  },
  {
    que: "La comisión de CUIDA",
    persona: false,
    familiar: false,
    profesional: false,
    coordinacion: true,
    nota: "Ni la familia ni el profesional la ven: es el margen de la empresa.",
  },
  {
    que: "Facturas emitidas",
    persona: false,
    familiar: "parcial",
    profesional: false,
    coordinacion: true,
    nota: "Los borradores no salen de coordinación: una factura sin emitir todavía puede cambiar.",
  },
  { que: "Pedir un servicio", persona: true, familiar: "parcial", profesional: false, coordinacion: true },
  { que: "Aceptar o rechazar un servicio", persona: false, familiar: false, profesional: "propio", coordinacion: true },
  { que: "Fichar entrada y salida", persona: false, familiar: false, profesional: "propio", coordinacion: false },
  {
    que: "Corregir un fichaje",
    persona: false,
    familiar: false,
    profesional: false,
    coordinacion: true,
    nota: "Y queda registrado con el original, quién lo cambió y por qué: el fichaje no se sobrescribe.",
  },
  { que: "Abrir una incidencia", persona: true, familiar: "parcial", profesional: true, coordinacion: true },
  { que: "Verificar una jornada", persona: false, familiar: false, profesional: false, coordinacion: true },
  { que: "Emitir facturas y liquidaciones", persona: false, familiar: false, profesional: false, coordinacion: true },
  { que: "Borrar datos fuera de plazo", persona: false, familiar: false, profesional: false, coordinacion: true },
  {
    que: "El registro de actividad",
    persona: false,
    familiar: false,
    profesional: false,
    coordinacion: true,
    nota: "Quién ha hecho qué y cuándo. Se guarda siempre y no se puede desactivar.",
  },
];

const COLUMNAS: { clave: keyof Omit<Fila, "que" | "nota">; titulo: string; sub: string }[] = [
  { clave: "persona", titulo: "Persona atendida", sub: "quien recibe el cuidado" },
  { clave: "familiar", titulo: "Familiar autorizado", sub: "con permiso concedido" },
  { clave: "profesional", titulo: "Profesional", sub: "quien va a casa" },
  { clave: "coordinacion", titulo: "Coordinación", sub: "la oficina" },
];

function Marca({ nivel }: { nivel: Nivel }) {
  if (nivel === true)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-700" title="Sí">
        <IconCheck className="h-3.5 w-3.5" />
      </span>
    );
  if (nivel === false)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400" title="No">
        <IconX className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span
      className="pastilla bg-amber-50 text-amber-700"
      title={nivel === "propio" ? "Sólo lo suyo" : "Sólo en parte, según el caso"}
    >
      {nivel === "propio" ? "Lo suyo" : "En parte"}
    </span>
  );
}

export function PermisosTab() {
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-slate-500">
        Quién ve qué y quién puede hacer qué. No se configura desde aquí: estas reglas las aplica el servidor en cada llamada, y
        varias son obligaciones legales, no preferencias. Los tres permisos que sí se conceden uno a uno —pedir servicios, ver
        historial y ver importes— son los del familiar autorizado, y se conceden en la ficha de la persona a la que representa.
      </p>

      <div className="overflow-x-auto tarjeta">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-[#f1f7fa] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Qué</th>
              {COLUMNAS.map((c) => (
                <th key={c.clave} className="px-4 py-2.5 text-center">
                  <span className="block text-[11px] text-slate-500">{c.titulo}</span>
                  <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">{c.sub}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {FILAS.map((f) => (
              <tr key={f.que} className="align-top transition hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <span className="block font-medium text-slate-800">{f.que}</span>
                  {f.nota && <span className="block max-w-lg text-xs text-slate-400">{f.nota}</span>}
                </td>
                {COLUMNAS.map((c) => (
                  <td key={c.clave} className="px-4 py-3 text-center">
                    <Marca nivel={f[c.clave]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        «Lo suyo» quiere decir que sólo ve lo que le pertenece: sus jornadas, sus horas, su liquidación. «En parte» quiere decir
        que depende del caso: del permiso concedido a ese familiar o del servicio que ese profesional tiene asignado.
      </p>
    </div>
  );
}
