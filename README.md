# InsuLog — Application Flask
## Projet MSc TECH60711 — HEC Montréal

---

## Structure du projet
```
insulog_flask/
├── app.py                  ← Application Flask principale
├── requirements.txt        ← Dépendances Python
├── insulog_model.joblib    ← Modèle XGBoost (après entraînement Colab)
├── insulog_model_metadata.json
└── templates/
    ├── index.html          ← Page calcul de dose
    ├── dashboard.html      ← Tableau de bord
    └── historique.html     ← Historique injections
```

---

## Installation & Lancement

### 1. Installer les dépendances
```bash
pip install -r requirements.txt
```

### 2. Copier le modèle entraîné (depuis Google Colab)
```bash
# Télécharger insulog_model.joblib et insulog_model_metadata.json
# depuis Colab et les mettre dans ce dossier
```

### 3. Lancer l'application
```bash
python app.py
```

### 4. Ouvrir dans le navigateur
```
http://localhost:5000
```

---

## Pages disponibles
| URL | Description |
|-----|-------------|
| `/` | Calcul de dose d'insuline |
| `/dashboard` | Tableau de bord + graphiques |
| `/historique` | Historique des injections |
| `/sante` | Statut API (JSON) |

---

## Sans modèle ML
Si `insulog_model.joblib` est absent, l'app utilise automatiquement
la **formule clinique** (Règle des 100 + Règle des 450).
L'indicateur en haut à droite passe de 🤖 ML à 📐 Formule.
