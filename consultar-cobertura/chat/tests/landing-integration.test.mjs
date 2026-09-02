import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("landing carrega o chat reutilizável sem iframe", () => {
  const landing = read("../../index.html");
  const embed = read("../embed.js");
  assert.match(landing, /chat\/chat\.css\?v=6/);
  assert.match(landing, /type="module" src="\/consultar-cobertura\/chat\/embed\.js\?v=18"/);
  assert.match(embed, /await import\("\.\/app\.js\?v=16"\)/);
  assert.doesNotMatch(embed, /iframe/i);
});

test("versão nova invalida o cache dos módulos internos críticos", () => {
  const app = read("../app.js");
  const frictionFlow = read("../flow-friction-v2.js");
  const flow = read("../flow.js");
  const bridge = read("../hero-bridge.js");
  for (const moduleName of ["ai-service", "knowledge", "message-router", "state", "tracking", "ui", "whatsapp"]) {
    assert.match(app, new RegExp(`\\./${moduleName}\\.js\\?v=9`));
  }
  assert.match(app, /\.\/config\.js\?v=10/);
  assert.match(app, /\.\/integrations\.js\?v=10/);
  assert.match(app, /\.\/flow-friction-v2\.js\?v=5/);
  assert.match(app, /\.\/hero-bridge\.js\?v=4/);
  assert.match(frictionFlow, /\.\/flow\.js\?v=12/);
  assert.match(frictionFlow, /\.\/plans\.js\?v=10/);
  assert.match(flow, /\.\/plans\.js\?v=10/);
  assert.match(bridge, /\.\/plans\.js\?v=10/);
  assert.match(flow, /\.\/parser\.js\?v=10/);
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
  assert.match(app, /chat-backdrop[\s\S]*closeChat/);
  assert.match(app, /event\.key !== "Escape"/);
  assert.match(ui, /backdrop\?\.classList\.add\("is-open"\)/);
  assert.match(css, /\.chat-backdrop\.is-open/);
  assert.match(css, /transform: translate\(-50%, -50%\) scale\(1\)/);
});

test("hero em andamento é importado pelo chat e permite continuar ou voltar", () => {
  const app = read("../app.js");
  const bridge = read("../hero-bridge.js");
  assert.match(app, /readHeroSnapshot\(\)/);
  assert.match(app, /applyHeroSnapshotToSession\(session, snapshot\)/);
  assert.match(app, /Continuar preenchendo aqui/);
  assert.match(app, /Voltar para o formulário/);
  assert.match(app, /syncChatSessionToHero\(session\)/);
  assert.match(bridge, /stage === 3/);
  assert.match(bridge, /STATES\.CPF/);
  assert.match(bridge, /STATES\.VENCIMENTO/);
  assert.match(bridge, /coverageViable/);
});

test("sincronização Hero para Chat não envia dados pessoais ao contexto da IA", () => {
  const ai = read("../ai-service.js");
  assert.doesNotMatch(ai, /context:\s*\{[\s\S]*cpf:/);
  assert.doesNotMatch(ai, /context:\s*\{[\s\S]*telefone:/);
  assert.doesNotMatch(ai, /context:\s*\{[\s\S]*email:/);
  assert.match(ai, /selectedPlan/);
  assert.match(ai, /coverageStatus/);
});

test("mobile mantém o modal acima do hero e respeita a área segura", () => {
  const css = read("../chat.css");
  const legacyLanding = read("../../coverage-base.html");
  assert.match(css, /\.chat-backdrop \{[\s\S]*z-index: 2147483500/);
  assert.match(css, /\.chat-panel \{[\s\S]*z-index: 2147483501/);
  assert.match(css, /top: max\(8px, env\(safe-area-inset-top\)\)/);
  assert.match(css, /bottom: max\(8px, env\(safe-area-inset-bottom\)\)/);
  assert.match(legacyLanding, /viewport-fit=cover/);
});

test("banner inicial não depende de imagem ausente", () => {
  const legacyLanding = read("../../coverage-base.html");
  assert.doesNotMatch(legacyLanding, /hero-conectando\.png/);
  assert.match(
    legacyLanding,
    /id="hero-fallback" class="hero-content-fallback container" style="display:block;"/
  );
});

test("campos mobile usam 16px e evitam o zoom automático do Safari", () => {
  const css = read("../chat.css");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.webturbo-chat-root input,[\s\S]*font-size: 16px/);
});

test("confirmação do endereço mantém as ações dentro do próprio card", () => {
  const app = read("../app.js");
  const ui = read("../ui.js");
  const css = read("../chat.css");
  assert.match(ui, /address-confirmation-actions/);
  assert.match(ui, /label: "Está correto", action: "confirm-address"/);
  assert.match(ui, /label: "Corrigir endereço", action: "new-address"/);
  assert.match(app, /chat-messages"\)\.addEventListener\("click", handleActionClick\)/);
  assert.match(css, /\.address-confirmation-actions/);
});

test("opções rápidas ficam visíveis dentro da conversa até a próxima etapa", () => {
  const ui = read("../ui.js");
  assert.match(ui, /className,? "chat-inline-actions"|"chat-inline-actions"/);
  assert.match(ui, /selection\.appendChild\(wrap\)/);
  assert.match(ui, /messages\.appendChild\(selection\)/);
  assert.match(ui, /chat-inline-actions, \.chat-inline-date/);
});

test("seletor de data também fica dentro da conversa", () => {
  const ui = read("../ui.js");
  assert.match(ui, /"chat-inline-date"/);
  assert.match(ui, /dateInput\.id = "installation-date-input"/);
  assert.match(ui, /messages\.appendChild\(selection\)/);
});

test("cards de planos viáveis são renderizados dentro da conversa", () => {
  const ui = read("../ui.js");
  assert.match(ui, /chat-plan-selection/);
  assert.match(ui, /messages\.appendChild\(selection\)/);
  assert.match(ui, /card\.dataset\.action\s*=\s*["']select-plan["']/);
  assert.match(ui, /select-plan/);
});

test("landing esconde o layout antigo até o redesign do hero estar pronto", () => {
  const landing = read("../../index.html");
  const redesign = read("../../landing-hero-redesign.js");
  assert.match(landing, /meta-coverage-landing wt-hero-step1-active/);
  assert.match(landing, /wt-hero-step1-active:not\(\.wt-hero-ready\)/);
  assert.match(
    landing,
    /replace: '<!-- Leaflet JS -->', '<script src="\/consultar-cobertura\/landing-hero-redesign\.js\?v=5"><\/script><!-- Leaflet JS -->'/
  );
  const redesignIndex = landing.indexOf("landing-hero-redesign.js?v=5");
  const endScriptsIndex = landing.indexOf("regional-plans.js");
  assert.ok(redesignIndex >= 0 && redesignIndex < endScriptsIndex);
  assert.match(redesign, /document\.body\.classList\.add\("wt-hero-ready"\)/);
  assert.match(
    redesign,
    /if \(document\.body && byId\("etapa1"\) && byId\("meta-landing-title"\)\) \{\s*install\(\);/
  );
});

test("Leaflet usa o hash de integridade correspondente ao CSS publicado", () => {
  const legacyLanding = read("../../coverage-base.html");
  assert.match(
    legacyLanding,
    /leaflet\.css"[\s\S]*integrity="sha256-p4NxAoJBhIIN\+hmNHrzRCf9tD\/miZyoHS5obTRR9BMY="/
  );
});

test("produção não exibe aviso técnico e retomada não bloqueia o hero ao recarregar", () => {
  const embed = read("../embed.js");
  const app = read("../app.js");
  assert.match(embed, /id="chat-safety" class="chat-safety" hidden/);
  assert.match(embed, /id="resume-close"/);
  assert.match(app, /safetyNotice\.hidden = realSubmission/);
  assert.match(app, /resumeAvailable = true;[\s\S]*resumeDialog\.hidden = true/);
  assert.match(app, /function openChat\(\)[\s\S]*if \(resumeAvailable\)[\s\S]*showResume\(\)/);
  assert.match(app, /open: openChat/);
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
  assert.match(embed, /notificationMode: "real"/);
  assert.match(embed, /notificationEndpoint: "https:\/\/modal-easy-964927461432\.southamerica-east1\.run\.app"/);
  assert.match(embed, /PRODUCTION_AI_ASSIST_ENDPOINT/);
  assert.match(read("../runtime-config.js"), /webturbo-chat-ai-964927461432\.southamerica-east1\.run\.app\/api\/chat\/assist/);
  assert.match(config, /webturbo-crm-api-964927461432\.southamerica-east1\.run\.app\/api\/v1\/public\/site-pre-sales/);
  assert.match(config, /notificationEndpoint:[\s\S]*modal-easy-964927461432\.southamerica-east1\.run\.app/);
  assert.doesNotMatch(embed, /safe=1|debug=1/);
});

test("chat notifica o backend legado correto sem duplicar InitiateCheckout", () => {
  const app = read("../app.js");
  const flow = read("../flow.js");
  const integrations = read("../integrations.js");
  const legacyLanding = read("../../coverage-base.html");
  assert.match(app, /createCoverageNotificationService\(CHAT_CONFIG\)/);
  assert.match(flow, /coverageNotifications\.notify\(session, coverage/);
  assert.match(integrations, /action: viavel \? "notifyConsulta" : "notifyConsultaInviavel"/);
  assert.match(integrations, /skipInitiateCheckout: true/);
  assert.match(integrations, /coverage\?\.source !== "real"/);
  assert.match(legacyLanding, /const CLOUD_RUN_URL = "https:\/\/modal-easy-964927461432\.southamerica-east1\.run\.app"/);
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

test("ofertas de combate aguardam hesitação e não interrompem o chat", () => {
  const retention = read("../../retention-offers.js");
  assert.match(retention, /HESITATION_DELAY_MS\s*=\s*25000/);
  assert.match(retention, /showModal\("inatividade_planos"\)/);
  assert.match(retention, /activeStep\(\) !== 2/);
  assert.match(retention, /document\.body\.classList\.contains\("chat-open"\)/);
  assert.match(retention, /document\.getElementById\("mPlano"\)\?\.value/);
  assert.match(retention, /sessionGet\(SHOWN_FLAG\)/);
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
