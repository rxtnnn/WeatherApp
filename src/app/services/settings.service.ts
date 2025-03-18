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
    const storedSettings = await this.storage.get('app_settings');
    if (storedSettings) {
      this._settings.next(storedSettings);

      // Apply dark mode if enabled
      if (storedSettings.darkMode) {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
    }
  }

  async updateSettings(settings: Partial<AppSettings>) {
    const currentSettings = this._settings.value;
    const newSettings = { ...currentSettings, ...settings };

    await this.storage.set('app_settings', newSettings);
    this._settings.next(newSettings);

    // Apply dark mode toggle
    if (settings.darkMode !== undefined) {
      if (settings.darkMode) {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
    }
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
}
