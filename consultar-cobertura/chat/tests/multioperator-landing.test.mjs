import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("landing carrega a integração multioperadora antes dos complementos do funil", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /multioperator-coverage\.js\?v=2/);
  assert.match(html, /multioperator-coverage\.js[\s\S]*regional-plans\.js/);
});

test("integração centraliza os três fluxos, usa cache e envia códigos confiáveis", async () => {
  const script = await readFile(new URL("multioperator-coverage.js", root), "utf8");
  assert.match(script, /public\/site-coverage\/resolve/);
  assert.match(script, /webturbo_site_coverage_v1/);
  assert.match(script, /consultarCoberturaCloudRun\s*=\s*resolveCoverage/);
  assert.match(script, /consultarCoberturaCloudRunComFallback\s*=\s*resolveCoverage/);
  assert.match(script, /wtConsultarCoberturaEndpointComFallback\s*=\s*resolveCoverage/);
  assert.match(script, /payload\.operatorCode/);
  assert.match(script, /payload\.planCode/);
  assert.doesNotMatch(script, /Plano \$\{escapeHtml\(operatorName\)\}|Internet fibra óptica \$\{escapeHtml\(operatorName\)\}|Escolha seu plano \$\{operatorName\}/);
  assert.doesNotMatch(script, /supabase\.co\/functions\/v1\/tim-cobertura|TIM_COVERAGE_API_KEY|service_role/i);
});

test("chat usa o resolvedor público e inclui operadora e plano na pré-venda", async () => {
  const config = await readFile(new URL("chat/config.js", root), "utf8");
  const integrations = await readFile(new URL("chat/integrations.js", root), "utf8");
  assert.match(config, /public\/site-coverage\/resolve/);
  assert.match(integrations, /operatorCode:\s*session\.cobertura\?\.operator\?\.code/);
  assert.match(integrations, /planCode:\s*session\.plano\?\.id/);
});
