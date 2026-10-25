import React, { useState, useMemo, useEffect } from "react";
import {
  getSemaforoKey,
  cleanSemaforoLabel,
  type Equipo,
  type SemaforoKey,
} from "../data/catalogs";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  FileSpreadsheet,
  SlidersHorizontal,
  ArrowUpRight,
  Search,
} from "lucide-react";

interface SemaforoPatioProps {
  equipos: Equipo[];
  isJefe: boolean;
  onOpenFicha: (codigo: string) => void;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

const SEMAFORO_META: Record<
  SemaforoKey,
  {
    label: string;
    led: string;
    headerBg: string;
    cardBg: string;
    textCol: string;
  }
> = {
  OPERATIVA: {
    label: "OPERATIVA (LISTA)",
    led: "bg-emerald-500",
    headerBg: "bg-[#064E3B] text-white",
    cardBg: "bg-emerald-50 border-emerald-300",
    textCol: "text-emerald-950",
  },
  MANTENCION: {
    label: "PIDE MANTENCIÓN",
    led: "bg-amber-500",
    headerBg: "bg-[#78350F] text-white",
    cardBg: "bg-amber-50 border-amber-300",
    textCol: "text-amber-950",
  },
  PANA: {
    label: "EN PANA (TALLER)",
    led: "bg-red-600",
    headerBg: "bg-[#7F1D1D] text-white",
    cardBg: "bg-red-50 border-red-300",
    textCol: "text-red-950",
  },
  PRESUPUESTO: {
    label: "ESPERANDO PRESUPUESTO",
    led: "bg-purple-600",
    headerBg: "bg-[#4C1D95] text-white",
    cardBg: "bg-purple-50 border-purple-300",
    textCol: "text-purple-950",
  },
};

export default function SemaforoPatio({
  equipos,
  isJefe,
  onOpenFicha,
  onRefresh,
}: SemaforoPatioProps) {
  const totalMaq = equipos.length;
  const verdes = equipos.filter(
    (e) => getSemaforoKey(e.semaforo) === "OPERATIVA"
  ).length;
  const amarillas = equipos.filter(
    (e) => getSemaforoKey(e.semaforo) === "MANTENCION"
  ).length;
  const rojas = equipos.filter(
    (e) => getSemaforoKey(e.semaforo) === "PANA"
  ).length;
  const moradas = equipos.filter(
    (e) => getSemaforoKey(e.semaforo) === "PRESUPUESTO"
  ).length;

  const dispPct =
    totalMaq > 0
      ? Number((((verdes + amarillas) / totalMaq) * 100).toFixed(1))
      : 100;

  let moodStyle = "bg-[#064E3B] border-emerald-700 text-white";
  let moodLed = "bg-emerald-400 shadow-[0_0_10px_#34d399]";
  let moodText = "Flota en Óptimas Condiciones Operativas";
  let MoodIcon = CheckCircle2;

  if (dispPct < 65) {
    moodStyle = "bg-[#7F1D1D] border-red-700 text-white";
    moodLed = "bg-red-400 shadow-[0_0_10px_#f87171]";
    moodText = "Alerta Crítica: Alta Concentración de Equipos Inoperativos";
    MoodIcon = OctagonAlert;
  } else if (dispPct < 85) {
    moodStyle = "bg-[#78350F] border-amber-700 text-white";
    moodLed = "bg-amber-400 shadow-[0_0_10px_#fbbf24]";
    moodText = "Precaución Operativa: Aumento de Unidades en Taller";
    MoodIcon = AlertTriangle;
  }

  const todasCategorias = useMemo(() => {
    return Array.from(new Set(equipos.map((e) => e.categoria))).sort();
  }, [equipos]);

  const [filtroKeys, setFiltroKeys] = useState<SemaforoKey[]>([
    "OPERATIVA",
    "MANTENCION",
    "PANA",
    "PRESUPUESTO",
  ]);
  const [filtroCat, setFiltroCat] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [maqPatio, setMaqPatio] = useState("");
  const [accionRapida, setAccionRapida] = useState(
    "ABRIR FICHA COMPLETA DEL EQUIPO"
  );
  const [notaRapida, setNotaRapida] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setFiltroCat(todasCategorias);
  }, [todasCategorias.join("|")]);

  const dfFiltrado = useMemo(() => {
    return equipos.filter((e) => {
      const k = getSemaforoKey(e.semaforo);
      if (!filtroKeys.includes(k)) return false;
      if (!filtroCat.includes(e.categoria)) return false;
      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        const matchCod = e.codigo.toLowerCase().includes(q);
        const matchNom = e.nombre.toLowerCase().includes(q);
        const matchPana = e.panas_reportadas.toLowerCase().includes(q);
        if (!matchCod && !matchNom && !matchPana) return false;
      }
      return true;
    });
  }, [equipos, filtroKeys, filtroCat, busqueda]);

  useEffect(() => {
    if (
      dfFiltrado.length > 0 &&
      !dfFiltrado.some((e) => e.codigo === maqPatio)
    ) {
      setMaqPatio(dfFiltrado[0].codigo);
    }
  }, [dfFiltrado, maqPatio]);

  const accionesPatio = useMemo(() => {
    const base = [
      "ABRIR FICHA COMPLETA DEL EQUIPO",
      "BLOQUEAR POR FALLA (ENVIAR A TALLER)",
      "ENVIAR A PRESUPUESTO (DAÑO SEVERO)",
    ];
    if (isJefe) {
      base.splice(1, 0, "LIBERAR RÁPIDO (VOLVER A PATIO)");
    }
    return base;
  }, [isJefe]);

  const handleEjecutarAccion = async () => {
    if (!maqPatio) return;
    if (accionRapida.startsWith("ABRIR")) {
      onOpenFicha(maqPatio);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/patio/accion-rapida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: maqPatio,
          accion: accionRapida,
          nota: notaRapida,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotaRapida("");
        await onRefresh({ type: "success", text: data.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* BANNER DE ESTADO GENERAL DE LA FLOTA */}
      <div
        className={`rounded-xl border p-5 shadow-xs flex flex-wrap items-center justify-between gap-4 ${moodStyle}`}
      >
        <div className="flex items-center gap-3">
          <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${moodLed}`} />
          <MoodIcon className="w-5 h-5 shrink-0" />
          <div>
            <div className="text-xs uppercase tracking-wider font-bold opacity-80">
              Monitor de Disponibilidad de Patio y Taller
            </div>
            <h3 className="text-base md:text-lg font-extrabold">{moodText}</h3>
          </div>
        </div>
        <div className="bg-black/25 px-4 py-2 rounded-lg border border-white/15 font-mono text-lg font-black tabular-nums">
          {dispPct}% Operatividad
        </div>
      </div>

      {/* 5 TARJETAS COLOREADAS DEL SEMÁFORO */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
          <div className="bg-[#1E293B] text-white px-4 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Total Flota</span>
            <Activity className="w-3.5 h-3.5 text-sky-300" />
          </div>
          <div className="p-4 text-2xl font-black text-slate-900 font-mono tabular-nums">
            {totalMaq.toLocaleString("es-CL")}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-400 bg-emerald-50/80 overflow-hidden shadow-2xs">
          <div className="bg-[#064E3B] text-white px-4 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Operativas</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="p-4 text-2xl font-black text-emerald-950 font-mono tabular-nums">
            {verdes.toLocaleString("es-CL")}
          </div>
        </div>

        <div className="rounded-xl border border-amber-400 bg-amber-50/80 overflow-hidden shadow-2xs">
          <div className="bg-[#78350F] text-white px-4 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Mantención</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          </div>
          <div className="p-4 text-2xl font-black text-amber-950 font-mono tabular-nums">
            {amarillas.toLocaleString("es-CL")}
          </div>
        </div>

        <div className="rounded-xl border border-red-400 bg-red-50/80 overflow-hidden shadow-2xs">
          <div className="bg-[#7F1D1D] text-white px-4 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
            <span>En Pana</span>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          </div>
          <div className="p-4 text-2xl font-black text-red-950 font-mono tabular-nums">
            {rojas.toLocaleString("es-CL")}
          </div>
        </div>

        <div className="rounded-xl border border-purple-400 bg-purple-50/80 overflow-hidden shadow-2xs">
          <div className="bg-[#4C1D95] text-white px-4 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Presupuesto</span>
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
          </div>
          <div className="p-4 text-2xl font-black text-purple-950 font-mono tabular-nums">
            {moradas.toLocaleString("es-CL")}
          </div>
        </div>
      </div>

      {/* PANEL DE ACCIÓN RÁPIDA EN PATIO */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
        <div className="bg-[#0C4A6E] text-white px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-sky-300" />
            <h4 className="text-sm font-bold uppercase tracking-wider">
              Consola de Acción Rápida (Operador de Patio)
            </h4>
          </div>
          <span className="text-xs text-sky-200">
            Intervención directa sin abrir ficha individual
          </span>
        </div>

        <div className="p-6 space-y-5">
          {/* FILTROS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Filtrar por Estado LED:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    "OPERATIVA",
                    "MANTENCION",
                    "PANA",
                    "PRESUPUESTO",
                  ] as SemaforoKey[]
                ).map((k) => {
                  const active = filtroKeys.includes(k);
                  const meta = SEMAFORO_META[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setFiltroKeys(
                          active
                            ? filtroKeys.filter((item) => item !== k)
                            : [...filtroKeys, k]
                        )
                      }
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        active
                          ? "bg-[#0F172A] text-white border-[#0F172A]"
                          : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${meta.led}`} />
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Filtrar por Categoría:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {todasCategorias.map((cat) => {
                  const active = filtroCat.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() =>
                        setFiltroCat(
                          active
                            ? filtroCat.filter((c) => c !== cat)
                            : [...filtroCat, cat]
                        )
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        active
                          ? "bg-[#0369A1] text-white border-[#0369A1]"
                          : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <span>Buscar Código o Falla:</span>
              </label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Ej: RV-0007, acople, Honda..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <hr className="border-slate-200" />

          {dfFiltrado.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Seleccionar Equipo (
                    {dfFiltrado.length.toLocaleString("es-CL")}):
                  </label>
                  <select
                    value={maqPatio}
                    onChange={(e) => setMaqPatio(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold"
                  >
                    {dfFiltrado.slice(0, 500).map((eq) => (
                      <option key={eq.codigo} value={eq.codigo}>
                        {eq.codigo} — {eq.nombre} ·{" "}
                        {cleanSemaforoLabel(eq.semaforo)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Operación a Ejecutar:
                  </label>
                  <select
                    value={accionRapida}
                    onChange={(e) => setAccionRapida(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold"
                  >
                    {accionesPatio.map((acc) => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Observación Rápida (Opcional):
                  </label>
                  <input
                    type="text"
                    value={notaRapida}
                    onChange={(e) => setNotaRapida(e.target.value)}
                    placeholder="Ej: Retorno de faena sector sur..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleEjecutarAccion}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#065F46] hover:bg-[#047857] text-white font-bold py-3 px-4 text-sm cursor-pointer transition-all"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Ejecutar Operación en Flota</span>
              </button>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-100 border border-slate-300 p-4 text-sm text-slate-700 font-medium">
              No existen equipos que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
