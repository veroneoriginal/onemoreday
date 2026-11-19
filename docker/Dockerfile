# Один файл, три цели. Сборка идёт из корня репозитория.

FROM python:3.12-slim AS backend
WORKDIR /app
COPY backend/server.py backend/age_calculator.py ./
ENV HOST=0.0.0.0
EXPOSE 8000
CMD ["python", "-u", "server.py"]

FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/index.html frontend/vite.config.js frontend/style.css ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

FROM nginx:1.27-alpine AS frontend
COPY --from=frontend-build /app/dist /usr/share/nginx/html

FROM nginx:1.27-alpine AS nginx
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
