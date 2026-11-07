"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot } from "firebase/firestore";
import { useAccess } from "@/components/auth/access-context";
import { db, functions } from "@/lib/firebase/client";

type Device = {
  id: string;
  gatewayId?: string;
  deviceUrl?: string;
  devicePort?: number;
  model?: string;
  firmware?: string | null;
  status?: string;
  accessCommandsEnabled?: boolean;
  lastSeenAt?: string;
};

type Props = { onFeedback: (message: string) => void };

function deviceStatus(device: Device) {
  if (device.status === "paired") return "Pareada";
  return "Preparada";
}

export function ControlIdConnectionSettings({ onFeedback }: Props) {
  const access = useAccess();
  const [devices, setDevices] = useState<Device[]>([]);
  const [pairingCode, setPairingCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const canManage = access.role === "admin";

  useEffect(() => {
    if (!canManage || !db) return undefined;
    return onSnapshot(collection(db, "academies", access.academyId, "accessDevices"), (snapshot) => {
      setDevices(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Device, "id">) })));
    }, () => setDevices([]));
  }, [access.academyId, canManage]);

  const createPairing = async () => {
    if (!functions) {
      onFeedback("O serviço seguro de pareamento não está configurado.");
      return;
    }
    setLoading(true);
    try {
      const callable = httpsCallable<{ academyId: string; expiresInMinutes: number }, { token: string; expiresAt: string }>(functions, "createControlIdPairing");
      const result = await callable({ academyId: access.academyId, expiresInMinutes: 15 });
      setPairingCode(result.data.token);
      setExpiresAt(result.data.expiresAt);
      onFeedback("Código de pareamento gerado. Use-o no computador que ficará ligado à catraca.");
    } catch {
      onFeedback("Não foi possível gerar o código de pareamento.");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!pairingCode) return;
    await navigator.clipboard?.writeText(pairingCode);
    onFeedback("Código copiado. Ele expira em poucos minutos e só pode ser usado uma vez.");
  };

  if (!canManage) return null;

  return <section className="settings-section settings-card controlid-settings-section">
    <div className="settings-section-heading"><div><span>CONTROLE DE ACESSO</span><h3>Conexão com a catraca</h3></div><small>Control iD · pareamento local</small></div>
    <p className="controlid-settings-copy">Gere um código temporário nesta tela e use-o no computador conectado à mesma rede da catraca. Nesse computador, execute <code>npm run controlid:pair</code>. A senha do equipamento fica somente no gateway local e os comandos de abertura permanecem desativados nesta etapa.</p>
    {devices.length > 0 ? <div className="controlid-device-list">{devices.map((device) => <article key={device.id}><div><strong>{device.model || "Control iD"}</strong><small>{device.deviceUrl || "Endereço local não informado"}{device.devicePort ? `:${device.devicePort}` : ""} · firmware {device.firmware || "não informado"}</small></div><span className="controlid-device-status"><Check size={13} /> {deviceStatus(device)}</span></article>)}</div> : <p className="controlid-empty">Nenhum computador foi pareado ainda.</p>}
    <div className="controlid-pairing-actions"><button className="detail-save" type="button" onClick={() => void createPairing()} disabled={loading}><RefreshCw size={15} /> {loading ? "Gerando código…" : "Gerar código de pareamento"}</button>{pairingCode && <button className="detail-secondary" type="button" onClick={() => void copyCode()}><Copy size={15} /> Copiar código</button>}</div>
    {pairingCode && <div className="controlid-pairing-result"><div><span>CÓDIGO DE USO ÚNICO</span><code>{pairingCode}</code><small>Expira em {new Date(expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Não compartilhe em grupos.</small></div><Link2 size={19} /></div>}
    <div className="controlid-settings-note"><ShieldCheck size={16} /><span>O pareamento vincula somente a academia e o equipamento. Nenhum comando de abertura, bloqueio ou cadastro facial é enviado pelo sistema nesta fase.</span></div>
  </section>;
}
