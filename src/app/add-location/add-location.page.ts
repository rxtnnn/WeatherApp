// Fixed AddLocationPage implementation
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { WeatherService } from '../services/weather.service';
import { Subject, Subscription } from 'rxjs';
import { take, takeUntil, finalize } from 'rxjs/operators';
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
  isLoading: boolean = false;
  private destroy$ = new Subject<void>();
  private weatherApiKey = environment.weatherApiKey;
  private settingsSubscription?: Subscription;

  constructor(
    private http: HttpClient,
    private weatherService: WeatherService,
    private router: Router,
    private settingsService: SettingsService,
    private storage: Storage
  ) {}

  async ngOnInit() {
    // Initialize storage first
    await this.storage.create();

    // Check online status
    this.isOnline = (await Network.getStatus()).connected;

    // Load data from storage first to show something while fetching fresh data
    await this.loadFromStorage();

    // Initialize weather service
    await this.weatherService.initialize();

    // Get current location and refresh data
    if (this.isOnline) {
      await this.getCurrentLocation();
      this.refreshLocations();
    }

    // Subscribe to settings changes
    this.settingsSubscription = this.settingsService.settings$.subscribe(settings => {
      this.isDarkMode = settings.darkMode;
      document.body.setAttribute('color-theme', settings.darkMode ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark-mode', this.isDarkMode);
      this.updateTemperatureDisplay();
    });

    // Handle network status changes
    Network.addListener('networkStatusChange', async (status) => {
      const wasOnline = this.isOnline;
      this.isOnline = status.connected;

      if (wasOnline !== this.isOnline) { // Only show alerts when status actually changes
        if (this.isOnline) {
          const confirmRefresh = confirm('Internet restored. Refresh weather data?');
          if (confirmRefresh) {
            await this.refreshLocations();
            await this.getCurrentLocation();
          }
        } else {
          alert('You are offline. Check your connection.');
          await this.loadFromStorage();
        }
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.settingsSubscription) {
      this.settingsSubscription.unsubscribe();
    }
    // Remove network listener
    Network.removeAllListeners();
  }

  async getCurrentLocation() {
    if (!this.isOnline) {
      console.log('Offline: Cannot get current location');
      return;
    }

    this.isLoading = true;

    try {
      const { latitude, longitude } = await this.weatherService.getCurrentLocation();

      // Get city name first
      const cityData = await this.weatherService.getCityName(latitude, longitude).toPromise();

      // Update currentLocation with basic info first
      this.currentLocation = {
        name: cityData.address.city || cityData.address.town || cityData.address.village || 'Unknown',
        country: cityData.address.country || '',
        lat: latitude,
        lon: longitude,
        isCurrentLocation: true,
      };

      // Then fetch weather data
      const weatherData = await this.weatherService.getWeatherData(latitude, longitude).toPromise();
      if (weatherData && weatherData.main) {
        this.currentLocation.temp = Math.round(weatherData.main.temp);
      }

      // Get high/low temperature
      try {
        const result = await this.weatherService.getHighLowTemperature(latitude, longitude).toPromise();
        if (result) {
          this.currentLocation.high = Math.round(result.high);
          this.currentLocation.low = Math.round(result.low);
        }
      } catch (forecastError) {
        console.warn('Could not get forecast data:', forecastError);
      }

      // Format temperatures and save
      this.updateLocationTemperatureDisplay(this.currentLocation);
      await this.saveToStorage();
    } catch (error) {
      console.warn('Could not update current location:', error);
      alert('Could not access current location. Please check your location permissions.');
    } finally {
      this.isLoading = false;
    }
  }

  searchLocation(event: Event) {
    const target = event.target as HTMLIonSearchbarElement;
    const query = target.value?.toLowerCase().trim() || '';

    this.searchedLocation = null;
    this.filteredLocations = [];
    this.showingSearchResults = false;
    this.errorMessage = '';

    if (!query || query.length < 2) return;

    if (!this.isOnline) {
      this.errorMessage = 'Cannot search while offline';
      this.showingSearchResults = true;
      return;
    }

    this.showingSearchResults = true;
    this.isLoading = true;

    // Check if query matches current location
    if (this.currentLocation && this.currentLocation.name &&
        this.currentLocation.name.toLowerCase().includes(query)) {
      this.filteredLocations.push({ ...this.currentLocation, isExisting: true });
    }

    // Check if query matches saved locations
    const matchingSavedLocations = this.savedLocations.filter(
      (loc) => loc.name.toLowerCase().includes(query)
    );

    if (matchingSavedLocations.length > 0) {
      this.filteredLocations.push(
        ...matchingSavedLocations.map((loc) => ({ ...loc, isExisting: true }))
      );
    }

    // If we have local matches, we don't need to search online
    if (this.filteredLocations.length > 0) {
      this.isLoading = false;
      return;
    }

    // Search for new locations online
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${this.weatherApiKey}`;

    this.http.get<any[]>(url)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading = false)
      )
      .subscribe({
        next: (data) => {
          if (data && data.length > 0) {
            // Filter out any locations that already exist in saved locations
            const newLocations = data
              .map(item => ({
                name: item.name,
                country: item.country,
                lat: item.lat,
                lon: item.lon
              }))
              .filter(newLoc => !this.locationExists(newLoc));

            if (newLocations.length > 0) {
              this.searchedLocation = newLocations[0];
            } else {
              this.errorMessage = 'Location already saved';
            }
          } else {
            this.errorMessage = 'No locations found';
          }
        },
        error: (err) => {
          alert('Search error:'+err);
          this.errorMessage = 'Error searching for locations';
        }
      });
  }

  private updateLocationTemperatureDisplay(location: Location) {
    const unit = this.settingsService.getTemperatureUnit();
    if (location.temp !== undefined) {
      location.formattedTemp = this.settingsService.formatTemperature(location.temp, unit);
    }
    if (location.high !== undefined) {
      location.formattedHigh = this.settingsService.formatTemperature(location.high, unit);
    }
    if (location.low !== undefined) {
      location.formattedLow = this.settingsService.formatTemperature(location.low, unit);
    }
    return location;
  }

  private fetchWeatherData(location: Location) {
    if (!this.isOnline) {
      console.log('Cannot fetch weather data while offline');
      return;
    }

    this.isLoading = true;

    this.weatherService.getWeatherData(location.lat, location.lon)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading = false)
      )
      .subscribe({
        next: async (currentData) => {
          if (currentData?.main) {
            location.temp = Math.round(currentData.main.temp);

            this.weatherService.getHighLowTemperature(location.lat, location.lon)
              .pipe(take(1))
              .subscribe({
                next: (result: { high: number; low: number }) => {
                  location.high = Math.round(result.high);
                  location.low = Math.round(result.low);

                  this.updateLocationTemperatureDisplay(location);

                  if (location.isCurrentLocation) {
                    this.currentLocation = { ...location };
                  } else {
                    // Add to savedLocations if not already there
                    if (!this.savedLocations.some(loc =>
                        loc.lat === location.lat &&
                        loc.lon === location.lon)) {
                      this.savedLocations = [...this.savedLocations, location];
                    }
                    this.saveToStorage();
                  }
                },
                error: (err) => {
                  console.error('Failed to get high/low temperature:', err);
                  this.errorMessage = 'Could not fetch forecast data for temperature.';

                  // Add location anyway with just current temp
                  this.updateLocationTemperatureDisplay(location);

                  if (!location.isCurrentLocation) {
                    this.savedLocations = [...this.savedLocations, location];
                    this.saveToStorage();
                  }
                }
              });
          }
        },
        error: (err) => {
          alert('Failed to get weather data:'+ err);
          this.errorMessage = 'Could not fetch weather data';
        }
      });
  }

  openLocationDetails(location: Location) {
    if (this.isLoading) return;

    this.isLoading = true;

    this.weatherService.setSelectedLocation(location.lat, location.lon, location.name);
    this.router.navigateByUrl('/home');

    // Reset loading state after navigation timeout
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  async refreshLocations() {
    if (!this.isOnline) {
      alert('Cannot refresh while offline');
      return;
    }

    this.isLoading = true;

    try {
      // Process saved locations
      if (this.savedLocations.length > 0) {
        const promises = this.savedLocations.map(async (location) => {
          try {
            const weatherData = await this.weatherService.getWeatherData(location.lat, location.lon)
              .pipe(take(1))
              .toPromise();

            if (weatherData?.main) {
              location.temp = Math.round(weatherData.main.temp);

              try {
                const forecast = await this.weatherService.getHighLowTemperature(location.lat, location.lon)
                  .pipe(take(1))
                  .toPromise();

                if (forecast) {
                  location.high = Math.round(forecast.high);
                  location.low = Math.round(forecast.low);
                }
              } catch (forecastErr) {
                alert(`Failed to get forecast for ${location.name}:`+ forecastErr);
              }

              this.updateLocationTemperatureDisplay(location);
            }
          } catch (err) {
            alert(`Failed to refresh data for ${location.name}:`+ err);
          }
        });

        await Promise.all(promises);
      }

      // Update current location if it exists
      if (this.currentLocation?.lat && this.currentLocation?.lon) {
        await this.getCurrentLocation();
      }

      this.updateTemperatureDisplay();
      await this.saveToStorage();
    } catch (err) {
      alert('Error during refresh:'+ err);
    } finally {
      this.isLoading = false;
    }
  }

  addLocation() {
    if (!this.searchedLocation) {
      return;
    }

    if (this.locationExists(this.searchedLocation)) {
      this.errorMessage = 'Location already exists';
      return;
    }

    const newLocation: Location = {
      ...this.searchedLocation,
      formattedTemp: '',
      formattedHigh: '',
      formattedLow: ''
    };

    this.fetchWeatherData(newLocation);
    this.clearSearch();
  }

  private locationExists(location: Location): boolean {
    // Check if location exists in saved locations
    const existsInSaved = this.savedLocations.some(saved =>
      saved.name.toLowerCase() === location.name.toLowerCase() &&
      saved.country.toLowerCase() === location.country.toLowerCase() &&
      Math.abs(saved.lat - location.lat) < 0.01 &&
      Math.abs(saved.lon - location.lon) < 0.01
    );

    // Check if it's the current location
    const isCurrentLocation =
      this.currentLocation &&
      this.currentLocation.name.toLowerCase() === location.name.toLowerCase() &&
      this.currentLocation.country.toLowerCase() === location.country.toLowerCase() &&
      Math.abs(this.currentLocation.lat - location.lat) < 0.01 &&
      Math.abs(this.currentLocation.lon - location.lon) < 0.01;

    return existsInSaved || isCurrentLocation;
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchedLocation = null;
    this.filteredLocations = [];
    this.showingSearchResults = false;
    this.errorMessage = '';
  }

  async saveToStorage() {
    await Promise.all([
      this.storage.set('savedLocations', this.savedLocations),
      this.storage.set('currentLocation', this.currentLocation)
    ]);
  }

  async loadFromStorage() {
    try {
      const storedCurrentLocation = await this.storage.get('currentLocation');
      if (storedCurrentLocation) {
        this.currentLocation = storedCurrentLocation;
      }

      const storedSavedLocations = await this.storage.get('savedLocations');
      if (storedSavedLocations && Array.isArray(storedSavedLocations)) {
        this.savedLocations = storedSavedLocations;
      }

      this.updateTemperatureDisplay();
    } catch (err) {
      console.error('Error loading from storage:', err);
    }
  }

  deleteLocation(index: number, slidingItem: IonItemSliding) {
    slidingItem.close();

    if (index >= 0 && index < this.savedLocations.length) {
      this.savedLocations.splice(index, 1);
      this.saveToStorage();
    }
  }

  updateTemperatureDisplay() {
    const unit = this.settingsService.getTemperatureUnit();

    // Update current location
    if (this.currentLocation) {
      this.updateLocationTemperatureDisplay(this.currentLocation);
    }

    // Update saved locations
    this.savedLocations.forEach(location => {
      this.updateLocationTemperatureDisplay(location);
    });
  }
}
