# NNIR — каталог фильмов и сериалов

Учебный проект: 4 практических работы. Git-репозиторий один, стадии
размечаются тегами.

## Быстрый запуск

```bash
./start.sh
```

Скрипт собирает оба контейнера и запускает их: `web` (Angular → nginx, SPA
и постеры) и `api` (FastAPI + SQLite). Сайт открывается на http://localhost:8080

Вручную:

```bash
docker compose build
docker compose up -d
```

## Структура проекта

```
it/
├── site/             # Angular-приложение (ПР2+)
│   ├── src/app/
│   │   ├── models/        # Title, User, Comment
│   │   ├── services/      # CatalogService, AuthService, FavoritesService,
│   │   │                  # CommentsService, WatchHistoryService, TokenStore,
│   │   │                  # auth.interceptor, storage
│   │   ├── components/    # переиспользуемый title-card (постер + лайк)
│   │   └── pages/         # каталог, категория, поиск, детальная, избранное, /auth, 404
│   ├── public/fonts/        # Inter локально (сборка не зависит от интернета)
│   └── public/img/          # постеры + кадры (stills/)
├── sites/            # старый статический прототип ПР1 (HTML)
├── assets/           # постеры и css (копия для прототипа)
├── backend/          # сервер ПР3: FastAPI + SQLite (app.py, Dockerfile)
├── data/             # данные (ПР2)
├── tools/            # локальные инструменты сборки (не в git)
├── Dockerfile        # сборка Angular → nginx (статический фронт)
├── nginx.conf        # раздаёт SPA и проксирует /api/ → backend
├── docker-compose.yml # web (nginx) + api (FastAPI), volume для БД
├── start.sh          # запуск одной командой
└── .gitignore
```

## Сервер и база данных (ПР3)

Бэкенд — FastAPI + SQLite (один файл `backend/app.py`, прямой SQL, без ORM).
При первом старте БД засеивается каталогом из `site/public/catalog.json`
(20 тайтлов). Схема: `users`, `sessions`, `titles`, `favorites`, `comments`,
`watch_progress`. Пароли хранятся pbkdf2-хешем, авторизация — по Bearer-токену.

Фронт ходит на относительный `/api/...` — nginx проксирует его на FastAPI,
поэтому источник данных и постеры согласованы, CORS не нужен.

Регистрация двухшаговая: `POST /api/auth/register` «отправляет» 6-символьный
код → `POST /api/auth/verify` создаёт аккаунт и выдаёт токен → `login`/`logout`.

Данные пользователя: лайки (`favorites`), комментарии (автор из токена),
история просмотра (`watch_progress`) — всё хранится на сервере и привязано
к пользователю. Http-перехватчик (`auth.interceptor.ts`) сам подставляет
`Authorization: Bearer` в запросы.

Каталог перечитывается каждые 30 секунд и при фокусе вкладки — новые тайтлы
подхватываются без перезагрузки («само подтягивающиеся новинки»).

## Стадии (практические работы)

| Стадия | Описание | Тег |
|--------|----------|-----|
| ПР1 | Страницы сайта: разметка, оформление, навигация (статический HTML) | `v1-pr1` |
| ПР2 | Моделирование страниц, работа с внешним источником данных (Angular) | `v2-pr2` |
| ПР3 | Сервер и база данных | `v3-pr3` |
| ПР4 | Развёртывание приложения | `v4-pr4` |

## Как отметить следующую стадию

```bash
git add -A
git commit -m "ПР2: ..."
git tag -a v2-pr2 -m "ПР2: ..."
```