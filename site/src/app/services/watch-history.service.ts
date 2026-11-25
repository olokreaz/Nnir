import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { WatchProgress } from '../models/comment';
import { LocalStorageBackend } from './storage';

/**
 * История просмотра для ленты «Продолжить просмотр».
 * ПР3: прогресс будет храниться на сервере (привязка к пользователю) —
 * интерфейс тот же, поменяется только реализация storage.
 */
@Injectable({ providedIn: 'root' })
export class WatchHistoryService {
  private readonly storage = new LocalStorageBackend<WatchProgress[]>('nnir:watch', 150);
  private readonly progress$ = new BehaviorSubject<WatchProgress[]>([]);

  readonly progress = this.progress$.asObservable();

  constructor() {
    this.storage.get('progress').then((p) => this.progress$.next(p ?? []));
  }

  /** Отметить просмотр тайтла (вызывается при открытии детальной). */
  touch(titleId: string, progress = 5): Observable<void> {
    const list = this.progress$.getValue();
    const rest = list.filter((w) => w.titleId !== titleId);
    const next = [{ titleId, progress, updatedAt: new Date().toISOString() }, ...rest].slice(0, 8);
    this.progress$.next(next);
    return from(this.storage.set('progress', next).then(() => undefined));
  }

  /** Тайтлы из истории (id + прогресс), свежие сверху. */
  snapshot(): WatchProgress[] {
    return this.progress$.getValue();
  }
}
