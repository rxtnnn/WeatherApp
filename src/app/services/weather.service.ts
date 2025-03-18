import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, from } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { Storage } from '@ionic/storage-angular';
import { Geolocation } from '@capacitor/geolocation';
import { environment } from '../../environments/environment'; // Use environment file for API keys

export interface WeatherData {
  location: {
    name: string;
    country: string;
    lat: number;
    lon: number;
  };
  current: {
    temp_c: number;
    temp_f: number;
    condition: {
      text: string;
      icon: string;
    };
    humidity: number;
    wind_kph: number;
    feelslike_c: number;
    feelslike_f: number;
    precip_mm: number;
  };
  forecast: {
    forecastday: Array<{
      date: string;
      day: {
        maxtemp_c: number;
        maxtemp_f: number;
        mintemp_c: number;
        mintemp_f: number;
        condition: {
          text: string;
          icon: string;
        };
        daily_chance_of_rain: number;
      };
      hour: Array<{
        time: string;
        temp_c: number;
        temp_f: number;
        condition: {
          text: string;
          icon: string;
        };
        chance_of_rain: number;
      }>;
    }>;
  };
}

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private apiKey = environment.weatherApiKey; // Store API key securely in environment.ts
  private apiUrl = 'https://api.weatherapi.com/v1';
  private cacheExpiryTime = 30 * 60 * 1000; // 30 minutes

  constructor(
    private http: HttpClient,
    private storage: Storage
  ) {
    this.initStorage();
  }

  private async initStorage() {
    await this.storage.create();
  }

  async getCurrentLocation(): Promise<{ latitude: number, longitude: number }> {
    try {
      const position = await Geolocation.getCurrentPosition();
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    } catch (error) {
      console.error('Error getting location:', error);
      throw new Error('Failed to retrieve location. Please enable GPS.');
    }
  }

  getWeatherByCoords(lat: number, lon: number): Observable<WeatherData> {
    const cacheKey = `weather_${lat}_${lon}`;

    return from(this.storage.get(cacheKey)).pipe(
      map((storedData) => {
        if (storedData && (Date.now() - storedData.timestamp) < this.cacheExpiryTime) {
          return storedData.data;
        } else {
          throw new Error('Cache expired or not found');
        }
      }),
      catchError(() => {
        return this.http.get<WeatherData>(
          `${this.apiUrl}/forecast.json?key=${this.apiKey}&q=${lat},${lon}&days=5&aqi=no&alerts=no`
        ).pipe(
          tap(data => this.storage.set(cacheKey, { data, timestamp: Date.now() })),
          catchError(error => {
            console.error('Weather API Error:', error);
            throw new Error('Failed to fetch weather data. Check your internet connection.');
          })
        );
      })
    );
  }

  getWeatherByCity(city: string): Observable<WeatherData> {
    const cacheKey = `weather_${city}`;

    return from(this.storage.get(cacheKey)).pipe(
      map((storedData) => {
        if (storedData && (Date.now() - storedData.timestamp) < this.cacheExpiryTime) {
          return storedData.data;
        } else {
          throw new Error('Cache expired or not found');
        }
      }),
      catchError(() => {
        return this.http.get<WeatherData>(
          `${this.apiUrl}/forecast.json?key=${this.apiKey}&q=${city}&days=5&aqi=no&alerts=no`
        ).pipe(
          tap(data => this.storage.set(cacheKey, { data, timestamp: Date.now() })),
          catchError(error => {
            console.error('Weather API Error:', error);
            throw new Error('Failed to fetch weather data. Check your internet connection.');
          })
        );
      })
    );
  }

  searchLocations(query: string): Observable<any> {
    if (!query || query.length < 3) {
      return of([]);
    }

    return this.http.get<any>(
      `${this.apiUrl}/search.json?key=${this.apiKey}&q=${query}`
    ).pipe(
      catchError(error => {
        console.error('Location search error:', error);
        return of([]); // Return an empty array instead of throwing an error
      })
    );
  }
}
