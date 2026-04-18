import { useState, useEffect, useRef } from "react";

// ─── ALGORITHME DE CALCUL ──────────────────────────────────────────────────
function calcIOB(injections, iobDurationHours) {
  const now = Date.now();
  let iob = 0;
  for (const inj of injections) {
    const hoursAgo = (now - inj.timestamp) / 3600000;
    if (hoursAgo < iobDurationHours) {
      // Courbe triangulaire d'absorption
      const remaining = 1 - hoursAgo / iobDurationHours;
      iob += inj.dose * remaining;
    }
  }
  return Math.max(0, iob);
}

function calcBolus({ bg, targetBg, carbs, icr, isf, iob, exerciseIntensity, exerciseDurationMin }) {
  let prandial = carbs > 0 ? carbs / icr : 0;
  let correction = (bg - targetBg) / isf;

  // Ajustement exercice : réduction basée sur intensité
  let exerciseFactor = 1.0;
  if (exerciseIntensity === "moderate") exerciseFactor = 0.85;
  if (exerciseIntensity === "intense") exerciseFactor = 0.70;
  if (exerciseDurationMin > 60) exerciseFactor -= 0.05;

  prandial = prandial * exerciseFactor;
  const total = Math.max(0, prandial + correction - iob);

  return {
    prandial: Math.max(0, prandial),
    correction,
    iob,
    exerciseFactor,
    total,
    safe: bg > 4.0 && total >= 0,
  };
}

// ─── SIMULATION CGM ────────────────────────────────────────────────────────
function useCGMSimulation(active) {
  const [glucose, setGlucose] = useState(7.2);
  const [trend, setTrend] = useState(0.05); // mmol/L/min
  const historyRef = useRef([7.2]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setGlucose(prev => {
        const noise = (Math.random() - 0.5) * 0.15;
        const newVal = Math.max(3.5, Math.min(18, prev + trend * 5 + noise));
        historyRef.current = [...historyRef.current.slice(-23), newVal];
        setTrend(t => {
          const dt = (Math.random() - 0.5) * 0.02;
          return Math.max(-0.15, Math.min(0.15, t + dt));
        });
        return newVal;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [active, trend]);

  return { glucose, trend, history: historyRef.current };
}

// ─── TREND ARROW ───────────────────────────────────────────────────────────
function TrendArrow({ trend }) {
  if (trend > 0.1)  return <span style={{ color: "#ef4444", fontSize: 22 }}>↑↑</span>;
  if (trend > 0.05) return <span style={{ color: "#f97316", fontSize: 22 }}>↑</span>;
  if (trend > 0.02) return <span style={{ color: "#facc15", fontSize: 22 }}>↗</span>;
  if (trend < -0.1) return <span style={{ color: "#3b82f6", fontSize: 22 }}>↓↓</span>;
  if (trend < -0.05)return <span style={{ color: "#60a5fa", fontSize: 22 }}>↓</span>;
  if (trend < -0.02)return <span style={{ color: "#93c5fd", fontSize: 22 }}>↘</span>;
  return <span style={{ color: "#4ade80", fontSize: 22 }}>→</span>;
}

// ─── MINI SPARKLINE ────────────────────────────────────────────────────────
function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const w = 200, h = 50, pad = 4;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id="spk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────
const S = {
  app: {
    minHeight: "100vh",
    background: "#0a0f1e",
    color: "#e2e8f0",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    background: "linear-gradient(145deg, #111827, #0d1424)",
    border: "1px solid #1e3a5f",
    borderRadius: 24,
    padding: 32,
    width: "100%",
    maxWidth: 480,
    boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(56,189,248,0.05)",
  },
  logo: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: -1,
    color: "#38bdf8",
    marginBottom: 4,
  },
  sub: { fontSize: 13, color: "#64748b", marginBottom: 32 },
  label: { fontSize: 12, fontWeight: 600, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  input: {
    width: "100%",
    background: "#0f1927",
    border: "1px solid #1e3a5f",
    borderRadius: 10,
    padding: "10px 14px",
    color: "#e2e8f0",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  inputFocus: { borderColor: "#38bdf8" },
  select: {
    width: "100%",
    background: "#0f1927",
    border: "1px solid #1e3a5f",
    borderRadius: 10,
    padding: "10px 14px",
    color: "#e2e8f0",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  },
  btnPrimary: {
    width: "100%",
    padding: "14px 24px",
    background: "linear-gradient(135deg, #0ea5e9, #38bdf8)",
    border: "none",
    borderRadius: 12,
    color: "#0a0f1e",
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
    letterSpacing: 0.3,
    transition: "opacity 0.2s, transform 0.1s",
  },
  btnSecondary: {
    width: "100%",
    padding: "12px 24px",
    background: "transparent",
    border: "1px solid #1e3a5f",
    borderRadius: 12,
    color: "#94a3b8",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    transition: "border-color 0.2s, color 0.2s",
    marginTop: 10,
  },
  modeBtn: (active) => ({
    flex: 1,
    padding: "14px 16px",
    borderRadius: 12,
    border: active ? "2px solid #38bdf8" : "2px solid #1e3a5f",
    background: active ? "rgba(56,189,248,0.08)" : "#0f1927",
    color: active ? "#38bdf8" : "#64748b",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    textAlign: "center",
    transition: "all 0.2s",
  }),
  chip: (color) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    background: color === "green" ? "rgba(74,222,128,0.1)" : color === "red" ? "rgba(239,68,68,0.1)" : "rgba(251,191,36,0.1)",
    color: color === "green" ? "#4ade80" : color === "red" ? "#f87171" : "#fbbf24",
    border: `1px solid ${color === "green" ? "#4ade80" : color === "red" ? "#f87171" : "#fbbf24"}30`,
  }),
  divider: { height: 1, background: "#1e3a5f", margin: "24px 0" },
  row: { display: "flex", gap: 12 },
  col: { flex: 1 },
  glucoseDisplay: {
    background: "rgba(56,189,248,0.05)",
    border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 16,
    padding: "20px 24px",
    marginBottom: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultBox: (color) => ({
    background: color === "green" ? "rgba(74,222,128,0.05)" : color === "red" ? "rgba(239,68,68,0.05)" : "rgba(251,191,36,0.05)",
    border: `1px solid ${color === "green" ? "rgba(74,222,128,0.2)" : color === "red" ? "rgba(239,68,68,0.2)" : "rgba(251,191,36,0.2)"}`,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
  }),
  breakdown: {
    background: "#0a0f1e",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  brow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
    fontSize: 13,
    color: "#94a3b8",
    borderBottom: "1px solid #1e3a5f",
  },
};

// ─── COMPOSANTS ────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={S.label}>{label}</div>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16, marginTop: 8 }}>
      {children}
    </div>
  );
}

// ─── ÉCRANS ────────────────────────────────────────────────────────────────

function ScreenWelcome({ onNext }) {
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>💉</div>
        <div style={S.logo}>InsuLog</div>
        <div style={S.sub}>Assistant de recommandation d'insuline • Type 1</div>
      </div>
      <div style={{ background: "rgba(56,189,248,0.04)", border: "1px solid #1e3a5f", borderRadius: 14, padding: 18, marginBottom: 28, fontSize: 13, color: "#94a3b8", lineHeight: 1.7 }}>
        ⚠️ <strong style={{ color: "#fbbf24" }}>Usage éducatif uniquement.</strong> Cet outil est un prototype développé dans le cadre d'un projet académique (HEC Montréal — TECH60711). Il ne remplace en aucun cas l'avis d'un professionnel de santé. L'utilisateur valide et effectue toujours l'injection lui-même.
      </div>
      <button style={S.btnPrimary} onClick={onNext}>Commencer →</button>
    </div>
  );
}

function ScreenProfile({ profile, onChange, onNext }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Profil patient</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Paramètres configurés avec votre endocrinologue</div>
      </div>

      <SectionTitle>Données physiologiques</SectionTitle>
      <div style={S.row}>
        <div style={S.col}>
          <Field label="Poids (kg)">
            <input style={S.input} type="number" value={profile.weight} onChange={e => onChange("weight", +e.target.value)} />
          </Field>
        </div>
        <div style={S.col}>
          <Field label="Âge">
            <input style={S.input} type="number" value={profile.age} onChange={e => onChange("age", +e.target.value)} />
          </Field>
        </div>
      </div>

      <SectionTitle>Paramètres de dosage</SectionTitle>
      <div style={S.row}>
        <div style={S.col}>
          <Field label="TDD — Dose totale/jour (UI)">
            <input style={S.input} type="number" value={profile.tdd} onChange={e => onChange("tdd", +e.target.value)} />
          </Field>
        </div>
        <div style={S.col}>
          <Field label="Glycémie cible (mmol/L)">
            <input style={S.input} type="number" step="0.1" value={profile.targetBg} onChange={e => onChange("targetBg", +e.target.value)} />
          </Field>
        </div>
      </div>
      <div style={S.row}>
        <div style={S.col}>
          <Field label="ISF — Sensibilité (mmol/L/UI)">
            <input style={S.input} type="number" step="0.1" value={profile.isf} onChange={e => onChange("isf", +e.target.value)} />
          </Field>
        </div>
        <div style={S.col}>
          <Field label="ICR — Ratio insuline/glucides (g/UI)">
            <input style={S.input} type="number" step="0.5" value={profile.icr} onChange={e => onChange("icr", +e.target.value)} />
          </Field>
        </div>
      </div>
      <Field label="Durée d'action de l'insuline (IOB Time, heures)">
        <select style={S.select} value={profile.iobDuration} onChange={e => onChange("iobDuration", +e.target.value)}>
          <option value={3}>3h — Insuline ultra-rapide (Fiasp)</option>
          <option value={4}>4h — Insuline rapide (Humalog, Novorapid)</option>
          <option value={5}>5h — Profil standard</option>
        </select>
      </Field>

      <div style={{ ...S.breakdown, marginTop: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, letterSpacing: 0.5 }}>VALEURS CALCULÉES AUTOMATIQUEMENT</div>
        <div style={{ display: "flex", gap: 24 }}>
          <div><span style={{ color: "#38bdf8", fontWeight: 700 }}>ISF auto : </span><span style={{ color: "#e2e8f0" }}>{(100 / profile.tdd).toFixed(1)}</span></div>
          <div><span style={{ color: "#38bdf8", fontWeight: 700 }}>ICR auto : </span><span style={{ color: "#e2e8f0" }}>{(450 / profile.tdd).toFixed(1)}</span></div>
        </div>
        <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>Formules cliniques : ISF = 100÷TDD | ICR = 450÷TDD</div>
      </div>

      <button style={S.btnPrimary} onClick={onNext}>Continuer →</button>
    </div>
  );
}

function ScreenMode({ mode, onSelect, onNext }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Connexion du capteur</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Comment souhaitez-vous saisir votre glycémie ?</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <button style={S.modeBtn(mode === "cgm")} onClick={() => onSelect("cgm")}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>📡</div>
          <div>Capteur CGM connecté</div>
          <div style={{ fontSize: 11, color: mode === "cgm" ? "#7dd3fc" : "#475569", marginTop: 4, fontWeight: 400 }}>
            Freestyle Libre / Dexcom G6-G7
          </div>
        </button>
        <button style={S.modeBtn(mode === "manual")} onClick={() => onSelect("manual")}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>🩸</div>
          <div>Glycémie manuelle</div>
          <div style={{ fontSize: 11, color: mode === "manual" ? "#7dd3fc" : "#475569", marginTop: 4, fontWeight: 400 }}>
            Lecteur de glycémie classique
          </div>
        </button>
      </div>

      {mode === "cgm" && (
        <div style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12, padding: 14, marginBottom: 20, fontSize: 13, color: "#86efac" }}>
          ✅ Lecture automatique toutes les 5 minutes. La tendance (↑↓) est prise en compte dans le calcul.
        </div>
      )}
      {mode === "manual" && (
        <div style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 12, padding: 14, marginBottom: 20, fontSize: 13, color: "#fde68a" }}>
          ⚠️ Sans capteur : la tendance glycémique n'est pas disponible. La recommandation sera basée sur la valeur ponctuelle saisie.
        </div>
      )}

      <button style={S.btnPrimary} onClick={onNext} disabled={!mode}>
        Continuer →
      </button>
    </div>
  );
}

function ScreenInput({ mode, cgmData, inputs, onChange, onCalc, onBack }) {
  const [focused, setFocused] = useState(null);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Données actuelles</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Renseignez vos informations du moment</div>
      </div>

      {/* GLYCÉMIE */}
      <SectionTitle>Glycémie</SectionTitle>
      {mode === "cgm" ? (
        <div style={S.glucoseDisplay}>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>CGM EN DIRECT</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 42, fontWeight: 800, color: cgmData.glucose < 4 ? "#f87171" : cgmData.glucose > 10 ? "#fbbf24" : "#4ade80", lineHeight: 1 }}>
                {cgmData.glucose.toFixed(1)}
              </span>
              <span style={{ fontSize: 14, color: "#64748b" }}>mmol/L</span>
              <TrendArrow trend={cgmData.trend} />
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
              Tendance : {cgmData.trend > 0 ? "+" : ""}{(cgmData.trend * 10).toFixed(1)} mmol/L/10min
            </div>
          </div>
          <div>
            <Sparkline data={cgmData.history} />
            <div style={{ fontSize: 10, color: "#475569", textAlign: "right", marginTop: 2 }}>Dernières 2h</div>
          </div>
        </div>
      ) : (
        <Field label="Glycémie mesurée (mmol/L)">
          <input
            style={{ ...S.input, ...(focused === "bg" ? S.inputFocus : {}) }}
            type="number"
            step="0.1"
            placeholder="ex : 8.5"
            value={inputs.manualBg}
            onChange={e => onChange("manualBg", e.target.value)}
            onFocus={() => setFocused("bg")}
            onBlur={() => setFocused(null)}
          />
        </Field>
      )}

      <div style={S.divider} />

      {/* REPAS */}
      <SectionTitle>Repas</SectionTitle>
      <Field label="Glucides du repas (grammes — 0 si pas de repas)">
        <input
          style={{ ...S.input, ...(focused === "carbs" ? S.inputFocus : {}) }}
          type="number"
          placeholder="ex : 60"
          value={inputs.carbs}
          onChange={e => onChange("carbs", e.target.value)}
          onFocus={() => setFocused("carbs")}
          onBlur={() => setFocused(null)}
        />
      </Field>

      <div style={S.divider} />

      {/* ACTIVITÉ PHYSIQUE */}
      <SectionTitle>Activité physique récente</SectionTitle>
      <div style={S.row}>
        <div style={S.col}>
          <Field label="Intensité">
            <select style={S.select} value={inputs.exerciseIntensity} onChange={e => onChange("exerciseIntensity", e.target.value)}>
              <option value="none">Aucune</option>
              <option value="light">Légère (marche)</option>
              <option value="moderate">Modérée (vélo, natation)</option>
              <option value="intense">Intense (course, sport)</option>
            </select>
          </Field>
        </div>
        <div style={S.col}>
          <Field label="Durée (minutes)">
            <input
              style={{ ...S.input, ...(focused === "exdur" ? S.inputFocus : {}) }}
              type="number"
              placeholder="ex : 45"
              disabled={inputs.exerciseIntensity === "none"}
              value={inputs.exerciseDuration}
              onChange={e => onChange("exerciseDuration", e.target.value)}
              onFocus={() => setFocused("exdur")}
              onBlur={() => setFocused(null)}
            />
          </Field>
        </div>
      </div>

      <div style={S.divider} />

      {/* INSULINE PRÉCÉDENTE */}
      <SectionTitle>Dernière injection (pour calcul IOB)</SectionTitle>
      <div style={S.row}>
        <div style={S.col}>
          <Field label="Dose injectée (UI)">
            <input
              style={{ ...S.input, ...(focused === "prevdose" ? S.inputFocus : {}) }}
              type="number"
              step="0.5"
              placeholder="ex : 4"
              value={inputs.prevDose}
              onChange={e => onChange("prevDose", e.target.value)}
              onFocus={() => setFocused("prevdose")}
              onBlur={() => setFocused(null)}
            />
          </Field>
        </div>
        <div style={S.col}>
          <Field label="Il y a combien d'heures ?">
            <select style={S.select} value={inputs.prevHoursAgo} onChange={e => onChange("prevHoursAgo", e.target.value)}>
              <option value={0}>Aucune injection récente</option>
              <option value={0.5}>30 minutes</option>
              <option value={1}>1 heure</option>
              <option value={1.5}>1h30</option>
              <option value={2}>2 heures</option>
              <option value={3}>3 heures</option>
              <option value={4}>4 heures ou plus</option>
            </select>
          </Field>
        </div>
      </div>

      <button style={{ ...S.btnPrimary, marginTop: 8 }} onClick={onCalc}>
        Calculer la recommandation →
      </button>
      <button style={S.btnSecondary} onClick={onBack}>← Retour</button>
    </div>
  );
}

function ScreenResult({ result, mode, bg, profile, onValidate, onReset, validated }) {
  const doseColor = result.total === 0 ? "blue" : result.safe ? "green" : "red";
  const bgColor = bg < 4 ? "red" : bg > 10 ? "yellow" : "green";

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Recommandation</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          Mode : {mode === "cgm" ? "📡 CGM connecté" : "🩸 Saisie manuelle"}
          {mode !== "cgm" && <span style={{ color: "#fbbf24", marginLeft: 8 }}>— tendance non disponible</span>}
        </div>
      </div>

      {/* Glycémie affichée */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <span style={S.chip(bgColor)}>
          🩸 {bg.toFixed(1)} mmol/L
        </span>
        <span style={S.chip("blue")}>
          IOB : {result.iob.toFixed(1)} UI
        </span>
        {result.exerciseFactor < 1 && (
          <span style={S.chip("yellow")}>
            🏃 Exercice −{Math.round((1 - result.exerciseFactor) * 100)}%
          </span>
        )}
      </div>

      {/* Résultat principal */}
      <div style={S.resultBox(result.total === 0 ? "blue" : "green")}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 8 }}>
          DOSE RECOMMANDÉE
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 64, fontWeight: 900, color: "#4ade80", lineHeight: 1 }}>
            {result.total.toFixed(1)}
          </span>
          <span style={{ fontSize: 20, color: "#94a3b8" }}>UI d'insuline</span>
        </div>

        {/* Décomposition */}
        <div style={S.breakdown}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, letterSpacing: 0.5 }}>DÉCOMPOSITION DU CALCUL</div>
          <div style={S.brow}>
            <span>Bolus prandial ({profile.icr} g/UI)</span>
            <span style={{ color: "#e2e8f0" }}>+{result.prandial.toFixed(2)} UI</span>
          </div>
          <div style={S.brow}>
            <span>Bolus de correction (ISF {profile.isf})</span>
            <span style={{ color: result.correction >= 0 ? "#fbbf24" : "#60a5fa" }}>
              {result.correction >= 0 ? "+" : ""}{result.correction.toFixed(2)} UI
            </span>
          </div>
          {result.exerciseFactor < 1 && (
            <div style={S.brow}>
              <span>Ajustement exercice</span>
              <span style={{ color: "#60a5fa" }}>×{result.exerciseFactor.toFixed(2)}</span>
            </div>
          )}
          <div style={S.brow}>
            <span>IOB déduit (insuline active)</span>
            <span style={{ color: "#f87171" }}>−{result.iob.toFixed(2)} UI</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", fontSize: 14, fontWeight: 700, color: "#4ade80" }}>
            <span>Total</span>
            <span>{result.total.toFixed(1)} UI</span>
          </div>
        </div>
      </div>

      {/* Alerte hypo */}
      {bg < 4.0 && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 13, color: "#fca5a5" }}>
          🚨 <strong>Glycémie trop basse (&lt; 4 mmol/L).</strong> Aucune insuline ne doit être administrée. Consommez des glucides rapides immédiatement.
        </div>
      )}

      {/* Alerte mode manuel */}
      {mode === "manual" && (
        <div style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 12, color: "#fde68a" }}>
          💡 Sans capteur CGM, la tendance glycémique n'est pas disponible. Si votre glycémie monte rapidement, la dose réelle nécessaire pourrait être légèrement plus élevée.
        </div>
      )}

      {/* Validation */}
      {!validated ? (
        <div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12, textAlign: "center" }}>
            Vérifiez la recommandation avant d'injecter. Vous restez décisionnaire.
          </div>
          <button style={S.btnPrimary} onClick={onValidate} disabled={bg < 4}>
            ✅ Je valide et j'injecte {result.total.toFixed(1)} UI
          </button>
        </div>
      ) : (
        <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12, padding: 18, textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
          <div style={{ fontWeight: 700, color: "#4ade80", marginBottom: 4 }}>Injection validée</div>
          <div style={{ fontSize: 12, color: "#86efac" }}>
            Vérifiez votre glycémie dans {profile.iobDuration}h pour ajustement de l'ISF.
          </div>
        </div>
      )}

      <button style={S.btnSecondary} onClick={onReset}>← Nouvelle recommandation</button>
    </div>
  );
}

// ─── APP PRINCIPALE ────────────────────────────────────────────────────────
export default function InsuLog() {
  const [screen, setScreen] = useState("welcome");
  const [mode, setMode] = useState(null);
  const [validated, setValidated] = useState(false);
  const [result, setResult] = useState(null);

  const [profile, setProfile] = useState({
    weight: 70, age: 28, tdd: 36, targetBg: 6.0, isf: 2.8, icr: 12.5, iobDuration: 4
  });

  const [inputs, setInputs] = useState({
    manualBg: "", carbs: "0", exerciseIntensity: "none",
    exerciseDuration: "0", prevDose: "0", prevHoursAgo: 0
  });

  const cgmData = useCGMSimulation(mode === "cgm" && screen === "input");

  function updateProfile(k, v) {
    setProfile(p => {
      const next = { ...p, [k]: v };
      // Auto-update ISF/ICR si TDD change et que l'utilisateur n'a pas personnalisé
      if (k === "tdd") {
        next.isf = parseFloat((100 / v).toFixed(1));
        next.icr = parseFloat((450 / v).toFixed(1));
      }
      return next;
    });
  }

  function updateInput(k, v) { setInputs(i => ({ ...i, [k]: v })); }

  function handleCalc() {
    const bg = mode === "cgm" ? cgmData.glucose : parseFloat(inputs.manualBg);
    if (!bg || bg <= 0) return alert("Veuillez saisir une glycémie valide.");

    const prevDose = parseFloat(inputs.prevDose) || 0;
    const prevHoursAgo = parseFloat(inputs.prevHoursAgo) || 0;
    const injections = prevDose > 0 && prevHoursAgo > 0
      ? [{ dose: prevDose, timestamp: Date.now() - prevHoursAgo * 3600000 }]
      : [];

    const iob = calcIOB(injections, profile.iobDuration);

    const res = calcBolus({
      bg,
      targetBg: profile.targetBg,
      carbs: parseFloat(inputs.carbs) || 0,
      icr: profile.icr,
      isf: profile.isf,
      iob,
      exerciseIntensity: inputs.exerciseIntensity,
      exerciseDurationMin: parseFloat(inputs.exerciseDuration) || 0,
    });

    setResult({ ...res, bg });
    setValidated(false);
    setScreen("result");
  }

  function reset() {
    setScreen("input");
    setResult(null);
    setValidated(false);
    setInputs({ manualBg: "", carbs: "0", exerciseIntensity: "none", exerciseDuration: "0", prevDose: "0", prevHoursAgo: 0 });
  }

  return (
    <div style={S.app}>
      {/* Fond décoratif */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -200, left: -200, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,189,248,0.06) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -150, right: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)" }} />
      </div>

      <div style={S.card}>
        {/* Barre de progression */}
        {screen !== "welcome" && (
          <div style={{ display: "flex", gap: 4, marginBottom: 28 }}>
            {["profile", "mode", "input", "result"].map((s, i) => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: ["profile","mode","input","result"].indexOf(screen) >= i ? "#38bdf8" : "#1e3a5f", transition: "background 0.3s" }} />
            ))}
          </div>
        )}

        {screen === "welcome" && <ScreenWelcome onNext={() => setScreen("profile")} />}
        {screen === "profile" && (
          <ScreenProfile profile={profile} onChange={updateProfile} onNext={() => setScreen("mode")} />
        )}
        {screen === "mode" && (
          <ScreenMode mode={mode} onSelect={setMode} onNext={() => setScreen("input")} />
        )}
        {screen === "input" && (
          <ScreenInput
            mode={mode}
            cgmData={cgmData}
            inputs={inputs}
            onChange={updateInput}
            onCalc={handleCalc}
            onBack={() => setScreen("mode")}
          />
        )}
        {screen === "result" && result && (
          <ScreenResult
            result={result}
            mode={mode}
            bg={result.bg}
            profile={profile}
            onValidate={() => setValidated(true)}
            validated={validated}
            onReset={reset}
          />
        )}
      </div>
    </div>
  );
}
