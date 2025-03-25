import { Injectable, OnDestroy } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment.prod';
import { Storage } from '@ionic/storage-angular';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, shareReplay, tap, map } from 'rxjs/operators';
import { SettingsService } from './settings.service';

@Injectable({
  providedIn: 'root',
})
export class WeatherService implements OnDestroy {
  private apiKey = environment.weatherApiKey;
  private readonly CACHE_TIMEOUT = 10 * 60 * 1000; // 10 minutes cache time

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private selectedLocationSubject = new BehaviorSubject<{ latitude: number, longitude: number, city?: string } | null>(null);
  public selectedLocation$ = this.selectedLocationSubject.asObservable();

  // ✅ High and Low Pressure Subjects
  private highPressureSubject = new BehaviorSubject<number>(0);
  public highPressure$ = this.highPressureSubject.asObservable();

  private lowPressureSubject = new BehaviorSubject<number>(0);
  public lowPressure$ = this.lowPressureSubject.asObservable();

  constructor(private http: HttpClient, private storage: Storage, private settingsService: SettingsService) {
    this.initStorage();
  }

  async initStorage() {
    await this.storage.create();
  }

  ngOnDestroy() {
    this.loadingSubject.complete();
    this.selectedLocationSubject.complete();
  }

  async getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
    try {
      this.loadingSubject.next(true);
      const coordinates = await Geolocation.getCurrentPosition();
      return { latitude: coordinates.coords.latitude, longitude: coordinates.coords.longitude };
    } catch (error) {
      console.error('Error getting location:', error);
      throw error;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  setSelectedLocation(latitude: number, longitude: number, city?: string) {
    console.log(`Setting new location: ${latitude}, ${longitude}, City: ${city}`); // ✅ Debugging

    const location = { latitude, longitude, city };
    this.selectedLocationSubject.next(location);
    this.storage.set('selectedLocation', location);
  }


  async loadStoredLocation() {
    const storedLocation = await this.storage.get('selectedLocation');
    if (storedLocation) {
      this.selectedLocationSubject.next(storedLocation);
    }
  }

  getCityName(latitude: number, longitude: number): Observable<any> {
    return this.http.get<any>(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
      .pipe(
        catchError(error => {
          console.error('Error fetching city name:', error);
          return throwError(() => new Error('Failed to get city name.'));
        })
      );
  }

  private fetchDataWithCache(endpoint: string, cacheKey: string): Observable<any> {
    return new Observable(observer => {
      this.storage.get(cacheKey).then((cachedData) => {
        const now = Date.now();
        if (cachedData && (now - cachedData.timestamp) < this.CACHE_TIMEOUT) {
          console.log(`🟢 Using cached data for ${cacheKey}`);
          observer.next(cachedData.data);
          observer.complete();
        } else {
          console.log(`🔄 Fetching new data for ${cacheKey}`);
          this.http.get<any>(endpoint).pipe(
            tap(data => this.storage.set(cacheKey, { data, timestamp: Date.now() })),
            catchError(error => {
              console.error(`Error fetching ${cacheKey}. Using cached data if available.`, error);
              return cachedData ? of(cachedData.data) : throwError(() => new Error('No offline data available'));
            })
          ).subscribe(observer);
        }
      });
    }).pipe(shareReplay(1));
  }
  getWeatherData(latitude: number, longitude: number): Observable<any> {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}&nocache=${Date.now()}`;

    console.log(`Fetching weather data for: ${latitude}, ${longitude}`); // ✅ Debugging

    return this.http.get<any>(url).pipe(
      tap(data => {
        console.log('Weather API Response:', data); // ✅ Check if API returns correct data
        if (data && data.main) {
          this.updatePressureValues(data);
        }
      }),
      catchError(error => {
        console.error(`Error fetching weather data for ${latitude}, ${longitude}:`, error);
        return throwError(() => new Error('Failed to fetch weather data.'));
      })
    );
  }

  getWeeklyWeather(latitude: number, longitude: number): Observable<any> {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;
    return this.fetchDataWithCache(url, `weekly_forecast_${latitude}_${longitude}`);
  }

  getHourlyWeather(latitude: number, longitude: number): Observable<any> {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;
    const cacheKey = `weather_${latitude.toFixed(6)}_${longitude.toFixed(6)}`;
    return this.fetchDataWithCache(url, cacheKey);
  }

  getPrecipitationData(latitude: number, longitude: number): Observable<any> {
    return this.getWeeklyWeather(latitude, longitude);
  }

  getVisibilityData(latitude: number, longitude: number): Observable<any> {
    return this.getWeatherData(latitude, longitude);
  }

  updatePressureValues(data: any) {
    if (!data || !data.main) return;

    const temp = data.main.temp;
    const pressure = data.main.pressure;

    console.log(`Updating Pressure - Temp: ${temp}, Pressure: ${pressure}`); // ✅ Debugging

    const referencePressure = 1013;
    const temperatureDifference = (pressure - referencePressure) * 0.12;

    const high = Math.round(temp + temperatureDifference);
    const low = Math.round(temp - temperatureDifference);

    console.log(`High Pressure: ${high}, Low Pressure: ${low}`); // ✅ Debugging

    this.highPressureSubject.next(high);
    this.lowPressureSubject.next(low);
  }


  async loadStoredPressure() {
    const highPressure = await this.storage.get('highPressure');
    const lowPressure = await this.storage.get('lowPressure');

    if (highPressure !== null && lowPressure !== null) {
      this.settingsService.settings$.subscribe(settings => {
        const convertedHigh = this.settingsService.convertTemperature(highPressure, settings.temperatureUnit);
        const convertedLow = this.settingsService.convertTemperature(lowPressure, settings.temperatureUnit);

        this.highPressureSubject.next(convertedHigh);
        this.lowPressureSubject.next(convertedLow);

        this.storage.set('highPressure',  settings.temperatureUnit);
        this.storage.set('lowPressure',  settings.temperatureUnit);
      });
    }
  }

  async clearCache() {
    await this.storage.clear();
  }
}
