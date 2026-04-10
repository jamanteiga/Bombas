let calibPoints = [];
let config = { x0: 0, y0: 0, pxPerH: 0, pxPerQ: 0 };
let isLocked = false;
let pumpPoint = null;

// Inicializar TensorFlow.js
async function initAI() {
    const dot = document.getElementById('aiDot');
    const text = document.querySelector('#aiStatus span');
    try {
        await tf.ready();
        dot.classList.replace('bg-slate-500', 'bg-cyan-400');
        text.innerText = "Engine Ready";
        text.classList.replace('text-slate-400', 'text-cyan-400');
    } catch (e) {
        text.innerText = "Engine Error";
    }
}
initAI();

async function handleImport(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');
    
    // UI Reset
    canvas.style.display = 'block';
    document.getElementById('calibPanel').classList.remove('hidden');
    document.getElementById('statusMsg').classList.remove('hidden');
    document.getElementById('statusMsg').innerText = "PASO 1: Toca el ORIGEN (0,0)";
    calibPoints = [];
    isLocked = false;

    if (type === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
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

// Interacción Táctil con Mapeo
document.getElementById('pdfCanvas').addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = e.target.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (e.target.width / rect.width);
    const y = (touch.clientY - rect.top) * (e.target.height / rect.height);
    
    if (!isLocked) {
        handleCalibration(x, y);
    } else {
        handleMapping(x, y);
    }
}, { passive: false });

function handleCalibration(x, y) {
    if (calibPoints.length < 3) {
        calibPoints.push({x, y});
        drawPoint(x, y, calibPoints.length, "#22d3ee");
        
        const steps = ["", "PASO 2: Toca el MÁXIMO de Altura (H)", "PASO 3: Toca el MÁXIMO de Caudal (Q)", "¡CALIBRADO! Pulsa el botón verde"];
        document.getElementById('statusMsg').innerText = steps[calibPoints.length] || steps[3];
        document.getElementById('stepCounter').innerText = `Paso ${Math.min(calibPoints.length + 1, 3)}/3`;
    }
}

function lockScale() {
    if (calibPoints.length < 3) return alert("Calibra los 3 puntos primero");
    
    const hScale = parseFloat(document.getElementById('hMaxScale').value);
    const qScale = parseFloat(document.getElementById('qMaxScale').value);
    
    config = {
        x0: calibPoints[0].x,
        y0: calibPoints[0].y,
        pxPerH: Math.abs(calibPoints[0].y - calibPoints[1].y) / hScale,
        pxPerQ: Math.abs(calibPoints[2].x - calibPoints[0].x) / qScale
    };

    isLocked = true;
    document.getElementById('statusMsg').innerText = "IA ACTIVA: Toca la curva de la bomba";
    document.getElementById('btnFinal').classList.remove('hidden');
    drawRequirementGuide();
}

function drawRequirementGuide() {
    const qReq = parseFloat(document.getElementById('qReq').value);
    const targetX = config.x0 + (qReq * config.pxPerQ);
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = "rgba(34, 211, 238, 0.6)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(targetX, 0); ctx.lineTo(targetX, document.getElementById('pdfCanvas').height);
    ctx.stroke();
}

function handleMapping(x, y) {
    // Aquí implementamos el "Snapping" (Imantado)
    // En el futuro, TensorFlow procesaría el área alrededor de (x,y) para buscar la línea oscura
    pumpPoint = {x, y};
    drawPoint(x, y, "P", "#10b981");
}

function drawPoint(x, y, label, color) {
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "white"; ctx.font = "bold 16px Arial";
    ctx.textAlign = "center"; ctx.fillText(label, x, y + 6);
}

async function generarInforme() {
    if (!pumpPoint) return alert("Marca el punto de trabajo en la curva");

    const hReal = ((config.y0 - pumpPoint.y) / config.pxPerH).toFixed(1);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const tag = document.getElementById('pumpTag').value || "BOMBA-UNNAMED";

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(34, 211, 238);
    doc.setFontSize(22);
    doc.text("INFORME DE ANÁLISIS AI", 20, 25);

    doc.autoTable({
        startY: 50,
        head: [['CONCEPTO', 'VALOR']],
        body: [
            ['TAG EQUIPO', tag],
            ['Q DISEÑO', document.getElementById('qReq').value + " m3/h"],
            ['H DISEÑO', document.getElementById('hReq').value + " m"],
            ['H DETECTADA (AI)', hReal + " m"],
            ['DESVIACIÓN', (hReal - document.getElementById('hReq').value).toFixed(1) + " m"]
        ],
        theme: 'grid',
        headStyles: { fillColor: [8, 145, 178] }
    });

    const canvas = document.getElementById('pdfCanvas');
    doc.addImage(canvas.toDataURL("image/jpeg", 0.6), 'JPEG', 15, 100, 180, 120);

    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], `${tag}.pdf`, { type: "application/pdf" });

    if (navigator.share) await navigator.share({ files: [file] });
    else doc.save(`${tag}.pdf`);
}

function resetApp() { location.reload(); }