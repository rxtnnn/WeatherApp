import { Component, OnInit } from '@angular/core';
import { WeatherService } from '../services/weather.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  weatherData: any;

  constructor(private weatherService: WeatherService) {}

  ngOnInit() {
    // Fetch weather data for a specific city (e.g., London)
    this.getWeather('Cebu City');
  }

  getWeather(city: string) {
    this.weatherService.getWeatherByCity(city).subscribe(
      (data) => {
        this.weatherData = data;
        console.log(this.weatherData); // You can remove this line, just to see the data structure
      },
      (error) => {
        console.error(error);
      }
    );
  }
}
