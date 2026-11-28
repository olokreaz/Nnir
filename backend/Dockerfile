FROM python:3.12-slim AS api
WORKDIR /srv
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Каталог копируем рядом с app.py — seed заполнит БД при первом старте.
COPY backend/app.py ./
COPY site/public/catalog.json ./catalog.json
# БД живёт в /srv/data (volume), задано через NNIR_DB в compose.
ENV NNIR_DB=/srv/data/data.db
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]