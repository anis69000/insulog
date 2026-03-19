"""
InsuLog — Application Flask
Projet MSc TECH60711 — HEC Montréal
Prédiction de dose d'insuline pour diabète de type 1
"""

from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import hashlib
import psycopg2
import psycopg2.extras
import joblib
import json
import math
import os
import random
from datetime import datetime, timedelta

JOURS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"]
MOIS_FR  = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]
def date_fr(dt): return f"{JOURS_FR[dt.weekday()]} {dt.day} {MOIS_FR[dt.month]}"


app = Flask(__name__)
app.secret_key = "insulog_hec_2026"

from functools import wraps

ADMIN_EMAIL = "anis@insulog.com"
def get_db():
    DATABASE_URL = os.environ.get("DATABASE_URL", "").replace("postgres://", "postgresql://")
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    return conn

def hash_pw(p): return __import__('hashlib').sha256(p.encode()).hexdigest()

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        prenom TEXT DEFAULT 'Patient',
        is_admin INTEGER DEFAULT 0,
        is_demo INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("""CREATE TABLE IF NOT EXISTS profils (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL,
        tdd REAL DEFAULT 38, isf REAL DEFAULT 2.6, icr REAL DEFAULT 12,
        target REAL DEFAULT 6.0, age INTEGER DEFAULT 28, poids REAL DEFAULT 68,
        sexe TEXT DEFAULT 'F', luteal INTEGER DEFAULT 0)""")
    c.execute("""CREATE TABLE IF NOT EXISTS injections (
        id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
        heure TEXT, date TEXT, ts TEXT,
        dose REAL DEFAULT 0, bg REAL DEFAULT 0,
        carbs REAL DEFAULT 0, iob REAL DEFAULT 0,
        source TEXT DEFAULT 'formule', statut TEXT DEFAULT 'injectee',
        commentaire TEXT DEFAULT '', bg4h REAL, dose_reelle REAL)""")
    # Migrations — ajouter colonnes manquantes si nécessaire
    try: c.execute("ALTER TABLE users ADD COLUMN is_demo INTEGER DEFAULT 0")
    except: pass
    try: c.execute("ALTER TABLE injections ADD COLUMN dose_reelle REAL")
    except: pass
    try: c.execute("ALTER TABLE injections ADD COLUMN bg4h REAL")
    except: pass
    try:
        c.execute("INSERT INTO users (email,password_hash,prenom,is_admin) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                  (ADMIN_EMAIL, hash_pw("InsuLog2026!"), "Anis", 1))
    except: pass
    conn.commit()
    conn.close()

init_db()


def db_query(sql, params=(), fetchone=False, fetchall=False, commit=False):
    """Helper unifié pour toutes les requêtes PostgreSQL."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql, params)
    result = None
    if fetchone:
        result = cur.fetchone()
    elif fetchall:
        result = cur.fetchall()
    if commit:
        conn.commit()
    conn.close()
    return result

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('is_admin'):
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated

# ─── Chargement du modèle ML ────────────────────────────────────────────────
MODEL_PATH = "insulog_model.joblib"
META_PATH  = "insulog_model_metadata.json"

model    = None
metadata = {}

try:
    model = joblib.load(MODEL_PATH)
    print("✅ Modèle XGBoost chargé avec succès")
    if os.path.exists(META_PATH):
        with open(META_PATH) as f:
            metadata = json.load(f)
except Exception as e:
    print(f"⚠️  Modèle non trouvé ({e}) — mode formule clinique activé")


# ─── Formule clinique (fallback) ─────────────────────────────────────────────
def calculer_dose_formule(bg, target, carbs, icr, isf, iob,
                           ex_intensity, ex_hours, meal_type,
                           hour, sex, luteal):
    if bg < 4.0:
        return {"dose": 0, "prandial": 0, "correction": 0,
                "isf_eff": isf, "bloque": True, "source": "formule"}

    # Facteurs physiologiques
    dawn_f = 1.0
    if 5 <= hour < 9:
        dawn_f = 1 - 0.15 * math.sin(math.pi * (hour - 5) / 4)

    ex_factors = {1: 0.10, 2: 0.28, 3: 0.50}
    ex_f = 1.0
    if ex_intensity > 0:
        ex_f = 1.0 + ex_factors.get(ex_intensity, 0) * math.exp(-ex_hours / 4.5)

    mens_f = 0.92 if (sex == "F" and luteal) else 1.0

    meal_factors = {
        "none": 1.0, "low_gi": 0.87, "standard": 1.0,
        "high_protein": 0.93, "high_gi": 1.12, "high_fat": 0.80
    }
    meal_f = meal_factors.get(meal_type, 1.0)

    isf_eff   = max(0.5, isf * dawn_f * ex_f * mens_f)
    prandial  = (carbs / icr) * meal_f if carbs > 0 else 0
    correction = (bg - target) / isf_eff
    dose = max(0, round((prandial + correction - iob) * 2) / 2)

    return {
        "dose":       round(dose, 1),
        "prandial":   round(prandial, 2),
        "correction": round(correction, 2),
        "isf_eff":    round(isf_eff, 2),
        "bloque":     False,
        "source":     "formule"
    }


# ─── Prédiction ML ──────────────────────────────────────────────────────────
FEATURES = [
    'sex_enc','age','weight_kg','bmi','act_enc',
    'tdd_ui','isf_mmol_per_ui','icr_g_per_ui','target_bg_mmol',
    'iob_duration_h','insulin_enc',
    'bg_pre_mmol','bg_trend_mmol_per_min','bg_vs_target','bg_acceleration',
    'iob_ui',
    'has_meal','carbs_g','meal_enc','time_since_meal_start_min',
    'exercise_intensity','exercise_duration_min','hours_since_exercise',
    'dawn_phenomenon_active','somogyi_risk','menstrual_phase_luteal',
    'has_stress','isf_effective',
    'factor_exercise','factor_dawn','factor_menstrual','factor_meal_type',
    'hour','time_enc','day_of_week','month',
]

def predire_ml(data):
    """Construit le vecteur de features et appelle le modèle XGBoost."""
    try:
        import pandas as pd
        import numpy as np

        bg       = data["bg"]
        isf      = data["isf"]
        hour     = data["hour"]
        ex_int   = data.get("ex_intensity", 0)
        ex_hours = data.get("ex_hours", 0)
        luteal   = data.get("luteal", False)
        sex      = data.get("sex", "M")

        dawn_f = 1 - 0.15 * math.sin(math.pi*(hour-5)/4) if 5<=hour<9 else 1.0
        ex_f   = 1.0 if ex_int==0 else 1+{1:.10,2:.28,3:.50}.get(ex_int,0)*math.exp(-ex_hours/4.5)
        mens_f = 0.92 if (sex=="F" and luteal) else 1.0
        meal_f = {"none":1,"low_gi":.87,"standard":1,"high_protein":.93,"high_gi":1.12,"high_fat":.80}.get(data.get("meal_type","standard"),1)
        isf_eff = max(0.5, isf * dawn_f * ex_f * mens_f)

        meal_enc_map = {"none":0,"low_gi":1,"standard":2,"high_protein":3,"high_gi":4,"high_fat":5}
        time_enc = 0 if hour<6 else 1 if hour<12 else 2 if hour<18 else 3

        row = {
            'sex_enc':                  0 if sex=="F" else 1,
            'age':                      data.get("age", 30),
            'weight_kg':                data.get("weight", 70),
            'bmi':                      data.get("bmi", 24),
            'act_enc':                  1,
            'tdd_ui':                   data["tdd"],
            'isf_mmol_per_ui':          isf,
            'icr_g_per_ui':             data["icr"],
            'target_bg_mmol':           data["target"],
            'iob_duration_h':           4.0,
            'insulin_enc':              1,
            'bg_pre_mmol':              bg,
            'bg_trend_mmol_per_min':    data.get("trend", 0),
            'bg_vs_target':             bg - data["target"],
            'bg_acceleration':          0.001,
            'iob_ui':                   data["iob"],
            'has_meal':                 1 if data.get("carbs",0)>0 else 0,
            'carbs_g':                  data.get("carbs", 0),
            'meal_enc':                 meal_enc_map.get(data.get("meal_type","standard"),2),
            'time_since_meal_start_min':5,
            'exercise_intensity':       ex_int,
            'exercise_duration_min':    data.get("ex_duration", 0),
            'hours_since_exercise':     ex_hours,
            'dawn_phenomenon_active':   1 if 5<=hour<9 else 0,
            'somogyi_risk':             0,
            'menstrual_phase_luteal':   1 if luteal else 0,
            'has_stress':               0,
            'isf_effective':            isf_eff,
            'factor_exercise':          ex_f,
            'factor_dawn':              dawn_f,
            'factor_menstrual':         mens_f,
            'factor_meal_type':         meal_f,
            'hour':                     hour,
            'time_enc':                 time_enc,
            'day_of_week':              datetime.now().weekday(),
            'month':                    datetime.now().month,
        }

        X = pd.DataFrame([row])[FEATURES]
        pred = float(model.predict(X)[0])
        dose = max(0, round(pred * 2) / 2)

        # Décomposition estimée
        prandial   = (data.get("carbs",0) / data["icr"]) * meal_f if data.get("carbs",0) > 0 else 0
        correction = (bg - data["target"]) / isf_eff

        return {
            "dose":       round(dose, 1),
            "prandial":   round(prandial, 2),
            "correction": round(correction, 2),
            "isf_eff":    round(isf_eff, 2),
            "bloque":     False,
            "source":     "ml"
        }
    except Exception as e:
        print(f"Erreur ML: {e}")
        return None


# ─── Données de démo ─────────────────────────────────────────────────────────
def generer_historique_demo():
    historique = []
    for i in range(12):
        ts = datetime.now() - timedelta(hours=i*5)
        bg = round(6 + random.random() * 9, 1)
        historique.append({
            "id":     f"demo_{i}",
            "ts":     ts.isoformat(),
            "heure":  ts.strftime("%H:%M"),
            "date":   date_fr(ts),
            "dose":   round(2 + random.random() * 6, 1),
            "bg":     bg,
            "carbs":  random.randint(35, 90) if random.random() > 0.3 else 0,
            "iob":    round(random.random() * 1.5, 1),
            "source": "ml" if random.random() > 0.4 else "formule",
            "bg4h":   round(4.2 + random.random() * 6, 1),
        })
    return historique


# ─── Auth ────────────────────────────────────────────────────────────────────
@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        email    = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = db_query("SELECT * FROM users WHERE email=%s", (email,), fetchone=True)
        if user and user["password_hash"] == hash_pw(password):
            session['user_id']    = user['id']
            session['user_email'] = user['email']
            session['prenom']     = user['prenom']
            session['is_admin']   = bool(user['is_admin'])
            session['is_demo']    = bool(user['is_demo'] if 'is_demo' in user.keys() else 0)
            return redirect(url_for('index'))
        error = "Vérifiez votre email et votre mot de passe."
    return render_template("login.html", error=error)

@app.route("/admin/users")
@login_required
@admin_required
def admin_users():
    users = db_query("SELECT id,email,prenom,is_admin,created_at FROM users ORDER BY created_at DESC", fetchall=True) or []
    return render_template("admin_users.html", users=users)

@app.route("/admin/users/create", methods=["POST"])
@login_required
@admin_required
def admin_create_user():
    email    = request.form.get("email","").strip().lower()
    password = request.form.get("password","")
    prenom   = request.form.get("prenom","Patient")
    is_admin = 1 if request.form.get("is_admin") else 0
    if email and password:
        try:
            db_query("INSERT INTO users (email,password_hash,prenom,is_admin) VALUES (%s,%s,%s,%s)",
                     (email, hash_pw(password), prenom, is_admin), commit=True)
        except: pass
    return redirect(url_for('admin_users'))

@app.route("/admin/users/delete/<int:uid>", methods=["POST"])
@login_required
@admin_required
def admin_delete_user(uid):
    if uid != session.get('user_id'):
        db_query("DELETE FROM injections WHERE user_id=%s", (uid,), commit=True)
        db_query("DELETE FROM profils WHERE user_id=%s", (uid,), commit=True)
        db_query("DELETE FROM users WHERE id=%s", (uid,), commit=True)
    return redirect(url_for('admin_users'))

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for('login'))

# ─── Routes ──────────────────────────────────────────────────────────────────
@app.route("/")
@login_required
def index():
    """Page principale."""
    modele_actif = model is not None
    version = metadata.get("model_version", "—")
    mae     = metadata.get("metrics_test", {}).get("mae", "—")
    return render_template("index.html",
                           modele_actif=modele_actif,
                           version=version,
                           mae=mae)


@app.route("/calculer", methods=["POST"])
@login_required
def calculer():
    """Calcule la dose d'insuline recommandée."""
    d = request.get_json()

    # Récupère le profil depuis la base de données
    profil_row = db_query("SELECT * FROM profils WHERE user_id=%s", (session.get('user_id',0),), fetchone=True)
    profil = dict(profil_row) if profil_row else {}
    bg       = float(d["bg"])
    target   = float(profil.get("target",  d.get("target", 6.0)))
    carbs    = float(d.get("carbs", 0))
    icr      = float(profil.get("icr",     d.get("icr", 12)))
    isf      = float(profil.get("isf",     d.get("isf", 2.6)))
    iob      = float(d.get("iob", 0))
    ex_int   = int(d.get("ex_intensity", 0))
    ex_hours = float(d.get("ex_hours", 0))
    meal     = d.get("meal_type", "standard")
    hour     = int(d.get("hour", datetime.now().hour))
    sex      = profil.get("sexe",    d.get("sex", "F"))
    luteal   = bool(profil.get("luteal", d.get("luteal", False)))
    tdd      = float(profil.get("tdd",   d.get("tdd", 38)))
    age      = int(profil.get("age",     d.get("age", 28)))
    weight   = float(profil.get("poids", d.get("weight", 68)))

    # Sécurité hypoglycémie
    if bg < 4.0:
        return jsonify({
            "dose": 0, "prandial": 0, "correction": 0,
            "isf_eff": isf, "source": "formule", "bloque": True,
            "avertissement": "⛔ Hypoglycémie détectée — aucune injection. Consommez 15g de glucides rapides."
        })

    # Essai ML d'abord, formule en fallback
    resultat = None
    if model is not None:
        resultat = predire_ml({
            "bg": bg, "target": target, "carbs": carbs,
            "icr": icr, "isf": isf, "iob": iob,
            "ex_intensity": ex_int, "ex_hours": ex_hours,
            "meal_type": meal, "hour": hour, "sex": sex,
            "luteal": luteal, "tdd": tdd, "age": age,
            "weight": weight, "bmi": round(weight / (1.70**2), 1),
            "trend": float(d.get("trend", 0))
        })

    if resultat is None:
        resultat = calculer_dose_formule(bg, target, carbs, icr, isf, iob,
                                         ex_int, ex_hours, meal, hour, sex, luteal)

    # Avertissements
    avertissements = []
    if bg > 13.9:
        avertissements.append("⚠️ Glycémie très élevée — vérifiez les cétones")
    if ex_int >= 2 and ex_hours < 6:
        avertissements.append("⚠️ Exercice récent — surveillez la glycémie dans les 12h")

    resultat["avertissements"] = avertissements
    return jsonify(resultat)


@app.route("/dashboard")
@login_required
def dashboard():
    rows = db_query("SELECT * FROM injections WHERE user_id=%s ORDER BY ts DESC LIMIT 50",
                    (session.get('user_id'),), fetchall=True) or []
    profil_row = db_query("SELECT * FROM profils WHERE user_id=%s", (session.get('user_id'),), fetchone=True)
    hist = [dict(r) for r in rows]
    profil = dict(profil_row) if profil_row else {"prenom": session.get("prenom","Patient")}

    if hist:
        avg_bg        = round(sum(h["bg"] for h in hist) / len(hist), 1)
        total_ui      = round(sum(h["dose"] for h in hist), 1)
        tir_list      = [h for h in hist if 4 <= h["bg"] <= 10]
        tir_pct       = round(len(tir_list) / len(hist) * 100)
        nb_injections = len([h for h in hist if h.get("statut","injectee") == "injectee"])
    else:
        avg_bg, total_ui, tir_pct, nb_injections = 0, 0, 0, 0

    stats = {"avg_bg": avg_bg, "total_ui": total_ui, "tir_pct": tir_pct, "nb_injections": nb_injections}
    doses_chart = [{"label": h["heure"], "dose": h["dose"], "bg": h["bg"]} for h in reversed(hist[:7])]
    return render_template("dashboard.html", stats=stats, historique=hist,
                           doses_chart=json.dumps(doses_chart), profil=profil)


@app.route("/profil", methods=["GET", "POST"])
@login_required
def profil():
    """Page configuration du profil patient."""
    # Profil par défaut
    defaut = {
        "prenom": "Patient", "age": 28, "poids": 68, "taille": 170,
        "sexe": "F", "tdd": 38, "isf": 2.6, "icr": 12,
        "target": 6.0, "luteal": False, "type_insuline": "humalog"
    }
    if request.method == "POST":
        data = request.get_json()
        session["profil"] = data
        return jsonify({"statut": "ok", "profil": data})

    profil_actuel = session.get("profil", defaut)
    return render_template("profil.html", profil=profil_actuel)


@app.route("/profil/data")
@login_required
def profil_data():
    """Retourne le profil actuel en JSON."""
    defaut = {
        "prenom": "Patient", "age": 28, "poids": 68, "taille": 170,
        "sexe": "F", "tdd": 38, "isf": 2.6, "icr": 12,
        "target": 6.0, "luteal": False, "type_insuline": "humalog"
    }
    return jsonify(session.get("profil", defaut))


@app.route("/injection/sauvegarder", methods=["POST"])
@login_required
def sauvegarder_injection():
    d = request.get_json()
    now = datetime.now()
    inj_id = f"inj_{now.strftime('%Y%m%d%H%M%S')}_{session.get('user_id',0)}"
    db_query("""INSERT INTO injections
        (id,user_id,heure,date,ts,dose,bg,carbs,iob,source,statut,commentaire)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (inj_id, session.get('user_id'), now.strftime("%H:%M"), date_fr(now),
         now.isoformat(), d.get("dose",0), d.get("bg",0), d.get("carbs",0),
         d.get("iob",0), d.get("source","formule"), d.get("statut","injectee"),
         d.get("commentaire","")), commit=True)
    return jsonify({"statut": "ok", "id": inj_id})


@app.route("/injection/bg4h", methods=["POST"])
@login_required
def sauvegarder_bg4h():
    d = request.get_json()
    db_query("UPDATE injections SET bg4h=%s WHERE id=%s AND user_id=%s",
             (d["bg4h"], d["id"], session.get('user_id')), commit=True)
    return jsonify({"statut": "ok"})



@app.route("/injection/dose-reelle", methods=["POST"])
@login_required
def sauvegarder_dose_reelle():
    d = request.get_json()
    db_query("UPDATE injections SET dose_reelle=%s WHERE id=%s AND user_id=%s",
             (d["dose_reelle"], d["id"], session.get('user_id')), commit=True)
    return jsonify({"statut": "ok"})

@app.route("/historique")
@login_required
def historique():
    """Page historique des injections."""
    rows = db_query("SELECT * FROM injections WHERE user_id=%s ORDER BY ts DESC LIMIT 50",
                    (session.get('user_id'),), fetchall=True) or []
    profil_row = db_query("SELECT * FROM profils WHERE user_id=%s", (session.get('user_id'),), fetchone=True)
    hist = [dict(r) for r in rows]
    return render_template("historique.html", historique=hist)



@app.route("/admin/demo-data")
@login_required
@admin_required
def admin_demo_data():
    """Vue des données démo — comparaison modèle vs réel."""
    try:
        rows = db_query("""
            SELECT u.prenom, u.email, i.heure, i.date, i.dose as dose_modele,
                   i.dose_reelle, i.bg, i.carbs, i.source, i.statut
            FROM injections i
            JOIN users u ON u.id = i.user_id
            WHERE u.is_demo = 1 AND i.dose_reelle IS NOT NULL
            ORDER BY i.ts DESC
        """, fetchall=True) or []
    except:
        rows = []
    return render_template("admin_demo.html", rows=rows)

@app.route("/sante")
@login_required
def sante():
    """Endpoint de santé pour vérifier si le modèle est actif."""
    return jsonify({
        "statut":        "ok",
        "modele_actif":  model is not None,
        "version":       metadata.get("model_version", "N/A"),
        "mae":           metadata.get("metrics_test", {}).get("mae", "N/A"),
    })


if __name__ == "__main__":
    print("\n🩺 InsuLog — Application Flask")
    print("=" * 40)
    print(f"   Modèle ML : {'✅ Chargé' if model else '⚠️  Non trouvé (formule clinique)'}")
    print(f"   URL       : http://localhost:5000")
    print("=" * 40 + "\n")
    app.run(debug=True, port=5000)
