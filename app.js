let calibPoints = []; 
let config = { x0: 0, y0: 0, pxH: 0, pxQ: 0, hMaxVal: 0, qMaxVal: 0 };
let puntoCurvaReal = null;

// --- IMPORTACIÓN ---
async function handleImport(event, tipo) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');
    canvas.style.display = 'block';
    document.getElementById('calibSteps').classList.remove('hidden');
    
    calibPoints = [];
    puntoCurvaReal = null;
    document.getElementById('calibSteps').innerText = "Paso 1: Toca el ORIGEN (0,0) del gráfico";

    if (tipo === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
    } else {
        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
        };
        img.src = URL.createObjectURL(file);
    }
}

// --- CALIBRACIÓN Y MAPEO ---
document.getElementById('pdfCanvas').addEventListener('click', function(e) {
    const rect = this.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.width / rect.width);
    const y = (e.clientY - rect.top) * (this.height / rect.height);

    if (calibPoints.length < 3) {
        calibPoints.push({x, y});
        dibujarMarcador(x, y, calibPoints.length, "#ff3b30");
        
        const guias = [
            "Paso 2: Toca el MÁXIMO de ALTURA (H) del eje",
            "Paso 3: Toca el MÁXIMO de CAUDAL (Q) del eje",
            "🎯 Calibrado. Ahora TOCA LA CURVA donde corta el Q req."
        ];
        document.getElementById('calibSteps').innerText = guias[calibPoints.length - 1];
        
        if(calibPoints.length === 3) calcularEscalas();
    } else {
        // Digitalización del punto real de la bomba
        puntoCurvaReal = {x, y};
        dibujarMarcador(x, y, "B", "#00c73c");
        document.getElementById('calibSteps').innerText = "✅ Punto capturado. Listo para informe.";
    }
});

function calcularEscalas() {
    // Tomamos los valores máximos de los inputs como referencia de escala del eje
    const H_max_eje = parseFloat(document.getElementById('hReq').value) * 1.5;
    const Q_max_eje = parseFloat(document.getElementById('qReq').value) * 1.5;

    config = {
        x0: calibPoints[0].x,
        y0: calibPoints[0].y,
        pxH: Math.abs(calibPoints[0].y - calibPoints[1].y),
        pxQ: Math.abs(calibPoints[2].x - calibPoints[0].x),
        hMaxVal: H_max_eje,
        qMaxVal: Q_max_eje
    };
    dibujarGuiaTrabajo();
}

function dibujarGuiaTrabajo() {
    const Q_req = parseFloat(document.getElementById('qReq').value);
    const targetX = config.x0 + (Q_req / config.qMaxVal) * config.pxQ;
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    
    // Línea vertical de guía para que el usuario sepa dónde tocar la curva
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = "rgba(0, 122, 255, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(targetX, 0);
    ctx.lineTo(targetX, document.getElementById('pdfCanvas').height);
    ctx.stroke();
    ctx.setLineDash([]);
}

function dibujarMarcador(x, y, num, color) {
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "white"; ctx.font = "bold 14px Arial";
    ctx.textAlign = "center"; ctx.fillText(num, x, y + 5);
}

// --- HIDRÁULICA Y NPSH ---
function calcularResultados() {
    if (!puntoCurvaReal) return null;

    // Traducir píxel tocado en la curva a valor H real
    const pxRelativoH = config.y0 - puntoCurvaReal.y;
    const H_bomba_real = (pxRelativoH / config.pxH) * config.hMaxVal;

    // Cálculo pérdidas NPSH
    const codos = parseInt(document.getElementById('acc_codo').value) || 0;
    const globos = parseInt(document.getElementById('acc_globo').value) || 0;
    const npshD = parseFloat(document.getElementById('npshDisp').value);
    const perdidas = (codos * 0.15) + (globos * 1.2); 
    
    return {
        hReal: H_bomba_real.toFixed(2),
        npshFinal: (npshD - perdidas).toFixed(2)
    };
}

// --- INFORME ---
async function generarYCompartir() {
    const res = calcularResultados();
    if (!res) return alert("Primero calibra y toca la curva de la bomba");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const tag = document.getElementById('pumpTag').value || "Bomba Genérica";

    doc.setFontSize(18);
    doc.text(`INFORME TÉCNICO: ${tag}`, 20, 20);

    doc.autoTable({
        startY: 30,
        head: [['Parámetro', 'Valor']],
        body: [
            ['Caudal Requerido', document.getElementById('qReq').value + " m3/h"],
            ['Altura Requerida', document.getElementById('hReq').value + " m"],
            ['Altura Real Bomba (Mapeada)', res.hReal + " m"],
            ['NPSH Disponible Neto', res.npshFinal + " m"],
            ['Estado NPSH', res.npshFinal < 3 ? "RIESGO CAVITACIÓN" : "OK"]
        ]
    });

    const imgData = document.getElementById('pdfCanvas').toDataURL("image/jpeg", 0.7);
    doc.addImage(imgData, 'JPEG', 15, 80, 180, 120);

    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], `${tag}.pdf`, { type: "application/pdf" });

    if (navigator.share) {
        try {
            await navigator.share({ files: [file], title: 'Informe Bomba' });
        } catch (e) {
            descargarPDF(doc, tag);
        }
    } else {
        descargarPDF(doc, tag);
    }
}

function descargarPDF(doc, name) {
    doc.save(`${name}.pdf`);
    alert("PDF descargado. Adjúntalo manualmente a WhatsApp.");
}