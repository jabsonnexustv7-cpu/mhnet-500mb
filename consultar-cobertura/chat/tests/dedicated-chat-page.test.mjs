import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const html = read("../../../chat/index.html");
const css = read("../../../chat/chat-page.css");
const script = read("../../../chat/chat-page.js");

test("/chat reutiliza o motor de produção sem duplicar o formulário ou o CRM", () => {
  assert.match(html, /type="module" src="\/chat\/chat-page\.js\?v=1"/);
  assert.match(script, /await import\("\/consultar-cobertura\/chat\/embed\.js\?v=17"\)/);
  assert.match(script, /window\.webturboChat\?\.open\?\.\(\)/);
  assert.doesNotMatch(html, /id="mCpf"|id="mTelefone1"|site-pre-sales/);
  assert.doesNotMatch(script, /site-pre-sales|CRM_ENDPOINT|buildCrmPayload/);
});

test("/chat preserva as integrações de abandono, venda e catálogo regional", () => {
  assert.match(html, /lead-recovery-notification\.js\?v=9/);
  assert.match(html, /sale-completion-notification\.js\?v=2/);
  assert.match(html, /crm-error-normalizer\.js\?v=1/);
  assert.match(html, /chat\/plan-strategy\.js\?v=3/);
  assert.match(html, /chat\/due-date-ui-v2\.js\?v=1/);
});

test("/chat é uma variante mensurável e não indexada durante o teste", () => {
  assert.match(html, /name="robots" content="noindex,follow"/);
  assert.match(html, /"clarity","script","y5w2b7oe66"/);
  assert.match(html, /window\.clarity\("set", "page_variant", "chat_only"\)/);
  assert.match(html, /window\.clarity\("upgrade", "chat_only_traffic"\)/);
  assert.match(script, /page_variant: "chat_only"/);
  assert.match(script, /TRACKING_PARAMS/);
  assert.match(script, /params\.set\("page_variant", "chat_only_return"\)/);
});

test("/chat abre em tela cheia no mobile e mantém fallback para falha de carregamento", () => {
  assert.match(html, /class="chat-page-fallback"/);
  assert.match(html, /data-traditional-flow/);
  assert.match(css, /\.chat-dedicated \.chat-panel \{[\s\S]*right: max\(24px/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.chat-dedicated \.chat-panel \{[\s\S]*bottom: max\(8px, env\(safe-area-inset-bottom\)\)/);
  assert.match(script, /installPersistentReturnLink\(traditionalUrl\)/);
  assert.match(script, /document\.body\.classList\.add\("chat-page-ready"\)/);
});
