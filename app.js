let calibPoints = []; 
let config = { x0: 0, y0: 0, pxH: 0, pxQ: 0, hMaxVal: 0, qMaxVal: 0 };
let puntoCurvaReal = null;

// Configuración de PDF.js para iOS
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// --- IMPORTACIÓN DE ARCHIVOS ---
async function handleImport(event, tipo) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');
    const steps = document.getElementById('calibSteps');
    
    // Reset de estado
    canvas.style.display = 'block';
    steps.classList.remove('hidden');
    calibPoints = [];
    puntoCurvaReal = null;
    steps.innerText = "1. Toca el ORIGEN (0,0) en el gráfico";

    if (tipo === 'pdf') {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 2.5 }); // Escala alta para precisión en iPhone
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        } catch (err) {
            alert("Error al cargar PDF: " + err.message);
        }
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const maxW = window.innerWidth * 2;
                const ratio = img.width / img.height;
                canvas.width = maxW;
                canvas.height = maxW / ratio;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// --- LÓGICA DE CALIBRACIÓN Y MAPEO ---
document.getElementById('pdfCanvas').addEventListener('touchstart', function(e) {
    // Evitar scroll mientras se calibra
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (this.width / rect.width);
    const y = (touch.clientY - rect.top) * (this.height / rect.height);

    procesarClick(x, y);
}, { passive: false });

// Fallback para mouse/simulador
document.getElementById('pdfCanvas').addEventListener('mousedown', function(e) {
    const rect = this.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.width / rect.width);
    const y = (e.clientY - rect.top) * (this.height / rect.height);
    procesarClick(x, y);
});

function procesarClick(x, y) {
    const steps = document.getElementById('calibSteps');

    if (calibPoints.length < 3) {
        calibPoints.push({x, y});
        dibujarMarcador(x, y, calibPoints.length, "#ef4444"); // Rojo
        
        const guias = [
            "2. Toca el MÁXIMO de ALTURA (H)",
            "3. Toca el MÁXIMO de CAUDAL (Q)",
            "🎯 Calibrado. TOCA LA CURVA sobre la línea azul"
        ];
        steps.innerText = guias[calibPoints.length - 1];
        
        if(calibPoints.length === 3) calcularParametros();
    } else {
        puntoCurvaReal = {x, y};
        dibujarMarcador(x, y, "✔", "#22c55e"); // Verde
        steps.innerText = "✅ Punto capturado correctamente";
    }
}

function calcularParametros() {
    // Escala: 1.5x el requerimiento para tener margen visual
    const H_ref = parseFloat(document.getElementById('hReq').value) * 1.5;
    const Q_ref = parseFloat(document.getElementById('qReq').value) * 1.5;

    config = {
        x0: calibPoints[0].x,
        y0: calibPoints[0].y,
        pxH: Math.abs(calibPoints[0].y - calibPoints[1].y),
        pxQ: Math.abs(calibPoints[2].x - calibPoints[0].x),
        hMaxVal: H_ref,
        qMaxVal: Q_ref
    };
    dibujarLineaGuia();
}

function dibujarLineaGuia() {
    const Q_req = parseFloat(document.getElementById('qReq').value);
    const targetX = config.x0 + (Q_req / config.qMaxVal) * config.pxQ;
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    
    ctx.setLineDash([20, 10]);
    ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(targetX, 0);
    ctx.lineTo(targetX, document.getElementById('pdfCanvas').height);
    ctx.stroke();
    ctx.setLineDash([]);
}

function dibujarMarcador(x, y, texto, color) {
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "white"; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = "white"; ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center"; ctx.fillText(texto, x, y + 8);
}

// --- RESULTADOS E INFORME ---
function calcularHidraulica() {
    if (!puntoCurvaReal) return null;

    const pxRelativoH = config.y0 - puntoCurvaReal.y;
    const hBomba = (pxRelativoH / config.pxH) * config.hMaxVal;

    const codos = parseInt(document.getElementById('acc_codo').value) || 0;
    const globos = parseInt(document.getElementById('acc_globo').value) || 0;
    const npshD = parseFloat(document.getElementById('npshDisp').value);
    
    // Pérdidas estimadas en metros
    const hf = (codos * 0.2) + (globos * 1.5);
    
    return {
        hReal: hBomba.toFixed(1),
        npshFinal: (npshD - hf).toFixed(2)
    };
}

async function generarYCompartir() {
    const res = calcularHidraulica();
    if (!res) return alert("Por favor, calibra y mapea el punto en la curva.");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const tag = document.getElementById('pumpTag').value || "Bomba_Analizada";

    doc.setFontSize(22);
    doc.setTextColor(30, 64, 175);
    doc.text("INFORME DE INSPECCIÓN", 20, 25);

    doc.autoTable({
        startY: 35,
        head: [['CONCEPTO', 'VALOR']],
        body: [
            ['IDENTIFICACIÓN', tag],
            ['Q REQUERIDO', document.getElementById('qReq').value + " m3/h"],
            ['H REQUERIDA', document.getElementById('hReq').value + " m"],
            ['H REAL BOMBA', res.hReal + " m"],
            ['NPSH DISPONIBLE NETO', res.npshFinal + " m"],
            ['ESTADO NPSH', res.npshFinal < 3.0 ? "CRÍTICO" : "DENTRO DE RANGO"]
        ],
        theme: 'striped',
        headStyles: { fillColor: [30, 64, 175] }
    });

    const canvas = document.getElementById('pdfCanvas');
    const imgData = canvas.toDataURL("image/jpeg", 0.5);
    doc.addImage(imgData, 'JPEG', 10, 100, 190, 130);

    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], `${tag.replace(/\s+/g, '_')}.pdf`, { type: "application/pdf" });

    if (navigator.share) {
        try {
            await navigator.share({ files: [file], title: 'Informe Bombas Pro' });
        } catch (e) {
            saveFallback(doc, tag);
        }
    } else {
        saveFallback(doc, tag);
    }
}

function saveFallback(doc, tag) {
    doc.save(`${tag}.pdf`);
    alert("Informe generado. Revisa tus descargas.");
}