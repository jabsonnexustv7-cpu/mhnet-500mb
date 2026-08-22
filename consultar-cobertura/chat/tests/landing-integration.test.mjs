import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("landing carrega o chat reutilizável sem iframe", () => {
  const landing = read("../../index.html");
  const embed = read("../embed.js");
  assert.match(landing, /chat\/chat\.css\?v=3/);
  assert.match(landing, /type="module" src="\/consultar-cobertura\/chat\/embed\.js\?v=3"/);
  assert.match(embed, /await import\("\.\/app\.js"\)/);
  assert.doesNotMatch(embed, /iframe/i);
});

test("chat abre como modal na mesma página e possui retorno claro", () => {
  const embed = read("../embed.js");
  const app = read("../app.js");
  const ui = read("../ui.js");
  const css = read("../chat.css");

  assert.match(embed, /id="chat-backdrop"/);
  assert.match(embed, /role="dialog" aria-modal="true"/);
  assert.match(embed, /id="chat-close"/);
  assert.doesNotMatch(embed, /target="_blank"/);
  assert.match(app, /chat-backdrop[\s\S]*ui\.close/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(ui, /backdrop\?\.classList\.add\("is-open"\)/);
  assert.match(css, /\.chat-backdrop\.is-open/);
  assert.match(css, /transform: translate\(-50%, -50%\) scale\(1\)/);
});

test("launcher é compacto e localização externa não aparece na etapa inicial", () => {
  const embed = read("../embed.js");
  const css = read("../chat.css");
  const legacyLanding = read("../../coverage-base.html");

  assert.match(embed, /class="sr-only">Atendimento on-line/);
  assert.match(css, /\.chat-launcher \{[\s\S]*width: 54px;[\s\S]*height: 54px;/);
  assert.doesNotMatch(legacyLanding, /<button[^>]+id="btnNaoSeiCepModal"/);
});

test("configuração da landing ativa apenas os modos reais esperados", () => {
  const embed = read("../embed.js");
  const config = read("../config.js");
  assert.match(embed, /chatMode: "production"/);
  assert.match(embed, /aiMode: "openai"/);
  assert.match(embed, /coverageMode: "real"/);
  assert.match(embed, /crmMode: "real"/);
  assert.match(embed, /conversionMode: "real"/);
  assert.match(embed, /whatsappMode: "real"/);
  assert.match(embed, /webturbo-chat-ai-hydcvtcuga-rj\.a\.run\.app\/api\/chat\/assist/);
  assert.match(config, /webturbo-crm-api-964927461432\.southamerica-east1\.run\.app\/api\/v1\/public\/site-pre-sales/);
  assert.doesNotMatch(embed, /safe=1|debug=1/);
});

test("CTAs permanentes de WhatsApp são convertidos em atendimento on-line", () => {
  const embed = read("../embed.js");
  const legacyLanding = read("../../coverage-base.html");
  assert.match(embed, /Atendimento on-line/);
  for (const id of ["metaFloatingWhats", "botaoWhats", "botaoWhatsTopo", "btnContratarCobertura", "btnContinuarWhatsModal"]) {
    assert.match(embed, new RegExp(id));
  }
  assert.match(embed, /event\.preventDefault\(\)/);
  assert.match(embed, /event\.stopImmediatePropagation\(\)/);
  assert.match(embed, /a\[href\*='wa\.me'\]/);
  assert.doesNotMatch(legacyLanding, /redirecionarWhatsAppFinal/);
  assert.doesNotMatch(legacyLanding, /contadorWhats/);
});

test("avatar é usado no launcher, cabeçalho e mensagens da assistente", () => {
  const embed = read("../embed.js");
  const ui = read("../ui.js");
  assert.match(embed, /ASSISTANT_AVATAR = "\/consultar-cobertura\/chat\/assets\/webturbo-assistente\.png"/);
  assert.match(embed, /class="chat-launcher-avatar" src="\$\{ASSISTANT_AVATAR\}"/);
  assert.match(embed, /chat-header-avatar[\s\S]*Atendente virtual WebTurbo/);
  assert.match(ui, /message\.role === "assistant"[\s\S]*assistantAvatar\(\)/);
});

test("tracking do chat reutiliza tags existentes sem duplicar PageView", () => {
  const tracking = read("../tracking.js");
  assert.match(tracking, /const alreadyInstalled = typeof window\.gtag === "function"/);
  assert.match(tracking, /const alreadyInstalled = typeof window\.fbq === "function"/);
  assert.match(tracking, /if \(!alreadyInstalled\)[\s\S]*window\.fbq\("track", "PageView"\)/);
  assert.match(tracking, /chat_handoff_humano/);
});

test("CSS do chat não redefine o fundo global da landing", () => {
  const css = read("../chat.css");
  assert.match(css, /\.chat-lab, \.webturbo-chat-root/);
  assert.match(css, /body\.chat-lab \{/);
  assert.doesNotMatch(css, /\nbody \{\n/);
});

test("override temporário do laboratório não é versionado", () => {
  const lab = read("../../chat-lab.html");
  assert.doesNotMatch(lab, /WEBTURBO_CHAT_CONFIG/);
});
