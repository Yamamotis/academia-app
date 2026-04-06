import { useState, useEffect, useMemo } from "react";
import crypto from "crypto-js";
import { supabase, toDb, fromDb } from "./supabase";

// main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Reset global
const style = document.createElement('style')
style.textContent = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } html, body, #root { height: 100%; width: 100%; } body { margin: 0; }`
document.head.appendChild(style)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ─── SUPABASE TABLE HOOK ──────────────────────────────────────────────────────
function useTable(tableName) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from(tableName)
      .select("*")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(`[${tableName}] fetch error:`, error.message);
        else setRows((data || []).map(fromDb));
        setLoading(false);
      });
  }, [tableName]);

  const add = async (record) => {
    const { id: _id, ...rest } = record; // remove id local se existir
    const { data, error } = await supabase
      .from(tableName)
      .insert([toDb(rest)])
      .select()
      .single();
    if (error) { console.error(`[${tableName}] insert error:`, error.message); return null; }
    const mapped = fromDb(data);
    setRows((prev) => [...prev, mapped]);
    return mapped;
  };

  const update = async (id, record) => {
    const { id: _id, created_at: _c, ...rest } = toDb(record);
    const { data, error } = await supabase
      .from(tableName)
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) { console.error(`[${tableName}] update error:`, error.message); return null; }
    const mapped = fromDb(data);
    setRows((prev) => prev.map((r) => r.id === id ? mapped : r));
    return mapped;
  };

  const remove = async (id) => {
    const { error } = await supabase.from(tableName).delete().eq("id", id);
    if (error) { console.error(`[${tableName}] delete error:`, error.message); return false; }
    setRows((prev) => prev.filter((r) => r.id !== id));
    return true;
  };

  return { rows, loading, add, update, remove };
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const STATUS_COLORS = { Ativo: "#22c55e", Inativo: "#64748b", Inadimplente: "#ef4444", Suspenso: "#f59e0b" };
const PAY_STATUS_COLORS = { Pago: "#22c55e", Pendente: "#f59e0b", Atrasado: "#ef4444" };

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const icons = {
  dashboard: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  students: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  teachers: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  modalities: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  classes: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  schedule: "M8 2v4 M16 2v4 M3 10h18 M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z",
  financial: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  reports: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  attendance: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  plus: "M12 5v14 M5 12h14",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  delete: "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  check: "M20 6L9 17l-5-5",
  close: "M18 6L6 18 M6 6l12 12",
  alert: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  trend: "M23 6l-9.5 9.5-5-5L1 18",
  belt: "M2 12h20 M12 2v20",
};

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
const Badge = ({ color, children }) => (
  <span style={{
    background: color + "22", color, border: `1px solid ${color}44`,
    padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
    letterSpacing: "0.05em", textTransform: "uppercase"
  }}>{children}</span>
);

const Card = ({ children, style = {} }) => (
  <div style={{
    background: "#1e293b", borderRadius: 12, padding: "20px 24px",
    border: "1px solid #334155", ...style
  }}>{children}</div>
);

const StatCard = ({ label, value, sub, icon, color = "#38bdf8" }) => (
  <Card style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
    <div style={{
      width: 48, height: 48, borderRadius: 12, background: color + "22",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
    }}>
      <Icon d={icons[icon] || icons.dashboard} size={22} color={color} />
    </div>
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: color, marginTop: 4 }}>{sub}</div>}
    </div>
  </Card>
);

const Btn = ({ onClick, children, variant = "primary", size = "md", style = {}, disabled = false }) => {
  const base = {
    border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700, fontFamily: "inherit", display: "inline-flex", alignItems: "center",
    gap: 6, transition: "all 0.15s", opacity: disabled ? 0.5 : 1,
    padding: size === "sm" ? "6px 14px" : size === "lg" ? "12px 28px" : "9px 20px",
    fontSize: size === "sm" ? 12 : 14,
  };
  const variants = {
    primary: { background: "#38bdf8", color: "#0f172a" },
    danger: { background: "#ef444422", color: "#ef4444", border: "1px solid #ef444433" },
    ghost: { background: "transparent", color: "#94a3b8", border: "1px solid #334155" },
    success: { background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e33" },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
};

const Input = ({ label, value, onChange, type = "text", options, placeholder, required }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {label && <label style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}{required && " *"}</label>}
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px",
        color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none"
      }}>
        <option value="">Selecionar...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px",
          color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none"
        }} />
    )}
  </div>
);

const Modal = ({ title, onClose, children, width = 560 }) => (
  <div style={{
    position: "fixed", inset: 0, background: "#00000099", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20
  }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background: "#1e293b", border: "1px solid #334155", borderRadius: 16,
      width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto"
    }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>
          <Icon d={icons.close} size={20} />
        </button>
      </div>
      <div style={{ padding: "24px" }}>{children}</div>
    </div>
  </div>
);

const Table = ({ cols, rows, onEdit, onDelete, extraActions }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {cols.map(c => (
            <th key={c.key} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #334155" }}>{c.label}</th>
          ))}
          <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "1px solid #334155" }}>Ações</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={cols.length + 1} style={{ textAlign: "center", padding: 40, color: "#475569" }}>Nenhum registro encontrado</td></tr>
        ) : rows.map((row, i) => (
          <tr key={row.id || i} style={{ borderBottom: "1px solid #1e293b", transition: "background 0.1s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#ffffff08"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            {cols.map(c => (
              <td key={c.key} style={{ padding: "12px 16px", fontSize: 14, color: "#e2e8f0" }}>
                {c.render ? c.render(row[c.key], row) : row[c.key]}
              </td>
            ))}
            <td style={{ padding: "12px 16px", textAlign: "right" }}>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {extraActions && extraActions(row)}
                {onEdit && <Btn onClick={() => onEdit(row)} variant="ghost" size="sm"><Icon d={icons.edit} size={14} />Editar</Btn>}
                {onDelete && <Btn onClick={() => onDelete(row.id)} variant="danger" size="sm"><Icon d={icons.delete} size={14} /></Btn>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "'Barlow', sans-serif", flexDirection: "column", gap: 16
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;700;900&display=swap');`}</style>
      <div style={{
        width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </div>
      <div style={{ color: "#38bdf8", fontSize: 14, fontWeight: 700, letterSpacing: "0.1em" }}>CARREGANDO...</div>
      <div style={{ color: "#475569", fontSize: 12 }}>Conectando ao banco de dados</div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const HASHED_PASSWORD = "5395546dfb06c37bc99889acce742b0bd5e1d48916ad4c9afa120a884c43966a";

  const handleLogin = () => {
    if (!user || !pass) { setErr("Preencha todos os campos."); return; }
    const passHash = crypto.SHA256(pass).toString();
    if (user === "admin" && passHash === HASHED_PASSWORD) {
      onLogin();
    } else {
      setErr("Usuário ou senha inválidos");
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "'Barlow', sans-serif"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&family=Barlow+Condensed:wght@700;800;900&display=swap');
        * { box-sizing: border-box; }
        input:focus { border-color: #38bdf8 !important; box-shadow: 0 0 0 3px #38bdf822 !important; }
        select:focus { border-color: #38bdf8 !important; box-shadow: 0 0 0 3px #38bdf822 !important; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
      `}</style>
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: -200, right: -200, width: 600, height: 600, background: "radial-gradient(circle, #38bdf811 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -200, left: -200, width: 500, height: 500, background: "radial-gradient(circle, #0ea5e911 0%, transparent 70%)" }} />
      </div>

      <div style={{ width: "100%", maxWidth: 420, padding: 20, position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 18, background: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px"
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 900, color: "#f1f5f9", margin: 0, letterSpacing: "0.02em" }}>PATRIOTA</h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: "4px 0 0" }}>FIGHT TEAM</p>
        </div>

        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Usuário" value={user} onChange={setUser} placeholder="Digite seu usuário" />
            <Input label="Senha" type="password" value={pass} onChange={setPass} placeholder="••••••••" />
            {err && (
              <div style={{ background: "#ef444422", border: "1px solid #ef444433", borderRadius: 8, padding: "10px 14px", color: "#ef4444", fontSize: 13 }}>
                {err}
              </div>
            )}
            <Btn onClick={handleLogin} size="lg" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── PAGE HEADER ──────────────────────────────────────────────────────────────
const PageHeader = ({ title, subtitle, action }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
    <div>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#f1f5f9", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>{title}</h2>
      {subtitle && <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ students, teachers, classes, payments, modalities }) {
  const totalStudents = students.length;
  const activeStudents = students.filter(s => s.status === "Ativo").length;
  const delinquents = students.filter(s => s.status === "Inadimplente").length;
  const thisMonth = students.filter(s => s.dataMatricula?.startsWith(new Date().getFullYear().toString())).length;
  const totalTeachers = teachers.length;
  const weekClasses = classes.length;
  const todayDay = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][new Date().getDay()];
  const todayClasses = classes.filter(c => c.diaSemana === todayDay);
  const paidPayments = payments.filter(p => p.status === "Pago");
  const monthRevenue = paidPayments.reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
  const overdueAmount = payments.filter(p => p.status === "Atrasado").reduce((sum, p) => sum + (Number(p.valor) || 0), 0);

  return (
    <div>
      <PageHeader title="DASHBOARD" subtitle="Visão geral da academia" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard label="Total de Alunos" value={totalStudents} icon="students" color="#38bdf8" sub={`${activeStudents} ativos`} />
        <StatCard label="Alunos Inadimplentes" value={delinquents} icon="alert" color="#ef4444" sub="Requer atenção" />
        <StatCard label="Novos no Ano" value={thisMonth} icon="trend" color="#22c55e" sub="Este ano" />
        <StatCard label="Professores" value={totalTeachers} icon="teachers" color="#a78bfa" sub="Ativos na academia" />
        <StatCard label="Aulas na Semana" value={weekClasses} icon="classes" color="#f59e0b" sub={`${todayClasses.length} hoje`} />
        <StatCard label="Receita do Mês" value={`R$ ${monthRevenue.toLocaleString("pt-BR")}`} icon="financial" color="#34d399" sub="Mensalidades pagas" />
        <StatCard label="Em Atraso" value={`R$ ${overdueAmount.toLocaleString("pt-BR")}`} icon="alert" color="#ef4444" sub="Mensalidades atrasadas" />
        <StatCard label="Modalidades" value={modalities.length} icon="modalities" color="#38bdf8" sub="Artes marciais" />
      </div>

      <Card>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          📅 Agenda de Hoje — {todayDay}
        </h3>
        {todayClasses.length === 0 ? (
          <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>Nenhuma aula programada para hoje.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Horário", "Modalidade", "Professor", "Sala", "Capacidade"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 14px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #334155" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {todayClasses.map(c => {
                  const mod = modalities.find(m => m.id === c.modalidadeId);
                  const prof = teachers.find(t => t.id === c.professorId);
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid #334155" }}>
                      <td style={{ padding: "12px 14px", color: "#38bdf8", fontWeight: 700 }}>{c.horarioInicio} – {c.horarioFim}</td>
                      <td style={{ padding: "12px 14px", color: "#e2e8f0" }}>{mod?.nome}</td>
                      <td style={{ padding: "12px 14px", color: "#e2e8f0" }}>{prof?.nome}</td>
                      <td style={{ padding: "12px 14px", color: "#94a3b8" }}>{c.sala}</td>
                      <td style={{ padding: "12px 14px", color: "#94a3b8" }}>{c.capacidade} alunos</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── STUDENTS ────────────────────────────────────────────────────────────────
function StudentsPage({ students, addStudent, updateStudent, removeStudent, teachers, modalities, plans, payments }) {
  const [search, setSearch] = useState("");
  const [filterModal, setFilterModal] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [viewStudent, setViewStudent] = useState(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => students.filter(s =>
    ((s.nome || "").toLowerCase().includes(search.toLowerCase()) || (s.cpf || "").includes(search)) &&
    (!filterModal || s.modalidade === filterModal)
  ), [students, search, filterModal]);

  const openNew = () => {
    setForm({ nome: "", cpf: "", dataNascimento: "", telefone: "", email: "", endereco: "", dataMatricula: new Date().toISOString().split("T")[0], modalidade: "", professorId: "", planoId: "", status: "Ativo" });
    setModal("form");
  };
  const openEdit = (s) => { setForm({ ...s }); setModal("form"); };

  const save = async () => {
    if (!form.nome) return;
    setSaving(true);
    if (form.id) {
      await updateStudent(form.id, form);
    } else {
      await addStudent(form);
    }
    setSaving(false);
    setModal(null);
  };

  const del = async (id) => {
    if (confirm("Excluir aluno?")) await removeStudent(id);
  };

  const statusOpts = ["Ativo", "Inativo", "Suspenso", "Inadimplente"].map(s => ({ value: s, label: s }));

  return (
    <div>
      <PageHeader title="ALUNOS" subtitle={`${filtered.length} aluno(s) encontrado(s)`}
        action={<Btn onClick={openNew}><Icon d={icons.plus} size={16} />Novo Aluno</Btn>} />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
              <Icon d={icons.search} size={16} color="#64748b" />
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou CPF..."
              style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px 10px 38px", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
          </div>
          <select value={filterModal} onChange={e => setFilterModal(e.target.value)} style={{
            background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none"
          }}>
            <option value="">Todas Modalidades</option>
            {modalities.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
          </select>
        </div>
      </Card>

      <Card>
        <Table
          cols={[
            { key: "nome", label: "Nome" },
            { key: "modalidade", label: "Modalidade" },
            { key: "telefone", label: "Telefone" },
            { key: "dataMatricula", label: "Matrícula" },
            { key: "status", label: "Status", render: v => <Badge color={STATUS_COLORS[v] || "#64748b"}>{v}</Badge> },
          ]}
          rows={filtered}
          onEdit={openEdit}
          onDelete={del}
          extraActions={(row) => (
            <Btn onClick={() => setViewStudent(row)} variant="ghost" size="sm">
              <Icon d={icons.users} size={14} />Ver
            </Btn>
          )}
        />
      </Card>

      {modal === "form" && (
        <Modal title={form.id ? "Editar Aluno" : "Novo Aluno"} onClose={() => setModal(null)} width={640}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "1/-1" }}><Input label="Nome Completo" value={form.nome || ""} onChange={v => setForm(p => ({ ...p, nome: v }))} required /></div>
            <Input label="CPF" value={form.cpf || ""} onChange={v => setForm(p => ({ ...p, cpf: v }))} placeholder="000.000.000-00" />
            <Input label="Data de Nascimento" type="date" value={form.dataNascimento || ""} onChange={v => setForm(p => ({ ...p, dataNascimento: v }))} />
            <Input label="Telefone" value={form.telefone || ""} onChange={v => setForm(p => ({ ...p, telefone: v }))} placeholder="(00) 00000-0000" />
            <Input label="Email" type="email" value={form.email || ""} onChange={v => setForm(p => ({ ...p, email: v }))} />
            <div style={{ gridColumn: "1/-1" }}><Input label="Endereço" value={form.endereco || ""} onChange={v => setForm(p => ({ ...p, endereco: v }))} /></div>
            <Input label="Data de Matrícula" type="date" value={form.dataMatricula || ""} onChange={v => setForm(p => ({ ...p, dataMatricula: v }))} />
            <Input label="Modalidade" value={form.modalidade || ""} onChange={v => setForm(p => ({ ...p, modalidade: v }))} options={modalities.map(m => ({ value: m.nome, label: m.nome }))} />
            <Input label="Professor Responsável" value={form.professorId || ""} onChange={v => setForm(p => ({ ...p, professorId: v }))} options={teachers.map(t => ({ value: t.id, label: t.nome }))} />
            <Input label="Plano" value={form.planoId || ""} onChange={v => setForm(p => ({ ...p, planoId: v }))} options={plans.map(p => ({ value: p.id, label: `${p.nome} — R$ ${p.valor}` }))} />
            <Input label="Status" value={form.status || "Ativo"} onChange={v => setForm(p => ({ ...p, status: v }))} options={statusOpts} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <Btn onClick={() => setModal(null)} variant="ghost">Cancelar</Btn>
            <Btn onClick={save} disabled={saving}><Icon d={icons.check} size={16} />{saving ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}

      {viewStudent && (
        <Modal title={viewStudent.nome} onClose={() => setViewStudent(null)} width={560}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[["CPF", viewStudent.cpf], ["Telefone", viewStudent.telefone], ["Email", viewStudent.email], ["Modalidade", viewStudent.modalidade], ["Matrícula", viewStudent.dataMatricula], ["Status", viewStudent.status]].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 14, color: "#e2e8f0" }}>{k === "Status" ? <Badge color={STATUS_COLORS[v] || "#64748b"}>{v}</Badge> : v}</div>
              </div>
            ))}
          </div>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Histórico de Pagamentos</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {payments.filter(p => p.alunoId === viewStudent.id).map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#0f172a", borderRadius: 8, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>Venc: {p.vencimento}</div>
                  {p.dataPagamento && <div style={{ fontSize: 12, color: "#64748b" }}>Pago em: {p.dataPagamento}</div>}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>R$ {p.valor}</span>
                  <Badge color={PAY_STATUS_COLORS[p.status]}>{p.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TEACHERS ────────────────────────────────────────────────────────────────
function TeachersPage({ teachers, addTeacher, updateTeacher, removeTeacher, modalities, classes }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = teachers.filter(t => (t.nome || "").toLowerCase().includes(search.toLowerCase()));

  const openNew = () => {
    setForm({ nome: "", cpf: "", telefone: "", email: "", modalidade: "", dataContratacao: new Date().toISOString().split("T")[0], status: "Ativo" });
    setModal("form");
  };

  const save = async () => {
    if (!form.nome) return;
    setSaving(true);
    if (form.id) {
      await updateTeacher(form.id, form);
    } else {
      await addTeacher(form);
    }
    setSaving(false);
    setModal(null);
  };

  const del = async (id) => {
    if (confirm("Excluir professor?")) await removeTeacher(id);
  };

  return (
    <div>
      <PageHeader title="PROFESSORES" subtitle={`${filtered.length} professor(es)`}
        action={<Btn onClick={openNew}><Icon d={icons.plus} size={16} />Novo Professor</Btn>} />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ position: "relative", maxWidth: 360 }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><Icon d={icons.search} size={16} color="#64748b" /></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar professor..."
            style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px 10px 38px", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
        </div>
      </Card>

      <Card>
        <Table
          cols={[
            { key: "nome", label: "Nome" },
            { key: "modalidade", label: "Modalidade" },
            { key: "telefone", label: "Telefone" },
            { key: "email", label: "Email" },
            { key: "dataContratacao", label: "Contratação" },
            { key: "status", label: "Status", render: v => <Badge color={v === "Ativo" ? "#22c55e" : "#64748b"}>{v}</Badge> },
          ]}
          rows={filtered}
          onEdit={r => { setForm(r); setModal("form"); }}
          onDelete={del}
          extraActions={row => {
            const count = classes.filter(c => c.professorId === row.id).length;
            return <span style={{ fontSize: 12, color: "#64748b", padding: "4px 10px" }}>{count} aulas</span>;
          }}
        />
      </Card>

      {modal === "form" && (
        <Modal title={form.id ? "Editar Professor" : "Novo Professor"} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "1/-1" }}><Input label="Nome Completo" value={form.nome || ""} onChange={v => setForm(p => ({ ...p, nome: v }))} required /></div>
            <Input label="CPF" value={form.cpf || ""} onChange={v => setForm(p => ({ ...p, cpf: v }))} />
            <Input label="Telefone" value={form.telefone || ""} onChange={v => setForm(p => ({ ...p, telefone: v }))} />
            <Input label="Email" type="email" value={form.email || ""} onChange={v => setForm(p => ({ ...p, email: v }))} />
            <Input label="Modalidade" value={form.modalidade || ""} onChange={v => setForm(p => ({ ...p, modalidade: v }))} options={modalities.map(m => ({ value: m.nome, label: m.nome }))} />
            <Input label="Data de Contratação" type="date" value={form.dataContratacao || ""} onChange={v => setForm(p => ({ ...p, dataContratacao: v }))} />
            <Input label="Status" value={form.status || "Ativo"} onChange={v => setForm(p => ({ ...p, status: v }))} options={[{ value: "Ativo", label: "Ativo" }, { value: "Inativo", label: "Inativo" }]} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <Btn onClick={() => setModal(null)} variant="ghost">Cancelar</Btn>
            <Btn onClick={save} disabled={saving}><Icon d={icons.check} size={16} />{saving ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MODALITIES ───────────────────────────────────────────────────────────────
function ModalitiesPage({ modalities, addModality, updateModality, removeModality }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const openNew = () => { setForm({ nome: "", descricao: "", nivel: "Todos" }); setModal("form"); };

  const save = async () => {
    if (!form.nome) return;
    setSaving(true);
    if (form.id) {
      await updateModality(form.id, form);
    } else {
      await addModality(form);
    }
    setSaving(false);
    setModal(null);
  };

  const del = async (id) => {
    if (confirm("Excluir modalidade?")) await removeModality(id);
  };

  const nivelColor = { "Iniciante": "#22c55e", "Intermediário": "#f59e0b", "Avançado": "#ef4444", "Todos": "#38bdf8" };

  return (
    <div>
      <PageHeader title="MODALIDADES" subtitle="Artes marciais disponíveis"
        action={<Btn onClick={openNew}><Icon d={icons.plus} size={16} />Nova Modalidade</Btn>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {modalities.map(m => (
          <Card key={m.id} style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#38bdf822", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon d={icons.modalities} size={22} color="#38bdf8" />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn onClick={() => { setForm(m); setModal("form"); }} variant="ghost" size="sm"><Icon d={icons.edit} size={14} /></Btn>
                <Btn onClick={() => del(m.id)} variant="danger" size="sm"><Icon d={icons.delete} size={14} /></Btn>
              </div>
            </div>
            <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>{m.nome}</h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{m.descricao}</p>
            <Badge color={nivelColor[m.nivel] || "#38bdf8"}>{m.nivel}</Badge>
          </Card>
        ))}
      </div>

      {modal === "form" && (
        <Modal title={form.id ? "Editar Modalidade" : "Nova Modalidade"} onClose={() => setModal(null)} width={480}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Nome" value={form.nome || ""} onChange={v => setForm(p => ({ ...p, nome: v }))} required />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Descrição</label>
              <textarea value={form.descricao || ""} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} rows={3}
                style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
            </div>
            <Input label="Nível" value={form.nivel || "Todos"} onChange={v => setForm(p => ({ ...p, nivel: v }))} options={["Iniciante", "Intermediário", "Avançado", "Todos"].map(l => ({ value: l, label: l }))} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <Btn onClick={() => setModal(null)} variant="ghost">Cancelar</Btn>
            <Btn onClick={save} disabled={saving}><Icon d={icons.check} size={16} />{saving ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── CLASSES ──────────────────────────────────────────────────────────────────
function ClassesPage({ classes, addClass, updateClass, removeClass, teachers, modalities }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setForm({ modalidadeId: "", professorId: "", diaSemana: "Segunda", horarioInicio: "18:00", horarioFim: "19:30", capacidade: 20, sala: "" });
    setModal("form");
  };

  const save = async () => {
    if (!form.modalidadeId || !form.professorId) return;
    const entry = { ...form, capacidade: Number(form.capacidade) };
    setSaving(true);
    if (form.id) {
      await updateClass(form.id, entry);
    } else {
      await addClass(entry);
    }
    setSaving(false);
    setModal(null);
  };

  const del = async (id) => {
    if (confirm("Excluir aula?")) await removeClass(id);
  };

  return (
    <div>
      <PageHeader title="AULAS" subtitle={`${classes.length} aulas cadastradas`}
        action={<Btn onClick={() => { openNew(); setModal("form"); }}><Icon d={icons.plus} size={16} />Nova Aula</Btn>} />

      <Card>
        <Table
          cols={[
            { key: "modalidadeId", label: "Modalidade", render: v => modalities.find(m => m.id === v)?.nome || v },
            { key: "professorId", label: "Professor", render: v => teachers.find(t => t.id === v)?.nome || v },
            { key: "diaSemana", label: "Dia" },
            { key: "horarioInicio", label: "Início", render: (v, row) => `${v} – ${row.horarioFim}` },
            { key: "capacidade", label: "Capacidade", render: v => `${v} alunos` },
            { key: "sala", label: "Sala" },
          ]}
          rows={classes}
          onEdit={r => { setForm({ ...r }); setModal("form"); }}
          onDelete={del}
        />
      </Card>

      {modal === "form" && (
        <Modal title={form.id ? "Editar Aula" : "Nova Aula"} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Input label="Modalidade" value={form.modalidadeId || ""} onChange={v => setForm(p => ({ ...p, modalidadeId: v }))} options={modalities.map(m => ({ value: m.id, label: m.nome }))} />
            <Input label="Professor" value={form.professorId || ""} onChange={v => setForm(p => ({ ...p, professorId: v }))} options={teachers.map(t => ({ value: t.id, label: t.nome }))} />
            <Input label="Dia da Semana" value={form.diaSemana || "Segunda"} onChange={v => setForm(p => ({ ...p, diaSemana: v }))} options={DAYS.map(d => ({ value: d, label: d }))} />
            <Input label="Sala" value={form.sala || ""} onChange={v => setForm(p => ({ ...p, sala: v }))} placeholder="Ex: Tatame A" />
            <Input label="Horário Início" type="time" value={form.horarioInicio || ""} onChange={v => setForm(p => ({ ...p, horarioInicio: v }))} />
            <Input label="Horário Fim" type="time" value={form.horarioFim || ""} onChange={v => setForm(p => ({ ...p, horarioFim: v }))} />
            <Input label="Capacidade (alunos)" type="number" value={String(form.capacidade || 20)} onChange={v => setForm(p => ({ ...p, capacidade: v }))} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <Btn onClick={() => setModal(null)} variant="ghost">Cancelar</Btn>
            <Btn onClick={save} disabled={saving}><Icon d={icons.check} size={16} />{saving ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SCHEDULE ────────────────────────────────────────────────────────────────
function SchedulePage({ classes, teachers, modalities }) {
  const hours = ["07:00", "08:00", "09:00", "10:00", "11:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];
  const days = DAYS.slice(0, 6);
  const modColors = ["#38bdf8", "#f59e0b", "#a78bfa", "#ef4444", "#22c55e", "#fb923c", "#e879f9"];

  return (
    <div>
      <PageHeader title="AGENDA SEMANAL" subtitle="Grade de horários da academia" />
      <Card style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ width: 80, padding: "14px 16px", textAlign: "left", fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid #334155", borderRight: "1px solid #334155" }}>Hora</th>
                {days.map(d => (
                  <th key={d} style={{ padding: "14px 16px", textAlign: "center", fontSize: 12, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #334155", borderRight: "1px solid #1e293b" }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map(hour => (
                <tr key={hour} style={{ borderBottom: "1px solid #334155" }}>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#38bdf8", verticalAlign: "top", borderRight: "1px solid #334155", whiteSpace: "nowrap" }}>{hour}</td>
                  {days.map(day => {
                    const cls = classes.filter(c => c.diaSemana === day && (c.horarioInicio || "").startsWith(hour.split(":")[0]));
                    return (
                      <td key={day} style={{ padding: 6, verticalAlign: "top", minWidth: 130, borderRight: "1px solid #1e293b" }}>
                        {cls.map((c, ci) => {
                          const mod = modalities.find(m => m.id === c.modalidadeId);
                          const prof = teachers.find(t => t.id === c.professorId);
                          const color = modColors[ci % modColors.length];
                          return (
                            <div key={c.id} style={{ background: color + "18", border: `1px solid ${color}44`, borderRadius: 6, padding: "6px 8px", marginBottom: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color }}>{mod?.nome}</div>
                              <div style={{ fontSize: 11, color: "#64748b" }}>{prof?.nome?.split(" ")[0]}</div>
                              <div style={{ fontSize: 11, color: "#475569" }}>{c.horarioInicio}–{c.horarioFim}</div>
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
function AttendancePage({ classes, students, teachers, modalities }) {
  const [selectedClass, setSelectedClass] = useState("");
  const [attendance, setAttendance] = useState({});
  const [saved, setSaved] = useState(false);

  const cls = classes.find(c => c.id === selectedClass);
  const mod = cls && modalities.find(m => m.id === cls.modalidadeId);
  const classStudents = cls ? students.filter(s => s.modalidade === mod?.nome && s.status === "Ativo") : [];

  const toggle = id => { setAttendance(prev => ({ ...prev, [id]: !prev[id] })); setSaved(false); };

  const saveAttendance = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const presentCount = Object.values(attendance).filter(Boolean).length;

  return (
    <div>
      <PageHeader title="PRESENÇA" subtitle="Controle de presença nas aulas" />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <Input label="Selecionar Aula" value={selectedClass} onChange={setSelectedClass} options={classes.map(c => {
              const m = modalities.find(m => m.id === c.modalidadeId);
              const t = teachers.find(t => t.id === c.professorId);
              return { value: c.id, label: `${c.diaSemana} ${c.horarioInicio} – ${m?.nome} (${t?.nome?.split(" ")[0]})` };
            })} />
          </div>
          <div style={{ fontSize: 14, color: "#64748b", paddingTop: 20 }}>
            Data: <strong style={{ color: "#e2e8f0" }}>{new Date().toLocaleDateString("pt-BR")}</strong>
          </div>
        </div>
      </Card>

      {cls && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "10px 20px", fontSize: 14, color: "#94a3b8" }}>
              Total: <strong style={{ color: "#f1f5f9" }}>{classStudents.length}</strong>
            </div>
            <div style={{ background: "#22c55e22", border: "1px solid #22c55e33", borderRadius: 8, padding: "10px 20px", fontSize: 14, color: "#22c55e" }}>
              Presentes: <strong>{presentCount}</strong>
            </div>
            <div style={{ background: "#ef444422", border: "1px solid #ef444433", borderRadius: 8, padding: "10px 20px", fontSize: 14, color: "#ef4444" }}>
              Ausentes: <strong>{classStudents.length - presentCount}</strong>
            </div>
          </div>
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 20 }}>
              {classStudents.map(s => {
                const present = !!attendance[s.id];
                return (
                  <div key={s.id} onClick={() => toggle(s.id)} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                    borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
                    background: present ? "#22c55e18" : "#0f172a",
                    border: `1px solid ${present ? "#22c55e44" : "#334155"}`,
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: present ? "#22c55e" : "#334155", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {present && <Icon d={icons.check} size={14} color="white" />}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{s.nome}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{s.email}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Btn onClick={saveAttendance} variant={saved ? "success" : "primary"}>
              {saved ? <><Icon d={icons.check} size={16} />Presença Salva!</> : <><Icon d={icons.check} size={16} />Confirmar Presença</>}
            </Btn>
          </Card>
        </>
      )}

      {!cls && (
        <Card>
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569" }}>
            <Icon d={icons.attendance} size={48} color="#334155" />
            <p style={{ marginTop: 12, fontSize: 14 }}>Selecione uma aula para registrar presença</p>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── FINANCIAL ────────────────────────────────────────────────────────────────
function FinancialPage({ payments, addPayment, updatePayment, removePayment, students, plans, addPlan, updatePlan, removePlan }) {
  const [tab, setTab] = useState("payments");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [planForm, setPlanForm] = useState({});
  const [saving, setSaving] = useState(false);

  const paidTotal = payments.filter(p => p.status === "Pago").reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const pendingTotal = payments.filter(p => p.status === "Pendente").reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const overdueTotal = payments.filter(p => p.status === "Atrasado").reduce((s, p) => s + (Number(p.valor) || 0), 0);

  const registerPayment = async (payment) => {
    await updatePayment(payment.id, { ...payment, status: "Pago", dataPagamento: new Date().toISOString().split("T")[0] });
  };

  const savePayment = async () => {
    if (!form.alunoId) return;
    const entry = { ...form, valor: Number(form.valor) };
    setSaving(true);
    if (form.id) {
      await updatePayment(form.id, entry);
    } else {
      await addPayment(entry);
    }
    setSaving(false);
    setModal(null);
  };

  const savePlan = async () => {
    if (!planForm.nome) return;
    const entry = { ...planForm, valor: Number(planForm.valor), frequencia: Number(planForm.frequencia) };
    setSaving(true);
    if (planForm.id) {
      await updatePlan(planForm.id, entry);
    } else {
      await addPlan(entry);
    }
    setSaving(false);
    setModal(null);
  };

  return (
    <div>
      <PageHeader title="FINANCEIRO" subtitle="Controle de mensalidades e receitas" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard label="Receita do Mês" value={`R$ ${paidTotal.toLocaleString("pt-BR")}`} icon="financial" color="#22c55e" />
        <StatCard label="Pendente" value={`R$ ${pendingTotal.toLocaleString("pt-BR")}`} icon="alert" color="#f59e0b" />
        <StatCard label="Em Atraso" value={`R$ ${overdueTotal.toLocaleString("pt-BR")}`} icon="alert" color="#ef4444" />
        <StatCard label="Total Geral" value={`R$ ${(paidTotal + pendingTotal + overdueTotal).toLocaleString("pt-BR")}`} icon="trend" color="#38bdf8" />
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["payments", "Mensalidades"], ["overdue", "Inadimplentes"], ["plans", "Planos"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontWeight: 700, fontSize: 13, transition: "all 0.15s",
            background: tab === key ? "#38bdf8" : "#1e293b", color: tab === key ? "#0f172a" : "#64748b"
          }}>{label}</button>
        ))}
      </div>

      {tab === "payments" && (
        <Card>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <Btn onClick={() => { setForm({ alunoId: "", planoId: "", valor: "", vencimento: "", dataPagamento: "", status: "Pendente" }); setModal("payment"); }}>
              <Icon d={icons.plus} size={16} />Registrar Pagamento
            </Btn>
          </div>
          <Table
            cols={[
              { key: "alunoId", label: "Aluno", render: v => students.find(s => s.id === v)?.nome || v },
              { key: "valor", label: "Valor", render: v => `R$ ${Number(v).toLocaleString("pt-BR")}` },
              { key: "vencimento", label: "Vencimento" },
              { key: "dataPagamento", label: "Pago em", render: v => v || "—" },
              { key: "status", label: "Status", render: v => <Badge color={PAY_STATUS_COLORS[v]}>{v}</Badge> },
            ]}
            rows={payments}
            onEdit={r => { setForm({ ...r }); setModal("payment"); }}
            onDelete={id => { if (confirm("Excluir pagamento?")) removePayment(id); }}
            extraActions={row => row.status !== "Pago" && (
              <Btn onClick={() => registerPayment(row)} variant="success" size="sm">
                <Icon d={icons.check} size={14} />Pago
              </Btn>
            )}
          />
        </Card>
      )}

      {tab === "overdue" && (
        <Card>
          <Table
            cols={[
              { key: "alunoId", label: "Aluno", render: v => students.find(s => s.id === v)?.nome || v },
              { key: "valor", label: "Valor", render: v => `R$ ${Number(v).toLocaleString("pt-BR")}` },
              { key: "vencimento", label: "Vencimento" },
              { key: "status", label: "Status", render: v => <Badge color={PAY_STATUS_COLORS[v]}>{v}</Badge> },
            ]}
            rows={payments.filter(p => p.status === "Atrasado" || p.status === "Pendente")}
            onEdit={null} onDelete={null}
            extraActions={row => (
              <Btn onClick={() => registerPayment(row)} variant="success" size="sm">
                <Icon d={icons.check} size={14} />Baixar
              </Btn>
            )}
          />
        </Card>
      )}

      {tab === "plans" && (
        <Card>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <Btn onClick={() => { setPlanForm({ nome: "", valor: "", frequencia: "" }); setModal("plan"); }}>
              <Icon d={icons.plus} size={16} />Novo Plano
            </Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {plans.map(p => (
              <div key={p.id} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>{p.nome}</h3>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn onClick={() => { setPlanForm(p); setModal("plan"); }} variant="ghost" size="sm"><Icon d={icons.edit} size={14} /></Btn>
                    <Btn onClick={() => { if (confirm("Excluir plano?")) removePlan(p.id); }} variant="danger" size="sm"><Icon d={icons.delete} size={14} /></Btn>
                  </div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#38bdf8", marginBottom: 4 }}>R$ {p.valor}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>{p.frequencia}x por semana</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {modal === "payment" && (
        <Modal title={form.id ? "Editar Pagamento" : "Novo Pagamento"} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <Input label="Aluno" value={form.alunoId || ""} onChange={v => setForm(p => ({ ...p, alunoId: v }))} options={students.map(s => ({ value: s.id, label: s.nome }))} />
            </div>
            <Input label="Plano" value={form.planoId || ""} onChange={v => setForm(p => ({ ...p, planoId: v }))} options={plans.map(p => ({ value: p.id, label: p.nome }))} />
            <Input label="Valor (R$)" type="number" value={String(form.valor || "")} onChange={v => setForm(p => ({ ...p, valor: v }))} />
            <Input label="Vencimento" type="date" value={form.vencimento || ""} onChange={v => setForm(p => ({ ...p, vencimento: v }))} />
            <Input label="Data Pagamento" type="date" value={form.dataPagamento || ""} onChange={v => setForm(p => ({ ...p, dataPagamento: v }))} />
            <Input label="Status" value={form.status || "Pendente"} onChange={v => setForm(p => ({ ...p, status: v }))} options={["Pago", "Pendente", "Atrasado"].map(s => ({ value: s, label: s }))} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <Btn onClick={() => setModal(null)} variant="ghost">Cancelar</Btn>
            <Btn onClick={savePayment} disabled={saving}><Icon d={icons.check} size={16} />{saving ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}

      {modal === "plan" && (
        <Modal title={planForm.id ? "Editar Plano" : "Novo Plano"} onClose={() => setModal(null)} width={400}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Nome do Plano" value={planForm.nome || ""} onChange={v => setPlanForm(p => ({ ...p, nome: v }))} />
            <Input label="Valor (R$)" type="number" value={String(planForm.valor || "")} onChange={v => setPlanForm(p => ({ ...p, valor: v }))} />
            <Input label="Frequência Semanal" type="number" value={String(planForm.frequencia || "")} onChange={v => setPlanForm(p => ({ ...p, frequencia: v }))} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <Btn onClick={() => setModal(null)} variant="ghost">Cancelar</Btn>
            <Btn onClick={savePlan} disabled={saving}><Icon d={icons.check} size={16} />{saving ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────
function ReportsPage({ students, teachers, classes, payments, modalities }) {
  const [tab, setTab] = useState("students");

  const activeStudents = students.filter(s => s.status === "Ativo");
  const delinquentStudents = students.filter(s => s.status === "Inadimplente");
  const overduePayments = payments.filter(p => p.status === "Atrasado");

  const byModality = modalities.map(m => ({
    id: m.id,
    nome: m.nome,
    alunos: students.filter(s => s.modalidade === m.nome).length,
    aulas: classes.filter(c => c.modalidadeId === m.id).length,
  }));

  const byTeacher = teachers.map(t => ({
    id: t.id,
    nome: t.nome,
    modalidade: t.modalidade,
    aulas: classes.filter(c => c.professorId === t.id).length,
  }));

  const monthRevenue = payments.filter(p => p.status === "Pago").reduce((s, p) => s + (Number(p.valor) || 0), 0);

  return (
    <div>
      <PageHeader title="RELATÓRIOS" subtitle="Dados e estatísticas da academia" />

      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {[["students", "Alunos"], ["classes", "Aulas"], ["financial", "Financeiro"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontWeight: 700, fontSize: 13, transition: "all 0.15s",
            background: tab === key ? "#38bdf8" : "#1e293b", color: tab === key ? "#0f172a" : "#64748b"
          }}>{label}</button>
        ))}
      </div>

      {tab === "students" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            <StatCard label="Total de Alunos" value={students.length} icon="students" color="#38bdf8" />
            <StatCard label="Alunos Ativos" value={activeStudents.length} icon="check" color="#22c55e" />
            <StatCard label="Inadimplentes" value={delinquentStudents.length} icon="alert" color="#ef4444" />
          </div>
          <Card>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Alunos por Modalidade</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {byModality.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 120, fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{m.nome}</div>
                  <div style={{ flex: 1, height: 8, background: "#334155", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(4, students.length ? (m.alunos / students.length) * 100 : 0)}%`, background: "#38bdf8", borderRadius: 4, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ width: 30, textAlign: "right", fontSize: 13, fontWeight: 700, color: "#38bdf8" }}>{m.alunos}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Lista de Inadimplentes</h3>
            <Table
              cols={[
                { key: "nome", label: "Aluno" },
                { key: "modalidade", label: "Modalidade" },
                { key: "telefone", label: "Telefone" },
                { key: "status", label: "Status", render: v => <Badge color={STATUS_COLORS[v]}>{v}</Badge> },
              ]}
              rows={delinquentStudents}
              onEdit={null} onDelete={null}
            />
          </Card>
        </div>
      )}

      {tab === "classes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Aulas por Modalidade</h3>
            <Table
              cols={[
                { key: "nome", label: "Modalidade" },
                { key: "alunos", label: "Alunos Matriculados" },
                { key: "aulas", label: "Aulas Semanais" },
              ]}
              rows={byModality}
              onEdit={null} onDelete={null}
            />
          </Card>
          <Card>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Aulas por Professor</h3>
            <Table
              cols={[
                { key: "nome", label: "Professor" },
                { key: "modalidade", label: "Modalidade" },
                { key: "aulas", label: "Aulas Semanais" },
              ]}
              rows={byTeacher}
              onEdit={null} onDelete={null}
            />
          </Card>
        </div>
      )}

      {tab === "financial" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            <StatCard label="Receita do Mês" value={`R$ ${monthRevenue.toLocaleString("pt-BR")}`} icon="financial" color="#22c55e" />
            <StatCard label="Atrasadas" value={`R$ ${overduePayments.reduce((s, p) => s + (Number(p.valor) || 0), 0).toLocaleString("pt-BR")}`} icon="alert" color="#ef4444" />
            <StatCard label="Qtd Inadimplentes" value={overduePayments.length} icon="users" color="#f59e0b" />
          </div>
          <Card>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Mensalidades em Atraso</h3>
            <Table
              cols={[
                { key: "alunoId", label: "Aluno", render: v => students.find(s => s.id === v)?.nome || v },
                { key: "valor", label: "Valor", render: v => `R$ ${Number(v).toLocaleString("pt-BR")}` },
                { key: "vencimento", label: "Vencimento" },
                { key: "status", label: "Status", render: v => <Badge color={PAY_STATUS_COLORS[v]}>{v}</Badge> },
              ]}
              rows={overduePayments}
              onEdit={null} onDelete={null}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
const navItems = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "students", label: "Alunos", icon: "students" },
  { key: "teachers", label: "Professores", icon: "teachers" },
  { key: "modalities", label: "Modalidades", icon: "modalities" },
  { key: "classes", label: "Aulas", icon: "classes" },
  { key: "schedule", label: "Agenda", icon: "schedule" },
  { key: "attendance", label: "Presença", icon: "attendance" },
  { key: "financial", label: "Financeiro", icon: "financial" },
  { key: "reports", label: "Relatórios", icon: "reports" },
];

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Supabase tables ──
  const { rows: students, loading: sl, add: addStudent, update: updateStudent, remove: removeStudent } = useTable("students");
  const { rows: teachers, loading: tl, add: addTeacher, update: updateTeacher, remove: removeTeacher } = useTable("teachers");
  const { rows: modalities, loading: ml, add: addModality, update: updateModality, remove: removeModality } = useTable("modalities");
  const { rows: classes, loading: cl, add: addClass, update: updateClass, remove: removeClass } = useTable("classes");
  const { rows: payments, loading: pl, add: addPayment, update: updatePayment, remove: removePayment } = useTable("payments");
  const { rows: plans, loading: planl, add: addPlan, update: updatePlan, remove: removePlan } = useTable("plans");

  const loading = sl || tl || ml || cl || pl || planl;

  if (!auth) return <LoginScreen onLogin={() => setAuth(true)} />;
  if (loading) return <LoadingScreen />;

  const pageProps = {
    students, addStudent, updateStudent, removeStudent,
    teachers, addTeacher, updateTeacher, removeTeacher,
    modalities, addModality, updateModality, removeModality,
    classes, addClass, updateClass, removeClass,
    payments, addPayment, updatePayment, removePayment,
    plans, addPlan, updatePlan, removePlan,
  };

  const pages = {
    dashboard: <Dashboard students={students} teachers={teachers} classes={classes} payments={payments} modalities={modalities} />,
    students: <StudentsPage {...pageProps} />,
    teachers: <TeachersPage {...pageProps} />,
    modalities: <ModalitiesPage {...pageProps} />,
    classes: <ClassesPage {...pageProps} />,
    schedule: <SchedulePage classes={classes} teachers={teachers} modalities={modalities} />,
    attendance: <AttendancePage classes={classes} students={students} teachers={teachers} modalities={modalities} />,
    financial: <FinancialPage {...pageProps} />,
    reports: <ReportsPage students={students} teachers={teachers} classes={classes} payments={payments} modalities={modalities} />,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "'Barlow', sans-serif", color: "#e2e8f0", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@700;800;900&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: #38bdf8 !important; box-shadow: 0 0 0 3px #38bdf822 !important; outline: none; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        button:hover { filter: brightness(1.1); }
      `}</style>

      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 220 : 64, background: "#0d1526", borderRight: "1px solid #1e293b",
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
        transition: "width 0.2s", flexShrink: 0, overflowX: "hidden"
      }}>
        <div style={{ padding: "20px 16px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          {sidebarOpen && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#f1f5f9", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>PATRIOTA</div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: -1 }}>Fight Team</div>
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
          {navItems.map(item => {
            const active = page === item.key;
            return (
              <button key={item.key} onClick={() => setPage(item.key)} title={!sidebarOpen ? item.label : ""} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                background: active ? "#38bdf818" : "transparent",
                color: active ? "#38bdf8" : "#64748b",
                fontFamily: "inherit", fontSize: 13, fontWeight: active ? 700 : 500,
                marginBottom: 2, textAlign: "left", transition: "all 0.15s", whiteSpace: "nowrap"
              }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#ffffff08"; e.currentTarget.style.color = "#94a3b8"; }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748b"; } }}
              >
                <div style={{ flexShrink: 0 }}><Icon d={icons[item.icon]} size={18} /></div>
                {sidebarOpen && item.label}
                {active && sidebarOpen && <div style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#38bdf8" }} />}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "12px 8px", borderTop: "1px solid #1e293b" }}>
          <button onClick={() => setSidebarOpen(p => !p)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
            borderRadius: 8, border: "none", cursor: "pointer", background: "transparent",
            color: "#475569", fontFamily: "inherit", fontSize: 12, marginBottom: 6, whiteSpace: "nowrap"
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={sidebarOpen ? "M19 12H5 M12 5l-7 7 7 7" : "M5 12h14 M12 5l7 7-7 7"} />
            </svg>
            {sidebarOpen && "Recolher"}
          </button>
          <button onClick={() => setAuth(false)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
            borderRadius: 8, border: "none", cursor: "pointer", background: "transparent",
            color: "#475569", fontFamily: "inherit", fontSize: 12, whiteSpace: "nowrap"
          }}>
            <Icon d={icons.logout} size={18} />
            {sidebarOpen && "Sair"}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "28px 32px", minWidth: 0, overflow: "auto" }}>
        {pages[page] || <div>Página não encontrada</div>}
      </main>
    </div>
  );
}
