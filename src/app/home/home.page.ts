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
    } catch (error) {
      alert('Error getting location: ' + error);
      this.locationCity = 'Location unavailable';
      this.temperature = 'N/A';
      this.weatherCondition = 'N/A';
      this.highPressure = 'N/A';
      this.lowPressure = 'N/A';
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
        this.temperature = `${Math.round(data.main.temp)}°`;
        this.weatherCondition = data.weather[0].description;

        const currentPressure = data.main.pressure;
        const referencePressure = 1013;
        const temperatureDifference = (currentPressure - referencePressure) * 0.12;

        this.highPressure = `${Math.round(data.main.temp + temperatureDifference)}°`;
        this.lowPressure = `${Math.round(data.main.temp - temperatureDifference)}°`;
      },
      (error) => {
        alert('Error fetching weather: ' + error);
        this.temperature = 'N/A';
        this.weatherCondition = 'N/A';
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
        const dailyData: { [key: string]: any[] } = {};

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
}
