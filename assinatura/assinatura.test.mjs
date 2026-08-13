import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(testDirectory, "index.html"), "utf8");
const css = readFileSync(join(testDirectory, "assinatura.css"), "utf8");
const javascript = readFileSync(join(testDirectory, "assinatura.js"), "utf8");

function countMatches(source, pattern) {
  return Array.from(source.matchAll(pattern)).length;
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Trecho inicial não encontrado: ${start}`);
  assert.notEqual(endIndex, -1, `Trecho final não encontrado: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("o botão Ajuda acessível existe na barra da assinatura", () => {
  assert.match(html, /id="signatureHelpButton"[^>]*aria-label="Abrir ajuda para concluir a assinatura"/u);
  assert.match(html, /<span class="signature-help-label">Ajuda<\/span>/u);
  assert.match(css, /\.signature-help-button\s*\{[\s\S]*?min-height:\s*44px/u);
});

test("o painel de ajuda inicia fechado", () => {
  assert.match(html, /class="signature-help-modal" id="signatureFrameFallback" hidden/u);
});

test("o clique em Ajuda abre o painel", () => {
  assert.match(javascript, /signatureHelpButton\?\.addEventListener\("click", \(\) => \{\s*setSignatureHelpVisibility\(true\);/u);
  const visibilityFunction = sourceBetween(
    javascript,
    "function setSignatureHelpVisibility",
    "function loadSignatureFrame"
  );
  assert.match(visibilityFunction, /signatureFrameFallback\.hidden = false;/u);
});

test("Escape e o botão Entendi fecham o painel", () => {
  assert.match(javascript, /confirmSignatureHelpButton\?\.addEventListener\("click", \(\) => \{\s*setSignatureHelpVisibility\(false\);/u);
  assert.match(javascript, /event\.key === "Escape" && isHelpOpen[\s\S]*?setSignatureHelpVisibility\(false\);/u);
});

test("abrir e fechar a ajuda não altera o src do iframe", () => {
  const visibilityFunction = sourceBetween(
    javascript,
    "function setSignatureHelpVisibility",
    "function loadSignatureFrame"
  );
  assert.doesNotMatch(visibilityFunction, /signatureFrame\.(?:src|removeAttribute)/u);
  assert.doesNotMatch(visibilityFunction, /loadSignatureFrame\(/u);
});

test("somente um acordeão de ajuda permanece aberto", () => {
  const accordionLogic = sourceBetween(
    javascript,
    "helpAccordions.forEach",
    "if (hasOpenedHelpInThisSession())"
  );
  assert.match(accordionLogic, /otherDetailsElement !== detailsElement && otherDetailsElement\.open/u);
  assert.match(accordionLogic, /otherDetailsElement\.open = false;/u);
  assert.equal(countMatches(html, /class="help-accordion"/gu), 4);
});

test("as ações de recarregar e abrir diretamente reutilizam as rotinas existentes", () => {
  assert.match(html, /id="retrySignatureFrame"[^>]*>Recarregar assinatura<\/button>/u);
  assert.match(html, /id="openSignatureDirectly"[^>]*>Abrir assinatura diretamente<\/button>/u);
  assert.match(javascript, /retrySignatureFrameButton\?\.addEventListener\("click", loadSignatureFrame\);/u);
  assert.match(javascript, /window\.location\.assign\(validatedUrl\);/u);
});

test("a pulsação para após o primeiro acesso da sessão", () => {
  assert.match(html, /signature-help-button is-pulsing/u);
  assert.match(javascript, /sessionStorage\.setItem\(HELP_OPENED_SESSION_KEY, "1"\)/u);
  assert.match(javascript, /signatureHelpButton\?\.classList\.remove\("is-pulsing"\)/u);
});

test("o token de acesso é preservado no sessionStorage antes de sair da URL", () => {
  assert.match(javascript, /const PORTAL_TOKEN_SESSION_KEY = "webturbo-signature-portal-token";/u);
  const initialization = sourceBetween(
    javascript,
    "function initializePortalSession",
    "async function sendSignatureEvent"
  );
  const storeIndex = initialization.indexOf("storePortalToken(hashToken);");
  const replaceIndex = initialization.indexOf("history.replaceState");
  assert.notEqual(storeIndex, -1);
  assert.notEqual(replaceIndex, -1);
  assert.ok(storeIndex < replaceIndex);
  assert.match(initialization, /const storedToken = readStoredPortalToken\(\);/u);
  assert.match(initialization, /if \(storedToken\) \{[\s\S]*?void loadPortalSession\(portalToken\);/u);
});

test("sem token o portal não abre contrato demonstrativo", () => {
  assert.doesNotMatch(javascript, /DEMO_SIGNATURE_URL|demoMode|applyDemoPersonalization/u);
  const initialization = sourceBetween(
    javascript,
    "function initializePortalSession",
    "async function sendSignatureEvent"
  );
  assert.match(initialization, /sessionReady = false;/u);
  assert.match(initialization, /Este link de assinatura não é válido ou expirou\. Solicite um novo link de acesso\./u);
});

test("prefers-reduced-motion desativa a animação do botão Ajuda", () => {
  const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reducedMotion, /\.signature-help-button/u);
  assert.match(reducedMotion, /animation:\s*none !important/u);
});

test("o Clarity é instalado uma única vez com o projeto aprovado", () => {
  assert.equal(countMatches(html, /wz76kl230p/gu), 1);
  assert.equal(countMatches(html, /www\.clarity\.ms\/tag\//gu), 1);
});

test("eventos do Clarity usam apenas identificadores permitidos, sem dados pessoais", () => {
  const clarityHelper = sourceBetween(
    javascript,
    "function trackClarityEvent",
    "function hasOpenedHelpInThisSession"
  );
  assert.match(clarityHelper, /window\.clarity\("event", eventName\)/u);
  assert.doesNotMatch(clarityHelper, /token|nome|cpf|telefone|email|url|contrato/iu);

  for (const eventName of [
    "ajuda_aberta",
    "ajuda_fechada",
    "ajuda_comecar_aberta",
    "ajuda_camera_aberta",
    "ajuda_selfie_aberta",
    "ajuda_documento_aberta",
    "assinatura_recarregada",
    "assinatura_aberta_diretamente"
  ]) {
    assert.match(javascript, new RegExp(`"${eventName}"`, "u"));
  }
});

test("as quatro imagens locais estão referenciadas com dimensões e carregamento otimizado", () => {
  const imageHashes = {
    "selfie-documento.png": "43F8D1B0756C288D06E2CEC309DA297E4986878D45B502406EB5C3B5D9CE695E",
    "validar-selfie.png": "0A49DA39BF2B30648A591DD0807C805EDEFF3A91F17A81563BB16F19FB6C98D3",
    "frente-documento.png": "6BA282AA08EC774F455F1FF8CC13AE9BD6C0BDC8F98F17CF4C31E556F19EF872",
    "validar-documento.png": "D45AF047212F2CC75F4BB6AFB48550FE8857350263A270A03E8140C4A39D27C4"
  };

  for (const [fileName, expectedHash] of Object.entries(imageHashes)) {
    const imagePath = join(testDirectory, "assets", "ajuda", fileName);
    assert.equal(existsSync(imagePath), true);
    const escapedFileName = fileName.replaceAll(".", "\\.");
    assert.match(
      html,
      new RegExp(`class="help-image" src="assets/ajuda/${escapedFileName}" width="941" height="1672" loading="lazy" decoding="async" alt="[^"]+"`, "u")
    );
    assert.equal(
      createHash("sha256").update(readFileSync(imagePath)).digest("hex").toUpperCase(),
      expectedHash
    );
  }
});

test("as imagens usam limite responsivo compacto sem corte ou distorção", () => {
  const imageRule = sourceBetween(css, ".help-image {", ".help-image-grid figcaption");
  assert.match(css, /\.help-image-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/u);
  assert.match(imageRule, /width:\s*auto/u);
  assert.match(imageRule, /max-width:\s*100%/u);
  assert.match(imageRule, /max-height:\s*clamp\(280px, 46vh, 400px\)/u);
  assert.match(imageRule, /margin-inline:\s*auto/u);
  assert.match(imageRule, /object-fit:\s*contain/u);
  assert.equal(countMatches(html, /class="help-image"/gu), 4);
});

test("as orientações de selfie e documento permanecem completas e compactas", () => {
  const selfieSection = html.match(/data-clarity-event="ajuda_selfie_aberta"[\s\S]*?<ol class="help-steps">([\s\S]*?)<\/ol>/u)?.[1] ?? "";
  const documentSection = html.match(/data-clarity-event="ajuda_documento_aberta"[\s\S]*?<ol class="help-steps">([\s\S]*?)<\/ol>/u)?.[1] ?? "";
  assert.equal(countMatches(selfieSection, /<li>/gu), 4);
  assert.equal(countMatches(documentSection, /<li>/gu), 4);
  assert.match(selfieSection, /TIRAR SELFIE/u);
  assert.match(selfieSection, /ASSINAR/u);
  assert.match(documentSection, /frente/u);
  assert.match(documentSection, /verso/u);
});

test("o conteúdo rola sem o rodapé encobrir ações e mantém duas ações no celular", () => {
  const footerRule = sourceBetween(css, ".signature-help-sheet-footer {", ".signature-help-confirm");
  assert.doesNotMatch(footerRule, /position:\s*(?:fixed|absolute)/u);
  assert.match(css, /\.signature-help-content\s*\{[\s\S]*?overflow-y:\s*auto/u);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*?\.signature-frame-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/u);
  assert.match(css, /@media \(max-height: 500px\) and \(orientation: landscape\)/u);
});

test("IDs do HTML permanecem únicos", () => {
  const ids = Array.from(html.matchAll(/\sid="([^"]+)"/gu), (match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
