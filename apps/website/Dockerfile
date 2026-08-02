FROM node:lts-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --registry=https://registry.npmmirror.com
COPY . .
RUN npx tsc
ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100
CMD ["npx", "tsx", "dist/index.js"]
