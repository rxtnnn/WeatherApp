import { Component, OnInit } from '@angular/core';
import { SettingsService } from '../services/settings.service';
import { Preferences } from '@capacitor/preferences';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false,
})
export class SettingsPage implements OnInit {
  isDarkMode: boolean = false;
  temperatureUnit: 'celsius' | 'fahrenheit' = 'celsius';

  constructor(private settingsService: SettingsService) {}

  async ngOnInit() {
    await this.loadSettings();
  }

  async ionViewWillEnter() {
    await this.loadSettings();
  }

  async loadSettings() {
    const theme = (await Preferences.get({ key: 'theme' })).value || 'light';
    this.isDarkMode = theme === 'dark';
    const tempUnit = (await Preferences.get({ key: 'temperatureUnit' })).value || 'celsius';
    this.temperatureUnit = tempUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  }

  async toggleTheme(event: any) {
    this.isDarkMode = event.detail.checked;
    const theme = this.isDarkMode ? 'dark' : 'light';
    this.settingsService.setDarkMode({ darkMode: this.isDarkMode });
    document.body.setAttribute('color-theme', theme);
    await Preferences.set({ key: 'theme', value: theme });
  }

  async toggleTemperatureUnit(event: any) {
    const useCelsius = event.detail.checked;
    this.temperatureUnit = useCelsius ? 'celsius' : 'fahrenheit';
    this.settingsService.updateSettings({ temperatureUnit: this.temperatureUnit });
    await Preferences.set({ key: 'temperatureUnit', value: this.temperatureUnit });
  }

  async temperatureUnitChanged(event: any) {
    const selectedValue = event.detail.value;
    if (selectedValue === 'celsius' || selectedValue === 'fahrenheit') {
      this.temperatureUnit = selectedValue;
      this.settingsService.updateSettings({ temperatureUnit: this.temperatureUnit });
      await Preferences.set({ key: 'temperatureUnit', value: this.temperatureUnit });
    }
  }
}
