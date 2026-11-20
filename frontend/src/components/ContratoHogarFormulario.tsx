import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { diaDe } from "../lib/fechas.js";
import { euros } from "../lib/economia.js";
import type { ContratoHogar, Persona } from "../lib/types.js";
import { Modal } from "./Modal.js";

// El formulario del contrato de empleo de hogar: alta o edición. Va por partes
// —el hogar, la trabajadora, las condiciones y lo que cobra CUIDA— porque son
// cuatro conversaciones distintas con la familia.

const VACIO = {
  personaId: "",
  titularNombre: "",
  titularNif: "",
  trabajadoraNombre: "",
  trabajadoraApellidos: "",
  trabajadoraDni: "",
  trabajadoraNaf: "",
  trabajadoraTelefono: "",
  trabajadoraIban: "",
  jornada: "EXTERNA" as "EXTERNA" | "INTERNA",
  horasSemanales: "20",
  horario: "",
  salarioBrutoMensual: "",
  pagasExtra: "2",
  prorrateaPagas: false,
  fechaInicio: "",
  cuotaGestionMensual: "45",
  cuotaAlta: "90",
  notas: "",
};

function Seccion({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-4 sm:col-span-2 sm:grid-cols-2">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-brand-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-green-100 text-xs font-bold text-brand-green-700">{numero}</span>
        {titulo}
      </legend>
      {children}
    </fieldset>
  );
}

export function ContratoHogarFormulario({
  contrato,
  personaId,
  solicitudId,
  inicial,
  onSaved,
  onCancelar,
}: {
  contrato: ContratoHogar | null;
  personaId?: string;
  solicitudId?: string;
  // Condiciones ya conocidas (las que pidió la familia en su solicitud).
  inicial?: Partial<typeof VACIO>;
  onSaved: (c: ContratoHogar) => void;
  onCancelar?: () => void;
}) {
  const { token } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [f, setF] = useState(() =>
    contrato
      ? {
          personaId: contrato.persona.id,
          titularNombre: contrato.titularNombre,
          titularNif: contrato.titularNif ?? "",
          trabajadoraNombre: contrato.trabajadoraNombre,
          trabajadoraApellidos: contrato.trabajadoraApellidos,
          trabajadoraDni: contrato.trabajadoraDni ?? "",
          trabajadoraNaf: contrato.trabajadoraNaf ?? "",
          trabajadoraTelefono: contrato.trabajadoraTelefono ?? "",
          trabajadoraIban: contrato.trabajadoraIban ?? "",
          jornada: contrato.jornada,
          horasSemanales: String(contrato.horasSemanales),
          horario: contrato.horario ?? "",
          salarioBrutoMensual: String(Number(contrato.salarioBrutoMensual)),
          pagasExtra: String(contrato.pagasExtra),
          prorrateaPagas: contrato.prorrateaPagas,
          fechaInicio: diaDe(contrato.fechaInicio),
          cuotaGestionMensual: String(Number(contrato.cuotaGestionMensual)),
          cuotaAlta: contrato.cuotaAlta != null ? String(Number(contrato.cuotaAlta)) : "",
          notas: contrato.notas ?? "",
        }
      : { ...VACIO, ...inicial, personaId: personaId ?? "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (contrato || personaId) return;
    api.get<Persona[]>("/personas", token).then(setPersonas).catch(() => setPersonas([]));
  }, [contrato, personaId, token]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const salario = Number(f.salarioBrutoMensual || 0);
  const anual = salario * (12 + Number(f.pagasExtra));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.personaId) return setError("Elige a qué persona se le gestiona el contrato.");
    if (!f.fechaInicio) return setError("Pon el primer día de trabajo: el alta en la Seguridad Social tiene que estar antes.");
    setGuardando(true);
    const cuerpo = {
      personaId: f.personaId,
      solicitudId: solicitudId ?? undefined,
      titularNombre: f.titularNombre,
      titularNif: f.titularNif || null,
      trabajadoraNombre: f.trabajadoraNombre,
      trabajadoraApellidos: f.trabajadoraApellidos,
      trabajadoraDni: f.trabajadoraDni || null,
      trabajadoraNaf: f.trabajadoraNaf || null,
      trabajadoraTelefono: f.trabajadoraTelefono || null,
      trabajadoraIban: f.trabajadoraIban || null,
      jornada: f.jornada,
      horasSemanales: Number(f.horasSemanales),
      horario: f.horario || null,
      salarioBrutoMensual: salario,
      pagasExtra: Number(f.pagasExtra),
      prorrateaPagas: f.prorrateaPagas,
      fechaInicio: f.fechaInicio,
      cuotaGestionMensual: Number(f.cuotaGestionMensual || 0),
      cuotaAlta: f.cuotaAlta ? Number(f.cuotaAlta) : null,
      notas: f.notas || null,
    };
    try {
      const c = contrato
        ? await api.patch<ContratoHogar>(`/hogar/${contrato.id}`, { ...cuerpo, personaId: undefined, solicitudId: undefined }, token)
        : await api.post<ContratoHogar>("/hogar", cuerpo, token);
      onSaved(c);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
    } finally {
      setGuardando(false);
    }
  }

  const campo = (k: keyof typeof f, etiqueta: string, extra: Record<string, unknown> = {}, ancho = false) => (
    <label className={`text-xs text-slate-500 ${ancho ? "sm:col-span-2" : ""}`}>
      {etiqueta}
      <input value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} className="campo mt-0.5" {...extra} />
    </label>
  );

  return (
    <form onSubmit={guardar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Seccion numero={1} titulo="El hogar">
        {!contrato && !personaId && (
          <label className="text-xs text-slate-500 sm:col-span-2">
            Persona atendida
            <select value={f.personaId} onChange={(e) => set("personaId", e.target.value)} className="campo mt-0.5" required>
              <option value="">Elige…</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.apellidos} · {p.codigo}
                </option>
              ))}
            </select>
          </label>
        )}
        {campo("titularNombre", "Quién firma como empleador", { required: true, placeholder: "La persona o un familiar" })}
        {campo("titularNif", "Su NIF")}
      </Seccion>

      <Seccion numero={2} titulo="La trabajadora">
        {campo("trabajadoraNombre", "Nombre", { required: true })}
        {campo("trabajadoraApellidos", "Apellidos", { required: true })}
        {campo("trabajadoraDni", "DNI o NIE")}
        {campo("trabajadoraNaf", "Nº de afiliación a la Seguridad Social", { placeholder: "Si ya lo tiene" })}
        {campo("trabajadoraTelefono", "Teléfono")}
        {campo("trabajadoraIban", "Cuenta para la nómina (IBAN)")}
      </Seccion>

      <Seccion numero={3} titulo="Condiciones">
        <div className="sm:col-span-2">
          <p className="mb-1 text-xs text-slate-500">Tipo de jornada</p>
          <div className="flex gap-2">
            {(["EXTERNA", "INTERNA"] as const).map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => set("jornada", j)}
                className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition ${f.jornada === j ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                <span className="block font-medium">{j === "EXTERNA" ? "Externa" : "Interna"}</span>
                <span className={`block text-xs ${f.jornada === j ? "text-white/80" : "text-slate-400"}`}>{j === "EXTERNA" ? "Por horas, no vive en la casa" : "Vive en el domicilio"}</span>
              </button>
            ))}
          </div>
        </div>
        {campo("horasSemanales", "Horas a la semana", { type: "number", min: 1, max: 60, required: true })}
        {campo("fechaInicio", "Primer día de trabajo", { type: "date", required: true })}
        {campo("horario", "Horario", { placeholder: "Ej. de lunes a viernes, de 9:00 a 13:00" }, true)}
        {campo("salarioBrutoMensual", "Salario bruto al mes (€)", { type: "number", step: "0.01", min: 0, required: true })}
        <label className="text-xs text-slate-500">
          Pagas extra
          <select value={f.pagasExtra} onChange={(e) => set("pagasExtra", e.target.value)} className="campo mt-0.5">
            <option value="2">Dos (junio y diciembre)</option>
            <option value="1">Una</option>
            <option value="0">Ninguna</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
          <input type="checkbox" checked={f.prorrateaPagas} onChange={(e) => set("prorrateaPagas", e.target.checked)} className="h-4 w-4" />
          Prorratear las pagas extra en cada nómina
        </label>
        {salario > 0 && (
          <p className="rounded-lg bg-brand-green-50 px-3 py-2 text-sm text-brand-green-800 sm:col-span-2">
            Salario bruto anual: <strong>{euros(anual)}</strong>
            {f.prorrateaPagas ? ` · ${euros(anual / 12)} cada mes` : ""}.
          </p>
        )}
      </Seccion>

      <Seccion numero={4} titulo="Lo que cobra CUIDA">
        {campo("cuotaGestionMensual", "Cuota de gestión al mes (€)", { type: "number", step: "0.01", min: 0 })}
        {campo("cuotaAlta", "Cuota de alta, una vez (€)", { type: "number", step: "0.01", min: 0, placeholder: "Opcional" })}
        <p className="text-xs text-slate-500 sm:col-span-2">Se factura cada mes a la familia, con IVA del 21 %. La cuota de alta va en la primera factura.</p>
        <label className="text-xs text-slate-500 sm:col-span-2">
          Notas
          <textarea value={f.notas} onChange={(e) => set("notas", e.target.value)} rows={2} className="campo mt-0.5" />
        </label>
      </Seccion>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="boton-secundario">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={guardando} className="boton-principal">
          {guardando ? "Guardando…" : contrato ? "Guardar cambios" : "Crear contrato y empezar los trámites"}
        </button>
      </div>
    </form>
  );
}

export function NuevoContratoHogarModal({
  personaId,
  solicitudId,
  inicial,
  onClose,
  onCreado,
}: {
  personaId?: string;
  solicitudId?: string;
  inicial?: Partial<typeof VACIO>;
  onClose: () => void;
  onCreado: (c: ContratoHogar) => void;
}) {
  return (
    <Modal title="Nuevo contrato de empleo de hogar" onClose={onClose} size="lg">
      <ContratoHogarFormulario
        contrato={null}
        personaId={personaId}
        solicitudId={solicitudId}
        inicial={inicial}
        onCancelar={onClose}
        onSaved={(c) => {
          onCreado(c);
          onClose();
        }}
      />
    </Modal>
  );
}
