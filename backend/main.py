import json
import os
from datetime import datetime, date, timedelta

from dotenv import load_dotenv

# Load .env before anything reads env vars
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
load_dotenv()  # also try root .env

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from routes import letters, duplicates, properties, clients, report, req
from db import get_db
from utils.zone_mapper import assign_zone_and_rue, reload_zones

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
app.include_router(clients.router, prefix="/api", tags=["clients"])
app.include_router(report.router, prefix="/api", tags=["report"])
app.include_router(req.router, prefix="/api", tags=["req"])


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


@app.get("/api/prospects/search")
def search_prospects(q: str = ""):
    """Search prospects by name OR address (fuzzy), results in <2s.

    Used by Mobile Terrain Mode to quickly find a fiche at the counter.
    Phase 1: Supabase ilike (server-side, fast) for substring matches.
    Phase 2: Fuzzy fallback only if not enough substring hits.
    """
    from rapidfuzz import fuzz as rfuzz, process
    from utils.address_normalizer import normalize_address
    db = get_db()
    if not q or not q.strip():
        return []
    query = q.strip()
    query_lower = query.lower()

    # Phase 1: Server-side ilike search (fast — no full table scan in Python)
    pattern = f"%{query_lower}%"
    try:
        resp = db.table("prospects").select("*").or_(
            f"entreprise.ilike.{pattern},adresse.ilike.{pattern},contact.ilike.{pattern}"
        ).limit(20).execute()
        substring_hits = resp.data or []
    except Exception:
        substring_hits = []

    results = [{**p, "_score": 100.0} for p in substring_hits]

    # If we have enough results, skip fuzzy
    if len(results) >= 10:
        return results[:20]

    # Phase 2: Fuzzy fallback — fetch all and batch match
    query_norm = normalize_address(query)
    if not query_norm:
        return results[:20]

    all_prospects = (db.table("prospects").select("*").execute()).data or []
    existing_ids = {p["id"] for p in substring_hits}
    fuzzy_candidates = [p for p in all_prospects if p.get("id") not in existing_ids]

    if fuzzy_candidates:
        choices = []
        for p in fuzzy_candidates:
            combined = normalize_address(
                str(p.get("entreprise", "") or "") + " " + str(p.get("adresse", "") or "")
            )
            choices.append(combined)

        matches = process.extract(
            query_norm, choices, scorer=rfuzz.token_sort_ratio,
            score_cutoff=60, limit=20
        )
        for match, score, idx in matches:
            p = fuzzy_candidates[idx]
            results.append({**p, "_score": round(score, 1)})

    results.sort(key=lambda r: r.get("_score", 0), reverse=True)
    return results[:20]


@app.post("/api/prospects")
async def save_prospects(body: dict):
    """Save full prospect list (overwrite)."""
    db = get_db()
    prospects = body.get("prospects", [])
    # Clear existing and insert all
    db.table("prospects").delete().gte("id", 0).execute()
    if prospects:
        # Strip client-side ids so Supabase auto-generates them
        now = datetime.now().isoformat()
        clean = []
        for p in prospects:
            addr = str(p.get("adresse", "") or p.get("Adresse", "") or "")
            zone, rue = assign_zone_and_rue(addr)
            row = {k: v for k, v in p.items() if k not in ("id", "created_at", "updated_at")}
            row["updated_at"] = now
            row["zone"] = p.get("zone", "") or zone
            row["rue"] = p.get("rue", "") or rue
            clean.append(row)
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
        addr = str(row.get("Adresse", "") or "")
        zone, rue = assign_zone_and_rue(addr)
        to_insert.append({
            "entreprise": row.get("Nom_Syndicat", "") or row.get("Entreprise", ""),
            "contact": row.get("Nom_Gestionnaire", "") or row.get("Contact", ""),
            "telephone": row.get("Téléphone", "") or row.get("Telephone", "") or "",
            "statut": "À contacter",
            "date": str(row.get("Date", "") or ""),
            "notes": str(row.get("Notes", "") or ""),
            "adresse": addr,
            "ville": str(row.get("Ville_CodePostal", "") or ""),
            "nb_unites": str(row.get("Nb_Unites", "") or ""),
            "secteur": str(row.get("Secteur", "") or ""),
            "segment": str(row.get("Segment", "") or ""),
            "next_action": str(row.get("Prochaine_Action", "") or ""),
            "contacte": False,
            "date_contact": "",
            "zone": zone,
            "rue": rue,
            "updated_at": datetime.now().isoformat(),
        })
        existing_keys.add(key)

    if to_insert:
        db.table("prospects").insert(to_insert).execute()
        # Log with the actual addresses for traceable reports
        addrs = [p["adresse"] for p in to_insert if p.get("adresse")]
        shown = "; ".join(addrs[:15])
        more = f" (+{len(addrs) - 15} autres)" if len(addrs) > 15 else ""
        detail = f"{len(to_insert)} prospects ajoutés" + (f" — {shown}{more}" if addrs else "")
        try:
            db.table("activity_log").insert({
                "action": "prospects_imported",
                "detail": detail,
                "detail_count": len(to_insert),
            }).execute()
        except Exception:
            pass

    total = len(existing) + len(to_insert)
    return {"status": "ok", "added": len(to_insert), "total": total}


@app.post("/api/prospects/import-contacts")
async def import_contacts(file: UploadFile = File(...)):
    """Import decision-maker names from an Excel file.

    Expected columns (flexible naming):
    - Entreprise / Nom_Syndicat / Company — company name to match
    - Nom_Gestionnaire / Contact / Decisionnaire — decision-maker name to set
    - NEQ (optional) — exact match if present

    Fuzzy matches company name against existing prospects (reuses fuzzy_matcher).
    Updates the 'contact' field for matched prospects.
    """
    import io
    import pandas as pd
    from rapidfuzz import fuzz as rfuzz, process
    from utils.address_normalizer import normalize_address

    try:
        content = await file.read()
        df = pd.read_excel(io.BytesIO(content))
        cols = list(df.columns)

        # Find company name column (flexible)
        company_col = next((c for c in cols if c.strip().lower() in
                           ("entreprise", "nom_syndicat", "company", "nom", "raison_sociale")), None)
        if not company_col:
            company_col = next((c for c in cols if "entrep" in c.strip().lower() or "syndic" in c.strip().lower()
                               or "raison" in c.strip().lower() or "nom" in c.strip().lower()), cols[0])

        # Find contact name column (flexible)
        contact_col = next((c for c in cols if c.strip().lower() in
                           ("nom_gestionnaire", "contact", "decideur", "decisionnaire", "gestionnaire")), None)
        if not contact_col:
            contact_col = next((c for c in cols if "gestion" in c.strip().lower() or "contact" in c.strip().lower()
                               or "decid" in c.strip().lower()), None)
        if not contact_col:
            return JSONResponse(status_code=400,
                content={"error": f"Colonne nom de décideur introuvable. Colonnes détectées: {', '.join(cols)}"})

        # Optional NEQ column
        neq_col = next((c for c in cols if c.strip().lower() in ("neq", "numero_entreprise")), None)

        # Load existing prospects
        db = get_db()
        prospects = (db.table("prospects").select("*").execute()).data or []

        # Build lookup index
        prospect_names = [str(p.get("entreprise", "") or "") for p in prospects]
        prospect_norm = [normalize_address(n) for n in prospect_names]

        updated = 0
        skipped_existing = 0
        not_found = 0
        not_found_details = []
        updated_details = []

        for _, row in df.iterrows():
            company = str(row.get(company_col, "") or "").strip()
            contact_name = str(row.get(contact_col, "") or "").strip()
            if not company or not contact_name:
                continue

            # Try NEQ exact match first
            matched_p = None
            if neq_col:
                neq_val = str(row.get(neq_col, "") or "").strip()
                if neq_val:
                    matched_p = next((p for p in prospects if str(p.get("neq", "") or "").strip() == neq_val), None)

            # Fuzzy match on company name
            if not matched_p:
                query_norm = normalize_address(company)
                matches = process.extract(
                    query_norm, prospect_norm, scorer=rfuzz.token_sort_ratio,
                    score_cutoff=80, limit=1
                )
                if matches:
                    matched_p = prospects[matches[0][2]]

            if matched_p:
                # Skip if already has a contact name (don't overwrite)
                if str(matched_p.get("contact", "") or "").strip():
                    skipped_existing += 1
                    continue
                # Update contact field
                db.table("prospects").update({
                    "contact": contact_name,
                    "updated_at": datetime.now().isoformat(),
                }).eq("id", matched_p["id"]).execute()
                updated += 1
                updated_details.append(f"{company} → {contact_name}")
            else:
                not_found += 1
                not_found_details.append(company)

        # Log
        try:
            db.table("activity_log").insert({
                "action": "contacts_imported",
                "detail": f"{updated} noms de décideurs importés",
                "detail_count": updated,
            }).execute()
        except Exception:
            pass

        return {
            "status": "ok",
            "updated": updated,
            "skipped_existing": skipped_existing,
            "not_found": not_found,
            "updated_details": updated_details[:20],
            "not_found_details": not_found_details[:20],
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/prospects/quick-action")
async def quick_action(body: dict):
    """Handle quick actions on a prospect: visite_absent, visite_rencontre, retour_entrant.

    Updates the prospect in DB and logs to activity_log with the prospect id.
    """
    db = get_db()
    action_type = body.get("action", "")
    prospect_id = body.get("prospect_id")
    if not prospect_id or action_type not in ("visite_absent", "visite_rencontre", "retour_entrant"):
        return JSONResponse(status_code=400, content={"error": "Action ou prospect_id manquant"})

    today = datetime.now().date()
    updates = {}
    log_action = ""
    log_detail = ""

    if action_type == "visite_absent":
        na_date = (today + timedelta(days=3)).isoformat()
        # Fetch existing notes to append
        existing = db.table("prospects").select("notes").eq("id", prospect_id).execute()
        old_notes = (existing.data or [{}])[0].get("notes", "") if existing.data else ""
        updates = {
            "statut": "À repasser",
            "next_action": na_date,
            "contacte": True,
            "date_contact": today.isoformat(),
            "notes": str(old_notes) + (" | " if old_notes else "") + f"Visite absent {today.isoformat()}",
            "updated_at": datetime.now().isoformat(),
        }
        # Optional mini-form fields
        if body.get("nom"):
            updates["contact"] = body["nom"]
        if body.get("telephone"):
            updates["telephone"] = body["telephone"]
        if body.get("email"):
            updates["email"] = body["email"]
        log_action = "visite_absent"
        log_detail = f"Visite — absent (prospect #{prospect_id})"

    elif action_type == "visite_rencontre":
        updates = {
            "statut": "Contacté – à rappeler",
            "contacte": True,
            "date_contact": today.isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        if body.get("notes"):
            existing = db.table("prospects").select("notes").eq("id", prospect_id).execute()
            old_notes = (existing.data or [{}])[0].get("notes", "") if existing.data else ""
            updates["notes"] = str(old_notes) + (" | " if old_notes else "") + body["notes"]
        log_action = "visite_rencontre"
        log_detail = f"Visite — rencontré (prospect #{prospect_id})"

    elif action_type == "retour_entrant":
        na_date = (today + timedelta(days=1)).isoformat()
        existing = db.table("prospects").select("notes").eq("id", prospect_id).execute()
        old_notes = (existing.data or [{}])[0].get("notes", "") if existing.data else ""
        updates = {
            "statut": "Contacté – à rappeler",
            "next_action": na_date,
            "contacte": True,
            "date_contact": today.isoformat(),
            "notes": str(old_notes) + (" | " if old_notes else "") + f"Retour entrant {today.isoformat()}",
            "updated_at": datetime.now().isoformat(),
        }
        log_action = "retour_entrant"
        log_detail = f"Retour entrant (prospect #{prospect_id})"

    # Update prospect (handle missing email column gracefully)
    try:
        db.table("prospects").update(updates).eq("id", prospect_id).execute()
    except Exception:
        # Retry without email column if it doesn't exist yet
        updates.pop("email", None)
        db.table("prospects").update(updates).eq("id", prospect_id).execute()

    # Log to activity_log
    try:
        db.table("activity_log").insert({
            "action": log_action,
            "detail": log_detail,
            "detail_count": 1,
        }).execute()
    except Exception:
        pass

    return {"status": "ok", "action": log_action, "prospect_id": prospect_id}


@app.post("/api/zone/backfill")
def backfill_zones():
    """One-time backfill: assign zone and rue to all existing prospects."""
    db = get_db()
    prospects = (db.table("prospects").select("*").execute()).data or []
    updated = 0
    for p in prospects:
        addr = str(p.get("adresse", "") or "")
        if not addr:
            continue
        zone, rue = assign_zone_and_rue(addr)
        if zone != p.get("zone", "") or rue != p.get("rue", ""):
            db.table("prospects").update({"zone": zone, "rue": rue}).eq("id", p["id"]).execute()
            updated += 1
    return {"status": "ok", "total": len(prospects), "updated": updated}


@app.post("/api/zone/reload")
def reload_zone_config():
    """Reload zone mapping from JSON config (after user edits it)."""
    zones = reload_zones()
    return {"status": "ok", "zones": list(zones.keys())}


@app.get("/api/followups")
def get_followups():
    """Suivis dus aujourd'hui et en retard, pour le panneau « Aujourd'hui ».

    Two flows merged:
    1. Active-pipeline follow-ups (existing prospects with next_action ≤ today) — listed FIRST
    2. Anjou machine actions (visites J+8, appels J+3, 2e lettres J+21) — derived from notes
    """
    db = get_db()
    prospects = (db.table("prospects").select("*").execute()).data or []
    today = date.today().isoformat()
    inactive = ("Vendu / Signé", "Récupéré (signé)", "Hors d'affaires")

    # Flow 1: Active-pipeline follow-ups (next_action ≤ today)
    pipeline_due, pipeline_overdue = [], []
    for p in prospects:
        na = str(p.get("next_action") or "").strip()
        if not na or p.get("statut") in inactive:
            continue
        if na == today:
            pipeline_due.append(p)
        elif na < today:
            pipeline_overdue.append(p)
    pipeline_overdue.sort(key=lambda p: p.get("next_action", ""))
    pipeline_due.sort(key=lambda p: str(p.get("entreprise", "")))

    # Flow 2: Anjou machine actions — derived from notes patterns
    # Visite J+8: notes contain "Visite terrain — suivi lettre" and next_action ≤ today
    # Appel J+3: notes contain "Visite absent" and next_action ≤ today
    # 2e lettre J+21: notes contain "2e lettre si aucun retour" and next_action ≤ today
    machine_items = []
    pipeline_ids = {p["id"] for p in pipeline_due + pipeline_overdue}
    for p in prospects:
        if p.get("id") in pipeline_ids or p.get("statut") in inactive:
            continue
        na = str(p.get("next_action") or "").strip()
        if not na or na > today:
            continue
        notes = str(p.get("notes", "") or "").lower()
        if "visite terrain" in notes and "suivi lettre" in notes:
            machine_items.append({**p, "_machine_type": "Visite J+8", "_machine_label": "Visite terrain — suivi lettre"})
        elif "visite absent" in notes:
            machine_items.append({**p, "_machine_type": "Appel J+3", "_machine_label": "Appel — visite absent"})
        elif "2e lettre" in notes and "aucun retour" in notes:
            machine_items.append({**p, "_machine_type": "2e lettre J+21", "_machine_label": "2e lettre si aucun retour"})
    machine_items.sort(key=lambda p: p.get("next_action", ""))

    # Merge: pipeline overdue → pipeline due → machine actions
    overdue = pipeline_overdue
    due = pipeline_due + machine_items
    return {"today": today, "due": due, "overdue": overdue,
            "pipeline_count": len(pipeline_due) + len(pipeline_overdue),
            "machine_count": len(machine_items)}


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
    # Real pipeline count from the prospects table (not activity log sums)
    try:
        prospects_count = db.table("prospects").select("id", count="exact").execute().count or 0
    except Exception:
        prospects_count = 0
    return {
        "letters_today": letters_today,
        "prospects": prospects_count,
        "duplicates_removed": duplicates_removed,
        "properties_targeted": properties_targeted,
    }


@app.get("/api/cadence-anjou")
def get_cadence_anjou():
    """Cadence Anjou dashboard — computed from activity_log + prospects.

    Returns:
    - lettres_semaine: X / 40 (letters generated this week)
    - qualifiees_jour: X / 8 (new qualified companies today)
    - qualifiees_mois: X / 160 (new qualified companies this month)
    - taux_retour: retours entrants ÷ lettres envoyées (%)
    - couverture_anjou: X / 1500 (from Phase D completion logic)
    """
    db = get_db()
    entries = (db.table("activity_log").select("*").execute()).data or []
    today = date.today()
    today_iso = today.isoformat()
    # Week: Monday to today
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    month_start = today.replace(day=1).isoformat()

    # Lettres cette semaine (from letters_generated activity_log entries)
    lettres_semaine = sum(
        e.get("detail_count", 0) or (1 if e.get("detail_count") is None else 0)
        for e in entries
        if e.get("action") == "letters_generated"
        and (e.get("created_at", "") or "") >= week_start
    )

    # Retours entrants (from quick-action activity_log)
    retours_entrants = sum(
        1 for e in entries
        if e.get("action") == "retour_entrant"
    )

    # Total lettres envoyées (all time from activity_log)
    lettres_total = sum(
        e.get("detail_count", 0) or (1 if e.get("detail_count") is None else 0)
        for e in entries
        if e.get("action") == "letters_generated"
    )

    # Taux de retour
    taux_retour = round(retours_entrants / lettres_total * 100, 1) if lettres_total > 0 else 0.0

    # Nouvelles entreprises qualifiées (from req_postal_import activity_log)
    qualifiees_jour = sum(
        e.get("detail_count", 0) or 0
        for e in entries
        if e.get("action") == "req_postal_import"
        and (e.get("created_at", "") or "").startswith(today_iso)
    )
    qualifiees_mois = sum(
        e.get("detail_count", 0) or 0
        for e in entries
        if e.get("action") == "req_postal_import"
        and (e.get("created_at", "") or "") >= month_start
    )

    # Couverture Anjou (from Phase D completion logic)
    prospects = (db.table("prospects").select("*").execute()).data or []
    LETTER_SENT_STATUSES = {
        "Courriel envoyé", "Contacté – à rappeler", "Contacté – intéressé", "Rentre prévue",
        "En attente (rapport/réponse)", "Soumission envoyée", "Soumission révisée",
        "En fermeture", "Vendu / Signé", "Récupéré (signé)", "À repasser",
        "Perdu (revisiter année suivante)", "Hors d'affaires",
    }
    VISITED_STATUSES = {
        "À repasser", "Contacté – à rappeler", "Contacté – intéressé", "Rentre prévue",
        "Soumission envoyée", "Soumission révisée", "En fermeture",
        "Vendu / Signé", "Récupéré (signé)",
    }

    def _has_lettre(p):
        return p.get("statut") in LETTER_SENT_STATUSES or "lettre" in str(p.get("notes", "") or "").lower()

    def _is_completed(p):
        if not _has_lettre(p):
            return False
        s = p.get("statut") or ""
        if s in VISITED_STATUSES or s in ("Perdu (revisiter année suivante)", "Hors d'affaires"):
            return True
        if s == "Courriel envoyé":
            na = p.get("next_action") or ""
            return not na or na <= today_iso
        return False

    couverture_traite = sum(1 for p in prospects if _is_completed(p))
    COUVERTURE_OBJECTIF = 1500

    return {
        "lettres_semaine": lettres_semaine,
        "lettres_semaine_obj": 40,
        "qualifiees_jour": qualifiees_jour,
        "qualifiees_jour_obj": 8,
        "qualifiees_mois": qualifiees_mois,
        "qualifiees_mois_obj": 160,
        "taux_retour": taux_retour,
        "retours_entrants": retours_entrants,
        "lettres_total": lettres_total,
        "couverture_traite": couverture_traite,
        "couverture_obj": COUVERTURE_OBJECTIF,
    }
