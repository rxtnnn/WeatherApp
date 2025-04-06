import { Injectable, OnDestroy } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment.prod';
import { Storage } from '@ionic/storage-angular';
import { Observable, BehaviorSubject, throwError, from } from 'rxjs';
import { catchError, tap, map, switchMap } from 'rxjs/operators';
import { Network } from '@capacitor/network';

@Injectable({
  providedIn: 'root',
})
export class WeatherService implements OnDestroy {
  private apiKey = environment.weatherApiKey;
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();
  private selectedLocationSubject = new BehaviorSubject<{ latitude: number, longitude: number, city?: string } | null>(null);
  public selectedLocation$ = this.selectedLocationSubject.asObservable();

  constructor(private http: HttpClient, private storage: Storage) {this.initStorage(); }

  async initialize() {
    try {
      // Check if we are online first
      const isOnline = await this.isOnline();

      if (isOnline) {
        // Attempt to get the real current location when online
        const { latitude, longitude } = await this.getCurrentLocation();
        this.getWeatherData(latitude, longitude);  // Proceed with fetching weather or other data for the current location
      } else {
        // If offline, retrieve the cached location from storage
        const cachedLocation = await this.storage.get('currentLocation');
        if (cachedLocation) {
          this.getWeatherData(cachedLocation.latitude, cachedLocation.longitude);
        } else {
          // Alert the user that we are offline and there is no cached location
          alert('You are offline and no cached location is available.');
        }
      }
    } catch (error) {
      console.error('Initialization failed: ', error);
    }
  }



  ngOnDestroy() {
    this.loadingSubject.complete();
    this.selectedLocationSubject.complete();
  }

  async initStorage() {
    await this.storage.create();
  }

  async getCurrentLocation(): Promise<{ latitude: number; longitude: number, city?: string }> {
    try {
      this.loadingSubject.next(true);
      const isOnline = await this.isOnline();

      // If offline, fetch the cached current location
      if (!isOnline) {
        const cachedLocation = await this.storage.get('currentLocation');
        if (cachedLocation) {
          return cachedLocation;
        } else {
          alert('You are offline and no cached location is available.');
          throw new Error('No cached location available while offline.');
        }
      }

      // If online, get the real current location using Geolocation
      const coordinates = await Geolocation.getCurrentPosition({
        timeout: 10000,
        enableHighAccuracy: true,
      });

      const { latitude, longitude } = coordinates.coords;
      const cityName = await this.getCityName(latitude, longitude).toPromise();
      const location = { latitude, longitude, city: cityName };
      await this.storage.set('currentLocation', location);

      return location;
    } catch (error) {
      alert('Error getting location: ' + error);
      throw error;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async isOnline(): Promise<boolean> {
    const status = await Network.getStatus();
    return status.connected;
  }

  setSelectedLocation(latitude: number, longitude: number, city?: string) {
    const location = { latitude, longitude, city };
    this.selectedLocationSubject.next(location);
    this.storage.set('selectedLocation', location);
  }

  getCityName(latitude: number, longitude: number): Observable<any> {
    return this.http.get<any>(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
      .pipe(
        catchError(error => {
          return throwError(() => new Error('Failed to get city name.'));
        })
      );
  }

  private fetchDataWithCache(endpoint: string, cacheKey: string, maxAge = 10 * 60 * 1000): Observable<any> {
    return from(this.isOnline()).pipe(
      switchMap(isOnline => {
        // Return cached data when offline
        if (!isOnline) {
          return from(this.storage.get(cacheKey)).pipe(
            map(cachedData => {
              if (cachedData && Date.now() - cachedData.timestamp < maxAge) {
                return cachedData.data;
              }
              throw new Error('No valid cached data available');
            })
          );
        } else {
          // Fetch from API when online
          return this.http.get<any>(endpoint).pipe(
            tap(data => this.storage.set(cacheKey, { data, timestamp: Date.now() })),
            catchError(error => {
              console.log('Error fetching data:', error);
              return throwError(() => new Error('Failed to fetch data.'));
            })
          );
        }
      })
    );
  }

  getWeatherData(latitude: number, longitude: number): Observable<any> {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;
    const cacheKey = `weather_current_${latitude.toFixed(6)}_${longitude.toFixed(6)}`;

    return this.fetchDataWithCache(url, cacheKey).pipe(
      map(data => {
        if (data?.main) {
          const { sunrise, sunset } = data.sys || {};
          const convertUnixToLocalTime = (timestamp: number) => {
            const date = new Date(timestamp * 1000);
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          };

          return {
            ...data,
            sunrise: sunrise ? convertUnixToLocalTime(sunrise) : null,
            sunset: sunset ? convertUnixToLocalTime(sunset) : null,
          };
        }
        return data;
      }),
      catchError(error => {
        console.error('Error fetching weather data: ', error);
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

  getVisibilityData(latitude: number, longitude: number): Observable<any> {
    return this.getWeatherData(latitude, longitude);
  }

  getHighLowTemperature(latitude: number, longitude: number): Observable<{ high: number; low: number }> {
    return this.getWeeklyWeather(latitude, longitude).pipe(
      map(data => {
        if (data && data.list && Array.isArray(data.list)) {
          const temps = data.list.map((entry: any) => entry.main.temp);  //loops thru each entry in the list
          return {
            high: Math.round(Math.max(...temps)),
            low: Math.round(Math.min(...temps)),
          };
        }
        throw new Error('Forecast data is invalid.');
      }),
      catchError(error => throwError(() => new Error('Failed to fetch high/low temperatures: ' + error)))
    );
  }

  async clearCache() {
    await this.storage.clear();
  }
}
