/** Модель тайтла каталога. */
export interface Title {
  id: string;
  title: string;
  year: number;
  genre: string;
  rating: number;
  category: 'classic' | 'rus' | 'anime' | 'series';
  description: string;
  poster: string;
  seasons?: number;
}

/** Названия категорий для подписей секций. */
export const CATEGORY_LABELS: Record<Title['category'], string> = {
  classic: 'Классика · старые фильмы',
  rus: 'Российские сериалы',
  anime: 'Аниме',
  series: 'Зарубежные сериалы',
};
