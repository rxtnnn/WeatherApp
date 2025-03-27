import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { BehaviorSubject } from 'rxjs';

export interface AppSettings {
  temperatureUnit: 'celsius' | 'fahrenheit';
  darkMode: boolean;
  savedLocations: string[];
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private _settings = new BehaviorSubject<AppSettings>({
    temperatureUnit: 'celsius',
    darkMode: false,
    savedLocations: []
  });

  settings$ = this._settings.asObservable();

  constructor(private storage: Storage) {
    this.initStorage();
  }

  async initStorage() {
    await this.storage.create();
    this.loadSettings();
  }

  private async loadSettings() {
    try {
      const storedSettings = await this.storage.get('app_settings');
      if (storedSettings) {
        this._settings.next(storedSettings);
        this.applySettings(storedSettings); // ✅ Apply settings immediately when loaded
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async updateSettings(settings: Partial<AppSettings>) {
    const currentSettings = this._settings.value;
    const newSettings = { ...currentSettings, ...settings };

    try {
      await this.storage.set('app_settings', newSettings);
      this._settings.next(newSettings);
      this.applySettings(newSettings);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }
  public applySettings(settings: AppSettings) {
    document.body.classList.toggle('dark', settings.darkMode);
    document.body.setAttribute('temp-unit', settings.temperatureUnit);
  }

  async addSavedLocation(location: string) {
    const currentSettings = this._settings.value;
    if (!currentSettings.savedLocations.includes(location)) {
      const savedLocations = [...currentSettings.savedLocations, location];
      await this.updateSettings({ savedLocations });
    }
  }

  async removeSavedLocation(location: string) {
    const currentSettings = this._settings.value;
    const savedLocations = currentSettings.savedLocations.filter(loc => loc !== location);
    await this.updateSettings({ savedLocations });
  }

  getCurrentSettings(): AppSettings {
    return this._settings.value;
  }

  convertTemperature(value: number, unit: 'celsius' | 'fahrenheit'): number {
    const currentSettings = this._settings.value;

    if (!value && value !== 0) return 0;

    if (currentSettings.temperatureUnit === unit) {
      return value;
    }

    if (unit === 'celsius' && currentSettings.temperatureUnit === 'fahrenheit') {
      return (value * 9/5) + 32;
    } else {
      return (value - 32) * 5/9;
    }
  }

  formatTemperature(value: number, originalUnit: 'celsius' | 'fahrenheit'): string {
    const convertedValue = Math.round(this.convertTemperature(value, originalUnit));
    return `${convertedValue}°`;
  }
}
