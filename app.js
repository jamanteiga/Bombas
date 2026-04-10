let calibPoints = [];
let config = { x0: 0, y0: 0, pxPerH: 0, pxPerQ: 0 };
let isLocked = false;
let pumpPoint = null;

// --- MOTOR DE VISIÓN ARTIFICIAL ---
function applyVisionEnhancement(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // 1. Convertir a Grises (Luminancia)
        const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        
        // 2. Aumento de Contraste Dinámico
        // Si el píxel es claro (papel), lo forzamos a blanco. 
        // Si es oscuro (curva), lo forzamos a negro.
        let val = avg;
        if (avg > 180) val = 255; // Blanco puro
        else if (avg < 80) val = 0; // Negro puro
        else {
            // Curva sigmoide para contraste medio
            val = 255 * (1 / (1 + Math.exp(-0.05 * (avg - 128))));
        }

        data[i] = val;     // R
        data[i + 1] = val; // G
        data[i + 2] = val; // B
    }
    ctx.putImageData(imageData, 0, 0);
}

// --- GESTIÓN DE IMPORTACIÓN ---
async function handleImport(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    document.getElementById('visionControls').classList.remove('hidden');
    document.getElementById('calibPanel').classList.remove('hidden');
    canvas.style.display = 'block';
    
    if (type === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
    } else {
        const img = new Image();
        img.onload = () => {
            const scale = (window.innerWidth * 2) / img.width;
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Aplicar limpieza de ruido automáticamente
            applyVisionEnhancement(ctx, canvas.width, canvas.height);
            updateStatus("VISIÓN: Foto optimizada para detección");
        };
        img.src = URL.createObjectURL(file);
    }
    
    resetState();
}

function toggleEnhancement() {
    const canvas = document.getElementById('pdfCanvas');
    if (document.getElementById('toggleVision').checked) {
        canvas.style.filter = "contrast(1.4) grayscale(1)";
    } else {
        canvas.style.filter = "none";
    }
}

// --- LÓGICA DE CALIBRACIÓN ---
function resetState() {
    calibPoints = [];
    isLocked = false;
    pumpPoint = null;
    updateStatus("PASO 1: Toca el ORIGEN (0,0)");
}

document.getElementById('pdfCanvas').addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = e.target.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (e.target.width / rect.width);
    const y = (touch.clientY - rect.top) * (e.target.height / rect.height);
    
    if (!isLocked) {
        if (calibPoints.length < 3) {
            calibPoints.push({x, y});
            drawMarker(x, y, calibPoints.length, "#22d3ee");
            const steps = ["", "PASO 2: Toca el MÁXIMO de H", "PASO 3: Toca el MÁXIMO de Q", "Escala lista"];
            updateStatus(steps[calibPoints.length]);
        }
    } else {
        pumpPoint = {x, y};
        drawMarker(x, y, "P", "#10b981");
        document.getElementById('resultsArea').classList.remove('hidden');
    }
}, { passive: false });

function lockAndAnalyze() {
    if (calibPoints.length < 3) return alert("Faltan puntos de calibración");
    
    const hMax = parseFloat(document.getElementById('hMaxScale').value);
    const qMax = parseFloat(document.getElementById('qMaxScale').value);
    
    config = {
        x0: calibPoints[0].x,
        y0: calibPoints[0].y,
        pxPerH: Math.abs(calibPoints[0].y - calibPoints[1].y) / hMax,
        pxPerQ: Math.abs(calibPoints[2].x - calibPoints[0].x) / qMax
    };

    isLocked = true;
    updateStatus("🎯 IA ACTIVA: Toca la curva de la bomba");
    document.getElementById('calibPanel').classList.add('hidden');
}

function updateStatus(txt) {
    const el = document.getElementById('statusMsg');
    el.innerText = txt;
    el.style.opacity = "1";
    setTimeout(() => { if(!isLocked) el.style.opacity = "0.7"; }, 2000);
}

function drawMarker(x, y, label, color) {
    const ctx = document.getElementById('pdfCanvas').getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "white"; ctx.font = "bold 18px Arial";
    ctx.textAlign = "center"; ctx.fillText(label, x, y + 6);
}

async function generarInforme() {
    const hReal = ((config.y0 - pumpPoint.y) / config.pxPerH).toFixed(1);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.text("REPORTE DE CAMPO - VISION AI", 20, 25);
    doc.autoTable({
        startY: 35,
        body: [
            ['Tag Equipo', document.getElementById('pumpTag').value],
            ['H Detectada', hReal + " m"],
            ['Q Requerido', document.getElementById('qReq').value + " m3/h"]
        ]
    });

    const canvas = document.getElementById('pdfCanvas');
    doc.addImage(canvas.toDataURL("image/jpeg", 0.6), 'JPEG', 15, 80, 180, 120);
    
    if (navigator.share) {
        const blob = doc.output('blob');
        const file = new File([blob], "informe.pdf", { type: "application/pdf" });
        await navigator.share({ files: [file] });
    } else {
        doc.save("reporte.pdf");
    }
}