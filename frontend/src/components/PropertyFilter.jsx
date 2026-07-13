import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, Loader2, Download, Building2, Filter, Send, Search } from 'lucide-react'

const API = '/api'

export default function PropertyFilter({ showToast }) {
  const [file, setFile] = useState(null)
  const [minUnits, setMinUnits] = useState(8)
  const [maxUnits, setMaxUnits] = useState(24)
  const [searchTerm, setSearchTerm] = useState('')
  const [yearMin, setYearMin] = useState('')
  const [yearMax, setYearMax] = useState('')
  const [condoOnly, setCondoOnly] = useState(true)
  const [utilFilter, setUtilFilter] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState(null)

  const onDrop = useCallback((acceptedFiles) => {
    setFile(acceptedFiles[0] || null)
    setResults(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  })

  const handleRun = async () => {
    if (!file) {
      showToast('Veuillez téléverser le fichier CSV', 'error')
      return
    }
    setRunning(true)
    setProgress(15)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('min_units', minUnits.toString())
    formData.append('max_units', maxUnits.toString())
    formData.append('search_term', searchTerm)
    formData.append('year_min', yearMin)
    formData.append('year_max', yearMax)
    formData.append('condo_only', condoOnly.toString())
    formData.append('util_filter', utilFilter)

    try {
      setProgress(40)
      const res = await fetch(`${API}/filter-properties`, { method: 'POST', body: formData })
      setProgress(80)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const errMsg = errData.error || `Erreur ${res.status}`
        showToast(`Erreur: ${errMsg}`, 'error')
        console.error('filter-properties error:', errData)
        return
      }
      const data = await res.json()
      setResults(data)
      setProgress(100)
      sessionStorage.setItem('req_buildings', JSON.stringify(data.all_rows || []))
      showToast(`${data.count} propriétés trouvées`)
    } catch (err) {
      showToast(`Erreur de connexion: ${err.message}`, 'error')
    } finally {
      setRunning(false)
      setTimeout(() => setProgress(0), 2000)
    }
  }

  const handleExport = async () => {
    if (!results?.all_rows?.length) return
    try {
      const res = await fetch(`${API}/export-properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: results.all_rows }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'prospects_coproprietes.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      showToast('Export téléchargé')
    } catch {
      showToast('Erreur lors de l\'export', 'error')
    }
  }

  const handleSendToProspects = async () => {
    if (!results?.all_rows?.length) return
    try {
      const res = await fetch(`${API}/prospects/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects: results.all_rows }),
      })
      const data = await res.json()
      showToast(`${data.added} prospects ajoutés au suivi (${data.total} total)`)
    } catch {
      showToast('Erreur lors de l\'envoi aux prospects', 'error')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Ciblage copropriétés</h1>
        <p className="text-gray-500 text-sm mt-1">Filtrez les données d'évaluation foncière de Montréal pour trouver des copropriétés</p>
      </div>

      {/* Upload */}
      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-accent bg-accent/5' : 'border-gray-300 hover:border-navy'}`}>
        <input {...getInputProps()} />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileSpreadsheet className="text-green-600" size={40} />
            <p className="font-medium text-gray-700">{file.name}</p>
            <p className="text-sm text-gray-400">{(file.size / (1024 * 1024)).toFixed(1)} Mo — Cliquez pour changer</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="text-gray-400" size={40} />
            <p className="font-medium text-gray-600">Glissez votre fichier CSV ici</p>
            <p className="text-sm text-gray-400">uniteevaluationfonciere.csv — Données de Montréal</p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-navy" />
          <h3 className="font-semibold text-navy">Filtres</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Unités min.</label>
            <input type="number" value={minUnits} onChange={e => setMinUnits(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Unités max.</label>
            <input type="number" value={maxUnits} onChange={e => setMaxUnits(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Année min.</label>
            <input type="number" value={yearMin} onChange={e => setYearMin(e.target.value)} placeholder="Ex: 1980" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Année max.</label>
            <input type="number" value={yearMax} onChange={e => setYearMax(e.target.value)} placeholder="Ex: 2020" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600 block mb-1">Secteur / Rue</label>
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Ex: Anjou, Beaubien, Rosemont..." className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={condoOnly} onChange={e => setCondoOnly(e.target.checked)} className="accent-navy w-4 h-4" />
            <span className="text-sm font-medium text-gray-600">Condominium uniquement</span>
          </label>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600 block mb-1">Code d'utilisation (optionnel)</label>
          <input value={utilFilter} onChange={e => setUtilFilter(e.target.value)} placeholder="Ex: 1000,1100 — vide = tous" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
        </div>
      </div>

      {/* Run */}
      <button
        onClick={handleRun}
        disabled={running || !file}
        className="flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {running ? <Loader2 className="animate-spin" size={20} /> : <Building2 size={20} />}
        {running ? 'Filtrage en cours...' : 'Lancer le filtrage'}
      </button>

      {progress > 0 && (
        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
          <div className="bg-accent h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-navy" />
              <span className="font-semibold text-navy">{results.count} propriétés trouvées</span>
            </div>
            <div className="flex gap-2">
              <a href="/croisement-req" className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-light text-sm font-medium">
                <Search size={16} />
                Croisement REQ
              </a>
              <button onClick={handleSendToProspects} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                <Send size={16} />
                Envoyer aux prospects
              </button>
              <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light text-sm font-medium">
                <Download size={16} />
                Exporter en Excel
              </button>
            </div>
          </div>

          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Adresse</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Unités</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Ville/Arr.</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {results.rows.map((row, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate">{row.Adresse}</td>
                    <td className="px-3 py-2 text-gray-700">{row.Nb_Unites}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.Ville_CodePostal}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[200px] truncate">{row.Notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
