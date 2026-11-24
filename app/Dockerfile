# Contexto de build = raiz do repositório:  docker build -f app/Dockerfile .
# ---------- dependências ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---------- imagem final (mínima, sem root) ----------
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 MIGRATIONS_DIR=/app/migrations
WORKDIR /app
# Atualiza pacotes do sistema e remove gerenciadores de pacote que não são usados em execução
# (menos superfície de ataque e menos CVEs para o Trivy: npm traz dezenas de dependências próprias).
# Baixa a cadeia de certificados oficial do RDS para validar o TLS do banco (sem rejectUnauthorized:false).
RUN apk upgrade --no-cache \
 && wget -q -O /app/rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
 && grep -q "BEGIN CERTIFICATE" /app/rds-ca.pem \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node app/package.json ./
COPY --chown=node:node app/src ./src
COPY --chown=node:node app/public ./public
COPY --chown=node:node app/scripts ./scripts
COPY --chown=node:node supabase/migrations ./migrations
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "src/server.js"]
