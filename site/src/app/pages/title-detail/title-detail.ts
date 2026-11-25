import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogService } from '../../services/catalog.service';
import { Title } from '../../models/title';

@Component({
  selector: 'app-title-detail',
  imports: [RouterLink],
  templateUrl: './title-detail.html',
})
export class TitleDetailComponent implements OnInit {
  protected readonly title = signal<Title | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  constructor(
    private route: ActivatedRoute,
    private catalog: CatalogService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    this.catalog.getById(id).subscribe({
      next: (t) => {
        if (t) {
          this.title.set(t);
        } else {
          this.notFound.set(true);
        }
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }
}
