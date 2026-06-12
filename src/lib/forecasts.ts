// Pure forecasting helpers shared by the Forecasts hub.
//
// The "Financial Freedom" model is a faithful port of the authoritative
// Freedom Plan dashboard (finances/retirement-plan.html, built 2026-06-10):
// ~£1.44M deployable pot → income sleeve @ 7.8% blend, business + rent, taxed
// per scenario. Target is £11k/mo net. Pot, ISA and business income refreshed
// from live data 12 Jun 2026. Keep in sync with the Freedom Plan dashboard.

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
export interface SleeveFund {
  name: string;
  ticker: string;
  cls: 'eq' | 'bd';
  pct: number; // weight in the income sleeve (sums to 90)
  y: number; // headline yield %
  freq: string;
  nav: string; // 2-year NAV stability note
  navState: 'good' | 'watch' | 'risk';
}

export const SLEEVE_FUNDS: SleeveFund[] = [
  { name: 'UBS Global Enhanced Eq Income', ticker: 'BL0RSP8', cls: 'eq', pct: 26, y: 8.42, freq: 'Monthly', nav: 'Rising 2 yrs straight', navState: 'good' },
  { name: 'Fidelity Enhanced Income', ticker: 'BYSYZP1', cls: 'eq', pct: 20, y: 6.7, freq: 'Monthly', nav: 'Flat then +10%', navState: 'good' },
  { name: 'PIMCO ST High Yield (STHS)', ticker: 'IE00BYXVWC37', cls: 'bd', pct: 18, y: 7.15, freq: 'Monthly', nav: 'Stable ~£9', navState: 'good' },
  { name: 'iShares USD High Yield (HYSD)', ticker: 'IE000IIOOR48', cls: 'bd', pct: 16, y: 7.2, freq: 'Quarterly', nav: 'Mild dip ~-3% / 2y', navState: 'watch' },
  { name: 'JPM Nasdaq Prem Income (JEQP)', ticker: 'IE000U9J8HX9', cls: 'eq', pct: 10, y: 10.5, freq: 'Monthly', nav: '-8% in 2025, recovering', navState: 'risk' },
];

export interface GrowthHolding {
  name: string;
  ticker: string;
  value: number;
}
export const GROWTH_HOLDINGS: GrowthHolding[] = [
  { name: 'NVIDIA', ticker: 'NVDA', value: 30000 },
  { name: 'Alphabet', ticker: 'GOOGL', value: 30000 },
  { name: 'Tesla', ticker: 'TSLA', value: 30000 },
];

const FUNDS = SLEEVE_FUNDS.map((f) => ({ cls: f.cls, pct: f.pct, y: f.y }));
const GROWTH_FIXED = 90000; // NVDA + GOOGL + TSLA @ £30k each, never topped up
const INCOME_PCT = FUNDS.reduce((a, f) => a + f.pct, 0);
export const BASE_BLEND = FUNDS.reduce((a, f) => a + f.pct * f.y, 0) / INCOME_PCT; // ≈ 7.8
const EQ_PCT = FUNDS.filter((f) => f.cls === 'eq').reduce((a, f) => a + f.pct, 0);
const BD_PCT = FUNDS.filter((f) => f.cls === 'bd').reduce((a, f) => a + f.pct, 0);
const EQ_Y = FUNDS.filter((f) => f.cls === 'eq').reduce((a, f) => a + f.pct * f.y, 0) / EQ_PCT;
const BD_Y = FUNDS.filter((f) => f.cls === 'bd').reduce((a, f) => a + f.pct * f.y, 0) / BD_PCT;

const EURGBP = 1.17;
const ISA0 = 297186; // HL ISA value 12 Jun 2026
const UK_DIV = 0.3935;
const UK_INT = 0.45;
// Business income/mo (pre personal-tax profit). Real Stripe last 30d (12 Jun 2026):
// CarCostCheck £2,303 (423 txns) + PCC/HBC £46 + AppealAFine £20 = £2,369 gross.
// Net of Stripe fees + OneAuto/AutoCheck COGS ~£1,880, + GYG £200 + YouTube £20.
const BIZ_GROSS = 1880 + 200 + 20; // ~£2,100/mo (was £1,520; refresh from live Stripe)

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
  { id: 's5', label: 'Cyprus non-dom', flag: '🇨🇾', quit: true, duration: '17 yrs', regime: 'Non-dom · 0% divs/interest', pot: 1438691, salary: 0, rents: 1400, tax: 'cyprus', isa: 0, bizTax: 0.18 },
  { id: 's4', label: 'Portugal IFICI', flag: '🇵🇹', quit: true, duration: '10 yrs', regime: 'NHR 2.0 · foreign income 0%', pot: 1438691, salary: 0, rents: 1400, tax: 'beckham', isa: 0, bizTax: 0.25 },
  { id: 's1', label: 'Spain + own SL', flag: '🇪🇸', quit: true, duration: '6 yrs', regime: 'Beckham law · portfolio 0%', pot: 1438691, salary: 0, rents: 1400, tax: 'beckham', isa: 0, bizTax: 0.3 },
  { id: 's6', label: 'Stay at ICE · pot in her name', flag: '🇬🇧', quit: false, duration: 'ongoing', regime: 'UK · graduated bands + ISAs', pot: 1441691, salary: 10588, rents: 200, tax: 'uk', isa: ISA0, bizTax: 0.47, split: true },
  { id: 's3', label: 'ICE remote from Spain', flag: '✈️', quit: false, duration: '6 yrs', regime: 'Beckham digital nomad', pot: 1438691, salary: 13245, rents: 1400, tax: 'beckham', isa: 0, bizTax: 0.24 },
  { id: 's2', label: 'Stay at ICE (UK)', flag: '🇬🇧', quit: false, duration: 'ongoing', regime: 'UK additional rate', pot: 1441691, salary: 10588, rents: 200, tax: 'uk', isa: ISA0, bizTax: 0.47 },
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

export interface AllocSlice {
  name: string;
  ticker: string;
  kind: 'eq' | 'bd' | 'growth';
  value: number; // £ deployed
  pctOfPot: number; // % of whole pot
  yield: number; // effective yield % (after blend scale)
  monthly: number; // £/mo gross income
  nav: string;
  navState: 'good' | 'watch' | 'risk' | 'na';
  freq: string;
  color: string;
}

// Per-holding allocation detail for the interactive donut / table.
export function sleeveFundDetail(pot = 1467152, yldPct = BASE_BLEND): AllocSlice[] {
  const sleeve = pot - GROWTH_FIXED;
  const scale = yldPct / BASE_BLEND;
  const eqColors = ['var(--accent)', '#6aa6ff', 'var(--purple)'];
  const bdColors = ['var(--cyan)', '#5eead4'];
  let ei = 0,
    bi = 0;
  const funds: AllocSlice[] = SLEEVE_FUNDS.map((f) => {
    const value = (sleeve * f.pct) / INCOME_PCT;
    const yEff = f.y * scale;
    const color = f.cls === 'eq' ? eqColors[ei++ % eqColors.length] : bdColors[bi++ % bdColors.length];
    return {
      name: f.name,
      ticker: f.ticker,
      kind: f.cls,
      value,
      pctOfPot: (value / pot) * 100,
      yield: yEff,
      monthly: (value * yEff) / 1200,
      nav: f.nav,
      navState: f.navState,
      freq: f.freq,
      color,
    };
  });
  const growth: AllocSlice[] = GROWTH_HOLDINGS.map((g, i) => ({
    name: g.name,
    ticker: g.ticker,
    kind: 'growth' as const,
    value: g.value,
    pctOfPot: (g.value / pot) * 100,
    yield: 0,
    monthly: 0,
    nav: 'Capital growth sleeve',
    navState: 'na' as const,
    freq: 'Fixed £30k',
    color: ['var(--orange)', '#fb923c', '#fbbf24'][i % 3],
  }));
  return [...funds, ...growth];
}

export interface WaterfallRow {
  label: string;
  value: number; // signed (tax is negative)
  color: string;
  emphasis?: boolean;
}

// Per-scenario income waterfall: gross distributions -> tax -> net + rents + business (+ salary) = total.
export function scenarioWaterfall(r: ScenarioResult): WaterfallRow[] {
  const rows: WaterfallRow[] = [
    { label: 'Portfolio distributions (gross)', value: r.grossMo, color: 'var(--accent)' },
    { label: `Tax (${r.regime})`, value: -r.taxMo, color: 'var(--red)' },
    { label: 'Net portfolio income', value: r.netPortMo, color: 'var(--green)' },
    { label: 'Rents net (Binnacle + Cordage)', value: r.rents, color: 'var(--purple)' },
    { label: 'Websites + GYG + YouTube net', value: r.bizNet, color: 'var(--cyan)' },
  ];
  if (r.salary) rows.push({ label: 'Salary + bonus + RSUs net', value: r.salary, color: 'var(--orange)' });
  rows.push({ label: 'Total net / month', value: r.totalMo, color: 'var(--green)', emphasis: true });
  return rows;
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
