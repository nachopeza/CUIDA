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
  tipoServicio?: "PUNTUAL" | "RECURRENTE";
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
  descripcion: string;
  prioridad: string;
  estado: string;
  visitaId?: string | null;
  servicioId?: string | null;
  servicio?: { codigo: string; solicitud?: { persona: Persona; necesidad: Necesidad } } | null;
  responsable?: { email: string; nombre?: string | null } | null;
  estadoHistorial?: EstadoHistorialEntry[];
}

export interface Visita {
  id: string;
  codigo: string;
  fecha: string;
  horaInicioProg: string | null;
  horaFinProg: string | null;
  estado: string;
  tareas: Tarea[];
  actuaciones?: Actuacion[];
  incidencias?: Incidencia[];
  servicio?: { id: string; profesionalId?: string | null; solicitud: { persona: Persona; necesidad: Necesidad } };
}

export interface Profesional {
  id: string;
  codigo: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
  zona: string | null;
  dni?: string | null;
  numeroCuenta?: string | null;
  bizum?: string | null;
  foto?: string | null;
  biografia?: string | null;
  estado: string;
  empresaColaboradoraId?: string | null;
  empresaColaboradora?: EmpresaColaboradora | null;
}

export interface Documento {
  id: string;
  nombre: string;
  url: string;
  createdAt: string;
}

export interface Factura {
  id: string;
  codigo: string;
  mes: string;
  importeTotal: string | number;
  ivaTotal: string | number;
  totalConIva: string | number;
  comisionTotal: string | number;
  importeProfesionales: string | number;
  estado: "BORRADOR" | "EMITIDA" | "PAGADA";
  createdAt: string;
  persona: Persona;
  servicios: Servicio[];
}

export interface Mensaje {
  id: string;
  texto: string;
  createdAt: string;
  autorUsuarioId: string;
  autor: { id: string; rol: string; email: string };
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
    solicitud: { persona: Persona; necesidad: Necesidad };
  };
}
