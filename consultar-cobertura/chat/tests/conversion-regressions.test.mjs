import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const recovery = readFileSync(new URL("../../lead-recovery-notification.js", import.meta.url), "utf8");
const finalizer = readFileSync(new URL("../../conversion-finalizer-v4.js", import.meta.url), "utf8");

test("final purchase forwards TikTok attribution to the CRM", () => {
  assert.match(finalizer, /ttclid:\s*tiktokClickId\(\)/);
  assert.match(finalizer, /ttp:\s*cookie\("_ttp"\)/);
  assert.match(finalizer, /webturbo_tiktok_attribution/);
});
const postSaleWhatsApp = readFileSync(new URL("../../post-sale-whatsapp.js", import.meta.url), "utf8");
const chatEmbed = readFileSync(new URL("../embed.js", import.meta.url), "utf8");
const coverage = readFileSync(new URL("../../coverage-base.html", import.meta.url), "utf8");
const landing = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("Telegram possui um único controlador e uma identidade comum entre Hero e Chat", () => {
  assert.match(recovery, /const SENT_PREFIX = "wt_lead_recovery_sent_v9:"/);
  assert.match(recovery, /function buildKey\(cpf, phone\)/);
  assert.doesNotMatch(recovery, /function buildKey\(source,/);
  assert.match(recovery, /const etapa = "whatsapp_principal_concluido"/);
  assert.match(recovery, /key: buildKey\(cpf, telefone1\)/g);
  assert.match(recovery, /payload\?\.action === "notifyAbandonoModal"[\s\S]*payload\?\.evento !== "lead_recuperacao_dados_completos"/);
  assert.doesNotMatch(finalizer, /sendRecoveryNow|TELEGRAM_ENDPOINT|telegramSent/);
});

test("deduplicação é registrada antes da chamada de rede", () => {
  const sendStart = recovery.indexOf("async function send(lead");
  const mark = recovery.indexOf("markSent(lead.key)", sendStart);
  const fetchCall = recovery.indexOf("fetch(ENDPOINT", sendStart);
  assert.ok(sendStart >= 0 && mark > sendStart && fetchCall > mark);
});

test("somente o 11º dígito dispara e Hero/Chat geram uma requisição", async () => {
  const values = {
    mNome: "Cliente Teste", mCpf: "52998224725", mNascimento: "1990-01-01",
    mTelefone1: "5199999999", mTelefone2: "51888888888", mEmail: "cliente@example.com",
    mPlano: "FIBRA 500MB", mCep: "90000000", mNumero: "10", mLogradouro: "Rua Teste",
    mBairro: "Centro", mCidade: "Porto Alegre", mUf: "RS", mComplemento: "",
    mPontoRef: "", mVencimento: "10", mCoordenadasFixas: "", mLatitudeFixa: "",
    mLongitudeFixa: "", mEnderecoDetectadoLocalizacao: "", mLinkLocalizacaoFixa: ""
  };
  const storage = new Map();
  let calls = 0;
  const context = {
    console,
    Response,
    navigator: { userAgent: "teste" },
    location: { href: "https://webturbo-internet.com.br/consultar-cobertura/" },
    document: {
      visibilityState: "visible",
      getElementById(id) { return { value: values[id] || "" }; },
      addEventListener() {}
    },
    sessionStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({ ok: true, telegramSent: true }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    },
    setTimeout() { return 1; },
    setInterval() { return 1; },
    addEventListener() {},
    webturboChat: {
      getSession() {
        return {
          sessionId: "chat-teste", nome: values.mNome, cpf: values.mCpf,
          dataNascimento: values.mNascimento, email: values.mEmail, telefone: values.mTelefone1,
          telefoneSecundario: values.mTelefone2, plano: { title: values.mPlano }, cep: values.mCep,
          numero: values.mNumero, logradouro: values.mLogradouro, bairro: values.mBairro,
          cidade: values.mCidade, uf: values.mUf, cobertura: { viavel: true }
        };
      }
    }
  };
  context.window = context;
  vm.runInNewContext(recovery, context);
  context.webturboLeadRecovery.check("telefone_com_10_digitos");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 0);
  values.mTelefone1 = "51999999999";
  context.webturboLeadRecovery.check("teste_concorrente");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 1);
});

test("payload final do CRM respeita instalação obrigatória e recupera rejeição de e-mail", () => {
  assert.match(finalizer, /dataInstalacao1:[^\n]*\|\| tomorrowISO\(\)/);
  assert.match(finalizer, /turnoInstalacao1:[^\n]*: "Manhã"/);
  assert.match(finalizer, /details\.some\(\(detail\) => detail\?\.path === "emailCliente"\)/);
  assert.match(finalizer, /delete retryPayload\.emailCliente/);
  assert.match(finalizer, /const \{ response, data \} = await postCrm\(payload\)/);
});

test("cobertura viável transfere coordenadas para o pedido antes de avançar", () => {
  assert.match(
    coverage,
    /modalCoverageData = coberturaPaginaData\.cobertura;\s*aplicarCoordsCoberturaNoMapa\(\);\s*\$\("coverageOkBox"\)/
  );
  assert.match(
    coverage,
    /modalCoverageData = res;\s*aplicarCoordsCoberturaNoMapa\(\);\s*\$\("coverageOkBox"\)/
  );
  assert.match(
    coverage,
    /saveModalLocationFields\(coords\.lat, coords\.lng, "Coordenadas retornadas pela consulta de cobertura\."\)/
  );
  assert.match(finalizer, /coordenadasFixas: coords, coordenadas: coords, coords,/);
});

test("CRM é repetido sem o e-mail opcional quando esse for o único campo rejeitado", async () => {
  const match = finalizer.match(/async function postCrm\(payload\) \{[\s\S]*?\r?\n  \}\r?\n\r?\n  async function submitOrder/);
  assert.ok(match);
  const postCrmSource = match[0].replace(/\r?\n\r?\n  async function submitOrder$/, "");
  const bodies = [];
  const context = {
    CRM_ENDPOINT: "https://crm.test",
    track() {},
    window: {
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body);
        bodies.push(body);
        if (bodies.length === 1) {
          return new Response(JSON.stringify({
            error: { message: "Payload inválido.", details: [{ path: "emailCliente", message: "Invalid email address" }] }
          }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ ok: true, preSaleId: "pre-sale-test" }), {
          status: 201, headers: { "Content-Type": "application/json" }
        });
      }
    }
  };
  const postCrm = vm.runInNewContext(`${postCrmSource}; postCrm`, context);
  const result = await postCrm({ emailCliente: "rejeitado@example.com", event_id: "event_test" });
  assert.equal(result.response.status, 201);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].emailCliente, "rejeitado@example.com");
  assert.equal("emailCliente" in bodies[1], false);
  assert.equal(bodies[1].event_id, "event_test");
});

test("sucesso do CRM usa redirecionamento robusto e preserva fallback direto do WhatsApp", () => {
  assert.match(finalizer, /redirectAfterSuccessfulOrder\(\)/);
  assert.match(finalizer, /typeof window\.redirecionarWhatsAppFinal === "function"/);
  assert.doesNotMatch(finalizer, /setTimeout\(\(\) => window\.location\.assign\(buildWhatsUrl\(\)\)/);
  assert.match(postSaleWhatsApp, /const REDIRECT_DELAY_MS = 650/);
  assert.match(postSaleWhatsApp, /window\.setTimeout\(function \(\) \{[\s\S]*window\.location\.assign\(url\)[\s\S]*REDIRECT_DELAY_MS/);
  assert.match(postSaleWhatsApp, /button\.dataset\.webturboDirectWhatsapp = "true"/);
  assert.match(chatEmbed, /target\.dataset\.webturboDirectWhatsapp === "true"/);
  assert.match(chatEmbed, /element\.dataset\.webturboDirectWhatsapp === "true"/);
});

test("landing libera o formulário se o redesign falhar e prioriza vendas no Clarity", () => {
  assert.match(landing, /@keyframes wtHeroBootReveal\{to\{visibility:visible\}\}/);
  assert.match(landing, /visibility:hidden;animation:wtHeroBootReveal 0s 1500ms forwards/);
  assert.match(finalizer, /window\.clarity\?\.\("set", key, normalized\)/);
  assert.match(finalizer, /window\.clarity\?\.\("upgrade", reason\)/);
  assert.match(finalizer, /setClarityTag\("checkout_event_id", checkoutEventId\)/);
  assert.match(finalizer, /setClarityTag\("pre_sale_id", String\(data\.preSaleId\)\)/);
});

test("landing invalida o cache dos dois controladores corrigidos", () => {
  assert.match(landing, /lead-recovery-notification\.js\?v=9/);
  assert.match(landing, /post-sale-whatsapp\.js\?v=3/);
  assert.match(landing, /chat\/embed\.js\?v=18/);
  assert.match(landing, /conversion-finalizer-v4\.js\?v=7/);
});
