import { Injectable } from '@angular/core';

/**
 * Хранение JWT-токена. Вынесено отдельно от AuthService, чтобы Http-перехватчик
 * мог читать токен без циклической зависимости (AuthService ↔ HttpInterceptor).
 * Токен персистится в localStorage, чтобы переживать перезагрузку страницы.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly KEY = 'nnir:token';

  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem(this.KEY);
  }

  get(): string | null {
    const raw = localStorage.getItem(this.KEY);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw; // legacy: токен лежал без JSON-обёртки
    }
  }

  set(token: string | null): void {
    this.token = token;
    if (token) localStorage.setItem(this.KEY, JSON.stringify(token));
    else localStorage.removeItem(this.KEY);
  }
}