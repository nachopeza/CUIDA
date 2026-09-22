// Comunidades y municipios de referencia. La zona era texto libre y cada
// quien escribía una cosa ("Centro", "centro", "Santander centro"), así que
// no se podía ni filtrar ni agrupar. Con una lista cerrada sí.
//
// No es el callejero completo del INE: son las capitales y las localidades
// con peso de cada comunidad, que es hasta donde llega la operación. Para
// afinar más ("barrio de la Inmobiliaria", "zona rural") está el campo de
// zona, que sigue siendo libre.

export interface Comunidad {
  codigo: string;
  nombre: string;
  municipios: string[];
}

export const COMUNIDADES: Comunidad[] = [
  {
    codigo: "AN",
    nombre: "Andalucía",
    municipios: ["Almería", "Cádiz", "Córdoba", "Granada", "Huelva", "Jaén", "Jerez de la Frontera", "Málaga", "Marbella", "Sevilla", "Dos Hermanas"],
  },
  { codigo: "AR", nombre: "Aragón", municipios: ["Zaragoza", "Huesca", "Teruel", "Calatayud"] },
  { codigo: "AS", nombre: "Asturias", municipios: ["Oviedo", "Gijón", "Avilés", "Langreo", "Mieres", "Siero"] },
  { codigo: "IB", nombre: "Islas Baleares", municipios: ["Palma", "Calvià", "Ibiza", "Manacor", "Mahón", "Inca"] },
  { codigo: "CN", nombre: "Canarias", municipios: ["Las Palmas de Gran Canaria", "Santa Cruz de Tenerife", "San Cristóbal de La Laguna", "Telde", "Arona", "Arrecife"] },
  { codigo: "CB", nombre: "Cantabria", municipios: ["Santander", "Torrelavega", "Camargo", "Castro Urdiales", "Piélagos", "El Astillero", "Laredo", "Santoña", "Reinosa", "Santa Cruz de Bezana"] },
  { codigo: "CM", nombre: "Castilla-La Mancha", municipios: ["Albacete", "Ciudad Real", "Cuenca", "Guadalajara", "Toledo", "Talavera de la Reina", "Puertollano"] },
  { codigo: "CL", nombre: "Castilla y León", municipios: ["Ávila", "Burgos", "León", "Palencia", "Salamanca", "Segovia", "Soria", "Valladolid", "Zamora", "Ponferrada"] },
  { codigo: "CT", nombre: "Cataluña", municipios: ["Barcelona", "L'Hospitalet de Llobregat", "Badalona", "Terrassa", "Sabadell", "Tarragona", "Lleida", "Girona", "Mataró", "Reus", "Manresa", "Sant Fruitós de Bages"] },
  { codigo: "EX", nombre: "Extremadura", municipios: ["Badajoz", "Cáceres", "Mérida", "Plasencia", "Don Benito"] },
  { codigo: "GA", nombre: "Galicia", municipios: ["A Coruña", "Vigo", "Ourense", "Lugo", "Santiago de Compostela", "Pontevedra", "Ferrol"] },
  { codigo: "RI", nombre: "La Rioja", municipios: ["Logroño", "Calahorra", "Arnedo", "Haro"] },
  { codigo: "MD", nombre: "Comunidad de Madrid", municipios: ["Madrid", "Móstoles", "Alcalá de Henares", "Fuenlabrada", "Leganés", "Getafe", "Alcorcón", "Torrejón de Ardoz", "Parla", "Alcobendas", "Las Rozas de Madrid", "Pozuelo de Alarcón"] },
  { codigo: "MC", nombre: "Región de Murcia", municipios: ["Murcia", "Cartagena", "Lorca", "Molina de Segura", "Alcantarilla", "Yecla"] },
  { codigo: "NC", nombre: "Navarra", municipios: ["Pamplona", "Tudela", "Barañáin", "Burlada", "Estella"] },
  { codigo: "PV", nombre: "País Vasco", municipios: ["Bilbao", "Vitoria-Gasteiz", "San Sebastián", "Barakaldo", "Getxo", "Irún", "Portugalete", "Santurtzi"] },
  { codigo: "VC", nombre: "Comunidad Valenciana", municipios: ["Valencia", "Alicante", "Elche", "Castellón de la Plana", "Torrevieja", "Orihuela", "Gandía", "Benidorm", "Paterna", "Sagunto"] },
  { codigo: "CE", nombre: "Ceuta", municipios: ["Ceuta"] },
  { codigo: "ML", nombre: "Melilla", municipios: ["Melilla"] },
];

export function comunidadPorCodigo(codigo: string | null | undefined): Comunidad | undefined {
  return COMUNIDADES.find((c) => c.codigo === codigo);
}

export function nombreComunidad(codigo: string | null | undefined): string {
  return comunidadPorCodigo(codigo)?.nombre ?? "";
}

export function municipiosDe(codigo: string | null | undefined): string[] {
  return comunidadPorCodigo(codigo)?.municipios ?? [];
}

// Dónde trabaja, en una línea. Del detalle al general, que es como se dice.
export function zonaDe(p: { municipio?: string | null; comunidad?: string | null; zona?: string | null }): string {
  const partes = [p.zona, p.municipio, nombreComunidad(p.comunidad)].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : "Sin zona";
}

// ---------------------------------------------------------------------------
// Carné y titulación: mismos valores que el enum del backend.
// ---------------------------------------------------------------------------

export type CarneConducir = "NO" | "B" | "A" | "C" | "D";

export const CARNES: { valor: CarneConducir; etiqueta: string }[] = [
  { valor: "NO", etiqueta: "Sin carné" },
  { valor: "B", etiqueta: "B — turismo" },
  { valor: "A", etiqueta: "A — moto" },
  { valor: "C", etiqueta: "C — camión" },
  { valor: "D", etiqueta: "D — autobús" },
];

export type Titulacion =
  | "SIN_TITULACION"
  | "ATENCION_SOCIOSANITARIA"
  | "AUXILIAR_ENFERMERIA"
  | "ENFERMERIA"
  | "TRABAJO_SOCIAL"
  | "FISIOTERAPIA"
  | "TERAPIA_OCUPACIONAL"
  | "PSICOLOGIA"
  | "OTRA";

export const TITULACIONES: { valor: Titulacion; etiqueta: string }[] = [
  { valor: "SIN_TITULACION", etiqueta: "Sin titulación" },
  { valor: "ATENCION_SOCIOSANITARIA", etiqueta: "Atención sociosanitaria" },
  { valor: "AUXILIAR_ENFERMERIA", etiqueta: "Auxiliar de enfermería (TCAE)" },
  { valor: "ENFERMERIA", etiqueta: "Enfermería" },
  { valor: "TRABAJO_SOCIAL", etiqueta: "Trabajo social" },
  { valor: "FISIOTERAPIA", etiqueta: "Fisioterapia" },
  { valor: "TERAPIA_OCUPACIONAL", etiqueta: "Terapia ocupacional" },
  { valor: "PSICOLOGIA", etiqueta: "Psicología" },
  { valor: "OTRA", etiqueta: "Otra" },
];

export function etiquetaCarne(v: string | null | undefined): string {
  return CARNES.find((c) => c.valor === v)?.etiqueta ?? "Sin carné";
}

export function etiquetaTitulacion(v: string | null | undefined): string {
  return TITULACIONES.find((t) => t.valor === v)?.etiqueta ?? "";
}
