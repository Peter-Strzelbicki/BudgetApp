const assert = require("node:assert/strict");
const test = require("node:test");
const ExcelJS = require("exceljs");

const { parseBudgetWorkbook } = require("./import-xlsx");

test("parses current and legacy monthly sheets", async () => {
  const workbook = new ExcelJS.Workbook();

  const current = workbook.addWorksheet("January (26)");
  current.getCell("A12").value = "HOUSING";
  current.getCell("B12").value = "Projected Cost";
  current.getCell("C12").value = "Actual Cost";
  current.getCell("A13").value = "Mortgage";
  current.getCell("B13").value = 1200;
  current.getCell("C13").value = 1200;
  current.getCell("A14").value = "TOTAL";
  current.getCell("A20").value = "GROCERIES";
  ["Date", "Price", "Location", "Paid by"].forEach((value, index) => {
    current.getRow(21).getCell(index + 1).value = value;
  });
  current.getCell("A22").value = "Janaury 5, 2026";
  current.getCell("B22").value = 42.75;
  current.getCell("C22").value = "Market";
  current.getCell("D22").value = "Peter";
  current.getCell("A23").value = "TOTAL";

  const legacy = workbook.addWorksheet("May");
  legacy.getCell("B12").value = "PERSONAL/HOME CARE";
  legacy.getCell("C12").value = "Projected Cost";
  legacy.getCell("D12").value = "Actual Cost";
  legacy.getCell("B13").value = "House Supplies";
  legacy.getCell("C13").value = 100;
  legacy.getCell("D13").value = 80;
  legacy.getCell("B14").value = "TOTAL";
  legacy.getCell("F20").value = "DINING OUT";
  ["Date", "Price", "Location", "Paid by"].forEach((value, index) => {
    legacy.getRow(21).getCell(index + 6).value = value;
  });
  legacy.getCell("F22").value = new Date(Date.UTC(2025, 4, 8));
  legacy.getCell("G22").value = 25;
  legacy.getCell("H22").value = "Cafe";
  legacy.getCell("I22").value = "Sailah";
  legacy.getCell("F23").value = "TOTAL";

  const parsed = await parseBudgetWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

  assert.equal(parsed.sheets.length, 2);
  assert.deepEqual(parsed.sheets.map(sheet => [sheet.year, sheet.month]), [[2025, 5], [2026, 1]]);
  assert.equal(parsed.budgets.length, 2);
  assert.equal(parsed.transactions.filter(row => !row.generated).length, 2);
  assert.equal(parsed.transactions.filter(row => row.generated).length, 2);
  assert.ok(parsed.transactions.some(row => row.transaction_date === "2026-01-05" && row.subcategory === "Groceries"));
  assert.ok(parsed.budgets.some(row => row.subcategory === "Home Care" && row.projected_amount === 100));
});

test("repairs descriptive dates and removes exact workbook duplicates", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("December (25)");

  for (const startColumn of [1, 6]) {
    sheet.getRow(10).getCell(startColumn).value = "ENTERTAINMENT";
    ["Date", "Price", "Location", "Paid by"].forEach((value, index) => {
      sheet.getRow(11).getCell(startColumn + index).value = value;
    });
    sheet.getRow(12).getCell(startColumn).value = "CHRISTMAS";
    sheet.getRow(12).getCell(startColumn + 1).value = 30;
    sheet.getRow(12).getCell(startColumn + 2).value = "Gift";
    sheet.getRow(12).getCell(startColumn + 3).value = "Joint";
    sheet.getRow(13).getCell(startColumn).value = "TOTAL";
  }

  sheet.getCell("A20").value = "FOOD";
  sheet.getCell("B20").value = "Projected Cost";
  sheet.getCell("C20").value = "Actual Cost";
  sheet.getCell("A21").value = "Groceries";
  sheet.getCell("B21").value = 100;
  sheet.getCell("A22").value = "TOTAL";

  const parsed = await parseBudgetWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0].transaction_date, "2025-12-25");
  assert.ok(parsed.warnings.some(warning => warning.message.includes("exact duplicate")));
});