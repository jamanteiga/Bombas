const MAKERS = {
    naval: ["Azcue", "Thune Eureka", "DESMI", "Hamworthy", "Itur", "Wartsila"],
    global: ["Grundfos", "KSB", "Sulzer", "Ebara", "Flowserve"]
};

function filterMakers() {
    const s = document.getElementById('sectorSel').value;
    document.getElementById('makerSel').innerHTML = MAKERS[s].map(m => `<option value="${m}">${m}</option>`).join('');
}

async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const canvas = document.getElementById('pdfCanvas');
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');

    if (file.type === "application/pdf") {
        const reader = new FileReader();
        reader.onload = async function() {
            const loadingTask = pdfjsLib.getDocument({data: new Uint8Array(this.result)});
            const pdf = await loadingTask.promise;
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
}

async function generarYCompartir() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const maker = document.getElementById('makerSel').value;
    
    doc.setFontSize(18);
    doc.text(`INFORME TÉCNICO: ${maker}`, 20, 20);
    doc.autoTable({
        startY: 30,
        body: [['Fabricante', maker], ['NPSH Disponible', document.getElementById('npshDisp').value + ' m']]
    });

    const canvas = document.getElementById('pdfCanvas');
    if (canvas.style.display !== 'none') {
        const imgData = canvas.toDataURL("image/jpeg", 0.7);
        doc.addImage(imgData, 'JPEG', 15, 70, 180, 110);
    }

    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], "Informe_Tecnico.pdf", { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Informe Bomba', text: 'Estudio NPSH Naval' });
    } else {
        doc.save("Informe.pdf");
    }
}

window.onload = filterMakers;