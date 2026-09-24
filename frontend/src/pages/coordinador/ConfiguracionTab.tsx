import { useState, type SVGProps } from "react";
import { EmpresaTab } from "./EmpresaTab.js";
import { ServiciosTab } from "./ServiciosTab.js";
import { ReglasTab } from "./ReglasTab.js";
import { ProteccionDatosTab } from "./ProteccionDatosTab.js";
import { EmpresasTab } from "./EmpresasTab.js";
import { EquipoTab } from "./EquipoTab.js";
import { IconBuilding, IconHandshake, IconSettings, IconShield, IconTag, IconUsersGroup } from "../../components/icons.js";

// ---------------------------------------------------------------------------
// Configuración
//
// Lo que se pone una vez y se toca de tarde en tarde. Antes eran siete
// entradas del menú que había que leerse todos los días para no encontrar
// ninguna de ellas: ahora es una sola, y dentro están todas.
//
// El orden no es alfabético, es el de montar la casa: primero quién eres
// —sin identidad fiscal no se puede facturar—, luego qué ofreces, con qué
// reglas, con quién y, al final, las dos cosas que la ley obliga a tener
// puestas.
// ---------------------------------------------------------------------------

type Seccion = "empresa" | "catalogo" | "reglas" | "colaboradoras" | "equipo" | "proteccion";

const SECCIONES: { clave: Seccion; titulo: string; ayuda: string; icon: (p: SVGProps<SVGSVGElement>) => JSX.Element }[] = [
  { clave: "empresa", titulo: "Mi empresa", ayuda: "Identidad fiscal, seguros y cobro", icon: IconBuilding },
  { clave: "catalogo", titulo: "Catálogo de servicios", ayuda: "Qué se ofrece y con qué IVA", icon: IconTag },
  { clave: "reglas", titulo: "Reglas de negocio", ayuda: "Tiempo, redondeos y suelo por hora", icon: IconSettings },
  { clave: "colaboradoras", titulo: "Empresas colaboradoras", ayuda: "Con contrato de encargo", icon: IconHandshake },
  { clave: "equipo", titulo: "Equipo interno", ayuda: "Quién trabaja en la oficina", icon: IconUsersGroup },
  { clave: "proteccion", titulo: "Protección de datos", ayuda: "Plazos, registro y derechos", icon: IconShield },
];

export function ConfiguracionTab({ seccionInicial }: { seccionInicial?: Seccion }) {
  const [seccion, setSeccion] = useState<Seccion>(seccionInicial ?? "empresa");

  return (
    <div className="space-y-4">
      {/* Las secciones, en fichas y no en una fila de pestañas: cada una
          necesita una línea que diga qué hay dentro, porque "Reglas" a secas
          no le dice nada a quien entra por primera vez. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SECCIONES.map((s) => {
          const activa = s.clave === seccion;
          return (
            <button
              key={s.clave}
              onClick={() => setSeccion(s.clave)}
              className={`flex items-center gap-3 rounded-tarjeta border p-3 text-left transition ${
                activa ? "border-brand bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  activa ? "bg-brand text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                <s.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-sm font-semibold ${activa ? "text-brand-800" : "text-slate-800"}`}>
                  {s.titulo}
                </span>
                <span className="block truncate text-xs text-slate-400">{s.ayuda}</span>
              </span>
            </button>
          );
        })}
      </div>

      {seccion === "empresa" && <EmpresaTab />}
      {seccion === "catalogo" && <ServiciosTab />}
      {seccion === "reglas" && <ReglasTab />}
      {seccion === "colaboradoras" && <EmpresasTab />}
      {seccion === "equipo" && <EquipoTab />}
      {seccion === "proteccion" && <ProteccionDatosTab />}
    </div>
  );
}
