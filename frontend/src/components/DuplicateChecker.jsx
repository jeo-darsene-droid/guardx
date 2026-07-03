import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, Loader2, Download, CopyCheck, AlertTriangle, HelpCircle } from 'lucide-react'

const API = '/api'

export default function DuplicateChecker({ showToast }) {
  const [prospectsFile, setProspectsFile] = useState(null)
  const [clientsFile, setClientsFile] = useState(null)
  const [threshold, setThreshold] = useState(85)
  const [prospectCol, setProspectCol] = useState('Adresse')
  const [clientCol, setClientCol] = useState('Adresse')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState(null)
  const [activeTab, setActiveTab] = useState('clean')

  const onDropProspects = useCallback((acceptedFiles) => {
    setProspectsFile(acceptedFiles[0] || null)
    setResults(null)
  }, [])

  const onDropClients = useCallback((acceptedFiles) => {
    setClientsFile(acceptedFiles[0] || null)
    setResults(null)
  }, [])

  const dzProspects = useDropzone({ onDrop: onDropProspects, multiple: false, accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] } })
  const dzClients = useDropzone({ onDrop: onDropClients, multiple: false, accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'], 'text/csv': ['.csv'] } })

  const handleRun = async () => {
    if (!prospectsFile || !clientsFile) {
      showToast('Veuillez téléverser les deux fichiers', 'error')
      return
    }
    setRunning(true)
    setProgress(15)

    const formData = new FormData()
    formData.append('prospects_file', prospectsFile)
    formData.append('clients_file', clientsFile)
    formData.append('threshold', threshold.toString())
    formData.append('prospect_col', prospectCol)
    formData.append('client_col', clientCol)

    try {
      setProgress(50)
      const res = await fetch(`${API}/check-duplicates`, { method: 'POST', body: formData })
      setProgress(85)
      if (!res.ok) throw new Error('Échec')
      const data = await res.json()
      setResults(data)
      setProgress(100)
      showToast(`${data.duplicates} doublons trouvés sur ${data.total} prospects`)
    } catch {
      showToast('Erreur lors de la vérification', 'error')
    } finally {
      setRunning(false)
      setTimeout(() => setProgress(0), 2000)
    }
  }

  const handleExport = async (rows, sheetName) => {
    try {
      const res = await fetch(`${API}/export-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, sheet_name: sheetName }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sheetName}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Export téléchargé')
    } catch {
      showToast('Erreur lors de l\'export', 'error')
    }
  }

  const tabs = [
    { key: 'clean', label: 'Liste nette', icon: CopyCheck, color: 'green', count: results?.clean || 0 },
    { key: 'duplicates', label: 'Doublons trouvés', icon: AlertTriangle, color: 'amber', count: results?.duplicates || 0 },
    { key: 'uncertain', label: 'Incertains', icon: HelpCircle, color: 'orange', count: results?.uncertain || 0 },
  ]

  const tabColors = {
    green: 'border-green-500 text-green-600 bg-green-50',
    amber: 'border-amber-500 text-amber-600 bg-amber-50',
    orange: 'border-orange-500 text-orange-600 bg-orange-50',
  }

  const currentRows = results ? (activeTab === 'clean' ? results.clean_rows : activeTab === 'duplicates' ? results.duplicate_rows : results.uncertain_rows) : []

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Vérificateur de doublons</h1>
        <p className="text-gray-500 text-sm mt-1">Comparez vos prospects avec votre base clients existante (correspondance floue)</p>
      </div>

      {/* Upload zones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-600 block mb-2">Ma liste de prospects</label>
          <div {...dzProspects.getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors min-h-[140px] flex flex-col items-center justify-center ${dzProspects.isDragActive ? 'border-accent bg-accent/5' : 'border-gray-300 hover:border-navy'}`}>
            <input {...dzProspects.getInputProps()} />
            {prospectsFile ? (
              <div className="flex flex-col items-center gap-1">
                <FileSpreadsheet className="text-green-600" size={32} />
                <p className="font-medium text-gray-700 text-sm">{prospectsFile.name}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="text-gray-400" size={32} />
                <p className="font-medium text-gray-600 text-sm">Glissez votre fichier prospects</p>
                <p className="text-xs text-gray-400">.xlsx, .xls</p>
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600 block mb-2">Base clients actuelle</label>
          <div {...dzClients.getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors min-h-[140px] flex flex-col items-center justify-center ${dzClients.isDragActive ? 'border-accent bg-accent/5' : 'border-gray-300 hover:border-navy'}`}>
            <input {...dzClients.getInputProps()} />
            {clientsFile ? (
              <div className="flex flex-col items-center gap-1">
                <FileSpreadsheet className="text-green-600" size={32} />
                <p className="font-medium text-gray-700 text-sm">{clientsFile.name}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="text-gray-400" size={32} />
                <p className="font-medium text-gray-600 text-sm">Glissez votre base clients</p>
                <p className="text-xs text-gray-400">.xlsx, .xls, .csv</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-600 block mb-2">Sensibilité de correspondance: <span className="text-navy font-bold">{threshold}%</span></label>
          <input type="range" min="50" max="100" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="w-full accent-navy" />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Bas (50%)</span>
            <span>Moyen (85%)</span>
            <span>Élevé (100%)</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Colonne d'adresse (prospects)</label>
            <input value={prospectCol} onChange={e => setProspectCol(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm" placeholder="Adresse" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Colonne d'adresse (clients)</label>
            <input value={clientCol} onChange={e => setClientCol(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy text-sm" placeholder="Adresse" />
          </div>
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={running || !prospectsFile || !clientsFile}
        className="flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {running ? <Loader2 className="animate-spin" size={20} /> : <CopyCheck size={20} />}
        {running ? 'Analyse en cours...' : 'Lancer la vérification'}
      </button>

      {progress > 0 && (
        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
          <div className="bg-accent h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Summary */}
          <div className="grid grid-cols-3 border-b border-gray-100">
            <div className="p-4 text-center">
              <p className="text-2xl font-bold text-navy">{results.total}</p>
              <p className="text-xs text-gray-500">Prospects analysés</p>
            </div>
            <div className="p-4 text-center border-l border-gray-100">
              <p className="text-2xl font-bold text-accent">{results.duplicates}</p>
              <p className="text-xs text-gray-500">Doublons trouvés</p>
            </div>
            <div className="p-4 text-center border-l border-gray-100">
              <p className="text-2xl font-bold text-green-600">{results.clean}</p>
              <p className="text-xs text-gray-500">Liste nette</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key ? tabColors[tab.color] : 'text-gray-500 hover:text-gray-700 border-transparent'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
                <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-gray-100">{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="max-h-[400px] overflow-auto">
            {currentRows.length === 0 ? (
              <p className="text-gray-400 text-sm py-8 text-center">Aucune donnée dans cette catégorie</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    {Object.keys(currentRows[0]).slice(0, 6).map(col => (
                      <th key={col} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map((row, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      {Object.keys(currentRows[0]).slice(0, 6).map(col => (
                        <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[180px] truncate">
                          {col === 'match_score' ? (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${row[col] >= 85 ? 'bg-red-100 text-red-700' : row[col] >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              {row[col]}%
                            </span>
                          ) : String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Download button */}
          {currentRows.length > 0 && (
            <div className="p-3 border-t border-gray-100">
              <button
                onClick={() => handleExport(currentRows, activeTab === 'clean' ? 'liste_nette' : activeTab === 'duplicates' ? 'doublons' : 'incertains')}
                className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light text-sm font-medium"
              >
                <Download size={16} />
                Exporter en Excel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
