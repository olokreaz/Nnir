import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { User } from '../models/user';
import { LocalStorageBackend } from './storage';

/**
 * Заглушка авторизации. На ПР3: POST /api/auth/login + JWT-токен, профиль из
 * /api/auth/me. Сейчас — «быстрый вход»: имя/почта сохраняются в localStorage,
 * сервис отдаёт тот же асинхронный интерфейс, что и будущий бэкенд.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storage = new LocalStorageBackend<{ user: User; token: string }>('nnir:auth', 200);
  private readonly current$ = new BehaviorSubject<User | null>(null);

  /** Текущий пользователь (null — гость). */
  readonly user = this.current$.asObservable();

  constructor() {
    this.storage.get('session').then((s) => this.current$.next(s?.user ?? null));
  }

  /** Вход: на ПР3 это будет POST /api/auth/login. */
  login(name: string, email: string): Observable<User> {
    const user: User = {
      id: 'u-' + Math.random().toString(36).slice(2, 10),
      name,
      email,
      avatarColor: pickColor(name),
    };
    return from(this.storage.set('session', { user, token: 'demo-token' }).then(() => {
      this.current$.next(user);
      return user;
    }));
  }

  /** Выход. */
  logout(): Observable<void> {
    return from(this.storage.remove('session').then(() => this.current$.next(null)));
  }
}

/** Цвет аватарки — детерминированно по имени. */
function pickColor(name: string): string {
  const palette = ['#ff4d8d', '#b14cff', '#ff2e63', '#7c6cff', '#ff9f45', '#3ddc97'];
  let h = 0;
  for (const ch of name) h = (h + ch.codePointAt(0)!) % 997;
  return palette[h % palette.length];
}
