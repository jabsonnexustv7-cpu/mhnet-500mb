import { createOpenAiAssist } from "./openai-assist.mjs";

if (process.env.OPENAI_SMOKE_TEST !== "1") {
  console.error("Defina OPENAI_SMOKE_TEST=1 para autorizar explicitamente o teste real.");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  console.error("OPENAI_API_KEY e OPENAI_MODEL são obrigatórios para o smoke test.");
  process.exit(1);
}

const service = createOpenAiAssist({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL });
const result = await service.assist({
  sessionId: "smoke-test",
  step: "CPF",
  message: "A instalação é grátis?",
  context: {
    cidade: "Canoas",
    uf: "RS",
    coverageStatus: "VIAVEL",
    selectedPlan: "FIBRA 500MB (Combate)",
    selectedPlanValue: 89.9,
    availablePlans: [{ id: "FIBRA 500MB (Combate)", name: "500 Mega", speed: 500, price: 89.9, features: ["Instalação grátis", "Wi-Fi incluso"] }]
  }
});

console.log(JSON.stringify({ status: result.status, ok: result.body?.ok, type: result.body?.result?.type, latencyMs: result.body?.latencyMs }, null, 2));
process.exit(result.status === 200 ? 0 : 1);
