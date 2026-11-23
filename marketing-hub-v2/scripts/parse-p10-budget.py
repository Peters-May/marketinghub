"""Parse P10 Marketing breakdown xlsx into hub budget JSON."""
from __future__ import annotations

import json
import re
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

XLSX = Path(
    r"C:\Users\Sophie.Edgerley\Downloads\P10 - Marketing breakdown - October 1.xlsx"
)
OUT = Path(__file__).resolve().parents[1] / "src" / "lib" / "budget" / "p10-marketing-2026.json"


def parse_amount(value) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    text = re.sub(r"[^0-9.-]", "", str(value)).strip()
    if not text:
        return None
    try:
        return round(float(text), 2)
    except ValueError:
        return None


def to_iso(value) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return None


def should_skip(code: str, job: str) -> bool:
    job_l = (job or "").lower()
    if re.match(r"^credit card$", code or "", re.I):
        return True
    if re.search(r"accrual|accural|month end journal", job_l):
        return True
    if re.match(r"^mp3$", code or "", re.I):
        return True
    return False


def main() -> None:
    wb = load_workbook(XLSX, data_only=True)
    ws = wb["Marketing"]
    items = []

    for row in range(8, (ws.max_row or 0) + 1):
        typ = ws.cell(row, 2).value
        paid = ws.cell(row, 3).value
        code_raw = ws.cell(row, 9).value
        job_raw = ws.cell(row, 10).value
        period_raw = ws.cell(row, 13).value
        amount = parse_amount(ws.cell(row, 17).value)

        if amount is None or amount == 0:
            continue
        if typ is None and paid is None and not code_raw:
            continue

        code = str(code_raw).strip() if code_raw is not None else ""
        job = str(job_raw).strip() if job_raw is not None else ""
        period = str(period_raw).strip() if period_raw is not None else ""
        if not code or should_skip(code, job):
            continue

        items.append(
            {
                "paid_at": to_iso(paid),
                "code": code,
                "job": job,
                "period": period,
                "amount": amount,
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(items, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(items)} rows to {OUT}")


if __name__ == "__main__":
    main()
