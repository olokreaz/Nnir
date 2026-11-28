import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, throwError } from 'rxjs';
import { User } from '../models/user';
import { TokenStore } from './token-store';

interface AuthResponse {
  user: User;
  token: string;
}

/**
 * Авторизация через бэкенд (ПР3):
 *   POST /api/auth/register → {code}       (шаг 1: «отправка кода на почту»)
 *   POST /api/auth/verify   → {user, token} (шаг 2: проверка 6-символьного кода)
 *   POST /api/auth/login    → {user, token}
 *   POST /api/auth/logout
 * Токен сохраняем в TokenStore — Http-перехватчик подставит его в запросы.
 * Публичный интерфейс не изменился: register→{code}, verify/login/logout→User,
 * поэтому компоненты (/auth) остались нетронутыми.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);

  private readonly current$ = new BehaviorSubject<User | null>(null);

  /** Текущий пользователь (null — гость). */
  readonly user = this.current$.asObservable();

  constructor() {
    this.restore();
  }

  /** Восстановить сессию после перезагрузки (профиль сохранён в localStorage). */
  private restore(): void {
    const stored = localStorage.getItem('nnir:user');
    if (stored) {
      try {
        this.current$.next(JSON.parse(stored) as User);
      } catch {
        localStorage.removeItem('nnir:user');
      }
    }
  }

  /** Регистрация, шаг 1: сервер проверит почту и «отправит код». */
  register(name: string, email: string, password: string): Observable<{ code: string }> {
    return this.http
      .post<{ code: string }>('/api/auth/register', { name, email, password })
      .pipe(apiErrors());
  }

  /** Регистрация, шаг 2: проверка 6-символьного кода → создание аккаунта, токен, профиль. */
  verify(code: string): Observable<User> {
    return this.http.post<AuthResponse>('/api/auth/verify', { code }).pipe(
      apiErrors(),
      // После успеха сохраняем токен и делаем пользователя текущим.
      map((res) => {
        this.adoptSession(res);
        return res.user;
      }),
    );
  }

  /** Вход по почте и паролю. */
  login(email: string, password: string): Observable<User> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(
      apiErrors(),
      map((res) => {
        this.adoptSession(res);
        return res.user;
      }),
    );
  }

  /** Выход: сброс сессии на сервере и на клиенте. */
  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      apiErrors(),
      map(() => this.clearSession()),
      catchError(() => {
        // Даже если сервер недоступен — разлогиниваемся локально.
        this.clearSession();
        return of(undefined);
      }),
    );
  }

  /** Сохранить токен + профиль, сделать пользователя текущим. */
  private adoptSession(res: AuthResponse): void {
    this.tokens.set(res.token);
    localStorage.setItem('nnir:user', JSON.stringify(res.user));
    this.current$.next(res.user);
  }

  clearSession(): void {
    this.tokens.set(null);
    localStorage.removeItem('nnir:user');
    this.current$.next(null);
  }
}

/**
 * Достаёт сообщение об ошибке из ответа FastAPI:
 * бэкенд отвечает {"detail": "..."} со статусом 4xx — покажем это вместо
 * голого «Http failure response for /api/...».
 */
export function apiErrors<A>() {
  return (source: Observable<A>): Observable<A> =>
    source.pipe(
      catchError((err: unknown) => {
        const detail = (err as { error?: { detail?: unknown } })?.error?.detail;
        const msg = typeof detail === 'string' && detail ? detail : 'Что-то пошло не так. Попробуйте ещё раз.';
        return throwError(() => new Error(msg));
      }),
    );
}