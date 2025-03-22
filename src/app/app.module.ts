import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { IonicStorageModule } from '@ionic/storage-angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { WeatherService } from './services/weather.service';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    IonicStorageModule.forRoot(), // Initializes storage
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy }, WeatherService // Correct reuse strategy for Ionic
  ],
  bootstrap: [AppComponent], // Bootstraps the main app component
})
export class AppModule {}
