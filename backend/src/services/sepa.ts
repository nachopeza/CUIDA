// Generación del fichero de adeudos directos SEPA (pain.008.001.02), que es
// lo que se sube al banco para girar los recibos domiciliados de un mes.
//
// Esto es un prototipo: el fichero tiene la estructura y los campos reales,
// pero no debe usarse contra una entidad sin validarlo con ella. Se genera a
// mano y no con una librería a propósito — son cuatro bloques de XML y así
// queda a la vista qué se manda exactamente.

export interface AdeudoSepa {
  referencia: string; // referencia única del adeudo (la factura)
  mandatoReferencia: string;
  fechaFirmaMandato: Date;
  primerCobro: boolean;
  titular: string;
  iban: string;
  bic?: string | null;
  importe: number;
  concepto: string;
}

export interface AcreedorSepa {
  nombre: string;
  identificador: string; // identificador de acreedor que asigna el banco
  iban: string;
}

// El XML no admite según qué caracteres y los bancos suelen rechazar los que
// no están en el juego SEPA. Se limpia en vez de dejar que reviente en el
// banco tres días después.
function limpiar(texto: string, maximo: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 /?:().,'+-]/g, " ")
    .trim()
    .slice(0, maximo);
}

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function soloFecha(f: Date): string {
  return f.toISOString().slice(0, 10);
}

function dosDecimales(n: number): string {
  return n.toFixed(2);
}

export function generarPain008(opciones: {
  mensajeId: string;
  creado: Date;
  fechaCargo: Date;
  acreedor: AcreedorSepa;
  adeudos: AdeudoSepa[];
}): string {
  const { mensajeId, creado, fechaCargo, acreedor, adeudos } = opciones;
  const total = adeudos.reduce((acc, a) => acc + a.importe, 0);

  // El banco trata distinto el primer adeudo de un mandato (FRST) y los
  // siguientes (RCUR), así que van en bloques separados.
  const grupos = (
    [
      { secuencia: "FRST", lista: adeudos.filter((a) => a.primerCobro) },
      { secuencia: "RCUR", lista: adeudos.filter((a) => !a.primerCobro) },
    ] as const
  ).filter((g) => g.lista.length > 0);

  const bloques = grupos
    .map(({ secuencia, lista }) => {
      const suma = lista.reduce((acc, a) => acc + a.importe, 0);
      const operaciones = lista
        .map(
          (a) => `      <DrctDbtTxInf>
        <PmtId><EndToEndId>${escapar(limpiar(a.referencia, 35))}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${dosDecimales(a.importe)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${escapar(limpiar(a.mandatoReferencia, 35))}</MndtId>
            <DtOfSgntr>${soloFecha(a.fechaFirmaMandato)}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt><FinInstnId>${a.bic ? `<BIC>${escapar(limpiar(a.bic, 11))}</BIC>` : "<Othr><Id>NOTPROVIDED</Id></Othr>"}</FinInstnId></DbtrAgt>
        <Dbtr><Nm>${escapar(limpiar(a.titular, 70))}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${escapar(a.iban.replace(/\s+/g, ""))}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${escapar(limpiar(a.concepto, 140))}</Ustrd></RmtInf>
      </DrctDbtTxInf>`,
        )
        .join("\n");

      return `    <PmtInf>
      <PmtInfId>${escapar(limpiar(`${mensajeId}-${secuencia}`, 35))}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${lista.length}</NbOfTxs>
      <CtrlSum>${dosDecimales(suma)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>${secuencia}</SeqTp></PmtTpInf>
      <ReqdColltnDt>${soloFecha(fechaCargo)}</ReqdColltnDt>
      <Cdtr><Nm>${escapar(limpiar(acreedor.nombre, 70))}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${escapar(acreedor.iban.replace(/\s+/g, ""))}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>${escapar(limpiar(acreedor.identificador, 35))}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
${operaciones}
    </PmtInf>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${escapar(limpiar(mensajeId, 35))}</MsgId>
      <CreDtTm>${creado.toISOString().replace(/\.\d{3}Z$/, "")}</CreDtTm>
      <NbOfTxs>${adeudos.length}</NbOfTxs>
      <CtrlSum>${dosDecimales(total)}</CtrlSum>
      <InitgPty><Nm>${escapar(limpiar(acreedor.nombre, 70))}</Nm></InitgPty>
    </GrpHdr>
${bloques}
  </CstmrDrctDbtInitn>
</Document>`;
}

// Validación de IBAN por el resto módulo 97. No es un capricho: un IBAN mal
// tecleado no se detecta hasta que el banco devuelve la remesa entera días
// después, y para entonces ya has perdido el cobro del mes.
export function ibanValido(iban: string): boolean {
  const limpio = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(limpio)) return false;
  const movido = limpio.slice(4) + limpio.slice(0, 4);
  const numerico = movido.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let resto = 0;
  for (const digito of numerico) resto = (resto * 10 + Number(digito)) % 97;
  return resto === 1;
}
