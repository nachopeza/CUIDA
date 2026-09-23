import { prisma } from "../lib/prisma.js";
import { calcularEconomia, calcularTiempos, reglasDe, type Reglas } from "./motorTiempo.js";

// ---------------------------------------------------------------------------
// Aplicar el motor a una visita concreta y dejar el resultado escrito.
//
// La cuenta se hace una vez, cuando la jornada termina, y se guarda con la
// instantánea de la tarifa que se le aplicó. A partir de ahí la factura, la
// liquidación y el desglose leen lo mismo, y subir el precio en octubre no
// reescribe lo prestado en septiembre.
// ---------------------------------------------------------------------------

export interface TarifaAplicada {
  tarifaId: string | null;
  precioHoraCliente: number;
  precioHoraProfesional: number;
  origen: string;
}

// Qué precios rigen para esta jornada, en este orden:
//   1. una tarifa vigente ese día para ese tipo de servicio,
//   2. una tarifa vigente general de la organización,
//   3. lo pactado en el propio servicio (precio/hora y % de CUIDA).
// El tercero es el camino que CUIDA ha usado hasta ahora, así que los
// servicios ya acordados siguen funcionando sin tocarlos.
export async function tarifaAplicable(visitaId: string): Promise<TarifaAplicada | null> {
  const visita = await prisma.visita.findUnique({
    where: { id: visitaId },
    include: { servicio: { include: { solicitud: { select: { necesidadId: true } } } } },
  });
  if (!visita) return null;
  const servicio = visita.servicio;

  const vigentes = await prisma.tarifa.findMany({
    where: {
      organizacionId: servicio.organizacionId,
      activa: true,
      vigenteDesde: { lte: visita.fecha },
      OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: visita.fecha } }],
    },
    orderBy: { vigenteDesde: "desc" },
  });

  const especifica = vigentes.find((t) => t.necesidadId && t.necesidadId === servicio.solicitud.necesidadId);
  const general = vigentes.find((t) => !t.necesidadId);
  const elegida = especifica ?? general;

  if (elegida) {
    return {
      tarifaId: elegida.id,
      precioHoraCliente: Number(elegida.precioHoraCliente),
      precioHoraProfesional: Number(elegida.precioHoraProfesional),
      origen: `Tarifa "${elegida.nombre}", vigente desde el ${elegida.vigenteDesde.toLocaleDateString("es-ES")}`,
    };
  }

  if (servicio.precioHora == null) return null;
  const precioCliente = Number(servicio.precioHora);
  const comision = Number(servicio.comisionPorcentaje ?? 0);
  return {
    tarifaId: null,
    precioHoraCliente: precioCliente,
    precioHoraProfesional: Math.round(precioCliente * (1 - comision / 100) * 100) / 100,
    origen: `Precio acordado en el servicio ${servicio.codigo} (${precioCliente.toFixed(2)} €/h, ${comision} % de CUIDA)`,
  };
}

// Recalcula tiempos e importes de una visita y los persiste. Devuelve lo
// calculado para poder contarlo en el acto (por ejemplo, al cerrar la jornada).
export async function liquidarVisita(visitaId: string, reglasDadas?: Reglas) {
  const visita = await prisma.visita.findUnique({
    where: { id: visitaId },
    include: { servicio: { select: { organizacionId: true } } },
  });
  if (!visita) return null;

  const reglas = reglasDadas ?? (await reglasDe(visita.servicio.organizacionId));
  const tiempos = calcularTiempos(
    {
      horaInicioProg: visita.horaInicioProg,
      horaFinProg: visita.horaFinProg,
      horaInicioReal: visita.horaInicioReal,
      horaFinReal: visita.horaFinReal,
      fecha: visita.fecha,
      estado: visita.estado,
    },
    reglas,
  );

  const tarifa = await tarifaAplicable(visitaId);
  const economia = tarifa
    ? calcularEconomia({
        minutosFacturables: tiempos.minutosFacturables,
        minutosLiquidables: tiempos.minutosLiquidables,
        precioHoraCliente: tarifa.precioHoraCliente,
        precioHoraProfesional: tarifa.precioHoraProfesional,
      })
    : null;

  // Un ajuste ya decidido por una persona no se vuelve a poner en pendiente
  // porque el motor recalcule: la decisión manda sobre el cálculo.
  const ajusteEstado =
    visita.ajusteEstado === "SIN_AJUSTE" && tiempos.requiereAprobacion ? "PENDIENTE" : visita.ajusteEstado;

  const actualizada = await prisma.visita.update({
    where: { id: visitaId },
    data: {
      minutosProgramados: tiempos.minutosProgramados,
      minutosReales: tiempos.minutosReales,
      minutosFacturables: tiempos.minutosFacturables,
      minutosLiquidables: tiempos.minutosLiquidables,
      retrasoMinutos: tiempos.retrasoMinutos,
      desviacionMinutos: tiempos.desviacionMinutos,
      explicacionTiempo: tiempos.explicacion,
      ajusteEstado,
      tarifaId: tarifa?.tarifaId ?? null,
      precioHoraCliente: tarifa?.precioHoraCliente ?? null,
      precioHoraProfesional: tarifa?.precioHoraProfesional ?? null,
      importeCliente: economia?.cliente.importe ?? null,
      importeProfesional: economia?.profesional.importe ?? null,
      importeCuida: economia?.cuida.importe ?? null,
    },
  });

  return { visita: actualizada, tiempos, tarifa, economia, reglas };
}
