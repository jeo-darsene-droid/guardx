import io
import json
import zipfile
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse

from utils.letter_generator import generate_letter
from db import get_db

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

    # Log activity to Supabase
    try:
        db = get_db()
        db.table("activity_log").insert({
            "action": "letters_generated",
            "detail": f"{len(prospects)} lettres générées",
            "detail_count": len(prospects),
        }).execute()
    except Exception:
        pass

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
