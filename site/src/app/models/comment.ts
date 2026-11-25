/** Комментарий к тайтлу. Поля готовы под ПР3 (автор, дата, лайки). */
export interface Comment {
  id: string;
  titleId: string;
  authorId: string;
  authorName: string;
  /** Цвет аватарки автора. */
  authorColor: string;
  text: string;
  createdAt: string; // ISO
  likes: number;
}

/** Прогресс просмотра — для ленты «Продолжить просмотр». */
export interface WatchProgress {
  titleId: string;
  /** 0..100 — на ПР3 будет секунда позиции видео. */
  progress: number;
  updatedAt: string; // ISO
}
