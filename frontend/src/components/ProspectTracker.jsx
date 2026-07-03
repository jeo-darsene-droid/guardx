import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, Download, Users, Search, Phone, Check } from 'lucide-react'

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

  const handleDelete = (id) => {
    updateProspects(prospects.filter(p => p.id !== id))
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Mes prospects</h1>
          <p className="text-gray-500 text-sm mt-1">Suivez et gérez votre pipeline de prospection</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light text-sm font-medium">
            <Upload size={16} />
            Importer
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

      {/* Table */}
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
                      <td className="px-4 py-3 text-gray-700 font-medium">{p.entreprise || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{p.contact || '—'}</td>
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
                      <td className="px-3 py-3 flex items-center gap-1 justify-center">
                        <button
                          onClick={() => handleMarkContacted(p.id)}
                          title={p.contacte ? 'Marquer non contacté' : 'Marquer contacté'}
                          className={`p-1.5 rounded ${p.contacte ? 'text-green-600 hover:bg-green-100' : 'text-gray-400 hover:bg-gray-100'}`}
                        >
                          <Phone size={14} />
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
    </div>
  )
}
