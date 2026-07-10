from __future__ import annotations

import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(t.text or "" for t in si.findall(".//x:t", NS)) for si in root.findall("x:si", NS)]


def cell_value(cell: ET.Element, shared: list[str]):
    value = cell.findtext("x:v", default="", namespaces=NS)
    cell_type = cell.attrib.get("t")
    if cell_type == "s" and value:
        try:
            return shared[int(value)]
        except (ValueError, IndexError):
            return value
    if cell_type == "inlineStr":
        return "".join(t.text or "" for t in cell.findall(".//x:t", NS))
    if cell_type == "b":
        return value == "1"
    return value


def inspect(path: Path):
    with zipfile.ZipFile(path) as zf:
        shared = shared_strings(zf)
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        targets = {r.attrib["Id"]: r.attrib["Target"] for r in rels.findall("r:Relationship", REL_NS)}
        result = {"file": path.name, "size": path.stat().st_size, "sheets": [], "definedNames": {}}
        for name in workbook.findall(".//x:definedName", NS):
            result["definedNames"][name.attrib.get("name", "")] = name.text or ""
        for sheet in workbook.findall(".//x:sheet", NS):
            target = targets[sheet.attrib[RID]].lstrip("/")
            if not target.startswith("xl/"):
                target = "xl/" + target
            counts = Counter()
            rows = []
            dimension = None
            with zf.open(target) as stream:
                for event, elem in ET.iterparse(stream, events=("end",)):
                    tag = elem.tag.rsplit("}", 1)[-1]
                    if tag == "dimension":
                        dimension = elem.attrib.get("ref")
                    elif tag == "c":
                        counts["cells"] += 1
                        if elem.find("x:f", NS) is not None:
                            counts["formulas"] += 1
                    elif tag == "row":
                        row_values = {}
                        formulas = {}
                        for cell in elem.findall("x:c", NS):
                            ref = cell.attrib.get("r", "")
                            value = cell_value(cell, shared)
                            formula = cell.findtext("x:f", default="", namespaces=NS)
                            if value not in (None, ""):
                                row_values[ref] = value
                            if formula:
                                formulas[ref] = formula
                        if row_values:
                            counts["rowsWithValues"] += 1
                            if len(rows) < 250:
                                rows.append({"row": elem.attrib.get("r"), "values": row_values, "formulas": formulas})
                        elem.clear()
            result["sheets"].append({
                "name": sheet.attrib["name"],
                "target": target,
                "dimension": dimension,
                "counts": dict(counts),
                "nonEmptyRows": rows,
            })
        return result


paths = [Path(p) for p in sys.argv[1:]]
report = [inspect(path) for path in paths]
output = Path("working/ooxml-analysis.json")
output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps([
    {"file": item["file"], "sheets": [{"name": s["name"], "dimension": s["dimension"], **s["counts"]} for s in item["sheets"]]}
    for item in report
], indent=2, ensure_ascii=False))
