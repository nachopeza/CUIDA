import type { CarneConducir, Titulacion } from "./territorio.js";
import type { MotivoIncidencia } from "./incidencias.js";

export interface CuentaResumen {
  id: string;
  email: string;
  activo: boolean;
  nombre: string | null;
}

export interface Persona {
  id: string;
  codigo: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
  direccion: string | null;
  preferencias: string | null;
  contactos: string | null;
  medicacion: string | null;
  medico: string | null;
  recomendaciones: string | null;
  estado: string;
  usuario?: CuentaResumen | null;
  // Lo que le falta en materia de protección de datos. Viaja con la ficha para
  // que se vea en el listado y en la bandeja, no solo al abrirla.
  carenciasRgpd?: CarenciaRgpd[];
}

export interface CarenciaRgpd {
  tipo: string;
  etiqueta: string;
  motivo: "sin_preguntar" | "version_caducada";
}

// Catálogo de servicios (sección "Servicios son lo que ofrecemos... IVA del
// 4% o el 10%"): un único catálogo — antes había uno aparte solo para
// facturación, ahora cada necesidad/servicio ya lleva su propio IVA.
export interface Necesidad {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  ivaPorcentaje: string | number;
  precioBase: string | number | null;
  activo?: boolean;
}

export interface Plan {
  id: string;
  fechaInicio: string;
  fechaFin: string | null;
  recurrencia: string | null;
  // Lo que hay que hacer, escrito una vez y heredado por cada jornada.
  tareasPrevistas?: string | null;
  notas?: string | null;
  franjaHoraria: string | null;
  horaInicio: string | null;
  horaFin: string | null;
}

export interface EmpresaColaboradora {
  id: string;
  codigo: string;
  nombre: string;
  contacto: string | null;
  cif?: string | null;
  direccion?: string | null;
  numeroCuenta?: string | null;
  estado: string;
  // Contrato de encargo del tratamiento (art. 28 RGPD): sin él no se le puede
  // asignar un servicio, porque asignárselo le entrega datos de la persona.
  encargoFirmado?: boolean;
  encargoFecha?: string | null;
}

export interface ServicioInteres {
  id: string;
  mensaje: string | null;
  createdAt: string;
  profesional: Profesional;
}

export interface Servicio {
  id: string;
  codigo: string;
  estado: string;
  // Cuándo se creó y cuándo se tocó por última vez: sirve para saber cuánto
  // lleva un servicio esperando a que alguien lo cubra o lo confirme.
  createdAt?: string;
  updatedAt?: string;
  tipoServicio?: "PUNTUAL" | "RECURRENTE";
  // CUIDA cobra por tiempo: el precio se fija por hora y el importe sale de
  // los minutos acordados.
  precioHora?: string | number | null;
  minutosPrevistos?: number | null;
  comisionPorcentaje?: string | number | null;
  profesionalId: string | null;
  profesional?: Profesional | null;
  empresaColaboradoraId?: string | null;
  empresaColaboradora?: EmpresaColaboradora | null;
  tarifaImporte?: string | number | null;
  tarifaTipo?: "PAGADO" | "VOLUNTARIO" | null;
  tarifaNotas?: string | null;
  pagoProfesionalEstado?: "PENDIENTE" | "PAGADO";
  comisionImporte?: string | number | null;
  importeProfesional?: string | number | null;
  ivaPorcentaje?: string | number | null;
  ivaImporte?: string | number | null;
  totalConIva?: string | number | null;
  solicitud?: Solicitud;
  visitas?: Visita[];
  incidencias?: Incidencia[];
  interesados?: ServicioInteres[];
}

export interface EstadoHistorialEntry {
  id: string;
  estadoAnterior: string | null;
  estadoNuevo: string;
  motivo: string | null;
  createdAt: string;
}

export interface Solicitud {
  id: string;
  codigo: string;
  descripcionLibre: string;
  estado: string;
  createdAt: string;
  persona: Persona;
  necesidad: Necesidad;
  plan: Plan | null;
  servicio: Servicio | null;
  estadoHistorial?: EstadoHistorialEntry[];
}

export interface Tarea {
  id: string;
  descripcion: string;
  completada: boolean;
}

export interface Actuacion {
  id: string;
  descripcion: string;
  createdAt: string;
}

export interface Incidencia {
  id: string;
  codigo: string;
  tipo?: "GENERAL" | "SOLICITUD_CANCELACION";
  // De qué va la incidencia, en una palabra: es por lo que se agrupa y se
  // filtra. La descripción cuenta el caso, el motivo lo clasifica.
  motivo?: MotivoIncidencia;
  descripcion: string;
  prioridad: string;
  estado: string;
  createdAt?: string;
  visitaId?: string | null;
  servicioId?: string | null;
  servicio?: IncidenciaServicio | null;
  // La jornada concreta a la que se refiere, cuando la incidencia se abrió
  // desde una visita y no desde el servicio entero.
  visita?: (Pick<Visita, "id" | "codigo" | "fecha" | "horaInicioProg" | "horaFinProg" | "horaInicioReal" | "horaFinReal" | "estado"> & {
    profesional?: IncidenciaProfesional | null;
    servicio?: IncidenciaServicio | null;
  }) | null;
  responsable?: { email: string; nombre?: string | null } | null;
  // Quién abrió el aviso: sin esto la ficha contaba el caso pero no de quién
  // venía, y no se sabía a quién llamar para preguntar.
  creadoPor?: { id: string; email: string; nombre?: string | null; rol?: string } | null;
  estadoHistorial?: EstadoHistorialEntry[];
}

// Lo que la ficha de incidencia necesita saber del servicio: de qué solicitud
// viene, a quién se atiende, quién la tiene asignada y con qué horario.
export type IncidenciaProfesional = Pick<Profesional, "id" | "codigo" | "nombre" | "apellidos" | "telefono" | "foto"> & {
  usuario?: { email: string } | null;
};
export interface IncidenciaServicio {
  id?: string;
  codigo: string;
  estado?: string;
  tipoServicio?: "PUNTUAL" | "RECURRENTE";
  minutosPrevistos?: number | null;
  profesional?: IncidenciaProfesional | null;
  solicitud?: {
    id?: string;
    codigo?: string;
    persona: Persona;
    necesidad: Necesidad;
    plan?: Plan | null;
    descripcionLibre?: string;
    creadaPor?: { id: string; email: string; nombre?: string | null; rol?: string } | null;
  };
}

export interface Visita {
  id: string;
  codigo: string;
  fecha: string;
  horaInicioProg: string | null;
  horaFinProg: string | null;
  // Tiempo real trabajado (sección "los profesionales los contabiliza con
  // un temporizador"): se guardan al pulsar "He llegado"/"Cerrar tarea".
  horaInicioReal?: string | null;
  horaFinReal?: string | null;
  estado: string;
  // Snapshot del profesional que hizo la visita — no cambia si el servicio
  // se reasigna después (sección "cambiar de profesional... que esto se
  // tenga en cuenta en su facturación").
  profesionalId?: string | null;
  // Solo los campos identificativos: el listado de servicios no trae (ni debe
  // traer) los datos bancarios del profesional.
  profesional?: Pick<Profesional, "id" | "codigo" | "nombre" | "apellidos" | "foto"> | null;
  facturaId?: string | null;
  // Lo que dejó escrito el motor de tiempo al cerrar la jornada. Son las
  // cifras que acaban en la factura y en la liquidación: ninguna pantalla
  // vuelve a calcularlas por su cuenta.
  minutosProgramados?: number | null;
  minutosReales?: number | null;
  minutosFacturables?: number | null;
  minutosLiquidables?: number | null;
  desviacionMinutos?: number | null;
  explicacionTiempo?: string | null;
  // SIN_AJUSTE | PENDIENTE | APROBADO | RECHAZADO. Mientras está PENDIENTE la
  // jornada no se factura ni se liquida: hay tiempo que nadie ha decidido.
  ajusteEstado?: string | null;
  cierreManual?: boolean | null;
  // La instantánea de la tarifa que se le aplicó y los tres importes. Nulos
  // mientras la jornada no se ha cerrado.
  precioHoraCliente?: string | number | null;
  precioHoraProfesional?: string | number | null;
  importeCliente?: string | number | null;
  importeProfesional?: string | number | null;
  importeCuida?: string | number | null;
  tareas: Tarea[];
  actuaciones?: Actuacion[];
  incidencias?: Incidencia[];
  servicio?: {
    id: string;
    profesionalId?: string | null;
    tarifaImporte?: string | number | null;
    ivaPorcentaje?: string | number | null;
    // Lo que cobra quien la hace y si ya se le pagó. Al profesional se le
    // mandan estos dos (es su nómina) pero no el precio de la familia.
    importeProfesional?: string | number | null;
    pagoProfesionalEstado?: "PENDIENTE" | "PAGADO";
    solicitud: { persona: Persona; necesidad: Necesidad };
  };
}

export interface Profesional {
  id: string;
  codigo: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
  comunidad?: string | null;
  municipio?: string | null;
  zona: string | null;
  carneConducir?: CarneConducir | null;
  vehiculoPropio?: boolean;
  titulacion?: Titulacion | null;
  dni?: string | null;
  numeroCuenta?: string | null;
  bizum?: string | null;
  foto?: string | null;
  biografia?: string | null;
  disponibilidad?: string | null;
  // Cómo trabaja: de aquí sale si se le retiene IRPF al liquidarle.
  tipoRelacion?: TipoRelacionProfesional;
  irpfPorcentaje?: string | number | null;
  horasSemanales?: number | null;
  estado: string;
  empresaColaboradoraId?: string | null;
  empresaColaboradora?: EmpresaColaboradora | null;
  usuario?: { email: string; activo: boolean } | null;
}

export interface Documento {
  id: string;
  nombre: string;
  url: string;
  createdAt: string;
}

export type FormaPago = "DOMICILIACION" | "TRANSFERENCIA" | "EFECTIVO" | "TARJETA";
export type EstadoFactura = "BORRADOR" | "EMITIDA" | "PAGADA" | "IMPAGADA" | "ANULADA";

// Las líneas se escriben al emitir y ya no cambian: son lo que dice la copia
// que tiene el cliente.
export interface LineaFactura {
  id: string;
  orden: number;
  concepto: string;
  minutos?: number | null;
  cantidad: string | number;
  precioUnitario: string | number;
  importe: string | number;
  ivaPorcentaje: string | number;
  ivaImporte: string | number;
}

export interface MandatoSepa {
  id: string;
  referencia: string;
  titular: string;
  iban: string;
  bic?: string | null;
  fechaFirma: string;
  estado: "ACTIVO" | "REVOCADO";
  primerCobroHecho: boolean;
}

export interface DatosFacturacion {
  id: string;
  titular: string;
  nif?: string | null;
  direccionFiscal?: string | null;
  codigoPostal?: string | null;
  municipio?: string | null;
  provincia?: string | null;
  email?: string | null;
  formaPago: FormaPago;
  diaCobro: number;
  diasVencimiento: number;
  notas?: string | null;
  mandatos?: MandatoSepa[];
}

// Registro de facturación del RD 1007/2023: lo que encadena cada factura
// emitida con la anterior y permite cotejarla.
export interface RegistroFacturacion {
  numSerieFactura: string;
  fechaExpedicion: string;
  tipoFactura: string;
  huella: string;
  huellaAnterior: string | null;
  fechaHoraHusoGen: string;
  sistemaInformatico: string;
  versionSistema: string;
  urlCotejo: string;
}

export interface Factura {
  id: string;
  codigo: string;
  mes: string;
  // Identidad fiscal: serie + número dentro del ejercicio es lo que
  // identifica la factura, no el código interno.
  serie: string;
  numero: number;
  ejercicio: number;
  tipo: "ORDINARIA" | "RECTIFICATIVA";
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  fechaCobro?: string | null;
  formaPago: FormaPago;
  // Copia congelada de las dos partes en el momento de emitir.
  titularNombre?: string | null;
  titularNif?: string | null;
  titularDireccion?: string | null;
  emisorNombre?: string | null;
  emisorCif?: string | null;
  emisorDireccion?: string | null;
  // Pie registral congelado al emitir: mención obligatoria en la factura de
  // una sociedad (art. 24 LSC).
  emisorRegistro?: string | null;
  registroFacturacion?: RegistroFacturacion | null;
  // Sólo llega en la ficha de una factura concreta, dibujado por el servidor.
  qrSvg?: string | null;
  facturaRectificadaId?: string | null;
  facturaRectificada?: { id: string; codigo: string; serie: string; numero: number; ejercicio: number } | null;
  rectificativas?: { id: string; codigo: string; serie: string; numero: number; ejercicio: number; totalConIva: string | number }[];
  motivoRectificacion?: string | null;
  motivoImpago?: string | null;
  mandatoSepa?: MandatoSepa | null;
  remesaId?: string | null;
  importeTotal: string | number;
  ivaTotal: string | number;
  totalConIva: string | number;
  comisionTotal: string | number;
  importeProfesionales: string | number;
  estado: EstadoFactura;
  createdAt: string;
  persona: Persona & { datosFacturacion?: DatosFacturacion | null };
  lineas?: LineaFactura[];
  servicios: Servicio[];
  visitas?: Visita[];
}

export interface Remesa {
  id: string;
  codigo: string;
  mes: string;
  fechaCargo: string;
  estado: "BORRADOR" | "GENERADA" | "ENVIADA" | "COBRADA";
  createdAt: string;
  facturas: Factura[];
}

export type TipoRelacionProfesional = "LABORAL" | "AUTONOMO";

export interface LineaLiquidacion {
  id: string;
  fecha: string;
  concepto: string;
  minutos: number;
  importe: string | number;
  visitaId?: string | null;
}

export interface Liquidacion {
  id: string;
  codigo: string;
  mes: string;
  tipoRelacion: TipoRelacionProfesional;
  minutos: number;
  bruto: string | number;
  irpfPorcentaje: string | number;
  irpfImporte: string | number;
  neto: string | number;
  estado: "BORRADOR" | "APROBADA" | "PAGADA";
  fechaPago?: string | null;
  referenciaPago?: string | null;
  createdAt: string;
  profesional: Pick<Profesional, "id" | "codigo" | "nombre" | "apellidos" | "dni" | "numeroCuenta"> & { tipoRelacion: TipoRelacionProfesional };
  lineas: LineaLiquidacion[];
}

export interface Mensaje {
  id: string;
  texto: string;
  createdAt: string;
  autorUsuarioId: string;
  autor: { id: string; rol: string; email: string; nombre?: string | null };
}

// Quién está al otro lado del chat: la persona atendida si usa la aplicación,
// y los familiares autorizados que pueden leer y contestar.
export interface Interlocutores {
  persona: { id: string; nombre: string; apellidos: string; tieneCuenta: boolean };
  familiares: { nombre: string; parentesco: string; esRepresentante: boolean }[];
}

export interface Conversacion {
  profesionalId: string;
  personaId: string;
  persona: Persona | null;
  profesional: Profesional | null;
  ultimoMensaje: Mensaje | null;
}

export interface Notificacion {
  id: string;
  tipo: string;
  mensaje: string;
  leida: boolean;
  createdAt: string;
  entidadTipo?: string | null;
  entidadId?: string | null;
}

export interface FamiliarRelacion {
  id: string;
  parentesco: string;
  esRepresentante: boolean;
  puedeSolicitar: boolean;
  puedeVerHistorial: boolean;
  puedeVerImportes: boolean;
  usuario?: CuentaResumen;
}

export interface PersonaConFamiliares extends Persona {
  familiares: FamiliarRelacion[];
}

export interface AuditLogEntry {
  id: string;
  accion: string;
  entidadTipo: string | null;
  entidadId: string | null;
  detalle: string | null;
  createdAt: string;
  usuario: { email: string; rol: string } | null;
}

export interface VisitaAgenda extends Visita {
  servicio: {
    id: string;
    profesionalId?: string | null;
    profesional: Profesional | null;
    // El id de la solicitud es lo que permite abrir su ficha desde la
    // agenda: sin él el calendario era una lista que no llevaba a ninguna
    // parte.
    solicitud: { id: string; persona: Persona; necesidad: Necesidad };
  };
}

// ------------------------------------------------------------------- personal

export type TipoDocumento =
  | "DNI"
  | "DELITOS_SEXUALES"
  | "TITULACION"
  | "CONTRATO"
  | "ALTA_SEGURIDAD_SOCIAL"
  | "CARNE_CONDUCIR"
  | "SEGURO"
  | "FORMACION"
  | "OTRO";

export type TipoContrato = "INDEFINIDO" | "TEMPORAL" | "FIJO_DISCONTINUO" | "PRACTICAS" | "MERCANTIL";
export type TipoAusencia = "VACACIONES" | "BAJA_MEDICA" | "PERMISO_RETRIBUIDO" | "ASUNTOS_PROPIOS" | "EXCEDENCIA" | "OTRO";
export type EstadoAusencia = "SOLICITADA" | "APROBADA" | "RECHAZADA" | "CANCELADA";

export interface DocumentoProfesional {
  id: string;
  tipo: TipoDocumento;
  nombre: string;
  // El fichero en el almacén, cuando lo hay. Un documento obligatorio sin
  // esto cuenta como que falta: no basta con anotar que existe.
  archivoId?: string | null;
  url: string;
  fechaEmision?: string | null;
  fechaCaducidad?: string | null;
  notas?: string | null;
  createdAt: string;
}

export interface Ausencia {
  id: string;
  tipo: TipoAusencia;
  estado: EstadoAusencia;
  desde: string;
  hasta: string;
  motivo?: string | null;
  respuesta?: string | null;
  resueltaAt?: string | null;
  createdAt: string;
  profesional?: Pick<Profesional, "id" | "codigo" | "nombre" | "apellidos">;
}

// Qué le falta a alguien para poder trabajar. "falta" y "caducado" impiden
// asignarle servicios; "por_caducar" es sólo un aviso para renovar a tiempo.
export interface Carencia {
  tipo: TipoDocumento;
  etiqueta: string;
  motivo: "falta" | "sin_archivo" | "caducado" | "por_caducar";
  fechaCaducidad?: string | null;
}

// La ficha laboral de un profesional. Se llamaba MiembroEquipo, y "equipo"
// en CUIDA es otra cosa: el personal interno de la oficina.
export interface FichaProfesional extends Profesional {
  tipoContrato?: TipoContrato | null;
  fechaAlta?: string | null;
  fechaBaja?: string | null;
  categoria?: string | null;
  documentos: DocumentoProfesional[];
  ausencias: Ausencia[];
  carencias: Carencia[];
  bloqueado: boolean;
  ausenciaHoy?: Ausencia | null;
}

// Un día del registro de jornada, tal y como quedó congelado al cerrar el mes.
// Personal interno: coordinación, administración y demás puestos de oficina.
// No prestan servicios.
export interface MiembroEquipo {
  id: string;
  nombre: string | null;
  email: string;
  rol: string;
  puesto?: string | null;
  telefono?: string | null;
  fechaAlta?: string | null;
  fechaBaja?: string | null;
  activo: boolean;
  createdAt: string;
  esTu?: boolean;
}

export interface DiaDeJornada {
  fecha: string;
  entrada: string | null;
  salida: string | null;
  minutos: number;
  servicio: string;
}

export interface RegistroJornada {
  id: string;
  codigo: string;
  mes: string;
  minutosTrabajados: number;
  minutosContrato?: number | null;
  diasTrabajados: number;
  detalle: string; // JSON con DiaDeJornada[]
  cerradoAt: string;
  conformeAt?: string | null;
  conformeNota?: string | null;
  profesional: Pick<Profesional, "id" | "codigo" | "nombre" | "apellidos" | "dni"> & { tipoRelacion?: TipoRelacionProfesional };
}

// Una jornada de los próximos días que, tal como está, no se va a poder
// prestar. Se calcula en el backend con las mismas comprobaciones que se
// hacen al asignar, para que el aviso y el bloqueo digan lo mismo.
export interface RiesgoCobertura {
  visitaId: string;
  codigo: string;
  fecha: string;
  horaInicioProg: string | null;
  horaFinProg: string | null;
  estado: string;
  gravedad: "BLOQUEA" | "AVISA";
  motivo: string;
  servicio: { id: string; codigo: string; estado: string };
  solicitudId: string;
  persona: string;
  necesidad: string;
  profesional: { id: string; nombre: string } | null;
  incidencia: { id: string; codigo: string; estado: string } | null;
}

export interface RiesgosCobertura {
  desde: string;
  hasta: string;
  dias: number;
  jornadasRevisadas: number;
  bloquean: number;
  avisan: number;
  riesgos: RiesgoCobertura[];
}
