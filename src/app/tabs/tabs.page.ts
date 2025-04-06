import { Component, OnInit, OnDestroy } from '@angular/core';
import { Platform } from '@ionic/angular';
import { App } from '@capacitor/app';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false
})
export class TabsPage implements OnInit, OnDestroy {
  private backPressedOnce = false;

  constructor(private platform: Platform, private router: Router) {}

  ngOnInit() {
    // Listen to the back button press event
    this.platform.ready().then(() => {
      this.platform.backButton.subscribeWithPriority(10, () => {
        if (this.router.url === '/tabs/home') {
          if (this.backPressedOnce) {
            App.exitApp();
          } else {
            this.backPressedOnce = true;
            alert('Press back again to exit the app');
            setTimeout(() => {
              this.backPressedOnce = false;
            }, 2000);
          }
        } else {
          this.router.navigate(['/tabs/home']);
        }
      });
    });
  }

  ngOnDestroy() {
    this.platform.backButton.unsubscribe();
  }
}
