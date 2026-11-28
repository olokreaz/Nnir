import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, map, of } from 'rxjs';
import { apiErrors } from './auth.service';
import { TokenStore } from './token-store';

/**
 * Лайки/избранное (ПР3): живут на сервере.
 *   GET  /api/favorites            → {ids: string[]}
 *   POST /api/titles/{id}/like     → {liked, likes}
 * Публичный интерфейс не изменился (ids/isFavorite/toggle→boolean), поэтому
 * карточка и страницы избранного не трогались. Для гостя лайк недоступен:
 * мягко уводим на /auth.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);
  private readonly router = inject(Router);

  private readonly ids$ = new BehaviorSubject<string[]>([]);

  /** Набор залайканных id текущего пользователя. */
  readonly ids = this.ids$.asObservable();

  constructor() {
    this.load();
  }

  /** Загрузить лайки (guest — пусто). */
  private load(): void {
    if (!this.tokens.get()) {
      this.ids$.next([]);
      return;
    }
    this.http.get<{ ids: string[] }>('/api/favorites').pipe(apiErrors()).subscribe({
      next: ({ ids }) => this.ids$.next(ids),
      error: () => {
        // Напр., если токен протух — молча сбрасываем.
        this.ids$.next([]);
      },
    });
  }

  /** Реактивно: залайкан ли тайтл. */
  isFavorite(id: string): Observable<boolean> {
    return this.ids$.pipe(map((ids) => ids.includes(id)));
  }

  /** Переключить лайк. Возвращает новое состояние (true — теперь лайк). */
  toggle(id: string): Observable<boolean> {
    if (!this.tokens.get()) {
      this.router.navigate(['/auth']);
      return of(false);
    }
    const current = this.ids$.getValue();
    const wasLiked = current.includes(id);
    // Оптимистично обновляем UI, сервер подтвердит.
    this.ids$.next(wasLiked ? current.filter((x) => x !== id) : [...current, id]);

    return this.http
      .post<{ liked: boolean }>(`/api/titles/${id}/like`, {})
      .pipe(
        apiErrors(),
        map((res) => {
          // Согласуем локальное состояние с ответом сервера.
          this.ids$.next(res.liked ? [...this.ids$.getValue(), id] : this.ids$.getValue().filter((x) => x !== id));
          return res.liked;
        }),
        catchError(() => {
          return of(false);
        }),
      );
  }
}