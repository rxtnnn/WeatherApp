import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { WeatherService } from '../services/weather.service';
import { Subject } from 'rxjs';
import { takeUntil} from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { IonItemSliding } from '@ionic/angular';
import { SettingsService } from '../services/settings.service';
import { Storage } from '@ionic/storage-angular';

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
}
@Component({
  selector: 'app-add-location',
  templateUrl: './add-location.page.html',
  styleUrls: ['./add-location.page.scss'],
  standalone: false,
})
export class AddLocationPage implements OnInit, OnDestroy {
  // Search properties
  searchQuery = '';
  searchedLocation: Location | null = null;
  filteredLocations: Location[] = [];
  showingSearchResults = false;
  currentLocation: Location = { name: '', country: '', lat: 0, lon: 0, isCurrentLocation: true };
  savedLocations: Location[] = [];
  isLoading = false;
  errorMessage = '';
  selectionMode = false;
  private destroy$ = new Subject<void>();
  private weatherApiKey = environment.weatherApiKey;

  constructor(private http: HttpClient,private weatherService: WeatherService, private router: Router,
    private settingsService: SettingsService, private storage: Storage) {
    this.initStorage();
  }

  async initStorage() {
    await this.storage.create();
  }

  async ngOnInit() {
    await this.loadFromStorage();
    this.getCurrentLocation();
    this.refreshSavedLocations();

    this.settingsService.settings$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.savedLocations = [...this.savedLocations];
      this.currentLocation = { ...this.currentLocation };
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async getCurrentLocation() {
    this.isLoading = true;
    try {
      const { latitude, longitude } = await this.weatherService.getCurrentLocation();
      this.weatherService.getCityName(latitude, longitude).pipe(takeUntil(this.destroy$)).subscribe({
        next: async (data) => {
          const cityName = data.address.city || data.address.town || data.address.village || 'Unknown';
          const countryName = data.address.country || '';

          this.fetchWeatherData({
            name: cityName,
            country: countryName,
            lat: latitude,
            lon: longitude,
            isCurrentLocation: true,
          });

          await this.storage.set('currentLocation', { name: cityName, country: countryName, lat: latitude, lon: longitude });
        },
        error: () => {
          this.errorMessage = 'Could not determine your location';
          this.isLoading = false;
        },
      });
    } catch {
      this.errorMessage = 'Location access denied or unavailable';
      this.isLoading = false;
    }
  }

  searchLocation(event: Event) {
    const target = event.target as HTMLIonSearchbarElement;
    const query = target.value?.toLowerCase() || '';

    this.searchedLocation = null;
    this.filteredLocations = [];
    this.showingSearchResults = false;
    this.errorMessage = '';

    if (!query || query.length < 2) return;

    this.isLoading = true;
    this.showingSearchResults = true;

    let matchFound = false;
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
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
          this.errorMessage = 'Error searching for locations';
        },
      });
    } else {
      this.isLoading = false;
    }
  }

  addLocation() {
    if (!this.searchedLocation || this.locationExists(this.searchedLocation)) {
      this.errorMessage = 'This location is already saved';
      return;
    }

    this.fetchWeatherData(this.searchedLocation);
    this.searchQuery = '';
    this.searchedLocation = null;
    this.filteredLocations = [];
    this.showingSearchResults = false;
  }

  private locationExists(location: Location): boolean {
    return this.savedLocations.some((saved) =>
      Math.abs(saved.lat - location.lat) < 0.01 && Math.abs(saved.lon - location.lon) < 0.01);
  }

  /**
   * Clears search results
   */
  clearSearch() {
    this.searchQuery = '';
    this.searchedLocation = null;
    this.filteredLocations = [];
    this.showingSearchResults = false;
  }

  private fetchWeatherData(location: Location) {
    this.isLoading = true;
    this.weatherService.getWeatherData(location.lat, location.lon).pipe(takeUntil(this.destroy$)).subscribe({
      next: async (data) => {
        const locationWithWeather: Location = { ...location, temp: Math.round(data.main.temp), high: Math.round(data.main.temp_max), low: Math.round(data.main.temp_min) };
        if (location.isCurrentLocation) {
          this.currentLocation = locationWithWeather;
        } else {
          this.savedLocations.push(locationWithWeather);
          await this.saveToStorage();
        }
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'Could not fetch weather data';
      },
    });
  }


  openLocationDetails(location: Location) {
    // Only navigate if not in selection mode
    if (!this.selectionMode) {
      // Get fresh weather data before setting as selected location
      this.weatherService.getWeatherData(location.lat, location.lon)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (data) => {
            // Now set as selected with fresh data
            this.weatherService.setSelectedLocation(location.lat, location.lon, location.name);
            this.router.navigateByUrl('/home');
          },
          error: (error) => {
            // Still navigate, but there might be inconsistencies
            console.error('Error updating weather before navigation:', error);
            this.weatherService.setSelectedLocation(location.lat, location.lon, location.name);
            this.router.navigateByUrl('/home');
          }
        });
    } else {
      // Toggle selection
      location.selected = !location.selected;
    }
  }

  async refreshSavedLocations() {
    if (this.savedLocations.length === 0) return;
    this.savedLocations.forEach((location) => {
      this.weatherService.getWeatherData(location.lat, location.lon).pipe(takeUntil(this.destroy$)).subscribe({
        next: async (data) => {
          location.temp = Math.round(data.main.temp);
          location.high = Math.round(data.main.temp_max);
          location.low = Math.round(data.main.temp_min);
          await this.saveToStorage();
        },
        error: () => {},
      });
    });
  }

  async saveToStorage() {
    await this.storage.set('savedLocations', this.savedLocations);
  }

  async loadFromStorage() {
    const storedLocations = await this.storage.get('savedLocations');
    if (storedLocations) this.savedLocations = storedLocations;
    const storedCurrentLocation = await this.storage.get('currentLocation');
    if (storedCurrentLocation) this.currentLocation = storedCurrentLocation;
  }

  toggleSelectionMode() {
    this.selectionMode = !this.selectionMode;

    // Clear selection when exiting selection mode
    if (!this.selectionMode) {
      this.savedLocations.forEach(location => {
        location.selected = false;
      });
    }
  }

  deleteSelected() {
    this.savedLocations = this.savedLocations.filter(location => !location.selected);
    this.saveTolocalStorage();
    this.selectionMode = false;
  }

  deleteLocation(index: number, slidingItem: IonItemSliding) {
    slidingItem.close();
    this.savedLocations.splice(index, 1);
    this.saveToStorage();
  }

  private saveTolocalStorage() {
    localStorage.setItem('savedLocations', JSON.stringify(this.savedLocations));
  }

  private loadSavedLocations() {
    const saved = localStorage.getItem('savedLocations');
    if (saved) {
      this.savedLocations = JSON.parse(saved);
    }
  }

  formatTemp(temp: number | undefined): string {
    return temp !== undefined ? this.settingsService.formatTemperature(temp, 'celsius') : 'N/A';
  }
}
