import type {
  AppConfig,
  Employee,
  EmployeeReport,
  LogRow,
  MonthlyResult,
  OwnerPnL,
  TakeHome,
  TaxMode,
} from "./types";

// ── 이름 매칭 ─────────────────────────────────────────────
export function matchEmployee(name: string, employees: Employee[]): Employee | null {
  const n = name.replace(/\s/g, "").toLowerCase();
  for (const e of employees) {
    const aliasList = [e.name, ...(e.aliases || [])];
    for (const alias of aliasList) {
      if (!alias) continue;
      const a = alias.replace(/\s/g, "").toLowerCase();
      if (a && (n === a || n.includes(a) || a.includes(n))) return e;
    }
  }

  return null;
}

// ── 4대보험 요율 (근로자 부담분, 2025 기준 근사) ──────────────
const RATE_PENSION = 0.045; // 국민연금
const RATE_HEALTH = 0.03545; // 건강보험
const RATE_CARE = 0.1295; // 장기요양 (건강보험료의 12.95%)
const RATE_EMPLOYMENT = 0.009; // 고용보험

// 근로소득공제 (연)
function earnedIncomeDeduction(annual: number): number {
  if (annual <= 5_000_000) return annual * 0.7;
  if (annual <= 15_000_000) return 3_500_000 + (annual - 5_000_000) * 0.4;
  if (annual <= 45_000_000) return 7_500_000 + (annual - 15_000_000) * 0.15;
  if (annual <= 100_000_000) return 12_000_000 + (annual - 45_000_000) * 0.05;
  return Math.min(14_750_000 + (annual - 100_000_000) * 0.02, 20_000_000);
}

// 종합소득세 산출세액 (과세표준 -> 세액, 2024 세율)
function incomeTaxByBase(base: number): number {
  if (base <= 0) return 0;
  if (base <= 14_000_000) return base * 0.06;
  if (base <= 50_000_000) return 840_000 + (base - 14_000_000) * 0.15;
  if (base <= 88_000_000) return 6_240_000 + (base - 50_000_000) * 0.24;
  if (base <= 150_000_000) return 15_360_000 + (base - 88_000_000) * 0.35;
  if (base <= 300_000_000) return 37_060_000 + (base - 150_000_000) * 0.38;
  return 94_060_000 + (base - 300_000_000) * 0.4;
}

// 월 급여 기준 소득세 추정 (본인 인적공제만 반영, 간이 추정)
function estimateMonthlyIncomeTax(monthlyGross: number, monthlyInsurance: number): number {
  const annualGross = monthlyGross * 12;
  const annualInsurance = monthlyInsurance * 12;
  const afterEarnedDeduction = annualGross - earnedIncomeDeduction(annualGross);
  const base = Math.max(0, afterEarnedDeduction - annualInsurance - 1_500_000); // 본인 기본공제 150만
  let tax = incomeTaxByBase(base);
  // 근로소득세액공제 (간이): 산출세액의 약 55% (한도 대략 적용)
  const credit = Math.min(tax * 0.55, 660_000);
  tax = Math.max(0, tax - credit);
  return Math.round(tax / 12);
}

export function computeTakeHome(gross: number, mode: TaxMode): TakeHome {
  if (gross <= 0) {
    return { gross: 0, deductions: [], totalDeduction: 0, net: 0, mode };
  }

  if (mode === "3.3") {
    const incomeTax = Math.round(gross * 0.03);
    const localTax = Math.round(gross * 0.003);
    const total = incomeTax + localTax;
    return {
      gross,
      deductions: [
        { label: "소득세 (3%)", amount: incomeTax },
        { label: "지방소득세 (0.3%)", amount: localTax },
      ],
      totalDeduction: total,
      net: gross - total,
      mode,
    };
  }

  // 4대보험
  const pension = Math.round(gross * RATE_PENSION);
  const health = Math.round(gross * RATE_HEALTH);
  const care = Math.round(health * RATE_CARE);
  const employment = Math.round(gross * RATE_EMPLOYMENT);
  const insurance = pension + health + care + employment;
  const incomeTax = estimateMonthlyIncomeTax(gross, insurance);
  const localTax = Math.round(incomeTax * 0.1);
  const total = insurance + incomeTax + localTax;
  return {
    gross,
    deductions: [
      { label: "국민연금 (4.5%)", amount: pension },
      { label: "건강보험 (3.545%)", amount: health },
      { label: "장기요양 (건강보험 12.95%)", amount: care },
      { label: "고용보험 (0.9%)", amount: employment },
      { label: "소득세 (추정)", amount: incomeTax },
      { label: "지방소득세 (추정)", amount: localTax },
    ],
    totalDeduction: total,
    net: gross - total,
    mode,
  };
}

// ── 월별 집계 ─────────────────────────────────────────────
export function listMonths(rows: LogRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.date && r.date.length >= 7) set.add(r.date.slice(0, 7));
  }
  return Array.from(set).sort().reverse();
}

export function computeMonthly(
  rows: LogRow[],
  config: AppConfig,
  month?: string
): MonthlyResult {
  const availableMonths = listMonths(rows);
  const targetMonth = month && availableMonths.includes(month)
    ? month
    : availableMonths[0] ?? month ?? "";

  const monthRows = rows.filter((r) => r.date.startsWith(targetMonth));

  // 날짜별 최댓값 매출 -> 월 총매출
  const dailyMax = new Map<string, number>();
  for (const r of monthRows) {
    const cur = dailyMax.get(r.date) ?? 0;
    if (r.revenue > cur) dailyMax.set(r.date, r.revenue);
  }
  const totalSales = Array.from(dailyMax.values()).reduce((a, b) => a + b, 0);
  const workingDays = dailyMax.size;
  const targetSales = workingDays * config.dailyTarget;
  
  // 시트에서 합산한 해당 월의 총 재료비+주류비
  const sheetMaterialCost = monthRows.reduce((sum, r) => sum + (r.materialCost || 0), 0);

  // 직원별 집계
  const byEmp = new Map<
    string,
    { dates: Set<string>; score: number; texts: string[]; totalHours: number }
  >();
  const unmatched = new Set<string>();

  for (const r of monthRows) {
    const emp = matchEmployee(r.name, config.employees);
    if (!emp) {
      if (r.name) unmatched.add(r.name);
      continue;
    }
    if (emp.role === "owner") continue; // 사장은 급여/인센티브 대상 제외
    let agg = byEmp.get(emp.id);
    if (!agg) {
      agg = { dates: new Set(), score: 0, texts: [], totalHours: 0 };
      byEmp.set(emp.id, agg);
    }
    if (r.date) agg.dates.add(r.date);
    agg.score += r.score;
    agg.totalHours += typeof r.workedHours === "number" ? r.workedHours : (emp.hoursPerDay || config.defaultHoursPerDay);
    for (const [k, v] of Object.entries(r.texts)) {
      if (v && v.length > 1) agg.texts.push(`[${k}] ${v}`);
    }
  }

  const totalScore = Array.from(byEmp.values()).reduce((a, b) => a + b.score, 0);

  // 인센티브 풀
  const pool3Total = Math.round(totalSales * config.incentivePool3Rate);
  const pool2Total = Math.round(totalSales * config.incentivePool2Rate);
  const pool3Recipients = config.employees.filter(
    (e) => e.getsPool3 && e.role !== "owner"
  );

  const reports: EmployeeReport[] = [];
  for (const emp of config.employees) {
    if (emp.role === "owner") continue;
    const agg = byEmp.get(emp.id) ?? { dates: new Set<string>(), score: 0, texts: [], totalHours: 0 };
    const attendanceDays = agg.dates.size;
    const hoursWorked = agg.totalHours;
    const contributionRate = totalScore > 0 ? (agg.score / totalScore) * 100 : 0;

    // 급여
    let baseSalary = 0;
    if (emp.employmentType === "hourly") {
      baseSalary = Math.round(hoursWorked * emp.hourlyWage);
    } else {
      baseSalary = Math.round(emp.annualSalary / 12);
    }

    // 인센티브: 2%풀은 점수 비례, 3%풀은 지정자 균등 분배
    let incentive = totalScore > 0 ? Math.round(pool2Total * (agg.score / totalScore)) : 0;
    if (emp.getsPool3 && pool3Recipients.length > 0) {
      incentive += Math.round(pool3Total / pool3Recipients.length);
    }

    const grossPay = baseSalary + incentive;
    const takeHome = computeTakeHome(grossPay, emp.taxMode);
    const takeHome33 = computeTakeHome(grossPay, "3.3");
    const takeHome4Ins = computeTakeHome(grossPay, "4insurance");

    reports.push({
      id: emp.id,
      name: emp.name,
      position: emp.position,
      role: emp.role,
      employmentType: emp.employmentType,
      annualSalary: emp.annualSalary,
      hourlyWage: emp.hourlyWage,
      attendanceDays,
      hoursWorked,
      score: agg.score,
      contributionRate,
      baseSalary,
      incentive,
      grossPay,
      takeHome,
      takeHome33,
      takeHome4Ins,
      personal: {
        phone: emp.phone,
        rrn: emp.rrn,
        bankAccount: emp.bankAccount,
      },
      texts: agg.texts,
      contract: emp.contract,
    });
  }

  const totalPayroll = reports.reduce((a, b) => a + b.baseSalary, 0);
  const totalIncentive = reports.reduce((a, b) => a + b.incentive, 0);

  const vc = config.variableCosts[targetMonth] ?? { material: 0, marketing: 0 };
  const vat = Math.round(totalSales * config.vatRate);
  const cardFee = Math.round(totalSales * 0.02);
  const netProfit =
    totalSales -
    totalPayroll -
    totalIncentive -
    config.fixedCost -
    sheetMaterialCost -
    vat -
    cardFee -
    vc.marketing;

  const owner: OwnerPnL = {
    month: targetMonth,
    totalSales,
    workingDays,
    targetSales,
    targetAchievement: targetSales > 0 ? (totalSales / targetSales) * 100 : 0,
    totalPayroll,
    totalIncentive,
    fixedCost: config.fixedCost,
    materialCost: sheetMaterialCost,
    vat,
    cardFee,
    marketingCost: vc.marketing,
    netProfit,
  };

  // 재료비 상세 내역 (날짜, 품목/내역, 구매자, 금액)
  const materialCostDetails = monthRows
    .filter((r) => r.materialCost > 0)
    .map((r) => {
      const emp = matchEmployee(r.name, config.employees);
      const buyer = emp ? emp.name : r.name;
      // "재고주문내역" 또는 "수행한 업무" 등에서 텍스트 추출
      const item =
        r.texts["재고주문내역"] ||
        r.texts["재고주문"] ||
        r.texts["수행한 업무"] ||
        "재고/재료 구매";
      return {
        date: r.date,
        item,
        buyer,
        amount: r.materialCost,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));


  return {
    month: targetMonth,
    availableMonths,
    totalSales,
    workingDays,
    targetSales,
    totalScore,
    employees: reports,
    owner,
    unmatchedNames: Array.from(unmatched),
    materialCost: sheetMaterialCost,
    materialCostDetails,
  };
}
