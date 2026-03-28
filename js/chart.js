/**
 * RENDERIZADOR — CURVAS DE BOMBA Y SISTEMA
 * Canvas con doble eje Y: H [m] (izquierda), η [%] y P [kW] (derecha)
 * Canvas NPSH: NPSHr y NPSHd vs Q
 */

const C = {
  pump:    '#007aff',   // curva H-Q bomba
  system:  '#ff3b30',   // curva sistema
  op:      '#ffd60a',   // punto operación
  eta:     '#34c759',   // eficiencia
  power:   '#af52de',   // potencia
  npshR:   '#ff3b30',   // NPSHr
  npshD:   '#007aff',   // NPSHd
  margin:  'rgba(52,199,89,0.15)', // zona segura
  danger:  'rgba(255,59,48,0.10)', // zona cavitación
  grid:    '#e9ecef',
  text:    '#6c757d',
  bg:      '#ffffff',
  bgOuter: '#f8f9fa',
};

export class PumpChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.pad    = { top:20, right:60, bottom:48, left:58 };
    this.pts    = [];
    this.op     = null;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = rect.width; this.H = rect.height;
    this.cw = this.W - this.pad.left - this.pad.right;
    this.ch = this.H - this.pad.top  - this.pad.bottom;
  }

  setData(pts, op) { this.pts = pts; this.op = op; }

  draw() {
    if (!this.pts.length) return;
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.W,this.H);

    const Qmax = this.pts[this.pts.length-1].Q;
    const Hmax = Math.max(...this.pts.map(p=>p.Hp), ...this.pts.map(p=>p.Hs)) * 1.15;
    const Hmax2 = Math.ceil(Hmax / 10) * 10;
    const etaMax = 100;
    const Pmax = Math.max(...this.pts.map(p=>p.P)) * 1.2 || 10;

    this._xOf  = Q => this.pad.left + (Q/Qmax)*this.cw;
    this._yOfH = H => this.pad.top + (1-H/Hmax2)*this.ch;
    this._yOfE = e => this.pad.top + (1-e/etaMax)*this.ch;
    this._yOfP = P => this.pad.top + (1-P/Pmax)*this.ch;

    this._drawBg();
    this._drawGrid(Qmax, Hmax2);
    this._drawSystem();
    this._drawPumpH();
    this._drawEta();
    this._drawPower(Pmax);
    this._drawOp();
    this._drawAxes(Qmax, Hmax2, Pmax);
    this._drawLegend();
  }

  _drawBg() {
    const ctx = this.ctx;
    ctx.fillStyle = C.bgOuter; ctx.fillRect(0,0,this.W,this.H);
    ctx.fillStyle = C.bg; ctx.fillRect(this.pad.left,this.pad.top,this.cw,this.ch);
  }

  _drawGrid(Qmax, Hmax) {
    const ctx = this.ctx;
    ctx.strokeStyle = C.grid; ctx.lineWidth = 0.7;
    // Vertical
    for (let i=0; i<=10; i++) {
      const x = this._xOf(Qmax*i/10);
      ctx.beginPath(); ctx.moveTo(x,this.pad.top); ctx.lineTo(x,this.pad.top+this.ch); ctx.stroke();
    }
    // Horizontal
    for (let i=0; i<=8; i++) {
      const y = this.pad.top + this.ch*i/8;
      ctx.beginPath(); ctx.moveTo(this.pad.left,y); ctx.lineTo(this.pad.left+this.cw,y); ctx.stroke();
    }
  }

  _line(pts_xy, color, lw, dash=[]) {
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash);
    ctx.beginPath();
    pts_xy.forEach(([x,y],i) => i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y));
    ctx.stroke(); ctx.setLineDash([]);
  }

  _drawPumpH() {
    const valid = this.pts.filter(p=>p.Hp>=0);
    this._line(valid.map(p=>[this._xOf(p.Q), this._yOfH(p.Hp)]), C.pump, 2.5);
  }
  _drawSystem() {
    this._line(this.pts.map(p=>[this._xOf(p.Q), this._yOfH(p.Hs)]), C.system, 2, [6,4]);
  }
  _drawEta() {
    const valid = this.pts.filter(p=>p.eta>0);
    this._line(valid.map(p=>[this._xOf(p.Q), this._yOfE(p.eta*100)]), C.eta, 1.5, [3,3]);
  }
  _drawPower(Pmax) {
    this._line(this.pts.map(p=>[this._xOf(p.Q), this._yOfP(p.P)]), C.power, 1.2, [2,4]);
  }

  _drawOp() {
    if (!this.op) return;
    const ctx = this.ctx;
    const x = this._xOf(this.op.Q), y = this._yOfH(this.op.H);
    // Crosshairs
    ctx.strokeStyle='rgba(255,214,10,.5)'; ctx.lineWidth=1; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(this.pad.left,y); ctx.lineTo(x,y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x,this.pad.top+this.ch); ctx.lineTo(x,y); ctx.stroke();
    ctx.setLineDash([]);
    // Dot
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,11,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=C.op;   ctx.beginPath(); ctx.arc(x,y,8, 0,Math.PI*2); ctx.fill();
    // Label
    const lbl = `Q=${this.op.Q.toFixed(1)} m³/h\nH=${this.op.H.toFixed(1)} m`;
    ctx.fillStyle=C.op; ctx.font='bold 10px DM Mono,monospace'; ctx.textAlign='left';
    let bx=x+12, by=y-22;
    if (bx+90>this.pad.left+this.cw) bx=x-105;
    if (by<this.pad.top) by=y+10;
    ctx.fillStyle='rgba(255,255,255,.95)';
    ctx.fillRect(bx-3,by-12,100,30);
    ctx.fillStyle='#212529'; ctx.fillText(`Q=${this.op.Q.toFixed(1)} m³/h`,bx,by);
    ctx.fillText(`H=${this.op.H.toFixed(1)} m`,bx,by+13);
  }

  _drawAxes(Qmax, Hmax, Pmax) {
    const ctx = this.ctx;
    ctx.strokeStyle='#adb5bd'; ctx.lineWidth=1;
    ctx.strokeRect(this.pad.left,this.pad.top,this.cw,this.ch);

    // X — Q
    ctx.fillStyle=C.text; ctx.font='10px DM Mono,monospace'; ctx.textAlign='center';
    for (let i=0; i<=10; i++) {
      const Q=Qmax*i/10, x=this._xOf(Q);
      ctx.fillText(Q.toFixed(0),x,this.pad.top+this.ch+14);
    }
    ctx.fillStyle='#495057'; ctx.font='11px DM Sans,-apple-system,sans-serif';
    ctx.fillText('Caudal Q [m³/h]',this.pad.left+this.cw/2,this.pad.top+this.ch+30);

    // Y izq — H
    ctx.textAlign='right'; ctx.font='10px DM Mono,monospace';
    for (let i=0; i<=8; i++) {
      const H=Hmax*i/8, y=this._yOfH(H);
      ctx.fillStyle=C.pump; ctx.fillText(H.toFixed(0),this.pad.left-5,y+3);
    }
    ctx.save(); ctx.translate(12,this.pad.top+this.ch/2); ctx.rotate(-Math.PI/2);
    ctx.fillStyle=C.pump; ctx.font='11px DM Sans,-apple-system,sans-serif'; ctx.textAlign='center';
    ctx.fillText('Altura H [m]',0,0); ctx.restore();

    // Y der — P [kW]
    ctx.textAlign='left'; ctx.font='9px DM Mono,monospace';
    for (let i=0; i<=4; i++) {
      const P=Pmax*i/4, y=this._yOfP(P);
      ctx.fillStyle=C.power; ctx.fillText(P.toFixed(1),this.pad.left+this.cw+4,y+3);
    }
    ctx.save(); ctx.translate(this.W-10,this.pad.top+this.ch/2); ctx.rotate(Math.PI/2);
    ctx.fillStyle=C.power; ctx.font='10px DM Sans,-apple-system,sans-serif'; ctx.textAlign='center';
    ctx.fillText('Potencia P [kW]',0,0); ctx.restore();
  }

  _drawLegend() {
    const ctx = this.ctx;
    const items = [
      { color:C.pump,   label:'Curva H-Q bomba',  dash:[] },
      { color:C.system, label:'Curva sistema',     dash:[6,4] },
      { color:C.eta,    label:'Eficiencia η [%]',  dash:[3,3] },
      { color:C.power,  label:'Potencia P [kW]',   dash:[2,4] },
    ];
    let lx = this.pad.left + 8, ly = this.pad.top + 10;
    items.forEach(item => {
      ctx.strokeStyle=item.color; ctx.lineWidth=2; ctx.setLineDash(item.dash);
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx+22,ly); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='#212529'; ctx.font='9px DM Sans,-apple-system,sans-serif';
      ctx.textAlign='left'; ctx.fillText(item.label,lx+26,ly+3);
      lx += 115;
      if (lx > this.pad.left + this.cw - 80) { lx=this.pad.left+8; ly+=14; }
    });
  }
}

// ── GRÁFICA NPSH ──────────────────────────────────────────────────────────────
export class NpshChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.pad    = { top:20, right:20, bottom:48, left:58 };
    this.pts    = [];
    this.op     = null;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = rect.width; this.H = rect.height;
    this.cw = this.W - this.pad.left - this.pad.right;
    this.ch = this.H - this.pad.top  - this.pad.bottom;
  }

  setData(pts, op) { this.pts = pts; this.op = op; }

  draw() {
    if (!this.pts.length) return;
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.W,this.H);

    const Qmax   = this.pts[this.pts.length-1].Q;
    const npshMax = Math.max(...this.pts.map(p=>Math.max(p.npshD||0, p.npshR||0))) * 1.2;
    const Nmax   = Math.max(Math.ceil(npshMax/2)*2, 4);

    this._xOf = Q => this.pad.left + (Q/Qmax)*this.cw;
    this._yOf = N => this.pad.top  + (1 - N/Nmax)*this.ch;

    // Bg
    ctx.fillStyle=C.bgOuter; ctx.fillRect(0,0,this.W,this.H);
    ctx.fillStyle=C.bg; ctx.fillRect(this.pad.left,this.pad.top,this.cw,this.ch);

    // Safe zone (NPSHd > NPSHr) — shade green
    ctx.fillStyle=C.margin;
    ctx.beginPath();
    const safeTop = this.pts.map(p=>[this._xOf(p.Q), this._yOf(Math.min(p.npshD||Nmax, Nmax))]);
    const safeBot = this.pts.map(p=>[this._xOf(p.Q), this._yOf(Math.max(p.npshR||0, 0))]);
    safeTop.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y));
    [...safeBot].reverse().forEach(([x,y])=>ctx.lineTo(x,y));
    ctx.closePath(); ctx.fill();

    // Danger zone (NPSHd < NPSHr) — shade red
    ctx.fillStyle=C.danger;
    ctx.beginPath();
    const dangerBot = this.pts.map(p=>[this._xOf(p.Q), this._yOf(Math.max(p.npshR||0,0))]);
    const dangerTop = this.pts.map(p=>[this._xOf(p.Q), this._yOf(Math.min(p.npshD||0, p.npshR||0))]);
    dangerBot.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y));
    [...dangerTop].reverse().forEach(([x,y])=>ctx.lineTo(x,y));
    ctx.closePath(); ctx.fill();

    // Grid
    ctx.strokeStyle=C.grid; ctx.lineWidth=0.7;
    for (let i=0;i<=10;i++){const x=this._xOf(Qmax*i/10);ctx.beginPath();ctx.moveTo(x,this.pad.top);ctx.lineTo(x,this.pad.top+this.ch);ctx.stroke();}
    for (let i=0;i<=6;i++){const y=this.pad.top+this.ch*i/6;ctx.beginPath();ctx.moveTo(this.pad.left,y);ctx.lineTo(this.pad.left+this.cw,y);ctx.stroke();}

    // NPSHd
    const dpts = this.pts.filter(p=>isFinite(p.npshD));
    if (dpts.length>1) {
      ctx.strokeStyle=C.npshD; ctx.lineWidth=2.2; ctx.setLineDash([]);
      ctx.beginPath(); dpts.forEach((p,i)=>{ const y=this._yOf(Math.max(0,Math.min(Nmax,p.npshD)));
        i===0?ctx.moveTo(this._xOf(p.Q),y):ctx.lineTo(this._xOf(p.Q),y); }); ctx.stroke();
    }

    // NPSHr
    ctx.strokeStyle=C.npshR; ctx.lineWidth=2; ctx.setLineDash([5,4]);
    ctx.beginPath();
    this.pts.forEach((p,i)=>{ const y=this._yOf(Math.min(p.npshR,Nmax));
      i===0?ctx.moveTo(this._xOf(p.Q),y):ctx.lineTo(this._xOf(p.Q),y); });
    ctx.stroke(); ctx.setLineDash([]);

    // Margen mínimo ANSI/HI (NPSHr + 0.5 m)
    ctx.strokeStyle='rgba(255,149,0,0.6)'; ctx.lineWidth=1; ctx.setLineDash([2,4]);
    ctx.beginPath();
    this.pts.forEach((p,i)=>{ const y=this._yOf(Math.min(p.npshR+0.5,Nmax));
      i===0?ctx.moveTo(this._xOf(p.Q),y):ctx.lineTo(this._xOf(p.Q),y); });
    ctx.stroke(); ctx.setLineDash([]);

    // Punto operación
    if (this.op) {
      const x=this._xOf(this.op.Q);
      const npshROp = this.pts.find(p=>Math.abs(p.Q-this.op.Q)<0.5)?.npshR || 0;
      const npshDOp = this.pts.find(p=>Math.abs(p.Q-this.op.Q)<0.5)?.npshD || 0;
      ctx.strokeStyle='rgba(255,214,10,.6)'; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(x,this.pad.top); ctx.lineTo(x,this.pad.top+this.ch); ctx.stroke();
      ctx.setLineDash([]);
      // NPSHd dot
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,this._yOf(npshDOp),8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=C.npshD; ctx.beginPath(); ctx.arc(x,this._yOf(npshDOp),6,0,Math.PI*2); ctx.fill();
      // NPSHr dot
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,this._yOf(npshROp),8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=C.npshR; ctx.beginPath(); ctx.arc(x,this._yOf(npshROp),6,0,Math.PI*2); ctx.fill();
      // Margin label
      const margin=npshDOp-npshROp;
      const marCol=margin>0.5?C.eta:C.npshR;
      ctx.fillStyle=marCol; ctx.font='bold 10px DM Mono,monospace'; ctx.textAlign='left';
      ctx.fillText(`Margen=${margin.toFixed(2)} m`,x+6,this._yOf((npshDOp+npshROp)/2));
    }

    // Axes
    ctx.strokeStyle='#adb5bd'; ctx.lineWidth=1; ctx.strokeRect(this.pad.left,this.pad.top,this.cw,this.ch);
    ctx.fillStyle=C.text; ctx.font='10px DM Mono,monospace'; ctx.textAlign='center';
    for (let i=0;i<=10;i++) {
      const Q=Qmax*i/10;
      ctx.fillText(Q.toFixed(0),this._xOf(Q),this.pad.top+this.ch+14);
    }
    ctx.fillStyle='#495057'; ctx.font='11px DM Sans,-apple-system,sans-serif';
    ctx.fillText('Caudal Q [m³/h]',this.pad.left+this.cw/2,this.pad.top+this.ch+30);
    ctx.textAlign='right'; ctx.font='10px DM Mono,monospace';
    for (let i=0;i<=6;i++) {
      const N=Nmax*i/6;
      ctx.fillStyle='#495057'; ctx.fillText(N.toFixed(1),this.pad.left-5,this._yOf(N)+3);
    }
    ctx.save(); ctx.translate(12,this.pad.top+this.ch/2); ctx.rotate(-Math.PI/2);
    ctx.fillStyle='#495057'; ctx.font='11px DM Sans,-apple-system,sans-serif'; ctx.textAlign='center';
    ctx.fillText('NPSH [m]',0,0); ctx.restore();

    // Legend
    const lg=[{color:C.npshD,dash:[],label:'NPSHd disponible'},{color:C.npshR,dash:[5,4],label:'NPSHr requerido'},{color:'rgba(255,149,0,.8)',dash:[2,4],label:'NPSHr + 0.5 m (margen ANSI/HI)'}];
    let lx=this.pad.left+8, ly=this.pad.top+10;
    lg.forEach(l=>{
      ctx.strokeStyle=l.color; ctx.lineWidth=2; ctx.setLineDash(l.dash);
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx+20,ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#212529'; ctx.font='9px DM Sans,-apple-system,sans-serif'; ctx.textAlign='left';
      ctx.fillText(l.label,lx+24,ly+3);
      lx+=ctx.measureText(l.label).width+50;
      if(lx>this.pad.left+this.cw-60){lx=this.pad.left+8;ly+=14;}
    });
  }
}
