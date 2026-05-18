import { useState, useEffect, useRef, useMemo, createContext, useContext, useCallback } from "react";
import { supabase, toDb, fromDb } from "./supabase";

// ─── UTILS ───────────────────────────────────────────────────────────────────
const formatDate = (d) => {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const formatMoney = (v) => {
  const n = Number(v);
  if (isNaN(n)) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const maskCPF = (v) => v.replace(/\D/g, "").slice(0, 11)
  .replace(/(\d{3})(\d)/, "$1.$2")
  .replace(/(\d{3})(\d)/, "$1.$2")
  .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const maskPhone = (v) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
};

const exportCSV = (filename, headers, rows) => {
  const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const printReceipt = (payment, student) => {
  const win = window.open("", "_blank", "width=520,height=720");
  if (!win) return;
  const date = new Date().toLocaleDateString("pt-BR");
  const num = String(Date.now()).slice(-6);
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo #${num}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:40px;color:#111;max-width:480px;margin:0 auto}
    h1{font-size:22px;text-align:center;margin-bottom:4px}h2{font-size:13px;text-align:center;color:#555;margin-bottom:20px;font-weight:normal;letter-spacing:.05em;text-transform:uppercase}
    .num{background:#f5f5f5;padding:6px 16px;border-radius:4px;font-size:13px;font-family:monospace;text-align:center;margin-bottom:20px;border:1px solid #ddd}
    .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;font-size:14px}.label{color:#666}
    .total{display:flex;justify-content:space-between;font-size:20px;font-weight:bold;padding:16px 0;border-top:3px solid #111;margin-top:8px}
    .footer{margin-top:28px;text-align:center;font-size:12px;color:#999;border-top:1px dashed #ccc;padding-top:14px;line-height:1.6}
    @media print{.no-print{display:none}body{padding:20px}}
  </style></head><body>
    <h1>PATRIOTA FIGHT TEAM</h1>
    <h2>Academia de Artes Marciais</h2>
    <div class="num">RECIBO Nº ${num}</div>
    <div class="row"><span class="label">Aluno</span><strong>${student?.nome || "—"}</strong></div>
    <div class="row"><span class="label">Modalidade</span><span>${student?.modalidade || "—"}</span></div>
    <div class="row"><span class="label">Referência</span><span>${payment.vencimento ? payment.vencimento.split("-").reverse().join("/") : "—"}</span></div>
    <div class="row"><span class="label">Data Pagamento</span><span>${date}</span></div>
    <div class="total"><span>VALOR PAGO</span><span>R$ ${Number(payment.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
    <div class="footer">Emitido em ${date}<br>Patriota Fight Team · Comprovante de Pagamento</div>
    <br><button class="no-print" onclick="window.print()" style="width:100%;padding:14px;background:#0f172a;color:#fff;border:none;border-radius:6px;font-size:15px;cursor:pointer;margin-top:12px">🖨️ Imprimir / Salvar PDF</button>
  </body></html>`);
  win.document.close();
};

// ─── TOAST ───────────────────────────────────────────────────────────────────
const ToastContext = createContext(() => {});
const useToast = () => useContext(ToastContext);

function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 3000, display: "flex", flexDirection: "column-reverse", gap: 10, maxWidth: 360, width: "calc(100vw - 48px)" }}>
      {toasts.map(t => {
        const accent = t.type === "error" ? "#ef4444" : t.type === "success" ? "#22c55e" : "#38bdf8";
        return (
          <div key={t.id} className="toast-enter" style={{
            background: "rgba(15,23,42,0.95)",
            border: `1px solid ${accent}33`,
            borderRadius: 12, padding: "13px 16px", fontSize: 13, color: "#e2e8f0",
            boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${accent}22`,
            display: "flex", alignItems: "center", gap: 10,
            backdropFilter: "blur(12px)",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: accent + "22", border: `1px solid ${accent}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: accent
            }}>
              {t.type === "error" ? "✕" : "✓"}
            </div>
            <span style={{ lineHeight: 1.4 }}>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── CONFIRM HOOK ─────────────────────────────────────────────────────────────
function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = useCallback((message) => new Promise(resolve => setState({ message, resolve })), []);
  const ConfirmUI = state ? (
    <div style={{ position: "fixed", inset: 0, background: "#00000099", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, width: "100%", maxWidth: 360, padding: 28 }}>
        <p style={{ margin: "0 0 24px", fontSize: 15, color: "#cbd5e1", lineHeight: 1.6 }}>{state.message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn onClick={() => { state.resolve(false); setState(null); }} variant="ghost">Cancelar</Btn>
          <Btn onClick={() => { state.resolve(true); setState(null); }} variant="danger">Confirmar</Btn>
        </div>
      </div>
    </div>
  ) : null;
  return { confirm, ConfirmUI };
}

// ─── SUPABASE TABLE HOOK ──────────────────────────────────────────────────────
function useTable(tableName) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from(tableName)
      .select("*")
      .order("created_at", { ascending: true })
      .limit(500)
      .then(({ data, error }) => {
        if (error) { console.error(`[${tableName}] fetch error:`, error.message); setError(error.message); }
        else setRows((data || []).map(fromDb));
        setLoading(false);
      });

    const channel = supabase
      .channel(`rt-${tableName}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tableName }, payload => {
        if (payload.eventType === "INSERT") {
          setRows(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, fromDb(payload.new)]);
        } else if (payload.eventType === "UPDATE") {
          setRows(prev => prev.map(r => r.id === payload.new.id ? fromDb(payload.new) : r));
        } else if (payload.eventType === "DELETE") {
          setRows(prev => prev.filter(r => r.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
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

  return { rows, loading, error, add, update, remove };
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
  whatsapp: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  print: "M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z",
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
  <div style={{
    background: "#1e293b", borderRadius: 14, padding: "20px 22px",
    border: "1px solid #334155", borderTop: `2px solid ${color}`,
    display: "flex", alignItems: "flex-start", gap: 16, position: "relative", overflow: "hidden",
  }}>
    <div style={{
      position: "absolute", top: -24, right: -24, width: 80, height: 80,
      background: color + "18", borderRadius: "50%", filter: "blur(20px)", pointerEvents: "none",
    }} />
    <div style={{
      width: 48, height: 48, borderRadius: 12,
      background: `linear-gradient(135deg, ${color}28, ${color}12)`,
      border: `1px solid ${color}30`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <Icon d={icons[icon] || icons.dashboard} size={22} color={color} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: 28, fontWeight: 900, lineHeight: 1.1,
        background: "linear-gradient(135deg, #f1f5f9 30%, #94a3b8 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
        fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color, marginTop: 5, fontWeight: 600 }}>{sub}</div>}
    </div>
  </div>
);

const Btn = ({ onClick, children, variant = "primary", size = "md", style = {}, disabled = false }) => {
  const [hovered, setHovered] = useState(false);
  const base = {
    border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700, fontFamily: "inherit", display: "inline-flex", alignItems: "center",
    gap: 6, transition: "all 0.18s cubic-bezier(0.16,1,0.3,1)", opacity: disabled ? 0.5 : 1,
    padding: size === "sm" ? "6px 14px" : size === "lg" ? "13px 28px" : "9px 20px",
    fontSize: size === "sm" ? 12 : 14,
  };
  const variants = {
    primary: {
      background: "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)",
      color: "#0a0f1e", fontWeight: 800,
      boxShadow: hovered ? "0 6px 24px rgba(56,189,248,0.4)" : "0 2px 10px rgba(56,189,248,0.2)",
      transform: hovered && !disabled ? "translateY(-1px)" : "translateY(0)",
    },
    danger: { background: hovered ? "#ef444430" : "#ef444418", color: "#ef4444", border: "1px solid #ef444433" },
    ghost: {
      background: hovered ? "#ffffff0d" : "transparent",
      color: hovered ? "#e2e8f0" : "#94a3b8", border: "1px solid #334155",
    },
    success: { background: hovered ? "#22c55e30" : "#22c55e18", color: "#22c55e", border: "1px solid #22c55e33" },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
};

const Input = ({ label, value, onChange, type = "text", options, placeholder, required }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {label && <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}{required && <span style={{ color: "#38bdf8", marginLeft: 2 }}>*</span>}</label>}
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        background: "#0d1829", border: "1px solid #2d3f5e", borderRadius: 10, padding: "10px 14px",
        color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none",
        transition: "border-color 0.15s, box-shadow 0.15s", cursor: "pointer",
      }}>
        <option value="">Selecionar...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          background: "#0d1829", border: "1px solid #2d3f5e", borderRadius: 10, padding: "10px 14px",
          color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }} />
    )}
  </div>
);

const Modal = ({ title, onClose, children, width = 560 }) => (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    backdropFilter: "blur(6px)",
  }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} className="modal-enter" style={{
      background: "#1a2540", border: "1px solid #2d3f5e", borderRadius: 20,
      width: "100%", maxWidth: width, maxHeight: "92vh", overflow: "auto",
      boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
    }}>
      <div className="modal-header" style={{ borderBottom: "1px solid #243049" }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#f1f5f9", letterSpacing: "0.01em" }}>{title}</h3>
        <button onClick={onClose} style={{
          background: "#0f172a", border: "1px solid #334155", borderRadius: 8,
          cursor: "pointer", color: "#64748b", flexShrink: 0,
          padding: "5px", display: "flex", alignItems: "center", lineHeight: 1,
          transition: "all 0.15s"
        }}>
          <Icon d={icons.close} size={15} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

function Table({ cols, rows, onEdit, onDelete, extraActions, pageSize = 0, emptyAction }) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return sortDir === "asc"
        ? av.localeCompare(bv, "pt-BR", { numeric: true })
        : bv.localeCompare(av, "pt-BR", { numeric: true });
    });
  }, [rows, sortKey, sortDir]);

  const totalPages = pageSize > 0 ? Math.ceil(sorted.length / pageSize) : 1;
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const displayed = pageSize > 0 ? sorted.slice(safePage * pageSize, (safePage + 1) * pageSize) : sorted;

  const toggleSort = (col) => {
    if (col.sortable === false) return;
    if (sortKey === col.key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(col.key); setSortDir("asc"); setPage(0); }
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#0f172a" }}>
            {cols.map(c => (
              <th key={c.key} onClick={() => toggleSort(c)} style={{
                textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#475569",
                textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #243049",
                cursor: c.sortable === false ? "default" : "pointer", userSelect: "none", whiteSpace: "nowrap",
                position: "sticky", top: 0, background: "#0f172a", zIndex: 5,
              }}>
                {c.label}
                {sortKey === c.key && (
                  <span style={{ marginLeft: 4, color: "#38bdf8", fontSize: 13 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </th>
            ))}
            <th style={{
              textAlign: "right", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#475569",
              textTransform: "uppercase", borderBottom: "1px solid #243049",
              position: "sticky", top: 0, background: "#0f172a", zIndex: 5,
            }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {displayed.length === 0 ? (
            <tr><td colSpan={cols.length + 1} style={{ textAlign: "center", padding: "56px 20px", color: "#334155" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>Nenhum registro encontrado</div>
              {emptyAction && <div style={{ marginTop: 16 }}>{emptyAction}</div>}
            </td></tr>
          ) : displayed.map((row, i) => (
            <tr key={row.id || i} style={{
              borderBottom: "1px solid #1a2540",
              background: i % 2 !== 0 ? "rgba(255,255,255,0.016)" : "transparent",
              transition: "background 0.12s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(56,189,248,0.04)"}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 !== 0 ? "rgba(255,255,255,0.016)" : "transparent"}
            >
              {cols.map(c => (
                <td key={c.key} style={{ padding: "11px 16px", fontSize: 14, color: "#cbd5e1" }}>
                  {c.render ? c.render(row[c.key], row) : row[c.key]}
                </td>
              ))}
              <td style={{ padding: "11px 16px", textAlign: "right" }}>
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
      {pageSize > 0 && totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid #1a2540" }}>
          <span style={{ fontSize: 12, color: "#475569" }}>{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} de {sorted.length}</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Btn onClick={() => setPage(p => Math.max(0, p - 1))} variant="ghost" size="sm" disabled={safePage === 0}>← Anterior</Btn>
            <span style={{ fontSize: 12, color: "#475569", padding: "0 8px" }}>{safePage + 1} / {totalPages}</span>
            <Btn onClick={() => setPage(p => p + 1)} variant="ghost" size="sm" disabled={safePage >= totalPages - 1}>Próximo →</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh", background: "#080e1c", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "'Barlow', sans-serif", flexDirection: "column", gap: 32
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;700;900&display=swap');
        @keyframes spin-ring { to { transform: rotate(360deg); } }
        @keyframes pulse-logo { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.75; transform:scale(0.95); } }
        .spin-ring { animation: spin-ring 1.2s linear infinite; transform-origin: center; }
        .pulse-logo { animation: pulse-logo 2.4s ease-in-out infinite; }
      `}</style>
      <div style={{ position: "relative", width: 104, height: 104, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg className="spin-ring" width="104" height="104" viewBox="0 0 104 104" fill="none" style={{ position: "absolute", inset: 0 }}>
          <circle cx="52" cy="52" r="48" stroke="#1e293b" strokeWidth="3" />
          <circle cx="52" cy="52" r="48" stroke="url(#ring-grad)" strokeWidth="3" strokeDasharray="76 225" strokeLinecap="round" />
          <defs>
            <linearGradient id="ring-grad" x1="0" y1="0" x2="104" y2="104" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38bdf8" /><stop offset="1" stopColor="#818cf8" />
            </linearGradient>
          </defs>
        </svg>
        <img className="pulse-logo" src="/logo.png" alt="Patriota" style={{ width: 68, height: 68, objectFit: "contain" }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", fontFamily: "'Barlow', sans-serif" }}>CARREGANDO</div>
        <div style={{ color: "#334155", fontSize: 12, marginTop: 6 }}>Conectando ao banco de dados...</div>
      </div>
    </div>
  );
}

// ─── ERROR SCREEN ─────────────────────────────────────────────────────────────
function ErrorScreen({ message, onRetry }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow', sans-serif", flexDirection: "column", gap: 16, padding: 24 }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: "#ef444422", border: "1px solid #ef444433", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon d={icons.alert} size={28} color="#ef4444" />
      </div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#f1f5f9" }}>Erro de Conexão</h2>
      <p style={{ margin: 0, color: "#64748b", fontSize: 14, textAlign: "center", maxWidth: 340 }}>
        Não foi possível conectar ao banco de dados. Verifique sua conexão e tente novamente.
      </p>
      {message && <code style={{ fontSize: 11, color: "#475569", background: "#1e293b", padding: "6px 12px", borderRadius: 6, maxWidth: 400, wordBreak: "break-all" }}>{message}</code>}
      <Btn onClick={onRetry} style={{ marginTop: 8 }}>Tentar Novamente</Btn>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !pass) { setErr("Preencha todos os campos."); return; }
    setLoading(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) {
      setErr("Email ou senha inválidos.");
      setLoading(false);
    }
    // Sucesso: onAuthStateChange no App atualiza a sessão automaticamente
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #060d1f 0%, #0a1220 50%, #0d1628 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow', sans-serif"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&family=Barlow+Condensed:wght@700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes floatLogo { 0%,100% { transform:translateY(0) scale(1); filter:drop-shadow(0 8px 32px #38bdf840); } 50% { transform:translateY(-10px) scale(1.03); filter:drop-shadow(0 16px 48px #38bdf860); } }
        @keyframes orb1 { 0%,100% { transform:translate(0,0) scale(1); } 50% { transform:translate(30px,-20px) scale(1.1); } }
        @keyframes orb2 { 0%,100% { transform:translate(0,0) scale(1); } 50% { transform:translate(-20px,30px) scale(0.9); } }
        .login-card { animation: fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1); }
        .login-logo { animation: floatLogo 6s ease-in-out infinite; }
        .orb1 { animation: orb1 8s ease-in-out infinite; }
        .orb2 { animation: orb2 10s ease-in-out infinite; }
        input:focus, select:focus { border-color: #38bdf8 !important; box-shadow: 0 0 0 3px #38bdf820 !important; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
      `}</style>

      {/* Animated background orbs */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div className="orb1" style={{ position: "absolute", top: "8%", right: "8%", width: 500, height: 500, background: "radial-gradient(circle, #38bdf81a 0%, transparent 65%)", filter: "blur(48px)" }} />
        <div className="orb2" style={{ position: "absolute", bottom: "8%", left: "5%", width: 400, height: 400, background: "radial-gradient(circle, #818cf812 0%, transparent 65%)", filter: "blur(48px)" }} />
        <div style={{ position: "absolute", top: "45%", left: "45%", width: 250, height: 250, background: "radial-gradient(circle, #0ea5e90a 0%, transparent 70%)" }} />
      </div>

      <div className="login-card" style={{ width: "100%", maxWidth: 400, padding: 24, position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <img src="/logo.png" alt="Patriota Fight Team" className="login-logo"
            style={{ width: 148, height: 148, objectFit: "contain", margin: "0 auto 16px", display: "block" }} />
          <div style={{ fontSize: 10, color: "#334155", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700 }}>
            Sistema de Gestão · v1.0
          </div>
        </div>

        <div style={{
          background: "rgba(26, 37, 64, 0.85)", backdropFilter: "blur(24px) saturate(1.5)",
          border: "1px solid rgba(45,63,94,0.8)", borderRadius: 20, padding: 32,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}
            onKeyDown={e => e.key === "Enter" && !loading && handleLogin()}>
            <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="admin@academia.com" />
            <Input label="Senha" type="password" value={pass} onChange={setPass} placeholder="••••••••" />
            {err && (
              <div style={{ background: "#ef444418", border: "1px solid #ef444430", borderRadius: 10, padding: "10px 14px", color: "#ef4444", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon d={icons.alert} size={14} color="#ef4444" />{err}
              </div>
            )}
            <Btn onClick={handleLogin} size="lg" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Btn>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, color: "#243049", fontSize: 11, letterSpacing: "0.04em" }}>
          © 2025 Patriota Fight Team · Centro de Treinamento
        </div>
      </div>
    </div>
  );
}

// ─── CHANGE PASSWORD MODAL ───────────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const toast = useToast();
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!newPass || !confirmPass) { setErr("Preencha todos os campos."); return; }
    if (newPass !== confirmPass) { setErr("As senhas não coincidem."); return; }
    if (newPass.length < 6) { setErr("A senha deve ter pelo menos 6 caracteres."); return; }
    setLoading(true);
    setErr("");
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    toast("Senha alterada com sucesso!", "success");
    onClose();
  };

  return (
    <Modal title="Alterar Senha" onClose={onClose} width={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Input label="Nova Senha" type="password" value={newPass} onChange={setNewPass} placeholder="Mínimo 6 caracteres" />
        <Input label="Confirmar Nova Senha" type="password" value={confirmPass} onChange={setConfirmPass} placeholder="Repita a senha" />
        {err && <div style={{ background: "#ef444422", border: "1px solid #ef444433", borderRadius: 8, padding: "10px 14px", color: "#ef4444", fontSize: 13 }}>{err}</div>}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
        <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
        <Btn onClick={handleSave} disabled={loading}><Icon d={icons.key} size={16} />{loading ? "Salvando..." : "Alterar Senha"}</Btn>
      </div>
    </Modal>
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
  const thisYear = students.filter(s => s.dataMatricula?.startsWith(new Date().getFullYear().toString())).length;
  const totalTeachers = teachers.length;
  const weekClasses = classes.length;
  const todayDay = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][new Date().getDay()];
  const todayClasses = classes.filter(c => c.diaSemana === todayDay);
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const monthRevenue = payments.filter(p => p.status === "Pago" && (p.vencimento || "").startsWith(currentMonth)).reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
  const overdueAmount = payments.filter(p => p.status === "Atrasado").reduce((sum, p) => sum + (Number(p.valor) || 0), 0);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayMD = todayStr.slice(5);
  const next7MD = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(new Date().getDate() + i);
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const next10Dates = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(); d.setDate(new Date().getDate() + i);
    return d.toISOString().split("T")[0];
  });
  const birthdayStudents = students
    .filter(s => s.dataNascimento && next7MD.includes(s.dataNascimento.slice(5)))
    .map(s => ({ ...s, isToday: s.dataNascimento.slice(5) === todayMD, dayIdx: next7MD.indexOf(s.dataNascimento.slice(5)) }))
    .sort((a, b) => a.dayIdx - b.dayIdx);
  const upcomingDue = payments
    .filter(p => p.status === "Pendente" && p.vencimento && next10Dates.includes(p.vencimento))
    .sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || ""));

  return (
    <div>
      <PageHeader title="DASHBOARD" subtitle="Visão geral da academia" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard label="Total de Alunos" value={totalStudents} icon="students" color="#38bdf8" sub={`${activeStudents} ativos`} />
        <StatCard label="Alunos Inadimplentes" value={delinquents} icon="alert" color="#ef4444" sub="Requer atenção" />
        <StatCard label="Novos no Ano" value={thisYear} icon="trend" color="#22c55e" sub="Este ano" />
        <StatCard label="Professores" value={totalTeachers} icon="teachers" color="#a78bfa" sub="Ativos na academia" />
        <StatCard label="Aulas na Semana" value={weekClasses} icon="classes" color="#f59e0b" sub={`${todayClasses.length} hoje`} />
        <StatCard label="Receita do Mês" value={formatMoney(monthRevenue)} icon="financial" color="#34d399" sub="Mensalidades pagas" />
        <StatCard label="Em Atraso" value={formatMoney(overdueAmount)} icon="alert" color="#ef4444" sub="Mensalidades atrasadas" />
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

      {birthdayStudents.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>🎂 Aniversariantes da Semana</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {birthdayStudents.map(s => {
              const [, mm, dd] = s.dataNascimento.split("-");
              const age = new Date().getFullYear() - parseInt(s.dataNascimento.slice(0, 4));
              return (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 8, background: s.isToday ? "#38bdf811" : "#0f172a", border: `1px solid ${s.isToday ? "#38bdf844" : "#334155"}` }}>
                  <div>
                    <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{s.nome}</span>
                    {s.modalidade && <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>{s.modalidade}</span>}
                  </div>
                  {s.isToday
                    ? <Badge color="#38bdf8">🎉 Hoje! {age} anos</Badge>
                    : <span style={{ fontSize: 13, color: "#64748b" }}>{dd}/{mm}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {upcomingDue.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.06em" }}>⏰ Vencimentos nos Próximos 10 Dias</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcomingDue.map(p => {
              const student = students.find(s => s.id === p.alunoId);
              const daysUntil = next10Dates.indexOf(p.vencimento);
              return (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 8, background: "#f59e0b08", border: "1px solid #f59e0b22" }}>
                  <div>
                    <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{student?.nome || "—"}</span>
                    {student?.modalidade && <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>{student.modalidade}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{formatMoney(p.valor)}</span>
                    <span style={{ fontSize: 12, color: daysUntil === 0 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
                      {daysUntil === 0 ? "Vence hoje" : `em ${daysUntil}d`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── STUDENTS ────────────────────────────────────────────────────────────────
function StudentsPage({ students, addStudent, updateStudent, removeStudent, teachers, modalities, plans, payments, addPayment, updatePayment, beltHistory = [], addBeltHistory, attendance = [] }) {
  const toast = useToast();
  const { confirm, ConfirmUI } = useConfirm();
  const [search, setSearch] = useState("");
  const [filterModal, setFilterModal] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [viewStudent, setViewStudent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newBeltForm, setNewBeltForm] = useState(null);
  const [editingDue, setEditingDue] = useState(null);

  const todayStr = new Date().toISOString().split("T")[0];

  const filtered = useMemo(() => students.filter(s =>
    ((s.nome || "").toLowerCase().includes(search.toLowerCase()) || (s.cpf || "").includes(search)) &&
    (!filterModal || s.modalidade === filterModal) &&
    (!filterStatus || s.status === filterStatus)
  ), [students, search, filterModal, filterStatus]);

  const studentsWithDue = useMemo(() => filtered.map(s => {
    const pending = payments
      .filter(p => p.alunoId === s.id && p.status === "Pendente")
      .sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || ""));
    const next = pending[0] || null;
    if (!next) return { ...s, _dueDate: null, _daysUntil: null, _payId: null };
    const daysUntil = Math.round((new Date(next.vencimento) - new Date(todayStr)) / 86400000);
    return { ...s, _dueDate: next.vencimento, _daysUntil: daysUntil, _payId: next.id };
  }), [filtered, payments, todayStr]);

  const nearDueCount = studentsWithDue.filter(s => s._daysUntil !== null && s._daysUntil >= 0 && s._daysUntil <= 10).length;
  const overDueCount = studentsWithDue.filter(s => s._daysUntil !== null && s._daysUntil < 0).length;

  const exportStudents = () => {
    exportCSV("alunos.csv",
      ["Nome", "CPF", "Telefone", "Email", "Modalidade", "Status", "Matrícula", "Dia Venc."],
      filtered.map(s => [s.nome || "", s.cpf || "", s.telefone || "", s.email || "", s.modalidade || "", s.status || "", s.dataMatricula || "", s.diaVencimento || ""])
    );
  };

  const openNew = () => {
    setForm({ nome: "", cpf: "", dataNascimento: "", telefone: "", email: "", endereco: "", dataMatricula: new Date().toISOString().split("T")[0], modalidade: "", professorId: "", planoId: "", diaVencimento: "10", status: "Ativo", contatoEmergenciaNome: "", contatoEmergenciaTel: "", observacoesMedicas: "", peso: "", altura: "" });
    setModal("form");
  };
  const openEdit = (s) => {
    const { _dueDate, _daysUntil, _payId, ...rest } = s;
    setForm({ ...rest });
    setModal("form");
  };

  const save = async () => {
    if (!form.nome) return;
    setSaving(true);
    if (form.id) {
      await updateStudent(form.id, form);
    } else {
      const newStudent = await addStudent(form);
      // Gerar primeira mensalidade automaticamente se tiver plano e dia de vencimento
      if (newStudent && form.planoId && form.diaVencimento) {
        const plan = plans.find(p => p.id === form.planoId);
        if (plan) {
          const today = new Date();
          const dia = parseInt(form.diaVencimento);
          const vencDate = new Date(today.getFullYear(), today.getMonth(), dia);
          // Se o dia já passou nesse mês, gerar para o próximo mês
          if (vencDate < today) vencDate.setMonth(vencDate.getMonth() + 1);
          const vencimento = vencDate.toISOString().split("T")[0];
          await addPayment({
            alunoId: newStudent.id,
            planoId: form.planoId,
            valor: Number(plan.valor),
            vencimento,
            dataPagamento: "",
            status: "Pendente",
          });
        }
      }
    }
    setSaving(false);
    setModal(null);
    toast(form.id ? "Aluno atualizado!" : "Aluno cadastrado!", "success");
  };

  const del = async (id) => {
    if (await confirm("Deseja excluir este aluno? Esta ação não pode ser desfeita.")) {
      const ok = await removeStudent(id);
      if (ok) toast("Aluno excluído.", "success");
    }
  };

  const statusOpts = ["Ativo", "Inativo", "Suspenso", "Inadimplente"].map(s => ({ value: s, label: s }));

  return (
    <div>
      <PageHeader title="ALUNOS" subtitle={`${filtered.length} aluno(s) encontrado(s)`}
        action={<div style={{ display: "flex", gap: 8 }}><Btn onClick={exportStudents} variant="ghost"><Icon d={icons.reports} size={16} />CSV</Btn><Btn onClick={openNew}><Icon d={icons.plus} size={16} />Novo Aluno</Btn></div>} />

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
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
            background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none"
          }}>
            <option value="">Todos Status</option>
            {["Ativo", "Inativo", "Suspenso", "Inadimplente"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </Card>

      {(nearDueCount > 0 || overDueCount > 0) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {overDueCount > 0 && (
            <div style={{ flex: 1, minWidth: 220, padding: "10px 16px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <Icon d={icons.alert} size={18} color="#ef4444" />
              <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>{overDueCount} aluno(s) com pagamento em atraso</span>
            </div>
          )}
          {nearDueCount > 0 && (
            <div style={{ flex: 1, minWidth: 220, padding: "10px 16px", background: "#f59e0b11", border: "1px solid #f59e0b33", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <Icon d={icons.alert} size={18} color="#f59e0b" />
              <span style={{ fontSize: 13, color: "#f59e0b", fontWeight: 600 }}>{nearDueCount} aluno(s) com vencimento nos próximos 10 dias</span>
            </div>
          )}
        </div>
      )}

      <Card>
        <Table
          cols={[
            { key: "nome", label: "Nome" },
            { key: "modalidade", label: "Modalidade" },
            { key: "telefone", label: "Telefone" },
            { key: "dataMatricula", label: "Matrícula", render: v => formatDate(v) },
            { key: "status", label: "Status", render: v => <Badge color={STATUS_COLORS[v] || "#64748b"}>{v}</Badge> },
            { key: "_dueDate", label: "Próx. Vencimento", sortable: false, render: (v, row) => {
              if (!v) return <span style={{ color: "#475569" }}>—</span>;
              const days = row._daysUntil;
              const color = days < 0 ? "#ef4444" : days <= 10 ? "#f59e0b" : "#22c55e";
              const label = days < 0 ? `${Math.abs(days)}d atraso` : days === 0 ? "Hoje" : `${days}d`;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color, fontWeight: 600 }}>{formatDate(v)}</span>
                  <span style={{ fontSize: 11, color, background: color + "22", padding: "1px 6px", borderRadius: 10, fontWeight: 700 }}>{label}</span>
                  <button onClick={e => { e.stopPropagation(); setEditingDue({ payId: row._payId, date: v, studentName: row.nome }); }}
                    style={{ background: "none", border: "1px solid #334155", borderRadius: 4, padding: "2px 5px", cursor: "pointer", color: "#94a3b8", lineHeight: 1, display: "flex", alignItems: "center" }}>
                    <Icon d={icons.edit} size={11} />
                  </button>
                </div>
              );
            }},
          ]}
          rows={studentsWithDue}
          onEdit={openEdit}
          onDelete={del}
          pageSize={50}
          emptyAction={<Btn onClick={openNew}><Icon d={icons.plus} size={16} />Cadastrar Primeiro Aluno</Btn>}
          extraActions={(row) => (
            <Btn onClick={() => setViewStudent(row)} variant="ghost" size="sm">
              <Icon d={icons.users} size={14} />Ver
            </Btn>
          )}
        />
      </Card>

      {modal === "form" && (
        <Modal title={form.id ? "Editar Aluno" : "Novo Aluno"} onClose={() => setModal(null)} width={640}>
          <div className="grid-2col">
            <div style={{ gridColumn: "1/-1" }}><Input label="Nome Completo" value={form.nome || ""} onChange={v => setForm(p => ({ ...p, nome: v }))} required /></div>
            <Input label="CPF" value={form.cpf || ""} onChange={v => setForm(p => ({ ...p, cpf: maskCPF(v) }))} placeholder="000.000.000-00" />
            <Input label="Data de Nascimento" type="date" value={form.dataNascimento || ""} onChange={v => setForm(p => ({ ...p, dataNascimento: v }))} />
            <Input label="Telefone" value={form.telefone || ""} onChange={v => setForm(p => ({ ...p, telefone: maskPhone(v) }))} placeholder="(00) 00000-0000" />
            <Input label="Email" type="email" value={form.email || ""} onChange={v => setForm(p => ({ ...p, email: v }))} />
            <div style={{ gridColumn: "1/-1" }}><Input label="Endereço" value={form.endereco || ""} onChange={v => setForm(p => ({ ...p, endereco: v }))} /></div>
            <Input label="Data de Matrícula" type="date" value={form.dataMatricula || ""} onChange={v => setForm(p => ({ ...p, dataMatricula: v }))} />
            <Input label="Modalidade" value={form.modalidade || ""} onChange={v => setForm(p => ({ ...p, modalidade: v }))} options={modalities.map(m => ({ value: m.nome, label: m.nome }))} />
            <Input label="Professor Responsável" value={form.professorId || ""} onChange={v => setForm(p => ({ ...p, professorId: v }))} options={teachers.map(t => ({ value: t.id, label: t.nome }))} />
            <Input label="Plano" value={form.planoId || ""} onChange={v => setForm(p => ({ ...p, planoId: v }))} options={plans.map(p => ({ value: p.id, label: `${p.nome} — R$ ${p.valor}` }))} />
            <Input label="Dia de Vencimento" value={form.diaVencimento || ""} onChange={v => setForm(p => ({ ...p, diaVencimento: v }))}
              options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Dia ${i + 1}` }))} />
            <Input label="Status" value={form.status || "Ativo"} onChange={v => setForm(p => ({ ...p, status: v }))} options={statusOpts} />
            <Input label="Peso (kg)" type="number" value={String(form.peso || "")} onChange={v => setForm(p => ({ ...p, peso: v }))} placeholder="Ex: 72" />
            <Input label="Altura (cm)" type="number" value={String(form.altura || "")} onChange={v => setForm(p => ({ ...p, altura: v }))} placeholder="Ex: 175" />
            <Input label="Contato de Emergência" value={form.contatoEmergenciaNome || ""} onChange={v => setForm(p => ({ ...p, contatoEmergenciaNome: v }))} placeholder="Nome do contato" />
            <Input label="Telefone Emergência" value={form.contatoEmergenciaTel || ""} onChange={v => setForm(p => ({ ...p, contatoEmergenciaTel: maskPhone(v) }))} placeholder="(00) 00000-0000" />
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Observações Médicas</label>
              <textarea value={form.observacoesMedicas || ""} onChange={e => setForm(p => ({ ...p, observacoesMedicas: e.target.value }))} rows={2} placeholder="Alergias, lesões, restrições..."
                style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
            </div>
          </div>
          {!form.id && form.planoId && form.diaVencimento && (
            <div style={{ marginTop: 16, padding: "10px 14px", background: "#38bdf811", border: "1px solid #38bdf833", borderRadius: 8, fontSize: 13, color: "#38bdf8" }}>
              ✓ A primeira mensalidade será gerada automaticamente para o dia <strong>{form.diaVencimento}</strong> com o valor do plano selecionado.
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <Btn onClick={() => setModal(null)} variant="ghost">Cancelar</Btn>
            <Btn onClick={save} disabled={saving}><Icon d={icons.check} size={16} />{saving ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}

      {viewStudent && (
        <Modal title={viewStudent.nome} onClose={() => setViewStudent(null)} width={560}>
          {(() => {
            const att = attendance.filter(a => a.studentId === viewStudent.id);
            const present = att.filter(a => a.present).length;
            const total = att.length;
            if (total === 0) return null;
            const rate = Math.round((present / total) * 100);
            return (
              <div style={{ display: "flex", gap: 20, padding: "12px 16px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155", marginBottom: 16 }}>
                <div><span style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>{present}</span><span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>presenças</span></div>
                <div><span style={{ fontSize: 22, fontWeight: 800, color: "#ef4444" }}>{total - present}</span><span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>faltas</span></div>
                <div><span style={{ fontSize: 22, fontWeight: 800, color: "#38bdf8" }}>{rate}%</span><span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>presença</span></div>
              </div>
            );
          })()}
          <div className="grid-2col" style={{ gap: 12, marginBottom: 20 }}>
            {[
              ["CPF", viewStudent.cpf], ["Telefone", viewStudent.telefone], ["Email", viewStudent.email],
              ["Modalidade", viewStudent.modalidade], ["Matrícula", formatDate(viewStudent.dataMatricula)],
              ["Vencimento", viewStudent.diaVencimento ? `Dia ${viewStudent.diaVencimento}` : "—"],
              ["Status", viewStudent.status],
              ...(viewStudent.peso ? [["Peso", `${viewStudent.peso} kg`]] : []),
              ...(viewStudent.altura ? [["Altura", `${viewStudent.altura} cm`]] : []),
              ...(viewStudent.contatoEmergenciaNome ? [["Emerg. Nome", viewStudent.contatoEmergenciaNome]] : []),
              ...(viewStudent.contatoEmergenciaTel ? [["Emerg. Tel", viewStudent.contatoEmergenciaTel]] : []),
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 14, color: "#e2e8f0" }}>{k === "Status" ? <Badge color={STATUS_COLORS[v] || "#64748b"}>{v}</Badge> : (v || "—")}</div>
              </div>
            ))}
            {viewStudent.observacoesMedicas && (
              <div style={{ gridColumn: "1/-1" }}>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Obs. Médicas</div>
                <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>{viewStudent.observacoesMedicas}</div>
              </div>
            )}
          </div>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Histórico de Pagamentos</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {payments.filter(p => p.alunoId === viewStudent.id).sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || "")).map(p => {
              const isOverdue = p.status !== "Pago" && p.vencimento && p.vencimento < new Date().toISOString().split("T")[0];
              const diasAtraso = isOverdue ? Math.floor((new Date() - new Date(p.vencimento)) / 86400000) : 0;
              return (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#0f172a", borderRadius: 8, alignItems: "center", border: `1px solid ${isOverdue ? "#ef444422" : "#334155"}` }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>Venc: {p.vencimento}</div>
                    {p.dataPagamento && <div style={{ fontSize: 12, color: "#64748b" }}>Pago em: {p.dataPagamento}</div>}
                    {isOverdue && <div style={{ fontSize: 11, color: "#ef4444" }}>{diasAtraso} dia(s) em atraso</div>}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>R$ {Number(p.valor).toLocaleString("pt-BR")}</span>
                    <Badge color={PAY_STATUS_COLORS[p.status]}>{p.status}</Badge>
                  </div>
                </div>
              );
            })}
            {payments.filter(p => p.alunoId === viewStudent.id).length === 0 && (
              <div style={{ color: "#475569", fontSize: 14, textAlign: "center", padding: "20px 0" }}>Nenhum pagamento registrado</div>
            )}
          </div>

          <h4 style={{ margin: "20px 0 10px", fontSize: 13, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Histórico de Graduações</h4>
          {newBeltForm ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, background: "#0f172a", borderRadius: 8, border: "1px solid #334155", marginBottom: 12 }}>
              <Input label="Faixa / Graduação" value={newBeltForm.belt || ""} onChange={v => setNewBeltForm(p => ({ ...p, belt: v }))} placeholder="Ex: Azul, Roxa, Preta..." />
              <Input label="Data" type="date" value={newBeltForm.date || ""} onChange={v => setNewBeltForm(p => ({ ...p, date: v }))} />
              <Input label="Observações" value={newBeltForm.notes || ""} onChange={v => setNewBeltForm(p => ({ ...p, notes: v }))} placeholder="Opcional" />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn onClick={() => setNewBeltForm(null)} variant="ghost" size="sm">Cancelar</Btn>
                <Btn onClick={async () => {
                  if (!newBeltForm.belt || !newBeltForm.date) return;
                  await addBeltHistory({ studentId: viewStudent.id, belt: newBeltForm.belt, date: newBeltForm.date, notes: newBeltForm.notes || "" });
                  setNewBeltForm(null);
                  toast("Graduação registrada!", "success");
                }} size="sm"><Icon d={icons.check} size={14} />Salvar</Btn>
              </div>
            </div>
          ) : (
            <Btn onClick={() => setNewBeltForm({ belt: "", date: new Date().toISOString().split("T")[0], notes: "" })} variant="ghost" size="sm" style={{ marginBottom: 12 }}>
              <Icon d={icons.plus} size={14} />Registrar Graduação
            </Btn>
          )}
          {(() => {
            const belts = beltHistory.filter(b => b.studentId === viewStudent.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            return belts.length === 0
              ? <div style={{ color: "#475569", fontSize: 13, padding: "8px 0 16px" }}>Nenhuma graduação registrada</div>
              : belts.map(b => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#0f172a", borderRadius: 8, alignItems: "center", border: "1px solid #334155", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{b.belt}</div>
                    {b.notes && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{b.notes}</div>}
                  </div>
                  <span style={{ fontSize: 13, color: "#64748b" }}>{formatDate(b.date)}</span>
                </div>
              ));
          })()}
        </Modal>
      )}
      {ConfirmUI}
      {editingDue && (
        <Modal title="Editar Data de Vencimento" onClose={() => setEditingDue(null)} width={400}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Aluno</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>{editingDue.studentName}</div>
          </div>
          <Input label="Nova Data de Vencimento" type="date" value={editingDue.date || ""} onChange={v => setEditingDue(p => ({ ...p, date: v }))} />
          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
            <Btn onClick={() => setEditingDue(null)} variant="ghost">Cancelar</Btn>
            <Btn onClick={async () => {
              if (!editingDue.date) return;
              await updatePayment(editingDue.payId, { vencimento: editingDue.date });
              toast("Vencimento atualizado!", "success");
              setEditingDue(null);
            }}><Icon d={icons.check} size={16} />Salvar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TEACHERS ────────────────────────────────────────────────────────────────
function TeachersPage({ teachers, addTeacher, updateTeacher, removeTeacher, modalities, classes }) {
  const toast = useToast();
  const { confirm, ConfirmUI } = useConfirm();
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
    if (form.id) { await updateTeacher(form.id, form); } else { await addTeacher(form); }
    setSaving(false);
    setModal(null);
    toast(form.id ? "Professor atualizado!" : "Professor cadastrado!", "success");
  };

  const del = async (id) => {
    if (await confirm("Deseja excluir este professor?")) {
      const ok = await removeTeacher(id);
      if (ok) toast("Professor excluído.", "success");
    }
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
            { key: "dataContratacao", label: "Contratação", render: v => formatDate(v) },
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
          <div className="grid-2col">
            <div style={{ gridColumn: "1/-1" }}><Input label="Nome Completo" value={form.nome || ""} onChange={v => setForm(p => ({ ...p, nome: v }))} required /></div>
            <Input label="CPF" value={form.cpf || ""} onChange={v => setForm(p => ({ ...p, cpf: maskCPF(v) }))} />
            <Input label="Telefone" value={form.telefone || ""} onChange={v => setForm(p => ({ ...p, telefone: maskPhone(v) }))} />
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
      {ConfirmUI}
    </div>
  );
}

// ─── MODALITIES ───────────────────────────────────────────────────────────────
function ModalitiesPage({ modalities, addModality, updateModality, removeModality }) {
  const toast = useToast();
  const { confirm, ConfirmUI } = useConfirm();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const openNew = () => { setForm({ nome: "", descricao: "", nivel: "Todos" }); setModal("form"); };

  const save = async () => {
    if (!form.nome) return;
    setSaving(true);
    if (form.id) { await updateModality(form.id, form); } else { await addModality(form); }
    setSaving(false);
    setModal(null);
    toast(form.id ? "Modalidade atualizada!" : "Modalidade cadastrada!", "success");
  };

  const del = async (id) => {
    if (await confirm("Deseja excluir esta modalidade?")) {
      const ok = await removeModality(id);
      if (ok) toast("Modalidade excluída.", "success");
    }
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
      {ConfirmUI}
    </div>
  );
}

// ─── CLASSES ──────────────────────────────────────────────────────────────────
function ClassesPage({ classes, addClass, updateClass, removeClass, teachers, modalities }) {
  const toast = useToast();
  const { confirm, ConfirmUI } = useConfirm();
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
    if (form.id) { await updateClass(form.id, entry); } else { await addClass(entry); }
    setSaving(false);
    setModal(null);
    toast(form.id ? "Aula atualizada!" : "Aula cadastrada!", "success");
  };

  const del = async (id) => {
    if (await confirm("Deseja excluir esta aula?")) {
      const ok = await removeClass(id);
      if (ok) toast("Aula excluída.", "success");
    }
  };

  return (
    <div>
      <PageHeader title="AULAS" subtitle={`${classes.length} aulas cadastradas`}
        action={<Btn onClick={openNew}><Icon d={icons.plus} size={16} />Nova Aula</Btn>} />

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
          <div className="grid-2col">
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
      {ConfirmUI}
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
function AttendancePage({ classes, students, teachers, modalities, addAttendance }) {
  const [selectedClass, setSelectedClass] = useState("");
  const [attendance, setAttendance] = useState({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const cls = classes.find(c => c.id === selectedClass);
  const mod = cls && modalities.find(m => m.id === cls.modalidadeId);
  const classStudents = cls ? students.filter(s => s.modalidade === mod?.nome && s.status === "Ativo") : [];

  const toggle = id => { setAttendance(prev => ({ ...prev, [id]: !prev[id] })); setSaved(false); };

  const saveAttendance = async () => {
    if (!cls) return;
    setSaving(true);
    const date = new Date().toISOString().split("T")[0];
    const records = classStudents.map(s => ({
      classId: cls.id,
      studentId: s.id,
      date,
      present: !!attendance[s.id],
    }));
    await Promise.all(records.map(addAttendance));
    setSaving(false);
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
            <Btn onClick={saveAttendance} disabled={saving} variant={saved ? "success" : "primary"}>
              {saving ? "Salvando..." : saved ? <><Icon d={icons.check} size={16} />Presença Salva!</> : <><Icon d={icons.check} size={16} />Confirmar Presença</>}
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
function FinancialPage({ payments, addPayment, updatePayment, removePayment, students, updateStudent, plans, addPlan, updatePlan, removePlan }) {
  const toast = useToast();
  const { confirm, ConfirmUI } = useConfirm();
  const [tab, setTab] = useState("payments");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [planForm, setPlanForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const today = new Date().toISOString().split("T")[0];

  // ── Auto-atualizar Pendente → Atrasado (cada ID processado no máximo uma vez por sessão) ──
  const autoUpdatedRef = useRef(new Set());
  useEffect(() => {
    const toUpdate = payments.filter(
      p => p.status === "Pendente" && p.vencimento && p.vencimento < today && !autoUpdatedRef.current.has(p.id)
    );
    toUpdate.forEach(async p => {
      autoUpdatedRef.current.add(p.id);
      await updatePayment(p.id, { ...p, status: "Atrasado" });
      // Marcar aluno como Inadimplente se ainda estiver Ativo
      const student = students.find(s => s.id === p.alunoId);
      if (student && student.status === "Ativo") {
        await updateStudent(student.id, { ...student, status: "Inadimplente" });
      }
    });
  }, [payments]); // eslint-disable-line react-hooks/exhaustive-deps

  const paidTotal = payments.filter(p => p.status === "Pago").reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const pendingTotal = payments.filter(p => p.status === "Pendente").reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const overdueTotal = payments.filter(p => p.status === "Atrasado").reduce((s, p) => s + (Number(p.valor) || 0), 0);

  // Pagamentos filtrados por mês + busca
  const filteredPayments = useMemo(() => {
    let result = monthFilter ? payments.filter(p => (p.vencimento || "").startsWith(monthFilter)) : payments;
    if (paymentSearch) {
      const q = paymentSearch.toLowerCase();
      result = result.filter(p => (students.find(s => s.id === p.alunoId)?.nome || "").toLowerCase().includes(q));
    }
    return result;
  }, [payments, monthFilter, paymentSearch, students]);

  const monthPaid = filteredPayments.filter(p => p.status === "Pago").reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const monthPending = filteredPayments.filter(p => p.status === "Pendente").reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const monthOverdue = filteredPayments.filter(p => p.status === "Atrasado").reduce((s, p) => s + (Number(p.valor) || 0), 0);

  const registerPayment = async (payment) => {
    await updatePayment(payment.id, { ...payment, status: "Pago", dataPagamento: today });
    toast("Pagamento baixado!", "success");
    const student = students.find(s => s.id === payment.alunoId);
    // Reativar aluno se não tiver mais pagamentos atrasados
    if (student && student.status === "Inadimplente") {
      const stillOverdue = payments.some(p => p.id !== payment.id && p.alunoId === payment.alunoId && p.status === "Atrasado");
      if (!stillOverdue) {
        await updateStudent(student.id, { ...student, status: "Ativo" });
        toast(`${student.nome?.split(" ")[0]} reativado como Ativo.`, "success");
      }
    }
    // Gerar próxima mensalidade automaticamente
    if (student?.planoId && student?.diaVencimento && payment.vencimento) {
      const ref = new Date(payment.vencimento + "T12:00:00");
      const nextVenc = new Date(ref.getFullYear(), ref.getMonth() + 1, parseInt(student.diaVencimento));
      const nextStr = nextVenc.toISOString().split("T")[0];
      const nextMonth = nextStr.slice(0, 7);
      const alreadyExists = payments.some(p => p.alunoId === payment.alunoId && (p.vencimento || "").startsWith(nextMonth));
      if (!alreadyExists) {
        const plan = plans.find(p => p.id === student.planoId);
        if (plan) {
          await addPayment({ alunoId: student.id, planoId: student.planoId, valor: Number(plan.valor), vencimento: nextStr, dataPagamento: "", status: nextStr < today ? "Atrasado" : "Pendente" });
          toast(`Mensalidade de ${nextVenc.toLocaleDateString("pt-BR", { month: "long" })} gerada.`, "success");
        }
      }
    }
  };

  const savePayment = async () => {
    if (!form.alunoId) return;
    const entry = { ...form, valor: Number(form.valor) };
    setSaving(true);
    if (form.id) { await updatePayment(form.id, entry); } else { await addPayment(entry); }
    setSaving(false);
    setModal(null);
    toast(form.id ? "Pagamento atualizado!" : "Pagamento registrado!", "success");
  };

  const savePlan = async () => {
    if (!planForm.nome) return;
    const entry = { ...planForm, valor: Number(planForm.valor), frequencia: Number(planForm.frequencia) };
    setSaving(true);
    if (planForm.id) { await updatePlan(planForm.id, entry); } else { await addPlan(entry); }
    setSaving(false);
    setModal(null);
    toast(planForm.id ? "Plano atualizado!" : "Plano criado!", "success");
  };

  // Gerar mensalidades em lote para o mês selecionado
  const gerarMensalidades = async () => {
    const [year, month] = monthFilter.split("-").map(Number);
    const activeStudents = students.filter(s => s.status === "Ativo" && s.planoId && s.diaVencimento);
    if (activeStudents.length === 0) { toast("Nenhum aluno ativo com plano e dia de vencimento definidos.", "error"); return; }
    setGenerating(true);

    const toCreate = activeStudents.reduce((acc, student) => {
      const exists = payments.some(p => p.alunoId === student.id && (p.vencimento || "").startsWith(monthFilter));
      if (exists) return acc;
      const plan = plans.find(p => p.id === student.planoId);
      if (!plan) return acc;
      const vencDate = new Date(year, month - 1, parseInt(student.diaVencimento));
      const vencimento = vencDate.toISOString().split("T")[0];
      acc.push({ alunoId: student.id, planoId: student.planoId, valor: Number(plan.valor), vencimento, dataPagamento: "", status: vencimento < today ? "Atrasado" : "Pendente" });
      return acc;
    }, []);

    await Promise.all(toCreate.map(addPayment));
    setGenerating(false);
    toast(`${toCreate.length} mensalidade(s) gerada(s). ${activeStudents.length - toCreate.length} já existiam.`, "success");
  };

  const diasEmAtraso = (vencimento) => {
    if (!vencimento) return 0;
    return Math.max(0, Math.floor((new Date() - new Date(vencimento)) / 86400000));
  };

  // Opções de meses (últimos 12 + próximos 3)
  const monthOptions = useMemo(() => {
    const opts = [];
    const base = new Date();
    for (let i = -12; i <= 3; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return opts;
  }, []);

  return (
    <div>
      <PageHeader title="FINANCEIRO" subtitle="Controle de mensalidades e receitas" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard label="Receita Total" value={`R$ ${paidTotal.toLocaleString("pt-BR")}`} icon="financial" color="#22c55e" sub="Tudo pago" />
        <StatCard label="Pendente" value={`R$ ${pendingTotal.toLocaleString("pt-BR")}`} icon="alert" color="#f59e0b" sub="A vencer" />
        <StatCard label="Em Atraso" value={`R$ ${overdueTotal.toLocaleString("pt-BR")}`} icon="alert" color="#ef4444" sub={`${payments.filter(p => p.status === "Atrasado").length} cobrança(s)`} />
        <StatCard label="Total Geral" value={`R$ ${(paidTotal + pendingTotal + overdueTotal).toLocaleString("pt-BR")}`} icon="trend" color="#38bdf8" sub="Receita esperada" />
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><Icon d={icons.search} size={14} color="#64748b" /></div>
                <input value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} placeholder="Buscar aluno..."
                  style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px 8px 32px", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", width: 180 }} />
              </div>
              <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{
                background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "8px 14px",
                color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none"
              }}>
                <option value="">Todos os meses</option>
                {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {monthFilter && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>✓ R$ {monthPaid.toLocaleString("pt-BR")}</span>
                  <span style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>⏳ R$ {monthPending.toLocaleString("pt-BR")}</span>
                  <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 700 }}>⚠ R$ {monthOverdue.toLocaleString("pt-BR")}</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {monthFilter && (
                <Btn onClick={gerarMensalidades} variant="ghost" disabled={generating}>
                  {generating ? "Gerando..." : <><Icon d={icons.plus} size={16} />Gerar Mensalidades</>}
                </Btn>
              )}
              <Btn onClick={() => { setForm({ alunoId: "", planoId: "", valor: "", vencimento: "", dataPagamento: "", status: "Pendente" }); setModal("payment"); }}>
                <Icon d={icons.plus} size={16} />Registrar Pagamento
              </Btn>
            </div>
          </div>
          <Table
            cols={[
              { key: "alunoId", label: "Aluno", render: v => students.find(s => s.id === v)?.nome || v },
              { key: "valor", label: "Valor", render: v => formatMoney(v) },
              {
                key: "vencimento", label: "Vencimento", render: (v, row) => {
                  const atrasado = row.status === "Atrasado";
                  const dias = diasEmAtraso(v);
                  return <div>
                    <div style={{ color: atrasado ? "#ef4444" : "#e2e8f0" }}>{formatDate(v)}</div>
                    {atrasado && <div style={{ fontSize: 11, color: "#ef4444" }}>{dias}d em atraso</div>}
                  </div>;
                }
              },
              { key: "dataPagamento", label: "Pago em", render: v => formatDate(v) },
              { key: "status", label: "Status", render: v => <Badge color={PAY_STATUS_COLORS[v]}>{v}</Badge> },
            ]}
            rows={filteredPayments}
            pageSize={50}
            onEdit={r => { setForm({ ...r }); setModal("payment"); }}
            onDelete={async id => { if (await confirm("Deseja excluir este pagamento?")) { const ok = await removePayment(id); if (ok) toast("Pagamento excluído.", "success"); } }}
            extraActions={row => (
              <div style={{ display: "flex", gap: 6 }}>
                {row.status !== "Pago" && <Btn onClick={() => registerPayment(row)} variant="success" size="sm"><Icon d={icons.check} size={14} />Pago</Btn>}
                {row.status === "Pago" && <Btn onClick={() => printReceipt(row, students.find(s => s.id === row.alunoId))} variant="ghost" size="sm"><Icon d={icons.print} size={14} />Recibo</Btn>}
              </div>
            )}
          />
        </Card>
      )}

      {tab === "overdue" && (
        <Card>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#ef4444", textTransform: "uppercase" }}>
            {payments.filter(p => p.status === "Atrasado" || p.status === "Pendente").length} cobrança(s) pendente(s)
          </h3>
          <Table
            cols={[
              {
                key: "alunoId", label: "Aluno", render: v => {
                  const s = students.find(s => s.id === v);
                  return <div>
                    <div style={{ fontWeight: 600 }}>{s?.nome || v}</div>
                    {s?.telefone && <div style={{ fontSize: 11, color: "#64748b" }}>{s.telefone}</div>}
                  </div>;
                }
              },
              { key: "valor", label: "Valor", render: v => formatMoney(v) },
              {
                key: "vencimento", label: "Vencimento", render: (v, row) => {
                  const dias = diasEmAtraso(v);
                  return <div>
                    <div style={{ color: row.status === "Atrasado" ? "#ef4444" : "#f59e0b" }}>{formatDate(v)}</div>
                    {dias > 0 && <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>{dias} dia(s)</div>}
                  </div>;
                }
              },
              { key: "status", label: "Status", render: v => <Badge color={PAY_STATUS_COLORS[v]}>{v}</Badge> },
            ]}
            rows={payments.filter(p => p.status === "Atrasado" || p.status === "Pendente").sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || ""))}
            onEdit={null} onDelete={null}
            extraActions={row => {
              const student = students.find(s => s.id === row.alunoId);
              const phone = (student?.telefone || "").replace(/\D/g, "");
              const msg = encodeURIComponent(`Olá ${student?.nome?.split(" ")[0] || ""}! Temos uma mensalidade em aberto de ${formatMoney(row.valor)} com vencimento em ${formatDate(row.vencimento)}. Por favor, entre em contato para regularizar. Obrigado!`);
              return (
                <div style={{ display: "flex", gap: 6 }}>
                  {phone && (
                    <a href={`https://wa.me/55${phone}?text=${msg}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                      <Btn variant="success" size="sm"><Icon d={icons.whatsapp} size={14} />WhatsApp</Btn>
                    </a>
                  )}
                  <Btn onClick={() => registerPayment(row)} variant="ghost" size="sm"><Icon d={icons.check} size={14} />Baixar</Btn>
                </div>
              );
            }}
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
            {plans.map(p => {
              const alunosNoPlan = students.filter(s => s.planoId === p.id).length;
              return (
                <div key={p.id} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>{p.nome}</h3>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn onClick={() => { setPlanForm(p); setModal("plan"); }} variant="ghost" size="sm"><Icon d={icons.edit} size={14} /></Btn>
                      <Btn onClick={async () => { if (await confirm("Deseja excluir este plano?")) { const ok = await removePlan(p.id); if (ok) toast("Plano excluído.", "success"); } }} variant="danger" size="sm"><Icon d={icons.delete} size={14} /></Btn>
                    </div>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#38bdf8", marginBottom: 4 }}>{formatMoney(p.valor)}</div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>{p.frequencia}x por semana</div>
                  <div style={{ marginTop: 10, fontSize: 12, color: "#475569" }}>{alunosNoPlan} aluno(s) neste plano</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {modal === "payment" && (
        <Modal title={form.id ? "Editar Pagamento" : "Novo Pagamento"} onClose={() => setModal(null)}>
          <div className="grid-2col">
            <div style={{ gridColumn: "1/-1" }}>
              <Input label="Aluno" value={form.alunoId || ""} onChange={v => {
                const student = students.find(s => s.id === v);
                const plan = student?.planoId ? plans.find(p => p.id === student.planoId) : null;
                setForm(p => ({ ...p, alunoId: v, planoId: student?.planoId || p.planoId, valor: plan ? String(plan.valor) : p.valor }));
              }} options={students.map(s => ({ value: s.id, label: s.nome }))} />
            </div>
            <Input label="Plano" value={form.planoId || ""} onChange={v => {
              const plan = plans.find(p => p.id === v);
              setForm(p => ({ ...p, planoId: v, valor: plan ? String(plan.valor) : p.valor }));
            }} options={plans.map(p => ({ value: p.id, label: p.nome }))} />
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
      {ConfirmUI}
    </div>
  );
}

// ─── REVENUE CHART ────────────────────────────────────────────────────────────
function RevenueChart({ payments }) {
  const months = useMemo(() => {
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      const revenue = payments
        .filter(p => p.status === "Pago" && (p.vencimento || "").startsWith(key))
        .reduce((s, p) => s + (Number(p.valor) || 0), 0);
      result.push({ key, label, revenue });
    }
    return result;
  }, [payments]);

  const max = Math.max(...months.map(m => m.revenue), 1);
  const barW = 48, gap = 16, H = 130, padH = 32;
  const totalW = months.length * (barW + gap) + gap;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${totalW} ${H + padH}`} style={{ display: "block", minWidth: 280 }}>
        {months.map((m, i) => {
          const x = gap + i * (barW + gap);
          const barH = Math.max((m.revenue / max) * H, m.revenue > 0 ? 4 : 0);
          const y = H - barH;
          return (
            <g key={m.key}>
              <rect x={x} y={y} width={barW} height={barH} rx={4} fill="#38bdf822" stroke="#38bdf8" strokeWidth={1} />
              <text x={x + barW / 2} y={H + 18} textAnchor="middle" fill="#64748b" fontSize={11} fontFamily="sans-serif">{m.label}</text>
              {m.revenue > 0 && (
                <text x={x + barW / 2} y={Math.max(y - 5, 12)} textAnchor="middle" fill="#38bdf8" fontSize={10} fontFamily="sans-serif" fontWeight="700">
                  {m.revenue >= 1000 ? `${(m.revenue / 1000).toFixed(1)}k` : m.revenue}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────
function ReportsPage({ students, teachers, classes, payments, modalities, attendance = [] }) {
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

  // Presença por aula
  const attendanceByClass = classes.map(c => {
    const records = attendance.filter(a => a.classId === c.id);
    const present = records.filter(a => a.present).length;
    const mod = modalities.find(m => m.id === c.modalidadeId);
    const prof = teachers.find(t => t.id === c.professorId);
    return { id: c.id, label: `${c.diaSemana} ${c.horarioInicio}`, modality: mod?.nome || "—", teacher: prof?.nome?.split(" ")[0] || "—", total: records.length, present, rate: records.length > 0 ? Math.round((present / records.length) * 100) : 0 };
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const totalPresent = attendance.filter(a => a.present).length;
  const totalAttendance = attendance.length;

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
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn onClick={() => exportCSV("todos_alunos.csv", ["Nome", "CPF", "Telefone", "Email", "Modalidade", "Status", "Matrícula"], students.map(s => [s.nome || "", s.cpf || "", s.telefone || "", s.email || "", s.modalidade || "", s.status || "", s.dataMatricula || ""]))} variant="ghost" size="sm">
              <Icon d={icons.reports} size={14} />Exportar todos os alunos
            </Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            <StatCard label="Total de Alunos" value={students.length} icon="students" color="#38bdf8" />
            <StatCard label="Alunos Ativos" value={activeStudents.length} icon="check" color="#22c55e" />
            <StatCard label="Inadimplentes" value={delinquentStudents.length} icon="alert" color="#ef4444" />
          </div>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Lista de Inadimplentes</h3>
              <Btn onClick={() => exportCSV("inadimplentes.csv", ["Nome", "Modalidade", "Telefone", "Status"], delinquentStudents.map(s => [s.nome || "", s.modalidade || "", s.telefone || "", s.status || ""]))} variant="ghost" size="sm">
                <Icon d={icons.reports} size={14} />CSV
              </Btn>
            </div>
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
            <StatCard label="Receita Total Paga" value={formatMoney(monthRevenue)} icon="financial" color="#22c55e" />
            <StatCard label="Em Atraso" value={formatMoney(overduePayments.reduce((s, p) => s + (Number(p.valor) || 0), 0))} icon="alert" color="#ef4444" />
            <StatCard label="Qtd Inadimplentes" value={overduePayments.length} icon="users" color="#f59e0b" />
          </div>
          <Card>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Receita dos últimos 6 meses</h3>
            <RevenueChart payments={payments} />
          </Card>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Mensalidades em Atraso</h3>
              <Btn onClick={() => exportCSV("mensalidades_atraso.csv", ["Aluno", "Valor", "Vencimento", "Status"], overduePayments.map(p => [students.find(s => s.id === p.alunoId)?.nome || "", p.valor, p.vencimento || "", p.status || ""]))} variant="ghost" size="sm">
                <Icon d={icons.reports} size={14} />CSV
              </Btn>
            </div>
            <Table
              cols={[
                { key: "alunoId", label: "Aluno", render: v => students.find(s => s.id === v)?.nome || v },
                { key: "valor", label: "Valor", render: v => formatMoney(v) },
                { key: "vencimento", label: "Vencimento", render: v => formatDate(v) },
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
  // undefined = verificando sessão, null = deslogado, object = autenticado
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <LoginScreen />;
  return <AuthenticatedApp />;
}

// ─── MOBILE HOOK ─────────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

function AuthenticatedApp() {
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ── Supabase tables ──
  const { rows: students, loading: sl, error: se, add: addStudent, update: updateStudent, remove: removeStudent } = useTable("students");
  const { rows: teachers, loading: tl, add: addTeacher, update: updateTeacher, remove: removeTeacher } = useTable("teachers");
  const { rows: modalities, loading: ml, add: addModality, update: updateModality, remove: removeModality } = useTable("modalities");
  const { rows: classes, loading: cl, add: addClass, update: updateClass, remove: removeClass } = useTable("classes");
  const { rows: payments, loading: pl, add: addPayment, update: updatePayment, remove: removePayment } = useTable("payments");
  const { rows: plans, loading: planl, add: addPlan, update: updatePlan, remove: removePlan } = useTable("plans");
  const { rows: beltHistory, add: addBeltHistory } = useTable("belt_history");
  const { rows: attendance, add: addAttendance } = useTable("attendance");

  const loading = sl || tl || ml || cl || pl || planl;

  if (loading) return <LoadingScreen />;
  if (se) return <ErrorScreen message={se} onRetry={() => window.location.reload()} />;

  const navigate = (key) => { setPage(key); if (isMobile) setMobileNavOpen(false); };
  const showLabel = sidebarOpen || isMobile;

  const pageProps = {
    students, addStudent, updateStudent, removeStudent,
    teachers, addTeacher, updateTeacher, removeTeacher,
    modalities, addModality, updateModality, removeModality,
    classes, addClass, updateClass, removeClass,
    payments, addPayment, updatePayment, removePayment,
    plans, addPlan, updatePlan, removePlan,
    beltHistory, addBeltHistory,
    attendance, addAttendance,
  };

  const pages = {
    dashboard: <Dashboard students={students} teachers={teachers} classes={classes} payments={payments} modalities={modalities} />,
    students: <StudentsPage {...pageProps} />,
    teachers: <TeachersPage {...pageProps} />,
    modalities: <ModalitiesPage {...pageProps} />,
    classes: <ClassesPage {...pageProps} />,
    schedule: <SchedulePage classes={classes} teachers={teachers} modalities={modalities} />,
    attendance: <AttendancePage classes={classes} students={students} teachers={teachers} modalities={modalities} addAttendance={addAttendance} />,
    financial: <FinancialPage {...pageProps} />,
    reports: <ReportsPage students={students} teachers={teachers} classes={classes} payments={payments} modalities={modalities} attendance={attendance} />,
  };

  return (
    <ToastContext.Provider value={addToast}>
    <div style={{ minHeight: "100vh", background: "#080e1c", fontFamily: "'Barlow', sans-serif", color: "#e2e8f0", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(22px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes slideInRight { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin-ring { to { transform: rotate(360deg); } }
        @keyframes pulse-logo { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.75; transform:scale(0.95); } }
        .page-enter { animation: fadeIn 0.22s cubic-bezier(0.16,1,0.3,1); }
        .modal-enter { animation: slideUp 0.26s cubic-bezier(0.16,1,0.3,1); }
        .toast-enter { animation: slideInRight 0.3s cubic-bezier(0.16,1,0.3,1); }
        .spin-ring { animation: spin-ring 1.2s linear infinite; transform-origin: center; }
        .pulse-logo { animation: pulse-logo 2.4s ease-in-out infinite; }
        input:focus, select:focus, textarea:focus { border-color: #38bdf8 !important; box-shadow: 0 0 0 3px #38bdf820 !important; outline: none; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0a0f1e; }
        ::-webkit-scrollbar-thumb { background: #243049; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #2d3f5e; }
        .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid #243049; display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 24px; }
        @media (max-width: 640px) {
          .grid-2col { grid-template-columns: 1fr !important; }
          .modal-header { padding: 14px 16px !important; }
          .modal-body { padding: 16px !important; }
        }
      `}</style>

      {/* Overlay mobile */}
      {isMobile && mobileNavOpen && (
        <div onClick={() => setMobileNavOpen(false)} style={{
          position: "fixed", inset: 0, background: "#00000080", zIndex: 199
        }} />
      )}

      {/* Barra superior mobile */}
      {isMobile && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 56,
          background: "#0d1526", borderBottom: "1px solid #1e293b",
          display: "flex", alignItems: "center", padding: "0 16px", gap: 12, zIndex: 100,
        }}>
          <button onClick={() => setMobileNavOpen(true)} style={{
            background: "none", border: "none", cursor: "pointer", color: "#94a3b8",
            padding: 6, display: "flex", alignItems: "center", borderRadius: 8,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 12h18 M3 6h18 M3 18h18" />
            </svg>
          </button>
          <img src="/logo.png" alt="Patriota" style={{ width: 34, height: 34, objectFit: "contain", flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 900, color: "#f1f5f9", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
            PATRIOTA <span style={{ color: "#475569", fontWeight: 400, fontSize: 11 }}>Fight Team</span>
          </span>
        </div>
      )}

      {/* Sidebar */}
      <div style={isMobile ? {
        position: "fixed", top: 0, left: 0, bottom: 0, width: 240,
        background: "#060c1a", borderRight: "1px solid #1a2540",
        display: "flex", flexDirection: "column",
        transform: mobileNavOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s ease",
        zIndex: 200, overflowX: "hidden",
      } : {
        width: sidebarOpen ? 220 : 64, background: "#060c1a", borderRight: "1px solid #1a2540",
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
        transition: "width 0.2s", flexShrink: 0, overflowX: "hidden",
      }}>
        <div style={{ padding: "12px 8px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 8, justifyContent: sidebarOpen || isMobile ? "flex-start" : "center" }}>
          <img src="/logo.png" alt="Patriota Fight Team" style={{ width: 44, height: 44, objectFit: "contain", flexShrink: 0 }} />
          {showLabel && (
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
              <button key={item.key} onClick={() => navigate(item.key)} title={!showLabel ? item.label : ""} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px", borderRadius: 9, border: "none", cursor: "pointer",
                background: active ? "linear-gradient(90deg, #38bdf814 0%, #38bdf806 100%)" : "transparent",
                color: active ? "#38bdf8" : "#4e6280",
                fontFamily: "inherit", fontSize: 13, fontWeight: active ? 700 : 500,
                marginBottom: 2, textAlign: "left", transition: "all 0.15s", whiteSpace: "nowrap",
                boxShadow: active ? "inset 3px 0 0 #38bdf8" : "none",
              }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "#ffffff08"; e.currentTarget.style.color = "#7a9cbf"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#4e6280"; } }}
              >
                <div style={{ flexShrink: 0 }}><Icon d={icons[item.icon]} size={18} /></div>
                {showLabel && item.label}
                {active && showLabel && <div style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#38bdf8", boxShadow: "0 0 8px #38bdf8" }} />}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "12px 8px", borderTop: "1px solid #1e293b" }}>
          {!isMobile && (
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
          )}
          <button onClick={() => setShowChangePwd(true)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
            borderRadius: 8, border: "none", cursor: "pointer", background: "transparent",
            color: "#475569", fontFamily: "inherit", fontSize: 12, marginBottom: 2, whiteSpace: "nowrap"
          }}>
            <Icon d={icons.key} size={18} />
            {showLabel && "Alterar Senha"}
          </button>
          <button onClick={() => supabase.auth.signOut()} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
            borderRadius: 8, border: "none", cursor: "pointer", background: "transparent",
            color: "#475569", fontFamily: "inherit", fontSize: 12, whiteSpace: "nowrap"
          }}>
            <Icon d={icons.logout} size={18} />
            {showLabel && "Sair"}
          </button>
        </div>
      </div>

      {/* Conteúdo principal */}
      <main style={{
        flex: 1,
        padding: isMobile ? "72px 16px 32px" : "28px 32px",
        minWidth: 0, overflow: "auto",
      }}>
        <div key={page} className="page-enter">
          {pages[page] || <div>Página não encontrada</div>}
        </div>
      </main>

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
      <ToastContainer toasts={toasts} />
    </div>
    </ToastContext.Provider>
  );
}