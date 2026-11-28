import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, filter } from 'rxjs';
import { CatalogService } from '../../services/catalog.service';
import { TitleCardComponent } from '../../components/title-card/title-card';
import { Title } from '../../models/title';

/**
 * Реактивный поиск: результаты подтягиваются сразу при вводе (debounce ~250мс),
 * URL синхронизируется с ?q= (можно поделиться ссылкой). Источник —
 * CatalogService.search(); при глубокой интеграции с бэкендом заменится на
 * GET /api/catalog?q=..., но интерфейс компонента не изменится.
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

  /** Поток набора в поле — с него снимается debounce. */
  private readonly typing$ = new Subject<string>();
  private readonly subs = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private catalog: CatalogService,
  ) {}

  ngOnInit(): void {
    // Первичный запрос — из URL (глубокая ссылка или возврат назад).
    this.subs.add(
      this.route.queryParamMap.subscribe((params) => {
        const q = params.get('q') ?? '';
        this.query.set(q);
        this.run(q);
      }),
    );

    // Реактивный ввод: пауза 250мс → обновляем URL, что и запускает поиск.
    this.subs.add(
      this.typing$
        .pipe(
          debounceTime(250),
          distinctUntilChanged(),
          filter((q) => q.trim().length >= 2 || q.trim().length === 0),
        )
        .subscribe((q) => {
          this.router.navigate(['/search'], { queryParams: q ? { q: q.trim() } : {} });
        }),
    );
  }

  /** Событие ввода в поле: отправляем в поток (без прямого navigate). */
  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value); // мгновенно отражаем в поле
    this.typing$.next(value);
  }

  /** Очистить поиск (кнопка ✕). */
  clear(): void {
    this.query.set('');
    this.typing$.next('');
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

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.typing$.complete();
  }
}