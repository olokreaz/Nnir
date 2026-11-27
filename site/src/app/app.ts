import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from './services/auth.service';
import { FavoritesService } from './services/favorites.service';
import { User } from './models/user';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  protected readonly user = signal<User | null>(null);
  protected readonly favoritesCount = signal(0);

  private readonly subs = new Subscription();
  private auth = inject(AuthService);
  private favorites = inject(FavoritesService);
  private router = inject(Router);

  ngOnInit(): void {
    this.subs.add(this.auth.user.subscribe((u) => this.user.set(u)));
    this.subs.add(this.favorites.ids.subscribe((ids) => this.favoritesCount.set(ids.length)));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  /** Поиск: ввод → переход на /search?q=... (без перезагрузки). */
  search(input: HTMLInputElement): void {
    const q = input.value.trim();
    if (!q) return;
    this.router.navigate(['/search'], { queryParams: { q } });
  }

  /** Ctrl+K — фокус на строку поиска. */
  @HostListener('window:keydown.control.k', ['$event'])
  handleShortcut(event: Event): void {
    event.preventDefault();
    this.focusSearch();
  }

  focusSearch(): void {
    document.querySelector<HTMLInputElement>('header input[type="search"]')?.focus();
  }

  logout(): void {
    this.auth.logout().subscribe();
  }
}