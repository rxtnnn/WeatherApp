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
        const temp = Math.round(data.main.temp);

        // ✅ Fetch high & low pressure from WeatherService
        this.weatherService.highPressure$.subscribe(high => location.high = high);
        this.weatherService.lowPressure$.subscribe(low => location.low = low);

        location.temp = temp;

        if (location.isCurrentLocation) {
          this.currentLocation = { ...location };
        } else {
          this.savedLocations = [...this.savedLocations, location];
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
    if (!this.selectionMode) {
      this.weatherService.getWeatherData(location.lat, location.lon)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (data) => {
            this.weatherService.setSelectedLocation(location.lat, location.lon, location.name);
            this.router.navigateByUrl('/home');
          },
          error: (error) => {
            console.error('Error updating weather before navigation:', error);
            this.weatherService.setSelectedLocation(location.lat, location.lon, location.name);
            this.router.navigateByUrl('/home');
          }
        });
    } else {
      location.selected = !location.selected;
    }
  }

  async refreshSavedLocations() {
    const lastUpdated = await this.storage.get('lastUpdated');
    const now = Date.now();

    // Only fetch new data if it's been more than 10 minutes
    if (lastUpdated && now - lastUpdated < 600000) { // 600000ms = 10 mins
      const storedLocations = await this.storage.get('savedLocations');
      if (storedLocations) {
        this.savedLocations = storedLocations;
      }
      return;
    }

    this.savedLocations.forEach(location => {
      this.weatherService.getWeatherData(location.lat, location.lon).subscribe(data => {
        location.temp = Math.round(data.main.temp);
        location.high = Math.round(data.main.temp_max);
        location.low = Math.round(data.main.temp_min);
        this.saveToStorage(); // Save updated data
      });
    });

    await this.storage.set('lastUpdated', now);
  }


  async saveToStorage() {
    await this.storage.set('savedLocations', this.savedLocations);
  }


  async loadFromStorage() {
    const storedLocations = await this.storage.get('savedLocations');
    if (storedLocations) {
      this.savedLocations = storedLocations; // Use stored values first
    }
    this.refreshSavedLocations(); // Then update if needed
  }


  toggleSelectionMode() {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this.savedLocations.forEach(location => { location.selected = false;});
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

  formatTemp(temp: number | undefined): string {
    return temp !== undefined ? this.settingsService.formatTemperature(temp, 'celsius') : 'N/A';
  }
}
