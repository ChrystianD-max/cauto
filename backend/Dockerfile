FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY seed ./seed
COPY scripts ./scripts
ENV NODE_ENV=staging
EXPOSE 4000
CMD ["node", "src/server.js"]
