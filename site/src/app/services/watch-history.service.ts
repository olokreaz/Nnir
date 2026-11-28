import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, of, tap } from 'rxjs';
import { WatchProgress } from '../models/comment';
import { apiErrors } from './auth.service';
import { TokenStore } from './token-store';

/**
 * История просмотра для ленты «Продолжить просмотр» (ПР3): на сервере,
 * привязка к пользователю.
 *   GET  /api/watch  → [{titleId, progress, updatedAt}, …] (макс 8)
 *   POST /api/watch  → сохранить прогресс
 * Гость не имеет истории — лента просто пустая (no-op).
 */
@Injectable({ providedIn: 'root' })
export class WatchHistoryService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);

  private readonly progress$ = new BehaviorSubject<WatchProgress[]>([]);

  readonly progress = this.progress$.asObservable();

  constructor() {
    this.load();
  }

  private load(): void {
    if (!this.tokens.get()) {
      this.progress$.next([]);
      return;
    }
    this.http.get<WatchProgress[]>('/api/watch').pipe(apiErrors()).subscribe({
      next: (p) => this.progress$.next(p),
      error: () => this.progress$.next([]),
    });
  }

  /** Отметить просмотр тайтла (вызывается при открытии детальной). */
  touch(titleId: string, progress = 5): Observable<void> {
    if (!this.tokens.get()) return of(undefined);

    const list = this.progress$.getValue();
    const rest = list.filter((w) => w.titleId !== titleId);
    const next = [{ titleId, progress, updatedAt: new Date().toISOString() }, ...rest].slice(0, 8);
    this.progress$.next(next);

    return this.http
      .post<void>('/api/watch', { titleId, progress })
      .pipe(apiErrors(), map(() => undefined));
  }

  /** Тайтлы из истории (id + прогресс), свежие сверху. */
  snapshot(): WatchProgress[] {
    return this.progress$.getValue();
  }
}