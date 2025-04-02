import { Injectable, OnDestroy } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment.prod';
import { Storage } from '@ionic/storage-angular';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, shareReplay, tap, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class WeatherService implements OnDestroy {
  private apiKey = environment.weatherApiKey;

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private selectedLocationSubject = new BehaviorSubject<{ latitude: number, longitude: number, city?: string } | null>(null);
  public selectedLocation$ = this.selectedLocationSubject.asObservable();

  constructor(private http: HttpClient, private storage: Storage) { }

  async ngOnInit() {
    await this.initStorage();

    try {
      const { latitude, longitude } = await this.getCurrentLocation();
      this.getWeatherData(latitude, longitude);
    } catch (error) {
      console.warn('Could not retrieve current location.');
      console.log('Unable to get your current location. Please select a location manually.');
    }
  }

  ngOnDestroy() {
    this.loadingSubject.complete();
    this.selectedLocationSubject.complete();
  }

  async initStorage() {
    await this.storage.create();
  }

  async getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
    try {
      this.loadingSubject.next(true);
      const coordinates = await Geolocation.getCurrentPosition();
      return { latitude: coordinates.coords.latitude, longitude: coordinates.coords.longitude };
    } catch (error) {
      console.log('Error getting location: ', error);
      throw error;
    } finally {
      this.loadingSubject.next(false);
    }
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
          console.log('Error fetching city name: ', error);
          return throwError(() => new Error('Failed to get city name.'));
        })
      );
  }

  private fetchDataWithCache(endpoint: string, cacheKey: string): Observable<any> {
    return new Observable(observer => {
      this.storage.get(cacheKey).then((cachedData) => {
        if (cachedData) {
          observer.next(cachedData.data);
          observer.complete();
        } else {
          this.http.get<any>(endpoint).pipe(
            tap(data => this.storage.set(cacheKey, { data, timestamp: Date.now() })),
            catchError(error => {
              return throwError(() => new Error('No offline data available'));
            })
          ).subscribe(observer);
        }
      });
    }).pipe(shareReplay(1));
  }


  getWeatherData(latitude: number, longitude: number): Observable<any> {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}&nocache=${Date.now()}`;

    return this.http.get<any>(url).pipe(
      map(data => {
        if (data?.main){
          const { sunrise, sunset } = data.sys || {};

          const convertUnixToLocalTime = (timestamp: number) => {
            const date = new Date(timestamp * 1000);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
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
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;
    return this.fetchDataWithCache(url, `precipitation_${latitude}_${longitude}`);
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
