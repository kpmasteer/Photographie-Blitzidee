import fs from "node:fs/promises";
import { File } from "node:buffer";
import { previewExcel } from "../src/lib/excelImport";

const source = "../Rechnung Makro Probe1.xlsm";
const bytes = await fs.readFile(source);
const file = new File([bytes], "Rechnung Makro Probe1.xlsm", { type: "application/vnd.ms-excel.sheet.macroEnabled.12" });
const preview = await previewExcel(file as unknown as globalThis.File);
console.log(JSON.stringify({ sheets: preview.sheets, years: preview.years, invoices: preview.rows.length, numbers: preview.rows.map((row) => row.invoiceNumber), warnings: preview.warnings }, null, 2));
