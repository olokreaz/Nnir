import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { EMPTY, BehaviorSubject, Observable, map, shareReplay, tap } from 'rxjs';
import { Comment } from '../models/comment';
import { apiErrors } from './auth.service';
import { TokenStore } from './token-store';

/**
 * Комментарии (ПР3): живут на сервере.
 *   GET  /api/comments?title=…  — все, свежие сверху (публичный)
 *   POST /api/comments?title_id=… — только для залогиненных (автор из токена)
 * Чтение доступно гостю; публикация требует вход — мягко уводим на /auth.
 */
@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);
  private readonly router = inject(Router);

  private readonly comments$ = new BehaviorSubject<Comment[]>([]);

  /** Все комментарии текущего каталога. */
  readonly comments = this.comments$.asObservable();

  constructor() {
    this.reload();
  }

  /** Перечитать комментарии с сервера (после публикации — чтобы показать свежие). */
  private reload(): void {
    this.http.get<Comment[]>('/api/comments').pipe(apiErrors()).subscribe({
      next: (list) => this.comments$.next(list),
      error: () => {
        /* сеть недоступна — оставляем кеш */
      },
    });
  }

  /** Комментарии конкретного тайтла: реактивно, свежие сверху. */
  byTitle(titleId: string): Observable<Comment[]> {
    // Фоновая перезагрузка при подписке, чтобы всегда видеть актуальные чужие комментарии.
    this.reload();
    return this.comments$.pipe(
      map((list) => list.filter((c) => c.titleId === titleId)),
      shareReplay(1),
    );
  }

  /** Добавить комментарий; автор берётся из токена на сервере. */
  add(titleId: string, text: string, _authorName: string, _authorColor: string): Observable<Comment> {
    if (!this.tokens.get()) {
      // Гость → на страницу входа; не эмитим комментарий, чтобы форма не добавила пустышку.
      this.router.navigate(['/auth']);
      return EMPTY;
    }
    return this.http
      .post<Comment>('/api/comments', { text }, { params: { title_id: titleId } })
      .pipe(
        apiErrors(),
        tap((c) => this.comments$.next([c, ...this.comments$.getValue()])),
      );
  }
}