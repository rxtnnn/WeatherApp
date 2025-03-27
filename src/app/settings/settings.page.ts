import { Component, OnInit } from '@angular/core';
import { SettingsService  } from '../services/settings.service';
import { Storage } from '@ionic/storage-angular';
@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false,
})
export class SettingsPage implements OnInit {
  isDarkMode: boolean = false;
  temperatureUnit: 'celsius' | 'fahrenheit' = 'celsius';

  constructor(private settingsService: SettingsService, private storage: Storage) { this.initStorage(); }

  async initStorage() {
    await this.storage.create();
  }

  async ngOnInit() {
  }


  async ionViewWillEnter() {
    const currentTheme = await this.storage.get('theme') || 'light';
    this.isDarkMode = currentTheme === 'dark';

    const currentTempUnit = await this.storage.get('temperatureUnit') || 'celsius';
    this.temperatureUnit = currentTempUnit as 'celsius' | 'fahrenheit';
  }

  async toggleTheme(event: any) {
    const isChecked = event.detail.checked;
    const theme = isChecked ? 'dark' : 'light';
    this.settingsService.updateSettings({ darkMode: isChecked });
    document.body.setAttribute('color-theme', theme);

    await this.storage.set('theme', theme);
    this.isDarkMode = isChecked;
  }

  async toggleTemperatureUnit(event: any) {
    const useCelsius = event.detail.checked;
    const temperatureUnit = useCelsius ? 'celsius' : 'fahrenheit';
    this.settingsService.updateSettings({ temperatureUnit });

    await this.storage.set('temperatureUnit', temperatureUnit);
  }

  async temperatureUnitChanged(event: any) {
    const selectedValue = event.detail.value;
    if (selectedValue === 'celsius' || selectedValue === 'fahrenheit') {
      this.settingsService.updateSettings({ temperatureUnit: selectedValue });

      await this.storage.set('temperatureUnit', selectedValue);
    }
  }
}
