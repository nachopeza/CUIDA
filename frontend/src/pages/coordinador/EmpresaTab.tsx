import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.js";
import { IconAlert, IconBuilding, IconCheckCircle, IconEuro, IconReceipt, IconShield } from "../../components/icons.js";

// ---------------------------------------------------------------------------
// Mi empresa
//
// Hasta ahora la identidad fiscal existía solo en la base de datos: la factura
// la imprimía y nadie podía cambiarla. Aquí está entera y editable, agrupada
// por para qué sirve cada cosa y no por cómo está guardada.
//
// Y la pantalla se comprueba a sí misma. Un dato que falta no se descubre al
// configurar: se descubre el día que no se puede emitir una factura o generar
// el fichero del banco, que es el peor momento posible.
// ---------------------------------------------------------------------------

interface Empresa {
  nombre: string;
  razonSocial: string | null;
  cif: string | null;
  formaJuridica: string | null;
  direccionFiscal: string | null;
  codigoPostal: string | null;
  municipio: string | null;
  provincia: string | null;
  telefono: string | null;
  emailFacturacion: string | null;
  web: string | null;
  registroMercantil: string | null;
  registroTomo: string | null;
  registroFolio: string | null;
  registroHoja: string | null;
  cnae: string | null;
  epigrafeIae: string | null;
  ibanCobro: string | null;
  bicCobro: string | null;
  identificadorAcreedor: string | null;
  serieFactura: string;
  ivaPorDefecto: number;
  diasVencimiento: number;
  comisionPorcentaje: number;
  seguroAseguradora: string | null;
  seguroPoliza: string | null;
  seguroCobertura: number | null;
  seguroVencimiento: string | null;
  registroEntidadesNumero: string | null;
  registroEntidadesOrgano: string | null;
}

interface Carencia {
  campo: string;
  etiqueta: string;
  impide: string | null;
  porque: string;
}

interface Respuesta {
  organizacion: Empresa;
  bloqueantes: Carencia[];
  recomendadas: Carencia[];
  avisos: string[];
  numeracion?: { serie: string; ejercicio: number; emitidas: number };
}

function Bloque({ titulo, ayuda, icono: Icono, children }: { titulo: string; ayuda: string; icono: typeof IconBuilding; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <Icono className="h-4 w-4 text-slate-400" aria-hidden /> {titulo}
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">{ayuda}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function EmpresaTab() {
  const { token } = useAuth();
  const [d, setD] = useState<Respuesta | null>(null);
  const [form, setForm] = useState<Empresa | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const r = await api.get<Respuesta>("/organizacion", token);
    setD(r);
    setForm(r.organizacion);
  }
  useEffect(() => {
    void cargar();
  }, [token]);

  async function guardar() {
    if (!form) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await api.put<Respuesta>(
        "/organizacion",
        {
          ...form,
          seguroVencimiento: form.seguroVencimiento ? form.seguroVencimiento.slice(0, 10) : null,
          seguroCobertura: form.seguroCobertura ?? null,
        },
        token,
      );
      setD({ ...r, numeracion: d?.numeracion });
      setForm(r.organizacion);
      setAviso("Guardado. Lo que cambie aquí sale en las próximas facturas; las ya emitidas conservan los datos con los que se emitieron.");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (!d || !form) return <p className="text-sm text-slate-500">Cargando…</p>;

  const set = <K extends keyof Empresa>(k: K, v: Empresa[K]) => setForm({ ...form, [k]: v });
  const campo = (k: keyof Empresa, etiqueta: string, ayuda?: string, ancho = false) => (
    <label className={`text-xs text-slate-500 ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="font-medium text-slate-700">{etiqueta}</span>
      {ayuda && <span className="ml-1 text-slate-400">{ayuda}</span>}
      <input
        value={(form[k] as string) ?? ""}
        onChange={(e) => set(k, e.target.value as never)}
        className={`mt-1 block w-full rounded-md border px-2 py-1.5 text-sm ${
          d.bloqueantes.some((c) => c.campo === k) ? "border-rose-300 bg-rose-50" : "border-slate-300"
        }`}
      />
    </label>
  );
  const numero = (k: keyof Empresa, etiqueta: string, ayuda?: string, paso = "1") => (
    <label className="text-xs text-slate-500">
      <span className="font-medium text-slate-700">{etiqueta}</span>
      {ayuda && <span className="ml-1 text-slate-400">{ayuda}</span>}
      <input
        type="number"
        step={paso}
        value={(form[k] as number | null) ?? ""}
        onChange={(e) => set(k, (e.target.value === "" ? null : Number(e.target.value)) as never)}
        className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </label>
  );

  return (
    <div className="space-y-5">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <IconBuilding className="h-5 w-5 text-slate-400" aria-hidden /> Mi empresa
        </h2>
        <p className="mt-0.5 max-w-3xl text-sm text-slate-500">
          Lo que la empresa es ante Hacienda, ante el banco y ante quien contrata el servicio. Estos datos salen impresos en cada
          factura y viajan en cada fichero de remesas.
        </p>
      </header>

      {/* Lo primero, qué está roto. No al final del formulario: arriba, donde
          se ve sin desplazarse. */}
      {d.bloqueantes.length > 0 && (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-rose-800">
            <IconAlert className="h-4 w-4 shrink-0" aria-hidden />
            {d.bloqueantes.length === 1 ? "Falta un dato y hay cosas que no se pueden hacer" : `Faltan ${d.bloqueantes.length} datos y hay cosas que no se pueden hacer`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {d.bloqueantes.map((c) => (
              <li key={c.campo + c.porque} className="text-xs text-rose-700">
                <strong>{c.etiqueta}</strong>
                {c.impide && <> · impide: {c.impide}</>} — {c.porque}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.avisos.map((a) => (
        <p key={a} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
          {a}
        </p>
      ))}

      {d.bloqueantes.length === 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-brand-green-200 bg-brand-green-50 px-3 py-2 text-xs text-brand-green-700">
          <IconCheckCircle className="h-4 w-4 shrink-0" aria-hidden />
          La empresa está en condiciones de facturar y de generar remesas para el banco.
        </p>
      )}

      <Bloque
        titulo="Identidad fiscal"
        ayuda="Quien expide la factura. Sin esto una factura no es una factura, es un papel."
        icono={IconBuilding}
      >
        {campo("razonSocial", "Razón social", "como consta en el CIF")}
        {campo("cif", "CIF")}
        {campo("formaJuridica", "Forma jurídica", "S.L., S.A., autónomo…")}
        {campo("nombre", "Nombre comercial", "el que se usa dentro de la aplicación")}
        {campo("direccionFiscal", "Domicilio fiscal", undefined, true)}
        {campo("codigoPostal", "Código postal")}
        {campo("municipio", "Municipio")}
        {campo("provincia", "Provincia")}
        {campo("telefono", "Teléfono")}
        {campo("emailFacturacion", "Correo de facturación")}
        {campo("web", "Web")}
      </Bloque>

      <Bloque
        titulo="Datos registrales y actividad"
        ayuda="Una sociedad debe hacer constar sus datos del Registro Mercantil en las facturas (art. 24 de la Ley de Sociedades de Capital)."
        icono={IconReceipt}
      >
        {campo("registroMercantil", "Registro Mercantil", "p. ej. de Cantabria", true)}
        {campo("registroTomo", "Tomo")}
        {campo("registroFolio", "Folio")}
        {campo("registroHoja", "Hoja")}
        {campo("cnae", "CNAE", "actividad económica")}
        {campo("epigrafeIae", "Epígrafe de IAE", "el alta censal")}
      </Bloque>

      <Bloque
        titulo="Cobro y facturación"
        ayuda="La cuenta donde entra el dinero y cómo se numera lo que se emite."
        icono={IconEuro}
      >
        {campo("ibanCobro", "IBAN de cobro", undefined, true)}
        {campo("bicCobro", "BIC", "algunos bancos lo piden")}
        {campo("identificadorAcreedor", "Identificador de acreedor SEPA", "lo asigna el banco")}
        <label className="text-xs text-slate-500">
          <span className="font-medium text-slate-700">Serie de facturación</span>
          <input
            value={form.serieFactura}
            onChange={(e) => set("serieFactura", e.target.value.toUpperCase())}
            maxLength={4}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          {/* La numeración tiene que ser correlativa y sin huecos dentro de cada
              serie: cambiarla a mitad de ejercicio con facturas ya emitidas es
              justo lo que no puede pasar, y el servidor lo impide. */}
          {d.numeracion && d.numeracion.emitidas > 0 && (
            <span className="mt-1 block text-[11px] text-slate-400">
              {d.numeracion.emitidas} factura{d.numeracion.emitidas === 1 ? "" : "s"} emitida{d.numeracion.emitidas === 1 ? "" : "s"} en{" "}
              {d.numeracion.ejercicio}: la serie ya no se puede cambiar este ejercicio.
            </span>
          )}
        </label>
        {numero("ivaPorDefecto", "IVA por defecto", "%", "0.01")}
        {numero("diasVencimiento", "Días para pagar", "desde la emisión")}
        {numero("comisionPorcentaje", "Comisión de CUIDA", "% por defecto", "0.01")}
      </Bloque>

      <Bloque
        titulo="Seguros y autorización"
        ayuda="En ayuda a domicilio no son un extra: casi todas las comunidades los exigen para poder prestar el servicio."
        icono={IconShield}
      >
        {campo("seguroAseguradora", "Aseguradora")}
        {campo("seguroPoliza", "Nº de póliza de responsabilidad civil")}
        {numero("seguroCobertura", "Cobertura", "€", "0.01")}
        <label className="text-xs text-slate-500">
          <span className="font-medium text-slate-700">Vence el</span>
          <input
            type="date"
            value={form.seguroVencimiento ? form.seguroVencimiento.slice(0, 10) : ""}
            onChange={(e) => set("seguroVencimiento", e.target.value || null)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        {campo("registroEntidadesNumero", "Nº de registro de entidades de servicios sociales")}
        {campo("registroEntidadesOrgano", "Órgano que lo inscribe", "la consejería competente")}
      </Bloque>

      {d.recomendadas.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sin rellenar, pero conviene</p>
          <ul className="mt-1.5 space-y-1">
            {d.recomendadas.map((c) => (
              <li key={c.campo} className="text-xs text-slate-600">
                <strong className="text-slate-700">{c.etiqueta}</strong> — {c.porque}
              </li>
            ))}
          </ul>
        </section>
      )}

      {aviso && <p className="rounded-md border border-brand-green-200 bg-brand-green-50 px-3 py-2 text-xs text-brand-green-700">{aviso}</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      <button
        onClick={guardar}
        disabled={guardando}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar los datos de la empresa"}
      </button>

      <p className="text-xs text-slate-400">
        Cada cambio en la razón social, el CIF, el IBAN, el identificador de acreedor o la serie queda registrado en Actividad.
      </p>
    </div>
  );
}
