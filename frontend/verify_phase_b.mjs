// Vérification Phase B — logique segment-aware et détection nom manquant
let ok = 0, fail = 0
const check = (label, cond, detail = '') => {
  if (cond) { ok++; console.log(`  [OK]   ${label}`) }
  else { fail++; console.log(`  [FAIL] ${label} ${detail}`) }
}

// ── Réplique de la logique ProspectTracker ──
const isNoCallSegment = (segment) => {
  const s = (segment || '').toLowerCase()
  return s === 'syndicat de copropriété' || s === 'locatif'
}
const isIndustrielCommercial = (segment) => {
  const s = (segment || '').toLowerCase()
  return s === 'industriel / commercial' || s === 'industriel/commercial'
}

// ── Réplique de la logique LetterGenerator ──
const rowsMissingName = (rows) => {
  if (!rows) return []
  return rows.filter(r => {
    const segment = String(r.Segment || r.segment || '').toLowerCase()
    if (segment === 'syndicat de copropriété' || segment === 'locatif') return false
    if (String(r.Nom_Syndicat || '').trim()) return false
    const name = String(r.Nom_Gestionnaire || r.Contact || r.contact || '').trim()
    return !name
  })
}

console.log('=== B1. Actions segment-aware ===')
check("Syndicat de copropriété → pas d'appel (2e lettre)", isNoCallSegment('Syndicat de copropriété'))
check("Locatif → pas d'appel (2e lettre)", isNoCallSegment('Locatif'))
check('Industriel / Commercial → appel permis', !isNoCallSegment('Industriel / Commercial'))
check('Restaurant / Bar → appel permis', !isNoCallSegment('Restaurant / Bar'))
check('Segment vide → appel permis', !isNoCallSegment(''))
check('Segment null → appel permis', !isNoCallSegment(null))

console.log('\n=== B2. Badge nom de décideur manquant (liste prospects) ===')
check('Industriel / Commercial détecté', isIndustrielCommercial('Industriel / Commercial'))
check('industriel/commercial (sans espaces) détecté', isIndustrielCommercial('Industriel/Commercial'))
check('Syndicat → pas de badge', !isIndustrielCommercial('Syndicat de copropriété'))
check('Vide → pas de badge', !isIndustrielCommercial(''))

console.log('\n=== B3. Détection noms manquants (générateur lettres) ===')
// Flux industriel/commercial sans nom → avertir
check('Ligne I/C sans nom → avertir',
  rowsMissingName([{ Entreprise: 'ABC Inc', Segment: 'Industriel / Commercial', Nom_Gestionnaire: '' }]).length === 1)
// Flux industriel/commercial avec nom → OK
check('Ligne I/C avec nom → pas d\'avertissement',
  rowsMissingName([{ Entreprise: 'ABC Inc', Segment: 'Industriel / Commercial', Nom_Gestionnaire: 'Jean Tremblay' }]).length === 0)
// Flux syndicat (Nom_Syndicat rempli, pas de nom) → PAS d'avertissement (non nominatif)
check('Ligne syndicat REQ (Nom_Syndicat) sans nom → pas d\'avertissement',
  rowsMissingName([{ Nom_Syndicat: 'Syndicat du 123 rue Test', Nom_Gestionnaire: '' }]).length === 0)
// Segment Syndicat de copropriété → pas d'avertissement
check('Segment Syndicat de copropriété → pas d\'avertissement',
  rowsMissingName([{ Entreprise: 'X', Segment: 'Syndicat de copropriété', Nom_Gestionnaire: '' }]).length === 0)
// Segment Locatif → pas d'avertissement
check('Segment Locatif → pas d\'avertissement',
  rowsMissingName([{ Entreprise: 'X', Segment: 'Locatif', Nom_Gestionnaire: '' }]).length === 0)
// Ligne sans segment ni Nom_Syndicat, sans nom → avertir (défaut prudent)
check('Ligne sans segment sans nom → avertir',
  rowsMissingName([{ Entreprise: 'ABC Inc', Nom_Gestionnaire: '' }]).length === 1)
// Champ Contact utilisé comme fallback
check('Nom dans le champ Contact → pas d\'avertissement',
  rowsMissingName([{ Entreprise: 'ABC Inc', Contact: 'Marie Roy' }]).length === 0)
// Espaces seulement = manquant
check('Nom avec espaces seulement → avertir',
  rowsMissingName([{ Entreprise: 'ABC Inc', Nom_Gestionnaire: '   ' }]).length === 1)
// Mélange
const mixed = rowsMissingName([
  { Entreprise: 'A', Segment: 'Industriel / Commercial', Nom_Gestionnaire: '' },
  { Nom_Syndicat: 'Syndicat B', Nom_Gestionnaire: '' },
  { Entreprise: 'C', Segment: 'Industriel / Commercial', Nom_Gestionnaire: 'Luc' },
  { Entreprise: 'D', Nom_Gestionnaire: '' },
])
check('Mélange : 2 lignes sur 4 à avertir', mixed.length === 2, `got ${mixed.length}`)

console.log(`\n${'='.repeat(50)}\nRESULTAT: ${ok} OK / ${fail} ECHEC(S)`)
process.exit(fail ? 1 : 0)
