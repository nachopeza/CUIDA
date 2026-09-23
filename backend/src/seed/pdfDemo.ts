// Un PDF de una página, válido y abrible, para que la demo tenga documentos
// de verdad y no filas que apuntan a nada. No es un generador de PDF: es lo
// mínimo que el formato exige, con los desplazamientos de la tabla xref
// calculados, que es la parte que suele estar mal en los ejemplos cortos.
export function pdfDeUnaPagina(titulo: string, lineas: string[]): Buffer {
  const escapar = (t: string) => t.replace(/([\\()])/g, "\\$1");
  const texto = [
    "BT",
    "/F1 16 Tf",
    "60 760 Td",
    `(${escapar(titulo)}) Tj`,
    "/F1 11 Tf",
    ...lineas.flatMap((l) => ["0 -22 Td", `(${escapar(l)}) Tj`]),
    "ET",
  ].join("\n");

  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(texto, "latin1")} >>\nstream\n${texto}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const posiciones: number[] = [];
  objetos.forEach((cuerpo, i) => {
    posiciones.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });

  const inicioXref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const pos of posiciones) pdf += `${String(pos).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
