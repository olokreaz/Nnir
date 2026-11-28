import { Injectable, inject } from '@angular/core';
import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TokenStore } from './token-store';

/**
 * Http-перехватчик: добавляет заголовок Authorization: Bearer <token> к каждому
 * запросу, если пользователь вошёл. Путь к API — относительный (/api/...):
 * nginx проксирует его на FastAPI. CORS не нужен (источник один).
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const token = inject(TokenStore).get();
  if (token && !req.headers.has('Authorization')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};