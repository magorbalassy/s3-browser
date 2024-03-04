import { AppService } from '../app.service';
import { Component } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar'; // Import MatToolbarModule from the appropriate package
import { MatFormFieldModule } from '@angular/material/form-field'; // Import MatFormFieldModule from the appropriate package
import { MatSelectModule } from '@angular/material/select';

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

  constructor(private appService: AppService) {
    this.appService.getBuckets.subscribe(buckets => {
      this.buckets = buckets;
      if (this.buckets.length === 1) {
        console.log('Setting selected bucket to', this.buckets[0]);
        this.selectedBucket = this.buckets[0];
      }
    });
    this.appService.setBucket(this.selectedBucket);
  }

  onBucketChange(event: any) {
    console.log('onBucketChange', event);
    this.appService.setBucket(event.value);
  }
}
