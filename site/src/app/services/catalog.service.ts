import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Title } from '../models/title';

/**
 * Адрес источника данных каталога.
 * Сейчас это статический JSON в public/ (раздаётся nginx), но источник
 * «универсальный»: фронт не знает, кто за ним стоит. На этапе ПР3 здесь
 * будет адрес backend-API (http://localhost:8000/api/catalog и т.п.).
 */
export const CATALOG_URL = '/catalog.json';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  constructor(private http: HttpClient) {}

  /** Получить весь каталог из внешнего источника. */
  getCatalog(): Observable<Title[]> {
    return this.http.get<Title[]>(CATALOG_URL);
  }

  /** Получить один тайтл по id. */
  getById(id: string): Observable<Title | undefined> {
    return new Observable((subscriber) => {
      this.getCatalog().subscribe({
        next: (catalog) => subscriber.next(catalog.find((t) => t.id === id)),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });
    });
  }
}
