import type {
  AppConfig,
  DailyLog,
  Employee,
  EmployeeReport,
  LogRow,
  MonthlyResult,
  MonthProjection,
  OwnerPnL,
  TakeHome,
  TaxMode,
} from "./types";

// 오늘 날짜 (한국 시간 기준 YYYY-MM-DD)
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

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
  month?: string,
  today: string = todayKST()
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
  const dailySales = Array.from(dailyMax.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const targetSales = workingDays * config.dailyTarget;
  
  // 시트에서 합산한 해당 월의 총 재료비+주류비
  const sheetMaterialCost = monthRows.reduce((sum, r) => sum + (r.materialCost || 0), 0);

  // 업무일지 칸 이름은 시트마다 조금씩 달라서 이름에 든 낱말로 찾습니다
  // '특별히 빛나는 성과'는 감점 항목도 함께 적히는 칸이라 잘한 점으로 합치지 않고 그대로 둡니다
  const isGoodCol = (k: string) => /잘한|잘 한/.test(k);
  const isImproveCol = (k: string) => /개선|아쉬운|보완/.test(k);
  const pickText = (texts: Record<string, string>, match: (k: string) => boolean) =>
    Object.entries(texts)
      .filter(([k, v]) => match(k) && String(v).trim())
      .map(([, v]) => String(v).trim())
      .join("\n");

  // 직원별 집계
  const byEmp = new Map<
    string,
    { dates: Set<string>; score: number; texts: string[]; totalHours: number; logs: DailyLog[] }
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
      agg = { dates: new Set(), score: 0, texts: [], totalHours: 0, logs: [] };
      byEmp.set(emp.id, agg);
    }
    if (r.date) agg.dates.add(r.date);
    agg.score += r.score;
    agg.totalHours += typeof r.workedHours === "number" ? r.workedHours : (emp.hoursPerDay || config.defaultHoursPerDay);
    for (const [k, v] of Object.entries(r.texts)) {
      if (v && v.length > 1) agg.texts.push(`[${k}] ${v}`);
    }

    // 그날 일지 원문 (누가 어떤 날을 비워뒀는지 보이게)
    const good = pickText(r.texts, isGoodCol);
    const improve = pickText(r.texts, isImproveCol);
    agg.logs.push({
      date: r.date,
      good,
      improve,
      extras: Object.entries(r.texts)
        .filter(([k, v]) => !isGoodCol(k) && !isImproveCol(k) && String(v).trim())
        .map(([k, v]) => ({ label: k, text: String(v).trim() })),
      blank: !good && !improve,
    });
  }

  const totalScore = Array.from(byEmp.values()).reduce((a, b) => a + b.score, 0);

  // 인센티브 방식 결정
  // - profit-share: incentiveProfitStartMonth(예: 2026-09) 이후 달 → 순이익의 N%를 풀로 잡고 기여점수 비례 분배
  // - sales-pool : 그 전 달 → 매출의 3% 풀(지정자 균등) + 2% 풀(점수 비례)
  const profitRate = config.incentiveProfitRate ?? 0;
  const profitStart = config.incentiveProfitStartMonth ?? "";
  const useProfitShare = profitRate > 0 && !!profitStart && !!targetMonth && targetMonth >= profitStart;

  const pool3Total = Math.round(totalSales * config.incentivePool3Rate);
  const pool2Total = Math.round(totalSales * config.incentivePool2Rate);
  const pool3Recipients = config.employees.filter(
    (e) => e.getsPool3 && e.role !== "owner"
  );

  // 급여 (인센티브 계산보다 먼저 — 순이익 인센티브는 급여를 뺀 이익 기준)
  const baseSalaryOf = (emp: Employee, hoursWorked: number) =>
    emp.employmentType === "hourly"
      ? Math.round(hoursWorked * emp.hourlyWage)
      : Math.round(emp.annualSalary / 12);

  const payrollEmployees = config.employees.filter((e) => e.role !== "owner");
  const totalPayrollPre = payrollEmployees.reduce((sum, emp) => {
    const agg = byEmp.get(emp.id);
    return sum + baseSalaryOf(emp, agg?.totalHours ?? 0);
  }, 0);

  const vc = config.variableCosts[targetMonth] ?? { material: 0, marketing: 0 };
  const vat = Math.round(totalSales * config.vatRate);
  const cardFee = Math.round(totalSales * 0.02);
  // 인센티브 차감 전 순이익 = 매출 − 급여 − 고정비 − 부가세 − 카드수수료 − 재료비/주류비 − 마케팅및기타
  const profitBeforeIncentive =
    totalSales -
    totalPayrollPre -
    config.fixedCost -
    sheetMaterialCost -
    vat -
    cardFee -
    vc.marketing;
  // 순이익 풀: 이익이 0 이하인 달은 인센티브 없음
  const profitPool = useProfitShare ? Math.max(0, Math.round(profitBeforeIncentive * profitRate)) : 0;

  // ── 월말 예상 ────────────────────────────────────────────
  // 진행 중인 달: 지금까지의 '달력일 1일당 평균'으로 월말까지 늘려 잡는다 (매출·영업일·시급·재료비)
  // 지난 달: 실적이 곧 결과이므로 배수 1
  const [ty, tm] = targetMonth.split("-").map(Number);
  const daysInMonth = ty && tm ? new Date(ty, tm, 0).getDate() : 30;
  const isCurrentMonth = !!targetMonth && today.startsWith(targetMonth);
  const lastDataDay = dailySales.length > 0 ? Number(dailySales[0].date.slice(8, 10)) : 0;
  const elapsedDays = isCurrentMonth
    ? Math.min(daysInMonth, Math.max(1, Number(today.slice(8, 10)), lastDataDay))
    : daysInMonth;
  const isPartial = isCurrentMonth && elapsedDays < daysInMonth;
  const scale = isPartial && elapsedDays > 0 ? daysInMonth / elapsedDays : 1;

  const projectedSales = Math.round(totalSales * scale);
  const projectedWorkingDays = Math.round(workingDays * scale);
  const projectedPayroll = payrollEmployees.reduce((sum, emp) => {
    const agg = byEmp.get(emp.id);
    const hours = (agg?.totalHours ?? 0) * (emp.employmentType === "hourly" ? scale : 1);
    return sum + baseSalaryOf(emp, hours);
  }, 0);
  const projectedProfitBeforeIncentive =
    projectedSales -
    projectedPayroll -
    config.fixedCost -
    Math.round(sheetMaterialCost * scale) -
    Math.round(projectedSales * config.vatRate) -
    Math.round(projectedSales * 0.02) -
    vc.marketing;
  const projectedProfitPool = useProfitShare
    ? Math.max(0, Math.round(projectedProfitBeforeIncentive * profitRate))
    : 0;
  const projectedPool3 = Math.round(projectedSales * config.incentivePool3Rate);
  const projectedPool2 = Math.round(projectedSales * config.incentivePool2Rate);

  const reports: EmployeeReport[] = [];
  for (const emp of config.employees) {
    if (emp.role === "owner") continue;
    const agg = byEmp.get(emp.id) ?? { dates: new Set<string>(), score: 0, texts: [], totalHours: 0, logs: [] };
    const dailyLogs = [...agg.logs].sort((a, b) => a.date.localeCompare(b.date));
    const attendanceDays = agg.dates.size;
    const hoursWorked = agg.totalHours;
    const contributionRate = totalScore > 0 ? (agg.score / totalScore) * 100 : 0;

    const baseSalary = baseSalaryOf(emp, hoursWorked);

    let incentive = 0;
    if (useProfitShare) {
      // 순이익 풀을 기여점수에 비례해 분배
      incentive = totalScore > 0 ? Math.round(profitPool * (agg.score / totalScore)) : 0;
    } else {
      // 2%풀은 점수 비례, 3%풀은 지정자 균등 분배
      incentive = totalScore > 0 ? Math.round(pool2Total * (agg.score / totalScore)) : 0;
      if (emp.getsPool3 && pool3Recipients.length > 0) {
        incentive += Math.round(pool3Total / pool3Recipients.length);
      }
    }

    // 월말 예상 인센티브 (기여율은 지금까지의 비율이 유지된다고 가정)
    let projectedIncentive = 0;
    if (useProfitShare) {
      projectedIncentive = totalScore > 0 ? Math.round(projectedProfitPool * (agg.score / totalScore)) : 0;
    } else {
      projectedIncentive = totalScore > 0 ? Math.round(projectedPool2 * (agg.score / totalScore)) : 0;
      if (emp.getsPool3 && pool3Recipients.length > 0) {
        projectedIncentive += Math.round(projectedPool3 / pool3Recipients.length);
      }
    }
    const projectedBaseSalary = baseSalaryOf(emp, hoursWorked * (emp.employmentType === "hourly" ? scale : 1));
    const projectedGrossPay = projectedBaseSalary + projectedIncentive;

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
      projectedIncentive,
      projectedGrossPay,
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
      dailyLogs,
      blankDays: dailyLogs.filter((l) => l.blank).length,
      contract: emp.contract,
    });
  }

  const totalPayroll = reports.reduce((a, b) => a + b.baseSalary, 0);
  const totalIncentive = reports.reduce((a, b) => a + b.incentive, 0);

  const netProfit = profitBeforeIncentive - totalIncentive;

  const projectedIncentivePool = reports.reduce((a, b) => a + b.projectedIncentive, 0);
  const projection: MonthProjection = {
    isPartial,
    daysInMonth,
    elapsedDays,
    projectedWorkingDays,
    projectedSales,
    projectedPayroll,
    projectedProfitBeforeIncentive,
    projectedIncentivePool,
    projectedNetProfit: projectedProfitBeforeIncentive - projectedIncentivePool,
  };

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
    incentiveMode: useProfitShare ? "profit-share" : "sales-pool",
    incentiveRate: useProfitShare ? profitRate : 0,
    profitBeforeIncentive,
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
    projection,
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
    dailySales,
  };
}
