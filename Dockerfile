FROM node:18-alpine

WORKDIR /app

# Instalar dependências para compilação caso o sqlite3 exija build nativo
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

ENV PORT=3000
ENV DATA_DIR=/app/data

CMD ["npm", "start"]
