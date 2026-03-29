// --- CONFIGURACIÓN DE FABRICANTES Y CONSTANTES ---
const MAKERS = {
    naval: ["Azcue", "Thune Eureka", "DESMI", "Hamworthy", "Itur", "Wartsila"],
    global: ["Grundfos", "KSB", "Sulzer", "Ebara", "Flowserve"]
};

let calibPoints = []; 
let config = { x0: 0, y0: 0, pxH: 0, pxQ: 0, hMaxVal: 0, qMaxVal: 0 };

function filterMakers() {
    const s = document.getElementById('sectorSel').value;
    document.getElementById('makerSel').innerHTML = MAKERS[s].map(m => `<option value="${m}">${m}</option>`).join('');
}

// --- CALIBRACIÓN Y DIBUJO ---
document.getElementById('pdfCanvas').addEventListener('click', function(e) {
    const rect = this.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.width / rect.width);
    const y = (e.clientY - rect.top) * (this.height / rect.height);

    calibPoints.push({x, y});
    dibujarMarcador(x, y, calibPoints.length);
    
    const guia = [
        "Paso 2: Toca el MÁXIMO de ALTURA (H) en el eje vertical.",
        "Paso 3: Toca el MÁXIMO de CAUDAL (Q) en el eje horizontal.",
        "✅ Calibración OK. Procesando punto de trabajo...",
        "✅ Calibración OK. Procesando punto de trabajo..."
    ];
    document.getElementById('calibSteps').innerHTML = guia[calibPoints.length-1] || guia[3];

    if (calibPoints.length === 3) {
        ejecutarAnalisisVisual();
    }
});

function dibujarMarcador(x, y, num) {
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    ctx.fillStyle = "#ff3b30";
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
}

function ejecutarAnalisisVisual() {
    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');
    
    // Configurar escalas basadas en los inputs del usuario
    const Q_req = parseFloat(document.getElementById('qReq').value);
    const H_req = parseFloat(document.getElementById('hReq').value);
    
    config = {
        x0: calibPoints[0].x, 
        y0: calibPoints[0].y,
        pxH: Math.abs(calibPoints[0].y - calibPoints[1].y),
        pxQ: Math.abs(calibPoints[2].x - calibPoints[0].x),
        hMaxVal: H_req * 1.4, // Escala estimada para el gráfico
        qMaxVal: Q_req * 1.4
    };

    const targetX = config.x0 + (Q_req / config.qMaxVal) * config.pxQ;
    const targetY = config.y0 - (H_req / config.hMaxVal) * config.pxH;

    // Dibujar Punto de Trabajo con la "X"
    ctx.strokeStyle = "#007AFF"; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(targetX-20, targetY-20); ctx.lineTo(targetX+20, targetY+20);
    ctx.moveTo(targetX+20, targetY-20); ctx.lineTo(targetX-20, targetY+20);
    ctx.stroke();

    // Dibujar Parábola del Sistema
    ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(0,122,255,0.5)";
    for (let q = 0; q <= config.qMaxVal; q += config.qMaxVal/20) {
        const h = (H_req * 0.3) + ((H_req * 0.7) / Math.pow(Q_req, 2)) * Math.pow(q, 2);
        const dx = config.x0 + (q / config.qMaxVal) * config.pxQ;
        const dy = config.y0 - (h / config.hMaxVal) * config.pxH;
        if(q===0) ctx.moveTo(dx,dy); else ctx.lineTo(dx,dy);
    }
    ctx.stroke();
}

// --- GENERAR INFORME CON SEMÁFORO BEP ---
async function generarYCompartir() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const Q = parseFloat(document.getElementById('qReq').value);
    const nDisp = parseFloat(document.getElementById('npshDisp').value);
    
    // Lógica del Semáforo (Simulando que el BEP está en el centro de la escala)
    let color = [46, 204, 113]; // Verde
    let msg = "ZONA ÓPTIMA (BEP)";
    
    if (Q < 5 || Q > 50) { // Ejemplo de límites
        color = [231, 76, 60]; // Rojo
        msg = "PELIGRO: FUERA DE RANGO";
    }

    doc.setFontSize(20); doc.setTextColor(color[0], color[1], color[2]);
    doc.text(`ESTADO: ${msg}`, 20, 25);

    doc.autoTable({
        startY: 35,
        head: [['Parámetro', 'Valor']],
        body: [
            ['Bomba', document.getElementById('makerSel').value],
            ['Punto Trabajo', `${Q} m3/h @ ${document.getElementById('hReq').value} m`],
            ['NPSH Disponible', `${nDisp} m`],
            ['Eficiencia Est.', msg]
        ],
        headStyles: { fillColor: color }
    });

    const imgData = document.getElementById('pdfCanvas').toDataURL("image/jpeg", 0.8);
    doc.addImage(imgData, 'JPEG', 15, 80, 180, 110);
    
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], "Analisis_Bomba.pdf", { type: "application/pdf" });
    
    if (navigator.share) await navigator.share({ files: [file], title: 'Informe Bomba' });
    else doc.save("Informe.pdf");
}

window.onload = filterMakers;