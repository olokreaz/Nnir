# ===== Стадия 1: сборка Angular-приложения =====
FROM node:22-alpine AS build
WORKDIR /app

# Кэш npm: сначала только package-файлы
COPY site/package.json site/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Исходники и сборка
COPY site/ ./
RUN npm run build

# ===== Стадия 2: nginx раздаёт статику =====
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/site/browser/ /usr/share/nginx/html/
EXPOSE 80