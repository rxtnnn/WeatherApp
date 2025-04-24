import { Component, OnInit, OnDestroy } from '@angular/core';
import { WeatherService } from '../services/weather.service';
import { SettingsService } from '../services/settings.service';
import { Observable, Subject, Subscription, takeUntil } from 'rxjs';
import { Storage } from '@ionic/storage-angular';
import { Network } from '@capacitor/network';

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
  visibility: string = '';
  visibilityDescription: string = '';
  sunrise?: string;
  sunset?: string;
  hourlyForecast: { time: string; temp: string; condition: string; hour: number; icon: string; }[] = [];
  weeklyForecast: { day: string; icon: string; temp: string }[] = [];
  private userLatitude?: number;
  private userLongitude?: number;
  isCurrentLocation: boolean = false;
  private locationSubscription?: Subscription;
  private settingsSubscription?: Subscription;
  selectedLatitude?: number;
  selectedLongitude?: number;
  isDarkMode?: boolean;
  isOnline: boolean = true;
  networkMessage: string = '';
  temperatureUnit: 'celsius' | 'fahrenheit' = 'celsius';
  private rawHighLow?: { high: number; low: number };

  private rawTemperatureData = {
    currentTemp: 0,
    feelsLike: 0,
    dewPointTemp: 0,
    hourlyForecast: [] as { time: string; condition: string; temp: number; hour: number, icon: string; }[],
    weeklyForecast: [] as { day: string; icon: string; temp: number }[]
  };

  selectedLocation$: Observable<{ latitude: number, longitude: number, city?: string } | null>;
  private destroy$ = new Subject<void>();

  constructor(
    private weatherService: WeatherService,
    private settingsService: SettingsService,
    private storage: Storage
  ) {
    this.initStorage();
    this.selectedLocation$ = this.weatherService.selectedLocation$.pipe(takeUntil(this.destroy$));
  }

  async initStorage() {
    await this.storage.create();
  }

  async ngOnInit() {
    await this.weatherService.initialize();
    await this.loadStoredData();

    // Check online status
    this.isOnline = (await Network.getStatus()).connected;
    this.currentDate = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    this.settingsSubscription = this.settingsService.settings$.subscribe(settings => {
      this.isDarkMode = settings.darkMode;
      document.body.setAttribute('color-theme', settings.darkMode ? 'dark' : 'light');

      const newUnit = this.settingsService.getTemperatureUnit();
      if (this.temperatureUnit !== newUnit) {
        this.temperatureUnit = newUnit;
        this.updateTemperatureDisplays();
      }
    });

    this.locationSubscription = this.weatherService.selectedLocation$.subscribe(location => {
      if (location) {
        this.fetchWeatherData(location.latitude, location.longitude, location.city);
      } else {
        this.getCurrentLocation();
      }
    });

    Network.addListener('networkStatusChange', async (status) => {
      const wasOffline = !this.isOnline;
      this.isOnline = status.connected;

      if (this.isOnline && wasOffline) { //checks if currently online and prev offline
        alert('Internet connection restored.');
        const confirmRefresh = confirm('Internet restored. Refresh weather data?');

        if (confirmRefresh) {
          if (this.selectedLatitude && this.selectedLongitude) { //it fetch if naay selected location
            this.fetchWeatherData(this.selectedLatitude, this.selectedLongitude, this.locationCity);
          } else {
            await this.getCurrentLocation();
          }
        }
      } else if (!this.isOnline) {
        alert('You are offline. Check your connection.');
        this.loadStoredData();
      }
    });
  }

  ngOnDestroy() {
    if (this.locationSubscription) { this.locationSubscription.unsubscribe(); }
    if (this.settingsSubscription) { this.settingsSubscription.unsubscribe(); }
    Network.removeAllListeners();
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
          alert('Error fetching city name: '+ error);
          this.locationCity = 'Location unavailable';
        }
      );

      this.fetchWeatherData(latitude, longitude);
    } catch (error) {
      this.loadStoredData();
    }
  }

  fetchWeatherData(latitude: number, longitude: number, city?: string) {
    this.getTemperature(latitude, longitude);
    this.getHourlyWeather(latitude, longitude);
    this.getWeeklyWeather(latitude, longitude);
    this.getVisibilityData(latitude, longitude);

    this.weatherService.getHighLowTemperature(latitude, longitude)
      .subscribe({
        next: (result) => {
          this.rawHighLow = result;
          this.highTemperature = this.settingsService.formatTemperature(result.high, this.temperatureUnit);
          this.lowTemperature = this.settingsService.formatTemperature(result.low, this.temperatureUnit);
        },
        error: (err) => {
          alert('Failed to fetch high/low temperatures:' + err);
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
    const storedVisibility = await this.storage.get('visibility');
    const storedFeelsLike = await this.storage.get('feelsLikeTemperature');
    const storedFeelsLikeDesc = await this.storage.get('feelsLikeDescription');
    const storedHumidity = await this.storage.get('humidity');
    const storedDewPoint = await this.storage.get('dewPoint');

    if (storedCity) this.locationCity = storedCity;
    if (storedTemperature) this.temperature = storedTemperature;
    if (storedWeatherCondition) this.weatherCondition = storedWeatherCondition;
    if (storedHourlyForecast) this.hourlyForecast = storedHourlyForecast;
    if (storedWeeklyForecast) this.weeklyForecast = storedWeeklyForecast;
    if (storedHighTemp) this.highTemperature = storedHighTemp;
    if (storedLowTemp) this.lowTemperature = storedLowTemp;
    if (storedVisibility) this.visibility = storedVisibility;
    if (storedFeelsLike) this.feelsLikeTemperature = storedFeelsLike;
    if (storedFeelsLikeDesc) this.feelsLikeDescription = storedFeelsLikeDesc;
    if (storedHumidity) this.humidity = storedHumidity;
    if (storedDewPoint) this.dewPoint = storedDewPoint;

    this.temperatureUnit = this.settingsService.getTemperatureUnit();
  }

  async saveToStorage() {
    await this.storage.set('locationCity', this.locationCity);
    await this.storage.set('temperature', this.temperature);
    await this.storage.set('weatherCondition', this.weatherCondition);
    await this.storage.set('hourlyForecast', this.hourlyForecast);
    await this.storage.set('weeklyForecast', this.weeklyForecast);
    await this.storage.set('highTemperature', this.highTemperature);
    await this.storage.set('lowTemperature', this.lowTemperature);
    await this.storage.set('sunrise', this.sunrise);
    await this.storage.set('sunset', this.sunset);
    await this.storage.set('visibility', this.visibility);
    await this.storage.set('feelsLikeTemperature', this.feelsLikeTemperature);
    await this.storage.set('feelsLikeDescription', this.feelsLikeDescription);
    await this.storage.set('humidity', this.humidity);
  }

  async updateTemperatureDisplays() {
    const unit = this.temperatureUnit;

    if (this.rawTemperatureData.currentTemp || this.rawTemperatureData.currentTemp === 0) {
      this.temperature = this.settingsService.formatTemperature(this.rawTemperatureData.currentTemp, unit);
      this.feelsLikeTemperature = this.settingsService.formatTemperature(this.rawTemperatureData.feelsLike, unit);
      this.feelsLikeDescription = await this.getFeelsLikeDescription(this.rawTemperatureData.currentTemp, this.rawTemperatureData.feelsLike);
      this.dewPoint = `The dew point is ${this.settingsService.formatTemperature(this.rawTemperatureData.dewPointTemp, unit)} right now.`;
    }

    if (this.rawTemperatureData.hourlyForecast.length > 0) {
      this.hourlyForecast = this.rawTemperatureData.hourlyForecast.map(hour => ({
        time: hour.time,
        temp: this.settingsService.formatTemperature(hour.temp, unit),
        condition: hour.condition,
        hour: hour.hour,
        icon: hour.icon
      }));
    }

    if (this.rawTemperatureData.weeklyForecast.length > 0) {
      this.weeklyForecast = this.rawTemperatureData.weeklyForecast.map(item => ({
        day: item.day,
        temp: this.settingsService.formatTemperature(item.temp, unit),
        icon: item.icon
      }));
    }

    if (this.rawHighLow) {
      this.highTemperature = this.settingsService.formatTemperature(this.rawHighLow.high, unit);
      this.lowTemperature = this.settingsService.formatTemperature(this.rawHighLow.low, unit);
    }

    await this.saveToStorage();
  }

  getCityName(latitude: number, longitude: number) {
    if (this.locationCity) return;
    this.weatherService.getCityName(latitude, longitude).subscribe(
      (data) => {
        this.locationCity = data.address.city || data.address.town || data.address.village || 'Unknown';
      },
      (error) => {
        alert('Location unavailable'+error);
      }
    );
  }

  async getTemperature(latitude: number, longitude: number) {
    this.weatherService.getWeatherData(latitude, longitude).subscribe(
      async (data) => {
        const tempValue = Math.round(data.main.temp);
        const feelsLike = Math.round(data.main.feels_like);
        const humidity = data.main.humidity;
        const dewPointTemp = await this.calculateDewPoint(data.main.temp, humidity);
        this.sunrise = data.sunrise;
        this.sunset = data.sunset;

        this.rawTemperatureData.currentTemp = tempValue;
        this.rawTemperatureData.feelsLike = feelsLike;
        this.rawTemperatureData.dewPointTemp = dewPointTemp;

        this.temperature = this.settingsService.formatTemperature(tempValue, this.temperatureUnit);
        this.weatherCondition = data.weather[0].description;
        this.feelsLikeTemperature = this.settingsService.formatTemperature(feelsLike, this.temperatureUnit);
        this.feelsLikeDescription = await this.getFeelsLikeDescription(tempValue, feelsLike);
        this.humidity = `${humidity}%`;
        this.dewPoint = `The dew point is ${this.settingsService.formatTemperature(dewPointTemp, this.temperatureUnit)} right now.`;

        await this.saveToStorage();

      },async () => { //a fallback if user went offline
        await this.loadStoredData();
      }
    );
  }

  async getHourlyWeather(latitude: number, longitude: number) {
    this.weatherService.getHourlyWeather(latitude, longitude).subscribe(
      async (data) => {
        this.rawTemperatureData.hourlyForecast = data.list.slice(0, 24).map((hourData: any) => {
          const date = new Date(hourData.dt * 1000);
          const hour = date.getHours();
          const condition = hourData.weather[0].main;
          const iconUrl = this.getWeatherIcon(condition, hour);

          return {
            time: date.toLocaleTimeString([], { hour: 'numeric', hour12: true }),
            hour: hour,
            temp: hourData.main.temp,
            condition: condition,
            icon: iconUrl,
          };
        });

        this.hourlyForecast = this.rawTemperatureData.hourlyForecast.map(hour => ({
          time: hour.time,
          hour: hour.hour,
          temp: this.settingsService.formatTemperature(hour.temp, this.temperatureUnit),
          condition: hour.condition,
          icon: hour.icon
        }));

        await this.storage.set('hourlyForecast', this.hourlyForecast);
      },
      async () => {
        await this.loadStoredData();
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

        this.rawTemperatureData.weeklyForecast = Object.keys(dailyData).slice(0, 7).map((day) => {
          const dayEntries = dailyData[day];
          const maxTemp = Math.max(...dayEntries.map((entry) => entry.main.temp));
          const condition = dayEntries[0].weather[0].main;
          const icon = this.getWeatherIcon(condition, 12);
          return { day, icon, temp: maxTemp };
        });


        this.weeklyForecast = this.rawTemperatureData.weeklyForecast.map(day => ({
          day: day.day,
          icon: day.icon,
          temp: this.settingsService.formatTemperature(day.temp, this.temperatureUnit)
        }));
        await this.storage.set('weeklyForecast', this.weeklyForecast);
      },
      async () => {
        await this.loadStoredData();
      }
    );
  }

  async getVisibilityData(latitude: number, longitude: number) {
    this.weatherService.getVisibilityData(latitude, longitude).subscribe(
      async (data) => {
        const visibilityMeters = data.visibility;
        let visibilityKm: string;

        if (visibilityMeters >= 10000) {
          visibilityKm = '>10 km';
        } else {
          visibilityKm = `${Math.round(visibilityMeters / 1000)} km`;
        }

        this.visibility = visibilityKm;
        this.visibilityDescription = this.getVisibilityDescription(Math.round(visibilityMeters / 1000));

        await this.storage.set('visibility', this.visibility);
        await this.storage.set('visibilityDescription', this.visibilityDescription);
      },
      async () => {
        await this.loadStoredData();
      }
    );
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
    return temp !== undefined ? this.settingsService.formatTemperature(temp, this.temperatureUnit) : 'N/A';
  }

  getWeatherIcon(condition: string, hour: number): string {
    let iconCode = '01';
    const isDayTime = hour >= 6 && hour < 18;

    switch (condition.toLowerCase()) {
      case 'clear':
        iconCode = isDayTime ? '01d' : '01n';
        break;
      case 'few clouds':
        iconCode = isDayTime ? '02d' : '02n';
        break;
      case 'scattered clouds':
        iconCode = isDayTime ? '03d' : '03n';
        break;
      case 'broken clouds':
      case 'overcast clouds':
        iconCode = isDayTime ? '04d' : '04n';
        break;
      case 'shower rain':
      case 'light rain':
        iconCode = isDayTime ? '09d' : '09n';
        break;
      case 'rain':
        iconCode = isDayTime ? '10d' : '10n';
        break;
      case 'thunderstorm':
        iconCode = isDayTime ? '11d' : '11n';
        break;
      case 'snow':
        iconCode = isDayTime ? '13d' : '13n';
        break;
      case 'mist':
      case 'fog':
        iconCode = isDayTime ? '50d' : '50n';
        break;
      default:
        iconCode = isDayTime ? '01d' : '01n';
    }
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
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

  getVisibilityDescription(visibilityKm: number): string {
    if (visibilityKm >= 10) return 'Perfectly clear view';
    if (visibilityKm >= 5) return 'Good visibility';
    if (visibilityKm >= 2) return 'Moderate visibility';
    if (visibilityKm >= 1) return 'Poor visibility';
    return 'Very poor visibility';
  }
}
