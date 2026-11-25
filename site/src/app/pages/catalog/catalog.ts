import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../../services/catalog.service';
import { Title, CATEGORY_LABELS } from '../../models/title';

interface TitleCard {
  title: Title;
  categoryLabel: string;
}

@Component({
  selector: 'app-catalog',
  imports: [RouterLink],
  templateUrl: './catalog.html',
})
export class CatalogComponent implements OnInit {
  /** Каталог, сгруппированный по категориям. */
  protected readonly sections = signal<{ category: keyof typeof CATEGORY_LABELS; label: string; items: Title[] }[]>([]);
  /** Тайтлы для ленты «Продолжить просмотр». */
  protected readonly continueWatching = signal<Title[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor(private catalog: CatalogService) {}

  ngOnInit(): void {
    this.catalog.getCatalog().subscribe({
      next: (items) => {
        const categories: (keyof typeof CATEGORY_LABELS)[] = ['classic', 'rus', 'anime', 'series'];
        this.sections.set(
          categories.map((category) => ({
            category,
            label: CATEGORY_LABELS[category],
            items: items.filter((t) => t.category === category),
          })),
        );
        // Лента «Продолжить просмотр» — первые тайтлы каталога
        this.continueWatching.set(items.slice(0, 4));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Не удалось загрузить каталог. Попробуйте позже.');
        this.loading.set(false);
      },
    });
  }
}
