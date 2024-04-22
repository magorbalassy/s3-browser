import { AppService } from '../app.service';
import { Component, OnDestroy } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar'; // Import MatToolbarModule from the appropriate package
import { MatFormFieldModule } from '@angular/material/form-field'; // Import MatFormFieldModule from the appropriate package
import { MatSelectModule } from '@angular/material/select';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [MatToolbarModule,
            MatFormFieldModule,
            MatSelectModule],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css'
})
export class ToolbarComponent {
  buckets : string[] = [];
  selectedBucket : string = '';
  bucketSubscription: Subscription;
  bucketsSubscription: Subscription;

  constructor(private appService: AppService) {
    this.bucketsSubscription = appService.getBuckets.subscribe(buckets => {
      if (buckets) {
        this.buckets = buckets;
        if (this.buckets.length === 1) {
          console.log('Setting selected bucket to', this.buckets[0]);
          this.selectedBucket = this.buckets[0];
        }
      }
      });
    this.bucketSubscription = appService.getBucket.subscribe(bucket => {
      if (bucket) {
        this.selectedBucket = bucket;
      }
    });  
  }

  onBucketChange(event: any) {
    console.log('onBucketChange', event);
    this.appService.setBucket(event.value);
  }

  ngOnDestroy() {
    this.bucketsSubscription.unsubscribe();
    this.bucketSubscription.unsubscribe();
  }

}
