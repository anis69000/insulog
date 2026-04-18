# InsuLog — Application Flask  
## Projet MSc TECH60711 — HEC Montréal  

---

## Description  
InsuLog est une application web permettant de calculer des doses d’insuline de manière intelligente.  

Le système combine :  
- des formules cliniques standard (Règle des 100, Règle des 450)  
- un modèle de machine learning (XGBoost)  

L’objectif est d’aider à la prise de décision via une interface simple et accessible.  

---

## Accès à l’application  

Application en ligne :  
https://insulog-8q76.onrender.com/  

Compte de démonstration :  
- Email : theophile@insulog.com  
- Mot de passe : theophilelegoat  

---

## Fonctionnement  

Le système repose sur deux modes :  

- Mode Machine Learning : prédiction via modèle XGBoost  
- Mode Formule : fallback automatique si le modèle est absent  

---

## Structure du projet  


insulog_flask/
├── app.py ← Application Flask principale
├── requirements.txt ← Dépendances Python
├── insulog_model.joblib ← Modèle XGBoost
├── insulog_model_metadata.json
├── templates/
│ ├── index.html ← Calcul de dose
│ ├── dashboard.html ← Tableau de bord
│ └── historique.html ← Historique
├── model_training/ ← Pipeline complet du modèle
│ ├── notebook.ipynb
│ ├── datasets/
│ └── documentation/


---

## Modèle Machine Learning  

Le modèle XGBoost a été entraîné séparément (Google Colab).  

Voir le dossier : /model_training  

Ce dossier contient :  
- les données d’entraînement  
- les notebooks et scripts  
- les documents explicatifs (PDF)  

Il permet de comprendre :  
- comment les données ont été construites  
- comment le modèle a été entraîné  
- comment les prédictions sont générées  

---

## Installation & Lancement (optionnel)  

### 1. Installer les dépendances
```bash
pip install -r requirements.txt
2. Ajouter le modèle (depuis Colab)
# Télécharger insulog_model.joblib et insulog_model_metadata.json
# puis les placer à la racine du projet
3. Lancer l'application
python app.py
4. Accès local (optionnel)
http://127.0.0.1:5000
Pages disponibles
URL	Description
/	Calcul de dose
/dashboard	Tableau de bord
/historique	Historique
/sante	Statut API
Sans modèle ML

Si insulog_model.joblib est absent, l'application utilise automatiquement :

Règle des 100
Règle des 450

Le système reste donc fonctionnel sans machine learning.

Technologies utilisées
Python (Flask)
HTML / CSS / JavaScript
XGBoost
Joblib
Avertissement

Ce projet est un prototype académique.
Il ne remplace pas un professionnel de santé.
