import React, { useState, useEffect, useMemo } from "react";
import {
  PANAS_POR_CATEGORIA,
  DANOS_FISICOS,
  PAUTAS_MECANICAS,
  OT_ESTADOS_ABIERTOS,
  ESTADO_DISPONIBLE,
  ESTADO_EN_PANA,
  ESTADO_EN_PRESUPUESTO,
  getSemaforoKey,
  cleanSemaforoLabel,
  formatCLP,
  duracionLegible,
  type Equipo,
  type EventoHistorial,
  type Presupuesto,
  type OrdenTrabajo,
  type Repuesto,
  type OTRepuestoItem,
} from "../data/catalogs";
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Sliders,
  History,
  Cpu,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Package,
  Plus,
  Search,
  Radio,
  ShieldAlert,
  ClipboardCheck,
  Clock,
  Gauge,
  CalendarClock,
  Camera,
  Send,
  Lock,
  FileText,
  OctagonAlert,
  CheckSquare,
  Save,
} from "lucide-react";

interface EstacionTrabajoProps {
  equipos: Equipo[];
  equipoActivo: string;
  setEquipoActivo: (codigo: string) => void;
  presupuestos: Presupuesto[];
  ordenesTrabajo: OrdenTrabajo[];
  repuestos: Repuesto[];
  otRepuestos: OTRepuestoItem[];
  historial: EventoHistorial[];
  telefonoTaller: string;
  isJefe: boolean;
  onRefresh: (flashMsg?: {
    type: "success" | "warning" | "error";
    text: string;
  }) => Promise<void>;
  onNavigateJefatura: () => void;
}

export default function EstacionTrabajo({
  equipos,
  equipoActivo,
  setEquipoActivo,
  presupuestos,
  ordenesTrabajo,
  repuestos,
  otRepuestos,
  historial,
  telefonoTaller,
  isJefe,
  onRefresh,
  onNavigateJefatura,
}: EstacionTrabajoProps) {
  const [catFiltroTop, setCatFiltroTop] = useState<string>(
    "Todas las categorías"
  );
  const [textoBuscarTop, setTextoBuscarTop] = useState<string>("");
  const [activeSubTab, setActiveSubTab] = useState<
    "recepcion" | "taller" | "presupuesto" | "manual" | "historial"
  >("recepcion");
  const [copiedNfc, setCopiedNfc] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const categoriasDisp = useMemo(() => {
    const setCats = new Set(equipos.map((e) => e.categoria));
    return ["Todas las categorías", ...Array.from(setCats).sort()];
  }, [equipos]);

  const dfSelector = useMemo(() => {
    let list = equipos;
    if (catFiltroTop !== "Todas las categorías") {
      list = list.filter((e) => e.categoria === catFiltroTop);
    }
    if (textoBuscarTop.trim()) {
      const q = textoBuscarTop.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.codigo.toLowerCase().includes(q) ||
          e.nombre.toLowerCase().includes(q)
      );
    }
    return list.length > 0 ? list : equipos;
  }, [equipos, catFiltroTop, textoBuscarTop]);

  const sinCoincidenciasFiltro = useMemo(() => {
    if (catFiltroTop === "Todas las categorías" && !textoBuscarTop.trim())
      return false;
    let list = equipos;
    if (catFiltroTop !== "Todas las categorías") {
      list = list.filter((e) => e.categoria === catFiltroTop);
    }
    if (textoBuscarTop.trim()) {
      const q = textoBuscarTop.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.codigo.toLowerCase().includes(q) ||
          e.nombre.toLowerCase().includes(q)
      );
    }
    return list.length === 0;
  }, [equipos, catFiltroTop, textoBuscarTop]);

  const maq = useMemo(() => {
    return (
      equipos.find((e) => e.codigo === equipoActivo) ||
      dfSelector[0] ||
      equipos[0]
    );
  }, [equipos, equipoActivo, dfSelector]);

  useEffect(() => {
    if (maq && maq.codigo !== equipoActivo) {
      setEquipoActivo(maq.codigo);
    }
  }, [maq, equipoActivo, setEquipoActivo]);

  // --- ESTADOS DE FORMULARIO RECEPCIÓN (Tab 1) ---
  const [responsableRec, setResponsableRec] = useState("Encargado de Patio");
  const [usoNuevoDias, setUsoNuevoDias] = useState(3);
  const [nuevoHorometro, setNuevoHorometro] = useState(0);
  const [fotoNombre, setFotoNombre] = useState("");
  const [fotoBase64, setFotoBase64] = useState("");
  const [estadoLlegada, setEstadoLlegada] = useState<
    "OPERATIVA" | "EN_PANA" | "PRESUPUESTO"
  >("OPERATIVA");
  const [panasRec, setPanasRec] = useState<string[]>([]);
  const [danosRec, setDanosRec] = useState<string[]>([]);
  const [mostrarPanasEnDano, setMostrarPanasEnDano] = useState(false);
  const [otraPanaRec, setOtraPanaRec] = useState("");
  const [responsableDano, setResponsableDano] = useState("Por definir");
  const [prioridadDano, setPrioridadDano] = useState(
    "Alta (se necesita pronto)"
  );
  const [confirmaSinPana, setConfirmaSinPana] = useState(false);
  const [obsAdicionalRec, setObsAdicionalRec] = useState("");

  // --- ESTADOS DE FORMULARIO TALLER (Tab 2) ---
  const [tipoNuevaOt, setTipoNuevaOt] = useState<"CORRECTIVA" | "PREVENTIVA">(
    "CORRECTIVA"
  );
  const [nuevoEstadoOt, setNuevoEstadoOt] = useState<string>("ABIERTA");
  const [repSelId, setRepSelId] = useState<number>(0);
  const [cantRepSel, setCantRepSel] = useState<number>(1);
  const [diagExpanded, setDiagExpanded] = useState<boolean>(false);
  const [panasTallerMarcadas, setPanasTallerMarcadas] = useState<string[]>([]);
  const [otraPanaTaller, setOtraPanaTaller] = useState<string>("");
  const [tareasPautaMarcadas, setTareasPautaMarcadas] = useState<string[]>([]);
  const [mecanicoNom, setMecanicoNom] = useState<string>("Taller Central");
  const [costoRepExterno, setCostoRepExterno] = useState<number>(0);
  const [detalleOtTrabajo, setDetalleOtTrabajo] = useState<string>("");

  // --- ESTADOS ASISTENTE IA (Tab 2 derecha) ---
  const [consultaIa, setConsultaIa] = useState<string>("");
  const [loadingIa, setLoadingIa] = useState<boolean>(false);
  const [respuestaIa, setRespuestaIa] = useState<string>("");
  const [errorIa, setErrorIa] = useState<string>("");

  // --- ESTADOS SOLICITAR PRESUPUESTO (Tab 3) ---
  const [solicitantePres, setSolicitantePres] = useState("Jefe de Taller");
  const [prioridadPres, setPrioridadPres] = useState(
    "Alta (Equipo Bloqueado en Taller)"
  );
  const [destinatarioTipo, setDestinatarioTipo] = useState(
    "Por definir (En bandeja)"
  );
  const [destinatarioNombre, setDestinatarioNombre] = useState(
    "Pendiente por definir"
  );
  const [marcarEsperaPres, setMarcarEsperaPres] = useState(true);
  const [panasElegidasPres, setPanasElegidasPres] = useState<string[]>([]);
  const [otraPanaPres, setOtraPanaPres] = useState("");
  const [detalleRepuestosPres, setDetalleRepuestosPres] = useState("");
  const [cRepPres, setCRepPres] = useState(0);
  const [cMoPres, setCMoPres] = useState(0);
  const [cInsPres, setCInsPres] = useState(0);

  // --- ESTADOS AJUSTE MANUAL (Tab 4) ---
  const [estadoElegidoMan, setEstadoElegidoMan] = useState(
    "OPERATIVA (Disponible)"
  );
  const [usoManual, setUsoManual] = useState(0);
  const [horometroManual, setHorometroManual] = useState(0);
  const [notaManual, setNotaManual] = useState("");
  const [limpiarPanasMan, setLimpiarPanasMan] = useState(true);

  const resetFormsForMachine = (m: Equipo) => {
    setResponsableRec("Encargado de Patio");
    setUsoNuevoDias(3);
    setNuevoHorometro((Number(m.horometro_actual) || 0) + 12);
    setFotoNombre("");
    setFotoBase64("");
    setEstadoLlegada("OPERATIVA");
    setPanasRec([]);
    setDanosRec([]);
    setMostrarPanasEnDano(false);
    setOtraPanaRec("");
    setResponsableDano("Por definir");
    setPrioridadDano("Alta (se necesita pronto)");
    setConfirmaSinPana(false);
    setObsAdicionalRec("");

    const tienePana =
      Number(m.falla_activa) === 1 || m.estado_operativo === ESTADO_EN_PANA;
    setTipoNuevaOt(tienePana ? "CORRECTIVA" : "PREVENTIVA");

    const panasGuardadas = m.panas_reportadas
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    const catList = PANAS_POR_CATEGORIA[m.categoria] || [];
    setPanasTallerMarcadas(panasGuardadas.filter((p) => catList.includes(p)));
    const otrasGuardadas = panasGuardadas
      .filter(
        (p) =>
          (p.startsWith("Otra pana:") || p.startsWith("Otra:")) &&
          p.includes(":")
      )
      .map((p) => p.split(":", 2)[1].trim());
    setOtraPanaTaller(otrasGuardadas.join(", "));
    setDiagExpanded(Boolean(m.panas_reportadas.trim()));
    setTareasPautaMarcadas([]);
    setMecanicoNom("Taller Central");
    setCostoRepExterno(0);
    setDetalleOtTrabajo("");

    setSolicitantePres("Jefe de Taller");
    setPrioridadPres("Alta (Equipo Bloqueado en Taller)");
    setDestinatarioTipo("Por definir (En bandeja)");
    setDestinatarioNombre("Pendiente por definir");
    setMarcarEsperaPres(true);
    setPanasElegidasPres(panasGuardadas);
    setOtraPanaPres("");
    setDetalleRepuestosPres("");
    setCRepPres(0);
    setCMoPres(0);
    setCInsPres(0);

    setEstadoElegidoMan("OPERATIVA (Disponible)");
    setUsoManual(Number(m.uso_acumulado) || 0);
    setHorometroManual(Number(m.horometro_actual) || 0);
    setNotaManual(m.ultima_observacion || "");
    setLimpiarPanasMan(true);
  };

  useEffect(() => {
    if (maq) {
      resetFormsForMachine(maq);
      setRespuestaIa("");
      setErrorIa("");
      setConsultaIa("");
    }
  }, [
    maq?.codigo,
    maq?.fecha_actualizacion,
    maq?.estado_operativo,
    maq?.panas_reportadas,
    maq?.uso_acumulado,
  ]);

  const otActual = useMemo(() => {
    if (!maq) return undefined;
    return ordenesTrabajo.find(
      (o) => o.codigo_equipo === maq.codigo && o.estado !== "CERRADA"
    );
  }, [ordenesTrabajo, maq]);

  useEffect(() => {
    if (otActual) {
      setNuevoEstadoOt(otActual.estado);
    }
  }, [otActual]);

  const repuestosOrdenados = useMemo(() => {
    if (!maq) return repuestos;
    const relevantes = repuestos.filter(
      (r) => r.aplica_a === maq.categoria || r.aplica_a === "General"
    );
    const otros = repuestos.filter(
      (r) => r.aplica_a !== maq.categoria && r.aplica_a !== "General"
    );
    return [...relevantes, ...otros];
  }, [repuestos, maq]);

  useEffect(() => {
    if (repuestosOrdenados.length > 0 && !repSelId) {
      setRepSelId(repuestosOrdenados[0].id);
    }
  }, [repuestosOrdenados, repSelId]);

  if (!maq) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-amber-950 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        <span>
          No hay máquinas registradas en la base de datos. Dirígete al módulo{" "}
          <strong>03. Enrolar Máquina</strong>.
        </span>
      </div>
    );
  }

  const catMaq = maq.categoria;
  const unidadUso = maq.tipo_medicion === "DIAS" ? "días" : "horas";
  const porcentajeDesgaste =
    maq.limite_mantencion > 0
      ? Math.min(
          Math.floor((maq.uso_acumulado / maq.limite_mantencion) * 100),
          100
        )
      : 0;
  const statusKey = getSemaforoKey(maq.semaforo);
  const estadoLimpio = cleanSemaforoLabel(maq.semaforo);

  // Paleta de tarjeta según estado operativo
  const statusTheme = {
    OPERATIVA: {
      headerBg: "bg-[#064E3B] text-white border-[#047857]",
      cardBg: "bg-emerald-50/90 border-emerald-400 text-emerald-950",
      led: "bg-emerald-400 shadow-[0_0_8px_#34d399]",
      badgeBg: "bg-emerald-900/60 text-emerald-100 border-emerald-500/40",
      icon: CheckCircle2,
    },
    MANTENCION: {
      headerBg: "bg-[#78350F] text-white border-[#B45309]",
      cardBg: "bg-amber-50/90 border-amber-400 text-amber-950",
      led: "bg-amber-400 shadow-[0_0_8px_#fbbf24]",
      badgeBg: "bg-amber-900/60 text-amber-100 border-amber-500/40",
      icon: AlertTriangle,
    },
    PANA: {
      headerBg: "bg-[#7F1D1D] text-white border-[#B91C1C]",
      cardBg: "bg-red-50/90 border-red-400 text-red-950",
      led: "bg-red-500 shadow-[0_0_8px_#ef4444]",
      badgeBg: "bg-red-950/70 text-red-100 border-red-500/40",
      icon: OctagonAlert,
    },
    PRESUPUESTO: {
      headerBg: "bg-[#4C1D95] text-white border-[#6D28D9]",
      cardBg: "bg-purple-50/90 border-purple-400 text-purple-950",
      led: "bg-purple-400 shadow-[0_0_8px_#c084fc]",
      badgeBg: "bg-purple-950/70 text-purple-100 border-purple-500/40",
      icon: FileSpreadsheet,
    },
  }[statusKey];

  const StatusIcon = statusTheme.icon;

  const listaPanasCat =
    PANAS_POR_CATEGORIA[catMaq] ||
    PANAS_POR_CATEGORIA["Maquinaria con Horómetro"];
  const pautaActual =
    PAUTAS_MECANICAS[catMaq] || PAUTAS_MECANICAS["Maquinaria con Horómetro"];

  const tieneFallaAbierta =
    Number(maq.falla_activa) === 1 ||
    maq.estado_operativo !== ESTADO_DISPONIBLE;
  const bloqueaGuardarOperativa =
    estadoLlegada === "OPERATIVA" && tieneFallaAbierta && !confirmaSinPana;

  const tienePanaTaller =
    Number(maq.falla_activa) === 1 || maq.estado_operativo === ESTADO_EN_PANA;
  const esperaPresupuestoTaller =
    maq.estado_operativo === ESTADO_EN_PRESUPUESTO;
  const pautaCompleta = tareasPautaMarcadas.length === pautaActual.length;

  const repuestosDeEstaOt = otActual
    ? otRepuestos.filter((r) => r.ot_id === otActual.id)
    : [];
  const totalRepuestosOt = repuestosDeEstaOt.reduce(
    (acc, r) => acc + r.subtotal,
    0
  );

  const presupuestosMaq = presupuestos.filter(
    (p) => p.codigo_equipo === maq.codigo
  );
  const historialMaq = historial.filter((h) => h.codigo_equipo === maq.codigo);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFotoNombre("");
      setFotoBase64("");
      return;
    }
    setFotoNombre(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFotoBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCopyNfcLink = () => {
    const url = `${window.location.origin}/?equipo=${encodeURIComponent(
      maq.codigo
    )}`;
    navigator.clipboard.writeText(url);
    setCopiedNfc(true);
    setTimeout(() => setCopiedNfc(false), 2000);
  };

  const handlePanaFulminante = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/pana-fulminante`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.ok) {
        await onRefresh({ type: "error", text: data.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuardarRecepcion = async () => {
    setSubmitting(true);
    try {
      const usoSumar =
        maq.tipo_medicion === "DIAS"
          ? usoNuevoDias
          : Math.max(0, nuevoHorometro - maq.horometro_actual);

      const res = await fetch(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/recepcion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            responsable_rec: responsableRec,
            uso_nuevo: usoSumar,
            nuevo_horometro:
              maq.tipo_medicion === "HORAS"
                ? nuevoHorometro
                : maq.horometro_actual,
            estado_llegada: estadoLlegada,
            panas_seleccionadas:
              estadoLlegada === "OPERATIVA" ? [] : panasRec,
            danos_seleccionados:
              estadoLlegada === "PRESUPUESTO" ? danosRec : [],
            otra_pana: estadoLlegada === "OPERATIVA" ? "" : otraPanaRec,
            responsable_dano: responsableDano,
            prioridad_dano: prioridadDano,
            obs_adicional: obsAdicionalRec,
            foto_base64: fotoBase64 || undefined,
            foto_nombre: fotoNombre || undefined,
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        await onRefresh({ type: "success", text: data.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAbrirOt = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/ot/abrir`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: tipoNuevaOt }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        await onRefresh({ type: "success", text: data.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleActualizarEstadoOt = async () => {
    if (!otActual) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/ot/${otActual.id}/estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nuevo_estado: nuevoEstadoOt }),
      });
      const data = await res.json();
      if (data.ok) {
        await onRefresh({ type: "success", text: data.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAgregarRepuestoOt = async () => {
    if (!otActual || !repSelId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/ot/${otActual.id}/repuesto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repuesto_id: repSelId,
          cantidad: cantRepSel,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        await onRefresh({
          type: "error",
          text: data.error || "Error al agregar repuesto.",
        });
      } else {
        await onRefresh({
          type: data.bajoMinimo ? "warning" : "success",
          text: data.message,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleActualizarDiagnostico = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/diagnostico`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            panas_taller: panasTallerMarcadas,
            otra_pana_taller: otraPanaTaller,
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        await onRefresh({ type: "success", text: data.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRepararEquipo = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/reparar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mecanico: mecanicoNom,
            costo_rep: costoRepExterno,
            detalle_ot: detalleOtTrabajo,
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        await onRefresh({ type: "success", text: data.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompletarPauta = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/pauta`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mecanico: mecanicoNom,
            costo_rep: costoRepExterno,
            detalle_ot: detalleOtTrabajo,
            items_completados: tareasPautaMarcadas.length,
            total_items: pautaActual.length,
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        await onRefresh({
          type: data.warning ? "warning" : "success",
          text: data.message,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConsultarIa = async (modo: "diagnosticar" | "pauta") => {
    setLoadingIa(true);
    setErrorIa("");
    try {
      const res = await fetch("/api/gemini/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: maq.codigo,
          modo,
          consulta: consultaIa,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorIa(data.error || "Error al consultar el asistente.");
      } else {
        setRespuestaIa(data.text);
      }
    } catch (e: any) {
      setErrorIa(e?.message || "Error de conexión.");
    } finally {
      setLoadingIa(false);
    }
  };

  const handleCrearPresupuesto = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/presupuesto`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            solicitante: solicitantePres,
            prioridad: prioridadPres,
            destinatario_tipo: destinatarioTipo,
            destinatario_nombre: destinatarioNombre,
            marcar_espera_pres: marcarEsperaPres,
            panas_elegidas: panasElegidasPres,
            otra_pana: otraPanaPres,
            detalle_trabajos: detalleRepuestosPres,
            costo_repuestos: cRepPres,
            costo_mano_obra: cMoPres,
            costo_insumos: cInsPres,
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        await onRefresh({ type: "success", text: data.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAplicarAjusteManual = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/equipos/${encodeURIComponent(maq.codigo)}/ajuste-manual`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estado_elegido: estadoElegidoMan,
            uso_manual: usoManual,
            horometro_manual: horometroManual,
            nota_manual: notaManual,
            limpiar_panas: limpiarPanasMan,
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        await onRefresh({ type: "success", text: data.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const mensajeWsp = `URGENTE: El equipo ${maq.codigo} (${maq.nombre}) sufrio una PANA FULMINANTE en terreno.`;
  const urlWhatsapp = telefonoTaller
    ? `https://wa.me/${telefonoTaller}?text=${encodeURIComponent(mensajeWsp)}`
    : "";

  const opcionesPanasPresupuesto = Array.from(
    new Set([
      ...listaPanasCat,
      ...maq.panas_reportadas
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean),
    ])
  );
  const totalPresCalc =
    (Number(cRepPres) || 0) + (Number(cMoPres) || 0) + (Number(cInsPres) || 0);

  return (
    <div className="space-y-6">
      {/* PASO 1: PANEL DE SELECCIÓN E IDENTIFICACIÓN NFC */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
        <div className="bg-[#1E293B] text-white px-5 py-3 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-[#38BDF8]" />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Paso 1 · Selección e Identificación de Unidad (Tag NFC)
            </h3>
          </div>
          <span className="text-xs text-slate-300 font-mono">
            {dfSelector.length.toLocaleString("es-CL")} unidades disponibles
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50/60">
          <div className="md:col-span-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              01. Categoría Técnica
            </label>
            <select
              value={catFiltroTop}
              onChange={(e) => setCatFiltroTop(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#0284C7] focus:outline-none"
            >
              {categoriasDisp.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              02. Filtro por Código / Modelo
            </label>
            <input
              type="text"
              value={textoBuscarTop}
              onChange={(e) => setTextoBuscarTop(e.target.value)}
              placeholder="Ej: RV-0001, Honda, Placa..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
            />
          </div>

          <div className="md:col-span-6">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              03. Unidad Activa en Estación
            </label>
            <select
              value={maq.codigo}
              onChange={(e) => setEquipoActivo(e.target.value)}
              className="w-full rounded-lg border-2 border-[#0284C7] bg-white px-3 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
            >
              {dfSelector.slice(0, 500).map((item) => (
                <option key={item.codigo} value={item.codigo}>
                  {item.codigo} — {item.nombre} [{item.categoria}] ·{" "}
                  {cleanSemaforoLabel(item.semaforo)}
                </option>
              ))}
            </select>
            {dfSelector.length > 500 && (
              <p className="text-[11px] text-slate-500 mt-1">
                Mostrando primeros 500 de{" "}
                {dfSelector.length.toLocaleString("es-CL")} equipos. Usa el
                buscador para filtrar.
              </p>
            )}
          </div>
        </div>

        {sinCoincidenciasFiltro && (
          <div className="mx-5 mb-4 rounded-lg bg-amber-50 border border-amber-300 px-3.5 py-2 text-xs font-semibold text-amber-900">
            Ninguna máquina coincide con ese criterio. Mostrando padrón completo.
          </div>
        )}
      </div>

      {/* FICHA PRINCIPAL DE LA MÁQUINA COLOREADA POR ESTADO */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
        {/* CABECERA DINÁMICA DE COLOR SEGÚN ESTADO OPERATIVO */}
        <div
          className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 ${statusTheme.headerBg}`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded bg-black/25 font-mono text-sm md:text-base font-bold tracking-tight border border-white/15">
                {maq.codigo}
              </span>
              <h2 className="text-lg md:text-xl font-extrabold tracking-tight">
                {maq.nombre}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/85">
              <span>
                Categoría: <strong className="text-white">{catMaq}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Ubicación Tag NFC:{" "}
                <strong className="text-white">{maq.ubicacion_nfc}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                 Parámetro:{" "}
                <code className="font-mono bg-black/25 px-1.5 py-0.5 rounded text-white">
                  ?equipo={maq.codigo}
                </code>
                <button
                  type="button"
                  onClick={handleCopyNfcLink}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-white font-semibold transition-colors cursor-pointer"
                >
                  {copiedNfc ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar URL NFC</span>
                    </>
                  )}
                </button>
              </span>
            </div>
          </div>

          {/* INDICADOR LED DE ESTADO EN CABECERA */}
          <div
            className={`flex items-center gap-2.5 px-4 py-2 rounded-lg border ${statusTheme.badgeBg}`}
          >
            <span className={`w-3 h-3 rounded-full ${statusTheme.led}`} />
            <StatusIcon className="w-4 h-4 shrink-0" />
            <span className="text-xs md:text-sm font-extrabold tracking-wider uppercase">
              {estadoLimpio}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* PANEL DE OBSERVACIÓN Y PANAS ACTIVAS COLOREADO */}
          <div
            className={`rounded-xl border-2 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${statusTheme.cardBg}`}
          >
            <div className="space-y-1">
              <div className="text-xs font-extrabold uppercase tracking-wider opacity-75">
                Reporte de Condición Operativa Actual
              </div>
              <div className="text-sm font-bold">
                {maq.ultima_observacion || "Sin observaciones adicionales."}
              </div>
            </div>
            {maq.panas_reportadas.trim() && (
              <div className="rounded-lg bg-red-900 text-white px-3.5 py-2 text-xs font-mono">
                <span className="font-bold uppercase tracking-wider text-red-200 block text-[10px]">
                  Fallas Activas Registradas:
                </span>
                {maq.panas_reportadas}
              </div>
            )}
          </div>

          {/* 4 TARJETAS DE MÉTRICAS CON CABECERAS DE COLOR CORPORATIVO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
              <div className="bg-[#0C4A6E] text-white px-4 py-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Uso Acumulado Ciclo
                </span>
                <Clock className="w-3.5 h-3.5 text-sky-300" />
              </div>
              <div className="p-4">
                <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                  {maq.uso_acumulado} {unidadUso}
                </div>
                <div className="text-xs font-semibold text-[#0369A1] mt-1">
                  Límite Mantención: {maq.limite_mantencion} {unidadUso}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
              <div className="bg-[#064E3B] text-white px-4 py-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Desgaste Preventivo
                </span>
                <Gauge className="w-3.5 h-3.5 text-emerald-300" />
              </div>
              <div className="p-4">
                <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                  {porcentajeDesgaste}%
                </div>
                <div className="text-xs font-semibold text-[#047857] mt-1">
                  Índice sobre ciclo preventivo
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
              <div className="bg-[#1E293B] text-white px-4 py-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Horómetro Motor
                </span>
                <Radio className="w-3.5 h-3.5 text-slate-300" />
              </div>
              <div className="p-4">
                <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                  {maq.tipo_medicion === "HORAS"
                    ? `${maq.horometro_actual} hrs`
                    : "Control por Días"}
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">
                  Régimen: {maq.tipo_medicion}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
              <div className="bg-[#334155] text-white px-4 py-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Último Movimiento
                </span>
                <CalendarClock className="w-3.5 h-3.5 text-slate-300" />
              </div>
              <div className="p-4">
                <div className="text-xl font-black text-slate-900 font-mono tabular-nums">
                  {maq.fecha_actualizacion}
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">
                  Zona Horaria Santiago
                </div>
              </div>
            </div>
          </div>

          {/* BARRA DE PROGRESO DE DESGASTE */}
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-700">
              <span>
                PROGRESO DE DESGASTE HACIA PAUTA PREVENTIVA ({porcentajeDesgaste}
                %)
              </span>
              <span className="font-mono tabular-nums">
                {maq.uso_acumulado} / {maq.limite_mantencion} {unidadUso}
              </span>
            </div>
            <div className="h-3 w-full rounded-md bg-slate-300 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  porcentajeDesgaste >= 100
                    ? "bg-amber-600"
                    : porcentajeDesgaste >= 80
                    ? "bg-[#0284C7]"
                    : "bg-[#047857]"
                }`}
                style={{ width: `${porcentajeDesgaste}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* PASO 2: PESTAÑAS DE OPERACIÓN */}
      <div className="space-y-4">
        <div className="bg-[#0F172A] p-2 rounded-xl border border-slate-800 flex flex-wrap gap-2 shadow-xs">
          {[
            {
              id: "recepcion",
              label: "01. Recepción e Ingreso de Fallas",
              icon: ClipboardCheck,
            },
            {
              id: "taller",
              label: "02. Taller Mecánico, OT e IA",
              icon: Wrench,
            },
            {
              id: "presupuesto",
              label: "03. Solicitar Presupuesto",
              icon: FileSpreadsheet,
            },
            {
              id: "manual",
              label: "04. Forzar Estado / Ajuste",
              icon: Sliders,
            },
            {
              id: "historial",
              label: "05. Historial del Equipo",
              icon: History,
            },
          ].map((t) => {
            const active = activeSubTab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveSubTab(t.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? "bg-linear-to-r from-[#065F46] to-[#0284C7] text-white shadow-xs border border-sky-400/30"
                    : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ============================================================
            SUB-TAB 1: RECEPCIÓN E INGRESO DE PANAS
           ============================================================ */}
        {activeSubTab === "recepcion" && (
          <div className="space-y-5">
            {/* BLOQUEO DE EMERGENCIA EN TERRENO */}
            <div className="bg-red-950/95 border-2 border-red-700 rounded-xl p-5 text-white shadow-xs">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-red-200 mb-3">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>Protocolo de Emergencia en Terreno</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className="md:col-span-7">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handlePanaFulminante}
                    className="btn-fulminante w-full py-4 px-4 text-sm md:text-base flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <OctagonAlert className="w-5 h-5 shrink-0" />
                    <span>DECLARAR PANA FULMINANTE Y BLOQUEAR EQUIPO</span>
                  </button>
                </div>
                <div className="md:col-span-5">
                  {urlWhatsapp ? (
                    <a
                      href={urlWhatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#047857] hover:bg-[#065F46] border border-emerald-400/30 text-white font-bold py-4 px-4 text-sm shadow-xs transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Notificar por WhatsApp al Taller</span>
                    </a>
                  ) : (
                    <p className="text-xs text-red-200">
                      Configura TELEFONO_TALLER para habilitar aviso directo.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* FORMULARIO DE RECEPCIÓN EN PATIO */}
            <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-[#064E3B] text-white px-6 py-3.5 border-b border-emerald-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-emerald-300" />
                  <h4 className="text-sm font-bold uppercase tracking-wider">
                    Formulario de Recepción en Patio — {maq.codigo}
                  </h4>
                </div>
                <span className="text-xs text-emerald-200">
                  Registro de Uso y Estado de Llegada
                </span>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Recibido por:
                    </label>
                    <input
                      type="text"
                      value={responsableRec}
                      onChange={(e) => setResponsableRec(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    {maq.tipo_medicion === "DIAS" ? (
                      <>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Días de uso a sumar:
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={usoNuevoDias}
                          onChange={(e) =>
                            setUsoNuevoDias(
                              Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                        />
                      </>
                    ) : (
                      <>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Horómetro llegada (Ant: {maq.horometro_actual} hrs):
                        </label>
                        <input
                          type="number"
                          min={maq.horometro_actual}
                          value={nuevoHorometro}
                          onChange={(e) =>
                            setNuevoHorometro(
                              Math.max(
                                maq.horometro_actual,
                                parseInt(e.target.value) || 0
                              )
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                        />
                      </>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-slate-600" />
                      <span>Evidencia Fotográfica (Opcional):</span>
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={handlePhotoUpload}
                      className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300"
                    />
                    {fotoNombre && (
                      <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                        Archivo adjunto: {fotoNombre}
                      </p>
                    )}
                  </div>
                </div>

                {/* CONDICIÓN DE LLEGADA */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Condición de ingreso del equipo:
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      {
                        id: "OPERATIVA",
                        label: "OPERATIVA (Sin Fallas)",
                        led: "bg-emerald-500",
                        activeStyle:
                          "border-emerald-600 bg-emerald-50 text-emerald-950",
                      },
                      {
                        id: "EN_PANA",
                        label: "EN PANA (Bloquear para Taller)",
                        led: "bg-red-600",
                        activeStyle: "border-red-600 bg-red-50 text-red-950",
                      },
                      {
                        id: "PRESUPUESTO",
                        label: "CON DAÑO (Requiere Presupuesto)",
                        led: "bg-purple-600",
                        activeStyle:
                          "border-purple-600 bg-purple-50 text-purple-950",
                      },
                    ].map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer text-xs md:text-sm font-bold transition-all ${
                          estadoLlegada === opt.id
                            ? opt.activeStyle
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <input
                          type="radio"
                          name="estadoLlegada"
                          checked={estadoLlegada === opt.id}
                          onChange={() => setEstadoLlegada(opt.id as any)}
                          className="sr-only"
                        />
                        <span
                          className={`w-3 h-3 rounded-full shrink-0 ${opt.led}`}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* CAUSAS SEGÚN CONDICIÓN */}
                {estadoLlegada === "EN_PANA" && (
                  <div className="rounded-xl border-2 border-red-300 bg-red-50/40 p-4 space-y-3">
                    <div>
                      <h5 className="text-sm font-bold text-red-950 uppercase tracking-wide">
                        Causas Técnicas de Falla — {catMaq}
                      </h5>
                      <p className="text-xs text-red-800">
                        Selecciona las anomalías reportadas. La unidad quedará
                        retenida en Taller con OT Correctiva.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {listaPanasCat.map((pana) => {
                        const checked = panasRec.includes(pana);
                        return (
                          <label
                            key={pana}
                            className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-red-200 cursor-pointer text-xs text-slate-800 hover:border-red-400"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked)
                                  setPanasRec([...panasRec, pana]);
                                else
                                  setPanasRec(
                                    panasRec.filter((item) => item !== pana)
                                  );
                              }}
                              className="mt-0.5 accent-red-700"
                            />
                            <span>{pana}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Otra falla específica no listada:
                      </label>
                      <input
                        type="text"
                        value={otraPanaRec}
                        onChange={(e) => setOtraPanaRec(e.target.value)}
                        placeholder="Ej: ruido en rodamiento, corte irregular..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}

                {estadoLlegada === "PRESUPUESTO" && (
                  <div className="rounded-xl border-2 border-purple-300 bg-purple-50/40 p-4 space-y-4">
                    <div>
                      <h5 className="text-sm font-bold text-purple-950 uppercase tracking-wide">
                        Daños Físicos o Siniestros Detectados
                      </h5>
                      <p className="text-xs text-purple-800">
                        La unidad quedará retenida en espera de evaluación de
                        presupuesto.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {DANOS_FISICOS.map((dano) => {
                        const checked = danosRec.includes(dano);
                        return (
                          <label
                            key={dano}
                            className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-purple-200 cursor-pointer text-xs text-slate-800 hover:border-purple-400"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked)
                                  setDanosRec([...danosRec, dano]);
                                else
                                  setDanosRec(
                                    danosRec.filter((item) => item !== dano)
                                  );
                              }}
                              className="mt-0.5 accent-purple-700"
                            />
                            <span>{dano}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="rounded-lg border border-purple-200 bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setMostrarPanasEnDano(!mostrarPanasEnDano)
                        }
                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                      >
                        <span>
                          Asociar también fallas mecánicas de {catMaq}
                        </span>
                        {mostrarPanasEnDano ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {mostrarPanasEnDano && (
                        <div className="p-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {listaPanasCat.map((pana) => {
                            const checked = panasRec.includes(pana);
                            return (
                              <label
                                key={pana}
                                className="flex items-start gap-2 p-2 rounded border border-slate-200 text-xs cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    if (e.target.checked)
                                      setPanasRec([...panasRec, pana]);
                                    else
                                      setPanasRec(
                                        panasRec.filter((item) => item !== pana)
                                      );
                                  }}
                                  className="mt-0.5 accent-purple-700"
                                />
                                <span>{pana}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Otro daño o componente faltante:
                      </label>
                      <input
                        type="text"
                        value={otraPanaRec}
                        onChange={(e) => setOtraPanaRec(e.target.value)}
                        placeholder="Ej: carcasa trizada, llave portadisco faltante..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Responsabilidad del daño:
                        </label>
                        <select
                          value={responsableDano}
                          onChange={(e) => setResponsableDano(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          <option>Por definir</option>
                          <option>Cliente (daño en faena)</option>
                          <option>Desgaste normal (Rental)</option>
                          <option>Garantía de proveedor</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Prioridad de resolución:
                        </label>
                        <select
                          value={prioridadDano}
                          onChange={(e) => setPrioridadDano(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                          <option>Alta (se necesita pronto)</option>
                          <option>Media</option>
                          <option>Baja</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {estadoLlegada === "OPERATIVA" && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-300 px-4 py-3 text-xs md:text-sm text-emerald-950 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>
                      Recepción estándar: el equipo retorna a disponibilidad en
                      patio sumando el uso del ciclo.
                    </span>
                  </div>
                )}

                {estadoLlegada === "OPERATIVA" && tieneFallaAbierta && (
                  <div className="rounded-xl bg-amber-50 border-2 border-amber-400 p-4 space-y-2">
                    <p className="text-xs md:text-sm text-amber-950 font-medium">
                      Atención: Esta unidad registra una falla activa (
                      <em>{maq.panas_reportadas || maq.ultima_observacion}</em>
                      ). Recibirla como operativa cerrará la falla sin pasar por
                      Taller.
                    </p>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-amber-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmaSinPana}
                        onChange={(e) => setConfirmaSinPana(e.target.checked)}
                        className="accent-amber-700"
                      />
                      <span>
                        Confirmo técnicamente que la falla ya no existe
                      </span>
                    </label>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Observaciones generales de recepción:
                  </label>
                  <textarea
                    rows={2}
                    value={obsAdicionalRec}
                    onChange={(e) => setObsAdicionalRec(e.target.value)}
                    placeholder="Estado de limpieza, accesorios entregados, comentarios de faena..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="button"
                  disabled={submitting || bloqueaGuardarOperativa}
                  onClick={handleGuardarRecepcion}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#065F46] hover:bg-[#047857] disabled:bg-slate-300 text-white font-bold py-3 px-4 text-sm shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Registrar Recepción y Actualizar Estado</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            SUB-TAB 2: TALLER MECÁNICO Y PAUTA + IA
           ============================================================ */}
        {activeSubTab === "taller" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* COLUMNA IZQUIERDA: OT + DIAGNÓSTICO + PAUTA */}
            <div className="lg:col-span-7 space-y-5">
              {/* BLOQUE ORDEN DE TRABAJO */}
              <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-[#0C4A6E] text-white px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-sky-300" />
                    <h5 className="text-sm font-bold uppercase tracking-wider">
                      Gestión de Orden de Trabajo (OT)
                    </h5>
                  </div>
                  {otActual && (
                    <span className="px-2.5 py-0.5 rounded bg-sky-950 text-sky-200 font-mono text-xs font-bold border border-sky-700">
                      {otActual.folio} · {otActual.tipo}
                    </span>
                  )}
                </div>

                <div className="p-5 space-y-4">
                  {!otActual ? (
                    <>
                      <p className="text-xs text-slate-600">
                        Sin Orden de Trabajo abierta. Se genera automáticamente
                        al ingresar en pana o puede abrirse manualmente para
                        mantención.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select
                          value={tipoNuevaOt}
                          onChange={(e) =>
                            setTipoNuevaOt(
                              e.target.value as "CORRECTIVA" | "PREVENTIVA"
                            )
                          }
                          className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold"
                        >
                          <option value="CORRECTIVA">CORRECTIVA</option>
                          <option value="PREVENTIVA">PREVENTIVA</option>
                        </select>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={handleAbrirOt}
                          className="flex items-center justify-center gap-2 rounded-lg bg-[#0369A1] hover:bg-[#0284C7] text-white font-bold py-2.5 px-4 text-sm cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Abrir Orden de Trabajo</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-lg bg-slate-100 border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-slate-700">
                          Abierta el{" "}
                          <strong className="font-mono">
                            {otActual.fecha_apertura}
                          </strong>{" "}
                          — {otActual.descripcion}
                        </div>
                        <span className="text-xs font-bold text-[#0369A1] font-mono">
                          Tiempo en taller:{" "}
                          {duracionLegible(otActual.fecha_apertura)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className="sm:col-span-7">
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                            Estado de la OT:
                          </label>
                          <select
                            value={nuevoEstadoOt}
                            onChange={(e) => setNuevoEstadoOt(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                          >
                            {OT_ESTADOS_ABIERTOS.map((est) => (
                              <option key={est} value={est}>
                                {est}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-5">
                          <button
                            type="button"
                            disabled={
                              submitting || nuevoEstadoOt === otActual.estado
                            }
                            onClick={handleActualizarEstadoOt}
                            className="w-full rounded-lg bg-[#1E293B] hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2 px-4 text-sm cursor-pointer"
                          >
                            Actualizar Estado OT
                          </button>
                        </div>
                      </div>

                      {/* REPUESTOS USADOS EN ESTA OT */}
                      <div className="pt-3 border-t border-slate-200 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
                          <Package className="w-4 h-4 text-[#0369A1]" />
                          <span>Repuestos Cargados a esta OT</span>
                        </div>
                        {repuestosDeEstaOt.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            Sin repuestos imputados desde bodega.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            <div className="overflow-x-auto rounded-lg border border-slate-200">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                                  <tr>
                                    <th className="py-2 px-3">Código</th>
                                    <th className="py-2 px-3">Repuesto</th>
                                    <th className="py-2 px-3 text-right">
                                      Cant.
                                    </th>
                                    <th className="py-2 px-3 text-right">
                                      Unitario
                                    </th>
                                    <th className="py-2 px-3 text-right">
                                      Subtotal
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {repuestosDeEstaOt.map((item) => (
                                    <tr key={item.id}>
                                      <td className="py-2 px-3 font-mono font-semibold">
                                        {item.codigo}
                                      </td>
                                      <td className="py-2 px-3">
                                        {item.nombre}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                                        {item.cantidad} {item.unidad}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                                        {formatCLP(item.costo_unitario)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono font-bold tabular-nums">
                                        {formatCLP(item.subtotal)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <p className="text-xs text-slate-800 font-semibold">
                              Subtotal repuestos inventario:{" "}
                              <strong className="font-mono text-[#0369A1]">
                                {formatCLP(totalRepuestosOt)} CLP
                              </strong>
                            </p>
                          </div>
                        )}

                        {repuestosOrdenados.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1">
                            <div className="sm:col-span-7">
                              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                                Imputar Repuesto de Bodega:
                              </label>
                              <select
                                value={repSelId}
                                onChange={(e) =>
                                  setRepSelId(Number(e.target.value))
                                }
                                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
                              >
                                {repuestosOrdenados.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.stock <= r.stock_minimo
                                      ? "[STOCK BAJO] "
                                      : ""}
                                    {r.nombre} — stock {r.stock} {r.unidad} (
                                    {formatCLP(r.costo_unitario)})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                                Cant.:
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={cantRepSel}
                                onChange={(e) =>
                                  setCantRepSel(
                                    Math.max(1, parseInt(e.target.value) || 1)
                                  )
                                }
                                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono tabular-nums"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={handleAgregarRepuestoOt}
                                className="w-full rounded-lg bg-[#0369A1] hover:bg-[#0284C7] text-white font-bold py-2 px-3 text-xs cursor-pointer"
                              >
                                Cargar a OT
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* DIAGNÓSTICO Y PAUTA DE TALLER */}
              <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-[#064E3B] text-white px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-emerald-300" />
                    <h4 className="text-sm font-bold uppercase tracking-wider">
                      Diagnóstico y Pauta Mecánica — {catMaq}
                    </h4>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* EXPANDER DIAGNÓSTICO DE PANAS */}
                  <div className="rounded-xl border border-slate-300 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setDiagExpanded(!diagExpanded)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 hover:bg-slate-200/70 text-xs md:text-sm font-bold text-slate-800 cursor-pointer"
                    >
                      <span>
                        Diagnosticar / Modificar Fallas Detectadas en Desarme
                      </span>
                      {diagExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    {diagExpanded && (
                      <div className="p-4 space-y-3 bg-white border-t border-slate-200">
                        <p className="text-xs text-slate-600">
                          Fallas técnicas catalogadas para{" "}
                          <strong>{catMaq}</strong>:
                        </p>
                        <div className="space-y-2">
                          {listaPanasCat.map((pana) => {
                            const checked = panasTallerMarcadas.includes(pana);
                            return (
                              <label
                                key={pana}
                                className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    if (e.target.checked)
                                      setPanasTallerMarcadas([
                                        ...panasTallerMarcadas,
                                        pana,
                                      ]);
                                    else
                                      setPanasTallerMarcadas(
                                        panasTallerMarcadas.filter(
                                          (p) => p !== pana
                                        )
                                      );
                                  }}
                                  className="mt-0.5 accent-[#0369A1]"
                                />
                                <span>{pana}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Otra falla detectada en banco:
                          </label>
                          <input
                            type="text"
                            value={otraPanaTaller}
                            onChange={(e) => setOtraPanaTaller(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={handleActualizarDiagnostico}
                          className="w-full rounded-lg bg-[#1E293B] hover:bg-slate-800 text-white font-bold py-2.5 px-4 text-xs cursor-pointer"
                        >
                          Actualizar Diagnóstico de Fallas (Sin liberar unidad)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* CHECKLIST DE MANTENCIÓN PREVENTIVA */}
                  <div className="space-y-2.5">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-[#047857]" />
                      <span>
                        Pauta de Mantención Preventiva ({catMaq}) —{" "}
                        {tareasPautaMarcadas.length}/{pautaActual.length}
                      </span>
                    </h5>
                    <div className="space-y-2">
                      {pautaActual.map((tarea) => {
                        const checked = tareasPautaMarcadas.includes(tarea);
                        return (
                          <label
                            key={tarea}
                            className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                              checked
                                ? "bg-emerald-50 border-emerald-400 text-emerald-950 font-semibold"
                                : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked)
                                  setTareasPautaMarcadas([
                                    ...tareasPautaMarcadas,
                                    tarea,
                                  ]);
                                else
                                  setTareasPautaMarcadas(
                                    tareasPautaMarcadas.filter(
                                      (t) => t !== tarea
                                    )
                                  );
                              }}
                              className="mt-0.5 accent-[#047857]"
                            />
                            <span>{tarea}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <hr className="border-slate-200" />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Mecánico ejecutante:
                        </label>
                        <input
                          type="text"
                          value={mecanicoNom}
                          onChange={(e) => setMecanicoNom(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Otros costos externos ($ CLP):
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={5000}
                          value={costoRepExterno}
                          onChange={(e) =>
                            setCostoRepExterno(
                              Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Los repuestos de inventario cargados a la OT se suman
                          automáticamente.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Detalle técnico del trabajo ejecutado:
                      </label>
                      <textarea
                        rows={4}
                        value={detalleOtTrabajo}
                        onChange={(e) => setDetalleOtTrabajo(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* BOTONES REPARADO Y PAUTA COMPLETA */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        disabled={
                          submitting ||
                          !tienePanaTaller ||
                          esperaPresupuestoTaller
                        }
                        onClick={handleRepararEquipo}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#0369A1] hover:bg-[#0284C7] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 px-4 text-sm cursor-pointer transition-all"
                      >
                        <Wrench className="w-4 h-4" />
                        <span>Reparado (Cerrar Falla)</span>
                      </button>
                      {esperaPresupuestoTaller ? (
                        <p className="text-xs text-purple-800 font-semibold">
                          Retenido: requiere resolución de presupuesto en
                          Jefatura.
                        </p>
                      ) : !tienePanaTaller ? (
                        <p className="text-xs text-slate-500">
                          Sin falla correctiva activa.
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <button
                        type="button"
                        disabled={submitting || !pautaCompleta}
                        onClick={handleCompletarPauta}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#065F46] hover:bg-[#047857] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 px-4 text-sm cursor-pointer transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Pauta Completa (Reiniciar Ciclo)</span>
                      </button>
                      {!pautaCompleta && (
                        <p className="text-xs text-amber-800 font-medium">
                          Pendientes:{" "}
                          {pautaActual.length - tareasPautaMarcadas.length}{" "}
                          ítems de verificación.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMNA DERECHA: ASISTENTE TÉCNICO IA (GEMINI) */}
            <div className="lg:col-span-5">
              <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-[#1E293B] text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-700">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-[#38BDF8]" />
                    <h4 className="text-sm font-bold uppercase tracking-wider">
                      Asistente Técnico IA (Gemini)
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-sky-300">
                    {catMaq}
                  </span>
                </div>

                <div className="p-6 space-y-4">
                  {maq.panas_reportadas ? (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-950">
                      <strong>Fallas activas en evaluación:</strong>{" "}
                      {maq.panas_reportadas}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-slate-100 border border-slate-200 p-3 text-xs text-slate-700">
                      <strong>Último registro:</strong>{" "}
                      <em>{maq.ultima_observacion}</em>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Consulta técnica o síntoma en banco de prueba:
                    </label>
                    <textarea
                      rows={4}
                      value={consultaIa}
                      onChange={(e) => setConsultaIa(e.target.value)}
                      placeholder={`Ej: Procedimiento de diagnóstico paso a paso para ${maq.nombre}...`}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={loadingIa}
                      onClick={() => handleConsultarIa("diagnosticar")}
                      className="rounded-lg bg-[#0F172A] hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold py-2.5 px-3 text-xs md:text-sm cursor-pointer"
                    >
                      Diagnosticar Falla
                    </button>
                    <button
                      type="button"
                      disabled={loadingIa}
                      onClick={() => handleConsultarIa("pauta")}
                      className="rounded-lg bg-[#0369A1] hover:bg-[#0284C7] disabled:bg-slate-300 text-white font-bold py-2.5 px-3 text-xs md:text-sm cursor-pointer"
                    >
                      Procedimiento Pauta
                    </button>
                  </div>

                  {loadingIa && (
                    <div className="rounded-lg bg-slate-100 border border-slate-300 p-4 text-xs font-semibold text-slate-700">
                      Procesando consulta técnica para {maq.codigo}...
                    </div>
                  )}

                  {errorIa && (
                    <div className="rounded-lg bg-red-50 border border-red-300 p-3.5 text-xs text-red-900 font-semibold">
                      {errorIa}
                    </div>
                  )}

                  {respuestaIa && !loadingIa && (
                    <div className="rounded-lg bg-slate-50 border-2 border-[#0369A1]/40 p-4 space-y-2">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-[#0369A1]">
                        Informe Técnico Generado:
                      </div>
                      <div className="text-xs md:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {respuestaIa}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            SUB-TAB 3: SOLICITAR PRESUPUESTO
           ============================================================ */}
        {activeSubTab === "presupuesto" && (
          <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
            <div className="bg-[#0C4A6E] text-white px-6 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-sky-300" />
                <h4 className="text-sm font-bold uppercase tracking-wider">
                  Solicitud Formal de Presupuesto — {maq.codigo}
                </h4>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Solicitado por:
                    </label>
                    <input
                      type="text"
                      value={solicitantePres}
                      onChange={(e) => setSolicitantePres(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Prioridad:
                    </label>
                    <select
                      value={prioridadPres}
                      onChange={(e) => setPrioridadPres(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option>Alta (Equipo Bloqueado en Taller)</option>
                      <option>Media</option>
                      <option>Baja</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Destinatario / Imputación:
                    </label>
                    <select
                      value={destinatarioTipo}
                      onChange={(e) => setDestinatarioTipo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option>Por definir (En bandeja)</option>
                      <option>Aprobación Interna (Gerencia)</option>
                      <option>Cobro a Cliente (Daño en faena)</option>
                      <option>Cotización a Proveedor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Referencia / Cliente / Obra:
                    </label>
                    <input
                      type="text"
                      value={destinatarioNombre}
                      onChange={(e) => setDestinatarioNombre(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center">
                  <label className="flex items-start gap-2.5 p-4 rounded-xl bg-purple-50 border-2 border-purple-300 cursor-pointer text-xs md:text-sm font-bold text-purple-950">
                    <input
                      type="checkbox"
                      checked={marcarEsperaPres}
                      onChange={(e) => setMarcarEsperaPres(e.target.checked)}
                      className="mt-0.5 accent-purple-700"
                    />
                    <span>
                      Retener máquina en estado &apos;ESPERANDO
                      PRESUPUESTO&apos;
                    </span>
                  </label>
                </div>
              </div>

              <hr className="border-slate-200" />

              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Fallas o daños asociados ({catMaq}):
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {opcionesPanasPresupuesto.map((pana) => {
                    const checked = panasElegidasPres.includes(pana);
                    return (
                      <label
                        key={pana}
                        className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer ${
                          checked
                            ? "bg-purple-50 border-purple-400 font-semibold text-purple-950"
                            : "bg-slate-50 border-slate-200 text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked)
                              setPanasElegidasPres([
                                ...panasElegidasPres,
                                pana,
                              ]);
                            else
                              setPanasElegidasPres(
                                panasElegidasPres.filter((p) => p !== pana)
                              );
                          }}
                          className="mt-0.5 accent-purple-700"
                        />
                        <span>{pana}</span>
                      </label>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ítem adicional de falla o daño:
                  </label>
                  <input
                    type="text"
                    value={otraPanaPres}
                    onChange={(e) => setOtraPanaPres(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Desglose técnico de repuestos y mano de obra:
                  </label>
                  <textarea
                    rows={3}
                    value={detalleRepuestosPres}
                    onChange={(e) => setDetalleRepuestosPres(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Costo Repuestos ($ CLP):
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={cRepPres}
                    onChange={(e) =>
                      setCRepPres(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mano de Obra ($ CLP):
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={cMoPres}
                    onChange={(e) =>
                      setCMoPres(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Insumos / Externos ($ CLP):
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={2000}
                    value={cInsPres}
                    onChange={(e) =>
                      setCInsPres(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="rounded-lg bg-[#0F172A] text-white p-3.5 border border-slate-700">
                  <div className="text-[11px] uppercase tracking-wider text-sky-300 font-bold">
                    Total Presupuesto (Neto)
                  </div>
                  <div className="text-lg font-black font-mono tabular-nums mt-0.5">
                    {formatCLP(totalPresCalc)} CLP
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleCrearPresupuesto}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#0369A1] hover:bg-[#0284C7] text-white font-bold py-3 px-4 text-sm cursor-pointer transition-all"
              >
                <Send className="w-4 h-4" />
                <span>Generar y Registrar Solicitud de Presupuesto</span>
              </button>

              {presupuestosMaq.length > 0 && (
                <div className="pt-4 border-t border-slate-200 space-y-2.5">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Presupuestos Históricos del Equipo
                  </h5>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Folio</th>
                          <th className="py-2.5 px-3">Fecha</th>
                          <th className="py-2.5 px-3">Estado</th>
                          <th className="py-2.5 px-3">Destinatario</th>
                          <th className="py-2.5 px-3 text-right">
                            Monto Total
                          </th>
                          <th className="py-2.5 px-3">Fallas Asociadas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {presupuestosMaq.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-bold">
                              {p.folio}
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {p.fecha_solicitud}
                            </td>
                            <td className="py-2.5 px-3 font-bold">
                              {p.estado_presupuesto}
                            </td>
                            <td className="py-2.5 px-3">
                              {p.destinatario_tipo}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                              {formatCLP(p.monto_total)}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {p.panas_asociadas}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            SUB-TAB 4: FORZAR ESTADO / AJUSTE MANUAL
           ============================================================ */}
        {activeSubTab === "manual" && (
          <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
            <div className="bg-[#1E293B] text-white px-6 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-300" />
                <h4 className="text-sm font-bold uppercase tracking-wider">
                  Ajuste Manual de Parámetros y Estado Operativo
                </h4>
              </div>
            </div>

            <div className="p-6">
              {!isJefe ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl bg-slate-100 border border-slate-300 p-4 text-sm text-slate-900">
                  <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5 text-[#0369A1] shrink-0" />
                    <span>
                      El ajuste forzado de estados requiere autorización de{" "}
                      <strong>Jefatura</strong>.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onNavigateJefatura}
                    className="rounded-lg bg-[#0369A1] hover:bg-[#0284C7] text-white font-bold px-4 py-2 text-xs whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Autenticar en Jefatura
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Nuevo Estado Operativo:
                      </label>
                      <select
                        value={estadoElegidoMan}
                        onChange={(e) => {
                          setEstadoElegidoMan(e.target.value);
                          setLimpiarPanasMan(
                            e.target.value.includes("OPERATIVA")
                          );
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                      >
                        <option value="OPERATIVA (Disponible)">
                          OPERATIVA (Disponible)
                        </option>
                        <option value="PIDE MANTENCIÓN">PIDE MANTENCIÓN</option>
                        <option value="EN PANA / TALLER">
                          EN PANA / TALLER
                        </option>
                        <option value="ESPERANDO PRESUPUESTO">
                          ESPERANDO PRESUPUESTO
                        </option>
                      </select>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Ajustar Uso ({unidadUso}):
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          value={usoManual}
                          onChange={(e) =>
                            setUsoManual(
                              Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Ajustar Horómetro:
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          value={horometroManual}
                          onChange={(e) =>
                            setHorometroManual(
                              Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Nota / Motivo Técnico:
                        </label>
                        <input
                          type="text"
                          value={notaManual}
                          onChange={(e) => setNotaManual(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer pt-2">
                        <input
                          type="checkbox"
                          checked={limpiarPanasMan}
                          onChange={(e) => setLimpiarPanasMan(e.target.checked)}
                          className="accent-[#0369A1]"
                        />
                        <span>Limpiar registro de fallas activas</span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleAplicarAjusteManual}
                    className="w-full rounded-lg bg-[#065F46] hover:bg-[#047857] text-white font-bold py-3 px-4 text-sm cursor-pointer"
                  >
                    Aplicar Ajuste Manual de Estado
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            SUB-TAB 5: HISTORIAL DEL EQUIPO
           ============================================================ */}
        {activeSubTab === "historial" && (
          <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
            <div className="bg-[#1E293B] text-white px-6 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-sky-300" />
                <h4 className="text-sm font-bold uppercase tracking-wider">
                  Bitácora de Movimientos del Equipo — {maq.codigo}
                </h4>
              </div>
              <span className="text-xs font-mono text-slate-300">
                {historialMaq.length} registros
              </span>
            </div>

            <div className="p-6">
              {historialMaq.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Sin eventos registrados en la bitácora del equipo.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">ID</th>
                        <th className="py-2.5 px-3">Fecha</th>
                        <th className="py-2.5 px-3">Evento</th>
                        <th className="py-2.5 px-3">Responsable</th>
                        <th className="py-2.5 px-3 text-right">Uso Sumado</th>
                        <th className="py-2.5 px-3 text-right">
                          Costo Repuestos
                        </th>
                        <th className="py-2.5 px-3">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historialMaq.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            #{h.id}
                          </td>
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            {h.fecha}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                            {h.tipo_evento}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {h.responsable}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            +{h.uso_sumado}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatCLP(h.costo_repuestos)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {h.detalle}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
