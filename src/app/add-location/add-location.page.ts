import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { WeatherService } from '../services/weather.service';
import { Subject, Subscription } from 'rxjs';
import { take, takeUntil } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { IonItemSliding } from '@ionic/angular';
import { SettingsService } from '../services/settings.service';
import { Storage } from '@ionic/storage-angular';
import { Network } from '@capacitor/network';

interface Location {
  name: string;
  country: string;
  lat: number;
  lon: number;
  temp?: number;
  high?: number;
  low?: number;
  isCurrentLocation?: boolean;
  selected?: boolean;
  isExisting?: boolean;
  formattedTemp?: string;
  formattedHigh?: string;
  formattedLow?: string;
}

@Component({
  selector: 'app-add-location',
  templateUrl: './add-location.page.html',
  styleUrls: ['./add-location.page.scss'],
  standalone: false,
})
export class AddLocationPage implements OnInit, OnDestroy {
  searchQuery = '';
  searchedLocation: Location | null = null;
  filteredLocations: Location[] = [];
  showingSearchResults = false;
  currentLocation: Location = { name: '', country: '', lat: 0, lon: 0, isCurrentLocation: true };
  savedLocations: Location[] = [];
  errorMessage = '';
  selectionMode = false;
  isOnline: boolean = true;
  isDarkMode?: boolean;
  private destroy$ = new Subject<void>();
  private weatherApiKey = environment.weatherApiKey;
  private settingsSubscription?: Subscription;

  constructor(
    private http: HttpClient,
    private weatherService: WeatherService,
    private router: Router,
    private settingsService: SettingsService,
    private storage: Storage
  ) {
    this.initStorage();
  }

  async ngOnInit() {
    await this.weatherService.initialize();
    await this.initStorage();
    this.isOnline = (await Network.getStatus()).connected;
    await this.loadFromStorage();

    await this.refreshWeatherData();

    this.settingsSubscription = this.settingsService.settings$.subscribe(settings => {
      this.isDarkMode = settings.darkMode;
      document.body.setAttribute('color-theme', settings.darkMode ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark-mode', this.isDarkMode);
      this.updateTemperatureDisplay();
    });

    Network.addListener('networkStatusChange', async (status) => {
      const wasOnline = this.isOnline;
      this.isOnline = status.connected;

      if (wasOnline !== this.isOnline) { // Only show alerts when status actually changes
        if (this.isOnline) {
          alert('Internet connection restored.');
        } else {
          alert('You are offline. Check your connection.');
          this.loadFromStorage();
        }
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    Network.removeAllListeners();
  }

  async initStorage() {
    await this.storage.create();
  }

  async refreshWeatherData() {
    await this.refreshSavedLocations();
    await this.getCurrentLocation();
  }

  async getCurrentLocation() {
    try {
      const { latitude, longitude } = await this.weatherService.getCurrentLocation();
      const cityData = await this.weatherService.getCityName(latitude, longitude).toPromise();
      const weatherData = await this.weatherService.getWeatherData(latitude, longitude).toPromise();

      this.currentLocation = {
        name: cityData.address.city || 'Unknown',
        country: cityData.address.country || '',
        lat: latitude,
        lon: longitude,
        isCurrentLocation: true,
        temp: Math.round(weatherData.main.temp),
      };

      const result = await this.weatherService.getHighLowTemperature(latitude, longitude).toPromise();
      if (result) {
        this.currentLocation.high = Math.round(result.high);
        this.currentLocation.low = Math.round(result.low);
      }
      await this.storage.set('currentLocation', this.currentLocation);
    } catch (error) {
      alert('Could not update current location:'+ error);
    }
  }

  searchLocation(event: Event) {
    const target = event.target as HTMLIonSearchbarElement;
    const query = target.value?.toLowerCase() || '';

    this.searchedLocation = null;
    this.filteredLocations = [];
    this.showingSearchResults = false;
    this.errorMessage = '';
    let matchFound = false;

    if (!query || query.length < 2) return;
    this.showingSearchResults = true;

    if (this.currentLocation && this.currentLocation.name.toLowerCase().includes(query)) {
      this.filteredLocations.push({ ...this.currentLocation, isExisting: true });
      matchFound = true;
    }

    const matchingSavedLocations = this.savedLocations.filter((loc) => loc.name.toLowerCase().includes(query));
    if (matchingSavedLocations.length > 0) {
      this.filteredLocations.push(...matchingSavedLocations.map((loc) => ({ ...loc, isExisting: true })));
      matchFound = true;
    }

    if (!matchFound) {
      const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${this.weatherApiKey}`;
      this.http.get<any[]>(url).pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => {
          if (data && data.length > 0) {
            const newLocation = { name: data[0].name, country: data[0].country, lat: data[0].lat, lon: data[0].lon };
            if (!this.locationExists(newLocation)) {
              this.searchedLocation = newLocation;
            }
          } else {
            this.errorMessage = 'No locations found';
          }
        },
        error: () => {
          this.errorMessage = 'Error searching for locations';
        },
      });
    }
  }

  private fetchWeatherData(location: Location) {
    this.weatherService.getWeatherData(location.lat, location.lon)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (currentData) => {
          if (currentData?.main) {
            location.temp = Math.round(currentData.main.temp);
            this.weatherService.getHighLowTemperature(location.lat, location.lon).pipe(take(1)).subscribe({
              next: (result: { high: number; low: number }) => {
                location.high = Math.round(result.high);
                location.low = Math.round(result.low);

                const unit = this.settingsService.getTemperatureUnit();
                location.formattedTemp = this.settingsService.formatTemperature(location.temp!, unit);
                location.formattedHigh = this.settingsService.formatTemperature(location.high, unit);
                location.formattedLow = this.settingsService.formatTemperature(location.low, unit);

                if (location.isCurrentLocation) {
                  this.currentLocation = { ...location };
                } else {
                  this.savedLocations = [...this.savedLocations, location];
                  this.saveToStorage();
                }
              },
              error: () => {
                this.errorMessage = 'Could not fetch forecast data for temperature.';
              }
            });
          }
        },
        error: () => {
          this.errorMessage = 'Could not fetch weather data';
        }
      });
  }

  openLocationDetails(location: Location) {
    this.weatherService.getWeatherData(location.lat, location.lon)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
       next: () => {
        this.weatherService.setSelectedLocation(location.lat, location.lon, location.name);
        this.router.navigateByUrl('/home');
      },
        error: () => {
        this.weatherService.setSelectedLocation(location.lat, location.lon, location.name);
        this.router.navigateByUrl('/home');
      }
    });
  }

  async refreshSavedLocations() {
    this.savedLocations.forEach(location => {
      this.weatherService.getWeatherData(location.lat, location.lon)
        .pipe(take(1))
        .subscribe({
          next: async (currentData) => {
            if (currentData?.main) {
              location.temp = Math.round(currentData.main.temp);
              this.weatherService.getWeeklyWeather(location.lat, location.lon)
                .pipe(take(1))
                .subscribe({
                  next: async (forecastData: any) => {
                    if (forecastData && forecastData.list) {
                      const temps = forecastData.list.map((entry: any) => entry.main.temp);
                      location.temp = Math.round(forecastData.list[0].main.temp);
                      location.high = Math.round(Math.max(...temps));
                      location.low = Math.round(Math.min(...temps));
                    }
                    await this.saveToStorage();
                  },
                  error: () => alert(`Failed to refresh forecast for ${location.name}`)
                });
            }
          },
          error: () => alert(`Failed to refresh current weather for ${location.name}`)
        });
    });
    await this.getCurrentLocation();
  }

  addLocation() {
    if (!this.searchedLocation || this.locationExists(this.searchedLocation)) {
      return;
    }
    this.searchedLocation.formattedTemp = '';
    this.searchedLocation.formattedHigh = '';
    this.searchedLocation.formattedLow = '';
    this.fetchWeatherData(this.searchedLocation);
    this.clearSearch();
  }

  private locationExists(location: Location): boolean {
    return this.savedLocations.some(saved =>
      saved.name.toLowerCase() === location.name.toLowerCase() &&
      saved.country.toLowerCase() === location.country.toLowerCase()
    );
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchedLocation = null;
    this.filteredLocations = [];
    this.showingSearchResults = false;
  }

  async saveToStorage() {
    await this.storage.set('savedLocations', this.savedLocations);
  }

  async loadFromStorage() {
    const storedCurrentLocation = await this.storage.get('currentLocation');
    if (storedCurrentLocation) {
      this.currentLocation = storedCurrentLocation;
    }

    const storedSavedLocations = await this.storage.get('savedLocations');
    if (storedSavedLocations) {
      this.savedLocations = storedSavedLocations;
    }
  }

  deleteLocation(index: number, slidingItem: IonItemSliding) {
    slidingItem.close();
    this.savedLocations.splice(index, 1);
    this.saveToStorage();
  }

  formatTemp(temp: number | undefined): string {
    return temp !== undefined ? this.settingsService.formatTemperature(temp, 'celsius') : 'N/A';
  }

  updateTemperatureDisplay() {
    const unit = this.settingsService.getTemperatureUnit();
    this.settingsService.setTemperatureUnit(unit); // Ensure it's correctly set

    const formatTemp = (temp?: number) =>
      temp !== undefined ? this.settingsService.formatTemperature(temp, unit) : undefined;

    const allLocations = [...this.savedLocations, this.currentLocation];
    allLocations.forEach(location => {
      location.formattedTemp = formatTemp(location.temp);
      location.formattedHigh = formatTemp(location.high);
      location.formattedLow = formatTemp(location.low);
    });
  }
}
