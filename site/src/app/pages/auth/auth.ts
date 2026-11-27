import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';

/**
 * Страница входа/регистрации.
 * ПР2 — демо: профиль в localStorage. ПР3 — настоящие POST /api/auth/register
 * и /api/auth/login с JWT; форма и валидация останутся теми же.
 */
@Component({
  selector: 'app-auth',
  imports: [RouterLink],
  templateUrl: './auth.html',
})
export class AuthComponent implements OnInit, OnDestroy {
  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly alreadyAuthed = signal(false);

  private readonly subs = new Subscription();
  private auth = inject(AuthService);
  private router = inject(Router);

  ngOnInit(): void {
    this.subs.add(
      this.auth.user.subscribe((u) => {
        this.alreadyAuthed.set(u !== null);
        if (u) this.info.set(`Вы вошли как ${u.name}.`);
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  setMode(m: 'login' | 'register'): void {
    this.mode.set(m);
    this.error.set(null);
  }

  /** По данным формы: регистрация или вход. */
  submit(event: Event, nameInput: HTMLInputElement, emailInput: HTMLInputElement): void {
    event.preventDefault();
    const name = nameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();

    if (!name) {
      this.error.set('Введите имя.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Введите корректную почту (например, name@mail.ru).');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.subs.add(
      this.auth.login(name, email).subscribe({
        next: () => {
          this.busy.set(false);
          this.router.navigate(['/']);
        },
        error: () => {
          this.busy.set(false);
          this.error.set('Сервис недоступен. Попробуйте ещё раз.');
        },
      }),
    );
  }

  logout(): void {
    this.auth.logout().subscribe(() => {
      this.info.set(null);
      this.alreadyAuthed.set(false);
    });
  }
}