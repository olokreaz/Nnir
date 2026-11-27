import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { User } from '../models/user';
import { LocalStorageBackend } from './storage';

/** Аккаунт в локальном «реестре пользователей» (заглушка базы). */
interface Account extends User {
  password: string;
}

/** Ожидающая подтверждения регистрация. */
interface PendingRegistration {
  name: string;
  email: string;
  password: string;
  code: string; // 6-символьный код, «отправленный на почту»
  expiresAt: number;
  avatarColor: string;
}

/**
 * Заглушка авторизации. На ПР3:
 *  - POST /api/auth/register      → сервер шлёт код на почту
 *  - POST /api/auth/verify        → проверка 6-символьного кода
 *  - POST /api/auth/login         → JWT-токен
 * Сейчас весь «сервер» — localStorage: реестр аккаунтов + текущая сессия.
 * Интерфейс асинхронный (Observable) как у настоящего API.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly accounts = new LocalStorageBackend<Account[]>('nnir:accounts', 200);
  private readonly pending = new LocalStorageBackend<PendingRegistration | null>('nnir:pending', 120);
  private readonly session = new LocalStorageBackend<{ user: User; token: string }>('nnir:session', 200);
  private readonly current$ = new BehaviorSubject<User | null>(null);

  /** Текущий пользователь (null — гость). */
  readonly user = this.current$.asObservable();

  constructor() {
    this.session.get('data').then((s) => this.current$.next(s?.user ?? null));
  }

  /** Регистрация, шаг 1: проверяем почту и «отправляем код». */
  register(name: string, email: string, password: string): Observable<{ code: string }> {
    const normalized = email.trim().toLowerCase();
    const reg: PendingRegistration = {
      name: name.trim(),
      email: normalized,
      password,
      code: String(Math.floor(100000 + Math.random() * 900000)), // 6 цифр
      expiresAt: Date.now() + 10 * 60 * 1000, // код живёт 10 минут
      avatarColor: pickColor(name),
    };
    return from(
      this.accounts
        .get('list')
        .then((accs) => accs ?? [])
        .then((accs) => {
          if (accs.some((a) => a.email === normalized)) {
            throw new Error('Такой email уже зарегистрирован.');
          }
          return this.pending.set('data', reg);
        })
        .then(() => ({ code: reg.code })),
    );
  }

  /** Регистрация, шаг 2: проверка 6-символьного кода → создание аккаунта. */
  verify(code: string): Observable<User> {
    return from(
      this.pending.get('data').then(async (reg) => {
        if (!reg) throw new Error('Сначала заполните форму регистрации.');
        if (Date.now() > reg.expiresAt) throw new Error('Код истёк. Начните регистрацию заново.');
        if (reg.code !== code.trim()) throw new Error('Неверный код. Проверьте и попробуйте ещё раз.');

        const user: User = {
          id: 'u-' + Math.random().toString(36).slice(2, 10),
          name: reg.name,
          email: reg.email,
          avatarColor: reg.avatarColor,
        };
        const account: Account = { ...user, password: reg.password };

        const accs = (await this.accounts.get('list')) ?? [];
        accs.push(account);
        await this.accounts.set('list', accs);
        await this.pending.remove('data');
        await this.session.set('data', { user, token: 'demo-token' });

        this.current$.next(user);
        return user;
      }),
    );
  }

  /** Вход по почте и паролю (на ПР3 — POST /api/auth/login). */
  login(email: string, password: string): Observable<User> {
    const normalized = email.trim().toLowerCase();
    return from(
      this.accounts.get('list').then((accs) => {
        const account = (accs ?? []).find((a) => a.email === normalized);
        if (!account) throw new Error('Аккаунт с такой почтой не найден.');
        if (account.password !== password) throw new Error('Неверный пароль.');
        const user: User = { id: account.id, name: account.name, email: account.email, avatarColor: account.avatarColor };
        return this.session.set('data', { user, token: 'demo-token' }).then(() => {
          this.current$.next(user);
          return user;
        });
      }),
    );
  }

  /** Выход. */
  logout(): Observable<void> {
    return from(this.session.remove('data').then(() => this.current$.next(null)));
  }
}

/** Цвет аватарки — детерминированно по имени. */
export function pickColor(name: string): string {
  const palette = ['#ff4d8d', '#b14cff', '#ff2e63', '#7c6cff', '#ff9f45', '#3ddc97'];
  let h = 0;
  for (const ch of name) h = (h + ch.codePointAt(0)!) % 997;
  return palette[h % palette.length];
}