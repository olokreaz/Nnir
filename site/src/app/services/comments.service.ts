import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, map } from 'rxjs';
import { Comment } from '../models/comment';
import { LocalStorageBackend } from './storage';

/**
 * Комментарии. Пока — localStorage (заглушка, без авторизации можно писать от
 * имени «Гость»). ПР3: GET /api/comments?title=, POST /api/comments — сервис
 * уже отдаёт Observable, компоненты не меняются.
 */
@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly storage = new LocalStorageBackend<Comment[]>('nnir:comments', 180);
  private readonly comments$ = new BehaviorSubject<Comment[]>([]);

  readonly comments = this.comments$.asObservable();

  constructor() {
    this.storage.get('list').then((c) => this.comments$.next(c ?? []));
  }

  /** Комментарии конкретного тайтла: реактивно, свежие сверху. */
  byTitle(titleId: string): Observable<Comment[]> {
    return this.comments$.pipe(
      map((list) =>
        list
          .filter((c) => c.titleId === titleId)
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
      ),
    );
  }

  /** Добавить комментарий. На ПР3 author придёт из токена, не из формы. */
  add(titleId: string, text: string, authorName: string, authorColor: string): Observable<Comment> {
    const comment: Comment = {
      id: 'c-' + Math.random().toString(36).slice(2, 10),
      titleId,
      authorId: 'guest',
      authorName,
      authorColor,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      likes: 0,
    };
    const next = [...this.comments$.getValue(), comment];
    this.comments$.next(next);
    return from(this.storage.set('list', next).then(() => comment));
  }
}
