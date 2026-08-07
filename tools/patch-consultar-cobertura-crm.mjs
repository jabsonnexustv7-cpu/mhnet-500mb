import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), "consultar-cobertura/index.html");
let source = readFileSync(file, "utf8");

if (source.includes("CRM_PRE_SALE_URL") && source.includes("fetch(CRM_PRE_SALE_URL")) {
  console.log("A integração com o WebTurbo CRM já está aplicada.");
  process.exit(0);
}

function replaceOnce(label, from, to) {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Trecho não encontrado: ${label}`);
  if (source.indexOf(from, index + from.length) >= 0 && label === "envio final") {
    throw new Error("O trecho do envio final apareceu mais de uma vez; patch interrompido por segurança.");
  }
  source = source.slice(0, index) + to + source.slice(index + from.length);
}

const nl = source.includes("\r\n") ? "\r\n" : "\n";

replaceOnce(
  "endpoint do CRM",
  `    const CLOUD_RUN_URL = "https://modal-easy-964927461432.southamerica-east1.run.app";${nl}`,
  `    const CLOUD_RUN_URL = "https://modal-easy-964927461432.southamerica-east1.run.app";${nl}` +
    `    const CRM_PRE_SALE_URL = "https://webturbo-crm-api-964927461432.southamerica-east1.run.app/api/v1/public/site-pre-sales";${nl}`
);

replaceOnce(
  "event_id estável",
  "        event_id:                `site_${Date.now()}_${Math.random().toString(36).slice(2)}`",
  "        event_id:                leadDadosPessoaisEventId || (leadDadosPessoaisEventId = `site_${Date.now()}_${Math.random().toString(36).slice(2)}`)"
);

replaceOnce(
  "origem WhatsApp pós CRM",
  '            origem_botao: "pos_envio_formulario_easy",',
  '            origem_botao: "pos_envio_formulario_crm",'
);

const finalSendFrom = [
  "        const response = await fetch(CLOUD_RUN_URL, {",
  '          method: "POST",',
  '          headers: { "Content-Type": "application/json" },',
  "          body: JSON.stringify(buildModalPayload())",
  "        });"
].join(nl);
const finalSendTo = finalSendFrom.replace("fetch(CLOUD_RUN_URL", "fetch(CRM_PRE_SALE_URL");
replaceOnce("envio final", finalSendFrom, finalSendTo);

const successFrom = [
  '          trackGA4("enviou_formulario_easy", {',
  "            plano: planoSelecionadoEvento,",
  "            valor: PLAN_VALUES[planoSelecionadoEvento] || 0,",
  '            cidade: $("mCidade").value.trim(),',
  '            uf: $("mUf").value.trim().toUpperCase(),',
  '            easy_ok: data.easyOk === true ? "sim" : "nao"',
  "          });"
].join(nl);
const successTo = [
  '          trackGA4("enviou_formulario_easy", {',
  "            plano: planoSelecionadoEvento,",
  "            valor: PLAN_VALUES[planoSelecionadoEvento] || 0,",
  '            cidade: $("mCidade").value.trim(),',
  '            uf: $("mUf").value.trim().toUpperCase(),',
  '            destino: "crm_webturbo",',
  '            crm_ok: data.ok === true ? "sim" : "nao",',
  '            pre_venda_criada: data.created === true ? "sim" : "ja_existia"',
  "          });"
].join(nl);
replaceOnce("analytics de sucesso", successFrom, successTo);

const attemptFrom = [
  '      trackGA4("tentou_enviar_formulario_easy", {',
  '        plano: $("mPlano") ? $("mPlano").value : "",',
  '        cidade: $("mCidade") ? $("mCidade").value.trim() : "",',
  '        uf: $("mUf") ? $("mUf").value.trim().toUpperCase() : ""',
  "      });"
].join(nl);
const attemptTo = [
  '      trackGA4("tentou_enviar_formulario_easy", {',
  '        plano: $("mPlano") ? $("mPlano").value : "",',
  '        cidade: $("mCidade") ? $("mCidade").value.trim() : "",',
  '        uf: $("mUf") ? $("mUf").value.trim().toUpperCase() : "",',
  '        destino: "crm_webturbo"',
  "      });"
].join(nl);
replaceOnce("analytics da tentativa", attemptFrom, attemptTo);

replaceOnce(
  "mensagem de erro",
  '        erroEl.textContent = "Falha de conexão. Verifique o endpoint do Cloud Run ou tente novamente.";',
  '        erroEl.textContent = "Falha de conexão com o WebTurbo CRM. Tente novamente em instantes.";'
);

if (!source.includes("fetch(CRM_PRE_SALE_URL")) throw new Error("O envio final não foi direcionado ao CRM.");
if (!source.includes('const CLOUD_RUN_URL = "https://modal-easy-')) throw new Error("O endpoint auxiliar antigo foi removido indevidamente.");

writeFileSync(file, source, "utf8");
console.log("Patch aplicado em consultar-cobertura/index.html.");
console.log("A consulta de cobertura e as notificações auxiliares permaneceram inalteradas; somente o envio final da pré-venda foi movido para o WebTurbo CRM.");
