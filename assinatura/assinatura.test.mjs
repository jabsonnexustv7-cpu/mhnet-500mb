import assert from "node:assert/strict";
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
  for (const fileName of [
    "selfie-documento.png",
    "validar-selfie.png",
    "frente-documento.png",
    "validar-documento.png"
  ]) {
    assert.equal(existsSync(join(testDirectory, "assets", "ajuda", fileName)), true);
    const escapedFileName = fileName.replaceAll(".", "\\.");
    assert.match(
      html,
      new RegExp(`src="assets/ajuda/${escapedFileName}" width="941" height="1672" loading="lazy" decoding="async" alt="[^"]+"`, "u")
    );
  }
});

test("IDs do HTML permanecem únicos", () => {
  const ids = Array.from(html.matchAll(/\sid="([^"]+)"/gu), (match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
