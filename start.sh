#!/usr/bin/env bash
# Запускает сайт NNIR в Docker: собирает образ и поднимает контейнер.
set -euo pipefail

cd "$(dirname "$0")"

# Если пользователь попал в группу docker, но сессия её ещё не подхватила,
# запускаем себя заново через newgrp docker.
if ! docker info >/dev/null 2>&1 && grep -q '^docker:.*olokreaz' /etc/group 2>/dev/null; then
    echo "[start] сессия без группы docker — перезапускаю через newgrp docker"
    exec newgrp docker bash "$0"
fi

echo "[start] собираю образ..."
docker compose build

echo "[start] поднимаю контейнер..."
docker compose up -d

echo "[start] статус:"
docker compose ps

echo ""
echo "Сайт доступен на: http://localhost:8080"