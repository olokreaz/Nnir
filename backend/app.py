"""NNIR — серверная часть (ПР3).

FastAPI + SQLite (std-модуль sqlite3, без ORM — SQL читается напрямую).
Таблицы:
  users          — аккаунты (пароль — pbkdf2-хеш)
  sessions       — активные токены (простой hex-токен; на ПР4 можно заменить на JWT)
  titles         — каталог: вся модель Title, массивы/объекты в JSON-колонках
  favorites      — лайк пользователя на тайтл (счётчик считается из этого)
  comments       — комментарии (автор из токена)
  watch_progress — «Продолжить просмотр» (перезапись с макс. 8 записей)

Статика (SPA, постеры, шрифты) отдаёт nginx; этот сервис — только JSON API.
Запуск:  uvicorn app:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import snowballstemmer
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

# --------------------------------------------------------------------------- #
#  Конфиг и подключение к БД
# --------------------------------------------------------------------------- #

BASE_DIR = Path(__file__).resolve().parent
# БД кладём в /srv/data в контейнере (volume) или рядом с app.py локально.
DB_PATH = Path(os.environ.get("NNIR_DB", BASE_DIR / "data.db"))
# Каталожные данные для seed — берём из фронтового каталога (локально в site/public,
# в контейнере копируется рядом с app.py). Ищем по нескольким путям.
CATALOG_CANDIDATES = [
    BASE_DIR / "catalog.json",
    BASE_DIR.parent / "site" / "public" / "catalog.json",
    BASE_DIR / "data" / "catalog.json",
]
CATALOG_JSON = next((p for p in CATALOG_CANDIDATES if p.exists()), CATALOG_CANDIDATES[0])
# Любое изменение пути .db и .db-wal выносим в volume — держим папку БД отдельно.
DB_DIR = DB_PATH.parent
DB_DIR.mkdir(parents=True, exist_ok=True)

# ВАЖНО: в учебном проекте запасной ключ не нужен — сессийные токены
# генерируются случайно и хранятся в БД, подписи нет. Секрет не хардкодим.


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def open_db() -> sqlite3.Connection:
    """Прямое соединение (для роутов, которые не используют Depends)."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    """Соединение на HTTP-запрос. FastAPI гоняет sync-роуты в threadpool,
    поэтому sqlite-соединение должно переживать переключение потока
    (check_same_thread=False) и закрываться после ответа."""
    conn = open_db()
    try:
        yield conn
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
#  Схема БД
# --------------------------------------------------------------------------- #

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_color TEXT NOT NULL,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token    TEXT PRIMARY KEY,
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS titles (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    year        INTEGER NOT NULL,
    genre       TEXT NOT NULL,
    rating      REAL NOT NULL,
    category    TEXT NOT NULL,
    description TEXT NOT NULL,
    poster      TEXT NOT NULL,
    duration    INTEGER,
    seasons     INTEGER,
    added_at    TEXT NOT NULL,
    cast_json      TEXT NOT NULL DEFAULT '[]',
    tags_json      TEXT NOT NULL DEFAULT '[]',
    awards_json    TEXT NOT NULL DEFAULT '[]',
    stills_json    TEXT NOT NULL DEFAULT '[]',
    ai_summary     TEXT,
    featured    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS favorites (
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, title_id)
);

CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    title_id    TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_color TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    likes       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS watch_progress (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title_id  TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    progress  INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, title_id)
);
"""


def init_db() -> None:
    conn = open_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


# --------------------------------------------------------------------------- #
#  Seed каталога из catalog.json (идемпотентный)
# --------------------------------------------------------------------------- #

def seed_titles() -> int:
    """Заполняет таблицу titles из catalog.json, если она пуста. Возвращает число вставленных."""
    if not CATALOG_JSON.exists():
        return 0
    data = json.loads(CATALOG_JSON.read_text(encoding="utf-8"))
    conn = open_db()
    count = conn.execute("SELECT COUNT(*) FROM titles").fetchone()[0]
    if count > 0:
        conn.close()
        return 0

    for t in data:
        conn.execute(
            """INSERT INTO titles
               (id, title, year, genre, rating, category, description, poster,
                duration, seasons, added_at, cast_json, tags_json, awards_json,
                stills_json, ai_summary, featured)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                t["id"], t["title"], t["year"], t["genre"], t["rating"], t["category"],
                t.get("description", ""), t.get("poster", ""),
                t.get("duration"), t.get("seasons"),
                t.get("addedAt", now_iso()),
                json.dumps(t.get("cast", []), ensure_ascii=False),
                json.dumps(t.get("tags", []), ensure_ascii=False),
                json.dumps(t.get("awards", []), ensure_ascii=False),
                json.dumps(t.get("stills", []), ensure_ascii=False),
                t.get("aiSummary"),
                1 if t.get("featured") else 0,
            ),
        )
    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM titles").fetchone()[0]
    conn.close()
    return total


# --------------------------------------------------------------------------- #
#  Поиск (ПР3): морфология, транслитерация, синонимы, все поля
# --------------------------------------------------------------------------- #
#
# Полноценный поиск поверх каталога:
#  - стемминг снежным комом для русского и английского — «инженерами» и
#    «инженер» дают один корень, «breaking» и «breaks» — тоже;
#  - транслитерация в обе стороны — запрос «interny» находит «Интерны»,
#    «аниме» находит «anime» (и наоборот);
#  - словарь синонимов — «смешной» находит «комедия», «боевик» — «экшен»;
#  - поиск по ВСЕМ текстовым полям: название, жанр, описание, актёры,
#    теги, номинации, AI-обзор;
#  - AND-логика по токенам запроса + релевантность (название > теги > описание).

_RU_STEMMER = snowballstemmer.stemmer("russian")
_EN_STEMMER = snowballstemmer.stemmer("english")

# Русская → латинская транслитерация (ГОСТ-подобная, нижний регистр).
_TRANSLIT_RU_LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

# Обратная латинская → русская (упрощённо, для частых окончаний).
_TRANSLIT_LAT_RU = {
    "zh": "ж", "ts": "ц", "ch": "ч", "sh": "ш", "sch": "щ", "yu": "ю", "ya": "я",
    "kh": "х", "a": "а", "b": "б", "v": "в", "g": "г", "d": "д", "e": "е",
    "z": "з", "i": "и", "y": "ы", "k": "к", "l": "л", "m": "м", "n": "н",
    "o": "о", "p": "п", "r": "р", "s": "с", "t": "т", "u": "у", "f": "ф",
    "h": "х", "c": "ц",
}


def translit_ru_to_lat(text: str) -> str:
    """«интерны» → «interny»."""
    out = []
    for ch in text.lower():
        if ch in _TRANSLIT_RU_LAT:
            out.append(_TRANSLIT_RU_LAT[ch])
        elif ch.isalnum():
            out.append(ch)
        else:
            out.append(" ")
    return "".join(out)


def translit_lat_to_ru(text: str) -> str:
    """«interny» → «интерны» (жадные двусложные соответствия)."""
    out, i = [], 0
    lower = text.lower()
    while i < len(lower):
        for digraph in ("zh", "ts", "ch", "sh", "sch", "yu", "ya", "kh"):
            if lower.startswith(digraph, i):
                out.append(_TRANSLIT_LAT_RU[digraph])
                i += len(digraph)
                break
        else:
            out.append(_TRANSLIT_LAT_RU.get(lower[i], lower[i]))
            i += 1
    return "".join(out)


# Синонимы: каноническое слово → набор эквивалентов (все стемлятся при индексации).
_SYNONYMS: dict[str, list[str]] = {
    "комедия": ["смешн", "смешно", "юмор", "прикол", "комедийный", "весёлый", "смешной"],
    "боевик": ["экшен", "action", "боевой", "перестрелк"],
    "ужасы": ["хоррор", "horror", "страшн", "мистика", "жутк"],
    "фантастика": ["sci-fi", "scifi", "научная фантастика", "космос", "футур"],
    "драма": ["серьёзн", "мелодрама", "переживан"],
    "триллер": ["напряжённ", "саспенс", "suspense", "детективн"],
    "аниме": ["японская анимация", "анимация", "мультфильм"],
    "детектив": ["расследован", "загадк", "сыщик"],
    "фэнтези": ["fantasy", "магическ", "волшебн"],
    "исторический": ["историчн", "эпох"],
    "любовь": ["романтика", "романтическ", "влюблён"],
}

_TOKEN_RE = re.compile(r"[a-zа-яё0-9]+")

# Стоп-слова: не участвуют в поиске (шумовые токены в описаниях и тегах).
_STOPWORDS = {
    "и", "в", "во", "на", "по", "с", "со", "к", "ко", "у", "о", "об", "от",
    "из", "за", "для", "до", "про", "не", "ни", "что", "как", "так", "же",
    "а", "но", "или", "это", "тот", "то", "все", "всё", "его", "её", "их",
    "он", "она", "оно", "они", "мы", "вы", "ты", "я", "бы", "ли", "вот",
    "где", "когда", "потому", "чтобы", "между", "над", "под", "перед", "при",
    "a", "an", "the", "of", "in", "on", "to", "for", "with", "and", "or",
    "at", "by", "from", "as", "is", "it", "its",
}

# Минимальная длина корня для «префиксного» совпадения (иначе «и» зацепит всё).
_PREFIX_MIN_LEN = 4


def stem_token(token: str) -> str:
    """Корень токена: русский или английский стеммер + транслит-варианты."""
    if any("\u0400" <= ch <= "\u04ff" for ch in token):
        return _RU_STEMMER.stemWord(token)
    return _EN_STEMMER.stemWord(token)


def expand_token(token: str) -> set[str]:
    """Все варианты слова для сопоставления: стем, транслиты, синонимы."""
    token = token.lower()
    variants = {stem_token(token)}
    variants.add(token)
    ru_lat = translit_ru_to_lat(token).strip()
    if ru_lat and ru_lat != token:
        variants.add(stem_token(ru_lat))
        variants.add(ru_lat)
    lat_ru = translit_lat_to_ru(token).strip()
    if lat_ru and lat_ru != token:
        variants.add(stem_token(lat_ru))
        variants.add(lat_ru)
    # Синонимы: если токен сам является синонимом — добавляем канон; если канон — синонимы.
    for canon, syns in _SYNONYMS.items():
        if token in syns or token == canon:
            variants.add(stem_token(canon))
            for s in syns:
                variants.add(stem_token(s))
    return variants


def tokenize(text: str) -> list[str]:
    """Слова из текста (нижний регистр, без стоп-слов)."""
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS]


# Категории: код → русская метка (для поиска «сериал», «аниме», «классика»).
_CATEGORY_LABELS = {
    "classic": "классика старые фильмы советское кино",
    "rus": "российские сериалы русские",
    "anime": "аниме японская анимация",
    "series": "зарубежные сериалы иностранные сериалы",
}


def build_title_text(t: dict) -> str:
    """Все текстовые поля тайтла одним текстом для индексации."""
    parts = [
        t.get("title", ""),
        t.get("genre", ""),
        t.get("description", ""),
        _CATEGORY_LABELS.get(t.get("category", ""), t.get("category", "")),
    ]
    parts.extend(t.get("cast") or [])
    parts.extend(t.get("tags") or [])
    for a in t.get("awards") or []:
        parts.append(f"{a.get('award', '')} {a.get('category', '')}")
    if t.get("aiSummary"):
        parts.append(t["aiSummary"])
    return " ".join(parts)


def title_index(t: dict) -> dict[str, set[str]]:
    """Токены тайтла по полям: field -> набор вариантов (стем+транслит+синонимы)."""
    fields: dict[str, set[str]] = {}
    title_text = t.get("title", "")
    genre = t.get("genre", "")
    tags = t.get("tags") or []
    rest = build_title_text(t)
    # Убираем из «всего» поля, продублированные в сильных — вес неважен, важна карта.
    fields["title"] = set(tokenize(title_text))
    fields["genre"] = set(tokenize(genre))
    fields["tags"] = set(tokenize(" ".join(tags)))
    fields["all"] = set(tokenize(rest))
    return fields


def _stem_match(query_variant: str, field_tokens: set[str]) -> bool:
    """Совпадает ли вариант запроса с корнем поля.
    Точное равенство — всегда; префиксное сравнение — только для достаточно
    длинных корней (иначе «и» зацепит «инженер», «интерны», «история»…)."""
    if query_variant in field_tokens:
        return True
    if len(query_variant) < _PREFIX_MIN_LEN:
        return False
    return any(
        len(s) >= _PREFIX_MIN_LEN and (s.startswith(query_variant) or query_variant.startswith(s))
        for s in field_tokens
    )


def search_titles(rows: list[dict], query: str) -> list[dict]:
    """Ищет тайтлы по запросу, возвращает с сортировкой по релевантности."""
    q = query.strip().lower()
    if not q:
        return rows
    q_tokens = tokenize(q)
    if not q_tokens:
        return []

    # Предрасчёт вариантов каждого токена запроса.
    q_variants = [expand_token(t) for t in q_tokens]

    scored: list[tuple[int, dict]] = []
    for t in rows:
        idx = title_index(t)
        # Поля считаются сильными (название/теги/жанр) или слабыми (всё остальное).
        strong = idx["title"] | idx["tags"] | idx["genre"]
        weak = idx["all"]
        hit = 0
        strong_hits = 0
        for variants in q_variants:
            if any(_stem_match(v, strong) for v in variants):
                hit += 1
                strong_hits += 1
                continue
            if any(_stem_match(v, weak) for v in variants):
                hit += 1
        if hit == len(q_variants):
            # Релевантность: сильные поля важнее, длинные совпадения важнее.
            score = strong_hits * 3 + (hit - strong_hits)
            score += len(q)  # более специфичный запрос — выше
            scored.append((score, t))

    scored.sort(key=lambda p: (-p[0], -p[1].get("rating", 0)))
    return [t for _, t in scored]


def hash_password(password: str) -> str:
    salt = secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100_000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    calc = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100_000)
    return hmac.compare_digest(calc.hex(), digest)


def row_to_user(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "name": row["name"], "email": row["email"], "avatarColor": row["avatar_color"]}


def auth_required(authorization: str | None = Header(default=None),
                  conn: sqlite3.Connection = Depends(get_db)) -> sqlite3.Row:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется авторизация (Bearer-токен).")
    token = authorization.split(" ", 1)[1].strip()
    row = conn.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?", (token,)
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Недействительный или истёкший токен.")
    return row


def title_row_to_dict(row: sqlite3.Row, conn: sqlite3.Connection, user_id: str | None = None) -> dict:
    """Строка titles → модель Title фронта + счётчик лайков из favorites."""
    likes = conn.execute("SELECT COUNT(*) FROM favorites WHERE title_id = ?", (row["id"],)).fetchone()[0]

    def loads(v, default):
        try:
            return json.loads(v) if v else default
        except json.JSONDecodeError:
            return default

    d = {
        "id": row["id"],
        "title": row["title"],
        "year": row["year"],
        "genre": row["genre"],
        "rating": row["rating"],
        "category": row["category"],
        "description": row["description"],
        "poster": row["poster"],
        "likes": likes,
        "addedAt": row["added_at"],
        "cast": loads(row["cast_json"], []),
        "tags": loads(row["tags_json"], []),
        "awards": loads(row["awards_json"], []),
        "stills": loads(row["stills_json"], []),
        "aiSummary": row["ai_summary"],
        "featured": bool(row["featured"]),
    }
    if row["duration"] is not None:
        d["duration"] = row["duration"]
    if row["seasons"] is not None:
        d["seasons"] = row["seasons"]
    return d


# --------------------------------------------------------------------------- #
#  Бизнес-модели (Pydantic)
# --------------------------------------------------------------------------- #

class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class VerifyIn(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class WatchIn(BaseModel):
    titleId: str
    progress: int = Field(ge=0, le=100)


# Простой реестр кодов подтверждения: email -> {code, expires_at} (в памяти).
# На ПР4: письмо на почту или запись в БД. Сейчас — только для демо-демонстрации:
# код возвращается в ответе, чтобы можно было пройти регистрацию.
REG_CODE_TTL_S = 600
reg_codes: dict[str, dict] = {}


# --------------------------------------------------------------------------- #
#  Приложение
# --------------------------------------------------------------------------- #

app = FastAPI(title="NNIR API", version="3.0.0", description="Каталог фильмов/сериалов — сервер (ПР3)")

# Прокси nginx работает на одном хосте, но CORS оставляем для прямого доступа к API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()
    inserted = seed_titles()
    if inserted:
        print(f"[seed] Каталог заполнен: {inserted} тайтлов из catalog.json")


# ------------------------------ Каталог ----------------------------------- #

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "nnir", "time": now_iso()}


@app.get("/api/titles")
def list_titles(conn: sqlite3.Connection = Depends(get_db)):
    rows = conn.execute("SELECT * FROM titles ORDER BY title COLLATE NOCASE").fetchall()
    return [title_row_to_dict(r, conn) for r in rows]


@app.get("/api/search")
def search(q: str = "", conn: sqlite3.Connection = Depends(get_db)):
    """Полноценный поиск: морфология (рус/англ), транслитерация, синонимы,
    все текстовые поля (название, жанр, теги, актёры, описание, номинации, AI).
    Без q возвращает весь каталог (совместимо с CatalogService)."""
    rows = conn.execute("SELECT * FROM titles").fetchall()
    titles = [title_row_to_dict(r, conn) for r in rows]
    return search_titles(titles, q)


@app.get("/api/titles/{title_id}")
def get_title(title_id: str, conn: sqlite3.Connection = Depends(get_db)):
    row = conn.execute("SELECT * FROM titles WHERE id = ?", (title_id,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Тайтл не найден")
    return title_row_to_dict(row, conn)


# ------------------------------ Авторизация --------------------------------- #

@app.post("/api/auth/register")
def register(body: RegisterIn):
    """Шаг 1: проверяем почту и «отправляем код» (в демо возвращаем его)."""
    email = body.email.lower()
    conn = open_db()
    try:
        exists = conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
        if exists:
            raise HTTPException(status.HTTP_409_CONFLICT, "Такой email уже зарегистрирован.")
    finally:
        conn.close()

    code = f"{secrets.randbelow(900000) + 100000}"
    reg_codes[email] = {
        "code": code, "name": body.name, "password": body.password,
        "expires": datetime.now(timezone.utc).timestamp() + REG_CODE_TTL_S,
    }
    return {"code": code}


@app.post("/api/auth/verify")
def verify(body: VerifyIn):
    """Шаг 2: проверка 6-символьного кода → создание аккаунта + токен."""
    # Код в POST без email — на ПР3 отправляется вместе с кодом; в демо ищем единственный
    # неистёкший код с совпадением. Для учебного проекта достаточно.
    now = datetime.now(timezone.utc).timestamp()
    match = None
    for email, rec in list(reg_codes.items()):
        if rec["code"] == body.code and rec["expires"] > now:
            match = (email, rec)
            break
    if match is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Неверный или истёкший код.")

    email, rec = match
    conn = open_db()
    try:
        user_id = "u-" + secrets.token_hex(8)
        color = pick_color(rec["name"])
        conn.execute(
            "INSERT INTO users (id, name, email, password_hash, avatar_color, created_at) VALUES (?,?,?,?,?,?)",
            (user_id, rec["name"], email, hash_password(rec["password"]), color, now_iso()),
        )
        token = new_session(conn, user_id)
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    finally:
        conn.close()
    del reg_codes[email]
    return {"user": row_to_user(user), "token": token}


def new_session(conn: sqlite3.Connection, user_id: str) -> str:
    token = "tok-" + secrets.token_hex(24)
    conn.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)", (token, user_id, now_iso()))
    return token


def pick_color(name: str) -> str:
    palette = ["#ff4d8d", "#b14cff", "#ff2e63", "#7c6cff", "#ff9f45", "#3ddc97"]
    h = sum(ord(ch) for ch in name) % 997
    return palette[h % len(palette)]


@app.post("/api/auth/login")
def login(body: LoginIn, conn: sqlite3.Connection = Depends(get_db)):
    user = conn.execute("SELECT * FROM users WHERE email = ?", (body.email.lower(),)).fetchone()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Аккаунт с такой почтой не найден.")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный пароль.")
    token = new_session(conn, user["id"])
    conn.commit()
    return {"user": row_to_user(user), "token": token}


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None), conn: sqlite3.Connection = Depends(get_db)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: sqlite3.Row = Depends(auth_required)):
    return row_to_user(user)


# ------------------------------ Избранное ---------------------------------- #

@app.get("/api/favorites")
def favorites(user: sqlite3.Row = Depends(auth_required), conn: sqlite3.Connection = Depends(get_db)):
    rows = conn.execute(
        "SELECT title_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC", (user["id"],)
    ).fetchall()
    return {"ids": [r["title_id"] for r in rows]}


@app.post("/api/titles/{title_id}/like")
def like(title_id: str, user: sqlite3.Row = Depends(auth_required), conn: sqlite3.Connection = Depends(get_db)):
    exists = conn.execute("SELECT 1 FROM titles WHERE id = ?", (title_id,)).fetchone()
    if exists is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Тайтл не найден")
    had = conn.execute(
        "SELECT 1 FROM favorites WHERE user_id = ? AND title_id = ?", (user["id"], title_id)
    ).fetchone()
    if had:
        conn.execute("DELETE FROM favorites WHERE user_id = ? AND title_id = ?", (user["id"], title_id))
        liked = False
    else:
        conn.execute("INSERT OR IGNORE INTO favorites (user_id, title_id, created_at) VALUES (?,?,?)",
                     (user["id"], title_id, now_iso()))
        liked = True
    conn.commit()
    likes = conn.execute("SELECT COUNT(*) FROM favorites WHERE title_id = ?", (title_id,)).fetchone()[0]
    return {"liked": liked, "likes": likes}


# ------------------------------ Комментарии --------------------------------- #

@app.get("/api/comments")
def comments(title: str = "", conn: sqlite3.Connection = Depends(get_db)):
    if title:
        rows = conn.execute(
            "SELECT * FROM comments WHERE title_id = ? ORDER BY created_at DESC", (title,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM comments ORDER BY created_at DESC").fetchall()
    return [
        {
            "id": r["id"], "titleId": r["title_id"], "authorId": r["author_id"],
            "authorName": r["author_name"], "authorColor": r["author_color"],
            "text": r["text"], "createdAt": r["created_at"], "likes": r["likes"],
        }
        for r in rows
    ]


@app.post("/api/comments")
def add_comment(body: CommentIn, title_id: str = "", user: sqlite3.Row = Depends(auth_required),
                conn: sqlite3.Connection = Depends(get_db)):
    if not title_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Нужен параметр ?title_id=")
    t = conn.execute("SELECT 1 FROM titles WHERE id = ?", (title_id,)).fetchone()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Тайтл не найден")
    cid = "c-" + secrets.token_hex(6)
    conn.execute(
        """INSERT INTO comments (id, title_id, author_id, author_name, author_color, text, created_at) VALUES (?,?,?,?,?,?,?)""",
        (cid, title_id, user["id"], user["name"], user["avatar_color"], body.text.strip(), now_iso()),
    )
    conn.commit()
    return {"id": cid, "titleId": title_id, "authorId": user["id"], "authorName": user["name"],
            "authorColor": user["avatar_color"], "text": body.text.strip(), "createdAt": now_iso(), "likes": 0}


# ------------------------------ История просмотра --------------------------- #

@app.get("/api/watch")
def watch(user: sqlite3.Row = Depends(auth_required), conn: sqlite3.Connection = Depends(get_db)):
    rows = conn.execute(
        """SELECT title_id, progress, updated_at FROM watch_progress
           WHERE user_id = ? ORDER BY updated_at DESC LIMIT 8""", (user["id"],)
    ).fetchall()
    return [{"titleId": r["title_id"], "progress": r["progress"], "updatedAt": r["updated_at"]} for r in rows]


@app.post("/api/watch")
def set_watch(body: WatchIn, user: sqlite3.Row = Depends(auth_required),
              conn: sqlite3.Connection = Depends(get_db)):
    t = conn.execute("SELECT 1 FROM titles WHERE id = ?", (body.titleId,)).fetchone()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Тайтл не найден")
    iso = now_iso()
    conn.execute(
        """INSERT INTO watch_progress (user_id, title_id, progress, updated_at) VALUES (?,?,?,?)
           ON CONFLICT(user_id, title_id) DO UPDATE SET progress = ?, updated_at = ?""",
        (user["id"], body.titleId, body.progress, iso, body.progress, iso),
    )
    conn.commit()
    return {"ok": True}


# Приложение слушает 0.0.0.0 — в контейнере доступно для nginx.
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)