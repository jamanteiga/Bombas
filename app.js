// --- CONFIGURACIÓN DE FABRICANTES Y CONSTANTES ---
const MAKERS = {
    naval: ["Azcue", "Thune Eureka", "DESMI", "Hamworthy", "Itur", "Wartsila"],
    global: ["Grundfos", "KSB", "Sulzer", "Ebara", "Flowserve"]
};

let calibPoints = []; 
let config = { x0: 0, y0: 0, pxH: 0, pxQ: 0, hMaxVal: 0, qMaxVal: 0 };

// --- GESTIÓN DE INTERFAZ ---
function filterMakers() {
    const s = document.getElementById('sectorSel').value;
    const makerSel = document.getElementById('makerSel');
    makerSel.innerHTML = MAKERS[s].map(m => `<option value="${m}">${m}</option>`).join('');
}

// --- IMPORTACIÓN Y RENDERIZADO (PDF / IMAGEN) ---
async function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');
    canvas.style.display = 'block';
    calibPoints = []; // Reiniciar calibración al cargar nuevo archivo
    document.getElementById('calibSteps').innerHTML = "Paso 1: Toca el ORIGEN (0,0) del gráfico.";

    if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 }); // Alta resolución para precisión
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
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

// --- CALIBRACIÓN Y ANÁLISIS VISUAL ---
document.getElementById('pdfCanvas').addEventListener('click', function(e) {
    const rect = this.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.width / rect.width);
    const y = (e.clientY - rect.top) * (this.height / rect.height);

    if (calibPoints.length < 3) {
        calibPoints.push({x, y});
        dibujarMarcador(x, y, calibPoints.length, "#ff3b30");
        
        const guias = [
            "Paso 2: Toca el MÁXIMO de ALTURA (H) en el eje vertical.",
            "Paso 3: Toca el MÁXIMO de CAUDAL (Q) en el eje horizontal.",
            "✅ Calibración OK. Procesando punto de trabajo..."
        ];
        document.getElementById('calibSteps').innerText = guias[calibPoints.length - 1];

        if (calibPoints.length === 3) {
            ejecutarAnalisisVisual();
        }
    }
});

function dibujarMarcador(x, y, num, color) {
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath(); 
    ctx.arc(x, y, 8, 0, Math.PI * 2); 
    ctx.fill();
    ctx.strokeStyle = "white"; 
    ctx.lineWidth = 2; 
    ctx.stroke();
    ctx.font = "bold 16px Arial";
    ctx.fillText(num, x + 12, y + 5);
}

function ejecutarAnalisisVisual() {
    const Q_req = parseFloat(document.getElementById('qReq')?.value || 0);
    const H_req = parseFloat(document.getElementById('hReq')?.value || 0);
    
    // Definir la escala del gráfico basada en los puntos de calibración
    // Asumimos que el usuario sabe el valor máximo de los ejes que tocó
    const hMaxReal = H_req * 1.5; 
    const qMaxReal = Q_req * 1.5;

    config = {
        x0: calibPoints[0].x, 
        y0: calibPoints[0].y,
        pxH: Math.abs(calibPoints[0].y - calibPoints[1].y),
        pxQ: Math.abs(calibPoints[2].x - calibPoints[0].x),
        hMaxVal: hMaxReal,
        qMaxVal: qMaxReal
    };

    const targetX = config.x0 + (Q_req / config.qMaxVal) * config.pxQ;
    const targetY = config.y0 - (H_req / config.hMaxVal) * config.pxH;

    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    
    // Dibujar Punto de Trabajo (X azul)
    ctx.strokeStyle = "#007AFF"; 
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(targetX - 15, targetY - 15); ctx.lineTo(targetX + 15, targetY + 15);
    ctx.moveTo(targetX + 15, targetY - 15); ctx.lineTo(targetX - 15, targetY + 15);
    ctx.stroke();

    // Dibujar Curva del Sistema (Parábola)
    ctx.beginPath(); 
    ctx.setLineDash([5, 5]); 
    ctx.strokeStyle = "rgba(0, 122, 255, 0.6)";
    for (let q = 0; q <= config.qMaxVal; q += config.qMaxVal / 50) {
        // H_sys = H_estatica + k*Q^2
        const h = (H_req * 0.4) + ((H_req * 0.6) / Math.pow(Q_req, 2)) * Math.pow(q, 2);
        const dx = config.x0 + (q / config.qMaxVal) * config.pxQ;
        const dy = config.y0 - (h / config.hMaxVal) * config.pxH;
        if (q === 0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
}

// --- CÁLCULOS HIDRÁULICOS (PÉRDIDAS Y NPSH) ---
function calcularNPSH() {
    const npshDispInput = parseFloat(document.getElementById('npshDisp').value);
    const codos = parseInt(document.getElementById('acc_codo').value) || 0;
    const globos = parseInt(document.getElementById('acc_globo').value) || 0;
    const filtros = parseInt(document.getElementById('acc_filt').value) || 0;

    // Factores de pérdida simplificados (K)
    const perdidasPuntuales = (codos * 0.3) + (globos * 4.0) + (filtros * 1.5);
    const npshReal = npshDispInput - (perdidasPuntuales * 0.1); // Estimación de caída de presión

    return npshReal.toFixed(2);
}

// --- GENERACIÓN DE INFORME ---
async function generarYCompartir() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const Q = document.getElementById('qReq').value;
    const H = document.getElementById('hReq').value;
    const npshFinal = calcularNPSH();
    
    // Lógica de Semáforo BEP
    let color = [46, 204, 113]; // Verde
    let estado = "ZONA SEGURA (BEP)";
    
    if (npshFinal < 2.5) {
        color = [231, 76, 60]; // Rojo
        estado = "CRÍTICO: RIESGO CAVITACIÓN";
    }

    doc.setFontSize(22);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(`ANÁLISIS DE BOMBA: ${estado}`, 20, 30);

    doc.autoTable({
        startY: 45,
        head: [['Parámetro', 'Valor']],
        body: [
            ['Fabricante', document.getElementById('makerSel').value],
            ['Punto de Operación', `${Q} m3/h @ ${H} m`],
            ['NPSH Disponible Real', `${npshFinal} m`],
            ['Recomendación', npshFinal < 3 ? "Revisar succión" : "Operación normal"]
        ],
        headStyles: { fillColor: color }
    });

    const canvas = document.getElementById('pdfCanvas');
    if (canvas.style.display !== 'none') {
        const imgData = canvas.toDataURL("image/jpeg", 0.9);
        doc.addImage(imgData, 'JPEG', 15, 90, 180, 120);
    }
    
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], "Informe_BombasPro.pdf", { type: "application/pdf" });
    
    if (navigator.share) {
        await navigator.share({ files: [file], title: 'Informe Técnico Bomba' });
    } else {
        doc.save("Informe_Bomba.pdf");
    }
}

// Inicialización
window.onload = () => {
    filterMakers();
    // Inyectar contenedor de pasos de calibración si no existe
    if(!document.getElementById('calibSteps')){
        const div = document.createElement('div');
        div.id = 'calibSteps';
        div.className = 'sec';
        div.style.color = '#007AFF';
        document.getElementById('pdfCanvas').before(div);
    }
};