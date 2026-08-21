FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./package.json
COPY services/chat-ai ./services/chat-ai
COPY tools/chat-ai ./tools/chat-ai
COPY consultar-cobertura/chat/ai-schema.js ./consultar-cobertura/chat/ai-schema.js
COPY consultar-cobertura/chat/knowledge.js ./consultar-cobertura/chat/knowledge.js
COPY consultar-cobertura/chat/state.js ./consultar-cobertura/chat/state.js

USER node
EXPOSE 8080

CMD ["node", "services/chat-ai/server.mjs"]
