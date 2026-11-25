import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, map, of } from 'rxjs';
import { LocalStorageBackend } from './storage';

/**
 * Лайки/избранное пользователя. Пока — localStorage (набор id тайтлов).
 * На ПР3: GET/POST /api/favorites, счётчик лайков тайтла придёт из каталога,
 * а этот сервис будет хранить «залайкано ли текущим пользователем».
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly storage = new LocalStorageBackend<string[]>('nnir:favorites', 120);
  private readonly ids$ = new BehaviorSubject<string[]>([]);

  /** Набор залайканных id. */
  readonly ids = this.ids$.asObservable();

  constructor() {
    this.storage.get('ids').then((ids) => this.ids$.next(ids ?? []));
  }

  /** Реактивно: залайкан ли тайтл (ждёт загрузку из хранилища). */
  isFavorite(id: string): Observable<boolean> {
    return this.ids$.pipe(map((ids) => ids.includes(id)));
  }

  /** Переключить лайк. Возвращает новое состояние (true — теперь лайк). */
  toggle(id: string): Observable<boolean> {
    const current = this.ids$.getValue();
    const liked = current.includes(id);
    const next = liked ? current.filter((x) => x !== id) : [...current, id];
    this.ids$.next(next);
    return from(this.storage.set('ids', next).then(() => !liked));
  }
}
