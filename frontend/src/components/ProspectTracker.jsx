import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Upload, Download, Users, Search, Phone, Check, Mail, AlertTriangle, MapPin, UserCheck, ArrowDownToLine, X, List, Map, UserPlus } from 'lucide-react'

const API = '/api'

const STATUS_OPTIONS = [
  { value: 'À contacter / À appeler', color: 'bg-blue-100 text-blue-700', dot: '🔵' },
  { value: 'Message laissé', color: 'bg-purple-100 text-purple-700', dot: '🟣' },
  { value: 'Contacté – intéressé', color: 'bg-teal-100 text-teal-700', dot: '🟢' },
  { value: 'Contacté – à rappeler', color: 'bg-cyan-100 text-cyan-700', dot: '📞' },
  { value: 'Rencontre prévue', color: 'bg-indigo-100 text-indigo-700', dot: '📅' },
  { value: 'Courriel envoyé', color: 'bg-yellow-100 text-yellow-700', dot: '🟡' },
  { value: 'En attente (rapport/réponse)', color: 'bg-orange-100 text-orange-700', dot: '🟠' },
  { value: 'Soumission envoyée', color: 'bg-green-100 text-green-700', dot: '�' },
  { value: 'Soumission révisée', color: 'bg-lime-100 text-lime-700', dot: '📝' },
  { value: 'En fermeture', color: 'bg-sky-100 text-sky-700', dot: '🤝' },
  { value: 'Vendu / Signé', color: 'bg-emerald-100 text-emerald-700', dot: '✅' },
  { value: 'Récupéré (signé)', color: 'bg-emerald-100 text-emerald-800', dot: '♻️' },
  { value: 'Perdu (revisiter année suivante)', color: 'bg-red-100 text-red-700', dot: '❌' },
  { value: 'Hors d\'affaires', color: 'bg-gray-200 text-gray-600', dot: '⚫' },
  { value: 'À repasser', color: 'bg-amber-100 text-amber-700', dot: '🔁' },
]

const SEGMENT_OPTIONS = [
  'Syndicat de copropriété',
  'Locatif',
  'Restaurant / Bar',
  'Hôtel',
  'Industriel / Commercial',
  'Multi-sites',
  'Partenariat',
  'Ancien client (win-back)',
  'Autre',
]

// Anciens statuts (v1) → nouveaux statuts
const LEGACY_STATUS_MAP = {
  'À contacter': 'À contacter / À appeler',
  'En attente': 'En attente (rapport/réponse)',
  'Vendu': 'Vendu / Signé',
  'Perdu': 'Perdu (revisiter année suivante)',
}

// Statuts qui indiquent qu'une lettre a été envoyée
const LETTER_SENT_STATUSES = new Set([
  'Courriel envoyé', 'Contacté – à rappeler', 'Contacté – intéressé', 'Rencontre prévue',
  'En attente (rapport/réponse)', 'Soumission envoyée', 'Soumission révisée',
  'En fermeture', 'Vendu / Signé', 'Récupéré (signé)', 'À repasser',
  'Perdu (revisiter année suivante)', "Hors d'affaires",
])

// Statuts qui indiquent qu'une visite a été faite
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
  const notes = (p.notes || '').toLowerCase()
  // Follow-up done: statut has progressed beyond 'Courriel envoyé'
  if (VISITED_STATUSES.has(s) || s === 'Perdu (revisiter année suivante)' || s === "Hors d'affaires") return true
  // Or: 'Courriel envoyé' but next_action date has passed (follow-up window elapsed)
  if (s === 'Courriel envoyé') {
    const today = new Date().toISOString().split('T')[0]
    const na = p.next_action || ''
    return !na || na <= today
  }
  return false
}

const getStatusStyle = (status) => {
  const mapped = LEGACY_STATUS_MAP[status] || status
  return STATUS_OPTIONS.find(s => s.value === mapped) || STATUS_OPTIONS[0]
}

export default function ProspectTracker({ showToast }) {
  const [prospects, setProspects] = useState([])
  const [filterStatus, setFilterStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [filterContacted, setFilterContacted] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const fileRef = useRef(null)
  const contactFileRef = useRef(null)
  const [quickAction, setQuickAction] = useState(null) // { prospect, type, nom, telephone, email, notes }
  const [viewMode, setViewMode] = useState('liste') // 'liste' | 'rue'

  // Load persisted prospects on mount
  useEffect(() => {
    fetch(`${API}/prospects`)
      .then(r => r.json())
      .then(data => { setProspects(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Save to backend whenever prospects change
  const saveToBackend = useCallback((updated) => {
    fetch(`${API}/prospects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospects: updated }),
    }).catch(() => {})
  }, [])

  const updateProspects = (updated) => {
    setProspects(updated)
    saveToBackend(updated)
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API}/import-prospects`, { method: 'POST', body: formData })
      const data = await res.json()
      const allRows = data.rows || []

      // Garde-fou : vérification automatique contre la base clients
      try {
        const checkRes = await fetch(`${API}/clients/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: allRows, address_field: 'Adresse' }),
        })
        const check = await checkRes.json()
        if (check.checked && check.flagged > 0) {
          const names = check.results.slice(0, 3).map(r => r.client).join(', ')
          showToast(`⚠️ ${check.flagged} adresse(s) correspondent à des clients existants (${names}${check.flagged > 3 ? '…' : ''})`, 'error')
        }
      } catch { /* base clients indisponible — on continue */ }

      const newProspects = allRows.map((r, i) => ({
        id: Date.now() + i,
        entreprise: r.Entreprise || r.Nom_Syndicat || '',
        contact: r.Contact || r.Nom_Gestionnaire || '',
        telephone: r.Téléphone || r.Telephone || r.phone || '',
        statut: LEGACY_STATUS_MAP[r.Statut] || r.Statut || 'À contacter / À appeler',
        segment: r.Segment || '',
        next_action: r.Prochaine_Action || r.next_action || '',
        date: r.Date || new Date().toISOString().split('T')[0],
        notes: r.Notes || '',
        adresse: r.Adresse || '',
        ville: r.Ville_CodePostal || '',
        nb_unites: r.Nb_Unites || '',
        secteur: r.Secteur || '',
        contacte: r.Contacted === 'true' || r.contacte === true || false,
        date_contact: r.Date_Contact || r.date_contact || '',
      }))
      const merged = [...prospects, ...newProspects]
      updateProspects(merged)
      showToast(`${newProspects.length} prospects importés`)
    } catch {
      showToast('Erreur lors de l\'import', 'error')
    }
  }

  const handleStatusChange = (id, newStatus) => {
    updateProspects(prospects.map(p => p.id === id ? { ...p, statut: newStatus } : p))
  }

  const handleImportContacts = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API}/prospects/import-contacts`, { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) {
        const msg = `${data.updated} noms de décideurs importés` +
          (data.skipped_existing ? `, ${data.skipped_existing} déjà renseignés` : '') +
          (data.not_found ? `, ${data.not_found} non trouvés` : '')
        showToast(msg)
        // Reload prospects from backend
        fetch(`${API}/prospects`).then(r => r.json()).then(d => setProspects(d))
      } else {
        showToast(data.error || 'Erreur lors de l\'import', 'error')
      }
    } catch {
      showToast('Erreur de connexion', 'error')
    }
    e.target.value = ''
  }

  const handleNextActionChange = (id, newDate) => {
    updateProspects(prospects.map(p => p.id === id ? { ...p, next_action: newDate } : p))
  }

  const handleSegmentChange = (id, newSegment) => {
    updateProspects(prospects.map(p => p.id === id ? { ...p, segment: newSegment } : p))
  }

  const handleMarkContacted = (id) => {
    const today = new Date().toISOString().split('T')[0]
    updateProspects(prospects.map(p => p.id === id ? { ...p, contacte: !p.contacte, date_contact: !p.contacte ? today : '' } : p))
  }

  const handleSecondLetter = (id) => {
    const today = new Date().toISOString().split('T')[0]
    updateProspects(prospects.map(p => p.id === id ? {
      ...p,
      contacte: true,
      date_contact: today,
      statut: 'Courriel envoyé',
      notes: (p.notes ? p.notes + ' | ' : '') + '2e lettre envoyée ' + today,
    } : p))
    showToast('2e lettre marquée')
  }

  const isNoCallSegment = (segment) => {
    const s = (segment || '').toLowerCase()
    return s === 'syndicat de copropriété' || s === 'locatif'
  }

  const isIndustrielCommercial = (segment) => {
    const s = (segment || '').toLowerCase()
    return s === 'industriel / commercial' || s === 'industriel/commercial'
  }

  const handleDelete = (id) => {
    updateProspects(prospects.filter(p => p.id !== id))
  }

  const addDays = (days) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  }

  const handleQuickAction = async () => {
    if (!quickAction) return
    const { prospect, type } = quickAction
    try {
      const res = await fetch(`${API}/prospects/quick-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospect.id,
          action: type,
          nom: quickAction.nom || '',
          telephone: quickAction.telephone || '',
          email: quickAction.email || '',
          notes: quickAction.notes || '',
        }),
      })
      const data = await res.json()
      if (data.status === 'ok') {
        // Refresh prospects from backend to reflect the update
        fetch(`${API}/prospects`).then(r => r.json()).then(pdata => setProspects(pdata))
        const labels = {
          visite_absent: 'Visite — absent enregistré',
          visite_rencontre: 'Visite — rencontré enregistré',
          retour_entrant: 'Retour entrant enregistré',
        }
        showToast(labels[type] || 'Action enregistrée')
      }
    } catch {
      showToast('Erreur lors de l\'action', 'error')
    }
    setQuickAction(null)
  }

  const handleExport = async () => {
    if (prospects.length === 0) {
      showToast('Aucun prospect à exporter', 'error')
      return
    }
    try {
      const res = await fetch(`${API}/export-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: prospects, sheet_name: 'prospects' }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mes_prospects.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      showToast('Prospects exportés')
    } catch {
      showToast('Erreur lors de l\'export', 'error')
    }
  }

  const filtered = prospects.filter(p => {
    if (filterStatus && p.statut !== filterStatus) return false
    if (filterContacted === 'yes' && !p.contacte) return false
    if (filterContacted === 'no' && p.contacte) return false
    if (filterLocation) {
      const loc = filterLocation.toLowerCase()
      const ville = String(p.ville || '').toLowerCase()
      const secteur = String(p.secteur || '').toLowerCase()
      const addr = String(p.adresse || '').toLowerCase()
      if (!ville.includes(loc) && !secteur.includes(loc) && !addr.includes(loc)) return false
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matches = String(p.entreprise || '').toLowerCase().includes(q)
        || String(p.contact || '').toLowerCase().includes(q)
        || String(p.adresse || '').toLowerCase().includes(q)
        || String(p.ville || '').toLowerCase().includes(q)
        || String(p.secteur || '').toLowerCase().includes(q)
        || String(p.notes || '').toLowerCase().includes(q)
      if (!matches) return false
    }
    if (dateFrom && p.date < dateFrom) return false
    if (dateTo && p.date > dateTo) return false
    return true
  })

  // Build unique location options from prospect data
  const locationOptions = [...new Set(
    prospects.flatMap(p => [p.ville, p.secteur].filter(Boolean))
  )].sort()

  const stats = STATUS_OPTIONS.map(s => ({
    ...s,
    count: prospects.filter(p => p.statut === s.value).length,
  }))

  const contactedCount = prospects.filter(p => p.contacte).length

  // Street tracker data: group by zone → rue
  const streetData = useMemo(() => {
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
          rue: rueName,
          total: pros.length,
          lettres: pros.filter(hasLettre).length,
          visites: pros.filter(hasVisite).length,
          repasser: pros.filter(p => p.statut === 'À repasser').length,
          retours: pros.filter(hasRetour).length,
          vendus: pros.filter(isVendu).length,
          completed,
          pct: pros.length ? Math.round(completed / pros.length * 100) : 0,
          isDone: completed === pros.length && pros.length > 0,
        })
      }
      zoneStreets.sort((a, b) => b.total - a.total)
      const doneStreets = zoneStreets.filter(s => s.isDone).length
      result.push({
        zone: zoneName,
        streets: zoneStreets,
        doneStreets,
        totalStreets: zoneStreets.length,
        pct: zoneStreets.length ? Math.round(doneStreets / zoneStreets.length * 100) : 0,
      })
    }
    result.sort((a, b) => a.zone.localeCompare(b.zone))
    return result
  }, [prospects])

  const traiteCount = prospects.filter(isCompleted).length
  const COUVERTURE_OBJECTIF = 1500

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Mes prospects</h1>
          <p className="text-gray-500 text-sm mt-1">Suivez et gérez votre pipeline de prospection</p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Toggle Liste / Par rue */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('liste')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'liste' ? 'bg-white text-navy shadow-sm' : 'text-gray-500'}`}
            >
              <List size={16} />
              Liste
            </button>
            <button
              onClick={() => setViewMode('rue')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'rue' ? 'bg-white text-navy shadow-sm' : 'text-gray-500'}`}
            >
              <Map size={16} />
              Par rue
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light text-sm font-medium">
            <Upload size={16} />
            Importer
          </button>
          <input ref={contactFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportContacts} className="hidden" />
          <button onClick={() => contactFileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium">
            <UserPlus size={16} />
            Noms de décideurs
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-light text-sm font-medium">
            <Download size={16} />
            Exporter
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
        {stats.filter(s => s.count > 0).map(s => (
          <div key={s.value} className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 text-center">
            <div className="text-xl mb-0.5">{s.dot}</div>
            <div className="text-xl font-bold text-navy">{s.count}</div>
            <div className="text-xs text-gray-500 truncate">{s.value}</div>
          </div>
        ))}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 text-center">
          <div className="text-xl mb-0.5">📞</div>
          <div className="text-xl font-bold text-green-600">{contactedCount}</div>
          <div className="text-xs text-gray-500 truncate">Contactés</div>
        </div>
      </div>

      {/* KPI Couverture Anjou */}
      <div className="bg-gradient-to-r from-navy to-navy-light rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white/80">Couverture Anjou</h3>
            <p className="text-2xl font-bold mt-1">{traiteCount} <span className="text-white/60 text-lg font-normal">/ ~{COUVERTURE_OBJECTIF} entreprises traitées</span></p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{Math.round(traiteCount / COUVERTURE_OBJECTIF * 100)}%</div>
            <div className="text-xs text-white/60 mt-0.5">de l'objectif</div>
          </div>
        </div>
        <div className="mt-3 w-full bg-white/20 rounded-full h-2.5 overflow-hidden">
          <div className="bg-accent h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.round(traiteCount / COUVERTURE_OBJECTIF * 100))}%` }} />
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher par nom, rue, ville..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm" />
        </div>
        <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm">
          <option value="">Tous les secteurs</option>
          {locationOptions.map((loc, i) => <option key={i} value={loc}>{loc}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm">
          <option value="">Tous les statuts</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
        </select>
        <select value={filterContacted} onChange={e => setFilterContacted(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm">
          <option value="">Tous (contacté)</option>
          <option value="yes">Contactés</option>
          <option value="no">Non contactés</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm" />
      </div>

      {/* Street tracker view */}
      {viewMode === 'rue' && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 py-16 text-center">
              <p className="text-gray-400">Chargement...</p>
            </div>
          ) : streetData.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 py-16 text-center">
              <Users size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Aucun prospect à afficher.</p>
            </div>
          ) : (
            streetData.map(zd => (
              <div key={zd.zone} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Zone header */}
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-navy">{zd.zone}</h3>
                    <span className="text-xs text-gray-400">{zd.doneStreets}/{zd.totalStreets} rues complétées</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${zd.pct === 100 ? 'bg-green-500' : 'bg-navy'}`} style={{ width: `${zd.pct}%` }} />
                    </div>
                    <span className={`text-sm font-bold ${zd.pct === 100 ? 'text-green-600' : 'text-navy'}`}>{zd.pct}%</span>
                  </div>
                </div>
                {/* Street rows */}
                <div className="divide-y divide-gray-50">
                  {zd.streets.map(sd => (
                    <div key={sd.rue} className={`px-5 py-3 hover:bg-gray-50/50 transition-colors ${sd.isDone ? 'bg-green-50/40' : ''}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${sd.isDone ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span className="font-medium text-gray-700 capitalize">{sd.rue}</span>
                          <span className="text-xs text-gray-400">({sd.total} prospects)</span>
                        </div>
                        <span className={`text-xs font-bold ${sd.isDone ? 'text-green-600' : 'text-gray-500'}`}>
                          {sd.completed}/{sd.total} traités · {sd.pct}%
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden mb-2">
                        <div className={`h-full rounded-full transition-all ${sd.isDone ? 'bg-green-500' : 'bg-accent'}`} style={{ width: `${sd.pct}%` }} />
                      </div>
                      {/* Count badges */}
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">📮 Lettres: {sd.lettres}</span>
                        <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">🚶 Visites: {sd.visites}</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">🔁 À repasser: {sd.repasser}</span>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">↩ Retours: {sd.retours}</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">✅ Vendus: {sd.vendus}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Table (liste view) */}
      {viewMode === 'liste' && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <p className="text-gray-400">Chargement...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">Aucun prospect. Importez un fichier Excel ou envoyez des propriétés depuis le Ciblage copropriétés.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-gray-600">Contacté</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Entreprise</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Contact</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Téléphone</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Adresse</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Segment</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Statut</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Prochaine action</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Dernier contact</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Notes</th>
                  <th className="px-3 py-3 text-center font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const st = getStatusStyle(p.statut)
                  return (
                    <tr key={p.id} className={`border-t border-gray-50 hover:bg-gray-50/50 ${p.contacte ? 'bg-green-50/30' : ''}`}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={p.contacte || false}
                          onChange={() => handleMarkContacted(p.id)}
                          className="w-4 h-4 accent-green-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">
                        {p.entreprise || '—'}
                        {isIndustrielCommercial(p.segment) && !p.contact && (
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 whitespace-nowrap">
                            <AlertTriangle size={10} />
                            Nom de décideur manquant
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {p.contact || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{p.telephone || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{p.adresse || '—'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={p.segment || ''}
                          onChange={e => handleSegmentChange(p.id, e.target.value)}
                          className="px-2 py-1 rounded-lg text-xs border border-gray-200 cursor-pointer text-gray-600 max-w-[140px]"
                        >
                          <option value="">—</option>
                          {SEGMENT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={LEGACY_STATUS_MAP[p.statut] || p.statut}
                          onChange={e => handleStatusChange(p.id, e.target.value)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${st.color}`}
                        >
                          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.dot} {s.value}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="date"
                          value={p.next_action || ''}
                          onChange={e => handleNextActionChange(p.id, e.target.value)}
                          className={`px-2 py-1 rounded-lg text-xs border cursor-pointer ${
                            p.next_action && p.next_action < new Date().toISOString().split('T')[0]
                              ? 'border-red-300 bg-red-50 text-red-700 font-medium'
                              : 'border-gray-200 text-gray-600'
                          }`}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p.date}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {p.date_contact ? (
                          <span className="text-green-600 font-medium">{p.date_contact}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[150px] truncate">{p.notes || ''}</td>
                      <td className="px-3 py-3 flex items-center gap-1 justify-center flex-wrap">
                        {isNoCallSegment(p.segment) ? (
                          <button
                            onClick={() => handleSecondLetter(p.id)}
                            title="2e lettre"
                            className="p-1.5 rounded text-blue-500 hover:bg-blue-100"
                          >
                            <Mail size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleMarkContacted(p.id)}
                            title={p.contacte ? 'Marquer non contacté' : 'Marquer contacté'}
                            className={`p-1.5 rounded ${p.contacte ? 'text-green-600 hover:bg-green-100' : 'text-gray-400 hover:bg-gray-100'}`}
                          >
                            <Phone size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => setQuickAction({ prospect: p, type: 'visite_absent', nom: '', telephone: '', email: '' })}
                          title="Visite faite — Absent"
                          className="p-1.5 rounded text-amber-600 hover:bg-amber-100"
                        >
                          <MapPin size={14} />
                        </button>
                        <button
                          onClick={() => setQuickAction({ prospect: p, type: 'visite_rencontre', notes: '' })}
                          title="Visite faite — Rencontré"
                          className="p-1.5 rounded text-teal-600 hover:bg-teal-100"
                        >
                          <UserCheck size={14} />
                        </button>
                        <button
                          onClick={() => setQuickAction({ prospect: p, type: 'retour_entrant' })}
                          title="Retour entrant"
                          className="p-1.5 rounded text-indigo-600 hover:bg-indigo-100"
                        >
                          <ArrowDownToLine size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          title="Supprimer"
                          className="p-1.5 rounded text-red-400 hover:bg-red-100"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Quick action modal */}
      {quickAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-navy text-lg">
                {quickAction.type === 'visite_absent' && 'Visite faite — Absent'}
                {quickAction.type === 'visite_rencontre' && 'Visite faite — Rencontré'}
                {quickAction.type === 'retour_entrant' && 'Retour entrant'}
              </h3>
              <button onClick={() => setQuickAction(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{quickAction.prospect.entreprise || '—'}</span>
              {' — '}{quickAction.prospect.adresse || '—'}
            </p>

            {quickAction.type === 'visite_absent' && (
              <div className="space-y-3 mb-5">
                <p className="text-xs text-gray-400">Complétez les infos si disponibles (optionnel) :</p>
                <div>
                  <label className="text-sm font-medium text-gray-600 block mb-1">Nom confirmé</label>
                  <input
                    value={quickAction.nom || ''}
                    onChange={e => setQuickAction({ ...quickAction, nom: e.target.value })}
                    placeholder="Nom du décideur"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 block mb-1">Téléphone</label>
                  <input
                    value={quickAction.telephone || ''}
                    onChange={e => setQuickAction({ ...quickAction, telephone: e.target.value })}
                    placeholder="514-xxx-xxxx"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 block mb-1">Courriel</label>
                  <input
                    value={quickAction.email || ''}
                    onChange={e => setQuickAction({ ...quickAction, email: e.target.value })}
                    placeholder="courriel@exemple.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm"
                  />
                </div>
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                  Statut → « À repasser » · Prochaine action → {addDays(3)} (Bloc d'appels mar-jeu)
                </p>
              </div>
            )}

            {quickAction.type === 'visite_rencontre' && (
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-sm font-medium text-gray-600 block mb-1">Notes de la rencontre</label>
                  <textarea
                    value={quickAction.notes || ''}
                    onChange={e => setQuickAction({ ...quickAction, notes: e.target.value })}
                    placeholder="Détails de la conversation, intérêt, prochaines étapes..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm resize-none"
                  />
                </div>
                <p className="text-xs text-teal-600 bg-teal-50 rounded-lg p-2">
                  Statut → « Contacté – à rappeler »
                </p>
              </div>
            )}

            {quickAction.type === 'retour_entrant' && (
              <div className="mb-5">
                <p className="text-sm text-gray-600 bg-indigo-50 rounded-lg p-3">
                  Le prospect nous a contactés (appel ou courriel). Statut → « Contacté – à rappeler » · Prochaine action → {addDays(1)}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setQuickAction(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleQuickAction}
                className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-light text-sm font-medium"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
