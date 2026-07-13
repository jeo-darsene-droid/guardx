// Vérifie que le filtrage côté navigateur (propertyFilterLocal.js) donne les mêmes
// résultats que le backend, avec le vrai fichier CSV d'évaluation foncière.
// Node 18+ : node frontend/verify_property_filter_local.mjs [chemin_csv]
import { readFileSync, existsSync } from 'fs'
import { filterPropertiesLocally } from './src/utils/propertyFilterLocal.js'

const csvPath = process.argv[2] || 'C:/Users/User/Downloads/uniteevaluationfonciere (1).csv'
let ok = 0, fail = 0
const check = (label, cond, detail = '') => {
  if (cond) { ok++; console.log(`  [OK]   ${label}`) }
  else { fail++; console.log(`  [FAIL] ${label} ${detail}`) }
}

if (!existsSync(csvPath)) {
  console.log(`CSV introuvable: ${csvPath} — test sauté.`)
  process.exit(0)
}

// Papa.parse accepte aussi une string (les objets File ne marchent qu'en navigateur)
const file = readFileSync(csvPath, 'utf-8')

console.log('=== Filtrage local (navigateur) — mêmes filtres que le backend ===')

// Test 1: Anjou, 8-24 unités, condo → attendu 182 (résultat backend vérifié)
const r1 = await filterPropertiesLocally(file, {
  minUnits: 8, maxUnits: 24, searchTerm: 'anjou', condoOnly: true,
})
check(`Anjou condo 8-24 unités → 182 (backend: 182)`, r1.count === 182, `got ${r1.count}`)
check('Lignes scannées = 514264', r1.total_scanned === 514264, `got ${r1.total_scanned}`)

// Test 2: Anjou, année 2020+, 8-53 unités → attendu 3 (résultat backend vérifié)
const r2 = await filterPropertiesLocally(file, {
  minUnits: 8, maxUnits: 53, searchTerm: 'anjou', yearMin: '2020', condoOnly: true,
})
check(`Anjou 2020+ 8-53 unités → 3 (backend: 3)`, r2.count === 3, `got ${r2.count}`)

// Test 3: structure des résultats
if (r1.all_rows.length) {
  const row = r1.all_rows[0]
  check('Champ Adresse présent', 'Adresse' in row)
  check('Champ Nb_Unites présent', 'Nb_Unites' in row)
  check('Champ Secteur présent', 'Secteur' in row)
  check('Nb_Unites dans la plage', r1.all_rows.every(r => r.Nb_Unites >= 8 && r.Nb_Unites <= 24))
}

// Test 4: aucun résultat pour recherche impossible
const r4 = await filterPropertiesLocally(file, {
  minUnits: 8, maxUnits: 24, searchTerm: 'zzz-introuvable-999', condoOnly: true,
})
check('Aucun match → 0 résultats', r4.count === 0, `got ${r4.count}`)

console.log(`\nRESULTAT: ${ok} OK / ${fail} ECHEC(S)`)
process.exit(fail ? 1 : 0)
