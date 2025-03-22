import { Injectable, OnDestroy } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment.prod';
import { Observable, BehaviorSubject, of, throwError, catchError, shareReplay, tap, map } from 'rxjs';


@Injectable({
  providedIn: 'root',
})
export class WeatherService implements OnDestroy {
  private apiKey = environment.weatherApiKey;

  // Cache for forecast data to avoid redundant API calls
  private forecastCache: { [key: string]: { data: any, timestamp: number } } = {};
  private weatherCache: { [key: string]: { data: any, timestamp: number } } = {};

  // Tracks loading state
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  // Cache timeout in milliseconds (10 minutes)
  private readonly CACHE_TIMEOUT = 10 * 60 * 1000;
  // Stores selected location
  private selectedLocationSubject = new BehaviorSubject<{ latitude: number, longitude: number, city?: string } | null>(null);
  public selectedLocation$ = this.selectedLocationSubject.asObservable();

  constructor(private http: HttpClient) {}

  ngOnDestroy() {
    this.loadingSubject.complete();
    this.selectedLocationSubject.complete();
  }

  /**
   * Gets current device location
   */
  async getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
    try {
      this.loadingSubject.next(true);
      const coordinates = await Geolocation.getCurrentPosition();
      const { latitude, longitude } = coordinates.coords;
      return { latitude, longitude };
    } catch (error) {
      console.error('Error getting location:', error);
      throw error;
    } finally {
      this.loadingSubject.next(false);
    }
  }
  setSelectedLocation(latitude: number, longitude: number, city?: string) {
    const location = { latitude, longitude, city };
    this.selectedLocationSubject.next(location);
    localStorage.setItem('selectedLocation', JSON.stringify(location)); // Save to local storage
  }

  /**
   * Loads stored location from local storage
   */
  loadStoredLocation() {
    const storedLocation = localStorage.getItem('selectedLocation');
    if (storedLocation) {
      this.selectedLocationSubject.next(JSON.parse(storedLocation));
    }
  }


  /**
   * Gets city name from coordinates using OpenStreetMap
   */
   getCityName(latitude: number, longitude: number): Observable<any> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`;

    return this.http.get<any>(url).pipe(
      catchError(error => {
        console.error('Error fetching city name:', error);
        return throwError(() => new Error('Failed to get city name.'));
      })
    );
  }

  /**
   * Gets current weather data
   */
  getWeatherData(latitude: number, longitude: number): Observable<any> {
    const cacheKey = `weather_${latitude}_${longitude}`;
    const cachedData = this.weatherCache[cacheKey];

    if (cachedData && (Date.now() - cachedData.timestamp) < this.CACHE_TIMEOUT) {
      return of(cachedData.data);
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;

    return this.http.get<any>(url).pipe(
      tap(data => {
        this.weatherCache[cacheKey] = { data, timestamp: Date.now() };
      }),
      catchError(error => {
        console.error('Error fetching weather data:', error);
        return throwError(() => new Error('Failed to get weather data.'));
      }),
      shareReplay(1)
    );
  }

  /**
   * Gets forecast data with caching
   */
  private getForecastData(latitude: number, longitude: number): Observable<any> {
    const cacheKey = `forecast_${latitude}_${longitude}`;
    const cachedData = this.forecastCache[cacheKey];

    // Return cached data if it exists and is still valid
    if (cachedData && (Date.now() - cachedData.timestamp) < this.CACHE_TIMEOUT) {
      return of(cachedData.data);
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;

    this.loadingSubject.next(true);
    return this.http.get<any>(url).pipe(
      tap(data => {
        // Cache the result
        this.forecastCache[cacheKey] = {
          data,
          timestamp: Date.now()
        };
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        console.error('Error fetching forecast data:', error);
        return throwError(() => new Error('Failed to get forecast data. Please try again.'));
      }),
      shareReplay(1)
    );
  }

  /**
   * Gets hourly forecast data
   */
  getHourlyWeather(latitude: number, longitude: number): Observable<any> {
    return this.getForecastData(latitude, longitude).pipe(
      map(data => {
        return {
          ...data,
          list: data.list.slice(0, 24) // Just return the first 24 hours
        };
      })
    );
  }

  /**
   * Gets daily forecast data
   */
  getWeeklyWeather(latitude: number, longitude: number): Observable<any> {
    return this.getForecastData(latitude, longitude);
  }

  /**
   * Gets precipitation data
   */
  getPrecipitationData(latitude: number, longitude: number): Observable<any> {
    return this.getForecastData(latitude, longitude);
  }

  /**
   * Gets visibility data
   */
  getVisibilityData(latitude: number, longitude: number): Observable<any> {
    return this.getWeatherData(latitude, longitude);
  }

  /**
   * Clears service caches
   */
  clearCache() {
    this.forecastCache = {};
    this.weatherCache = {};
  }

}
