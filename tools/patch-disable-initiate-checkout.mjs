import fs from "node:fs";

const files = ["index.html", "consultar-cobertura/index.html"];
const oldSnippet = "skipInitiateCheckout: fluxoWhatsapp,";
const newSnippet = "skipInitiateCheckout: true,";

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");

  if (source.includes(newSnippet) && !source.includes(oldSnippet)) {
    console.log(`${file}: InitiateCheckout já está desativado.`);
    continue;
  }

  const matches = source.split(oldSnippet).length - 1;
  if (matches !== 1) {
    throw new Error(`${file}: esperado exatamente 1 ponto de alteração; encontrado ${matches}. Nenhum arquivo foi gravado neste passo.`);
  }

  const updated = source.replace(oldSnippet, newSnippet);
  fs.writeFileSync(file, updated, "utf8");
  console.log(`${file}: skipInitiateCheckout=true aplicado; notifyConsulta e demais rastreamentos foram preservados.`);
}

console.log("Patch concluído. Revise com git diff --check e git diff antes do commit.");
