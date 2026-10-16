"use client";

import { useEffect, useRef, useState } from "react";

export type CompanyFieldsValue = {
  cnpj?: string; businessName?: string; cep?: string; street?: string;
  number?: string; complement?: string; district?: string; city?: string; state?: string;
};

export function maskCompanyDocument(value: string) {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
  return raw.replace(/^(.{2})(.)/, "$1.$2").replace(/^(.{6})(.)/, "$1.$2").replace(/^(.{10})(.)/, "$1/$2").replace(/^(.{15})(.)/, "$1-$2");
}

export function CompanyFields({ value, onChange, onFill }: {
  value: CompanyFieldsValue;
  onChange: (key: keyof CompanyFieldsValue, value: string) => void;
  onFill: (patch: CompanyFieldsValue, key: "cnpj" | "cep", expected: string) => void;
}) {
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { const active = request.current; request.current = null; active?.abort(); }, []);
  useEffect(() => { const previous = request.current; request.current = null; previous?.abort(); }, [value.cnpj, value.cep]);

  async function lookup(kind: "cnpj" | "cep") {
    const expected = value[kind] ?? "";
    const code = expected.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (!(kind === "cep" ? /^\d{8}$/ : /^[A-Z0-9]{12}\d{2}$/).test(code)) {
      if (code) setMessage(kind === "cep" ? "Informe os 8 números do CEP." : "Complete o CNPJ para consultar.");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 10000);
    setMessage("Consultando…");
    try {
      const url = kind === "cep" ? `https://viacep.com.br/ws/${code}/json/` : `https://minhareceita.org/${code}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.erro) throw new Error();
      const text = (field: string) => typeof data[field] === "string" ? data[field].slice(0, 180) : "";
      onFill({ businessName: kind === "cnpj" ? text("razao_social") : "", cep: text("cep").replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2"), street: text("logradouro"), district: text("bairro"), city: text(kind === "cep" ? "localidade" : "municipio"), state: text("uf"), ...(kind === "cnpj" ? { number: text("numero"), complement: text("complemento") } : {}) }, kind, expected);
      setMessage("Consulta concluída. Revise os campos antes de salvar; os já preenchidos foram preservados.");
    } catch {
      if (request.current === controller) setMessage("Não foi possível consultar. Tente novamente ou preencha manualmente.");
    } finally { window.clearTimeout(timer); }
  }

  return <>
    <label>CNPJ<input value={value.cnpj ?? ""} autoCapitalize="characters" maxLength={18} onChange={(event) => onChange("cnpj", maskCompanyDocument(event.target.value))} onBlur={() => void lookup("cnpj")} /><button type="button" onClick={() => void lookup("cnpj")}>Consultar CNPJ</button></label>
    <label>Razão social<input value={value.businessName ?? ""} onChange={(event) => onChange("businessName", event.target.value)} /></label>
    <label>CEP<input value={value.cep ?? ""} inputMode="numeric" autoComplete="postal-code" maxLength={9} onChange={(event) => onChange("cep", event.target.value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2"))} onBlur={() => void lookup("cep")} /><button type="button" onClick={() => void lookup("cep")}>Consultar CEP</button></label>
    {([['street', 'Rua / avenida'], ['number', 'Número'], ['complement', 'Complemento'], ['district', 'Bairro'], ['city', 'Cidade'], ['state', 'UF']] as const).map(([key, label]) => <label key={key}>{label}<input value={value[key] ?? ""} maxLength={key === "state" ? 2 : 180} onChange={(event) => onChange(key, key === "state" ? event.target.value.replace(/[^a-z]/gi, "").toUpperCase() : event.target.value)} /></label>)}
    <p className="panel-helper">Consulta pública por Minha Receita e ViaCEP. Apenas CNPJ ou CEP é enviado ao serviço; CPF não é consultado.</p>
    <p role="status">{message}</p>
  </>;
}
