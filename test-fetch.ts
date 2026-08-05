import { fetchSheetCsv } from "./src/lib/sheet";
import { computeMonthly } from "./src/lib/calc";
import { getConfig } from "./src/lib/config";

async function run() {
  const url = "https://docs.google.com/spreadsheets/d/1tS5uY29cddvv5-_QAE2C-0CkOyIjIwb_UmgPuvIltHA/export?format=csv&gid=1583198180";
  console.log("Fetching...");
  try {
    const { rows, headers } = await fetchSheetCsv(url);
    console.log("Parsed rows:", rows.length);
    console.log("Headers:", headers);
    
    if (rows.length > 0) {
      console.log("First row date:", rows[0].date);
    }

    const config = await getConfig();
    const monthly = computeMonthly(rows, config);
    console.log("Monthly Result month:", monthly.month);
    console.log("Monthly Result workingDays:", monthly.workingDays);
    console.log("Unmatched names:", monthly.unmatchedNames);
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
