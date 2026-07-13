import io
import json
import os
import re
import traceback
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse

from db import get_db

router = APIRouter()

CHUNK_SIZE = 50000


def _detect_encoding_and_sep(content: bytes):
    """Read first 64KB to detect encoding and separator without loading full file."""
    sample = content[:65536]
    encodings = ["utf-8", "latin-1", "cp1252"]
    for enc in encodings:
        try:
            bio = io.BytesIO(sample)
            df = pd.read_csv(bio, encoding=enc, sep=",", nrows=5)
            if len(df.columns) <= 1:
                bio.seek(0)
                df = pd.read_csv(bio, encoding=enc, sep=";", nrows=5)
                return enc, ";"
            return enc, ","
        except UnicodeDecodeError:
            continue
    return None, None


def _find_col(columns, candidates):
    lower_map = {c.lower(): c for c in columns}
    for c in candidates:
        if c.lower() in lower_map:
            return lower_map[c.lower()]
    return None


def _filter_chunk(df, cols, min_units, max_units, search_term, year_min, year_max,
                  condo_only, util_filter, arrond_map, suffix_map):
    """Apply all filters to a single chunk DataFrame. Return filtered DataFrame."""
    df = df.fillna("")

    col_units = cols["units"]
    col_rue = cols["rue"]
    col_muni = cols["muni"]
    col_cat = cols["cat"]
    col_util = cols["util"]
    col_year = cols["year"]
    col_arrond = cols["arrond"]

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
            arrond_series = df[col_arrond].astype(str).str.lower()
            mask = mask | arrond_series.str.contains(term, na=False)
            for code, name in arrond_map.items():
                if term in name:
                    mask = mask | arrond_series.str.contains(code, na=False)
            if col_rue:
                rue_lower = df[col_rue].astype(str).str.lower()
                for suffix, name in suffix_map.items():
                    if term in name:
                        mask = mask | rue_lower.str.contains(
                            suffix.replace("(", r"\(").replace(")", r"\)"),
                            na=False, regex=True,
                        )
        df = df[mask]

    # Filter by category (Condominium)
    if col_cat and condo_only.lower() in ("true", "1", "yes"):
        df = df[df[col_cat].astype(str).str.lower().str.contains("condominium", na=False)]

    # Filter by utilisation code
    if col_util and util_filter.strip():
        util_terms = [t.strip().lower() for t in util_filter.split(",") if t.strip()]
        mask = pd.Series([False] * len(df))
        util_series = df[col_util].astype(str).str.lower()
        for ut in util_terms:
            mask = mask | util_series.str.contains(ut, na=False)
        df = df[mask]

    # Filter by year
    if col_year and year_min:
        df[col_year] = pd.to_numeric(df[col_year], errors="coerce")
        df = df[df[col_year] >= int(year_min)]
    if col_year and year_max:
        df[col_year] = pd.to_numeric(df[col_year], errors="coerce")
        df = df[df[col_year] <= int(year_max)]

    return df


def _clean_civic(raw):
    """Normalize a civic number cell to a clean string ("97", not "97.0")."""
    if pd.isna(raw) or str(raw).strip() in ("", "0", "0.0"):
        return ""
    try:
        return str(int(float(raw)))
    except (ValueError, TypeError):
        return str(raw).strip()


def _build_rows(df, cols, arrond_map, suffix_map):
    """Convert filtered chunk DataFrame to output dicts."""
    col_civic = cols["civic"]
    col_civic_fin = cols["civic_fin"]
    col_addr = cols["addr"]
    col_rue = cols["rue"]
    col_muni = cols["muni"]
    col_units = cols["units"]
    col_year = cols["year"]
    col_arrond = cols["arrond"]
    col_util = cols["util"]

    rows = []
    for _, row in df.iterrows():
        civic = _clean_civic(row.get(col_civic, "")) if col_civic else ""

        # Civic range: "97-99" when CIVIQUE_FIN differs from CIVIQUE_DEBUT
        if civic and col_civic_fin and col_civic_fin != col_civic:
            civic_fin = _clean_civic(row.get(col_civic_fin, ""))
            if civic_fin and civic_fin != civic:
                civic = f"{civic}-{civic_fin}"

        addr_parts = []
        if civic:
            addr_parts.append(civic)
        if col_addr:
            av = str(row.get(col_addr, "")).strip()
            if av and av != "0":
                addr_parts.append(av)
        if col_rue:
            rv = str(row.get(col_rue, "")).strip()
            # Strip borough suffix like "(MTL)" from the street name
            rv = re.sub(r'\s*\([A-Z]{2,5}\)\s*$', '', rv).strip()
            if rv and rv != "0":
                addr_parts.append(rv)
        address = " ".join([p for p in addr_parts if p])

        muni = str(row.get(col_muni, "")) if col_muni else ""
        nb_val = row.get(col_units, 0) if col_units else 0
        nb = int(nb_val) if pd.notna(nb_val) else 0
        util_val = str(row.get(col_util, "")).strip() if col_util else ""

        secteur_name = ""
        if col_arrond:
            arrond_val = str(row.get(col_arrond, "")).strip().lower()
            secteur_name = arrond_map.get(arrond_val, "")
        if not secteur_name and col_rue:
            rue_val = str(row.get(col_rue, ""))
            m = re.search(r'\(([A-Z]{2,5})\)', rue_val)
            if m:
                suffix = m.group(0).lower()
                secteur_name = suffix_map.get(suffix, "")

        rows.append({
            "Nom_Gestionnaire": "",
            "Nom_Syndicat": "",
            "Civic": civic,
            "Adresse": address,
            "Ville_CodePostal": secteur_name or muni,
            "Nb_Unites": nb,
            "Secteur": secteur_name or muni,
            "Code_Utilisation": util_val,
            "Notes": "",
        })
    return rows


@router.post("/filter-properties")
async def filter_properties(
    file: UploadFile = File(...),
    min_units: int = Form(8),
    max_units: int = Form(24),
    search_term: str = Form(""),
    year_min: str = Form(""),
    year_max: str = Form(""),
    condo_only: str = Form("true"),
    util_filter: str = Form(""),
):
    try:
        content = await file.read()

        # Detect encoding and separator from a small sample
        enc, sep = _detect_encoding_and_sep(content)
        if enc is None:
            return JSONResponse(
                status_code=400,
                content={"error": "Impossible de lire le fichier CSV. Vérifiez l'encodage."},
            )

        # Read header only to detect columns
        bio = io.BytesIO(content)
        header_df = pd.read_csv(bio, encoding=enc, sep=sep, nrows=0)
        columns = list(header_df.columns)

        col_units = _find_col(columns, ["NOMBRE_LOGEMENT", "NB_LOGEMENT", "NOMBRE_LOGEMENTS"])
        col_rue = _find_col(columns, ["NOM_RUE", "RUE", "NOM_VOIE"])
        col_muni = _find_col(columns, ["MUNICIPALITE", "ARRONDISSEMENT", "VILLE"])
        col_cat = _find_col(columns, ["CATEGORIE_UEF", "CATEGORIE"])
        col_util = _find_col(columns, ["CODE_UTILISATION", "CUBF"])
        col_year = _find_col(columns, ["ANNEE_CONSTRUCTION", "YEAR_BUILT", "ANNEE"])
        col_addr = _find_col(columns, ["ADRESSE", "CIVIC", "NUMERO_CIVIQUE"])
        col_civic = _find_col(columns, ["CIVIQUE_DEBUT", "NO_CIVIQUE",
                                        "NUMERO_CIVIQUE", "NO_CIVIC", "CIVIC_NUMBER", "CIVIQUE"])
        col_civic_fin = _find_col(columns, ["CIVIQUE_FIN"])
        col_arrond = _find_col(columns, ["NO_ARROND_ILE_CUM", "ARRONDISSEMENT_CODE", "CODE_ARROND"])

        cols = {
            "units": col_units, "rue": col_rue, "muni": col_muni, "cat": col_cat,
            "util": col_util, "year": col_year, "addr": col_addr,
            "civic": col_civic, "civic_fin": col_civic_fin, "arrond": col_arrond,
        }

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
        suffix_map = {
            "(anj)": "anjou", "(mtl)": "montréal", "(mtln)": "montréal-nord",
            "(pat)": "pointe-aux-trembles", "(rdp)": "rivière-des-prairies",
            "(slo)": "saint-laurent", "(sle)": "saint-léonard",
            "(cdn)": "côte-des-neiges", "(ndg)": "notre-dame-de-grâce",
            "(out)": "outremont", "(vma)": "ville-marie", "(plt)": "plateau",
            "(rpr)": "rosemont", "(mhm)": "mercier", "(hma)": "hochelaga-maisonneuve",
            "(vsp)": "villeray", "(smp)": "saint-michel", "(pex)": "parc-extension",
            "(swt)": "sud-ouest", "(ahs)": "ahuntsic", "(car)": "cartierville",
            "(ppp)": "petite-patrie",
        }

        results = []
        total_rows_read = 0

        # When filtering condominiums, each unit is a separate row with NOMBRE_LOGEMENT=1.
        # We need to GROUP by address and SUM units to get the real building size.
        # Strategy: relax the units filter during chunking (just filter condo + search term + year),
        # then group by address and apply the units filter on the aggregated count.
        is_condo = condo_only.lower() in ("true", "1", "yes")

        bio = io.BytesIO(content)
        for chunk in pd.read_csv(bio, encoding=enc, sep=sep, chunksize=CHUNK_SIZE):
            total_rows_read += len(chunk)
            if is_condo:
                # Phase 1: filter everything EXCEPT units (condo, search, year, util)
                filtered = _filter_chunk(
                    chunk, cols, 1, 999999, search_term,
                    year_min, year_max, condo_only, util_filter,
                    arrond_map, suffix_map,
                )
            else:
                filtered = _filter_chunk(
                    chunk, cols, min_units, max_units, search_term,
                    year_min, year_max, condo_only, util_filter,
                    arrond_map, suffix_map,
                )
            if len(filtered) > 0:
                rows = _build_rows(filtered, cols, arrond_map, suffix_map)
                results.extend(rows)

        # Phase 2: group by address, sum units, then apply units filter
        if is_condo and results:
            # Group by Adresse (civic + street) and aggregate
            grouped = {}
            for r in results:
                key = r["Adresse"]
                if not key:
                    continue
                if key not in grouped:
                    grouped[key] = {
                        **r,
                        "Nb_Unites": 0,
                        "_count": 0,
                    }
                grouped[key]["Nb_Unites"] += r["Nb_Unites"] or 1
                grouped[key]["_count"] += 1
            # Apply units filter on aggregated counts
            results = [
                {k: v for k, v in r.items() if not k.startswith("_")}
                for r in grouped.values()
                if min_units <= r["Nb_Unites"] <= max_units
            ]

        try:
            db = get_db()
            db.table("activity_log").insert({
                "action": "properties_filtered",
                "detail": f"{len(results)} propriétés trouvées",
                "detail_count": len(results),
            }).execute()
        except Exception:
            pass

        return {
            "count": len(results),
            "rows": results[:500],
            "all_rows": results,
            "total_scanned": total_rows_read,
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
