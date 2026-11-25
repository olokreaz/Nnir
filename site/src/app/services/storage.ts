/**
 * Хранилище данных клиента. Сейчас — localStorage (заглушка под ПР3).
 * Интерфейс асинхронный (Promise) специально: когда появится бэкенд, реализация
 * заменится на fetch/HTTP, а компоненты не изменятся ни на строку.
 */
export interface ClientStorage<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

/** localStorage-реализация с эмуляцией сетевой задержки (видно скелетоны). */
export class LocalStorageBackend<T> implements ClientStorage<T> {
  constructor(private readonly prefix: string, private readonly delayMs = 250) {}

  private fullKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  private wait(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }

  async get(key: string): Promise<T | null> {
    await this.wait();
    const raw = localStorage.getItem(this.fullKey(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: T): Promise<void> {
    await this.wait();
    localStorage.setItem(this.fullKey(key), JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    await this.wait();
    localStorage.removeItem(this.fullKey(key));
  }
}
