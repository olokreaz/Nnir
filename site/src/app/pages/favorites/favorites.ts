import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, combineLatest, map } from 'rxjs';
import { CatalogService } from '../../services/catalog.service';
import { FavoritesService } from '../../services/favorites.service';
import { TitleCardComponent } from '../../components/title-card/title-card';
import { Title } from '../../models/title';

/**
 * Избранное пользователя (лайки). ПР3: GET /api/favorites вернёт список,
 * сейчас — залайканные id из localStorage, сопоставленные с каталогом.
 */
@Component({
  selector: 'app-favorites',
  imports: [RouterLink, TitleCardComponent],
  templateUrl: './favorites.html',
})
export class FavoritesComponent implements OnInit, OnDestroy {
  protected readonly items = signal<Title[]>([]);
  protected readonly loading = signal(true);

  private readonly subs = new Subscription();

  constructor(
    private catalog: CatalogService,
    private favorites: FavoritesService,
  ) {}

  ngOnInit(): void {
    this.subs.add(
      combineLatest([this.catalog.titles, this.favorites.ids])
        .pipe(
          map(([titles, ids]) => {
            const byId = new Map(titles.map((t) => [t.id, t]));
            return ids.map((id) => byId.get(id)).filter((t): t is Title => !!t);
          }),
        )
        .subscribe((items) => {
          this.items.set(items);
          this.loading.set(false);
        }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
}
