FROM node:26-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

FROM gcr.io/distroless/nodejs26-debian13:nonroot

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src

ENV PORT=3000
EXPOSE 3000

CMD ["src/index.mts"]
