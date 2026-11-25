import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription, combineLatest, map } from 'rxjs';
import { CatalogService } from '../../services/catalog.service';
import { WatchHistoryService } from '../../services/watch-history.service';
import { TitleCardComponent } from '../../components/title-card/title-card';
import { CATEGORY_LABELS, CATEGORY_LIST, Title } from '../../models/title';

@Component({
  selector: 'app-catalog',
  imports: [RouterLink, AsyncPipe, TitleCardComponent],
  templateUrl: './catalog.html',
})
export class CatalogComponent implements OnInit, OnDestroy {
  /** Секции по категориям. */
  protected readonly sections = signal<{ category: string; label: string; items: Title[] }[]>([]);
  /** «Продолжить просмотр»: тайтлы из истории просмотра. */
  protected readonly continueWatching = signal<Title[]>([]);
  /** Показать новинки-бейдж (обнаружено обновление источника). */
  protected readonly newsFlash = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Реактивные ленты: новинки и выбор редакции. */
  private catalog = inject(CatalogService);
  private history = inject(WatchHistoryService);

  protected readonly recent$ = this.catalog.recent;
  protected readonly featured$ = this.catalog.featured;

  private readonly subs = new Subscription();

  ngOnInit(): void {
    this.subs.add(
      this.catalog.loading.subscribe((l) => this.loading.set(l)),
    );
    this.subs.add(
      this.catalog.error.subscribe((e) => this.error.set(e)),
    );
    // Обнаружение новых тайтлов при авто-обновлении источника.
    this.subs.add(
      this.catalog.newIds.subscribe((ids) => {
        if (ids.length > 0) this.newsFlash.set(true);
      }),
    );

    const categories$ = this.catalog.titles.pipe(
      map((items) =>
        CATEGORY_LIST.map((category) => ({
          category,
          label: CATEGORY_LABELS[category],
          items: items.filter((t) => t.category === category),
        })),
      ),
    );

    // Лента продолжения: история прогресса, сопоставленная с каталогом.
    this.subs.add(
      combineLatest([this.catalog.titles, this.history.progress])
        .pipe(
          map(([titles, progress]) => {
            const map = new Map(progress.map((p) => [p.titleId, p]));
            return titles
              .filter((t) => map.has(t.id))
              .sort((a, b) => +new Date(map.get(a.id)!.updatedAt) - +new Date(map.get(b.id)!.updatedAt))
              .reverse();
          }),
        )
        .subscribe((items) => this.continueWatching.set(items)),
    );

    this.subs.add(categories$.subscribe((sections) => this.sections.set(sections)));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
}
