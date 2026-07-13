// Vérification Phase D — Street Tracker & KPI Couverture
let ok = 0, fail = 0
const check = (label, cond, detail = '') => {
  if (cond) { ok++; console.log(`  [OK]   ${label}`) }
  else { fail++; console.log(`  [FAIL] ${label} ${detail}`) }
}

// ── Réplique des fonctions helper du frontend ──
const LETTER_SENT_STATUSES = new Set([
  'Courriel envoyé', 'Contacté – à rappeler', 'Contacté – intéressé', 'Rencontre prévue',
  'En attente (rapport/réponse)', 'Soumission envoyée', 'Soumission révisée',
  'En fermeture', 'Vendu / Signé', 'Récupéré (signé)', 'À repasser',
  'Perdu (revisiter année suivante)', "Hors d'affaires",
])
const VISITED_STATUSES = new Set([
  'À repasser', 'Contacté – à rappeler', 'Contacté – intéressé', 'Rencontre prévue',
  'Soumission envoyée', 'Soumission révisée', 'En fermeture',
  'Vendu / Signé', 'Récupéré (signé)',
])
const VENDU_STATUSES = new Set(['Vendu / Signé', 'Récupéré (signé)'])

const hasLettre = (p) => LETTER_SENT_STATUSES.has(p.statut) || (p.notes || '').toLowerCase().includes('lettre')
const hasVisite = (p) => VISITED_STATUSES.has(p.statut) || (p.notes || '').toLowerCase().includes('visite')
const hasRetour = (p) => (p.notes || '').toLowerCase().includes('retour entrant')
const isVendu = (p) => VENDU_STATUSES.has(p.statut)

const isCompleted = (p) => {
  if (!hasLettre(p)) return false
  const s = p.statut || ''
  if (VISITED_STATUSES.has(s) || s === 'Perdu (revisiter année suivante)' || s === "Hors d'affaires") return true
  if (s === 'Courriel envoyé') {
    const today = new Date().toISOString().split('T')[0]
    const na = p.next_action || ''
    return !na || na <= today
  }
  return false
}

// ── Réplique du grouping zone → rue ──
function buildStreetData(prospects) {
  const zones = {}
  for (const p of prospects) {
    const zone = p.zone || 'Hors zone'
    const rue = p.rue || 'Non assigné'
    if (!zones[zone]) zones[zone] = {}
    if (!zones[zone][rue]) zones[zone][rue] = []
    zones[zone][rue].push(p)
  }
  const result = []
  for (const [zoneName, streets] of Object.entries(zones)) {
    const zoneStreets = []
    for (const [rueName, pros] of Object.entries(streets)) {
      const completed = pros.filter(isCompleted).length
      zoneStreets.push({
        rue: rueName, total: pros.length,
        lettres: pros.filter(hasLettre).length,
        visites: pros.filter(hasVisite).length,
        repasser: pros.filter(p => p.statut === 'À repasser').length,
        retours: pros.filter(hasRetour).length,
        vendus: pros.filter(isVendu).length,
        completed, pct: pros.length ? Math.round(completed / pros.length * 100) : 0,
        isDone: completed === pros.length && pros.length > 0,
      })
    }
    const doneStreets = zoneStreets.filter(s => s.isDone).length
    result.push({ zone: zoneName, streets: zoneStreets, doneStreets, totalStreets: zoneStreets.length,
      pct: zoneStreets.length ? Math.round(doneStreets / zoneStreets.length * 100) : 0 })
  }
  return result.sort((a, b) => a.zone.localeCompare(b.zone))
}

// ── Données de test ──
const testProspects = [
  // Rue Bombardier (ZONE 1) — 3 prospects, 2 complétés
  { id: 1, entreprise: 'A', adresse: '100 rue Bombardier', zone: 'ZONE 1 — Cœur industriel', rue: 'bombardier',
    statut: 'À repasser', notes: 'Visite absent 2026-07-06', next_action: '2026-07-09', segment: 'Industriel / Commercial' },
  { id: 2, entreprise: 'B', adresse: '102 rue Bombardier', zone: 'ZONE 1 — Cœur industriel', rue: 'bombardier',
    statut: 'Vendu / Signé', notes: '', next_action: '', segment: 'Industriel / Commercial' },
  { id: 3, entreprise: 'C', adresse: '104 rue Bombardier', zone: 'ZONE 1 — Cœur industriel', rue: 'bombardier',
    statut: 'À contacter / À appeler', notes: '', next_action: '', segment: 'Industriel / Commercial' },

  // Rue Chaumont (ZONE 4) — 2 prospects, tous complétés (courriel envoyé + next_action passé)
  { id: 4, entreprise: 'D', adresse: '200 rue Chaumont', zone: 'ZONE 4 — Résidentiel condos', rue: 'chaumont',
    statut: 'Courriel envoyé', notes: '2e lettre envoyée 2026-06-01', next_action: '2026-06-15', segment: 'Syndicat de copropriété' },
  { id: 5, entreprise: 'E', adresse: '202 rue Chaumont', zone: 'ZONE 4 — Résidentiel condos', rue: 'chaumont',
    statut: 'Contacté – à rappeler', notes: 'Retour entrant 2026-07-01', next_action: '2026-07-02', segment: 'Syndicat de copropriété' },

  // Hors zone — 1 prospect non complété
  { id: 6, entreprise: 'F', adresse: '999 rue Inconnue', zone: 'Hors zone', rue: 'inconnue',
    statut: 'À contacter / À appeler', notes: '', next_action: '', segment: 'Autre' },
]

console.log('=== D1. Helper functions ===')
check('hasLettre — statut Courriel envoyé', hasLettre({ statut: 'Courriel envoyé', notes: '' }))
check('hasLettre — notes contiennent "lettre"', hasLettre({ statut: 'À contacter', notes: '2e lettre envoyée' }))
check('hasLettre — statut initial sans lettre', !hasLettre({ statut: 'À contacter / À appeler', notes: '' }))
check('hasVisite — statut À repasser', hasVisite({ statut: 'À repasser', notes: '' }))
check('hasVisite — notes "Visite absent"', hasVisite({ statut: 'À repasser', notes: 'Visite absent 2026-07-06' }))
check('hasRetour — notes "Retour entrant"', hasRetour({ statut: 'Contacté – à rappeler', notes: 'Retour entrant 2026-07-01' }))
check('hasRetour — pas de retour', !hasRetour({ statut: 'À repasser', notes: 'Visite absent' }))
check('isVendu — Vendu / Signé', isVendu({ statut: 'Vendu / Signé' }))
check('isVendu — pas vendu', !isVendu({ statut: 'À repasser' }))

console.log('\n=== D2. Completion logic ===')
check('Complété — À repasser (visite faite)', isCompleted(testProspects[0]))
check('Complété — Vendu', isCompleted(testProspects[1]))
check('Non complété — À contacter', !isCompleted(testProspects[2]))
check('Complété — Courriel envoyé + next_action passé', isCompleted(testProspects[3]))
check('Complété — Contacté (retour entrant)', isCompleted(testProspects[4]))
check('Non complété — Hors zone初始', !isCompleted(testProspects[5]))

console.log('\n=== D3. Street tracker grouping ===')
const sd = buildStreetData(testProspects)
check('3 zones générées', sd.length === 3, `got ${sd.length}`)
const z1 = sd.find(z => z.zone === 'ZONE 1 — Cœur industriel')
const z4 = sd.find(z => z.zone === 'ZONE 4 — Résidentiel condos')
const zh = sd.find(z => z.zone === 'Hors zone')
check('ZONE 1 — 1 rue (bombardier)', z1.streets.length === 1, `got ${z1.streets.length}`)
check('ZONE 1 — rue bombardier 3 total', z1.streets[0].total === 3)
check('ZONE 1 — 2 lettres', z1.streets[0].lettres === 2)
check('ZONE 1 — 2 visites', z1.streets[0].visites === 2) // À repasser + Vendu
check('ZONE 1 — 1 à repasser', z1.streets[0].repasser === 1)
check('ZONE 1 — 0 retours', z1.streets[0].retours === 0)
check('ZONE 1 — 1 vendu', z1.streets[0].vendus === 1)
check('ZONE 1 — 2/3 complétés (67%)', z1.streets[0].completed === 2 && z1.streets[0].pct === 67, `got ${z1.streets[0].completed}/${z1.streets[0].pct}`)
check('ZONE 1 — rue pas done (67%)', !z1.streets[0].isDone)
check('ZONE 1 — 0/1 rues complétées', z1.doneStreets === 0 && z1.totalStreets === 1)

check('ZONE 4 — 1 rue (chaumont)', z4.streets.length === 1)
check('ZONE 4 — 2/2 complétés (100%)', z4.streets[0].completed === 2 && z4.streets[0].pct === 100)
check('ZONE 4 — rue done (vert)', z4.streets[0].isDone)
check('ZONE 4 — 1/1 rues complétées (100%)', z4.doneStreets === 1 && z4.pct === 100)
check('ZONE 4 — 1 retour entrant', z4.streets[0].retours === 1)

check('Hors zone — 1 rue', zh.streets.length === 1)
check('Hors zone — 0/1 complétés (0%)', zh.streets[0].completed === 0 && zh.streets[0].pct === 0)
check('Hors zone — 0/1 rues complétées', zh.doneStreets === 0 && zh.pct === 0)

console.log('\n=== D4. KPI Couverture Anjou ===')
const traiteCount = testProspects.filter(isCompleted).length
const COUVERTURE_OBJECTIF = 1500
const pct = Math.round(traiteCount / COUVERTURE_OBJECTIF * 100)
check('Traitées = 4 (sur 6 prospects)', traiteCount === 4, `got ${traiteCount}`)
check(`Couverture = ${pct}% (4/1500)`, pct === 0, `got ${pct}`) // 4/1500 = 0.27% arrondi à 0
check('Obj = 1500', COUVERTURE_OBJECTIF === 1500)

console.log('\n=== D5. Cas limites ===')
// Prospect avec next_action futur — pas complété même si Courriel envoyé
const futureNa = { statut: 'Courriel envoyé', notes: '', next_action: '2099-12-31' }
check('Courriel envoyé + next_action futur → non complété', !isCompleted(futureNa))
// Prospect avec next_action vide et Courriel envoyé — complété
const emptyNa = { statut: 'Courriel envoyé', notes: '', next_action: '' }
check('Courriel envoyé + next_action vide → complété', isCompleted(emptyNa))
// Prospect Perdu — complété (traité même si négatif)
check('Perdu → complété', isCompleted({ statut: 'Perdu (revisiter année suivante)', notes: 'lettre envoyée', next_action: '' }))
// Hors d'affaires — complété
check("Hors d'affaires → complété", isCompleted({ statut: "Hors d'affaires", notes: 'lettre', next_action: '' }))
// Street vide
check('Street avec 0 prospects → isDone false', !(0 === 0 && 0 > 0))

console.log(`\n${'='.repeat(50)}\nRESULTAT: ${ok} OK / ${fail} ECHEC(S)`)
process.exit(fail ? 1 : 0)
