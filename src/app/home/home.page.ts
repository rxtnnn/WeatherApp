import { Component, OnInit } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
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
  precipitationLast3h: string = '';
  precipitationNext24h: string = '';
  hourlyForecast: { time: string; temp: string; condition: string }[] = [];
  weeklyForecast: { day: string; icon: string; temp: string }[] = [];

  private apiKey = environment.weatherApiKey;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.currentDate = new Date().toLocaleDateString('en-US', {
      month: 'short', //displays in 3-letter abbr
      day: 'numeric' //displays as number
    });
    this.getCurrentLocation();
  }

  async getCurrentLocation() {
    try {
      const coordinates = await Geolocation.getCurrentPosition();
      const { latitude, longitude } = coordinates.coords;
      console.log('Longitude: ', longitude);
      console.log('Latitude: ', latitude);
      this.getCityName(latitude, longitude);
      this.getWeatherData(latitude, longitude);
      this.getHourlyWeather(latitude, longitude);
      this.getWeeklyWeather(latitude, longitude);
      this.getPrecipitationData(latitude, longitude);
    } catch (error) {
      alert('Error getting location: ' + error);
      this.locationCity = 'Location unavailable';
      this.temperature = 'N/A';
      this.weatherCondition = 'N/A';
      this.highPressure = 'N/A';
      this.lowPressure = 'N/A';
      this.feelsLikeTemperature = 'N/A';
      this.feelsLikeDescription = 'N/A';
    }
  }

  getCityName(latitude: number, longitude: number) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`;

    this.http.get<any>(url).subscribe(
      (data) => {
        this.locationCity = data.address.city || data.address.town || data.address.village || 'Unknown';
      },
      (error) => {
        alert('Error fetching city name: ' + error);
        this.locationCity = 'Location unavailable';
      }
    );
  }

  getWeatherData(latitude: number, longitude: number) {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;

    this.http.get<any>(url).subscribe(
      (data) => {
        this.temperature = `${Math.trunc(data.main.temp)}°`;
        this.weatherCondition = data.weather[0].description;

        // Feels like temperature
        const feelsLike = Math.trunc(data.main.feels_like);
        this.feelsLikeTemperature = `${feelsLike}°`;
        this.feelsLikeDescription = this.getFeelsLikeDescription(data.main.temp, feelsLike);

        // Humidity and dew point
        const humidity = data.main.humidity;
        this.humidity = `${humidity}%`;
        this.dewPoint = `The dew point is ${this.calculateDewPoint(data.main.temp, humidity)}° right now.`;

        const currentPressure = data.main.pressure;
        const referencePressure = 1013;
        const temperatureDifference = (currentPressure - referencePressure) * 0.12;

        this.highPressure = `${Math.trunc(data.main.temp + temperatureDifference)}°`;
        this.lowPressure = `${Math.trunc(data.main.temp - temperatureDifference)}°`;
      },
      (error) => {
        alert('Error fetching weather: ' + error);
        this.temperature = 'N/A';
        this.weatherCondition = 'N/A';
        this.feelsLikeTemperature = 'N/A';
        this.feelsLikeDescription = 'N/A';
        this.humidity = 'N/A';
        this.dewPoint = 'N/A';
        this.highPressure = 'N/A';
        this.lowPressure = 'N/A';
      }
    );
  }


  getHourlyWeather(latitude: number, longitude: number) {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;

    this.http.get<any>(url).subscribe(
      (data) => {
        this.hourlyForecast = data.list.slice(0, 24).map((hour: any) => ({
          time: new Date(hour.dt * 1000).toLocaleTimeString([], { hour: 'numeric', hour12: true }),
          temp: `${Math.round(hour.main.temp)}°`,
          condition: hour.weather[0].main,
          precipitation: Math.round(hour.pop * 100),
        }));
      },
      () => alert('Error fetching hourly weather')
    );
  }

  getWeeklyWeather(latitude: number, longitude: number) {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;

    this.http.get<any>(url).subscribe(
      (data) => {
        const dailyData: { [key: string]: any[] } = {}; //object to store weather per day

        // Group data by day
        data.list.forEach((entry: any) => {
          const date = new Date(entry.dt * 1000).toLocaleDateString('en-US', { weekday: 'short' });
          if (!dailyData[date]) dailyData[date] = [];
          dailyData[date].push(entry);
        });

        // Extract high temp & main condition for each day
        this.weeklyForecast = Object.keys(dailyData).slice(0, 5).map((day) => {
          const dayEntries = dailyData[day];
          const maxTemp = Math.max(...dayEntries.map((entry) => entry.main.temp));
          const condition = dayEntries[0].weather[0].main;
          return { day, icon: this.getWeatherIcon(condition), temp: `${Math.round(maxTemp)}°` };
        });
      },
      () => alert('Error fetching weekly weather')
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
    console.log(difference)
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
    return Math.trunc((b * alpha) / (a - alpha)); // Truncate to remove decimals
  }

  getPrecipitationData(latitude: number, longitude: number) {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&appid=${this.apiKey}`;

    this.http.get<any>(url).subscribe(
      (data) => {
        let last3hPrecip = 0;
        let totalRainNext24h = 0;

        const now = Date.now(); // Get current timestamp in milliseconds

        data.list.forEach((hour: any) => {
          const forecastTime = hour.dt * 1000; // Convert forecast time to milliseconds

          // Check if rain data exists
          if (hour.rain && hour.rain['3h']) {
            if (forecastTime >= now - 3 * 3600000 && forecastTime < now) {
              last3hPrecip = hour.rain['3h']; // Get last 3h rainfall (latest available)
            }
            if (forecastTime > now && forecastTime <= now + 24 * 3600000) {
              totalRainNext24h += hour.rain['3h']; // Sum next 24h rainfall
            }
          }
        });

        // Display correct values
        this.precipitationLast3h = last3hPrecip > 0 ? `${last3hPrecip.toFixed(1)}mm in last 3h` : "No rainfall in last 3h";
        this.precipitationNext24h = totalRainNext24h > 0 ? `${totalRainNext24h.toFixed(1)}mm expected in the next 24hrs` : "No rainfall expected in next 24hrs";
      },
      (error) => {
        alert('Error fetching precipitation data: ' + error);
        this.precipitationLast3h = 'N/A';
        this.precipitationNext24h = 'N/A';
      }
    );
  }



}
