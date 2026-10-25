import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  Lock,
  Unlock,
  DollarSign,
  FileSpreadsheet,
  Package,
  BarChart3,
  CheckCircle2,
  Plus,
  RefreshCw,
  Wrench,
  TrendingUp,
  Layers,
  ClipboardCheck,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";
import {
  formatCLP,
  duracionLegible,
  PAUTAS_MECANICAS,
  type Equipo,
  type Presupuesto,
  type OrdenTrabajo,
  type Repuesto,
  type OTRepuestoItem,
  type EventoHistorial,
} from "../data/catalogs";

interface PanelJefaturaProps {
  equipos: Equipo[];
  presupuestos: Presupuesto[];
  ordenesTrabajo: OrdenTrabajo[];
  repuestos: Repuesto[];
  otRepuestos: OTRepuestoItem[];
  historial: EventoHistorial[];
  gastoTotal: number;
  isJefe: boolean;
  onUnlockJefe: (password: string) => Promise<boolean>;
  onLockJefe: () => void;
  onOpenFicha: (codigo: string) => void;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
}

const CATEGORIAS_REP = ["General", ...Object.keys(PAUTAS_MECANICAS)];

export default function PanelJefatura({
  equipos,
  presupuestos,
  ordenesTrabajo,
  repuestos,
  otRepuestos,
  historial,
  gastoTotal,
  isJefe,
  onUnlockJefe,
  onLockJefe,
  onOpenFicha,
  onRefresh,
}: PanelJefaturaProps) {
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<
    "presupuestos" | "ots" | "bodega" | "analitica"
  >("presupuestos");

  // Filtros Presupuestos
  const [filtroEstPres, setFiltroEstPres] = useState<string>("PENDIENTE");
  const [resolviendoFolio, setResolviendoFolio] = useState<string | null>(null);
  const [estadoResMap, setEstadoResMap] = useState<Record<string, string>>({});
  const [destResMap, setDestResMap] = useState<Record<string, string>>({});
  const [obsResMap, setObsResMap] = useState<Record<string, string>>({});

  // Estado Bodega
  const [modoBodega, setModoBodega] = useState<"ingreso" | "crear">("ingreso");
  const [repuestoIdSel, setRepuestoIdSel] = useState<number>(
    repuestos[0]?.id || 1
  );
  const [cantIngreso, setCantIngreso] = useState<number>(5);
  const [nuevoCostoIngreso, setNuevoCostoIngreso] = useState<number>(0);

  const [nuevoCodRep, setNuevoCodRep] = useState("");
  const [nuevoNomRep, setNuevoNomRep] = useState("");
  const [nuevoAplicaA, setNuevoAplicaA] = useState("General");
  const [nuevaUnidadRep, setNuevaUnidadRep] = useState("unidad");
  const [nuevoStockRep, setNuevoStockRep] = useState<number>(5);
  const [nuevoMinRep, setNuevoMinRep] = useState<number>(2);
  const [nuevoCostoRep, setNuevoCostoRep] = useState<number>(10000);
  const [savingBodega, setSavingBodega] = useState(false);

  // Hooks de cálculo SIEMPRE arriba del return condicional
  const presPendientes = useMemo(
    () =>
      presupuestos.filter((p) => p.estado_presupuesto === "PENDIENTE").length,
    [presupuestos]
  );

  const presAprobadosMonto = useMemo(
    () =>
      presupuestos
        .filter((p) => p.estado_presupuesto === "APROBADO")
        .reduce((acc, p) => acc + (Number(p.monto_total) || 0), 0),
    [presupuestos]
  );

  const presupuestosFiltrados = useMemo(() => {
    if (filtroEstPres === "TODOS") return presupuestos;
    return presupuestos.filter((p) => p.estado_presupuesto === filtroEstPres);
  }, [presupuestos, filtroEstPres]);

  const otsAbiertasCount = useMemo(
    () => ordenesTrabajo.filter((o) => o.estado !== "CERRADA").length,
    [ordenesTrabajo]
  );

  const stockCriticoCount = useMemo(
    () => repuestos.filter((r) => r.stock <= r.stock_minimo).length,
    [repuestos]
  );

  const valorTotalBodega = useMemo(
    () =>
      repuestos.reduce(
        (acc, r) => acc + Number(r.stock) * Number(r.costo_unitario),
        0
      ),
    [repuestos]
  );

  const rankingGastoPorEquipo = useMemo(() => {
    const eqMap = new Map(equipos.map((e) => [e.codigo, e]));
    const map = new Map<
      string,
      {
        codigo: string;
        nombre: string;
        categoria: string;
        gasto: number;
        eventos: number;
      }
    >();

    for (const h of historial) {
      const c = Number(h.costo_repuestos) || 0;
      if (c <= 0) continue;
      const eq = eqMap.get(h.codigo_equipo);
      const cur = map.get(h.codigo_equipo) || {
        codigo: h.codigo_equipo,
        nombre: eq?.nombre || h.codigo_equipo,
        categoria: eq?.categoria || "General",
        gasto: 0,
        eventos: 0,
      };
      cur.gasto += c;
      cur.eventos += 1;
      map.set(h.codigo_equipo, cur);
    }

    return Array.from(map.values())
      .sort((a, b) => b.gasto - a.gasto)
      .slice(0, 10);
  }, [historial, equipos]);

  const fallasPorCategoria = useMemo(() => {
    const eqMap = new Map(equipos.map((e) => [e.codigo, e]));
    const map = new Map<
      string,
      { categoria: string; ots: number; costo: number }
    >();

    for (const ot of ordenesTrabajo) {
      const eq = eqMap.get(ot.codigo_equipo);
      const cat = eq?.categoria || "Sin Categoría";
      const cur = map.get(cat) || { categoria: cat, ots: 0, costo: 0 };
      cur.ots += 1;
      cur.costo +=
        (Number(ot.costo_repuestos) || 0) + (Number(ot.costo_otros) || 0);
      map.set(cat, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.ots - a.ots);
  }, [ordenesTrabajo, equipos]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await onUnlockJefe(passwordInput);
      setPasswordInput("");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResolverPresupuesto = async (pres: Presupuesto) => {
    setResolviendoFolio(pres.folio);
    try {
      const nuevoEst =
        estadoResMap[pres.folio] || pres.estado_presupuesto || "APROBADO";
      const nuevoDest =
        destResMap[pres.folio] !== undefined
          ? destResMap[pres.folio]
          : pres.destinatario_nombre;
      const nuevaObs =
        obsResMap[pres.folio] !== undefined
          ? obsResMap[pres.folio]
          : pres.observaciones_resolucion;

      const res = await fetch(
        `/api/presupuestos/${encodeURIComponent(pres.folio)}/resolver`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estado_presupuesto: nuevoEst,
            destinatario_nombre: nuevoDest,
            observaciones_resolucion: nuevaObs,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        await onRefresh({
          type: "error",
          text: json.error || "Error al resolver presupuesto.",
        });
      } else {
        await onRefresh({
          type: "success",
          text: json.message || `Presupuesto ${pres.folio} actualizado.`,
        });
      }
    } catch {
      await onRefresh({
        type: "error",
        text: "Error de red al guardar resolución.",
      });
    } finally {
      setResolviendoFolio(null);
    }
  };

  const handleBodegaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBodega(true);
    try {
      if (modoBodega === "ingreso") {
        const res = await fetch("/api/repuestos/ingreso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repuesto_id: repuestoIdSel,
            cantidad: cantIngreso,
            nuevo_costo: nuevoCostoIngreso,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          await onRefresh({
            type: "error",
            text: json.error || "Error al ingresar stock.",
          });
        } else {
          await onRefresh({
            type: "success",
            text: json.message || "Stock actualizado correctamente.",
          });
        }
      } else {
        const res = await fetch("/api/repuestos/crear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo: nuevoCodRep,
            nombre: nuevoNomRep,
            aplica_a: nuevoAplicaA,
            unidad: nuevaUnidadRep,
            stock: nuevoStockRep,
            stock_minimo: nuevoMinRep,
            costo_unitario: nuevoCostoRep,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          await onRefresh({
            type: "error",
            text: json.error || "Error al crear repuesto.",
          });
        } else {
          setNuevoCodRep("");
          setNuevoNomRep("");
          await onRefresh({
            type: "success",
            text: json.message || "Nuevo ítem creado en bodega.",
          });
        }
      }
    } catch {
      await onRefresh({
        type: "error",
        text: "Error de conexión al actualizar bodega.",
      });
    } finally {
      setSavingBodega(false);
    }
  };

  if (!isJefe) {
    return (
      <div className="max-w-md mx-auto my-12 bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-lg overflow-hidden">
        <div className="bg-[#0F172A] text-white px-6 py-5 border-b border-slate-700 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#0C4A6E] border border-sky-500/40 flex items-center justify-center text-sky-300 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-sky-400 block">
              CONTROL DE ACCESO EJECUTIVO
            </span>
            <h2 className="text-base font-bold text-white">
              Autenticación de Jefatura y Finanzas
            </h2>
          </div>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Este módulo gestiona resolución de presupuestos, auditoría de
            órdenes de trabajo (OTs), valorización de bodega y analítica de
            costos.
          </p>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Contraseña de Jefatura
            </label>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Ingrese contraseña..."
              className="w-full bg-white border border-slate-300 rounded-md px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
              autoFocus
            />
            <span className="text-[11px] font-mono text-slate-400 mt-1 block">
              Clave predeterminada: valdivia2026
            </span>
          </div>

          <button
            type="submit"
            disabled={authLoading}
            className="w-full bg-[#065F46] hover:bg-[#047857] text-white font-bold py-2.5 px-4 rounded-md text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Unlock className="w-4 h-4" />
            {authLoading
              ? "Verificando Credencial..."
              : "Desbloquear Panel de Jefatura"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado Ejecutivo Oscuro */}
      <div className="bg-[#0F172A] border border-slate-700 rounded-lg p-5 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-[#065F46] border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-semibold block">
              GERENCIA DE OPERACIONES & CONTROL DE COSTOS
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Panel de Jefatura: Presupuestos, OTs, Bodega y Analítica
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800 border border-slate-700 px-3.5 py-2 rounded-md flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10B981]" />
            <span className="text-xs font-mono uppercase tracking-wider text-slate-200">
              SESIÓN JEFATURA ACTIVA
            </span>
          </div>
          <button
            type="button"
            onClick={onLockJefe}
            className="bg-slate-800 hover:bg-red-950/80 text-slate-300 hover:text-red-200 border border-slate-700 hover:border-red-700 px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* KPIs Ejecutivos Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0F172A] text-white border border-slate-700 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
            <span>GASTO HISTÓRICO TALLER</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400 mt-1.5">
            {formatCLP(gastoTotal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Repuestos e intervenciones cerradas
          </div>
        </div>

        <div className="bg-[#0C4A6E] text-white border border-sky-700 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-sky-200">
            <span>PRESUPUESTOS PENDIENTES</span>
            <ClipboardCheck className="w-4 h-4 text-sky-300" />
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-1.5">
            {presPendientes}
          </div>
          <div className="text-[11px] text-sky-200 mt-1">
            Aprobados acumulados: {formatCLP(presAprobadosMonto)}
          </div>
        </div>

        <div className="bg-[#064E3B] text-white border border-emerald-700 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-emerald-200">
            <span>VALORIZACIÓN BODEGA</span>
            <Package className="w-4 h-4 text-emerald-300" />
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-1.5">
            {formatCLP(valorTotalBodega)}
          </div>
          <div className="text-[11px] text-emerald-200 mt-1">
            {repuestos.length} ítems ({stockCriticoCount} bajo mínimo)
          </div>
        </div>

        <div className="bg-[#1E293B] text-white border border-slate-700 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-300">
            <span>ÓRDENES DE TRABAJO (OT)</span>
            <Wrench className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400 mt-1.5">
            {otsAbiertasCount} ABIERTAS
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Total histórico: {ordenesTrabajo.length} OTs
          </div>
        </div>
      </div>

      {/* Sub-navegación de Jefatura */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setActiveSubTab("presupuestos")}
          className={`p-3.5 rounded-lg border text-left transition-all flex items-center justify-between cursor-pointer ${
            activeSubTab === "presupuestos"
              ? "bg-[#0C4A6E] text-white border-sky-500 shadow-sm"
              : "bg-[#F8FAFC] text-slate-800 border-slate-300 hover:bg-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <DollarSign
              className={`w-5 h-5 ${
                activeSubTab === "presupuestos"
                  ? "text-sky-300"
                  : "text-[#0284C7]"
              }`}
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                Bandeja Presupuestos
              </span>
              <span
                className={`text-[11px] ${
                  activeSubTab === "presupuestos"
                    ? "text-sky-200"
                    : "text-slate-500"
                }`}
              >
                Aprobación y Cobros
              </span>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded font-mono text-xs font-bold ${
              presPendientes > 0
                ? "bg-purple-600 text-white"
                : activeSubTab === "presupuestos"
                ? "bg-sky-900 text-sky-200"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {presPendientes}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("ots")}
          className={`p-3.5 rounded-lg border text-left transition-all flex items-center justify-between cursor-pointer ${
            activeSubTab === "ots"
              ? "bg-[#064E3B] text-white border-emerald-500 shadow-sm"
              : "bg-[#F8FAFC] text-slate-800 border-slate-300 hover:bg-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet
              className={`w-5 h-5 ${
                activeSubTab === "ots" ? "text-emerald-300" : "text-[#059669]"
              }`}
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                Auditoría de OTs
              </span>
              <span
                className={`text-[11px] ${
                  activeSubTab === "ots" ? "text-emerald-200" : "text-slate-500"
                }`}
              >
                Tiempos y Repuestos
              </span>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded font-mono text-xs font-bold ${
              activeSubTab === "ots"
                ? "bg-emerald-900 text-emerald-200"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {ordenesTrabajo.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("bodega")}
          className={`p-3.5 rounded-lg border text-left transition-all flex items-center justify-between cursor-pointer ${
            activeSubTab === "bodega"
              ? "bg-[#1E293B] text-white border-slate-500 shadow-sm"
              : "bg-[#F8FAFC] text-slate-800 border-slate-300 hover:bg-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Package
              className={`w-5 h-5 ${
                activeSubTab === "bodega" ? "text-amber-300" : "text-amber-600"
              }`}
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                Bodega & Stock
              </span>
              <span
                className={`text-[11px] ${
                  activeSubTab === "bodega" ? "text-slate-300" : "text-slate-500"
                }`}
              >
                Insumos y Precios
              </span>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded font-mono text-xs font-bold ${
              stockCriticoCount > 0
                ? "bg-red-600 text-white"
                : activeSubTab === "bodega"
                ? "bg-slate-700 text-slate-200"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {repuestos.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("analitica")}
          className={`p-3.5 rounded-lg border text-left transition-all flex items-center justify-between cursor-pointer ${
            activeSubTab === "analitica"
              ? "bg-[#0C4A6E] text-white border-sky-500 shadow-sm"
              : "bg-[#F8FAFC] text-slate-800 border-slate-300 hover:bg-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <BarChart3
              className={`w-5 h-5 ${
                activeSubTab === "analitica"
                  ? "text-sky-300"
                  : "text-[#0284C7]"
              }`}
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                Analítica de Flota
              </span>
              <span
                className={`text-[11px] ${
                  activeSubTab === "analitica"
                    ? "text-sky-200"
                    : "text-slate-500"
                }`}
              >
                Ranking de Costos
              </span>
            </div>
          </div>
          <ArrowUpRight
            className={`w-4 h-4 ${
              activeSubTab === "analitica" ? "text-sky-300" : "text-slate-400"
            }`}
          />
        </button>
      </div>

      {/* SUBTAB 1: BANDEJA DE PRESUPUESTOS */}
      {activeSubTab === "presupuestos" && (
        <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-[#0C4A6E] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-sky-800">
            <div className="flex items-center gap-2.5">
              <DollarSign className="w-4 h-4 text-sky-300" />
              <h3 className="font-bold text-sm uppercase tracking-wider">
                Resolución de Presupuestos de Reparación y Daños
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              {["PENDIENTE", "APROBADO", "RECHAZADO", "TODOS"].map((est) => (
                <button
                  key={est}
                  type="button"
                  onClick={() => setFiltroEstPres(est)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase cursor-pointer transition-colors ${
                    filtroEstPres === est
                      ? "bg-white text-[#0C4A6E]"
                      : "bg-sky-950/70 text-sky-200 hover:bg-sky-900"
                  }`}
                >
                  {est}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {presupuestosFiltrados.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-6 flex items-center gap-4 text-emerald-950">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm uppercase tracking-wider">
                    Sin Presupuestos en Estado {filtroEstPres}
                  </h4>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    No existen solicitudes de presupuesto que coincidan con el
                    filtro seleccionado.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {presupuestosFiltrados.map((p) => {
                  const estActual =
                    estadoResMap[p.folio] ?? p.estado_presupuesto;
                  const destActual =
                    destResMap[p.folio] ?? p.destinatario_nombre;
                  const obsActual =
                    obsResMap[p.folio] ?? p.observaciones_resolucion;

                  const badgeStyle =
                    p.estado_presupuesto === "APROBADO"
                      ? "bg-emerald-100 text-emerald-900 border-emerald-400"
                      : p.estado_presupuesto === "RECHAZADO"
                      ? "bg-red-100 text-red-900 border-red-400"
                      : "bg-purple-100 text-purple-900 border-purple-400";

                  return (
                    <div
                      key={p.folio}
                      className="bg-white border border-slate-300 rounded-lg p-5 space-y-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-sm bg-slate-900 text-white px-2.5 py-1 rounded">
                            {p.folio}
                          </span>
                          <span className="font-mono font-bold text-base text-[#0C4A6E]">
                            {p.codigo_equipo}
                          </span>
                          <span className="font-bold text-sm text-slate-800">
                            {p.nombre_equipo}
                          </span>
                          <span
                            className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded border ${badgeStyle}`}
                          >
                            {p.estado_presupuesto}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-lg font-extrabold text-slate-900">
                            {formatCLP(p.monto_total)} CLP
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenFicha(p.codigo_equipo)}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Abrir Equipo
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-700 bg-slate-50 p-3.5 rounded border border-slate-200">
                        <div>
                          <span className="text-slate-500 block">
                            Solicitante y Fecha:
                          </span>
                          <strong className="text-slate-900">
                            {p.solicitante} ({p.fecha_solicitud})
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block">
                            Imputación / Cargo:
                          </span>
                          <strong className="text-slate-900">
                            {p.destinatario_tipo} &mdash;{" "}
                            {p.destinatario_nombre}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block">
                            Desglose Costos:
                          </span>
                          <span className="font-mono text-slate-900">
                            Rep: {formatCLP(p.costo_repuestos)} | MO:{" "}
                            {formatCLP(p.costo_mano_obra)} | Ins:{" "}
                            {formatCLP(p.costo_insumos)}
                          </span>
                        </div>
                        <div className="md:col-span-3 pt-1 border-t border-slate-200">
                          <span className="text-slate-500">
                            Panas y Trabajos:{" "}
                          </span>
                          <strong className="text-slate-900">
                            {p.panas_asociadas}
                          </strong>{" "}
                          &mdash; {p.detalle_trabajos}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-1">
                        <div className="md:col-span-3">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                            Dictamen Jefatura
                          </label>
                          <select
                            value={estActual}
                            onChange={(e) =>
                              setEstadoResMap((prev) => ({
                                ...prev,
                                [p.folio]: e.target.value,
                              }))
                            }
                            className="w-full bg-white border border-slate-300 rounded px-2.5 py-2 text-xs font-bold text-slate-900"
                          >
                            <option value="PENDIENTE">PENDIENTE</option>
                            <option value="APROBADO">
                              APROBADO (Pasa a Reparación)
                            </option>
                            <option value="RECHAZADO">RECHAZADO</option>
                          </select>
                        </div>

                        <div className="md:col-span-3">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                            Cliente / Obra Responsable
                          </label>
                          <input
                            type="text"
                            value={destActual}
                            onChange={(e) =>
                              setDestResMap((prev) => ({
                                ...prev,
                                [p.folio]: e.target.value,
                              }))
                            }
                            className="w-full bg-white border border-slate-300 rounded px-2.5 py-2 text-xs text-slate-900"
                          />
                        </div>

                        <div className="md:col-span-4">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                            Observación de Resolución
                          </label>
                          <input
                            type="text"
                            value={obsActual}
                            onChange={(e) =>
                              setObsResMap((prev) => ({
                                ...prev,
                                [p.folio]: e.target.value,
                              }))
                            }
                            placeholder="Ej. Autorizado por gerencia / Orden de compra #..."
                            className="w-full bg-white border border-slate-300 rounded px-2.5 py-2 text-xs text-slate-900"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <button
                            type="button"
                            disabled={resolviendoFolio === p.folio}
                            onClick={() => handleResolverPresupuesto(p)}
                            className="w-full bg-[#065F46] hover:bg-[#047857] text-white font-bold py-2 px-3 rounded text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <ClipboardCheck className="w-4 h-4" />
                            {resolviendoFolio === p.folio
                              ? "Guardando..."
                              : "Guardar"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: AUDITORÍA DE OTS */}
      {activeSubTab === "ots" && (
        <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-[#1E293B] text-white px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm uppercase tracking-wider">
                Libro Mayor de Órdenes de Trabajo (OTs)
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-300">
              {ordenesTrabajo.length} REGISTROS
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-200/80 text-slate-700 border-b border-slate-300 font-mono uppercase text-[11px]">
                  <th className="py-2.5 px-3">Folio</th>
                  <th className="py-2.5 px-3">Equipo</th>
                  <th className="py-2.5 px-3">Tipo / Estado</th>
                  <th className="py-2.5 px-3">Apertura / Duración</th>
                  <th className="py-2.5 px-3">Mecánico / Responsable</th>
                  <th className="py-2.5 px-3">Descripción / Cierre</th>
                  <th className="py-2.5 px-3 text-right">Costo Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {ordenesTrabajo.map((ot) => {
                  const totalOt =
                    (Number(ot.costo_repuestos) || 0) +
                    (Number(ot.costo_otros) || 0);
                  const abierta = ot.estado !== "CERRADA";
                  return (
                    <tr key={ot.id} className="hover:bg-slate-100/80">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {ot.folio}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => onOpenFicha(ot.codigo_equipo)}
                          className="font-mono font-bold text-[#0284C7] hover:underline cursor-pointer"
                        >
                          {ot.codigo_equipo}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-800 block">
                          {ot.tipo}
                        </span>
                        <span
                          className={`inline-block mt-0.5 px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            abierta
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          }`}
                        >
                          {ot.estado}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        <div>{ot.fecha_apertura}</div>
                        <div className="text-[11px] text-slate-500">
                          Duración:{" "}
                          {duracionLegible(ot.fecha_apertura, ot.fecha_cierre)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">
                        <div className="font-medium">
                          {ot.mecanico || ot.responsable}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                        <div className="truncate" title={ot.descripcion}>
                          {ot.descripcion}
                        </div>
                        {ot.detalle_cierre && (
                          <div
                            className="text-emerald-800 font-medium truncate"
                            title={ot.detalle_cierre}
                          >
                            Cierre: {ot.detalle_cierre}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatCLP(totalOt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: BODEGA Y PRECIOS */}
      {activeSubTab === "bodega" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-[#1E293B] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm uppercase tracking-wider">
                  Catálogo y Existencias de Bodega de Repuestos
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-300">
                {repuestos.length} ÍTEMS
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-200/80 text-slate-700 border-b border-slate-300 font-mono uppercase text-[11px]">
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3">Código / Repuesto</th>
                    <th className="py-2.5 px-3">Familia</th>
                    <th className="py-2.5 px-3 text-right">Stock</th>
                    <th className="py-2.5 px-3 text-right">Costo Unit.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {repuestos.map((item) => {
                    const critico = item.stock <= item.stock_minimo;
                    return (
                      <tr
                        key={item.id}
                        className={
                          critico ? "bg-red-50/70" : "hover:bg-slate-100/70"
                        }
                      >
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                critico
                                  ? "bg-red-500 shadow-[0_0_6px_#EF4444]"
                                  : "bg-emerald-500 shadow-[0_0_6px_#10B981]"
                              }`}
                            />
                            {critico ? "BAJO MÍN." : "OK"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-slate-900">
                            {item.codigo}
                          </span>
                          <span className="block text-slate-700 font-medium">
                            {item.nombre}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {item.aplica_a}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          {item.stock} {item.unidad}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                          {formatCLP(item.costo_unitario)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-[#064E3B] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-emerald-300" />
                <h3 className="font-bold text-sm uppercase tracking-wider">
                  Abastecimiento y Creación de Repuestos
                </h3>
              </div>
            </div>

            <form onSubmit={handleBodegaSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-slate-200 p-1 rounded-md">
                <button
                  type="button"
                  onClick={() => setModoBodega("ingreso")}
                  className={`py-2 px-3 rounded text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    modoBodega === "ingreso"
                      ? "bg-[#0F172A] text-white"
                      : "text-slate-700 hover:bg-slate-300/60"
                  }`}
                >
                  Sumar Stock
                </button>
                <button
                  type="button"
                  onClick={() => setModoBodega("crear")}
                  className={`py-2 px-3 rounded text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    modoBodega === "crear"
                      ? "bg-[#0F172A] text-white"
                      : "text-slate-700 hover:bg-slate-300/60"
                  }`}
                >
                  Nuevo Repuesto
                </button>
              </div>

              {modoBodega === "ingreso" ? (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Seleccionar Repuesto
                    </label>
                    <select
                      value={repuestoIdSel}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        setRepuestoIdSel(id);
                        const found = repuestos.find((r) => r.id === id);
                        if (found) setNuevoCostoIngreso(found.costo_unitario);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
                    >
                      {repuestos.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.codigo} - {r.nombre} (Stock: {r.stock})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Cantidad a Ingresar
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={cantIngreso}
                        onChange={(e) =>
                          setCantIngreso(Math.max(1, Number(e.target.value)))
                        }
                        className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Nuevo Costo Unit. ($ CLP)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={nuevoCostoIngreso}
                        onChange={(e) =>
                          setNuevoCostoIngreso(
                            Math.max(0, Number(e.target.value))
                          )
                        }
                        className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm font-mono text-slate-900"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Código SKU
                      </label>
                      <input
                        type="text"
                        value={nuevoCodRep}
                        onChange={(e) => setNuevoCodRep(e.target.value)}
                        placeholder="Ej. REP-025"
                        className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm font-mono uppercase text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Familia / Aplica a
                      </label>
                      <select
                        value={nuevoAplicaA}
                        onChange={(e) => setNuevoAplicaA(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
                      >
                        {CATEGORIAS_REP.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Nombre Técnico del Repuesto
                    </label>
                    <input
                      type="text"
                      value={nuevoNomRep}
                      onChange={(e) => setNuevoNomRep(e.target.value)}
                      placeholder="Ej. Kit de sellos hidráulicos"
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                        Stock Inicial
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={nuevoStockRep}
                        onChange={(e) =>
                          setNuevoStockRep(Number(e.target.value))
                        }
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                        Stock Mín.
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={nuevoMinRep}
                        onChange={(e) => setNuevoMinRep(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                        Costo ($ CLP)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={nuevoCostoRep}
                        onChange={(e) =>
                          setNuevoCostoRep(Number(e.target.value))
                        }
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={savingBodega}
                className="w-full bg-[#065F46] hover:bg-[#047857] text-white font-bold py-2.5 px-4 rounded-md text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {savingBodega
                  ? "Actualizando Bodega..."
                  : "Guardar Movimiento en Bodega"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBTAB 4: ANALÍTICA DE FLOTA */}
      {activeSubTab === "analitica" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ranking de equipos con mayor gasto */}
          <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-[#0C4A6E] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-sky-300" />
                <h3 className="font-bold text-sm uppercase tracking-wider">
                  Ranking de Equipos con Mayor Gasto en Taller
                </h3>
              </div>
            </div>

            <div className="p-5 space-y-3">
              {rankingGastoPorEquipo.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Aún no se registran eventos con costos imputados.
                </p>
              ) : (
                rankingGastoPorEquipo.map((item, idx) => {
                  const maxGasto = rankingGastoPorEquipo[0]?.gasto || 1;
                  const pct = Math.min(
                    100,
                    Math.round((item.gasto / maxGasto) * 100)
                  );
                  return (
                    <div
                      key={item.codigo}
                      className="bg-white border border-slate-200 rounded-md p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-slate-800 text-white font-mono text-[11px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {item.codigo}
                          </span>
                          <span className="text-slate-600 font-medium">
                            {item.nombre}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-[#0C4A6E]">
                          {formatCLP(item.gasto)}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0284C7]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>{item.categoria}</span>
                        <span className="font-mono">
                          {item.eventos} intervenciones con costo
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Órdenes de trabajo por familia */}
          <div className="bg-[#F8FAFC] border border-slate-300 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-[#064E3B] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-emerald-300" />
                <h3 className="font-bold text-sm uppercase tracking-wider">
                  Volumen de Órdenes de Trabajo por Categoría
                </h3>
              </div>
            </div>

            <div className="p-5 space-y-3">
              {fallasPorCategoria.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No se registran OTs en el sistema.
                </p>
              ) : (
                fallasPorCategoria.map((cat) => (
                  <div
                    key={cat.categoria}
                    className="bg-white border border-slate-200 rounded-md p-3.5 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-sm text-slate-900 block">
                        {cat.categoria}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        Costo Asociado: {formatCLP(cat.costo)} CLP
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-1 rounded bg-sky-100 text-sky-900 border border-sky-300 font-mono text-xs font-bold">
                        {cat.ots} OTs
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
