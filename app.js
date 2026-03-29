const MAKERS = {
    naval: ["Azcue", "Thune Eureka", "DESMI", "Hamworthy", "Itur", "Wartsila", "Iron Pump"],
    global: ["Grundfos", "KSB", "Sulzer", "Ebara", "Flowserve", "Xylem", "Lowara"]
};

const K_VALS = { codo: 0.9, globo: 10, mari: 0.6, filt: 2.5 };
let calibPoints = [];

function filterMakers() {
    const s = document.getElementById('sectorSel').value;
    document.getElementById('makerSel').innerHTML = MAKERS[s].map(m => `<option value="${m}">${m}</option>`).join('');
}

function updateCalculos() {
    const q = parseFloat(document.getElementById('qReq').value) || 0;
    const d = 0.125; // Diámetro asumido 125mm para velocidad
    const v = (q / 3600) / (Math.PI * Math.pow(d/2, 2));
    
    const sumK = (parseInt(document.getElementById('acc_codo').value) * K_VALS.codo) +
                 (parseInt(document.getElementById('acc_globo').value) * K_VALS.globo) +
                 (parseInt(document.getElementById('acc_mari').value) * K_VALS.mari) +
                 (parseInt(document.getElementById('acc_filt').value) * K_VALS.filt);
    
    const h_acc = sumK * (Math.pow(v, 2) / (2 * 9.81));
    document.getElementById('resAcc').innerHTML = `h_acc: ${h_acc.toFixed(2)} m (Vel: ${v.toFixed(2)} m/s)`;
    return h_acc;
}

// --- MANEJO DE PDF/CÁMARA ---
async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');

    if (file.type === "application/pdf") {
        const reader = new FileReader();
        reader.onload = async function() {
            const pdf = await pdfjsLib.getDocument({data: new Uint8Array(this.result)}).promise;
            const page = await pdf.getPage(1);
            const vp = page.getViewport({scale: 1.5});
            canvas.width = vp.width; canvas.height = vp.height;
            await page.render({canvasContext: ctx, viewport: vp}).promise;
        };
        reader.readAsArrayBuffer(file);
    } else {
        const img = new Image();
        img.onload = () => { canvas.width = img.width; canvas.height = img.height; ctx.drawImage(img, 0, 0); };
        img.src = URL.createObjectURL(file);
    }
    document.getElementById('canvasCont').style.display = 'block';
    calibPoints = [];
}

// --- COMPARTIR INFORME ---
async function generarYCompartir() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const h_acc = updateCalculos();
    const q = document.getElementById('qReq').value;
    const h = document.getElementById('hReq').value;
    const nDisp = parseFloat(document.getElementById('npshDisp').value) - h_acc;
    const nReq = 3.5; // Valor estimado de la gráfica
    const cavita = nDisp < nReq;

    doc.setFontSize(18);
    doc.text(`INFORME NAVAL: ${document.getElementById('makerSel').value}`, 20, 20);
    
    doc.autoTable({
        startY: 30,
        head: [['Parámetro', 'Valor']],
        body: [
            ['Punto Operación', `${q} m3/h @ ${h} m`],
            ['Pérdidas Accesorios', `${h_acc.toFixed(2)} m`],
            ['NPSH Disponible Real', `${nDisp.toFixed(2)} m`],
            ['Estado Cavitación', cavita ? '⚠️ RIESGO ALTO' : '✅ SISTEMA SEGURO']
        ],
        theme: 'grid', headStyles: {fillColor: cavita ? [200, 0, 0] : [0, 122, 255]}
    });

    const canvas = document.getElementById('pdfCanvas');
    const imgData = canvas.toDataURL("image/jpeg", 0.7);
    doc.addImage(imgData, 'JPEG', 15, 80, 180, 110);

    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], "Informe_Tecnico.pdf", { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Informe Bomba', text: 'Estudio NPSH y Accesorios.' });
    } else {
        doc.save("Informe.pdf");
    }
}

// Inicializar
filterMakers();