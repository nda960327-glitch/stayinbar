export type Role = "owner" | "manager" | "staff" | "server";
export type EmploymentType = "salary" | "hourly";
export type TaxMode = "3.3" | "4insurance";

export interface EmploymentContract {
  startDate: string;        // 근로 시작일 (YYYY-MM-DD)
  endDate: string;          // 근로 종료일 (비워두면 기간의 정함 없음)
  workLocation: string;     // 근무 장소
  jobDescription: string;   // 담당 업무
  workStartTime: string;    // 시업 시각 (HH:MM)
  workEndTime: string;      // 종업 시각 (HH:MM)
  breakMinutes: number;     // 휴게 시간(분)
  workDays: string;         // 근무 요일
  weeklyRestDay: string;    // 주휴일
  annualLeave: number;      // 연차 일수
  paymentDate: number;      // 임금 지급일 (매월 N일)
  paymentMethod: string;    // 지급 방법
  businessAddress: string;  // 사업장 주소
  ownerName: string;        // 사업주 성명
  ownerSigned: boolean;     // 사업주 서명 여부
  employeeSigned: boolean;  // 근로자 서명 여부
  signedAt: string;         // 계약서 작성일 (YYYY-MM-DD)
}

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
  contract?: Partial<EmploymentContract>;
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
  execPin: string;           // 임원 대시보드 PIN
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
  materialCost: number; // 시트에서 추출한 금액 (재료비 등)
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
  annualSalary: number;
  hourlyWage: number;
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
  contract?: Partial<EmploymentContract>;
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
  cardFee: number; // 카드 수수료
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
  materialCost: number; // 해당 월의 스프레드시트에서 합산한 재료비+주류비
  materialCostDetails: { date: string; amount: number }[];
}
