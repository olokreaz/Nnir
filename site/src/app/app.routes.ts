import { Routes } from '@angular/router';
import { CatalogComponent } from './pages/catalog/catalog';
import { TitleDetailComponent } from './pages/title-detail/title-detail';
import { CategoryComponent } from './pages/category/category';
import { SearchComponent } from './pages/search/search';
import { FavoritesComponent } from './pages/favorites/favorites';
import { AuthComponent } from './pages/auth/auth';
import { NotFoundComponent } from './pages/not-found/not-found';

/**
 * Маршруты приложения.
 * ПР2: каталог, категория, поиск, детальная, избранное, вход/регистрация.
 * ПР3: те же компоненты получат данные из API, /auth — настоящий JWT.
 */
export const routes: Routes = [
  { path: '', component: CatalogComponent },
  { path: 'category/:id', component: CategoryComponent },
  { path: 'search', component: SearchComponent },
  { path: 'title/:id', component: TitleDetailComponent },
  { path: 'favorites', component: FavoritesComponent },
  { path: 'auth', component: AuthComponent },
  { path: '**', component: NotFoundComponent },
];
