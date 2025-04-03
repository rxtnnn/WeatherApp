import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Preferences } from '@capacitor/preferences';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private settings = {
    darkMode: false,
    temperatureUnit: 'celsius',
  };

  private settingsSubject = new BehaviorSubject(this.settings);
  settings$ = this.settingsSubject.asObservable();

  constructor() {
    this.loadSettings();
  }

  async loadSettings() {
    const darkMode = (await Preferences.get({ key: 'darkMode' })).value;
    const temperatureUnit = (await Preferences.get({ key: 'temperatureUnit' })).value;

    this.settings.darkMode = darkMode === 'true';
    this.settings.temperatureUnit = temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';

    this.settingsSubject.next(this.settings);
  }


  async setDarkMode(settings: { darkMode: boolean }) {
    this.settings.darkMode = settings.darkMode;
    await Preferences.set({ key: 'darkMode', value: settings.darkMode.toString() });
    this.settingsSubject.next(this.settings);
  }

  async setTemperatureUnit(unit: 'celsius' | 'fahrenheit') {
    this.settings.temperatureUnit = unit;
    await Preferences.set({ key: 'temperatureUnit', value: unit });
    this.settingsSubject.next(this.settings);
  }

  getTemperatureUnit(): 'celsius' | 'fahrenheit' {
    return this.settings.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  }

  formatTemperature(temp: number, unit: 'celsius' | 'fahrenheit'): string {
    if (unit === 'fahrenheit') {
      return `${Math.round((temp * 9) / 5 + 32)}°`;
    }
    return `${Math.round(temp)}°`;
  }

  async updateSettings(settings: { temperatureUnit?: 'celsius' | 'fahrenheit' }) {
    if (settings.temperatureUnit) {
      this.settings.temperatureUnit = settings.temperatureUnit;
      await Preferences.set({ key: 'temperatureUnit', value: settings.temperatureUnit });
    }
    this.settingsSubject.next(this.settings);
  }
}
