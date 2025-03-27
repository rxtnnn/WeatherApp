import { Component, OnInit, OnDestroy } from '@angular/core';
import { WeatherService } from '../services/weather.service';
import { SettingsService } from '../services/settings.service';
import { Subscription } from 'rxjs';
import { Storage } from '@ionic/storage-angular';

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
  highTemperature: string = '';
  lowTemperature: string = '';
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
  private userLatitude?: number;
  private userLongitude?: number;
  isCurrentLocation: boolean = false;
  private locationSubscription?: Subscription;
  private settingsSubscription?: Subscription;
  selectedLatitude?: number;
  selectedLongitude?: number;
  isDarkMode?: boolean;
  private rawHighLow: { high: number; low: number } | null = null;
  // Raw temperature data for conversion
  private rawTemperatureData = {
    currentTemp: 0,
    feelsLike: 0,
    dewPointTemp: 0,
    hourlyForecast: [] as { time: string; condition: string; temp: number }[],
    weeklyForecast: [] as { day: string; icon: string; temp: number }[]
  };

  constructor(
    private weatherService: WeatherService,
    private settingsService: SettingsService,
    private storage: Storage
  ) {
    this.initStorage();
  }

  async initStorage() {
    await this.storage.create();
  }

  async ngOnInit() {
    this.currentDate = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    await this.loadStoredData();
    this.getCurrentLocation();

    this.locationSubscription = this.weatherService.selectedLocation$.subscribe(location => {
      if (location) {
        this.fetchWeatherData(location.latitude, location.longitude, location.city);
      } else {
        this.getCurrentLocation();
      }
    });

    const savedTheme = await this.storage.get('theme') || 'light';
    this.isDarkMode = savedTheme === 'dark';
    document.body.setAttribute('color-theme', savedTheme);

    this.settingsService.updateSettings({ darkMode: this.isDarkMode });
    this.settingsSubscription = this.settingsService.settings$.subscribe((settings) => {
      this.updateTemperatureDisplays();
      this.isDarkMode = settings.darkMode;
    });
  }

  ngOnDestroy() {
    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
    }
    if (this.settingsSubscription) {
      this.settingsSubscription.unsubscribe();
    }
  }

  async getCurrentLocation() {
    try {
      const { latitude, longitude } = await this.weatherService.getCurrentLocation();
      this.userLatitude = latitude;
      this.userLongitude = longitude;

      this.weatherService.getCityName(latitude, longitude).subscribe(
        async (data) => {
          this.locationCity = data.address.city || data.address.town || data.address.village || 'Unknown';
          await this.storage.set('locationCity', this.locationCity);
        },
        (error) => {
          alert('Error fetching city name: ' + error);
          this.locationCity = 'Location unavailable';
        }
      );

      this.fetchWeatherData(latitude, longitude);
    } catch (error) {
      alert('Error getting location or weather data');
      this.loadStoredData();
    }
  }

  // Main method to fetch weather details.
  fetchWeatherData(latitude: number, longitude: number, city?: string) {
    this.getTemperature(latitude, longitude);
    this.getHourlyWeather(latitude, longitude);
    this.getWeeklyWeather(latitude, longitude);
    this.getPrecipitationData(latitude, longitude);
    this.getVisibilityData(latitude, longitude);

    this.weatherService.getHighLowTemperature(latitude, longitude)
    .subscribe({
      next: (result) => {
        this.rawHighLow = result;
        // If you need to format the temperature, use your settingsService
        this.highTemperature = this.settingsService.formatTemperature(result.high, 'celsius');
        this.lowTemperature = this.settingsService.formatTemperature(result.low, 'celsius');
      },
      error: (err) => {
        console.error('Failed to fetch high/low temperatures:', err);
      }
    });

    this.selectedLatitude = latitude;
    this.selectedLongitude = longitude;
    if (city) this.locationCity = city;
    this.checkIfCurrentLocation();
  }

  async loadStoredData() {
    const storedCity = await this.storage.get('locationCity');
    const storedTemperature = await this.storage.get('temperature');
    const storedWeatherCondition = await this.storage.get('weatherCondition');
    const storedHourlyForecast = await this.storage.get('hourlyForecast');
    const storedWeeklyForecast = await this.storage.get('weeklyForecast');
    const storedHighTemp = await this.storage.get('highTemperature');
    const storedLowTemp = await this.storage.get('lowTemperature');

    if (storedCity) this.locationCity = storedCity;
    if (storedTemperature) this.temperature = storedTemperature;
    if (storedWeatherCondition) this.weatherCondition = storedWeatherCondition;
    if (storedHourlyForecast) this.hourlyForecast = storedHourlyForecast;
    if (storedWeeklyForecast) this.weeklyForecast = storedWeeklyForecast;
    if (storedHighTemp) this.highTemperature = storedHighTemp;
    if (storedLowTemp) this.lowTemperature = storedLowTemp;
  }

  async saveToStorage() {
    await this.storage.set('locationCity', this.locationCity);
    await this.storage.set('temperature', this.temperature);
    await this.storage.set('weatherCondition', this.weatherCondition);
    await this.storage.set('hourlyForecast', this.hourlyForecast);
    await this.storage.set('weeklyForecast', this.weeklyForecast);
    await this.storage.set('highTemperature', this.highTemperature);
    await this.storage.set('lowTemperature', this.lowTemperature);
  }

  async updateTemperatureDisplays() {
    if (this.rawTemperatureData.currentTemp || this.rawTemperatureData.currentTemp === 0) {
      this.temperature = this.settingsService.formatTemperature(this.rawTemperatureData.currentTemp, 'celsius');
      this.feelsLikeTemperature = this.settingsService.formatTemperature(this.rawTemperatureData.feelsLike, 'celsius');
      this.feelsLikeDescription = await this.getFeelsLikeDescription(this.rawTemperatureData.currentTemp, this.rawTemperatureData.feelsLike);
      this.dewPoint = `The dew point is ${this.settingsService.formatTemperature(this.rawTemperatureData.dewPointTemp, 'celsius')} right now.`;
    }

    // Update the hourly forecast display using the raw data.
    if (this.rawTemperatureData.hourlyForecast && this.rawTemperatureData.hourlyForecast.length > 0) {
      this.hourlyForecast = this.rawTemperatureData.hourlyForecast.map(hour => ({
        time: hour.time,
        temp: this.settingsService.formatTemperature(hour.temp, 'celsius'),
        condition: hour.condition
      }));
    }
    if (this.rawHighLow) {
      this.highTemperature = this.settingsService.formatTemperature(this.rawHighLow.high, 'celsius');
      this.lowTemperature = this.settingsService.formatTemperature(this.rawHighLow.low, 'celsius');
    }
  }


  getCityName(latitude: number, longitude: number) {
    if (this.locationCity) return;
    this.weatherService.getCityName(latitude, longitude).subscribe(
      (data) => {
        this.locationCity = data.address.city || data.address.town || data.address.village || 'Unknown';
      },
      (error) => {
        this.locationCity = 'Location unavailable';
      }
    );
  }

  // Get current weather including high and low temperatures.
  async getTemperature(latitude: number, longitude: number) {
    this.weatherService.getWeatherData(latitude, longitude).subscribe(
      async (data) => {
        const tempValue = Math.round(data.main.temp);
        const feelsLike = Math.round(data.main.feels_like);
        const humidity = data.main.humidity;
        const dewPointTemp = await this.calculateDewPoint(data.main.temp, humidity);

        this.rawTemperatureData.currentTemp = tempValue;
        this.rawTemperatureData.feelsLike = feelsLike;
        this.rawTemperatureData.dewPointTemp = dewPointTemp;

        this.temperature = this.settingsService.formatTemperature(tempValue, 'celsius');
        this.weatherCondition = data.weather[0].description;
        this.feelsLikeTemperature = this.settingsService.formatTemperature(feelsLike, 'celsius');
        this.feelsLikeDescription = await this.getFeelsLikeDescription(tempValue, feelsLike);
        this.humidity = `${humidity}%`;
        this.dewPoint = `The dew point is ${this.settingsService.formatTemperature(dewPointTemp, 'celsius')} right now.`;

        await this.saveToStorage();
      },
      async (error) => {
        alert('Error fetching weather: ' + error);
        this.temperature = (await this.storage.get('temperature')) || 'N/A';
      }
    );
  }

  async getHourlyWeather(latitude: number, longitude: number) {
    this.weatherService.getHourlyWeather(latitude, longitude).subscribe(
      async (data) => {
        this.rawTemperatureData.hourlyForecast = data.list.slice(0, 24).map((hour: any) => ({
          time: new Date(hour.dt * 1000).toLocaleTimeString([], { hour: 'numeric', hour12: true }),
          temp: hour.main.temp,
          condition: hour.weather[0].main,
        }));
        this.hourlyForecast = this.rawTemperatureData.hourlyForecast.map(hour => ({
          time: hour.time,
          temp: this.settingsService.formatTemperature(hour.temp, 'celsius'),
          condition: hour.condition
        }));
        await this.storage.set('hourlyForecast', this.hourlyForecast);
      },
      async (error) => {
        alert('Error fetching hourly weather: ' + error);
        this.hourlyForecast = (await this.storage.get('hourlyForecast')) || [];
      }
    );
  }

  async getWeeklyWeather(latitude: number, longitude: number) {
    this.weatherService.getWeeklyWeather(latitude, longitude).subscribe(
      async (data) => {
        const dailyData: { [key: string]: any[] } = {};

        data.list.forEach((entry: any) => {
          const date = new Date(entry.dt * 1000).toLocaleDateString('en-US', { weekday: 'short' });
          if (!dailyData[date])
            dailyData[date] = [];
          dailyData[date].push(entry);
        });

        this.rawTemperatureData.weeklyForecast = Object.keys(dailyData).slice(0, 5).map((day) => {
          const dayEntries = dailyData[day];
          const maxTemp = Math.max(...dayEntries.map((entry) => entry.main.temp));
          const condition = dayEntries[0].weather[0].main;
          return { day, icon: this.getWeatherIcon(condition), temp: maxTemp };
        });

        this.weeklyForecast = this.rawTemperatureData.weeklyForecast.map(day => ({
          day: day.day,
          icon: day.icon,
          temp: this.settingsService.formatTemperature(day.temp, 'celsius')
        }));
        await this.storage.set('weeklyForecast', this.weeklyForecast);
      },
      async (error) => {
        alert('Error fetching weekly weather: ' + error);
        this.weeklyForecast = (await this.storage.get('weeklyForecast')) || [];
      }
    );
  }

  async getPrecipitationData(latitude: number, longitude: number) {
    this.weatherService.getPrecipitationData(latitude, longitude).subscribe(
      async (data) => {
        let last3hPrecip = 0;
        let totalRainNext24h = 0;
        const now = Date.now();

        if (data.list) {
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
        }
        this.precipitationLast3h = last3hPrecip > 0 ? last3hPrecip.toFixed(1) : '0';
        this.precipitationNext24h = totalRainNext24h > 0 ? totalRainNext24h.toFixed(1) : '0';
        await this.storage.set('precipitationLast3h', this.precipitationLast3h);
        await this.storage.set('precipitationNext24h', this.precipitationNext24h);
      },
      async (error) => {
        alert('Error fetching precipitation data: ' + error);
        this.precipitationLast3h = (await this.storage.get('precipitationLast3h')) || '0';
        this.precipitationNext24h = (await this.storage.get('precipitationNext24h')) || '0';
      }
    );
  }

  async getVisibilityData(latitude: number, longitude: number) {
    this.weatherService.getVisibilityData(latitude, longitude).subscribe(
      async (data) => {
        const visibilityKm = Math.round(data.visibility / 1000);
        this.visibility = `${visibilityKm} km`;
        this.visibilityDescription = this.getVisibilityDescription(visibilityKm);

        await this.storage.set('visibility', this.visibility);
        await this.storage.set('visibilityDescription', this.visibilityDescription);
      },
      async (error) => {
        this.visibility = (await this.storage.get('visibility')) || 'N/A';
        this.visibilityDescription = (await this.storage.get('visibilityDescription')) || 'No Data';
      }
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

  async checkIfCurrentLocation() {
    if (this.userLatitude && this.userLongitude && this.selectedLatitude && this.selectedLongitude) {
      this.isCurrentLocation =
        Math.abs(this.userLatitude - this.selectedLatitude) < 0.01 &&
        Math.abs(this.userLongitude - this.selectedLongitude) < 0.01;
      await this.storage.set('isCurrentLocation', this.isCurrentLocation);
    } else {
      this.isCurrentLocation = false;
      await this.storage.set('isCurrentLocation', false);
    }
  }

  formatTemp(temp: number | undefined): string {
    return temp !== undefined ? this.settingsService.formatTemperature(temp, 'celsius') : 'N/A';
  }
  getWeatherIcon(condition: string): string {
    switch (condition.toLowerCase()) {
      case 'clear':
        return 'sunny';
      case 'clouds':
        return 'cloudy';
      case 'rain':
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

  async getFeelsLikeDescription(actualTemp: number, feelsLike: number): Promise<string> {
    const difference = Math.abs(actualTemp - feelsLike);
    if (difference < 2) {
      return 'Similar to the actual temperature.';
    } else if (feelsLike > actualTemp) {
      return 'Feels warmer than the actual temperature.';
    } else {
      return 'Feels cooler than the actual temperature.';
    }
  }

  async calculateDewPoint(temp: number, humidity: number): Promise<number> {
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * temp) / (b + temp)) + Math.log(humidity / 100);
    return Math.trunc((b * alpha) / (a - alpha));
  }
}
