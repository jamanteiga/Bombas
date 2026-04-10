let calibPoints = []; // [0: Origen, 1: H_max_eje, 2: Q_max_eje]
let config = { x0: 0, y0: 0, pxPerH: 0, pxPerQ: 0, maxH: 0, maxQ: 0 };
let pumpPoint = null;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// --- IMPORTACIÓN ---
async function handleImport(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');
    const msg = document.getElementById('statusMsg');

    canvas.style.display = 'block';
    msg.classList.remove('hidden');
    msg.innerText = "1. Toca el PUNTO ORIGEN (0,0) del gráfico";
    
    calibPoints = [];
    pumpPoint = null;

    if (type === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.5 });
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Ajustamos a pantalla manteniendo resolución para iPhone
                const scale = (window.innerWidth * 2) / img.width;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// --- EVENTOS TÁCTILES (iOS) ---
document.getElementById('pdfCanvas').addEventListener('touchstart', function(e) {
    e.preventDefault(); // Evita scroll al tocar la foto
    const touch = e.touches[0];
    const rect = this.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (this.width / rect.width);
    const y = (touch.clientY - rect.top) * (this.height / rect.height);
    procesarEntrada(x, y);
}, { passive: false });

// Fallback para click normal
document.getElementById('pdfCanvas').addEventListener('mousedown', function(e) {
    const rect = this.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.width / rect.width);
    const y = (e.clientY - rect.top) * (this.height / rect.height);
    procesarEntrada(x, y);
});

function procesarEntrada(x, y) {
    const msg = document.getElementById('statusMsg');

    if (calibPoints.length < 3) {
        calibPoints.push({x, y});
        dibujarCirculo(x, y, calibPoints.length, "#ef4444");

        if (calibPoints.length === 1) msg.innerText = "2. Toca el PUNTO MÁXIMO de la ESCALA VERTICAL (Altura)";
        if (calibPoints.length === 2) msg.innerText = "3. Toca el PUNTO MÁXIMO de la ESCALA HORIZONTAL (Caudal)";
        if (calibPoints.length === 3) {
            msg.innerText = "🎯 Calibrado. Ahora TOCA LA CURVA donde cruza la línea azul";
            inicializarMapeo();
        }
    } else {
        // Mapeo del punto real de la bomba
        pumpPoint = {x, y};
        dibujarCirculo(x, y, "B", "#22c55e");
        msg.innerText = "✅ Punto de funcionamiento registrado.";
    }
}

function inicializarMapeo() {
    // Usamos el 120% de lo requerido como valor máximo para los ejes tocados
    const hMaxReal = parseFloat(document.getElementById('hReq').value) * 1.2;
    const qMaxReal = parseFloat(document.getElementById('qReq').value) * 1.2;

    config = {
        x0: calibPoints[0].x,
        y0: calibPoints[0].y,
        pxPerH: Math.abs(calibPoints[0].y - calibPoints[1].y) / hMaxReal,
        pxPerQ: Math.abs(calibPoints[2].x - calibPoints[0].x) / qMaxReal,
        maxH: hMaxReal,
        maxQ: qMaxReal
    };

    // Dibujar línea de guía para el Q requerido
    const qReq = parseFloat(document.getElementById('qReq').value);
    const targetX = config.x0 + (qReq * config.pxPerQ);
    
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    ctx.setLineDash([15, 10]);
    ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(targetX, 0); ctx.lineTo(targetX, document.getElementById('pdfCanvas').height);
    ctx.stroke();
    ctx.setLineDash([]);
}

function dibujarCirculo(x, y, label, color) {
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "white"; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = "white"; ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center"; ctx.fillText(label, x, y + 8);
}

// --- CÁLCULO Y PDF ---
async function generarInforme() {
    if (!pumpPoint) return alert("Primero calibra y toca la curva de la bomba");

    // TRADUCCIÓN PÍXEL -> VALOR REAL
    const hPixels = config.y0 - pumpPoint.y;
    const hCalculada = (hPixels / config.pxPerH).toFixed(1);
    
    // Cálculo NPSH
    const npshD = parseFloat(document.getElementById('npshDisp').value);
    const hf = (parseInt(document.getElementById('acc_codo').value)*0.2) + (parseInt(document.getElementById('acc_globo').value)*1.4);
    const npshNeto = (npshD - hf).toFixed(2);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const tag = document.getElementById('pumpTag').value || "Bomba_Inspeccionada";

    doc.setFontSize(20); doc.setTextColor(30, 64, 175);
    doc.text("REPORTE TÉCNICO HIDRÁULICO", 20, 25);

    doc.autoTable({
        startY: 35,
        head: [['Parámetro', 'Valor']],
        body: [
            ['Identificación', tag],
            ['Q de Diseño', document.getElementById('qReq').value + " m³/h"],
            ['H de Diseño', document.getElementById('hReq').value + " m"],
            ['H REAL (Mapeada)', hCalculada + " m"],
            ['NPSH Neto Real', npshNeto + " m"],
            ['Estado', npshNeto < 3.5 ? "RIESGO DE CAVITACIÓN" : "OPERACIÓN SEGURA"]
        ],
        headStyles: { fillColor: [30, 64, 175] }
    });

    const imgData = document.getElementById('pdfCanvas').toDataURL("image/jpeg", 0.6);
    doc.addImage(imgData, 'JPEG', 10, 90, 190, 130);
    
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], `${tag}.pdf`, { type: "application/pdf" });

    if (navigator.share) {
        await navigator.share({ files: [file], title: 'Informe Bomba' });
    } else {
        doc.save(`${tag}.pdf`);
    }
}