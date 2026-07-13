import io
import json
import zipfile
from datetime import datetime, timedelta

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse

from utils.letter_generator import generate_letter
from db import get_db

router = APIRouter()


def _auto_followup(prospects, mode):
    """When mode is 'postal', auto-set next_action on matching prospects in DB.

    Industriel/Commercial → today + 8 days, label "Visite terrain — suivi lettre"
    Syndicat/Locatif     → today + 21 days, label "2e lettre si aucun retour"
    """
    if mode != "postal":
        return
    db = get_db()
    today = datetime.now().date()
    for p in prospects:
        addr = str(p.get("Adresse", "") or "").strip()
        if not addr:
            continue
        segment = str(p.get("Segment", "") or "").lower()
        if "industriel" in segment or "commercial" in segment:
            na_date = (today + timedelta(days=8)).isoformat()
            label = "Visite terrain — suivi lettre"
        elif "syndicat" in segment or "locatif" in segment:
            na_date = (today + timedelta(days=21)).isoformat()
            label = "2e lettre si aucun retour"
        else:
            continue
        # Match prospect by adresse in DB
        try:
            matches = db.table("prospects").select("id,next_action").ilike("adresse", addr).execute()
            for m in (matches.data or []):
                db.table("prospects").update({
                    "next_action": na_date,
                    "notes": str(m.get("notes", "") or "") + (" | " if m.get("notes") else "") + label + " " + datetime.now().strftime("%Y-%m-%d"),
                }).eq("id", m["id"]).execute()
        except Exception:
            pass


def _addresses_detail(prospects, prefix):
    """Build an activity detail string that lists the actual addresses."""
    addrs = []
    for p in prospects:
        a = str(p.get("Adresse", "") or "").strip()
        if a:
            addrs.append(a)
    if not addrs:
        return prefix
    shown = "; ".join(addrs[:15])
    more = f" (+{len(addrs) - 15} autres)" if len(addrs) > 15 else ""
    return f"{prefix} — {shown}{more}"


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
            "detail": _addresses_detail(prospects, f"{len(prospects)} lettres générées"),
            "detail_count": len(prospects),
        }).execute()
    except Exception:
        pass

    # Auto-set follow-up actions on matching prospects
    _auto_followup(prospects, settings_dict.get("mode", "postal"))

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


@router.post("/generate-letters-json")
async def generate_letters_json(body: dict):
    """Generate letters from JSON rows (e.g. from Croisement REQ)."""
    settings_dict = body.get("settings", {})
    rows = body.get("rows", [])
    if not rows:
        return JSONResponse(status_code=400, content={"error": "Aucune ligne fournie"})

    prospects = rows

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

    try:
        db = get_db()
        db.table("activity_log").insert({
            "action": "letters_generated",
            "detail": _addresses_detail(prospects, f"{len(prospects)} lettres générées (depuis Croisement REQ)"),
            "detail_count": len(prospects),
        }).execute()
    except Exception:
        pass

    # Auto-set follow-up actions on matching prospects
    _auto_followup(prospects, settings_dict.get("mode", "postal"))

    filename = f"lettres_guardx_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
