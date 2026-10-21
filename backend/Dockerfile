FROM node:20-alpine
WORKDIR /app
# Le lockfile est COPIE : le build installe exactement les versions verrouillees
# (npm ci) au lieu de resoudre les dernieres versions au hasard. Indispensable
# pour que les correctifs de securite (express/qs/proxy-addr) soient reellement
# appliques a l'image, et pour un build reproductible.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY seed ./seed
COPY scripts ./scripts
ENV NODE_ENV=staging
EXPOSE 4000
CMD ["node", "src/server.js"]
