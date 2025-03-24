import { Injectable, OnDestroy } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment.prod';
import { Storage } from '@ionic/storage-angular';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, shareReplay, tap, map } from 'rxjs/operators'

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

  constructor(private http: HttpClient, private storage: Storage) {
    this.initStorage(); // ✅ Initialize Storage
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
    const location = { latitude, longitude, city };
    this.selectedLocationSubject.next(location);
    this.storage.set('selectedLocation', location); // ✅ Save to Storage
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
            tap(data => this.storage.set(cacheKey, { data, timestamp: Date.now() })), // ✅ Store new data in Storage
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
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;
    return this.fetchDataWithCache(url, `weather_${latitude}_${longitude}`);
  }

  getWeeklyWeather(latitude: number, longitude: number): Observable<any> {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;
    return this.fetchDataWithCache(url, `weekly_forecast_${latitude}_${longitude}`);
  }

  getHourlyWeather(latitude: number, longitude: number): Observable<any> {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;
    return this.fetchDataWithCache(url, `hourly_forecast_${latitude}_${longitude}`).pipe(
      map(data => ({
        ...data,
        list: data.list.slice(0, 24) // Get first 24 hours
      }))
    );
  }

  getPrecipitationData(latitude: number, longitude: number): Observable<any> {
    return this.getWeeklyWeather(latitude, longitude);
  }

  getVisibilityData(latitude: number, longitude: number): Observable<any> {
    return this.getWeatherData(latitude, longitude);
  }

  async clearCache() {
    await this.storage.clear();
  }
}
