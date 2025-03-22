import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  constructor() {}

  ngOnInit() {
    // Apply saved theme on app initialization
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.body.setAttribute('color-theme', savedTheme);
    } else {
      document.body.setAttribute('color-theme', 'light'); // Default theme
    }
  }
}
