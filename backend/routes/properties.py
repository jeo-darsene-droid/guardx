import io
import json
import os
import re
import traceback
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse

router = APIRouter()


@router.post("/filter-properties")
async def filter_properties(
    file: UploadFile = File(...),
    min_units: int = Form(8),
    max_units: int = Form(24),
    search_term: str = Form(""),
    year_min: str = Form(""),
    year_max: str = Form(""),
    condo_only: str = Form("true"),
):
    try:
        content = await file.read()
        # Montreal CSV files often use Latin-1 encoding; try multiple
        bio = io.BytesIO(content)
        encodings = ["utf-8", "latin-1", "cp1252"]
        df = None
        for enc in encodings:
            try:
                bio.seek(0)
                # Try comma separator first
                df = pd.read_csv(bio, low_memory=False, encoding=enc, sep=",")
                if len(df.columns) <= 1:
                    # Maybe semicolon-separated
                    bio.seek(0)
                    df = pd.read_csv(bio, low_memory=False, encoding=enc, sep=";")
                break
            except UnicodeDecodeError:
                continue
        if df is None:
            return JSONResponse(status_code=400, content={"error": "Impossible de lire le fichier CSV. Vérifiez l'encodage."})
        df = df.fillna("")

        # Determine column names (case-insensitive fallback)
        def find_col(df, candidates):
            lower_map = {c.lower(): c for c in df.columns}
            for c in candidates:
                if c.lower() in lower_map:
                    return lower_map[c.lower()]
            return None

        col_units = find_col(df, ["NOMBRE_LOGEMENT", "NB_LOGEMENT", "NOMBRE_LOGEMENTS"])
        col_rue = find_col(df, ["NOM_RUE", "RUE", "NOM_VOIE"])
        col_muni = find_col(df, ["MUNICIPALITE", "ARRONDISSEMENT", "VILLE"])
        col_cat = find_col(df, ["CATEGORIE_UEF", "CATEGORIE"])
        col_util = find_col(df, ["CODE_UTILISATION", "CUBF"])
        col_year = find_col(df, ["ANNEE_CONSTRUCTION", "YEAR_BUILT", "ANNEE"])
        col_addr = find_col(df, ["ADRESSE", "CIVIC", "NUMERO_CIVIQUE"])
        col_civic = find_col(df, ["CIVIQUE_DEBUT", "CIVIQUE_FIN", "NO_CIVIQUE", "NUMERO_CIVIQUE", "NO_CIVIC", "CIVIC_NUMBER", "CIVIQUE"])
        col_arrond = find_col(df, ["NO_ARROND_ILE_CUM", "ARRONDISSEMENT_CODE", "CODE_ARROND"])

        # Montreal arrondissement code -> name mapping
        arrond_map = {
            "rem05": "côte-des-neiges—notre-dame-de-grâce",
            "rem06": "côte-des-neiges—notre-dame-de-grâce",
            "rem09": "ahuntsic-cartierville",
            "rem12": "le plateau-mont-royal",
            "rem13": "le sud-ouest",
            "rem14": "le sud-ouest",
            "rem15": "ville-marie",
            "rem16": "ville-marie",
            "rem17": "mercier—hochelaga-maisonneuve",
            "rem19": "mercier—hochelaga-maisonneuve",
            "rem20": "rosemont—la petite-patrie",
            "rem21": "outremont",
            "rem22": "villeray—saint-michel—parc-extension",
            "rem23": "villeray—saint-michel—parc-extension",
            "rem24": "villeray—saint-michel—parc-extension",
            "rem25": "ahunsic-cartierville",
            "rem27": "saint-laurent",
            "rem31": "saint-leonard",
            "rem32": "montréal-nord",
            "rem33": "anjou",
            "rem34": "rivière-des-prairies—pointe-aux-trembles",
            "rem99": "autre",
        }
        # Also map the (XXX) suffixes in NOM_RUE to arrondissement names
        suffix_map = {
            "(anj)": "anjou",
            "(mtl)": "montréal",
            "(mtln)": "montréal-nord",
            "(pat)": "pointe-aux-trembles",
            "(rdp)": "rivière-des-prairies",
            "(slo)": "saint-laurent",
            "(sle)": "saint-léonard",
            "(cdn)": "côte-des-neiges",
            "(ndg)": "notre-dame-de-grâce",
            "(out)": "outremont",
            "(vma)": "ville-marie",
            "(plt)": "plateau",
            "(rpr)": "rosemont",
            "(mhm)": "mercier",
            "(hma)": "hochelaga-maisonneuve",
            "(vsp)": "villeray",
            "(smp)": "saint-michel",
            "(pex)": "parc-extension",
            "(swt)": "sud-ouest",
            "(ahs)": "ahuntsic",
            "(car)": "cartierville",
            "(ppp)": "petite-patrie",
        }

        # Filter by units
        if col_units:
            df[col_units] = pd.to_numeric(df[col_units], errors="coerce")
            df = df[(df[col_units] >= min_units) & (df[col_units] <= max_units)]

        # Filter by search term
        if search_term.strip():
            term = search_term.strip().lower()
            mask = pd.Series([False] * len(df))
            if col_rue:
                mask = mask | df[col_rue].astype(str).str.lower().str.contains(term, na=False)
            if col_muni:
                mask = mask | df[col_muni].astype(str).str.lower().str.contains(term, na=False)
            if col_arrond:
                # Match against the REM code directly, and also against the mapped arrondissement name
                arrond_series = df[col_arrond].astype(str).str.lower()
                mask = mask | arrond_series.str.contains(term, na=False)
                # Also check if search term matches an arrondissement name in the map
                for code, name in arrond_map.items():
                    if term in name:
                        mask = mask | arrond_series.str.contains(code, na=False)
                # Also extract (XXX) suffix from NOM_RUE and match against suffix_map
                if col_rue:
                    rue_lower = df[col_rue].astype(str).str.lower()
                    for suffix, name in suffix_map.items():
                        if term in name:
                            mask = mask | rue_lower.str.contains(suffix.replace("(", r"\(").replace(")", r"\)"), na=False, regex=True)
            df = df[mask]

        # Filter by category (Condominium) — only if checkbox is ticked
        if col_cat and condo_only.lower() in ("true", "1", "yes"):
            df = df[df[col_cat].astype(str).str.lower().str.contains("condominium", na=False)]

        # Filter by year
        if col_year and year_min:
            df[col_year] = pd.to_numeric(df[col_year], errors="coerce")
            df = df[df[col_year] >= int(year_min)]
        if col_year and year_max:
            df[col_year] = pd.to_numeric(df[col_year], errors="coerce")
            df = df[df[col_year] <= int(year_max)]

        # Build output rows formatted for prospect template
        results = []
        for _, row in df.iterrows():
            civic = ""
            if col_civic:
                civic_raw = row.get(col_civic, "")
                if pd.notna(civic_raw) and str(civic_raw).strip() not in ("", "0", "0.0"):
                    try:
                        civic = str(int(float(civic_raw)))
                    except (ValueError, TypeError):
                        civic = str(civic_raw).strip()

            addr_parts = []
            if civic:
                addr_parts.append(civic)
            if col_addr:
                av = str(row.get(col_addr, "")).strip()
                if av and av != "0":
                    addr_parts.append(av)
            if col_rue:
                rv = str(row.get(col_rue, "")).strip()
                if rv and rv != "0":
                    addr_parts.append(rv)
            address = " ".join([p for p in addr_parts if p])

            muni = str(row.get(col_muni, "")) if col_muni else ""
            nb_val = row.get(col_units, 0) if col_units else 0
            nb = int(nb_val) if pd.notna(nb_val) else 0
            year_val = row.get(col_year, "") if col_year else ""
            year = int(year_val) if pd.notna(year_val) and year_val != "" else ""
            cat = str(row.get(col_cat, "")) if col_cat else ""

            # Determine arrondissement name from NO_ARROND_ILE_CUM code
            secteur_name = ""
            if col_arrond:
                arrond_val = str(row.get(col_arrond, "")).strip().lower()
                secteur_name = arrond_map.get(arrond_val, "")
            # Fallback: extract (XXX) suffix from NOM_RUE
            if not secteur_name and col_rue:
                rue_val = str(row.get(col_rue, ""))
                m = re.search(r'\(([A-Z]{2,5})\)', rue_val)
                if m:
                    suffix = m.group(0).lower()
                    secteur_name = suffix_map.get(suffix, "")

            results.append({
                "Nom_Gestionnaire": "",
                "Nom_Syndicat": "",
                "Civic": civic,
                "Adresse": address,
                "Ville_CodePostal": secteur_name or muni,
                "Nb_Unites": nb,
                "Secteur": secteur_name or muni,
                "Notes": "",
            })

        # Log activity
        log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "activity_log.json")
        entries = []
        if os.path.exists(log_path):
            with open(log_path, "r", encoding="utf-8") as f:
                entries = json.load(f)
        entries.insert(0, {
            "action": "properties_filtered",
            "detail": f"{len(results)} propriétés trouvées",
            "detail_count": len(results),
            "timestamp": datetime.now().isoformat(),
        })
        entries = entries[:50]
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)

        return {
            "count": len(results),
            "rows": results,
            "all_rows": results,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "traceback": traceback.format_exc()})


@router.post("/export-properties")
async def export_properties(data: dict):
    """Export filtered properties to prospects-ready Excel."""
    rows = data.get("rows", [])
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    buf.seek(0)
    filename = f"prospects_coproprietes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
