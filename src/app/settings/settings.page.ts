import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false,
})
export class SettingsPage implements OnInit {
  isDarkMode: boolean = false;

  constructor() { }

  ngOnInit() {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    this.isDarkMode = savedTheme === 'dark';

    // Apply the saved theme
    document.body.setAttribute('color-theme', savedTheme || 'light');
  }

  toggleTheme(event: any) {
    const isChecked = event.detail.checked;
    const theme = isChecked ? 'dark' : 'light';

    // Apply theme
    document.body.setAttribute('color-theme', theme);

    // Save preference
    localStorage.setItem('theme', theme);
    this.isDarkMode = isChecked;
  }
}
