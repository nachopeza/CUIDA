// Prueba de humo del ciclo de un servicio, contra un servidor en marcha y con la
// base recién sembrada (`npm run seed`):
//
//   npm run prueba:ciclo            # BASE=http://localhost:4000 por defecto
//
// Recorre lo que un servicio hace de verdad: entra, se asigna, llega el día, se
// ficha, se verifica el tiempo, se factura y se cobra a la familia, se liquida y se
// paga a la profesional, y el servicio se cierra solo. Después fuerza los casos que
// se rompían: cancelar, eliminar, terminar un recurrente y los permisos. Sale con
// código 1 si algo no cuadra.

const BASE = process.env.BASE ?? "http://localhost:4000";

async function pide(metodo: string, ruta: string, cuerpo?: unknown, token?: string): Promise<{ status: number; data: any }> {
  const res = await fetch(BASE + ruta, {
    method: metodo,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let data: any = null;
  try {
    data = texto ? JSON.parse(texto) : null;
  } catch {
    data = texto;
  }
  return { status: res.status, data };
}

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle?: unknown) {
  if (!ok) fallos++;
  console.log(`${ok ? "OK   " : "FALLA"} ${nombre}${!ok && detalle !== undefined ? ` → ${JSON.stringify(detalle).slice(0, 200)}` : ""}`);
}

async function entrar(email: string) {
  const { data } = await pide("POST", "/auth/login", { email, password: "cuida2026" });
  return { token: data.token as string, usuario: data.usuario };
}

const hoy = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const en = (dias: number) => new Date(hoy.getTime() + dias * 86400000);
const mes = iso(hoy).slice(0, 7);
const siguiente = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
const mesSiguiente = `${siguiente.getFullYear()}-${String(siguiente.getMonth() + 1).padStart(2, "0")}`;

async function main() {
  const { token: T } = await entrar("coordinadora@cuida.demo");
  const personas = (await pide("GET", "/personas", undefined, T)).data as any[];
  const necesidades = (await pide("GET", "/necesidades", undefined, T)).data as any[];
  const necesidad = necesidades.find((n) => n.nombre === "Paseo");
  const persona = (n: string) => personas.find((p) => p.nombre === n);

  async function nuevoServicio(nombre: string, ini: Date, fin: Date | null, horas: [string, string] = ["10:00", "12:00"], recurrente = false) {
    const s = (await pide("POST", "/solicitudes", { personaId: persona(nombre).id, necesidadId: necesidad.id, descripcionLibre: "Prueba", fechaInicio: `${iso(ini)}T00:00:00.000Z`, dias: 1 }, T)).data;
    await pide("POST", `/solicitudes/${s.id}/plan`, { fechaInicio: `${iso(ini)}T00:00:00.000Z`, fechaFin: fin ? `${iso(fin)}T00:00:00.000Z` : null, horaInicio: horas[0], horaFin: horas[1], franjaHoraria: "Mañana" }, T);
    await pide("POST", `/solicitudes/${s.id}/estado`, { estado: "ACEPTADA" }, T);
    const servicio = (await pide("GET", `/solicitudes/${s.id}`, undefined, T)).data.servicio;
    await pide("POST", `/servicios/${servicio.id}/tarifa`, { precioHora: 15, tarifaTipo: "PAGADO", minutosPrevistos: 120, ...(recurrente ? { tipoServicio: "RECURRENTE" } : {}) }, T);
    return { sid: s.id as string, srv: servicio.id as string };
  }

  async function asignar(srv: string) {
    const cands = (await pide("GET", `/servicios/${srv}/candidatos`, undefined, T)).data as any[];
    const pro = cands.find((c) => c.encaja);
    if (!pro) throw new Error(`Nadie encaja: ${JSON.stringify(cands.map((c) => [c.nombre, c.motivo]))}`);
    await pide("POST", `/servicios/${srv}/asignar`, { profesionalId: pro.id }, T);
    const { token, usuario } = await entrar(`${pro.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.profesional@cuida.demo`);
    await pide("POST", `/servicios/${srv}/aceptar`, {}, token);
    return { P: token, profesionalId: usuario.profesionalId as string };
  }

  const estado = async (sid: string) => {
    const f = (await pide("GET", `/solicitudes/${sid}`, undefined, T)).data;
    return `${f.estado}/${f.servicio?.estado ?? "-"}`;
  };
  const agenda = async (P: string, profesionalId: string, srv: string) =>
    (((await pide("GET", `/profesionales/${profesionalId}/agenda`, undefined, P)).data as any[]) ?? []).filter((v) => v.servicio.id === srv);

  console.log("== 1. El ciclo entero de un servicio puntual");
  {
    const { sid, srv } = await nuevoServicio("Amadeo", hoy, hoy);
    const { P, profesionalId } = await asignar(srv);
    const v = (await agenda(P, profesionalId, srv))[0];
    comprobar("la jornada aparece en la agenda al confirmar", !!v);
    comprobar("He llegado", (await pide("POST", `/visitas/${v.id}/iniciar`, {}, P)).status === 200);
    comprobar("el servicio pasa a en curso al fichar", (await estado(sid)).endsWith("EN_CURSO"), await estado(sid));
    comprobar("Finalizar 10:00-12:00", (await pide("POST", `/visitas/${v.id}/finalizar`, { horaInicio: "10:00", horaFin: "12:00", observacion: "Todo bien" }, P)).status === 200);
    comprobar("Verificar", (await pide("POST", `/visitas/${v.id}/revisar`, {}, T)).status === 200);
    comprobar("verificado: validado, y todavía no cerrado", (await estado(sid)).endsWith("VALIDADO"), await estado(sid));
    const fac = await pide("POST", "/facturas/generar", { personaId: persona("Amadeo").id, mes }, T);
    comprobar("generar factura", fac.status === 201, fac.data);
    await pide("POST", `/facturas/${fac.data.id}/emitir`, {}, T);
    comprobar("cobrar factura", (await pide("POST", `/facturas/${fac.data.id}/cobrar`, {}, T)).status === 200);
    comprobar("cobrado pero sin pagar a la profesional: sigue sin cerrar", (await estado(sid)).endsWith("VALIDADO"), await estado(sid));
    await pide("POST", "/liquidaciones/generar", { mes, profesionalId }, T);
    const liqs = (await pide("GET", "/liquidaciones", undefined, T)).data as any[];
    for (const l of liqs.filter((x) => x.profesional.id === profesionalId && x.estado === "BORRADOR")) {
      await pide("POST", `/liquidaciones/${l.id}/aprobar`, {}, T);
      comprobar("pagar liquidación", (await pide("POST", `/liquidaciones/${l.id}/pagar`, {}, T)).status === 200);
    }
    comprobar("servicio CERRADO y solicitud CERRADA", (await estado(sid)) === "CERRADA/CERRADO", await estado(sid));
  }

  console.log("== 2. Cancelar");
  {
    const { sid, srv } = await nuevoServicio("Amadeo", en(5), en(5));
    comprobar("cancelar sin motivo se rechaza", (await pide("POST", `/servicios/${srv}/cancelar`, {}, T)).status === 400);
    comprobar("cancelar con motivo", (await pide("POST", `/servicios/${srv}/cancelar`, { motivo: "La familia ya no lo necesita" }, T)).status === 200);
    comprobar("servicio cancelado y solicitud cancelada", (await estado(sid)) === "CANCELADA/CANCELADO", await estado(sid));
    comprobar("cancelar otra vez se rechaza", (await pide("POST", `/servicios/${srv}/cancelar`, { motivo: "otra vez" }, T)).status === 409);
  }
  {
    const { sid, srv } = await nuevoServicio("Herminia", en(6), en(6));
    const { P, profesionalId } = await asignar(srv);
    await pide("POST", `/servicios/${srv}/cancelar`, { motivo: "Prueba con profesional asignado" }, T);
    const pendientes = (await agenda(P, profesionalId, srv)).filter((v) => ["PROGRAMADA", "CONFIRMADA"].includes(v.estado));
    comprobar("la agenda de la profesional queda limpia", pendientes.length === 0, pendientes.length);
    comprobar("y la solicitud queda cancelada", (await estado(sid)) === "CANCELADA/CANCELADO");
  }

  console.log("== 3. Eliminar");
  {
    const { sid, srv } = await nuevoServicio("Manuel", en(7), en(7));
    await asignar(srv);
    comprobar("eliminar un servicio asignado sin actividad", (await pide("DELETE", `/solicitudes/${sid}`, undefined, T)).status === 204);
    comprobar("desaparece", (await pide("GET", `/solicitudes/${sid}`, undefined, T)).status === 404);
  }

  console.log("== 4. Terminar un recurrente en marcha");
  {
    const { sid, srv } = await nuevoServicio("Amadeo", hoy, en(20), ["15:00", "17:00"], true);
    const { P, profesionalId } = await asignar(srv);
    comprobar("no se termina sin haber trabajado", (await pide("POST", `/servicios/${srv}/terminar`, { motivo: "Ya no hace falta" }, T)).status === 409);
    const v = (await agenda(P, profesionalId, srv))[0];
    await pide("POST", `/visitas/${v.id}/iniciar`, {}, P);
    comprobar("no se termina con una jornada abierta", (await pide("POST", `/servicios/${srv}/terminar`, { motivo: "Ya no hace falta" }, T)).status === 409);
    await pide("POST", `/visitas/${v.id}/finalizar`, { horaInicio: "15:00", horaFin: "17:00" }, P);
    await pide("POST", `/visitas/${v.id}/revisar`, {}, T);
    comprobar("verificada una jornada, el recurrente sigue en curso", (await estado(sid)).endsWith("EN_CURSO"), await estado(sid));
    comprobar("no se elimina con actividad", (await pide("DELETE", `/solicitudes/${sid}`, undefined, T)).status === 409);
    comprobar("terminar", (await pide("POST", `/servicios/${srv}/terminar`, { motivo: "La familia da por acabado el servicio" }, T)).status === 200);
    comprobar("sin jornadas por empezar en la agenda", (await agenda(P, profesionalId, srv)).every((x) => !["PROGRAMADA", "CONFIRMADA"].includes(x.estado)));
    // El mes ya tiene su factura y su liquidación (las del escenario 1): la jornada
    // verificada después no puede quedarse sin cobrar ni pagar, pasa al mes siguiente.
    comprobar("el mes ya facturado no la recoge", (await pide("POST", "/facturas/generar", { personaId: persona("Amadeo").id, mes }, T)).status === 409);
    const fac = await pide("POST", "/facturas/generar", { personaId: persona("Amadeo").id, mes: mesSiguiente }, T);
    comprobar("la factura del mes siguiente recoge la jornada pendiente", fac.status === 201, fac.data);
    await pide("POST", `/facturas/${fac.data.id}/emitir`, {}, T);
    await pide("POST", `/facturas/${fac.data.id}/cobrar`, {}, T);
    const liq = await pide("POST", "/liquidaciones/generar", { mes: mesSiguiente, profesionalId }, T);
    comprobar("la liquidación del mes siguiente recoge la jornada pendiente", liq.status === 201, liq.data);
    const liqs = (await pide("GET", "/liquidaciones", undefined, T)).data as any[];
    for (const l of liqs.filter((x) => x.profesional.id === profesionalId && x.estado === "BORRADOR")) {
      await pide("POST", `/liquidaciones/${l.id}/aprobar`, {}, T);
      await pide("POST", `/liquidaciones/${l.id}/pagar`, {}, T);
    }
    comprobar("cobrado y pagado: cerrado", (await estado(sid)) === "CERRADA/CERRADO", await estado(sid));
  }

  console.log("== 5. Permisos");
  {
    const { srv } = await nuevoServicio("Manuel", en(8), en(8));
    const { P } = await asignar(srv);
    const F = (await entrar("hija.herminia@cuida.demo")).token;
    comprobar("la profesional no puede terminar", (await pide("POST", `/servicios/${srv}/terminar`, { motivo: "quiero" }, P)).status === 403);
    comprobar("la profesional no puede cancelar", (await pide("POST", `/servicios/${srv}/cancelar`, { motivo: "quiero" }, P)).status === 403);
    comprobar("la profesional no ve la economía", (await pide("GET", `/servicios/${srv}/economia`, undefined, P)).status === 403);
    comprobar("la familia no puede cancelar directamente", (await pide("POST", `/servicios/${srv}/cancelar`, { motivo: "quiero" }, F)).status === 403);
    comprobar("sin sesión, no entra", (await pide("POST", `/servicios/${srv}/cancelar`, { motivo: "x" })).status === 401);
  }

  console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} comprobación(es) fallida(s).`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
