import * as XLSX from "xlsx";
import { readFile, writeFile } from "node:fs/promises";

const value = (item) => String(item ?? "").trim();
const key = (item) => value(item).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const date = (item) => item instanceof Date && !Number.isNaN(item.getTime()) ? item.toISOString().slice(0, 10) : typeof item === "number" ? (() => { const d = XLSX.SSF.parse_date_code(item); return d ? `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}` : ""; })() : value(item);
const results = [];
for (let year = 2016; year <= 2025; year++) {
  const name = `Rechnung ${year}.xlsm`; const workbook = XLSX.read(await readFile(`working/excel/2026-07-10_22-31-01/${name}`), { type: "buffer", cellDates: true, dense: true, sheetRows: 20000 });
  const customersSheet = workbook.SheetNames.find((sheet) => /kunden/i.test(sheet)); const expensesSheet = workbook.SheetNames.find((sheet) => /ausgab|kosten/i.test(sheet)); let invoices = 0, customers = new Set(), payments = 0, templates = [];
  if (customersSheet) { const rows = XLSX.utils.sheet_to_json(workbook.Sheets[customersSheet], { header: 1, defval: "", raw: true }); const hi = rows.findIndex((row) => row.some((cell) => /rechnungs?(nr|nummer)/.test(key(cell)))); const headers = rows[hi] || []; const col = (re) => headers.findIndex((h) => re.test(key(h))); const nr = col(/rechnungs?(nr|nummer)/), n = col(/^name$/), st = col(/strasse/), pc = col(/^plz/), city = col(/^ort$/), total = col(/rechnungsbetrag|gesamtbetrag/), paid = col(/^bezahlt$/), template = col(/rechntext|rechnungstext/); for (const row of rows.slice(hi + 1)) { if (/^\d+$/.test(value(row[nr])) && value(row[n]) && Number(row[total] || 0) !== 0) { invoices++; customers.add(`${value(row[n])}|${value(row[st])}|${value(row[pc])}|${value(row[city])}`); if (/^ja$/i.test(value(row[paid]))) payments++; } if (template >= 0 && value(row[template]).length >= 10) templates.push(value(row[template])); } }
  let expenses = 0; if (expensesSheet) { const rows = XLSX.utils.sheet_to_json(workbook.Sheets[expensesSheet], { header: 1, defval: "", raw: true }); const hi = rows.findIndex((row) => row.some((cell) => /^kategorie$/.test(key(cell)))); const headers = rows[hi] || []; const col = (re) => headers.findIndex((h) => re.test(key(h))); const d = col(/^datum$/), amount = col(/^preis|betrag/); expenses = rows.slice(hi + 1).filter((row) => date(row[d]) && Number(row[amount] || 0) > 0).length; }
  results.push({ file: name, year, sheets: workbook.SheetNames, variant: year <= 2017 ? "Legacy 2016–2017" : year <= 2022 ? "Shooting-Tabelle 2018–2022" : "Gutschein/Teilzahlung 2023–2025", customers: customers.size, invoices, expenses, payments, templates: [...new Set(templates)].length });
}
await writeFile("working/import-preview-summary.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
