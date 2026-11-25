import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CatalogService } from '../../services/catalog.service';
import { FavoritesService } from '../../services/favorites.service';
import { CommentsService } from '../../services/comments.service';
import { WatchHistoryService } from '../../services/watch-history.service';
import { AuthService } from '../../services/auth.service';
import { TitleCardComponent } from '../../components/title-card/title-card';
import { Comment } from '../../models/comment';
import { CATEGORY_LABELS, Title } from '../../models/title';

@Component({
  selector: 'app-title-detail',
  imports: [RouterLink, TitleCardComponent, DatePipe],
  templateUrl: './title-detail.html',
})
export class TitleDetailComponent implements OnInit, OnDestroy {
  protected readonly title = signal<Title | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  /** Лайк текущего пользователя. */
  protected readonly liked = signal(false);
  /** Счётчик лайков: из каталога +1, если лайкнул пользователь. */
  protected readonly likeCount = signal(0);

  /** Комментарии + текст формы. */
  protected readonly comments = signal<Comment[]>([]);
  protected readonly commentText = signal('');
  protected readonly commentName = signal('');
  protected readonly posting = signal(false);

  /** Похожие: та же категория/жанр, без текущего. */
  protected readonly similar = signal<Title[]>([]);

  protected readonly isGuest = signal(true);
  protected readonly userName = signal('');

  private id = '';
  private readonly subs = new Subscription();

  private route = inject(ActivatedRoute);
  private catalog = inject(CatalogService);
  private favorites = inject(FavoritesService);
  private commentsSvc = inject(CommentsService);
  private history = inject(WatchHistoryService);
  private auth = inject(AuthService);

  ngOnInit(): void {
    this.subs.add(
      this.auth.user.subscribe((u) => {
        this.isGuest.set(u === null);
        this.userName.set(u?.name ?? '');
      }),
    );

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    this.id = id;

    // Тайтл из кеша + фоновое обновление, если каталог ещё не загружен.
    this.subs.add(
      this.catalog.getById(id).subscribe({
        next: (t) => {
          if (t) {
            this.title.set(t);
            this.likeCount.set(t.likes);
          } else {
            this.notFound.set(true);
          }
          this.loading.set(false);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      }),
    );

    // Лайк-состояние.
    this.subs.add(this.favorites.isFavorite(id).subscribe((v) => this.liked.set(v)));

    // Комментарии.
    this.subs.add(this.commentsSvc.byTitle(id).subscribe((c) => this.comments.set(c)));

    // Похожие: тот же жанр из той же категории, потом — из категории.
    this.subs.add(
      this.catalog.getCatalog().subscribe((items) => {
        const current = items.find((t) => t.id === id);
        if (!current) return;
        const sameGenre = items.filter(
          (t) => t.id !== id && t.category === current.category && t.genre === current.genre,
        );
        const sameCat = items.filter(
          (t) => t.id !== id && t.category === current.category && t.genre !== current.genre,
        );
        const rest = items.filter((t) => t.id !== id && t.category !== current.category);
        this.similar.set([...sameGenre, ...sameCat, ...rest].slice(0, 5));
      }),
    );

    // Отметить просмотр — тайтл попадёт в «Продолжить просмотр».
    this.subs.add(this.history.touch(id, 12).subscribe());
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  toggleLike(): void {
    this.favorites.toggle(this.id).subscribe((nowLiked) => {
      this.liked.set(nowLiked);
      this.likeCount.set(Math.max(0, this.likeCount() + (nowLiked ? 1 : -1)));
    });
  }

  /** Добавить комментарий. На ПР3 автор возьмётся из JWT-токена. */
  addComment(event: Event, nameInput: HTMLInputElement, textInput: HTMLInputElement): void {
    event.preventDefault();
    const text = textInput.value.trim();
    const name = (nameInput.value.trim() || 'Гость');
    if (!text) return;
    this.posting.set(true);
    this.commentsSvc.add(this.id, text, name, '#ff4d8d').subscribe((c) => {
      this.comments.set([c, ...this.comments()]);
      this.posting.set(false);
      textInput.value = '';
    });
  }

  /** Старт просмотра: обновляем прогресс. */
  startWatching(): void {
    this.history.touch(this.id, 30).subscribe();
  }

  /** Хлебные крошки: категория → название. */
  categoryLabel(): string {
    const t = this.title();
    return t ? CATEGORY_LABELS[t.category] : '';
  }
}
