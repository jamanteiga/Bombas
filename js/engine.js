/**
 * MOTOR DE CÁLCULO — BOMBAS CENTRÍFUGAS Y NPSH
 *
 * Referencias:
 *   Gülich, J.F. "Centrifugal Pumps" (Springer, 2014)
 *   Kaplan, N. "Practical Handbook of Pump and Hydroelectric Design" (2008)
 *   ANSI/HI 9.6.1 — NPSH Margin
 *   Streeter & Wylie "Fluid Mechanics"
 */

export const G   = 9.81;       // m/s²
export const PI  = Math.PI;
export const RHO_AGUA_20 = 998.2;  // kg/m³
export const NU_AGUA_20  = 1.004e-6; // m²/s

// ── FLUIDOS ───────────────────────────────────────────────────────────────────
export const FLUIDS = [
  { name:'Agua  20°C', rho:998.2,  nu:1.004e-6, pv:2338  },
  { name:'Agua  40°C', rho:992.2,  nu:0.658e-6, pv:7384  },
  { name:'Agua  60°C', rho:983.2,  nu:0.474e-6, pv:19940 },
  { name:'Agua  80°C', rho:971.8,  nu:0.365e-6, pv:47390 },
  { name:'Agua 100°C', rho:958.4,  nu:0.295e-6, pv:101325},
  { name:'Gasolina',   rho:740,    nu:0.6e-6,   pv:55000 },
  { name:'Gasoil',     rho:850,    nu:3.0e-6,   pv:500   },
  { name:'Personaliz.', rho:null,  nu:null,      pv:null  },
];

// ── PRESIÓN DE VAPOR (Antoine) ────────────────────────────────────────────────
export function pvapor(T_C) {
  // Antoine simplificado, válido 1–100°C, Pa
  const A=8.07131, B=1730.63, C=233.426;
  return 133.322 * Math.pow(10, A - B/(C + T_C));
}

// ── COLEBROOK-WHITE ───────────────────────────────────────────────────────────
export function frictionFactor(Re, eps_D) {
  if (Re < 1)    return 0;
  if (Re < 2300) return 64 / Re;
  let f = 0.25 / Math.pow(Math.log10(eps_D/3.7 + 5.74/Math.pow(Re,0.9)), 2);
  for (let i=0; i<8; i++) {
    const r = -2*Math.log10(eps_D/3.7 + 2.51/(Re*Math.sqrt(f)));
    f = 1/(r*r);
  }
  return f;
}

// ── CURVA DE LA BOMBA ─────────────────────────────────────────────────────────
/**
 * Modelo polinómico de curva H-Q: H(Q) = H0 - a*Q - b*Q²
 * Se ajusta a partir de 3 puntos: (0, H0), (Qn, Hn), (Qmax, 0)
 *
 * H0   = altura de cierre (caudal cero) [m]
 * Hn   = altura nominal [m]
 * Qn   = caudal nominal [m³/h]
 * Qmax = caudal máximo (H=0) [m³/h]
 */
export function fitPumpCurve(H0, Hn, Qn, Qmax) {
  // Sistema 2 ecuaciones: H0 - a*Qn - b*Qn² = Hn
  //                        H0 - a*Qmax - b*Qmax² = 0
  const q1 = Qn/3600, q2 = Qmax/3600;
  // b = (H0 - Hn - (H0/q2)*q1) / (q1*q1 - (q1/q2)*q2*q2)  — despejar
  const denom = q1*q1 - q1*q2;
  if (Math.abs(denom) < 1e-12) return null;
  const b = ((H0 - Hn) - (H0/q2)*q1) / denom;
  const a = (H0 / q2) - b*q2;
  return { H0, a, b, Qn, Hn, Qmax };
}

/** H(Q) dado Q en m³/h */
export function pumpHead(curve, Q_m3h) {
  const Q = Q_m3h / 3600;
  return curve.H0 - curve.a*Q - curve.b*Q*Q;
}

/** Curva de eficiencia η(Q) — parábola con máximo en Qn */
export function pumpEff(Q_m3h, Qn, eta_max) {
  const ratio = Q_m3h / Qn;
  return eta_max * (2*ratio - ratio*ratio);  // parábola  η=ηmax en Q=Qn, 0 en Q=0 y 2Qn
}

/** Curva de potencia al freno P(Q) = rho*g*Q*H / η [kW] */
export function pumpPower(Q_m3h, H, eta, rho) {
  const Q = Q_m3h / 3600;
  if (eta <= 0) return 0;
  return rho * G * Q * H / eta / 1000;
}

/** Curva NPSH requerido (NPSHr): modelo empírico σ·H */
export function npshRequired(Q_m3h, Qn, npshR_n) {
  // NPSHr ≈ NPSHr_n * (Q/Qn)^2  — relación cuadrática (Gülich)
  const ratio = Q_m3h / Qn;
  return npshR_n * ratio * ratio;
}

// ── CURVA DEL SISTEMA ─────────────────────────────────────────────────────────
/**
 * H_sistema(Q) = H_estática + R·Q²
 * H_estática = Hgeo + ΔP_proceso/(rho*g)
 * R = suma de pérdidas en tuberías y accesorios
 */

/** Factor de rozamiento de un tramo */
export function pipeLoss(Q_m3h, L, D, eps, rho, nu) {
  const Q  = Q_m3h / 3600;
  const A  = PI*D*D/4;
  const v  = Q / A;
  const Re = v*D/nu;
  const f  = frictionFactor(Re, eps/D);
  return f * L/D * v*v / (2*G);  // m
}

/** Coeficiente de sistema R tal que H_sing = R_sing * Q² */
export function systemR(tramos, accesorios, rho, nu) {
  // R total en m/(m³/s)²
  // Para cada tramo: hf = f*L/D * v²/(2g) = f*L/D/(2g*A²) * Q²  → Ri = f*L/(D*2g*A²)
  // Pero f depende de Q → calculamos en Qn, iteración en update()
  return { tramos, accesorios };
}

/** Altura del sistema a caudal Q [m³/h] */
export function systemHead(Q_m3h, Hst, tramos, rho, nu) {
  const Q = Q_m3h / 3600;
  let hf = 0;
  for (const t of tramos) {
    const A  = PI*t.D*t.D/4;
    const v  = Q / A;
    const Re = Math.abs(v)*t.D/nu;
    const f  = frictionFactor(Re, t.eps/t.D);
    hf += f * t.L/t.D * v*v / (2*G);       // fricción
    hf += t.zeta_total * v*v / (2*G);      // singularidades
  }
  return Hst + hf;
}

/** Encontrar punto de operación por bisección */
export function operatingPoint(curve, Hst, tramos, rho, nu, tol=1e-4) {
  let lo=0, hi=curve.Qmax;
  for (let i=0; i<80; i++) {
    const mid = (lo+hi)/2;
    const Hp  = pumpHead(curve, mid);
    const Hs  = systemHead(mid, Hst, tramos, rho, nu);
    if (Hp > Hs) lo=mid; else hi=mid;
    if (hi-lo < tol) break;
  }
  const Q  = (lo+hi)/2;
  const H  = pumpHead(curve, Q);
  return { Q, H };
}

// ── NPSH DISPONIBLE ───────────────────────────────────────────────────────────
/**
 * NPSHd = (P_abs_succión)/(rho*g) + v²/(2g) - pv/(rho*g)
 *
 * Expandido con Bernoulli desde superficie libre hasta boca succión:
 * NPSHd = (P_atm + rho*g*Hs_liq - rho*g*Zs - hf_s - pv) / (rho*g)
 *
 * donde:
 *   P_atm  = presión atmosférica [Pa]
 *   Hs_liq = altura de líquido sobre referencia [m] (puede ser negativa = aspiración)
 *   Zs     = altura geométrica de succión (positiva = bomba sobre el líquido)
 *   hf_s   = pérdidas en tubería de succión [m]
 *   pv     = presión de vapor [Pa]
 */
export function npshDisponible({ P_atm, rho, g=G, Zs, hf_s, pv }) {
  return (P_atm - pv) / (rho*g) - Zs - hf_s;
}

/** Altura máxima de aspiración para NPSHd = NPSHr + margen */
export function maxAspiracion({ P_atm, rho, pv, hf_s, npshR, margen=0.5 }) {
  return (P_atm - pv) / (rho*G) - hf_s - npshR - margen;
}

/** Número específico de velocidad (adimensional) */
export function nq(n_rpm, Q_m3h, H) {
  const Q = Q_m3h / 3600;
  return n_rpm * Math.sqrt(Q) / Math.pow(G*H, 0.75);
}

/** Clasificación de bomba por nq */
export function pumpType(nq_val) {
  if (nq_val < 0.2)  return { type:'Centrífuga radial',   icon:'🌀', color:'#007aff' };
  if (nq_val < 0.8)  return { type:'Centrífuga mixta',    icon:'🌊', color:'#30b0c7' };
  if (nq_val < 2.0)  return { type:'Axial / hélice',      icon:'⚙️', color:'#34c759' };
  return                    { type:'Volumétrica (revisar)',icon:'⚠️', color:'#ff9500' };
}

/** Régimen de semejanza: nuevo punto a distinta velocidad */
export function affinityLaws(Q1, H1, P1, n1, n2) {
  const ratio = n2/n1;
  return { Q2: Q1*ratio, H2: H1*ratio*ratio, P2: P1*ratio*ratio*ratio };
}

// ── CONFIGURACIONES PREDEF. ───────────────────────────────────────────────────
export const PRESETS = [
  {
    name: 'Bomba doméstica pequeña',
    H0:28, Hn:20, Qn:6, Qmax:10, eta_max:0.55, npshR_n:1.5, n_rpm:2900,
    Hst:15,
    tramos:[{ L:30, D:0.040, eps:0.00015, zeta_total:5 }],
    succion:{ Zs:3, L_s:5, D_s:0.040, eps:0.00015, zeta_s:3 }
  },
  {
    name: 'Bomba de circulación HVAC',
    H0:12, Hn:8, Qn:15, Qmax:22, eta_max:0.62, npshR_n:1.0, n_rpm:1450,
    Hst:4,
    tramos:[{ L:80, D:0.065, eps:0.00015, zeta_total:8 }],
    succion:{ Zs:1, L_s:8, D_s:0.065, eps:0.00015, zeta_s:4 }
  },
  {
    name: 'Bomba industrial agua 80°C',
    H0:65, Hn:45, Qn:60, Qmax:95, eta_max:0.72, npshR_n:3.5, n_rpm:2900,
    Hst:20,
    tramos:[{ L:150, D:0.100, eps:0.00015, zeta_total:12 }],
    succion:{ Zs:-2, L_s:15, D_s:0.100, eps:0.00015, zeta_s:6 }
  },
  {
    name: 'Bomba contra incendios',
    H0:120, Hn:90, Qn:120, Qmax:200, eta_max:0.68, npshR_n:4.0, n_rpm:2900,
    Hst:50,
    tramos:[{ L:200, D:0.150, eps:0.00015, zeta_total:15 }],
    succion:{ Zs:2, L_s:20, D_s:0.150, eps:0.00015, zeta_s:5 }
  },
];

// ── GENERAR CURVAS COMPLETAS ──────────────────────────────────────────────────
export function generateCurves(params) {
  const { curve, Hst, tramos, rho, nu, pv, P_atm,
          Qn, eta_max, npshR_n, n_rpm, succion } = params;

  const nPts = 80;
  const Qmax = curve.Qmax;
  const Qs   = [];

  for (let i=0; i<=nPts; i++) Qs.push(Qmax * i / nPts);

  const pts = Qs.map(Q => {
    const Hp   = Math.max(0, pumpHead(curve, Q));
    const Hs   = systemHead(Q, Hst, tramos, rho, nu);
    const eta  = Math.max(0, pumpEff(Q, Qn, eta_max));
    const P    = pumpPower(Q, Hp, eta || 0.01, rho);
    const npshR = npshRequired(Q, Qn, npshR_n);

    // NPSHd en función de Q (pérdidas de succión aumentan con Q)
    let hf_s = 0;
    if (succion) {
      const As = PI*succion.D_s*succion.D_s/4;
      const vs = (Q/3600) / As;
      const Re = vs*succion.D_s/nu;
      const f  = frictionFactor(Re, succion.eps/succion.D_s);
      hf_s = f*succion.L_s/succion.D_s*vs*vs/(2*G) + succion.zeta_s*vs*vs/(2*G);
    }
    const npshD = npshDisponible({ P_atm, rho, Zs: succion?.Zs||0, hf_s, pv });

    return { Q, Hp, Hs, eta, P, npshR, npshD };
  });

  return pts;
}
