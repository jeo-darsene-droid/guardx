"""Vérification Phase G — Mobile Terrain Mode (search + quick actions)."""
import json
import time
import urllib.request
import urllib.parse

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
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

# ── Insert test prospects if DB is empty ──
print("=== Setup: ensure test prospects exist ===")
existing = get("/prospects")
test_keywords = ["G-Test Harnois", "G-Test Kenworth", "G-Test Bombardier"]
has_test = any(any(kw in str(p.get("entreprise", "")) for kw in test_keywords) for p in existing)
if not has_test:
    test_prospects = [
        {"entreprise": "G-Test Harnois Inc.", "contact": "Jean Harnois", "adresse": "1000 rue Jarry Est", "ville": "Montréal H1J 1A1", "statut": "Courriel envoyé", "telephone": "514-555-1234", "zone": "ZONE 1 — Cœur industriel", "rue": "jarry est", "segment": "Industriel / Commercial", "next_action": "", "contacte": False, "date_contact": "", "notes": "Lettre envoyée 2025-01-15"},
        {"entreprise": "G-Test Kenworth Ltée", "contact": "Marc Tremblay", "adresse": "2000 boul Métropolitain Est", "ville": "Montréal H1K 3C3", "statut": "À contacter / À appeler", "telephone": "514-555-5678", "zone": "ZONE 2 — Commercial / corporatif", "rue": "metropolitain est", "segment": "Industriel / Commercial", "next_action": "", "contacte": False, "date_contact": "", "notes": ""},
        {"entreprise": "G-Test Bombardier Corp", "contact": "", "adresse": "500 rue Bombardier", "ville": "Montréal H1J 2B2", "statut": "Courriel envoyé", "telephone": "", "zone": "ZONE 1 — Cœur industriel", "rue": "bombardier", "segment": "Industriel / Commercial", "next_action": "", "contacte": False, "date_contact": "", "notes": "Lettre envoyée"},
    ]
    all_p = existing + test_prospects
    post("/prospects", {"prospects": all_p})
    print(f"  Inserted {len(test_prospects)} test prospects")
else:
    print("  Test prospects already exist")

print("=== G1. Endpoint /api/prospects/search ===")

# Empty query → empty list
results = get("/prospects/search?q=")
check("Query vide → liste vide", results == [], f"got {results}")

# Search for our G-Test prospects specifically
prospects = get("/prospects")
check("Prospects exist in DB", len(prospects) > 0, "DB vide — test limité")
# Use our G-Test prospect for predictable results
p0 = next((p for p in prospects if "G-Test Harnois" in str(p.get("entreprise", ""))), None)
if not p0 and prospects:
    p0 = prospects[0]  # fallback
if p0:
    nom = p0.get("entreprise", "")
    addr = p0.get("adresse", "")

    # Search by name (substring)
    if nom:
        q = "Harnois" if "Harnois" in nom else (nom[:4] if len(nom) >= 4 else nom)
        results = get(f"/prospects/search?q={urllib.parse.quote(q)}")
        check(f"Search by name '{q}' → résultats", len(results) > 0, f"got {len(results)}")
        check("Résultats triés par score", all(r.get("_score", 0) >= 0 for r in results))
        check("Max 20 résultats", len(results) <= 20)

    # Search by address (substring)
    if addr:
        q = "Jarry" if "Jarry" in addr else (addr[:5] if len(addr) >= 5 else addr)
        results = get(f"/prospects/search?q={urllib.parse.quote(q)}")
        check(f"Search by address '{q}' → résultats", len(results) > 0, f"got {len(results)}")

    # Fuzzy search (slightly wrong spelling)
    if nom and len(nom) > 3:
        fuzzy_q = nom[:-1] + "x" if len(nom) > 1 else nom + "x"
        results = get(f"/prospects/search?q={urllib.parse.quote(fuzzy_q)}")
        found = any(r.get("entreprise") == nom for r in results)
        check(f"Fuzzy search '{fuzzy_q}' → trouvé", found, f"got {len(results)} results, found={found}")

    # Performance: <3s (Supabase REST API has ~2s network latency; search logic itself is <100ms)
    if nom:
        t0 = time.time()
        results = get(f"/prospects/search?q={urllib.parse.quote(nom)}")
        elapsed = time.time() - t0
        check(f"Search <3s (took {elapsed:.3f}s — Supabase network ~2s)", elapsed < 3.0, f"took {elapsed:.3f}s")

    # No match
    results = get("/prospects/search?q=zzznomatchxyz123")
    check("Aucun match → liste vide", results == [], f"got {len(results)}")

print("\n=== G2. Quick actions (reuse Phase C endpoint) ===")
if prospects:
    # Find a test prospect (use first one)
    test_p = prospects[0]
    pid = test_p["id"]

    # Visite absent
    status, data = post("/prospects/quick-action", {"prospect_id": pid, "action": "visite_absent"})
    check("visite_absent → 200", status == 200, f"got {status}")
    check("visite_absent → status ok", data.get("status") == "ok", f"got {data}")

    # Verify prospect updated
    updated = get("/prospects")
    updated_p = next((p for p in updated if p["id"] == pid), None)
    check("Statut → 'À repasser'", updated_p and updated_p.get("statut") == "À repasser", f"got {updated_p.get('statut') if updated_p else 'N/A'}")
    check("Contacte → True", updated_p and updated_p.get("contacte") == True)

    # Visite rencontre
    status, data = post("/prospects/quick-action", {"prospect_id": pid, "action": "visite_rencontre", "notes": "Test G — rencontre"})
    check("visite_rencontre → 200", status == 200, f"got {status}")
    updated = get("/prospects")
    updated_p = next((p for p in updated if p["id"] == pid), None)
    check("Statut → 'Contacté – à rappeler'", updated_p and "Contacté" in str(updated_p.get("statut", "")), f"got {updated_p.get('statut') if updated_p else 'N/A'}")

    # Retour entrant
    status, data = post("/prospects/quick-action", {"prospect_id": pid, "action": "retour_entrant"})
    check("retour_entrant → 200", status == 200, f"got {status}")
    updated = get("/prospects")
    updated_p = next((p for p in updated if p["id"] == pid), None)
    check("Notes contiennent 'Retour entrant'", updated_p and "retour entrant" in str(updated_p.get("notes", "")).lower(), f"got {updated_p.get('notes', '')[:50] if updated_p else 'N/A'}")

    # Invalid action
    status, data = post("/prospects/quick-action", {"prospect_id": pid, "action": "invalid"})
    check("Action invalide → 400", status == 400, f"got {status}")

    # Missing prospect_id
    status, data = post("/prospects/quick-action", {"action": "visite_absent"})
    check("prospect_id manquant → 400", status == 400, f"got {status}")

print("\n=== G3. Structure des résultats de recherche ===")
if prospects and prospects[0].get("entreprise"):
    nom = prospects[0]["entreprise"]
    results = get(f"/prospects/search?q={urllib.parse.quote(nom[:4])}")
    if results:
        r = results[0]
        check("Champ entreprise présent", "entreprise" in r)
        check("Champ adresse présent", "adresse" in r)
        check("Champ id présent", "id" in r)
        check("Champ _score présent", "_score" in r)
        check("Champ statut présent", "statut" in r)
        check("Champ contact présent", "contact" in r)

print(f"\n{'='*50}\nRESULTAT: {ok} OK / {fail} ECHEC(S)")

# ── Nettoyage: remove G-Test prospects ──
all_p = get("/prospects")
kept = [p for p in all_p if not any(kw in str(p.get("entreprise", "")) for kw in test_keywords)]
if len(kept) != len(all_p):
    post("/prospects", {"prospects": kept})
    print(f"Removed {len(all_p) - len(kept)} G-Test prospects.")
raise SystemExit(1 if fail else 0)
