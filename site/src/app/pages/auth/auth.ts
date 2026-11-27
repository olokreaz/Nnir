import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';

/**
 * Страница входа/регистрации.
 * - «Вход»: почта + пароль из локального реестра аккаунтов.
 * - «Регистрация»: шаг 1 — имя/почта/пароль; шаг 2 — подтверждение почты
 *   6-символьным кодом («отправленным на почту»; в демо показываем его).
 * ПР3: те же шаги, но через POST /api/auth/register|verify|login с JWT.
 */
@Component({
  selector: 'app-auth',
  imports: [RouterLink],
  templateUrl: './auth.html',
})
export class AuthComponent implements OnInit, OnDestroy {
  protected readonly mode = signal<'login' | 'register'>('login');
  /** Шаг регистрации: 'form' → 'verify'. */
  protected readonly regStep = signal<'form' | 'verify'>('form');
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);
  protected readonly demoCode = signal<string | null>(null);
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
    this.info.set(null);
    this.demoCode.set(null);
    this.regStep.set('form');
  }

  /** Вход по почте и паролю. */
  login(event: Event, emailInput: HTMLInputElement, passwordInput: HTMLInputElement): void {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Введите корректную почту.');
      return;
    }
    if (!password) {
      this.error.set('Введите пароль.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.subs.add(
      this.auth.login(email, password).subscribe({
        next: () => {
          this.busy.set(false);
          this.router.navigate(['/']);
        },
        error: (err: Error) => {
          this.busy.set(false);
          this.error.set(err.message);
        },
      }),
    );
  }

  /** Регистрация, шаг 1: имя/почта/пароль → «отправка кода». */
  register(event: Event, nameInput: HTMLInputElement, emailInput: HTMLInputElement, passwordInput: HTMLInputElement): void {
    event.preventDefault();
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!name) {
      this.error.set('Введите имя.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Введите корректную почту (например, name@mail.ru).');
      return;
    }
    if (password.length < 6) {
      this.error.set('Пароль должен быть не короче 6 символов.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.subs.add(
      this.auth.register(name, email, password).subscribe({
        next: ({ code }) => {
          this.busy.set(false);
          this.demoCode.set(code);
          this.regStep.set('verify');
        },
        error: (err: Error) => {
          this.busy.set(false);
          this.error.set(err.message);
        },
      }),
    );
  }

  /** Регистрация, шаг 2: ввод 6-символьного кода. */
  verify(event: Event, codeInput: HTMLInputElement): void {
    event.preventDefault();
    const code = codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      this.error.set('Код — ровно 6 цифр.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.subs.add(
      this.auth.verify(code).subscribe({
        next: () => {
          this.busy.set(false);
          this.router.navigate(['/']);
        },
        error: (err: Error) => {
          this.busy.set(false);
          this.error.set(err.message);
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