import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '../../models/title';
import { FavoritesService } from '../../services/favorites.service';

/**
 * Карточка тайтла: постер, рейтинг, лайк. Переиспользуется на главной,
 * в категории, в поиске и в избранном.
 */
@Component({
  selector: 'app-title-card',
  imports: [RouterLink],
  template: `
    <a [routerLink]="['/title', t.id]" class="group cursor-pointer block">
      <div class="relative rounded-xl overflow-hidden aspect-[2/3] p-2 flex flex-col items-start justify-end">
        <img [src]="t.poster" [alt]="t.title" class="absolute inset-0 w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"></div>

        <!-- Рейтинг -->
        <span class="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/70 text-neon-rose">
          {{ t.rating.toLocaleString('ru-RU') }}
        </span>

        <!-- Лайк -->
        <button (click)="like($event)"
                class="absolute top-2 right-2 z-20 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur transition border
                       {{ liked() ? 'bg-neon-rose text-white border-neon-rose' : 'bg-black/60 text-pastel border-border hover:border-neon-rose/60' }}"
                [attr.aria-label]="liked() ? 'Убрать из избранного' : 'В избранное'">
          <svg class="w-4 h-4" viewBox="0 0 24 24" [attr.fill]="liked() ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>

        <!-- Плей по ховеру -->
        <div class="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
          <div class="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-xl">▶</div>
        </div>

        <div class="relative z-10 font-semibold drop-shadow text-sm">{{ t.title }}</div>
        <div class="relative z-10 text-[11px] text-mute">{{ t.year }} · {{ t.genre }}</div>
      </div>
    </a>
  `,
})
export class TitleCardComponent implements OnInit {
  @Input({ required: true }) t!: Title;
  protected readonly liked = signal(false);
  private readonly favorites = inject(FavoritesService);

  ngOnInit(): void {
    this.favorites.isFavorite(this.t.id).subscribe((v) => this.liked.set(v));
  }

  like(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.favorites.toggle(this.t.id).subscribe((nowLiked) => this.liked.set(nowLiked));
  }
}
