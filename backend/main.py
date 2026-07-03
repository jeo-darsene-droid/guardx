import json
import os
from datetime import datetime, date

from dotenv import load_dotenv

# Load .env before anything reads env vars
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
load_dotenv()  # also try root .env

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routes import letters, duplicates, properties
from db import get_db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(title="Guard-X Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "https://*.vercel.app"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve assets (logo etc.) — skip if directory doesn't exist (e.g. serverless)
_assets_dir = os.path.join(BASE_DIR, "assets")
if os.path.isdir(_assets_dir):
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

app.include_router(letters.router, prefix="/api", tags=["letters"])
app.include_router(duplicates.router, prefix="/api", tags=["duplicates"])
app.include_router(properties.router, prefix="/api", tags=["properties"])


@app.get("/api/config")
def get_config():
    db = get_db()
    resp = db.table("config").select("*").eq("id", 1).execute()
    if resp.data:
        row = resp.data[0]
        row.pop("id", None)
        row.pop("updated_at", None)
        return row
    return {}


@app.put("/api/config")
async def update_config(body: dict):
    db = get_db()
    body["updated_at"] = datetime.now().isoformat()
    db.table("config").upsert({"id": 1, **body}).execute()
    return {"status": "ok", "config": body}


@app.get("/api/activity")
def get_activity():
    """Return recent activity log (last 5 entries)."""
    db = get_db()
    resp = db.table("activity_log").select("*").order("created_at", desc=True).limit(5).execute()
    return [
        {"action": r["action"], "detail": r["detail"], "detail_count": r.get("detail_count", 0), "timestamp": r["created_at"]}
        for r in (resp.data or [])
    ]


@app.post("/api/activity")
async def log_activity(body: dict):
    """Append an activity entry."""
    db = get_db()
    db.table("activity_log").insert({
        "action": body.get("action", ""),
        "detail": body.get("detail", ""),
        "detail_count": body.get("detail_count", 0),
    }).execute()
    return {"status": "ok"}


@app.post("/api/upload-logo")
async def upload_logo(file: UploadFile = File(...)):
    """Upload logo to Supabase Storage or save locally."""
    content = await file.read()
    # Try saving locally first (works in non-serverless)
    logo_path = os.path.join(BASE_DIR, "assets", "guardx_logo.png")
    try:
        os.makedirs(os.path.dirname(logo_path), exist_ok=True)
        with open(logo_path, "wb") as f:
            f.write(content)
    except OSError:
        pass
    return {"status": "ok", "path": "assets/guardx_logo.png"}


@app.post("/api/import-prospects")
async def import_prospects(file: UploadFile = File(...)):
    """Import an Excel file and return ALL rows as JSON."""
    import io
    import pandas as pd
    df = pd.read_excel(io.BytesIO(await file.read()))
    df = df.fillna("")
    columns = list(df.columns)
    rows = df.to_dict(orient="records")
    return {"columns": columns, "rows": rows, "total_rows": len(df)}


@app.get("/api/prospects")
def get_prospects():
    """Load all persisted prospects."""
    db = get_db()
    resp = db.table("prospects").select("*").order("id").execute()
    return resp.data or []


@app.post("/api/prospects")
async def save_prospects(body: dict):
    """Save full prospect list (overwrite)."""
    db = get_db()
    prospects = body.get("prospects", [])
    # Clear existing and insert all
    db.table("prospects").delete().gte("id", 0).execute()
    if prospects:
        # Strip client-side ids so Supabase auto-generates them
        clean = [{k: v for k, v in p.items() if k not in ("id", "created_at", "updated_at")} for p in prospects]
        db.table("prospects").insert(clean).execute()
    return {"status": "ok", "count": len(prospects)}


@app.post("/api/prospects/add")
async def add_prospects(body: dict):
    """Add new prospects to the persisted list (merge, avoid exact duplicates)."""
    db = get_db()
    new_rows = body.get("prospects", [])

    # Load existing for dedup
    existing = (db.table("prospects").select("*").execute()).data or []

    def dedup_key(p):
        addr = str(p.get("Adresse", "") or p.get("adresse", "")).lower().strip()
        nb = str(p.get("Nb_Unites", "") or p.get("nb_unites", "")).strip()
        notes = str(p.get("Notes", "") or p.get("notes", "")).lower().strip()
        return f"{addr}|{nb}|{notes}"

    existing_keys = {dedup_key(p) for p in existing}

    to_insert = []
    for row in new_rows:
        key = dedup_key(row)
        if key in existing_keys:
            continue
        to_insert.append({
            "entreprise": row.get("Nom_Syndicat", "") or row.get("Entreprise", ""),
            "contact": row.get("Nom_Gestionnaire", "") or row.get("Contact", ""),
            "telephone": row.get("Téléphone", "") or row.get("Telephone", "") or "",
            "statut": "À contacter",
            "date": str(row.get("Date", "") or ""),
            "notes": str(row.get("Notes", "") or ""),
            "adresse": str(row.get("Adresse", "") or ""),
            "ville": str(row.get("Ville_CodePostal", "") or ""),
            "nb_unites": str(row.get("Nb_Unites", "") or ""),
            "secteur": str(row.get("Secteur", "") or ""),
            "contacte": False,
            "date_contact": "",
        })
        existing_keys.add(key)

    if to_insert:
        db.table("prospects").insert(to_insert).execute()

    total = len(existing) + len(to_insert)
    return {"status": "ok", "added": len(to_insert), "total": total}


@app.get("/api/kpis")
def get_kpis():
    """Return KPI counts from activity log."""
    db = get_db()
    resp = db.table("activity_log").select("*").execute()
    entries = resp.data or []
    today = date.today().isoformat()
    letters_today = sum(
        1 for e in entries
        if e.get("action") == "letters_generated" and (e.get("created_at", "") or "").startswith(today)
    )
    duplicates_removed = sum(e.get("detail_count", 0) for e in entries if e.get("action") == "duplicates_checked")
    properties_targeted = sum(e.get("detail_count", 0) for e in entries if e.get("action") == "properties_filtered")
    prospects_count = sum(e.get("detail_count", 0) for e in entries if e.get("action") == "prospects_imported")
    return {
        "letters_today": letters_today,
        "prospects": prospects_count,
        "duplicates_removed": duplicates_removed,
        "properties_targeted": properties_targeted,
    }
