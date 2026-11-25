import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CatalogService } from '../../services/catalog.service';
import { TitleCardComponent } from '../../components/title-card/title-card';
import { Title } from '../../models/title';

/**
 * Страница результатов поиска. Источник — CatalogService.search(),
 * который на ПР3 будет выполнять GET /api/catalog?q=... на бэкенде.
 */
@Component({
  selector: 'app-search',
  imports: [RouterLink, TitleCardComponent],
  templateUrl: './search.html',
})
export class SearchComponent implements OnInit, OnDestroy {
  protected readonly query = signal('');
  protected readonly results = signal<Title[]>([]);
  protected readonly searching = signal(true);

  private readonly subs = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private catalog: CatalogService,
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.route.queryParamMap.subscribe((params) => {
        const q = params.get('q') ?? '';
        this.query.set(q);
        this.run(q);
      }),
    );
  }

  private run(q: string): void {
    this.searching.set(true);
    this.subs.add(
      this.catalog.search(q).subscribe({
        next: (results) => {
          this.results.set(results);
          this.searching.set(false);
        },
        error: () => this.searching.set(false),
      }),
    );
  }

  /** Новый запрос из поля на странице. */
  submit(input: HTMLInputElement): void {
    const q = input.value.trim();
    this.router.navigate(['/search'], { queryParams: { q } });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
}
