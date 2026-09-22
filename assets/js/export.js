// Exportar reportes a Excel y PDF. Todo se genera en el navegador (SheetJS y jsPDF, cargados por CDN en
// las páginas que los usan); no hay que pasar por el servidor ni guardar nada en la API.

// hojas: [{ nombre, columnas: [{ clave, titulo }], filas: [objeto, ...] }]
// El valor de cada celda es el dato tal cual (número o texto): así en Excel se pueden sumar y ordenar,
// no queda como texto con formato de moneda.
function descargarExcel(nombreArchivo, hojas) {
    const libro = XLSX.utils.book_new();
    hojas.forEach(hoja => {
        const filas = hoja.filas.map(fila => Object.fromEntries(hoja.columnas.map(col => [col.titulo, fila[col.clave]])));
        const hojaCalculo = XLSX.utils.json_to_sheet(filas, { header: hoja.columnas.map(col => col.titulo) });
        // Excel limita el nombre de cada hoja a 31 caracteres
        XLSX.utils.book_append_sheet(libro, hojaCalculo, hoja.nombre.slice(0, 31));
    });
    XLSX.writeFile(libro, nombreArchivo);
}

// secciones: [{ titulo, columnas: [{ clave, titulo, moneda? }], filas: [objeto, ...] }]
// A diferencia del Excel, aquí sí se formatean los montos (moneda: true) porque el PDF es para leer, no para calcular.
function descargarPDF({ archivo, titulo, subtitulo, secciones }) {
    const doc = new window.jspdf.jsPDF();
    const margen = 14;
    let y = 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(titulo, margen, y);

    if (subtitulo) {
        y += 7;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(90);
        doc.text(subtitulo, margen, y);
        doc.setTextColor(0);
    }
    y += 4;

    const conDatos = secciones.filter(seccion => seccion.filas.length > 0);
    if (conDatos.length === 0) {
        doc.setFontSize(11);
        doc.text('No hay datos en el rango seleccionado.', margen, y + 8);
    }

    conDatos.forEach(seccion => {
        if (seccion.titulo) {
            y += 8;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(seccion.titulo, margen, y);
            y += 2;
        }
        doc.autoTable({
            startY: y,
            margin: { left: margen, right: margen },
            head: [seccion.columnas.map(col => col.titulo)],
            body: seccion.filas.map(fila => seccion.columnas.map(col => (col.moneda ? formatearPesos(fila[col.clave]) : fila[col.clave]))),
            styles: { font: 'helvetica', fontSize: 9 },
            headStyles: { fillColor: [230, 57, 70] }, // var(--color-red)
            theme: 'striped',
        });
        y = doc.lastAutoTable.finalY;
    });

    doc.save(archivo);
}

// Nombre de archivo sin caracteres que Windows/macOS rechacen, con el rango de fechas incluido
function nombreArchivoConFecha(base, desde, hasta) {
    const limpiar = (fecha) => fecha.toLocaleDateString('en-CA'); // YYYY-MM-DD, sin barras
    return `${base}_${limpiar(desde)}_a_${limpiar(hasta)}`;
}
