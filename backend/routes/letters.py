import io
import json
import zipfile
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse

from utils.letter_generator import generate_letter

router = APIRouter()


@router.post("/generate-letters")
async def generate_letters(
    file: UploadFile = File(...),
    settings: str = Form(...),
):
    settings_dict = json.loads(settings)
    df = pd.read_excel(io.BytesIO(await file.read()))

    # Build prospect list
    prospects = df.fillna("").to_dict(orient="records")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, prospect in enumerate(prospects):
            docx_bytes = generate_letter(prospect, settings_dict)
            gestionnaire = str(prospect.get("Nom_Gestionnaire", "")).strip()
            syndicat = str(prospect.get("Nom_Syndicat", "")).strip()
            if syndicat:
                safe_name = syndicat.replace(" ", "_").replace("/", "-")[:50]
            elif gestionnaire:
                safe_name = gestionnaire.replace(" ", "_").replace("/", "-")[:50]
            else:
                safe_name = f"prospect_{i+1}"
            zf.writestr(f"Lettre_{safe_name}.docx", docx_bytes)

    buf.seek(0)

    # Log activity
    import os
    # We'll log via internal call — simpler to write directly
    log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "activity_log.json")
    entries = []
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8") as f:
            entries = json.load(f)
    entries.insert(0, {
        "action": "letters_generated",
        "detail": f"{len(prospects)} lettres générées",
        "detail_count": len(prospects),
        "timestamp": datetime.now().isoformat(),
    })
    entries = entries[:50]
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    filename = f"lettres_guardx_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/preview-excel")
async def preview_excel(file: UploadFile = File(...)):
    """Return first 5 rows as JSON for preview."""
    df = pd.read_excel(io.BytesIO(await file.read()))
    df = df.fillna("")
    columns = list(df.columns)
    rows = df.head(5).to_dict(orient="records")
    return {"columns": columns, "rows": rows, "total_rows": len(df)}
