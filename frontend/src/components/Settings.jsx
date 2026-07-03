import { useState } from 'react'
import { Save, Upload, User, Phone, Mail, FileImage, Briefcase } from 'lucide-react'

const API = '/api'

export default function Settings({ config, setConfig, showToast }) {
  const [form, setForm] = useState({
    rep_name: config?.rep_name || 'Jéo-Darsène Saint-Louis',
    rep_title: config?.rep_title || 'Gestionnaire de comptes clients',
    phone: config?.phone || '438-406-5077',
    email: config?.email || 'jdsaintlouis@guard-x.com',
    default_mode: config?.default_mode || 'postal',
    logo_path: config?.logo_path || 'assets/guardx_logo.png',
  })
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      setConfig(data.config)
      showToast('Paramètres enregistrés')
    } catch {
      showToast('Erreur lors de l\'enregistrement', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingLogo(true)

    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API}/upload-logo`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      showToast('Logo mis à jour')
    } catch {
      showToast('Erreur lors du téléversement du logo', 'error')
    } finally {
      setUploadingLogo(false)
    }
  }

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Paramètres</h1>
        <p className="text-gray-500 text-sm mt-1">Configurez vos préférences par défaut</p>
      </div>

      {/* Rep settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-navy">Informations du représentant</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 flex items-center gap-2 mb-1">
              <User size={14} /> Nom du représentant
            </label>
            <input value={form.rep_name} onChange={e => update('rep_name', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 flex items-center gap-2 mb-1">
              <Briefcase size={14} /> Titre / Fonction
            </label>
            <input value={form.rep_title} onChange={e => update('rep_title', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 flex items-center gap-2 mb-1">
              <Phone size={14} /> Téléphone
            </label>
            <input value={form.phone} onChange={e => update('phone', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 flex items-center gap-2 mb-1">
              <Mail size={14} /> Courriel
            </label>
            <input value={form.email} onChange={e => update('email', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-navy" />
          </div>
        </div>
      </div>

      {/* Default mode */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-navy">Mode par défaut</h3>
        <div className="flex gap-4">
          <label className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${form.default_mode === 'postal' ? 'border-navy bg-navy/5' : 'border-gray-200'}`}>
            <input type="radio" checked={form.default_mode === 'postal'} onChange={() => update('default_mode', 'postal')} className="accent-navy" />
            <span className="font-medium text-gray-700">Mode postal</span>
          </label>
          <label className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${form.default_mode === 'dépôt' ? 'border-navy bg-navy/5' : 'border-gray-200'}`}>
            <input type="radio" checked={form.default_mode === 'dépôt'} onChange={() => update('default_mode', 'dépôt')} className="accent-navy" />
            <span className="font-medium text-gray-700">Mode dépôt</span>
          </label>
        </div>
      </div>

      {/* Logo upload */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-navy">Logo de l'entreprise</h3>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-lg border-2 border-gray-200 flex items-center justify-center bg-light-grey overflow-hidden">
            <img src={`${API.replace('/api', '')}/assets/guardx_logo.png`} alt="Logo" className="max-w-full max-h-full object-contain" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
            <div className="hidden w-full h-full items-center justify-center text-gray-400 text-xs text-center px-2">Aperçu<br/>indisponible</div>
          </div>
          <div>
            <label className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light text-sm font-medium cursor-pointer">
              {uploadingLogo ? 'Téléversement...' : (
                <>
                  <Upload size={16} />
                  Changer le logo
                </>
              )}
              <input type="file" accept="image/png,image/jpeg" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
            </label>
            <p className="text-xs text-gray-400 mt-2">PNG ou JPG. Remplace guardx_logo.png</p>
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-light disabled:opacity-50 transition-colors"
      >
        <Save size={20} />
        {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
      </button>
    </div>
  )
}
