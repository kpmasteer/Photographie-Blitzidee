import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const sourceDir = path.resolve("../working/excel/2026-07-10_22-31-01");
const files = (await fs.readdir(sourceDir)).filter((name) => /^Rechnung 20\d{2}\.xlsm$/i.test(name)).sort();
const normalize = (value: unknown) => String(value ?? "").trim();

const reports = [];
for (const name of files) {
  const data = await fs.readFile(path.join(sourceDir, name));
  const workbook = XLSX.read(data, { type: "buffer", cellDates: false, cellStyles: true, cellFormula: true, sheetRows: 2500, dense: false });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]!;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
    const nonEmptyRows = matrix.map((row, index) => ({ row: index + 1, values: row.map(normalize) }))
      .filter(({ values }) => values.some(Boolean));
    const greenCells: Array<{ ref: string; value: string; rgb?: string; indexed?: number }> = [];
    for (const [ref, cell] of Object.entries(sheet)) {
      if (ref.startsWith("!")) continue;
      const typed = cell as XLSX.CellObject & { s?: { fill?: { fgColor?: { rgb?: string; indexed?: number } } } };
      const color = typed.s?.fill?.fgColor;
      const rgb = color?.rgb?.toUpperCase();
      if ((rgb && /(?:00)?(?:70AD47|00B050|92D050|A9D18E|C6E0B4|E2F0D9)$/.test(rgb)) || color?.indexed === 17) {
        const value = normalize(typed.w ?? typed.v);
        if (value) greenCells.push({ ref, value, rgb, indexed: color?.indexed });
      }
    }
    return {
      name: sheetName,
      ref: sheet["!ref"],
      merges: sheet["!merges"]?.map((merge) => XLSX.utils.encode_range(merge)) ?? [],
      nonEmptyRowCount: nonEmptyRows.length,
      sampleRows: nonEmptyRows.slice(0, 180),
      greenCells: greenCells.slice(0, 300)
    };
  });
  reports.push({ file: name, size: data.byteLength, workbookSheets: workbook.SheetNames, sheets });
  console.log(`${name}: ${workbook.SheetNames.join(", ")}`);
}
await fs.writeFile("working/year-workbook-analysis.json", JSON.stringify(reports, null, 2), "utf8");
console.log("working/year-workbook-analysis.json");
