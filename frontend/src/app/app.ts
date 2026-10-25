import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Theme } from './core/theme';
import { TopBar } from './layout/top-bar/top-bar';

@Component({
  imports: [RouterOutlet, TopBar],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  // Instantiated here so the stored theme applies before any page renders.
  protected readonly theme = inject(Theme);
}
