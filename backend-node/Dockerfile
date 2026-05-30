FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci && npx prisma generate
COPY . .
EXPOSE 10000
CMD ["node", "src/index.js"]
