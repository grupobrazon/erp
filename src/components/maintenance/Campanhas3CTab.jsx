import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { io } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Phone, PhoneOff, Coffee, LogIn, LogOut, Loader2, Headphones, Radio, AlertCircle, RefreshCw, ClipboardCheck } from "lucide-react";
import ActiveCallCard from "./ActiveCallCard";
import ManualDialPanel from "./ManualDialPanel";
import CampaignCallHistory from "./CampaignCallHistory";
import CampaignSessionsHistory from "./CampaignSessionsHistory";
import PostCallClassification from "./PostCallClassification";
import SoftphoneDiagnosticDialog from "./SoftphoneDiagnosticDialog";

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length === 10 || digits.length === 11) return digits;
  if (digits.length === 12 || digits.length === 13) return digits.slice(2);
  return digits;
}

const STATUS_CONFIG = {
  offline:     { label: "Offline", variant: "secondary", icon: null },
  logging_in:  { label: "Conectando...", variant: "default", icon: Loader2 },
  idle:        { label: "Ociosa (aguardando)", variant: "default", icon: Radio },
  in_call:     { label: "Em Chamada", variant: "default", icon: Phone },
  in_acw:      { label: "Pós-Atendimento", variant: "secondary", icon: Coffee },
  in_break:    { label: "Em Intervalo", variant: "secondary", icon: Coffee },
  error:       { label: "Erro", variant: "destructive", icon: AlertCircle },
};

export default function Campanhas3CTab({ equipment, clients, sellers, mySeller, isVendedor, setCrmEquip, navigate }) {
  const { toast } = useToast();
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [agentConfig, setAgentConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [agentStatus, setAgentStatus] = useState("offline");
  const [currentCall, setCurrentCall] = useState(null);
  const [matchedClient, setMatchedClient] = useState(null);
  const [matchedEquipment, setMatchedEquipment] = useState(null);
  const [breaks, setBreaks] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketError, setSocketError] = useState("");
  const [activeSession, setActiveSession] = useState(null);
  const [sessionsTick, setSessionsTick] = useState(0);
  const [classifying, setClassifying] = useState(false);
  const [qualified, setQualified] = useState(null);
  const [qualifications, setQualifications] = useState([]);
  const socketRef = useRef(null);
  const sessionRef = useRef(null);
  const socketIdleRef = useRef(false);
  const [softphoneKey, setSoftphoneKey] = useState(0);
  const currentBreakRef = useRef(null);
  const callStartRef = useRef(null);

  const activeSellerId = isVendedor ? mySeller?.id : selectedSellerId;
  const activeSeller = sellers.find((s) => s.id === activeSellerId);

  // Cleanup socket on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      // Fechar sessão ativa ao desmontar (troca de aba/saída do painel)
      if (sessionRef.current) {
        (async () => {
          try {
            const sess = await base44.entities.SessaoCampanha3C.get(sessionRef.current);
            if (sess.status === "Ativa") {
              const logoutAt = new Date().toISOString();
              const dur = Math.floor((new Date(logoutAt) - new Date(sess.login_at)) / 1000);
              let breaks = sess.breaks || [];
              if (currentBreakRef.current) {
                const bDur = Math.floor((new Date(logoutAt) - new Date(currentBreakRef.current.started_at)) / 1000);
                breaks = [...breaks, { ...currentBreakRef.current, ended_at: logoutAt, duration_seconds: bDur }];
              }
              const totalBreak = breaks.reduce((sum, b) => sum + (b.duration_seconds || 0), 0);
              await base44.entities.SessaoCampanha3C.update(sessionRef.current, {
                logout_at: logoutAt,
                duration_seconds: dur,
                active_seconds: dur - totalBreak,
                total_break_seconds: totalBreak,
                breaks,
                status: "Encerrada",
              });
            }
          } catch {} finally {
            sessionRef.current = null;
            currentBreakRef.current = null;
          }
        })();
      }
    };
  }, []);

  // Fechar sessão ativa ao trocar de vendedora
  useEffect(() => {
    return async () => {
      if (sessionRef.current) {
        const sid = sessionRef.current;
        const cb = currentBreakRef.current;
        try {
          const sess = await base44.entities.SessaoCampanha3C.get(sid);
          if (sess.status === "Ativa") {
            const logoutAt = new Date().toISOString();
            const dur = Math.floor((new Date(logoutAt) - new Date(sess.login_at)) / 1000);
            let breaks = sess.breaks || [];
            if (cb) {
              const bDur = Math.floor((new Date(logoutAt) - new Date(cb.started_at)) / 1000);
              breaks = [...breaks, { ...cb, ended_at: logoutAt, duration_seconds: bDur }];
            }
            const totalBreak = breaks.reduce((sum, b) => sum + (b.duration_seconds || 0), 0);
            await base44.entities.SessaoCampanha3C.update(sid, {
              logout_at: logoutAt, duration_seconds: dur,
              active_seconds: dur - totalBreak, total_break_seconds: totalBreak,
              breaks, status: "Encerrada",
            });
          }
        } catch {} finally {
          sessionRef.current = null;
          currentBreakRef.current = null;
          setActiveSession(null);
        }
      }
    };
  }, [activeSellerId]);

  // Load agent config when seller changes
  useEffect(() => {
    if (!activeSellerId) {
      setAgentConfig(null);
      setConfigError("");
      return;
    }
    (async () => {
      try {
        const res = await base44.functions.invoke("sync3CAgent", { action: "getAgentConfig", seller_id: activeSellerId });
        if (res.data?.error) {
          setAgentConfig(null);
          setConfigError(res.data.error);
        } else {
          setAgentConfig(res.data);
          setConfigError("");
        }
      } catch (e) {
        setAgentConfig(null);
        setConfigError(e.message);
      }
    })();
  }, [activeSellerId]);

  // Connect to Socket.io when agent config is loaded
  useEffect(() => {
    if (!agentConfig) return;

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io(agentConfig.socket_url, {
      query: { token: agentConfig.agent_token },
      transports: ["websocket"],
      forceNew: true,
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => { setSocketConnected(true); setSocketError(""); });
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("connect_error", (err) => {
      setSocketConnected(false);
      setSocketError(err.message || "Falha ao conectar no Socket.io");
    });

    socket.on("agent-is-idle", () => {
      socketIdleRef.current = true;
      setAgentStatus("idle");
      setCurrentCall(null);
      setQualified(null);
      setQualifications([]);
    });

    // Atualizar contadores de chamada na sessão ativa
    socket.on("call-was-finished", (data) => {
      setAgentStatus("in_acw");
      // Capturar call_id aqui também (não depender só do call-was-connected).
      const id = data?.call?._id || data?.call?.id || data?._id || data?.id || data?.call_id || data?.callHistory?._id || data?.callHistory?.id || "";
      if (id) {
        setCurrentCall((prev) => (prev && prev.call_id ? prev : { call_id: id, phone: prev?.phone || "", mailing_data: prev?.mailing_data || {}, qualifications: prev?.qualifications || [] }));
      }
      if (sessionRef.current) {
        (async () => {
          try {
            const talkTime = callStartRef.current ? Math.floor((Date.now() - callStartRef.current) / 1000) : 0;
            callStartRef.current = null;
            const sess = await base44.entities.SessaoCampanha3C.get(sessionRef.current);
            await base44.entities.SessaoCampanha3C.update(sessionRef.current, {
              calls_count: (sess.calls_count || 0) + 1,
              calls_answered: (sess.calls_answered || 0) + 1,
              talk_time_seconds: (sess.talk_time_seconds || 0) + talkTime,
            });
            setSessionsTick((t) => t + 1);
          } catch {}
        })();
      }
    });

    socket.on("agent-login-failed", (data) => {
      setAgentStatus("error");
      toast({ variant: "destructive", title: "Login falhou", description: data?.message || data?.error || "Verifique o token do agente e o ramal WebRTC" });
    });

    socket.on("call-was-connected", (data) => {
      setAgentStatus("in_call");
      callStartRef.current = Date.now();
      const callId = data?.call?._id || data?.call?.id || data?._id || data?.id || data?.call_id || data?.callHistory?._id || data?.callHistory?.id || "";
      const phone = data?.mailing?.phone || data?.mailing?.data?.phone || data?.call?.phone_number || "";
      const mailingData = data?.mailing?.data || {};
      const qualifications = data?.qualifications || [];
      setCurrentCall({ call_id: callId, phone, mailing_data: mailingData, qualifications });
      setQualified(null);

      // Match client: try by identifier (our client ID) first, then by phone
      const clientId = data?.mailing?.identifier || mailingData?.identifier || "";
      if (clientId) {
        const client = clients.find((c) => c.id === clientId);
        if (client) {
          setMatchedClient(client);
          const eq = equipment.find((e) => e.client_id === client.id && e.status === "Ativo");
          setMatchedEquipment(eq || null);
          return;
        }
      }
      // Fallback: match by phone
      if (phone) {
        const normalized = normalizePhone(phone);
        for (const c of clients) {
          let found = false;
          for (let i = 1; i <= 5; i++) {
            if (normalizePhone(c[`phone${i}`]) === normalized) { found = true; break; }
          }
          if (!found) {
            for (let i = 1; i <= 7; i++) {
              if (normalizePhone(c[`zoox_phone${i}`]) === normalized) { found = true; break; }
            }
          }
          if (found) {
            setMatchedClient(c);
            const eq = equipment.find((e) => e.client_id === c.id && e.status === "Ativo");
            setMatchedEquipment(eq || null);
            return;
          }
        }
      }
      setMatchedClient(null);
      setMatchedEquipment(null);
    });

    socket.on("agent-in-acw", (data) => {
      setAgentStatus("in_acw");
      // Capturar call_id ao entrar em ACW (segunda fonte, além do call-was-connected).
      const id = data?.call?._id || data?.call?.id || data?._id || data?.id || data?.call_id || data?.callHistory?._id || data?.callHistory?.id || "";
      if (id) {
        setCurrentCall((prev) => (prev && prev.call_id ? prev : { call_id: id, phone: prev?.phone || "", mailing_data: prev?.mailing_data || {}, qualifications: prev?.qualifications || [] }));
      }
    });
    socket.on("agent-entered-work-break", (data) => {
      setAgentStatus("in_break");
      currentBreakRef.current = {
        break_id: data?.work_break_id || data?.id || "",
        break_name: data?.work_break_name || data?.name || "Intervalo",
        started_at: new Date().toISOString(),
      };
    });
    socket.on("agent-left-work-break", () => {
      setAgentStatus("idle");
      if (sessionRef.current && currentBreakRef.current) {
        (async () => {
          try {
            const endedAt = new Date().toISOString();
            const dur = Math.floor((new Date(endedAt) - new Date(currentBreakRef.current.started_at)) / 1000);
            const sess = await base44.entities.SessaoCampanha3C.get(sessionRef.current);
            const breaks = [...(sess.breaks || []), { ...currentBreakRef.current, ended_at: endedAt, duration_seconds: dur }];
            await base44.entities.SessaoCampanha3C.update(sessionRef.current, {
              breaks,
              total_break_seconds: (sess.total_break_seconds || 0) + dur,
            });
            setSessionsTick((t) => t + 1);
          } catch {} finally {
            currentBreakRef.current = null;
          }
        })();
      } else {
        currentBreakRef.current = null;
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [agentConfig, clients, equipment, toast]);

  // Load breaks when idle or in ACW (pós-atendimento)
  useEffect(() => {
    if ((agentStatus !== "idle" && agentStatus !== "in_acw") || !activeSellerId) return;
    (async () => {
      try {
        const res = await base44.functions.invoke("sync3CAgent", { action: "getLoggedCampaign", seller_id: activeSellerId });
        if (!res.data?.error) {
          const campaign = res.data?.campaign || {};
          // O backend já resolve os intervalos via /work_break_group/{id}/intervals
          const wb = campaign.work_breaks || [];
          setBreaks(Array.isArray(wb) ? wb : []);
        }
      } catch { /* ignore */ }
    })();
  }, [agentStatus, activeSellerId]);

  // Fallback via banco: se entrou em ACW sem call_id (socket não trouxe o id),
  // buscar a última chamada da campanha no Chamada3C (webhook call-history-was-created),
  // que guarda callHistory._id. Retry: o webhook HTTP pode chegar alguns segundos
  // depois do evento socket agent-in-acw.
  useEffect(() => {
    if (agentStatus !== "in_acw" || !activeSellerId || !selectedCampaign || currentCall?.call_id) return;
    let cancelled = false;
    const attempts = [0, 3000, 6000];
    const timers = attempts.map((delay) => setTimeout(async () => {
      if (cancelled || currentCall?.call_id) return;
      try {
        const res = await base44.functions.invoke("sync3CAgent", {
          action: "getLastCallId",
          seller_id: activeSellerId,
          campaign_id: String(selectedCampaign),
        });
        if (cancelled) return;
        const id = res.data?.call_id;
        if (id) {
          setCurrentCall((prev) => (prev && prev.call_id ? prev : {
            call_id: String(id),
            phone: prev?.phone || res.data?.phone || "",
            mailing_data: prev?.mailing_data || {},
            qualifications: prev?.qualifications || [],
          }));
        }
      } catch { /* best-effort */ }
    }, delay));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [agentStatus, activeSellerId, selectedCampaign, currentCall?.call_id]);

  // Buscar todas as qualificações da campanha ao entrar em Pós-Atendimento (ACW)
  useEffect(() => {
    if (agentStatus !== "in_acw" || !activeSellerId || !selectedCampaign) return;
    (async () => {
      try {
        const res = await base44.functions.invoke("sync3CAgent", {
          action: "getQualifications",
          seller_id: activeSellerId,
          campaign_id: selectedCampaign,
        });
        if (!res.data?.error) setQualifications(res.data?.qualifications || []);
      } catch { /* ignore */ }
    })();
  }, [agentStatus, activeSellerId, selectedCampaign]);

  const loadCampaigns = async () => {
    if (!activeSellerId) return;
    setLoadingCampaigns(true);
    try {
      const res = await base44.functions.invoke("sync3CAgent", { action: "getAgentCampaigns", seller_id: activeSellerId });
      if (res.data?.error) {
        toast({ variant: "destructive", title: "Erro", description: res.data.error });
      } else {
        setCampaigns(res.data?.campaigns || []);
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setLoadingCampaigns(false);
    }
  };

  // Auto-load campaigns when seller changes or tab opens
  useEffect(() => {
    if (activeSellerId && agentConfig) {
      loadCampaigns();
    }
  }, [activeSellerId, agentConfig]);

  // Se a vendedora já estiver logada em uma campanha no 3C, refletir no ERP
  useEffect(() => {
    if (!activeSellerId || !agentConfig) return;
    (async () => {
      try {
        const res = await base44.functions.invoke("sync3CAgent", { action: "getLoggedCampaign", seller_id: activeSellerId });
        const camp = res.data?.campaign;
        if (camp?.id) {
          setSelectedCampaign(String(camp.id));
          setBreaks(camp.work_breaks || []);
          setAgentStatus((prev) => (prev === "offline" || prev === "error" ? "idle" : prev));
        }
      } catch { /* ignore */ }
    })();
  }, [activeSellerId, agentConfig]);

  const handleLogin = async () => {
    if (!selectedCampaign) { toast({ variant: "destructive", title: "Selecione uma campanha" }); return; }
    setActionLoading(true);
    socketIdleRef.current = false;
    setAgentStatus("logging_in");
    try {
      const res = await base44.functions.invoke("sync3CAgent", { action: "agentLogin", seller_id: activeSellerId, campaign_id: selectedCampaign });
      if (res.data?.error) {
        setAgentStatus("error");
        toast({ variant: "destructive", title: "Erro", description: res.data.error });
      } else {
        // Criar sessão de campanha
        const campaign = campaigns.find((c) => String(c.id) === selectedCampaign);
        try {
          const sess = await base44.entities.SessaoCampanha3C.create({
            seller_id: activeSellerId,
            seller_name: activeSeller?.name || "",
            campaign_id_3c: String(selectedCampaign),
            campaign_name: campaign?.name || "",
            login_at: new Date().toISOString(),
            status: "Ativa",
            breaks: [],
          });
          sessionRef.current = sess.id;
          setActiveSession(sess);
        } catch {}
        // Confirmação do login: o socket pode não disparar agent-is-idle, então consultamos
        // a campanha logada via API. Se o agente não estiver online no 3C Plus (softphone
        // desconectado), o 3C aceita o login mas não coloca o agente na campanha.
        let confirmado = false;
        // O 3C conecta o ramal com uma chamada de conexão que pode levar até ~30s.
        for (const espera of [3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000]) {
          if (socketIdleRef.current) { confirmado = true; break; }
          await new Promise((r) => setTimeout(r, espera));
          try {
            const logged = await base44.functions.invoke("sync3CAgent", { action: "getLoggedCampaign", seller_id: activeSellerId });
            if (!logged.data?.error && logged.data?.campaign) {
              confirmado = true;
              setAgentStatus((prev) => prev === "logging_in" ? "idle" : prev);
              setBreaks(logged.data.campaign.work_breaks || []);
              break;
            }
          } catch { /* tenta novamente */ }
        }
        if (!confirmado) {
          setAgentStatus((prev) => prev === "logging_in" ? "error" : prev);
          toast({
            variant: "destructive",
            title: "O agente não entrou na campanha",
            description: "O 3C Plus respondeu que o agente não está online. O Softphone ao lado precisa estar conectado (com microfone liberado) antes de entrar na campanha.",
          });
        }
      }
    } catch (e) {
      setAgentStatus("error");
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke("sync3CAgent", { action: "agentLogout", seller_id: activeSellerId });
      if (res.data?.error) {
        toast({ variant: "destructive", title: "Erro", description: res.data.error });
      } else {
        // Fechar sessão ativa
        if (sessionRef.current) {
          try {
            const sess = await base44.entities.SessaoCampanha3C.get(sessionRef.current);
            const logoutAt = new Date().toISOString();
            const dur = Math.floor((new Date(logoutAt) - new Date(sess.login_at)) / 1000);
            let breaks = sess.breaks || [];
            // Se estava em pausa ao sair, fechar a pausa em andamento
            if (currentBreakRef.current) {
              const bDur = Math.floor((new Date(logoutAt) - new Date(currentBreakRef.current.started_at)) / 1000);
              breaks = [...breaks, { ...currentBreakRef.current, ended_at: logoutAt, duration_seconds: bDur }];
            }
            const totalBreak = breaks.reduce((sum, b) => sum + (b.duration_seconds || 0), 0);
            await base44.entities.SessaoCampanha3C.update(sessionRef.current, {
              logout_at: logoutAt,
              duration_seconds: dur,
              active_seconds: dur - totalBreak,
              total_break_seconds: totalBreak,
              breaks,
              status: "Encerrada",
            });
            setSessionsTick((t) => t + 1);
          } catch {} finally {
            sessionRef.current = null;
            currentBreakRef.current = null;
            setActiveSession(null);
          }
        }
        setAgentStatus("offline");
        setCurrentCall(null); setMatchedClient(null); setMatchedEquipment(null); setBreaks([]);
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleHangup = async () => {
    if (!currentCall?.call_id) return;
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke("sync3CAgent", { action: "agentHangup", seller_id: activeSellerId, call_id: currentCall.call_id });
      if (res.data?.error) toast({ variant: "destructive", title: "Erro", description: res.data.error });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBreakEnter = async (breakId) => {
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke("sync3CAgent", { action: "agentBreakEnter", seller_id: activeSellerId, work_break_id: breakId });
      if (res.data?.error) toast({ variant: "destructive", title: "Erro", description: res.data.error });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBreakExit = async () => {
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke("sync3CAgent", { action: "agentBreakExit", seller_id: activeSellerId });
      if (res.data?.error) toast({ variant: "destructive", title: "Erro", description: res.data.error });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Classificar chamada (Pós-Atendimento) — o acw_timeout=30 da campanha retorna à fila automaticamente
  const handleQualify = async (qualificationId) => {
    if (!currentCall?.call_id) return;
    setClassifying(true);
    try {
      const res = await base44.functions.invoke("sync3CAgent", {
        action: "agentQualifyCall",
        seller_id: activeSellerId,
        call_id: currentCall.call_id,
        qualification_id: qualificationId,
      });
      if (res.data?.error) {
        toast({ variant: "destructive", title: "Erro ao classificar", description: res.data.error });
      } else {
        setQualified(qualificationId);
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setClassifying(false);
    }
  };

  // === No seller selected ===
  if (!activeSellerId) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          {isVendedor ? (
            <div className="space-y-2">
              <Headphones className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">Sua vendedora não está vinculada a um agente 3C Plus.</p>
              <p className="text-xs text-muted-foreground">Peça ao administrador para vincular em Configurações → Sistema → Agentes 3C Plus.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Headphones className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">Selecione uma vendedora para visualizar suas campanhas do 3C Plus.</p>
              <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                <SelectTrigger className="w-64 mx-auto"><SelectValue placeholder="Selecionar vendedora..." /></SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // === Config error ===
  if (configError) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <p className="text-destructive font-medium">Configuração incompleta</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">{configError}</p>
          {!isVendedor && (
            <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
              <SelectTrigger className="w-64 mx-auto"><SelectValue placeholder="Trocar vendedora..." /></SelectTrigger>
              <SelectContent>
                {sellers.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>
    );
  }

  const statusConfig = STATUS_CONFIG[agentStatus] || STATUS_CONFIG.offline;
  const availableCampaigns = campaigns.filter((c) => !c.paused);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-4">
      {/* Seller selector + status bar */}
      <div className="flex gap-4 items-center flex-wrap">
        {!isVendedor && (
          <div className="w-56 shrink-0">
            <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
              <SelectTrigger><SelectValue placeholder="Trocar vendedora..." /></SelectTrigger>
              <SelectContent>
                {sellers.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Radio className={`h-4 w-4 ${socketConnected ? "text-emerald-600" : "text-muted-foreground"}`} />
          <span className="text-xs text-muted-foreground">Socket.io: {socketConnected ? "Conectado" : "Desconectado"}</span>
          {socketError && <span className="text-xs text-destructive truncate">{socketError}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusConfig.variant} className="gap-1.5">
            {StatusIcon && <StatusIcon className={`h-3 w-3 ${agentStatus === "in_call" ? "animate-pulse" : agentStatus === "logging_in" ? "animate-spin" : ""}`} />}
            {statusConfig.label}
          </Badge>
          {activeSeller && <span className="text-sm text-muted-foreground">· {activeSeller.name}</span>}
        </div>
      </div>

      {/* Softphone + Dialer controls side by side */}
      <div className="flex gap-4 items-start flex-wrap">
        {/* WebRTC Softphone iframe */}
        {agentConfig && (
          <div className="border rounded-lg overflow-hidden shrink-0 w-[340px]">
            <div className="bg-muted px-3 py-1.5 text-xs font-medium flex items-center gap-1.5">
              <Headphones className="h-3.5 w-3.5" /> Softphone 3C Plus
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setSoftphoneKey((k) => k + 1)}>
                  <RefreshCw className="h-3 w-3" /> Recarregar
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-xs"
                  onClick={() => window.open(agentConfig.webrtc_url, "softphone3c", "width=380,height=520")}
                >
                  Abrir em janela
                </Button>
              </div>
            </div>
            <iframe
              key={softphoneKey}
              src={agentConfig.webrtc_url}
              allow="microphone; autoplay; speaker-selection"
              title="3C Plus Softphone"
              className="w-full h-[440px] border-0"
            />
          </div>
        )}

        {/* Dialer controls */}
        <Card className="flex-1 min-w-[300px]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4" /> Discador 3C Plus
            </CardTitle>
            <CardDescription>Selecione uma campanha e faça login para começar a receber chamadas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Campanha</label>
                <Select value={selectedCampaign} onValueChange={setSelectedCampaign} disabled={agentStatus !== "offline" && agentStatus !== "error"}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma campanha..." /></SelectTrigger>
                  <SelectContent>
                    {availableCampaigns.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={loadCampaigns} disabled={loadingCampaigns}>
                {loadingCampaigns ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar
              </Button>
              <SoftphoneDiagnosticDialog sellerId={activeSellerId} campaignId={selectedCampaign} />
            </div>

            {campaigns.length === 0 && !loadingCampaigns && (
              <p className="text-sm text-muted-foreground">Nenhuma campanha carregada. Clique em "Atualizar" para buscar as campanhas disponíveis.</p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {agentStatus === "offline" || agentStatus === "error" ? (
                <Button onClick={handleLogin} disabled={actionLoading || !selectedCampaign} className="gap-1.5">
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  Entrar na Campanha
                </Button>
              ) : (
                <>
                  <Button onClick={handleLogout} disabled={actionLoading} variant="outline" className="gap-1.5">
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    Sair da Campanha
                  </Button>
                  {agentStatus === "in_call" && (
                    <Button onClick={handleHangup} disabled={actionLoading} variant="destructive" className="gap-1.5">
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
                      Encerrar Chamada
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Pause / Break controls — visível quando ociosa ou em intervalo */}
            {(agentStatus === "idle" || agentStatus === "in_break") && (
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
                {agentStatus === "in_break" ? (
                  <Button size="sm" variant="default" onClick={handleBreakExit} disabled={actionLoading} className="gap-1">
                    <Coffee className="h-3.5 w-3.5" /> Retomar Ligações
                  </Button>
                ) : breaks.length > 0 ? (
                  <>
                    <span className="text-xs font-medium text-muted-foreground">Pausar:</span>
                    {breaks.map((b) => (
                      <Button key={b.id} size="sm" variant="outline" onClick={() => handleBreakEnter(b.id)} disabled={actionLoading} className="gap-1">
                        <Coffee className="h-3.5 w-3.5" /> {b.name || `Intervalo #${b.id}`}
                      </Button>
                    ))}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Nenhum intervalo configurado nesta campanha. Configure no painel do 3C Plus para habilitar pausas.</span>
                )}
              </div>
            )}

            {/* Ligação manual — teste pelo softphone */}
            {(agentStatus === "idle" || agentStatus === "in_break") && (
              <ManualDialPanel sellerId={activeSellerId} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pós-Atendimento — Classificação da chamada */}
      {agentStatus === "in_acw" && currentCall?.call_id && (
        <Card className="max-w-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Pós-Atendimento — Classificação da Chamada
            </CardTitle>
            <CardDescription>Classifique a chamada para registrar o atendimento. Você voltará à fila automaticamente em até 30s.</CardDescription>
          </CardHeader>
          <CardContent>
            <PostCallClassification
              qualifications={qualifications}
              onQualify={handleQualify}
              saving={classifying}
              qualified={qualified}
            />
            {breaks.length > 0 && !qualified && (
              <div className="flex items-center gap-2 flex-wrap pt-3 border-t mt-3">
                <span className="text-xs text-muted-foreground">Ou pausar:</span>
                {breaks.map((b) => (
                  <Button key={b.id} size="sm" variant="outline" onClick={() => handleBreakEnter(b.id)} disabled={actionLoading} className="gap-1">
                    <Coffee className="h-3.5 w-3.5" /> {b.name || `Intervalo #${b.id}`}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active call card */}
      <ActiveCallCard
        currentCall={currentCall}
        matchedClient={matchedClient}
        matchedEquipment={matchedEquipment}
        agentStatus={agentStatus}
        onOpenCRM={() => {
          const campaign = campaigns.find((c) => String(c.id) === selectedCampaign);
          setCrmEquip(matchedEquipment, {
            campaign_id_3c: selectedCampaign,
            campaign_name: campaign?.name || "",
          });
        }}
        onCreateSale={() => navigate(`/vendas/nova?equipment_id=${matchedEquipment?.id || ""}&client_id=${matchedClient?.id || ""}`)}
      />

      {/* Histórico de chamadas da campanha */}
      {agentStatus !== "offline" && agentStatus !== "error" && selectedCampaign && (
        <CampaignCallHistory
          campaignId={selectedCampaign}
          campaignName={campaigns.find((c) => String(c.id) === selectedCampaign)?.name || ""}
        />
      )}

      {/* Histórico de sessões da vendedora nesta campanha */}
      {selectedCampaign && (
        <CampaignSessionsHistory
          sellerId={activeSellerId}
          campaignId={selectedCampaign}
          campaignName={campaigns.find((c) => String(c.id) === selectedCampaign)?.name || ""}
          tick={sessionsTick}
        />
      )}
    </div>
  );
}