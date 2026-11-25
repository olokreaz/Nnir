import { Routes } from '@angular/router';
import { CatalogComponent } from './pages/catalog/catalog';
import { TitleDetailComponent } from './pages/title-detail/title-detail';
import { NotFoundComponent } from './pages/not-found/not-found';

export const routes: Routes = [
  { path: '', component: CatalogComponent },
  { path: 'title/:id', component: TitleDetailComponent },
  { path: '**', component: NotFoundComponent },
];
