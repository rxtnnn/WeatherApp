import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { WeatherService } from '../services/weather.service';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { IonItemSliding } from '@ionic/angular';

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

  // Location properties
  currentLocation: Location = {
    name: '',
    country: '',
    lat: 0,
    lon: 0,
    isCurrentLocation: true
  };
  savedLocations: Location[] = [];

  // UI state properties
  isLoading = false;
  errorMessage = '';
  selectionMode = false;

  // RxJS cleanup
  private destroy$ = new Subject<void>();
  private weatherApiKey = environment.weatherApiKey;

  constructor(
    private http: HttpClient,
    private weatherService: WeatherService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadSavedLocations();
    this.getCurrentLocation();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Loads the user's current device location
   */
  async getCurrentLocation() {
    this.isLoading = true;
    try {
      // Get coordinates from device
      const { latitude, longitude } = await this.weatherService.getCurrentLocation();

      // Get city name
      this.weatherService.getCityName(latitude, longitude)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (data) => {
            const cityName = data.address.city || data.address.town || data.address.village || 'Unknown';
            const countryName = data.address.country || '';

            // Fetch weather data for this location
            this.fetchWeatherData({
              name: cityName,
              country: countryName,
              lat: latitude,
              lon: longitude,
              isCurrentLocation: true
            });
          },
          error: (error) => {
            this.errorMessage = 'Could not determine your location';
            this.isLoading = false;
          }
        });
    } catch (error) {
      this.errorMessage = 'Location access denied or unavailable';
      this.isLoading = false;
    }
  }

  /**
   * Searches for locations based on user input
   */
  searchLocation() {
    if (!this.searchQuery || this.searchQuery.length < 2) {
      this.searchedLocation = null;
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(this.searchQuery)}&limit=5&appid=${this.weatherApiKey}`;

    this.http.get<any[]>(url)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          if (data && data.length > 0) {
            // Just take the first result
            this.searchedLocation = {
              name: data[0].name,
              country: data[0].country,
              lat: data[0].lat,
              lon: data[0].lon
            };
          } else {
            this.searchedLocation = null;
            this.errorMessage = 'No locations found';
          }

          this.isLoading = false;
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = 'Error searching for locations';
          this.searchedLocation = null;
        }
      });
  }

  /**
   * Adds a location from search results to saved locations
   */
  addLocation() {
    if (!this.searchedLocation) {
      return;
    }

    // Check if location already exists
    const isDuplicate = this.locationExists(this.searchedLocation);

    if (isDuplicate) {
      this.errorMessage = 'This location is already saved';
      return;
    }

    this.fetchWeatherData(this.searchedLocation);
    this.searchQuery = '';
    this.searchedLocation = null;
  }

  /**
   * Checks if location is already in saved locations
   */
  private locationExists(location: Location): boolean {
    // Check if already in saved locations
    const existsInSaved = this.savedLocations.some(
      saved => Math.abs(saved.lat - location.lat) < 0.01 &&
               Math.abs(saved.lon - location.lon) < 0.01
    );

    // Check if it's the current location
    const isCurrentLocation = this.currentLocation &&
                            Math.abs(this.currentLocation.lat - location.lat) < 0.01 &&
                            Math.abs(this.currentLocation.lon - location.lon) < 0.01;

    return existsInSaved || isCurrentLocation;
  }

  /**
   * Fetches weather data for a location and adds it to the appropriate list
   */
  private fetchWeatherData(location: Location) {
    this.isLoading = true;

    this.weatherService.getWeatherData(location.lat, location.lon)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          // Prepare location with weather data
          const locationWithWeather: Location = {
            ...location,
            temp: Math.round(data.main.temp),
            high: Math.round(data.main.temp_max),
            low: Math.round(data.main.temp_min)
          };

          // Add to appropriate list
          if (location.isCurrentLocation) {
            this.currentLocation = locationWithWeather;
          } else {
            this.savedLocations.push(locationWithWeather);
            this.saveTolocalStorage();
          }

          this.isLoading = false;
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = 'Could not fetch weather data';
        }
      });
  }

  /**
   * Opens location details
   */
  openLocationDetails(location: Location) {
    // Only navigate if not in selection mode
    if (!this.selectionMode) {
      this.weatherService.setSelectedLocation(location.lat, location.lon, location.name);
      this.router.navigateByUrl('/home');
    } else {
      // Toggle selection
      location.selected = !location.selected;
    }
  }

  /**
   * Toggle selection mode
   */
  toggleSelectionMode() {
    this.selectionMode = !this.selectionMode;

    // Clear selection when exiting selection mode
    if (!this.selectionMode) {
      this.savedLocations.forEach(location => {
        location.selected = false;
      });
    }
  }

  /**
   * Delete selected locations
   */
  deleteSelected() {
    this.savedLocations = this.savedLocations.filter(location => !location.selected);
    this.saveTolocalStorage();
    this.selectionMode = false;
  }

  /**
   * Removes a location from saved locations
   */
  deleteLocation(index: number, slidingItem: IonItemSliding) {
    slidingItem.close();
    this.savedLocations.splice(index, 1);
    this.saveTolocalStorage();
  }

  /**
   * Saves locations to local storage
   */
  private saveTolocalStorage() {
    localStorage.setItem('savedLocations', JSON.stringify(this.savedLocations));
  }

  /**
   * Loads locations from local storage
   */
  private loadSavedLocations() {
    const saved = localStorage.getItem('savedLocations');
    if (saved) {
      this.savedLocations = JSON.parse(saved);
    }
  }
}
