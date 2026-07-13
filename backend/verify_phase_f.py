"""Vérification Phase F — Cadence Dashboard + Today panel merge."""
import json
import urllib.request
from datetime import date, timedelta

BASE = "http://localhost:8000/api"
ok, fail = 0, 0

def check(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1; print(f"  [OK]   {label}")
    else:
        fail += 1; print(f"  [FAIL] {label} {detail}")

def get(path):
    return json.loads(urllib.request.urlopen(f"{BASE}{path}").read())

def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read())

print("=== F1. Endpoint /api/cadence-anjou ===")
cad = get("/cadence-anjou")
check("Endpoint répond", cad is not None)
check("lettres_semaine présent", "lettres_semaine" in cad, f"got {list(cad.keys())}")
check("lettres_semaine_obj = 40", cad.get("lettres_semaine_obj") == 40, f"got {cad.get('lettres_semaine_obj')}")
check("qualifiees_jour présent", "qualifiees_jour" in cad)
check("qualifiees_jour_obj = 8", cad.get("qualifiees_jour_obj") == 8, f"got {cad.get('qualifiees_jour_obj')}")
check("qualifiees_mois présent", "qualifiees_mois" in cad)
check("qualifiees_mois_obj = 160", cad.get("qualifiees_mois_obj") == 160, f"got {cad.get('qualifiees_mois_obj')}")
check("taux_retour présent", "taux_retour" in cad)
check("taux_retour est un nombre", isinstance(cad.get("taux_retour"), (int, float)), f"got {type(cad.get('taux_retour'))}")
check("retours_entrants présent", "retours_entrants" in cad)
check("lettres_total présent", "lettres_total" in cad)
check("couverture_traite présent", "couverture_traite" in cad)
check("couverture_obj = 1500", cad.get("couverture_obj") == 1500, f"got {cad.get('couverture_obj')}")
check("lettres_semaine >= 0", cad.get("lettres_semaine", -1) >= 0)
check("qualifiees_jour >= 0", cad.get("qualifiees_jour", -1) >= 0)
check("couverture_traite >= 0", cad.get("couverture_traite", -1) >= 0)

print("\n=== F2. Taux de retour calcul ===")
rt = cad.get("retours_entrants", 0)
lt = cad.get("lettres_total", 0)
expected_rate = round(rt / lt * 100, 1) if lt > 0 else 0.0
check(f"Taux = {expected_rate}% (retours={rt} / lettres={lt})", cad.get("taux_retour") == expected_rate,
      f"got {cad.get('taux_retour')} vs expected {expected_rate}")

print("\n=== F3. Couverture Anjou (Phase D logic) ===")
prospects = get("/prospects")
couverture = cad.get("couverture_traite", 0)
check("Couverture <= total prospects", couverture <= len(prospects), f"couverture={couverture}, prospects={len(prospects)}")
check("Couverture >= 0", couverture >= 0)

print("\n=== F4. Endpoint /api/followups — merge pipeline + machine ===")
fu = get("/followups")
check("Endpoint répond", fu is not None)
check("today présent", "today" in fu)
check("due présent (liste)", isinstance(fu.get("due"), list))
check("overdue présent (liste)", isinstance(fu.get("overdue"), list))
check("pipeline_count présent", "pipeline_count" in fu, f"got {list(fu.keys())}")
check("machine_count présent", "machine_count" in fu, f"got {list(fu.keys())}")

# Verify merge order: overdue (pipeline) first, then due (pipeline + machine)
due = fu.get("due", [])
overdue = fu.get("overdue", [])
pc = fu.get("pipeline_count", 0)
mc = fu.get("machine_count", 0)
check(f"pipeline_count + machine_count = total due+overdue", pc + mc == len(due) + len(overdue),
      f"pc={pc} mc={mc} due={len(due)} overdue={len(overdue)}")

# Check machine items have _machine_type
machine_in_due = [p for p in due if p.get("_machine_type")]
pipeline_in_due = [p for p in due if not p.get("_machine_type")]
check(f"Machine items in due: {len(machine_in_due)}", len(machine_in_due) == mc, f"got {len(machine_in_due)} vs mc={mc}")
check(f"Pipeline items in due: {len(pipeline_in_due)}", len(pipeline_in_due) <= pc, f"got {len(pipeline_in_due)} vs pc={pc}")

# Verify pipeline items come BEFORE machine items in due list
if machine_in_due and pipeline_in_due:
    first_machine_idx = next(i for i, p in enumerate(due) if p.get("_machine_type"))
    last_pipeline_idx = max(i for i, p in enumerate(due) if not p.get("_machine_type"))
    check("Pipeline items avant machine items dans due", last_pipeline_idx < first_machine_idx,
          f"last_pipeline={last_pipeline_idx} first_machine={first_machine_idx}")

# Verify machine types are valid
valid_machine_types = {"Visite J+8", "Appel J+3", "2e lettre J+21"}
for p in machine_in_due:
    check(f"Machine type valide: {p['_machine_type']}", p["_machine_type"] in valid_machine_types)

print("\n=== F5. Cadence data types valides ===")
check("lettres_semaine est int", isinstance(cad.get("lettres_semaine"), int))
check("qualifiees_jour est int", isinstance(cad.get("qualifiees_jour"), int))
check("qualifiees_mois est int", isinstance(cad.get("qualifiees_mois"), int))
check("retours_entrants est int", isinstance(cad.get("retours_entrants"), int))
check("lettres_total est int", isinstance(cad.get("lettres_total"), int))
check("couverture_traite est int", isinstance(cad.get("couverture_traite"), int))

print("\n=== F6. Consistance KPIs vs Cadence ===")
kpis = get("/kpis")
check("KPI letters_today présent", "letters_today" in kpis)
check("KPI prospects présent", "prospects" in kpis)
# letters_today from KPIs counts today's letters_generated; cadence lettres_semaine counts this week
check("KPI letters_today <= cadence lettres_semaine (ou les deux = 0)",
      kpis.get("letters_today", 0) <= cad.get("lettres_semaine", 0) or kpis.get("letters_today", 0) == 0,
      f"today={kpis.get('letters_today')} week={cad.get('lettres_semaine')}")

print(f"\n{'='*50}\nRESULTAT: {ok} OK / {fail} ECHEC(S)")
raise SystemExit(1 if fail else 0)
