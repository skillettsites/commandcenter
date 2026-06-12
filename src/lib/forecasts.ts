// Pure forecasting helpers shared by the Forecasts hub.
//
// The "Financial Freedom" model is a faithful port of the authoritative
// Freedom Plan dashboard (finances/retirement-plan.html, built 2026-06-10):
// ~£1.47M pot → income sleeve @ 7.8% blend, business + rent, taxed per
// scenario. Target is £11k/mo net. Keep this in sync with that file.

/* ============================ net worth ============================ */
export interface NetWorthPoint {
  year: number;
  value: number;
}

// Compound-growth projection of a single lump sum.
export function projectNetWorth(current: number, annualRate: number, horizon = 10): NetWorthPoint[] {
  const out: NetWorthPoint[] = [];
  for (let y = 0; y <= horizon; y++) {
    out.push({ year: y, value: current * Math.pow(1 + annualRate, y) });
  }
  return out;
}

// Years (decimal) for a lump sum to reach a target at a given rate.
export function yearsToTarget(current: number, target: number, annualRate: number): number | null {
  if (current <= 0 || target <= current || annualRate <= 0) return target <= current ? 0 : null;
  return Math.log(target / current) / Math.log(1 + annualRate);
}

/* ============================ freedom plan ============================ */
export const FREEDOM_TARGET_MONTHLY = 11000;

// Income sleeve funds (live-verified yields, June 2026).
const FUNDS = [
  { cls: 'eq' as const, pct: 26, y: 8.42 }, // UBS Global Enhanced
  { cls: 'eq' as const, pct: 20, y: 6.7 }, // Fidelity Enhanced
  { cls: 'bd' as const, pct: 18, y: 7.15 }, // PIMCO STHS
  { cls: 'bd' as const, pct: 16, y: 7.2 }, // iShares HYSD
  { cls: 'eq' as const, pct: 10, y: 10.5 }, // JPM JEQP
];
const GROWTH_FIXED = 90000; // NVDA + GOOGL + TSLA @ £30k each, never topped up
const INCOME_PCT = FUNDS.reduce((a, f) => a + f.pct, 0);
export const BASE_BLEND = FUNDS.reduce((a, f) => a + f.pct * f.y, 0) / INCOME_PCT; // ≈ 7.8
const EQ_PCT = FUNDS.filter((f) => f.cls === 'eq').reduce((a, f) => a + f.pct, 0);
const BD_PCT = FUNDS.filter((f) => f.cls === 'bd').reduce((a, f) => a + f.pct, 0);
const EQ_Y = FUNDS.filter((f) => f.cls === 'eq').reduce((a, f) => a + f.pct * f.y, 0) / EQ_PCT;
const BD_Y = FUNDS.filter((f) => f.cls === 'bd').reduce((a, f) => a + f.pct * f.y, 0) / BD_PCT;

const EURGBP = 1.17;
const ISA0 = 297917;
const UK_DIV = 0.3935;
const UK_INT = 0.45;
// Business income/mo: Stripe (live 90d, net of fees/COGS) + GYG + YouTube.
const BIZ_GROSS = 1300 + 200 + 20; // £1,520/mo

function spainTax(annualGBP: number): number {
  const inc = annualGBP * EURGBP;
  const bands: [number, number][] = [
    [6000, 0.19],
    [50000, 0.21],
    [200000, 0.23],
    [300000, 0.27],
    [Infinity, 0.3],
  ];
  let t = 0,
    prev = 0;
  for (const [cap, r] of bands) {
    if (inc <= prev) break;
    t += (Math.min(inc, cap) - prev) * r;
    prev = cap;
  }
  return t / EURGBP;
}

// Scenario 6: GIA income in her name, graduated 2026/27 bands.
function ukGiaTax(I: number, D: number): number {
  const tot = I + D;
  const pa = tot > 100000 ? Math.max(0, 12570 - (tot - 100000) / 2) : 12570;
  const paI = Math.min(pa, I),
    paD = pa - paI;
  const tI = Math.max(I - paI, 0),
    tD = Math.max(D - paD - 500, 0);
  const b1 = 37700,
    b2 = 112470;
  let used = 0;
  const seg = (amt: number, r1: number, r2: number, r3: number) => {
    let a = amt,
      t = 0;
    const x1 = Math.max(Math.min(b1 - used, a), 0);
    t += x1 * r1;
    a -= x1;
    used += x1;
    const x2 = Math.max(Math.min(b2 - used, a), 0);
    t += x2 * r2;
    a -= x2;
    used += x2;
    t += a * r3;
    used += a;
    return t;
  };
  return seg(tI, 0.2, 0.4, 0.45) + seg(tD, 0.1075, 0.3575, 0.3935);
}

export type TaxRegime = 'beckham' | 'uk' | 'spain' | 'cyprus';

export interface Scenario {
  id: string;
  label: string;
  flag: string;
  quit: boolean; // both quit → fully passive freedom
  duration: string; // regime horizon
  regime: string;
  pot: number;
  salary: number;
  rents: number;
  tax: TaxRegime;
  isa: number;
  bizTax: number;
  split?: boolean;
}

export const SCENARIOS: Scenario[] = [
  { id: 's5', label: 'Cyprus non-dom', flag: '🇨🇾', quit: true, duration: '17 yrs', regime: 'Non-dom · 0% divs/interest', pot: 1467152, salary: 0, rents: 1400, tax: 'cyprus', isa: 0, bizTax: 0.18 },
  { id: 's4', label: 'Portugal IFICI', flag: '🇵🇹', quit: true, duration: '10 yrs', regime: 'NHR 2.0 · foreign income 0%', pot: 1467152, salary: 0, rents: 1400, tax: 'beckham', isa: 0, bizTax: 0.25 },
  { id: 's1', label: 'Spain + own SL', flag: '🇪🇸', quit: true, duration: '6 yrs', regime: 'Beckham law · portfolio 0%', pot: 1467152, salary: 0, rents: 1400, tax: 'beckham', isa: 0, bizTax: 0.3 },
  { id: 's6', label: 'Stay at ICE · pot in her name', flag: '🇬🇧', quit: false, duration: 'ongoing', regime: 'UK · graduated bands + ISAs', pot: 1470152, salary: 10588, rents: 200, tax: 'uk', isa: ISA0, bizTax: 0.47, split: true },
  { id: 's3', label: 'ICE remote from Spain', flag: '✈️', quit: false, duration: '6 yrs', regime: 'Beckham digital nomad', pot: 1467152, salary: 13245, rents: 1400, tax: 'beckham', isa: 0, bizTax: 0.24 },
  { id: 's2', label: 'Stay at ICE (UK)', flag: '🇬🇧', quit: false, duration: 'ongoing', regime: 'UK additional rate', pot: 1470152, salary: 10588, rents: 200, tax: 'uk', isa: ISA0, bizTax: 0.47 },
];

export interface ScenarioResult extends Scenario {
  grossMo: number;
  taxMo: number;
  netPortMo: number;
  bizNet: number;
  totalMo: number;
  passiveMo: number; // excludes salary — the "freedom" number
  sleeve: number;
  clears: boolean;
}

// Static year-0 net income for a scenario at a given blended yield (%).
export function calcScenario(s: Scenario, yldPct: number): ScenarioResult {
  const sleeve = s.pot - GROWTH_FIXED;
  const scale = yldPct / BASE_BLEND;
  let gross: number, tax: number;
  if (s.tax === 'uk') {
    const bonds = (sleeve * BD_PCT) / INCOME_PCT,
      eq = (sleeve * EQ_PCT) / INCOME_PCT;
    const isaBd = Math.min(s.isa, bonds),
      giaBd = bonds - isaBd,
      isaEq = Math.min(Math.max(s.isa - bonds, 0), eq),
      giaEq = eq - isaEq;
    const gIsa = ((isaBd * BD_Y + isaEq * EQ_Y) / 100) * scale,
      gBd = (giaBd * BD_Y / 100) * scale,
      gEq = (giaEq * EQ_Y / 100) * scale;
    gross = gIsa + gBd + gEq;
    tax = s.split ? ukGiaTax(gBd, gEq) : gBd * UK_INT + gEq * UK_DIV;
  } else {
    gross = (sleeve * yldPct) / 100;
    tax = s.tax === 'spain' ? spainTax(gross) : s.tax === 'cyprus' ? Math.min(gross * 0.0265, 4077) : 0;
  }
  const netPortMo = (gross - tax) / 12;
  const bizNet = BIZ_GROSS * (1 - s.bizTax);
  const totalMo = netPortMo + s.salary + s.rents + bizNet;
  const passiveMo = netPortMo + s.rents + bizNet;
  return {
    ...s,
    grossMo: gross / 12,
    taxMo: tax / 12,
    netPortMo,
    bizNet,
    totalMo,
    passiveMo,
    sleeve,
    clears: totalMo >= FREEDOM_TARGET_MONTHLY,
  };
}

export function freedomPlan(yldPct: number): ScenarioResult[] {
  return SCENARIOS.map((s) => calcScenario(s, yldPct));
}

// Income-sleeve allocation for display (equity-income vs bonds-credit + growth).
export function sleeveAllocation(pot = 1467152) {
  const sleeve = pot - GROWTH_FIXED;
  return [
    { label: 'Equity income (covered-call)', value: (sleeve * EQ_PCT) / INCOME_PCT, color: 'var(--accent)' },
    { label: 'Bonds & credit', value: (sleeve * BD_PCT) / INCOME_PCT, color: 'var(--cyan)' },
    { label: 'Growth (NVDA/GOOGL/TSLA)', value: GROWTH_FIXED, color: 'var(--purple)' },
  ];
}

/* ============================ formatting ============================ */
export function gbpCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `£${(n / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString()}`;
}

export function gbp(n: number): string {
  return `£${Math.round(n).toLocaleString()}`;
}
