# Guard-X Protection Incendie — Dashboard de Prospection

Application web full-stack pour automatiser la prospection de Guard-X Protection Incendie :
génération de lettres personnalisées, détection de doublons, ciblage de copropriétés,
suivi de prospects avec relances, et rapport mensuel automatique.

📖 **Comment utiliser l'app au quotidien → [`GUIDE_UTILISATEUR.md`](GUIDE_UTILISATEUR.md)**

---

## Prérequis

| Outil | Version | Vérifier avec |
|---|---|---|
| Python | 3.10+ | `python --version` |
| Node.js | 18+ | `node --version` |
| Compte Supabase | gratuit | https://supabase.com |

## Configuration (une seule fois)

### 1. Fichier `.env`

Créez un fichier `.env` à la **racine du projet** (ou dans `backend/`) :

```env
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_KEY=votre-cle-service
```

> 🔑 Ces valeurs se trouvent dans Supabase → Project Settings → API.
> ⚠️ Ne JAMAIS committer ce fichier (il est dans `.gitignore`).

### 2. Tables Supabase

Dans Supabase → **SQL Editor**, exécutez dans l'ordre :

1. `supabase_setup.sql` — tables de base (`config`, `activity_log`, `prospects`)
2. `supabase_migration_v2.sql` — champs de suivi (`segment`, `next_action`) + table `base_clients`

### 3. Dépendances

```powershell
# Terminal 1 — backend
cd backend
pip install -r requirements.txt

# Terminal 2 — frontend
cd frontend
npm install
```

## Démarrage

### Option A — Script Windows (recommandé)

```powershell
.\start.ps1
```

Le script vérifie les prérequis, installe les dépendances au besoin, lance le backend et
le frontend dans deux fenêtres, puis ouvre le navigateur.

### Option B — Manuel (deux terminaux)

> ⚠️ **Le dossier de travail est CRITIQUE.** Chaque commande doit être lancée
> depuis le bon dossier, sinon vous aurez `Could not import module "main"`
> (uvicorn lancé depuis la racine) ou `npm error ENOENT ... package.json`
> (npm lancé depuis `backend/`).

```powershell
# Terminal 1 — DANS le dossier backend/
cd backend
python -m uvicorn main:app --reload --port 8000

# Terminal 2 — DANS le dossier frontend/
cd frontend
npm run dev
```

Puis ouvrez **http://localhost:5173** (le frontend redirige `/api` vers le port 8000).

> `start.sh` est l'équivalent macOS/Linux.

## Structure du projet

```
Guard-x/
├── backend/
│   ├── main.py                  # API FastAPI : config, KPIs, activité, prospects, suivis
│   ├── db.py                    # Client Supabase (lit .env)
│   ├── routes/
│   │   ├── letters.py           # Génération de lettres Word (ZIP)
│   │   ├── duplicates.py        # Correspondance floue d'adresses
│   │   ├── properties.py        # Filtrage du rôle d'évaluation de Montréal
│   │   ├── clients.py           # Base clients Sage (garde-fou anti-doublons)
│   │   └── report.py            # Rapport mensuel Excel (pour Mel)
│   ├── utils/
│   │   ├── letter_generator.py  # Mise en page .docx
│   │   ├── fuzzy_matcher.py     # Score de similarité (rapidfuzz)
│   │   └── address_normalizer.py# Saint→St, Boulevard→Boul, accents…
│   ├── assets/guardx_logo.png
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Routes + toasts + config
│   │   └── components/          # Une page par composant (voir guide)
│   ├── package.json
│   └── vite.config.js           # Proxy /api → localhost:8000
├── api/index.py                 # Point d'entrée serverless (Vercel)
├── vercel.json                  # Rewrites : /api/* → backend, reste → SPA
├── supabase_setup.sql           # Tables de base
├── supabase_migration_v2.sql    # Migration v2 (suivi avancé)
├── start.ps1                    # Démarrage Windows
├── start.sh                     # Démarrage macOS/Linux
├── GUIDE_UTILISATEUR.md         # 📖 Guide d'utilisation complet
├── ARCHITECTURE.md              # Carte technique du système
├── AGENT_CONSTITUTION.md        # Règles pour les agents IA
├── FEATURE_PLAYBOOK.md          # Processus d'ajout de fonctionnalités
├── GIT_PROTOCOL.md              # Règles git
└── ROADMAP.md                   # Plan d'évolution
```

## Pages de l'application

| Page | Rôle |
|---|---|
| 📊 **Dashboard** | Suivis dus aujourd'hui/en retard, journal rapide, KPIs, rapport mensuel |
| 📬 **Générateur de lettres** | Excel de prospects → ZIP de lettres Word personnalisées |
| 🔍 **Vérificateur de doublons** | Compare une liste de prospects à un fichier clients (correspondance floue) |
| 🏘️ **Ciblage copropriétés** | Filtre le rôle d'évaluation de Montréal (unités, secteur, année) |
| 📋 **Mes prospects** | Pipeline : 15 statuts, segments, dates de prochaine action |
| 🛡️ **Base clients** | Export Sage importé — vérification automatique anti-doublons partout |
| ⚙️ **Paramètres** | Représentant, mode par défaut, logo |

Détails et flux de travail complets dans [`GUIDE_UTILISATEUR.md`](GUIDE_UTILISATEUR.md).

## Format Excel des prospects (à respecter)

```
Nom_Gestionnaire | Nom_Syndicat | Adresse | Ville_CodePostal | Nb_Unites | Secteur | Notes
```

- `Nom_Gestionnaire` vide → lettre adressée « Au président du syndicat de copropriété »
- Ce format est produit par le Ciblage copropriétés et consommé par les Lettres et Mes prospects

## Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| `Could not import module "main"` | uvicorn lancé depuis la racine | `cd backend` d'abord |
| `npm error ENOENT ... package.json` | npm lancé depuis `backend/` ou la racine | `cd frontend` d'abord |
| `SUPABASE_URL and SUPABASE_SERVICE_KEY must be set` | `.env` manquant ou incomplet | Créer `.env` (voir Configuration) |
| Les prospects ne se sauvegardent pas / erreurs 500 | Tables manquantes | Exécuter les 2 fichiers SQL dans Supabase |
| Colonnes `segment` / `next_action` inconnues | Migration v2 non exécutée | Exécuter `supabase_migration_v2.sql` |
| Page blanche sur :5173 | Backend éteint | Vérifier le terminal backend (port 8000) |

## Déploiement (Vercel)

Le projet est prêt pour Vercel : build statique du frontend + fonction serverless `api/index.py`.
Ajoutez `SUPABASE_URL` et `SUPABASE_SERVICE_KEY` dans les variables d'environnement du projet Vercel.

## Stack technique

- **Backend** : Python, FastAPI, pandas, python-docx, rapidfuzz, openpyxl
- **Frontend** : React, Vite, Tailwind CSS, react-dropzone, lucide-react
- **Données** : Supabase (PostgreSQL) — config, journal d'activité, prospects, base clients

## Représentant

**Jéo-Darsène Saint-Louis**
Téléphone : 438-406-5077
Courriel : jdsaintlouis@guard-x.com
