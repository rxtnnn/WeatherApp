import { Component, OnInit, OnDestroy } from '@angular/core';
import { WeatherService } from '../services/weather.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  currentDate: string = '';
  locationCity: string = '';
  temperature: string = '';
  weatherCondition: string = '';
  highPressure: string = '';
  lowPressure: string = '';
  feelsLikeTemperature: string = '';
  feelsLikeDescription: string = '';
  humidity: string = '';
  dewPoint: string = '';
  precipitationLast3h: string = '0';
  precipitationNext24h: string = '0';
  visibility: string = '';
  visibilityDescription: string = '';
  hourlyForecast: { time: string; temp: string; condition: string }[] = [];
  weeklyForecast: { day: string; icon: string; temp: string }[] = [];

  private locationSubscription: Subscription | null = null;

  constructor(private weatherService: WeatherService) {}

  ngOnInit() {
    this.currentDate = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    // First load stored location if any
    this.weatherService.loadStoredLocation();

    // Subscribe to location changes
    this.locationSubscription = this.weatherService.selectedLocation$.subscribe(location => {
      if (location) {
        // If we have a selected location, use it
        this.getCityName(location.latitude, location.longitude);
        this.getWeatherData(location.latitude, location.longitude);
        this.getHourlyWeather(location.latitude, location.longitude);
        this.getWeeklyWeather(location.latitude, location.longitude);
        this.getPrecipitationData(location.latitude, location.longitude);
        this.getVisibilityData(location.latitude, location.longitude);

        // If the city is already known from the location selection, use it
        if (location.city) {
          this.locationCity = location.city;
        }
      } else {
        // No saved location, use current device location
        this.getCurrentLocationAndWeather();
      }
    });
  }

  ngOnDestroy() {
    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
    }
  }

  async getCurrentLocationAndWeather() {
    try {
      const { latitude, longitude } = await this.weatherService.getCurrentLocation();
      this.getCityName(latitude, longitude);
      this.getWeatherData(latitude, longitude);
      this.getHourlyWeather(latitude, longitude);
      this.getWeeklyWeather(latitude, longitude);
      this.getPrecipitationData(latitude, longitude);
      this.getVisibilityData(latitude, longitude);
    } catch (error) {
      alert('Error getting location or weather data');
      this.locationCity = 'Location unavailable';
      this.temperature = 'N/A';
      this.weatherCondition = 'N/A';
    }
  }

  getCityName(latitude: number, longitude: number) {
    // Skip if we already have the city name
    if (this.locationCity) return;

    this.weatherService.getCityName(latitude, longitude).subscribe(
      (data) => {
        this.locationCity = data.address.city || data.address.town || data.address.village || 'Unknown';
      },
      (error) => {
        console.error('Error fetching city name:', error);
        this.locationCity = 'Location unavailable';
      }
    );
  }

  getWeatherData(latitude: number, longitude: number) {
    this.weatherService.getWeatherData(latitude, longitude).subscribe(
      (data) => {
        this.temperature = `${Math.round(data.main.temp)}°`;
        this.weatherCondition = data.weather[0].description;

        const feelsLike = Math.round(data.main.feels_like);
        this.feelsLikeTemperature = `${feelsLike}°`;
        this.feelsLikeDescription = this.getFeelsLikeDescription(data.main.temp, feelsLike);

        const humidity = data.main.humidity;
        this.humidity = `${humidity}%`;
        this.dewPoint = `The dew point is ${this.calculateDewPoint(data.main.temp, humidity)}° right now.`;

        const currentPressure = data.main.pressure;
        const referencePressure = 1013;
        const temperatureDifference = (currentPressure - referencePressure) * 0.12;

        this.highPressure = `${Math.round(data.main.temp + temperatureDifference)}°`;
        this.lowPressure = `${Math.round(data.main.temp - temperatureDifference)}°`;
      },
      (error) => {
        console.error('Error fetching weather:', error);
        this.temperature = 'N/A';
        this.weatherCondition = 'N/A';
      }
    );
  }

  getHourlyWeather(latitude: number, longitude: number) {
    this.weatherService.getHourlyWeather(latitude, longitude).subscribe(
      (data) => {
        this.hourlyForecast = data.list.slice(0, 24).map((hour: any) => ({
          time: new Date(hour.dt * 1000).toLocaleTimeString([], { hour: 'numeric', hour12: true }),
          temp: `${Math.round(hour.main.temp)}°`,
          condition: hour.weather[0].main,
        }));
      },
      (error) => console.error('Error fetching hourly weather:', error)
    );
  }

  getWeeklyWeather(latitude: number, longitude: number) {
    this.weatherService.getWeeklyWeather(latitude, longitude).subscribe(
      (data) => {
        const dailyData: { [key: string]: any[] } = {};

        data.list.forEach((entry: any) => {
          const date = new Date(entry.dt * 1000).toLocaleDateString('en-US', { weekday: 'short' });
          if (!dailyData[date]) dailyData[date] = [];
          dailyData[date].push(entry);
        });

        this.weeklyForecast = Object.keys(dailyData).slice(0, 5).map((day) => {
          const dayEntries = dailyData[day];
          const maxTemp = Math.max(...dayEntries.map((entry) => entry.main.temp));
          const condition = dayEntries[0].weather[0].main;
          return { day, icon: this.getWeatherIcon(condition), temp: `${Math.round(maxTemp)}°` };
        });
      },
      (error) => console.error('Error fetching weekly weather:', error)
    );
  }

  getWeatherIcon(condition: string): string {
    switch (condition.toLowerCase()) {
      case 'clear':
        return 'sunny';
      case 'clouds':
        return 'cloudy';
      case 'rain':
        return 'rainy';
      case 'drizzle':
        return 'rainy';
      case 'thunderstorm':
        return 'thunderstorm';
      case 'snow':
        return 'snow';
      case 'mist':
      case 'fog':
        return 'cloudy-night';
      default:
        return 'partly-sunny';
    }
  }

  getFeelsLikeDescription(actualTemp: number, feelsLike: number): string {
    const difference = Math.abs(actualTemp - feelsLike);
    if (difference < 2) {
      return 'Similar to the actual temperature.';
    } else if (feelsLike > actualTemp) {
      return 'Feels warmer than the actual temperature.';
    } else {
      return 'Feels cooler than the actual temperature.';
    }
  }

  calculateDewPoint(temp: number, humidity: number): number {
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * temp) / (b + temp)) + Math.log(humidity / 100);
    return Math.trunc((b * alpha) / (a - alpha));
  }

  getPrecipitationData(latitude: number, longitude: number) {
    this.weatherService.getPrecipitationData(latitude, longitude).subscribe(
      (data) => {
        let last3hPrecip = 0;
        let totalRainNext24h = 0;

        const now = Date.now();
        data.list.forEach((hour: any) => {
          const forecastTime = hour.dt * 1000;
          if (hour.rain && hour.rain['3h']) {
            if (forecastTime >= now - 3 * 3600000 && forecastTime < now) {
              last3hPrecip = hour.rain['3h'];
            }
            if (forecastTime > now && forecastTime <= now + 24 * 3600000) {
              totalRainNext24h += hour.rain['3h'];
            }
          }
        });

        this.precipitationLast3h = last3hPrecip > 0 ? last3hPrecip.toFixed(1) : '0';
        this.precipitationNext24h = totalRainNext24h > 0 ? totalRainNext24h.toFixed(1) : '0';
      },
      (error) => console.error('Error fetching precipitation data:', error)
    );
  }

  getVisibilityData(latitude: number, longitude: number) {
    this.weatherService.getVisibilityData(latitude, longitude).subscribe(
      (data) => {
        const visibilityKm = data.visibility / 1000;
        this.visibility = `${visibilityKm} km`;
        this.visibilityDescription = this.getVisibilityDescription(visibilityKm);
      },
      (error) => console.error('Error fetching visibility data:', error)
    );
  }

  getVisibilityDescription(visibilityKm: number): string {
    if (visibilityKm >= 10) {
      return 'Perfectly clear view';
    } else if (visibilityKm >= 5) {
      return 'Good visibility';
    } else if (visibilityKm >= 2) {
      return 'Moderate visibility';
    } else if (visibilityKm >= 1) {
      return 'Poor visibility';
    } else {
      return 'Very poor visibility';
    }
  }
}
