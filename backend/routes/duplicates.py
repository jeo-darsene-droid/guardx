import io
import json
import os
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse

from utils.fuzzy_matcher import match_score

router = APIRouter()


@router.post("/check-duplicates")
async def check_duplicates(
    prospects_file: UploadFile = File(...),
    clients_file: UploadFile = File(...),
    threshold: int = Form(85),
    prospect_col: str = Form("Adresse"),
    client_col: str = Form("Adresse"),
):
    # Read files
    pros_data = await prospects_file.read()
    cli_data = await clients_file.read()

    # Try Excel first, then CSV
    try:
        pros_df = pd.read_excel(io.BytesIO(pros_data))
    except Exception:
        pros_df = pd.read_csv(io.BytesIO(pros_data))

    try:
        cli_df = pd.read_excel(io.BytesIO(cli_data))
    except Exception:
        cli_df = pd.read_csv(io.BytesIO(cli_data))

    pros_df = pros_df.fillna("")
    cli_df = cli_df.fillna("")

    client_addresses = cli_df[client_col].astype(str).tolist()

    clean_rows = []
    duplicate_rows = []
    uncertain_rows = []

    for _, row in pros_df.iterrows():
        addr = str(row.get(prospect_col, ""))
        best_score = 0.0
        best_match = None
        for ca in client_addresses:
            score = match_score(addr, ca)
            if score > best_score:
                best_score = score
                best_match = ca

        row_dict = row.to_dict()
        row_dict["match_score"] = round(best_score, 1)
        row_dict["matched_address"] = best_match or ""

        if best_score >= threshold:
            duplicate_rows.append(row_dict)
        elif best_score >= 50:
            uncertain_rows.append(row_dict)
        else:
            clean_rows.append(row_dict)

    # Log activity
    log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "activity_log.json")
    entries = []
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8") as f:
            entries = json.load(f)
    entries.insert(0, {
        "action": "duplicates_checked",
        "detail": f"{len(duplicate_rows)} doublons trouvés sur {len(pros_df)}",
        "detail_count": len(duplicate_rows),
        "timestamp": datetime.now().isoformat(),
    })
    entries = entries[:50]
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    return {
        "total": len(pros_df),
        "duplicates": len(duplicate_rows),
        "clean": len(clean_rows),
        "uncertain": len(uncertain_rows),
        "clean_rows": clean_rows,
        "duplicate_rows": duplicate_rows,
        "uncertain_rows": uncertain_rows,
    }


@router.post("/export-excel")
async def export_excel(data: dict):
    """Export rows to Excel. Receives JSON with rows and sheet name."""
    rows = data.get("rows", [])
    sheet_name = data.get("sheet_name", "Export")
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    buf.seek(0)
    filename = f"{sheet_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
