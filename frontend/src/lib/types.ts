export interface Persona {
  id: string;
  codigo: string;
  nombre: string;
  apellidos: string;
  direccion: string | null;
  preferencias: string | null;
  estado: string;
}

export interface Necesidad {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

export interface Plan {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  recurrencia: string | null;
  franjaHoraria: string | null;
}

export interface EmpresaColaboradora {
  id: string;
  codigo: string;
  nombre: string;
  contacto: string | null;
  estado: string;
}

export interface Servicio {
  id: string;
  codigo: string;
  estado: string;
  profesionalId: string | null;
  profesional?: Profesional | null;
  empresaColaboradoraId?: string | null;
  empresaColaboradora?: EmpresaColaboradora | null;
  tarifaImporte?: string | number | null;
  tarifaTipo?: "PAGADO" | "VOLUNTARIO" | null;
  tarifaNotas?: string | null;
  solicitud?: Solicitud;
  visitas?: Visita[];
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
  descripcion: string;
  prioridad: string;
  estado: string;
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
  servicio?: { solicitud: { persona: Persona; necesidad: Necesidad } };
}

export interface Profesional {
  id: string;
  codigo: string;
  nombre: string;
  apellidos: string;
  zona: string | null;
  estado: string;
}

export interface FamiliarRelacion {
  id: string;
  parentesco: string;
  esRepresentante: boolean;
  puedeSolicitar: boolean;
  puedeVerHistorial: boolean;
  puedeVerImportes: boolean;
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
    profesional: Profesional | null;
    solicitud: { persona: Persona; necesidad: Necesidad };
  };
}
