/**
 * Excel file parsing utilities using exceljs
 * Replaces xlsx package to address security vulnerabilities (ReDoS, Prototype Pollution)
 */
import ExcelJS from "exceljs";

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: Record<string, string>;
}

/**
 * Parse an Excel file and convert all sheets to CSV format
 * @param file - The Excel file to parse
 * @returns Promise resolving to parsed workbook data
 */
export async function parseExcelFile(file: File): Promise<ParsedWorkbook> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const sheetNames: string[] = [];
  const sheets: Record<string, string> = {};

  workbook.eachSheet((worksheet, sheetId) => {
    const sheetName = worksheet.name;
    sheetNames.push(sheetName);
    sheets[sheetName] = worksheetToCsv(worksheet);
  });

  return { sheetNames, sheets };
}

/**
 * Parse an Excel file from an ArrayBuffer
 * @param arrayBuffer - The ArrayBuffer containing Excel data
 * @returns Promise resolving to parsed workbook data
 */
export async function parseExcelFromBuffer(arrayBuffer: ArrayBuffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const sheetNames: string[] = [];
  const sheets: Record<string, string> = {};

  workbook.eachSheet((worksheet, sheetId) => {
    const sheetName = worksheet.name;
    sheetNames.push(sheetName);
    sheets[sheetName] = worksheetToCsv(worksheet);
  });

  return { sheetNames, sheets };
}

/**
 * Convert an ExcelJS worksheet to CSV format
 * @param worksheet - The ExcelJS worksheet
 * @returns CSV string
 */
function worksheetToCsv(worksheet: ExcelJS.Worksheet): string {
  const rows: string[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // Handle different cell value types
      let value = "";
      if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === "object") {
          // Handle rich text, formulas, etc.
          if ("result" in cell.value) {
            value = String(cell.value.result ?? "");
          } else if ("text" in cell.value) {
            value = String(cell.value.text ?? "");
          } else if ("richText" in cell.value && Array.isArray(cell.value.richText)) {
            value = cell.value.richText.map((rt: { text?: string }) => rt.text ?? "").join("");
          } else {
            value = String(cell.value);
          }
        } else {
          value = String(cell.value);
        }
      }
      // Escape CSV special characters
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      values.push(value);
    });
    rows.push(values.join(","));
  });

  return rows.join("\n");
}

/**
 * Parse Excel file and return formatted text with sheet markers
 * This matches the format previously used with xlsx library
 * @param file - The Excel file to parse
 * @returns Promise resolving to formatted text string
 */
export async function parseExcelToText(file: File): Promise<string> {
  const { sheetNames, sheets } = await parseExcelFile(file);
  
  let allText = "";
  for (const sheetName of sheetNames) {
    allText += `\n=== Sheet: ${sheetName} ===\n${sheets[sheetName]}\n`;
  }
  
  return allText;
}
