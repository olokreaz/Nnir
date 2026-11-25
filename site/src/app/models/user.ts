/** Пользователь. На ПР3 придёт с бэкенда (JWT-токен), пока — профиль из localStorage. */
export interface User {
  id: string;
  name: string;
  email: string;
  /** Градиент или инициалы для аватарки — на ПР3 будет URL. */
  avatarColor: string;
}
