import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const coverage = readFileSync(new URL("../../coverage-base.html", import.meta.url), "utf8");
const home = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");

function emailValidatorFrom(source) {
  const match = source.match(
    /function normalizeEmailForCrm[\s\S]*?\r?\n    }\r?\n\r?\n    function isValidEmail[\s\S]*?\r?\n    }/
  );
  assert.ok(match, "as funções de normalização e validação de e-mail devem existir");
  return vm.runInNewContext(`${match[0]}; isValidEmail`);
}

for (const [name, source] of [["cobertura", coverage], ["home", home]]) {
  test(`${name}: e-mail segue o mesmo contrato do CRM`, () => {
    const isValidEmail = emailValidatorFrom(source);
    assert.equal(isValidEmail(" CLIENTE@EXAMPLE.COM "), true);
    assert.equal(isValidEmail("cliente.nome+tag@example.com.br"), true);
    assert.equal(isValidEmail("cliente..nome@example.com"), false);
    assert.equal(isValidEmail("cliénte@example.com"), false);
    assert.equal(isValidEmail("cliente@dominio"), false);
  });

  test(`${name}: payload é validado e normalizado antes do POST ao CRM`, () => {
    assert.match(source, /emailCliente:\s+normalizeEmailForCrm\(\$\("mEmail"\)\.value\)/);
    assert.match(source, /const payload = buildModalPayload\(\);[\s\S]*validarPayloadCrmSite\(payload\)/);
    assert.match(source, /body: JSON\.stringify\(payload\)/);
    assert.match(source, /data\.error\?\.message/);
    assert.match(source, /details\.some\(\(detail\) => detail\?\.path === "emailCliente"\)/);
    assert.match(source, /delete retryPayload\.emailCliente/);
  });
}
