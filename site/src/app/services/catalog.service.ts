import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, fromEvent, interval, of, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';
import { Category, SortKey, Title } from '../models/title';

/**
 * Адрес источника данных каталога. ПР3: живой API-бэкенд, проксируется nginx
 * с того же origin (/api/...), поэтому постеры и данные согласованы, CORS не нужен.
 */
export const CATALOG_URL = '/api/titles';

/** Как часто переч��тывать каталог (эмуляция «само подтягивающихся» новинок). */
export const REFRESH_INTERVAL_MS = 30_000;

/**
 * Сервис каталога: лениво грузит JSON один раз, держит кеш и периодически
 * перечитывает источник. Если в источнике появились новые тайтлы — они
 * подхватываются автоматически (без перезагрузки страницы), как если бы их
 * добавил бэкенд. На ПР3 источником станет API, логика обновления не изменится.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  /** Полный каталог (последняя загруженная версия). */
  private readonly catalog$ = new BehaviorSubject<Title[]>([]);
  /** Новые id, обнаруженные при последнем авто-обновлении. */
  private readonly newcomers$ = new BehaviorSubject<string[]>([]);
  private readonly error$ = new BehaviorSubject<string | null>(null);
  private readonly loading$ = new BehaviorSubject(true);

  /** Публичные реактивные состояния. */
  readonly titles = this.catalog$.asObservable();
  readonly newIds = this.newcomers$.asObservable();
  readonly error = this.error$.asObservable();
  readonly loading = this.loading$.asObservable();

  /** Тайтлы, добавленные за последние 7 дней (для секции «Новинки»). */
  readonly recent = this.catalog$.pipe(
    map((items) =>
      items
        .filter((t) => {
          const age = Date.now() - new Date(t.addedAt).getTime();
          return age >= 0 && age < 7 * 24 * 3600 * 1000;
        })
        .sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt)),
    ),
  );

  /** «Выбор редакции». */
  readonly featured = this.catalog$.pipe(map((items) => items.filter((t) => t.featured)));

  constructor() {
    this.refresh().subscribe();

    // Само-подтягивание: таймер + возврат фокуса на вкладку.
    interval(REFRESH_INTERVAL_MS)
      .pipe(switchMap(() => this.refresh(true)))
      .subscribe();

    fromEvent(window, 'focus')
      .pipe(switchMap(() => this.refresh(true)))
      .subscribe();
  }

  /** Перечитать каталог из источника. quiet=true — не показывать скелетон. */
  refresh(quiet = false): Observable<Title[]> {
    if (!quiet) this.loading$.next(true);
    return this.http.get<Title[]>(CATALOG_URL).pipe(
      tap((items) => {
        const prev = this.catalog$.getValue();
        const prevIds = new Set(prev.map((t) => t.id));
        const fresh = items.filter((t) => !prevIds.has(t.id));
        if (fresh.length > 0) {
          this.newcomers$.next(fresh.map((t) => t.id));
        }
        this.catalog$.next(items);
        this.error$.next(null);
        this.loading$.next(false);
      }),
      catchError((err) => {
        this.error$.next('Не удалось загрузить каталог. Проверьте источник данных.');
        this.loading$.next(false);
        return throwError(() => err);
      }),
      // Только первичная ошибка попадает в подписку; авто-обновления молча терпят неудачу.
      shareReplay(1),
      startWith(this.catalog$.getValue()),
      filter((items) => items.length > 0),
    );
  }

  /** Каталог целиком (первый эмит — из кеша, если он уже загружен). */
  getCatalog(): Observable<Title[]> {
    return this.catalog$.pipe(filter((items) => items.length > 0));
  }

  /** Один тайтл по id (из кеша — мгновенно, без лишних запросов).
   * Пустой кеш не эмитит: ждём первую реальную загрузку каталога. */
  getById(id: string): Observable<Title | undefined> {
    return this.catalog$.pipe(
      filter((items) => items.length > 0),
      map((items) => items.find((t) => t.id === id)),
      distinctUntilChanged(),
    );
  }

  /** Тайтлы категории с сортировкой. */
  getByCategory(category: Category, sort: SortKey = 'popular'): Observable<Title[]> {
    return this.catalog$.pipe(
      filter((items) => items.length > 0),
      map((items) => items.filter((t) => t.category === category)),
      map((items) => sortTitles(items, sort)),
    );
  }

  /** Поиск по названию, жанру, году, категории. */
  search(query: string): Observable<Title[]> {
    const q = query.trim().toLowerCase();
    if (!q) return of([]);
    return this.catalog$.pipe(
      filter((items) => items.length > 0),
      map((items) =>
        items.filter((t) => {
          const year = String(t.year);
          return (
            t.title.toLowerCase().includes(q) ||
            t.genre.toLowerCase().includes(q) ||
            year.includes(q) ||
            t.category.includes(q) ||
            (t.cast ?? []).some((c) => c.toLowerCase().includes(q))
          );
        }),
      ),
    );
  }
}

/** Сортировка списка тайтлов по ключу. */
export function sortTitles(items: Title[], sort: SortKey): Title[] {
  const copy = [...items];
  switch (sort) {
    case 'popular':
      return copy.sort((a, b) => b.likes - a.likes || b.rating - a.rating);
    case 'rating':
      return copy.sort((a, b) => b.rating - a.rating);
    case 'year':
      return copy.sort((a, b) => b.year - a.year);
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    default:
      return copy;
  }
}
