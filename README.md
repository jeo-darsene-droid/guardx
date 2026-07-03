# Guard-X Protection Incendie — Dashboard de Prospection
> Jeo's repo for Guard-X

Application web locale (full-stack) pour automatiser la prospection de Guard-X Protection Incendie.

## Démarrage rapide

```bash
chmod +x start.sh
./start.sh
```

Cela va :
1. Installer les dépendances Python et Node.js
2. Démarrer le backend FastAPI sur `http://localhost:8000`
3. Démarrer le frontend React sur `http://localhost:5173`
4. Ouvrir le navigateur

## Structure du projet

```
guardx-dashboard/
├── backend/
│   ├── main.py              # API FastAPI (config, KPIs, activité, logo)
│   ├── routes/
│   │   ├── letters.py       # Génération de lettres Word
│   │   ├── duplicates.py    # Correspondance floue d'adresses
│   │   └── properties.py    # Filtrage d'évaluation foncière
│   ├── utils/
│   │   ├── letter_generator.py
│   │   ├── fuzzy_matcher.py
│   │   └── address_normalizer.py
│   ├── assets/
│   │   └── guardx_logo.png
│   ├── config.json
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── LetterGenerator.jsx
│   │   │   ├── DuplicateChecker.jsx
│   │   │   ├── PropertyFilter.jsx
│   │   │   ├── ProspectTracker.jsx
│   │   │   └── Settings.jsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
├── README.md
└── start.sh
```

## Pages

### 1. Dashboard
Cartes KPI (lettres du jour, prospects, doublons, propriétés), fil d'activité récente, actions rapides.

### 2. Générateur de lettres
- Téléversez un fichier Excel de prospects
- Aperçu des 5 premières lignes
- Mode postal (avec adresse) ou mode dépôt (sans adresse)
- Paramètres du représentant pré-remplis
- Génère un ZIP de lettres Word (.docx) avec logo Guard-X

**Colonnes Excel attendues :**
`Nom_Gestionnaire | Nom_Syndicat | Adresse | Ville_CodePostal | Nb_Unites | Secteur | Notes`

### 3. Vérificateur de doublons
- Compare prospects vs base clients
- Correspondance floue d'adresses (rapidfuzz)
- Normalisation : saint→st, sainte→ste, boulevard→boul, avenue→av, suppression accents/espaces
- 3 onglets : Liste nette, Doublons trouvés, Incertains
- Export Excel par catégorie

### 4. Ciblage copropriétés
- Téléversez le CSV d'évaluation foncière de Montréal
  (Source : https://donnees.montreal.ca/dataset/unites-evaluation-fonciere)
- Filtres : nombre d'unités, secteur/rue, année de construction
- Résultat formaté pour le générateur de lettres

### 5. Mes prospects
- Importez un fichier Excel de suivi
- Tableau avec statuts colorés (À contacter, Courriel envoyé, En attente, Soumission envoyée, Vendu, Perdu)
- Filtres par statut, date, recherche par nom
- Export Excel

### 6. Paramètres
- Nom, téléphone, courriel du représentant
- Mode par défaut (postal/dépôt)
- Remplacement du logo
- Sauvegarde dans config.json

## Stack technique

- **Backend** : Python, FastAPI, python-docx, pandas, rapidfuzz
- **Frontend** : React, Tailwind CSS, Vite, react-dropzone, lucide-react
- **Aucune base de données** — tout fonctionne avec des fichiers (Excel/CSV)

## Représentant

**Jéo-Darsène Saint-Louis**  
Téléphone : 438-406-5077  
Courriel : jdsaintlouis@guard-x.com
