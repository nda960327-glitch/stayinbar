export type Role = "owner" | "manager" | "staff" | "server";
export type EmploymentType = "salary" | "hourly";
export type TaxMode = "3.3" | "4insurance";

export interface Employee {
  id: string;
  name: string;
  aliases: string[];
  role: Role;
  position: string;
  employmentType: EmploymentType;
  annualSalary: number;
  hourlyWage: number;
  taxMode: TaxMode;
  hoursPerDay: number;
  getsPool3: boolean;
  phone: string;
  rrn: string;
  bankAccount: string;
  pin: string;
}

export interface VariableCost {
  material: number; // 재료비 + 주류비
  marketing: number; // 마케팅 및 기타
}

export interface AppConfig {
  businessName: string;
  fixedCost: number;
  dailyTarget: number;
  incentivePool3Rate: number;
  incentivePool2Rate: number;
  vatRate: number;
  defaultHoursPerDay: number;
  defaultServerWage: number;
  sheetCsvUrl: string;
  ownerPin: string;
  variableCosts: Record<string, VariableCost>;
  employees: Employee[];
}

// 시트에서 파싱한 한 줄
export interface LogRow {
  timestamp: string;
  name: string; // 원본 이름
  date: string; // YYYY-MM-DD
  revenue: number;
  score: number;
  workedHours?: number; // 시트에서 추출한 실제 근무 시간
  texts: Record<string, string>; // 컬럼명 -> 텍스트 (AI 분석용)
}

export interface TakeHome {
  gross: number; // 세전 급여
  deductions: {
    label: string;
    amount: number;
  }[];
  totalDeduction: number;
  net: number; // 실수령액
  mode: TaxMode;
}

export interface EmployeeReport {
  id: string;
  name: string;
  position: string;
  role: Role;
  employmentType: EmploymentType;
  attendanceDays: number;
  hoursWorked: number;
  score: number;
  contributionRate: number; // %
  baseSalary: number; // 세전 급여(월)
  incentive: number;
  grossPay: number; // 급여 + 인센티브 (세전)
  takeHome: TakeHome;
  takeHome33: TakeHome;
  takeHome4Ins: TakeHome;
  personal: {
    phone: string;
    rrn: string;
    bankAccount: string;
  };
  texts: string[]; // AI 분석용 텍스트 모음
}

export interface OwnerPnL {
  month: string;
  totalSales: number;
  workingDays: number;
  targetSales: number;
  targetAchievement: number; // %
  totalPayroll: number; // 총 급여(세전)
  totalIncentive: number; // 총 인센티브
  fixedCost: number;
  materialCost: number; // 재료비 + 주류비 (입력)
  vat: number; // 부가세
  marketingCost: number; // 마케팅 및 기타 (입력)
  netProfit: number;
}

export interface MonthlyResult {
  month: string;
  availableMonths: string[];
  totalSales: number;
  workingDays: number;
  targetSales: number;
  totalScore: number;
  employees: EmployeeReport[];
  owner: OwnerPnL;
  unmatchedNames: string[]; // 시트에 있으나 직원 등록 안 된 이름
}
