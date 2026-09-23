import { prisma } from "../lib/prisma.js";
import { minutosEntre, minutosFichados, formatearDuracion } from "./economia.js";

// ---------------------------------------------------------------------------
// El motor de tiempo de CUIDA
//
// Una jornada tiene cuatro tiempos y no son el mismo número:
//
//   programado   lo que se acordó en el plan        09:00 → 12:00   3 h
//   real         lo que se fichó                    09:04 → 11:58   2 h 54
//   facturable   lo que se le cobra a la familia                    3 h
//   liquidable   lo que cobra el profesional                        3 h
//
// Confundirlos es lo que rompe estos sistemas en cuanto aparece un caso real.
// Aquí se calculan los cuatro por separado, y se guarda además la frase que
// explica cómo se llegó a los dos últimos, porque un importe que nadie puede
// justificar no sirve para facturar.
// ---------------------------------------------------------------------------

export type BaseTiempo = "PROGRAMADO" | "REAL" | "MENOR" | "MAYOR";
export type ModoRedondeo = "NINGUNO" | "ARRIBA" | "ABAJO" | "CERCANO";

export interface Reglas {
  baseCobro: BaseTiempo;
  baseLiquidacion: BaseTiempo;
  redondeoMinutos: number;
  redondeoModo: ModoRedondeo;
  minimoMinutos: number;
  toleranciaRetrasoMinutos: number;
  toleranciaExcesoMinutos: number;
  aprobarTiempoExtra: boolean;
  horasVisitaAbierta: number;
  cancelacionAvisoHoras: number;
  cancelacionTardiaCobro: number;
  cancelacionTardiaPago: number;
  noPresentadoCobro: number;
  noPresentadoPago: number;
  // Suelo de lo que se puede pagar por hora de trabajo. Ver el comentario del
  // campo en el esquema: el valor de fábrica es el del SMI, y el convenio de
  // ayuda a domicilio suele estar por encima.
  salarioMinimoHora: number;
}

// Lo que trae CUIDA de fábrica: se cobra y se paga lo acordado, sin redondeos
// ni mínimos, y el tiempo de más pasa por coordinación. Es la combinación que
// menos sorpresas da en la factura y en la nómina.
export const REGLAS_POR_DEFECTO: Reglas = {
  baseCobro: "PROGRAMADO",
  baseLiquidacion: "PROGRAMADO",
  redondeoMinutos: 0,
  redondeoModo: "NINGUNO",
  minimoMinutos: 0,
  toleranciaRetrasoMinutos: 10,
  toleranciaExcesoMinutos: 10,
  aprobarTiempoExtra: true,
  horasVisitaAbierta: 4,
  cancelacionAvisoHoras: 24,
  cancelacionTardiaCobro: 50,
  cancelacionTardiaPago: 50,
  noPresentadoCobro: 100,
  noPresentadoPago: 100,
  salarioMinimoHora: 9.08,
};

// Las reglas de una organización, creándolas con los valores por defecto la
// primera vez. Así ninguna parte del código tiene que contemplar el caso "esta
// organización todavía no ha configurado nada".
export async function reglasDe(organizacionId: string): Promise<Reglas> {
  const guardadas = await prisma.reglasNegocio.upsert({
    where: { organizacionId },
    update: {},
    create: { organizacionId },
  });
  return {
    baseCobro: guardadas.baseCobro as BaseTiempo,
    baseLiquidacion: guardadas.baseLiquidacion as BaseTiempo,
    redondeoMinutos: guardadas.redondeoMinutos,
    redondeoModo: guardadas.redondeoModo as ModoRedondeo,
    minimoMinutos: guardadas.minimoMinutos,
    toleranciaRetrasoMinutos: guardadas.toleranciaRetrasoMinutos,
    toleranciaExcesoMinutos: guardadas.toleranciaExcesoMinutos,
    aprobarTiempoExtra: guardadas.aprobarTiempoExtra,
    horasVisitaAbierta: guardadas.horasVisitaAbierta,
    cancelacionAvisoHoras: guardadas.cancelacionAvisoHoras,
    cancelacionTardiaCobro: Number(guardadas.cancelacionTardiaCobro),
    cancelacionTardiaPago: Number(guardadas.cancelacionTardiaPago),
    noPresentadoCobro: Number(guardadas.noPresentadoCobro),
    noPresentadoPago: Number(guardadas.noPresentadoPago),
    salarioMinimoHora: Number(guardadas.salarioMinimoHora),
  };
}

export function aplicarRedondeo(minutos: number, intervalo: number, modo: ModoRedondeo): number {
  if (intervalo <= 0 || modo === "NINGUNO") return minutos;
  const bloques = minutos / intervalo;
  const redondeados =
    modo === "ARRIBA" ? Math.ceil(bloques) : modo === "ABAJO" ? Math.floor(bloques) : Math.round(bloques);
  return redondeados * intervalo;
}

function elegirBase(base: BaseTiempo, programado: number | null, real: number | null): number {
  const p = programado ?? 0;
  const r = real ?? 0;
  // Si falta uno de los dos no hay elección posible: se usa el que hay. Un
  // servicio sin fichaje no puede cobrarse "el menor de los dos" y salir 0.
  if (programado == null) return r;
  if (real == null) return p;
  switch (base) {
    case "PROGRAMADO":
      return p;
    case "REAL":
      return r;
    case "MENOR":
      return Math.min(p, r);
    case "MAYOR":
      return Math.max(p, r);
  }
}

const NOMBRE_BASE: Record<BaseTiempo, string> = {
  PROGRAMADO: "el tiempo acordado",
  REAL: "el tiempo fichado",
  MENOR: "el menor de acordado y fichado",
  MAYOR: "el mayor de acordado y fichado",
};

export interface TiemposDeVisita {
  minutosProgramados: number | null;
  minutosReales: number | null;
  minutosFacturables: number;
  minutosLiquidables: number;
  retrasoMinutos: number | null;
  desviacionMinutos: number | null;
  // Hay más tiempo del acordado por encima de la tolerancia y las reglas dicen
  // que eso no se cobra solo: alguien tiene que aprobarlo.
  requiereAprobacion: boolean;
  explicacion: string;
}

export interface EntradaVisita {
  horaInicioProg?: string | null;
  horaFinProg?: string | null;
  horaInicioReal?: Date | null;
  horaFinReal?: Date | null;
  fecha: Date;
  // Cuando la jornada no se hizo, la regla aplica un porcentaje sobre lo
  // acordado en vez de sobre lo fichado (que no existe).
  estado?: string;
  // Si el tiempo de más ya lo decidió una persona, la explicación lo dice en
  // pasado en vez de seguir pidiendo una aprobación que ya se dio.
  ajusteEstado?: string;
}

// Porcentaje de lo acordado que se cobra y se paga cuando la jornada no se ha
// prestado. No es lo mismo cancelar con dos días que no abrir la puerta.
function porcentajesDeNoPrestada(entrada: EntradaVisita, reglas: Reglas): { cobro: number; pago: number; porque: string } | null {
  if (entrada.estado === "NO_PRESENTADO") {
    return {
      cobro: reglas.noPresentadoCobro,
      pago: reglas.noPresentadoPago,
      porque: "la persona no estaba y el profesional sí se desplazó",
    };
  }
  if (entrada.estado === "CANCELADA") {
    return {
      cobro: reglas.cancelacionTardiaCobro,
      pago: reglas.cancelacionTardiaPago,
      porque: `se canceló con menos de ${reglas.cancelacionAvisoHoras} h de aviso`,
    };
  }
  return null;
}

export function calcularTiempos(entrada: EntradaVisita, reglas: Reglas): TiemposDeVisita {
  const programados = minutosEntre(entrada.horaInicioProg, entrada.horaFinProg);
  const reales = minutosFichados(entrada.horaInicioReal, entrada.horaFinReal);

  // Retraso: cuánto después de la hora acordada se fichó la entrada. Se
  // registra siempre; que afecte o no al importe es otra decisión.
  let retraso: number | null = null;
  if (entrada.horaInicioProg && entrada.horaInicioReal) {
    const [h, m] = entrada.horaInicioProg.split(":").map(Number);
    const prevista = new Date(entrada.horaInicioReal);
    prevista.setHours(h, m, 0, 0);
    retraso = Math.round((entrada.horaInicioReal.getTime() - prevista.getTime()) / 60000);
  }

  const desviacion = programados != null && reales != null ? reales - programados : null;

  const noPrestada = porcentajesDeNoPrestada(entrada, reglas);
  if (noPrestada && programados != null) {
    const facturables = Math.round((programados * noPrestada.cobro) / 100);
    const liquidables = Math.round((programados * noPrestada.pago) / 100);
    return {
      minutosProgramados: programados,
      minutosReales: reales,
      minutosFacturables: facturables,
      minutosLiquidables: liquidables,
      retrasoMinutos: retraso,
      desviacionMinutos: desviacion,
      requiereAprobacion: false,
      explicacion:
        `La jornada no se prestó: ${noPrestada.porque}. ` +
        `Sobre las ${formatearDuracion(programados)} acordadas se aplica el ${noPrestada.cobro} % a la familia ` +
        `(${formatearDuracion(facturables)}) y el ${noPrestada.pago} % al profesional (${formatearDuracion(liquidables)}).`,
    };
  }

  const pasos: string[] = [];
  const ajustar = (minutos: number, etiqueta: string): number => {
    let r = minutos;
    if (reglas.redondeoMinutos > 0 && reglas.redondeoModo !== "NINGUNO") {
      const antes = r;
      r = aplicarRedondeo(r, reglas.redondeoMinutos, reglas.redondeoModo);
      if (r !== antes) pasos.push(`${etiqueta}: ${formatearDuracion(antes)} redondeado a ${formatearDuracion(r)}`);
    }
    if (reglas.minimoMinutos > 0 && r < reglas.minimoMinutos) {
      pasos.push(`${etiqueta}: por debajo del mínimo, se aplica ${formatearDuracion(reglas.minimoMinutos)}`);
      r = reglas.minimoMinutos;
    }
    return r;
  };

  const baseCobro = elegirBase(reglas.baseCobro, programados, reales);
  const baseLiquidacion = elegirBase(reglas.baseLiquidacion, programados, reales);
  const facturables = ajustar(baseCobro, "Cobro");
  const liquidables = ajustar(baseLiquidacion, "Pago");

  const exceso = desviacion != null && desviacion > reglas.toleranciaExcesoMinutos ? desviacion : 0;
  const requiereAprobacion = reglas.aprobarTiempoExtra && exceso > 0;

  const frase: string[] = [];
  if (programados != null) frase.push(`Acordado ${formatearDuracion(programados)}`);
  if (reales != null) frase.push(`fichado ${formatearDuracion(reales)}`);
  frase.push(`se cobra ${NOMBRE_BASE[reglas.baseCobro]} (${formatearDuracion(facturables)})`);
  if (reglas.baseLiquidacion !== reglas.baseCobro || liquidables !== facturables) {
    frase.push(`se paga ${NOMBRE_BASE[reglas.baseLiquidacion]} (${formatearDuracion(liquidables)})`);
  }

  let explicacion = frase.join(", ") + ".";
  if (pasos.length > 0) explicacion += " " + pasos.join("; ") + ".";
  if (retraso != null && retraso > reglas.toleranciaRetrasoMinutos) {
    explicacion += ` Entrada con ${retraso} min de retraso sobre lo previsto.`;
  }
  if (requiereAprobacion) {
    if (entrada.ajusteEstado === "APROBADO") {
      explicacion += ` Los ${exceso} min por encima de lo acordado están aprobados: entran en la factura y en la liquidación.`;
    } else if (entrada.ajusteEstado === "RECHAZADO") {
      explicacion += ` Los ${exceso} min por encima de lo acordado se decidieron no cobrar: la jornada se queda en lo acordado.`;
    } else {
      explicacion += ` Hay ${exceso} min por encima de lo acordado: pendientes de que coordinación los apruebe.`;
    }
  }

  return {
    minutosProgramados: programados,
    minutosReales: reales,
    minutosFacturables: facturables,
    minutosLiquidables: liquidables,
    retrasoMinutos: retraso,
    desviacionMinutos: desviacion,
    requiereAprobacion,
    explicacion,
  };
}

// ---------------------------------------------------------------------------
// Del tiempo al dinero
//
// La comisión de CUIDA es lo que queda entre lo que paga la familia y lo que
// cobra el profesional. No se llama "beneficio" a propósito: de ahí salen
// impuestos, seguros, pasarela y gestión.
// ---------------------------------------------------------------------------

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface Importe {
  minutos: number;
  precioHora: number;
  importe: number;
  cuenta: string;
}

export interface EconomiaDeVisita {
  cliente: Importe;
  profesional: Importe;
  cuida: { importe: number; precioHora: number; cuenta: string };
}

export function calcularEconomia(opciones: {
  minutosFacturables: number;
  minutosLiquidables: number;
  precioHoraCliente: number;
  precioHoraProfesional: number;
}): EconomiaDeVisita {
  const horasCliente = opciones.minutosFacturables / 60;
  const horasProfesional = opciones.minutosLiquidables / 60;
  const importeCliente = redondear(horasCliente * opciones.precioHoraCliente);
  const importeProfesional = redondear(horasProfesional * opciones.precioHoraProfesional);
  const comisionHora = redondear(opciones.precioHoraCliente - opciones.precioHoraProfesional);

  // Con coma decimal: estas cuentas se leen tal cual en pantalla y acaban en
  // una conversación con la familia, no en un log.
  const eur = (n: number) => n.toFixed(2).replace(".", ",");
  const cuenta = (minutos: number, precio: number, total: number) =>
    `${formatearDuracion(minutos)} × ${eur(precio)} €/h = ${eur(total)} €`;

  return {
    cliente: {
      minutos: opciones.minutosFacturables,
      precioHora: opciones.precioHoraCliente,
      importe: importeCliente,
      cuenta: cuenta(opciones.minutosFacturables, opciones.precioHoraCliente, importeCliente),
    },
    profesional: {
      minutos: opciones.minutosLiquidables,
      precioHora: opciones.precioHoraProfesional,
      importe: importeProfesional,
      cuenta: cuenta(opciones.minutosLiquidables, opciones.precioHoraProfesional, importeProfesional),
    },
    cuida: {
      importe: redondear(importeCliente - importeProfesional),
      precioHora: comisionHora,
      // Cuando cobro y pago usan tiempos distintos, la diferencia ya no es
      // "horas × comisión/hora": decirlo así sería mentir sobre la cuenta.
      cuenta:
        opciones.minutosFacturables === opciones.minutosLiquidables
          ? cuenta(opciones.minutosFacturables, comisionHora, redondear(importeCliente - importeProfesional))
          : `${eur(importeCliente)} € cobrados − ${eur(importeProfesional)} € pagados = ${eur(redondear(importeCliente - importeProfesional))} €`,
    },
  };
}
