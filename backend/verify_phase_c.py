"""Vérification complète Phase C — Moteur de suivi automatique."""
import urllib.request
import urllib.error
import json
from datetime import datetime, timedelta

BASE = "http://localhost:8000/api"
ok, fail = 0, 0

def check(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  [OK]   {label}")
    else:
        fail += 1
        print(f"  [FAIL] {label} {detail}")

def post(path, body=None):
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read())

def post_raw(path, body=None):
    """POST that returns (status, parsed_body_or_None)."""
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None

def get(path):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f"{BASE}{path}")).read())

def find_prospect(pid):
    return next((p for p in get("/prospects") if p["id"] == pid), None)

today = datetime.now().date()

# ── Setup : créer 2 prospects de test (I/C et Syndicat) ──
print("=== Setup prospects de test ===")
post("/prospects/add", {"prospects": [
    {"Entreprise": "Test IC Phase C", "Adresse": "5555 rue Bombardier", "Ville_CodePostal": "Anjou", "Segment": "Industriel / Commercial"},
    {"Entreprise": "Test Syndicat Phase C", "Nom_Syndicat": "Syndicat Test C", "Adresse": "6666 rue Chaumont", "Ville_CodePostal": "Anjou", "Segment": "Syndicat de copropriété"},
]})
prospects = get("/prospects")
p_ic = next((p for p in prospects if p.get("adresse") == "5555 rue Bombardier"), None)
p_syn = next((p for p in prospects if p.get("adresse") == "6666 rue Chaumont"), None)
check("Prospect I/C créé", p_ic is not None)
check("Prospect Syndicat créé", p_syn is not None)
check("Zone auto-assignée I/C (ZONE 1)", p_ic and str(p_ic.get("zone", "")).startswith("ZONE 1"), f"got {p_ic.get('zone') if p_ic else None}")

# ── C1 : Auto-followup via génération de lettres (mode postal) ──
print("\n=== C1. Auto-followup — génération lettres mode postal ===")
rows = [
    {"Nom_Gestionnaire": "Jean Test", "Entreprise": "Test IC Phase C", "Adresse": "5555 rue Bombardier",
     "Ville_CodePostal": "Anjou", "Segment": "Industriel / Commercial"},
    {"Nom_Syndicat": "Syndicat Test C", "Adresse": "6666 rue Chaumont",
     "Ville_CodePostal": "Anjou", "Segment": "Syndicat de copropriété"},
]
data = json.dumps({"rows": rows, "settings": {"mode": "postal", "rep_name": "Test", "rep_title": "T", "phone": "5145550000", "email": "t@t.com"}}).encode()
req = urllib.request.Request(f"{BASE}/generate-letters-json", data=data,
                             headers={"Content-Type": "application/json"}, method="POST")
r = urllib.request.urlopen(req)
zip_bytes = r.read()
check("Lettres générées (ZIP reçu)", r.status == 200 and len(zip_bytes) > 1000, f"{len(zip_bytes)} octets")

p_ic2 = find_prospect(p_ic["id"])
p_syn2 = find_prospect(p_syn["id"])
exp_ic = (today + timedelta(days=8)).isoformat()
exp_syn = (today + timedelta(days=21)).isoformat()
check(f"I/C → next_action = today+8 ({exp_ic})", p_ic2.get("next_action") == exp_ic, f"got {p_ic2.get('next_action')}")
check("I/C → note 'Visite terrain — suivi lettre'", "Visite terrain" in (p_ic2.get("notes") or ""), f"got {p_ic2.get('notes')}")
check(f"Syndicat → next_action = today+21 ({exp_syn})", p_syn2.get("next_action") == exp_syn, f"got {p_syn2.get('next_action')}")
check("Syndicat → note '2e lettre si aucun retour'", "2e lettre si aucun retour" in (p_syn2.get("notes") or ""), f"got {p_syn2.get('notes')}")

# ── C1b : mode dépôt ne doit PAS définir de suivi ──
print("\n=== C1b. Mode dépôt — pas de suivi automatique ===")
post("/prospects/add", {"prospects": [
    {"Entreprise": "Test Depot Phase C", "Adresse": "7777 rue Colbert", "Ville_CodePostal": "Anjou", "Segment": "Industriel / Commercial"},
]})
p_dep = next((p for p in get("/prospects") if p.get("adresse") == "7777 rue Colbert"), None)
data = json.dumps({"rows": [{"Entreprise": "Test Depot Phase C", "Adresse": "7777 rue Colbert", "Segment": "Industriel / Commercial"}],
                   "settings": {"mode": "dépôt", "rep_name": "T", "rep_title": "T", "phone": "5145550000", "email": "t@t.com"}}).encode()
req = urllib.request.Request(f"{BASE}/generate-letters-json", data=data,
                             headers={"Content-Type": "application/json"}, method="POST")
urllib.request.urlopen(req)
p_dep2 = find_prospect(p_dep["id"])
check("Mode dépôt → next_action inchangé", not (p_dep2.get("next_action") or "").strip(), f"got {p_dep2.get('next_action')!r}")

# ── C2 : Quick actions (avec colonne email maintenant présente) ──
print("\n=== C2. Quick actions ===")
pid = p_ic["id"]
r = post("/prospects/quick-action", {"prospect_id": pid, "action": "visite_absent",
                                     "nom": "Marie Décideur", "telephone": "514-999-8877", "email": "marie@test.com"})
check("visite_absent → ok", r.get("status") == "ok")
p = find_prospect(pid)
check("visite_absent → statut 'À repasser'", p.get("statut") == "À repasser", f"got {p.get('statut')}")
check("visite_absent → next_action = today+3", p.get("next_action") == (today + timedelta(days=3)).isoformat(), f"got {p.get('next_action')}")
check("visite_absent → nom confirmé sauvegardé", p.get("contact") == "Marie Décideur", f"got {p.get('contact')}")
check("visite_absent → téléphone sauvegardé", p.get("telephone") == "514-999-8877", f"got {p.get('telephone')}")
check("visite_absent → COURRIEL sauvegardé (colonne email)", p.get("email") == "marie@test.com", f"got {p.get('email')}")
check("visite_absent → contacté coché", p.get("contacte") is True)

r = post("/prospects/quick-action", {"prospect_id": pid, "action": "visite_rencontre", "notes": "Rencontre positive, veut soumission"})
check("visite_rencontre → ok", r.get("status") == "ok")
p = find_prospect(pid)
check("visite_rencontre → statut 'Contacté – à rappeler'", p.get("statut") == "Contacté – à rappeler", f"got {p.get('statut')}")
check("visite_rencontre → notes ajoutées (append)", "Rencontre positive" in (p.get("notes") or "") and "Visite terrain" in (p.get("notes") or ""), f"got {p.get('notes')}")

r = post("/prospects/quick-action", {"prospect_id": pid, "action": "retour_entrant"})
check("retour_entrant → ok", r.get("status") == "ok")
p = find_prospect(pid)
check("retour_entrant → statut 'Contacté – à rappeler'", p.get("statut") == "Contacté – à rappeler")
check("retour_entrant → next_action = today+1", p.get("next_action") == (today + timedelta(days=1)).isoformat(), f"got {p.get('next_action')}")

# ── C2b : validations ──
print("\n=== C2b. Validations ===")
code, _ = post_raw("/prospects/quick-action", {"prospect_id": pid, "action": "action_invalide"})
check("Action invalide → HTTP 400", code == 400, f"got {code}")
code, _ = post_raw("/prospects/quick-action", {"action": "visite_absent"})
check("prospect_id manquant → HTTP 400", code == 400, f"got {code}")
r = post("/prospects/quick-action", {"prospect_id": pid, "action": "visite_absent"})
check("visite_absent sans mini-form (champs vides) → ok", r.get("status") == "ok")
p = find_prospect(pid)
check("Champs vides → contact non écrasé", p.get("contact") == "Marie Décideur", f"got {p.get('contact')}")

# ── C3 : Journal d'activité ──
print("\n=== C3. Journal d'activité ===")
acts = get("/activity")
actions = [a["action"] for a in acts]
check("visite_absent loggé", "visite_absent" in actions, str(actions))
va = next((a for a in acts if a["action"] == "visite_absent"), {})
check("Log contient l'ID du prospect", f"#{pid}" in va.get("detail", ""), f"got {va.get('detail')}")

print(f"\n{'='*50}\nRESULTAT: {ok} OK / {fail} ECHEC(S)")

# ── Nettoyage des prospects de test ──
import os
if fail == 0:
    kept = [p for p in get("/prospects") if p.get("adresse") not in ("5555 rue Bombardier", "6666 rue Chaumont", "7777 rue Colbert")]
    post("/prospects", {"prospects": kept})
    print("Prospects de test supprimés.")
raise SystemExit(1 if fail else 0)
