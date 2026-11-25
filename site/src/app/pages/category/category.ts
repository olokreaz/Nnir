import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CatalogService } from '../../services/catalog.service';
import { TitleCardComponent } from '../../components/title-card/title-card';
import { CATEGORY_LABELS, Category, SORT_LABELS, SortKey, Title } from '../../models/title';

/**
 * Страница категории: все тайтлы категории + сортировка.
 * ПР3: здесь же появятся фильтры (жанр, год), приходящие с бэкенда.
 */
@Component({
  selector: 'app-category',
  imports: [RouterLink, TitleCardComponent],
  templateUrl: './category.html',
})
export class CategoryComponent implements OnInit, OnDestroy {
  protected readonly items = signal<Title[]>([]);
  protected readonly label = signal('');
  protected readonly sort = signal<SortKey>('popular');
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly sortKeys = Object.keys(SORT_LABELS) as SortKey[];
  protected readonly sortLabels = SORT_LABELS;

  private readonly subs = new Subscription();
  private category: Category = 'classic';

  constructor(private route: ActivatedRoute, private catalog: CatalogService) {}

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('id');
    if (!raw || !(raw in CATEGORY_LABELS)) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    this.category = raw as Category;
    this.label.set(CATEGORY_LABELS[this.category]);

    this.subs.add(
      this.catalog.getByCategory(this.category, this.sort()).subscribe({
        next: (items) => {
          this.items.set(items);
          this.loading.set(false);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      }),
    );
  }

  setSort(key: SortKey): void {
    this.sort.set(key);
    this.subs.add(
      this.catalog.getByCategory(this.category, key).subscribe((items) => this.items.set(items)),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
}
