/** Модель тайтла каталога.
 * Поля likes/addedAt/cast/tags рассчитаны на ПР3: бэкенд будет отдавать их из БД,
 * а фронт уже умеет их показывать — менять придётся только источник (URL). */
export interface Title {
  id: string;
  title: string;
  year: number;
  genre: string;
  rating: number;
  category: 'classic' | 'rus' | 'anime' | 'series';
  description: string;
  poster: string;
  /** Хронометраж фильма в минутах (сериалы — через seasons). */
  duration?: number;
  seasons?: number;
  /** Счётчик лайков; на ПР3 приходит с сервера. */
  likes: number;
  /** Дата добавления в каталог — основа «Новинок» и самостоятельного обновления. */
  addedAt: string; // ISO-дата
  /** Актёры для детальной страницы. */
  cast?: string[];
  /** Флаг «выбор редакции». */
  featured?: boolean;
}

export type Category = Title['category'];

/** Названия категорий для подписей секций. */
export const CATEGORY_LABELS: Record<Category, string> = {
  classic: 'Классика · старые фильмы',
  rus: 'Российские сериалы',
  anime: 'Аниме',
  series: 'Зарубежные сериалы',
};

export const CATEGORY_LIST: Category[] = ['classic', 'rus', 'anime', 'series'];

/** Виды сортировки на странице категории. */
export type SortKey = 'popular' | 'rating' | 'year' | 'title';

export const SORT_LABELS: Record<SortKey, string> = {
  popular: 'По популярности',
  rating: 'По рейтингу',
  year: 'По году',
  title: 'По названию',
};
