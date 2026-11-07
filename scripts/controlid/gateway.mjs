#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const localConfigPath = path.join(projectRoot, "config", "controlid-device.local.json");
const templateConfigPath = path.join(projectRoot, "config", "controlid-device.template.json");
const args = new Set(process.argv.slice(2));

function printHelp() {
  console.log([
    "Uso:",
    "  npm run controlid:check   verifica somente a rede e a interface web",
    "  npm run controlid:info    consulta informações autenticadas do equipamento",
    "  npm run controlid:pair    vincula este computador à academia usando um código de uso único",
    "",
    "A senha nunca é lida do arquivo de configuração. Para --info, informe-a apenas",
    "pela variável local CONTROLID_DEVICE_PASSWORD.",
    "Para --pair, o código pode ser informado por CONTROLID_PAIRING_TOKEN ou solicitado no terminal.",
  ].join("\n"));
}

function fail(message) {
  console.error(`Control iD: ${message}`);
  process.exitCode = 1;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function loadConfig() {
  const local = await readJson(localConfigPath);
  const template = await readJson(templateConfigPath);
  const deviceUrl = String(process.env.CONTROLID_DEVICE_URL || local?.deviceUrl || template?.deviceUrl || "").trim();
  if (!deviceUrl) throw new Error("defina CONTROLID_DEVICE_URL ou configure o perfil local");

  let parsed;
  try {
    parsed = new URL(deviceUrl);
  } catch {
    throw new Error("CONTROLID_DEVICE_URL não é uma URL válida");
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("CONTROLID_DEVICE_URL deve usar http ou https");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  parsed.search = "";
  parsed.hash = "";

  const configuredPort = Number(process.env.CONTROLID_DEVICE_PORT || local?.port || template?.port || parsed.port || 80);
  if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
    throw new Error("CONTROLID_DEVICE_PORT deve estar entre 1 e 65535");
  }
  if (!parsed.port) parsed.port = String(configuredPort);

  const configuredGatewayId = String(process.env.CONTROLID_GATEWAY_ID || local?.gatewayId || "").trim();
  return {
    baseUrl: parsed.toString().replace(/\/$/, ""),
    gatewayId: configuredGatewayId || `orquestra-fit-${randomUUID()}`,
    pairingEndpoint: String(process.env.CONTROLID_PAIRING_ENDPOINT || local?.pairingEndpoint || template?.pairingEndpoint || "").trim(),
    model: String(local?.model || template?.model || "Control iD"),
    firmware: String(local?.firmware || template?.firmware || "").trim(),
    login: String(process.env.CONTROLID_DEVICE_LOGIN || "").trim(),
    password: process.env.CONTROLID_DEVICE_PASSWORD || "",
    timeoutMs: Math.min(Math.max(Number(process.env.CONTROLID_DEVICE_TIMEOUT_MS || 8000), 1000), 30000),
  };
}

async function pairingToken() {
  const fromEnv = String(process.env.CONTROLID_PAIRING_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) throw new Error("informe CONTROLID_PAIRING_TOKEN ao executar sem terminal interativo");
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await terminal.question("Cole o código de pareamento (não será salvo): ")).trim();
  } finally {
    terminal.close();
  }
}

async function request(config, endpoint, options = {}, session) {
  const url = new URL(endpoint, `${config.baseUrl}/`);
  if (session) url.searchParams.set("session", session);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/html;q=0.9",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { response, body };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`tempo esgotado após ${config.timeoutMs} ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function probe(config) {
  const { response, body } = await request(config, "/");
  const isControlId = /control\s*i\s*d/i.test(body);
  return { reachable: true, status: response.status, controlIdInterface: isControlId };
}

async function login(config) {
  if (!config.login || !config.password) {
    throw new Error("credenciais ausentes; informe CONTROLID_DEVICE_LOGIN e CONTROLID_DEVICE_PASSWORD somente no computador local");
  }
  const { body } = await request(config, "/login.fcgi", {
    method: "POST",
    body: JSON.stringify({ login: config.login, password: config.password }),
  });
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("resposta de login inválida");
  }
  if (typeof parsed.session !== "string" || parsed.session.length < 8) throw new Error("login recusado pelo equipamento");
  return parsed.session;
}

async function pair(config) {
  if (!config.pairingEndpoint) throw new Error("endpoint de pareamento ausente; configure CONTROLID_PAIRING_ENDPOINT");
  const token = await pairingToken();
  if (!token) throw new Error("código de pareamento vazio");
  const response = await fetch(config.pairingEndpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      gatewayId: config.gatewayId,
      deviceUrl: config.baseUrl,
      devicePort: Number(new URL(config.baseUrl).port || 80),
      model: config.model,
      firmware: config.firmware || null,
    }),
  });
  const body = await response.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = null; }
  if (!response.ok) throw new Error(parsed?.error || `pareamento recusado (HTTP ${response.status})`);
  return parsed;
}

function safeSystemInfo(value) {
  const network = value?.network && typeof value.network === "object" ? value.network : {};
  return {
    serial: typeof value?.serial === "string" ? value.serial : null,
    firmware: typeof value?.version === "string" ? value.version : null,
    deviceId: typeof value?.device_id === "string" ? value.device_id : null,
    online: Boolean(value?.online),
    onlineAvailable: Boolean(value?.online_available),
    network: {
      ip: typeof network.ip === "string" ? network.ip : null,
      port: Number.isInteger(network.web_server_port) ? network.web_server_port : null,
      sslEnabled: Boolean(network.ssl_enabled),
      dhcpEnabled: Boolean(network.dhcp_enabled),
    },
  };
}

async function main() {
  if (args.has("--help") || args.has("-h")) return printHelp();
  const mode = args.has("--info") ? "info" : args.has("--pair") ? "pair" : "check";
  const config = await loadConfig();
  const result = { mode, deviceUrl: config.baseUrl, model: config.model, accessCommandsEnabled: false };
  if (mode === "pair") {
    const paired = await pair(config);
    console.log(JSON.stringify({ mode, gatewayId: config.gatewayId, ...paired, accessCommandsEnabled: false }, null, 2));
    return;
  }
  result.probe = await probe(config);
  if (mode === "info") {
    const session = await login(config);
    const { body } = await request(config, "/system_information.fcgi", { method: "POST", body: "{}" }, session);
    let info;
    try {
      info = JSON.parse(body);
    } catch {
      throw new Error("resposta de informações do sistema inválida");
    }
    result.system = safeSystemInfo(info);
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => fail(error instanceof Error ? error.message : "falha desconhecida"));
