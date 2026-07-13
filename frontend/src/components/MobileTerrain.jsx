import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, ChevronDown, ChevronUp, Phone, Footprints, Mail, User, MapPin, Building2, ArrowLeft, Loader2 } from 'lucide-react'

const API = '/api'

export default function MobileTerrain({ showToast }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [pitchOpen, setPitchOpen] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const searchTimer = useRef(null)
  const resultsRef = useRef(null)

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`${API}/prospects/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  const onSearchChange = (val) => {
    setQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearch(val), 300)
  }

  const selectProspect = (p) => {
    setSelected(p)
    setPitchOpen(true)
    setResults([])
    setQuery('')
  }

  const handleQuickAction = async (action) => {
    if (!selected) return
    setActionLoading(action)
    try {
      const res = await fetch(`${API}/prospects/quick-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: selected.id, action }),
      })
      const data = await res.json()
      if (res.ok) {
        const labels = {
          visite_absent: 'Visite — absent enregistré',
          visite_rencontre: 'Visite — rencontré enregistré',
          retour_entrant: 'Retour entrant enregistré',
        }
        showToast(labels[action] || 'Action enregistrée')
        // Update selected with new status
        setSelected(prev => ({
          ...prev,
          statut: action === 'visite_absent' ? 'À repasser' : 'Contacté – à rappeler',
          contacte: true,
        }))
      } else {
        showToast(data.error || 'Erreur', 'error')
      }
    } catch {
      showToast('Erreur de connexion', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const pitchText = selected
    ? `Bonjour, je viens voir ${selected.contact || selected.entreprise || 'le responsable'} — Jéo de Guard-X, je lui ai envoyé une lettre la semaine passée concernant la protection incendie.`
    : ''

  return (
    <div className="min-h-screen bg-light-grey flex flex-col">
      {/* Persistent search bar — pinned at top */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-gray-100 shrink-0"
          >
            <ArrowLeft size={20} className="text-navy" />
          </button>
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Nom ou adresse..."
              autoFocus
              className="w-full pl-10 pr-10 py-3 text-base rounded-xl border border-gray-200 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]) }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X size={18} className="text-gray-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search results */}
      {query && !selected && (
        <div ref={resultsRef} className="flex-1 overflow-y-auto px-4 py-3">
          {searching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-accent animate-spin" size={28} />
            </div>
          ) : results.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">Aucun résultat</p>
          ) : (
            <div className="space-y-2">
              {results.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectProspect(p)}
                  className="w-full text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-accent transition-colors active:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy truncate">{p.entreprise || '—'}</p>
                      <p className="text-sm text-gray-500 truncate flex items-center gap-1 mt-0.5">
                        <MapPin size={14} className="shrink-0" />
                        {p.adresse || '—'}
                      </p>
                    </div>
                    {p._score < 100 && (
                      <span className="text-xs text-gray-400 shrink-0">{p._score}%</span>
                    )}
                  </div>
                  {p.contact && (
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <User size={12} /> {p.contact}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fiche prospect */}
      {selected && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-navy">{selected.entreprise || '—'}</h2>
                {selected.contact && (
                  <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                    <User size={16} /> {selected.contact}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 rounded-lg hover:bg-gray-100 shrink-0"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin size={16} className="text-gray-400" />
                {selected.adresse || '—'}
              </div>
              {selected.ville && (
                <div className="flex items-center gap-2 text-gray-500 text-xs ml-6">{selected.ville}</div>
              )}
              {selected.telephone && (
                <a href={`tel:${selected.telephone}`} className="flex items-center gap-2 text-navy font-medium">
                  <Phone size={16} /> {selected.telephone}
                </a>
              )}
              {selected.zone && (
                <div className="flex items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${selected.zone === 'Hors zone' ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700'}`}>
                    {selected.zone}
                  </span>
                  {selected.rue && <span className="text-gray-400 capitalize">{selected.rue}</span>}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-400 pt-1">
                <span className="font-medium">Statut:</span> {selected.statut || '—'}
              </div>
            </div>
          </div>

          {/* Pitch comptoir — collapsible */}
          <div className="bg-navy rounded-xl p-4 text-white">
            <button
              onClick={() => setPitchOpen(!pitchOpen)}
              className="w-full flex items-center justify-between"
            >
              <span className="font-semibold text-sm flex items-center gap-2">
                <Building2 size={16} className="text-accent" />
                Pitch comptoir
              </span>
              {pitchOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {pitchOpen && (
              <p className="mt-3 text-sm leading-relaxed text-white/90 italic">
                « {pitchText} »
              </p>
            )}
          </div>

          {/* Quick actions — large thumb-friendly buttons */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-1">Actions rapides</p>
            <button
              onClick={() => handleQuickAction('visite_absent')}
              disabled={actionLoading !== null}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-xl bg-amber-500 text-white font-semibold text-base active:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'visite_absent' ? <Loader2 size={24} className="animate-spin" /> : <Footprints size={24} />}
              Visite — Absent
            </button>
            <button
              onClick={() => handleQuickAction('visite_rencontre')}
              disabled={actionLoading !== null}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-xl bg-green-600 text-white font-semibold text-base active:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'visite_rencontre' ? <Loader2 size={24} className="animate-spin" /> : <User size={24} />}
              Visite — Rencontre
            </button>
            <button
              onClick={() => handleQuickAction('retour_entrant')}
              disabled={actionLoading !== null}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-xl bg-accent text-white font-semibold text-base active:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'retour_entrant' ? <Loader2 size={24} className="animate-spin" /> : <Mail size={24} />}
              Retour entrant
            </button>
          </div>

          {/* Notes */}
          {selected.notes && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Notes</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{selected.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!query && !selected && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <Search size={48} className="text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">Recherchez un prospect par nom ou adresse pour ouvrir sa fiche</p>
        </div>
      )}
    </div>
  )
}
