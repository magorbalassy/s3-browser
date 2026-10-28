import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Breadcrumbs } from './breadcrumbs';

describe('Breadcrumbs', () => {
  it('links every level except the current folder', async () => {
    TestBed.configureTestingModule({ imports: [Breadcrumbs], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Breadcrumbs);
    fixture.componentRef.setInput('source', 'lab');
    fixture.componentRef.setInput('sourceName', 'Lab MinIO');
    fixture.componentRef.setInput('bucket', 'photos');
    fixture.componentRef.setInput('prefix', '2024/jan/');
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const links = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/s/lab', '/s/lab/photos', '/s/lab/photos/2024']);
    expect(el.querySelector('a')?.textContent).toBe('Lab MinIO');
    expect(el.querySelector('[aria-current=page]')?.textContent).toBe('jan');
  });
});
