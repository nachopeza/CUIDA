import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.js";
import { IconAlert, IconCheckCircle, IconShield, IconTrash } from "../../components/icons.js";

// ---------------------------------------------------------------------------
// Protección de datos
//
// El RGPD tiene dos filos y los dos son infracción: guardar de menos —el
// registro de jornada, la factura— y guardar de más. Esta pantalla enseña el
// plazo de cada categoría con la norma de la que sale, y qué ha pasado ya ese
// plazo.
//
// Nada se borra solo. Un borrado automático mal configurado destruye justo la
// prueba que la ley obliga a conservar, así que la purga la pide una persona
// que antes ha visto lo que se lleva por delante.
// ---------------------------------------------------------------------------

interface Politica {
  mesesRegistroJornada: number;
  mesesDocumentacionLaboral: number;
  mesesFacturacion: number;
  mesesMandatoSepa: number;
  mesesDatosAsistenciales: number;
  mesesCertificadoPenales: number;
  mesesAuditoria: number;
  mesesMensajes: number;
  responsableNombre: string | null;
  responsableEmail: string | null;
  delegadoNombre: string | null;
  delegadoEmail: string | null;
}

interface Vencido {
  categoria: string;
  etiqueta: string;
  queEs: string;
  baseLegal: string;
  obligaAGuardar: boolean;
  meses: number;
  desdeCuando: string;
  cuantos: number;
  masAntiguo: string | null;
}

function enAnios(meses: number): string {
  if (meses === 0) return "sin plazo: se borra en cuanto se pide";
  if (meses % 12 === 0) return `${meses / 12} ${meses === 12 ? "año" : "años"}`;
  return `${meses} meses`;
}

export function ProteccionDatosTab() {
  const { token } = useAuth();
  const [politica, setPolitica] = useState<Politica | null>(null);
  const [vencidos, setVencidos] = useState<Vencido[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purgando, setPurgando] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState("");

  async function cargar() {
    const [p, v] = await Promise.all([
      api.get<{ politica: Politica }>("/proteccion-datos/politica", token),
      api.get<Vencido[]>("/proteccion-datos/vencidos", token),
    ]);
    setPolitica(p.politica);
    setVencidos(v);
  }
  useEffect(() => {
    void cargar();
  }, [token]);

  const [descargandoRegistro, setDescargandoRegistro] = useState(false);

  async function descargarRegistro() {
    setDescargandoRegistro(true);
    try {
      const registro = await api.get<unknown>("/proteccion-datos/registro-actividades", token);
      const blob = new Blob([JSON.stringify(registro, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `registro-actividades-tratamiento-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargandoRegistro(false);
    }
  }

  async function guardar() {
    if (!politica) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      await api.put("/proteccion-datos/politica", politica, token);
      await cargar();
      setAviso("Plazos guardados. Cambiarlos no borra nada: solo cambia qué se considera fuera de plazo.");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function purgar(v: Vencido) {
    setError(null);
    setAviso(null);
    try {
      const r = await api.post<{ borrados: number; detalle: string }>(
        "/proteccion-datos/purgar",
        { categoria: v.categoria, confirmacion },
        token,
      );
      setPurgando(null);
      setConfirmacion("");
      await cargar();
      setAviso(`${v.etiqueta}: ${r.borrados} ${r.detalle}. Queda registrado en la actividad con su plazo y su base legal.`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido purgar");
    }
  }

  if (!politica) return <p className="text-sm text-slate-500">Cargando…</p>;

  const set = <K extends keyof Politica>(k: K, val: Politica[K]) => setPolitica({ ...politica, [k]: val });
  const campo = (v: Vencido) =>
    ({
      REGISTRO_JORNADA: "mesesRegistroJornada",
      DOCUMENTACION_LABORAL: "mesesDocumentacionLaboral",
      FACTURACION: "mesesFacturacion",
      MANDATO_SEPA: "mesesMandatoSepa",
      DATOS_ASISTENCIALES: "mesesDatosAsistenciales",
      CERTIFICADO_PENALES: "mesesCertificadoPenales",
      AUDITORIA: "mesesAuditoria",
      MENSAJES: "mesesMensajes",
    })[v.categoria] as keyof Politica;

  const hayVencidos = vencidos.some((v) => v.cuantos > 0);

  return (
    <div className="space-y-5">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <IconShield className="h-5 w-5 text-slate-400" aria-hidden /> Protección de datos
        </h2>
        <p className="mt-0.5 max-w-3xl text-sm text-slate-500">
          Cuánto tiempo se guarda cada cosa y por qué. El RGPD se incumple por los dos lados: borrando antes de tiempo lo que hay
          obligación de conservar, y guardando indefinidamente lo que ya no hace falta.
        </p>
      </header>

      {/* Esto no es asesoría jurídica y conviene que lo diga la propia
          pantalla, no solo la documentación: quien cambie un plazo aquí tiene
          que saber de dónde salen los que vienen puestos. */}
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        Los plazos que trae CUIDA son los que se citan habitualmente en España y cada uno lleva su norma al lado, pero{" "}
        <strong>no son asesoría jurídica</strong>: confírmalos con la vuestra y ajústalos aquí. Quien responde de que sean
        correctos es el responsable del tratamiento, no la aplicación.
      </p>

      {/* El art. 30 pide tener este documento y enseñarlo cuando lo pidan.
          Generarlo desde lo que la aplicación ya hace evita el Word que se
          queda viejo en cuanto cambia un plazo. */}
      <section className="tarjeta p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-700">Registro de actividades de tratamiento</h3>
            <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
              El documento del art. 30 del RGPD: qué trata esta empresa, con qué finalidad, con qué base jurídica, a quién llega y
              cuánto se guarda. Se genera con los plazos que la aplicación aplica de verdad, no con los que alguien escribió una vez.
            </p>
          </div>
          <button
            onClick={descargarRegistro}
            disabled={descargandoRegistro}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {descargandoRegistro ? "Generando…" : "Descargar registro"}
          </button>
        </div>
      </section>

      <section className="tarjeta p-4">
        <h3 className="text-sm font-semibold text-slate-700">Quién responde</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Va en la información que se entrega a las personas y en la respuesta a un derecho de acceso. Sin esto, la copia que se
          entrega no dice a quién dirigirse.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">
            Responsable del tratamiento
            <input
              value={politica.responsableNombre ?? ""}
              onChange={(e) => set("responsableNombre", e.target.value)}
              placeholder="CUIDA Cantabria S.L."
              className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            Correo de contacto
            <input
              value={politica.responsableEmail ?? ""}
              onChange={(e) => set("responsableEmail", e.target.value)}
              placeholder="proteccion.datos@…"
              className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            Delegado de protección de datos (si lo hay)
            <input
              value={politica.delegadoNombre ?? ""}
              onChange={(e) => set("delegadoNombre", e.target.value)}
              className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            Su correo
            <input
              value={politica.delegadoEmail ?? ""}
              onChange={(e) => set("delegadoEmail", e.target.value)}
              className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </section>

      <section className="tarjeta p-4">
        <h3 className="text-sm font-semibold text-slate-700">Plazos de conservación</h3>
        <div className="mt-3 space-y-2.5">
          {vencidos.map((v) => (
            <div key={v.categoria} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                    {v.etiqueta}
                    {/* La diferencia importa: en una categoría que obliga a
                        guardar, borrar antes de tiempo es la infracción. */}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        v.obligaAGuardar ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {v.obligaAGuardar ? "Hay que guardarlo" : "No se puede guardar de más"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{v.queEs}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {v.baseLegal} · cuenta {v.desdeCuando}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={politica[campo(v)] as number}
                    onChange={(e) => set(campo(v), Number(e.target.value) as never)}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-center text-sm"
                  />
                  meses
                  <span className="hidden text-slate-400 sm:inline">({enAnios(politica[campo(v)] as number)})</span>
                </label>
              </div>

              {v.cuantos > 0 && (
                <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-orange-800">
                    <IconAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {v.cuantos} {v.cuantos === 1 ? "registro ha pasado" : "registros han pasado"} su plazo
                    {v.masAntiguo && ` · el más antiguo es de ${new Date(v.masAntiguo).toLocaleDateString("es-ES")}`}
                  </p>
                  {purgando === v.categoria ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        value={confirmacion}
                        onChange={(e) => setConfirmacion(e.target.value)}
                        placeholder={`Escribe "${v.etiqueta}" para confirmar`}
                        className="min-w-0 flex-1 rounded-md border border-orange-300 px-2 py-1.5 text-xs"
                      />
                      <button
                        onClick={() => purgar(v)}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                      >
                        Borrar definitivamente
                      </button>
                      <button
                        onClick={() => {
                          setPurgando(null);
                          setConfirmacion("");
                        }}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Dejarlo
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setPurgando(v.categoria);
                        setConfirmacion("");
                      }}
                      className="mt-1.5 rounded-md border border-orange-300 bg-white px-2.5 py-1 text-xs font-medium text-orange-800 hover:bg-orange-100"
                    >
                      <IconTrash className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
                      Revisar y borrar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {!hayVencidos && (
          <p className="mt-3 flex items-center gap-2 rounded-md bg-brand-green-50 px-3 py-2 text-xs text-brand-green-700">
            <IconCheckCircle className="h-4 w-4 shrink-0" aria-hidden />
            Nada ha pasado su plazo. No hay nada que borrar.
          </p>
        )}
      </section>

      {aviso && <p className="rounded-md border border-brand-green-200 bg-brand-green-50 px-3 py-2 text-xs text-brand-green-700">{aviso}</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      <button
        onClick={guardar}
        disabled={guardando}
        className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar los plazos"}
      </button>

      <p className="text-xs text-slate-400">
        Cada borrado queda en Actividad con qué se borró, cuántos registros, el plazo aplicado y la norma. La copia de datos de
        una persona (derecho de acceso, arts. 15 y 20 del RGPD) se descarga desde su ficha.
      </p>
    </div>
  );
}
