import { Component, OnInit, OnDestroy } from '@angular/core';
import { BackendService } from '../backend.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field'; // Import MatFormFieldModule from the appropriate package
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { CredentialsDialogComponent, DialogData } from '../credentials-dialog/credentials-dialog.component';
import { AppService } from '../app.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-body',
  standalone: true,
  imports: [FormsModule, MatButtonModule, 
    MatCardModule, MatFormFieldModule, MatInputModule,
    CredentialsDialogComponent ],
  templateUrl: './body.component.html',
  styleUrl: './body.component.css'
})
export class BodyComponent implements OnInit{
  title = 'S3 Browser';
  buckets : string[] = [];
  endpoint : string='http://192.168.10.5:9000';
  bucket : string='';
  access_key : string='rTtWbGeGvCWI0j6fACjE';
  secret_key : string='NI9XvLcC08RWJWMIUOyMlgB3FTELbKJktie3HdpC';
  subscription: Subscription;
  objects = [];

  constructor(private appService: AppService,
    private backendService: BackendService, 
    private snackBar: MatSnackBar,
    public dialog: MatDialog) 
  { 
    this.subscription = appService.getBucket.subscribe(bucket => {
      this.bucket = bucket;
      backendService.getObjects(this.bucket, '')
        .subscribe( data  => {
          console.log('data:', data);
        });
    });
  }
  
  connect() {
    let errors : object = {
      'ClientError': 'Client access error for ',
      'AccessError': 'Invalid access or secret key for ',
      'EndpointConnectionError': 'Failed to connect to ',
      'EndpointResolutionError': 'Failed to resolve endpoint for ',
      'BucketError': 'Bucket name should not be specified in the URI for ',
      'UnknownError': 'Unknown error occurred when trying to connect to '
    }
    console.log('connect', this.endpoint, this.bucket, this.access_key, this.secret_key);
    var open_snack = this.openSnackBar('Connecting to ' + this.endpoint,'Close','green-snackbar');
    this.backendService.connect(this.endpoint,this.access_key,this.secret_key)
    .subscribe( data  => {
      console.log('data:', data)
      if (data.status == 'Error') {
        if (errors.hasOwnProperty(data.message[0] as keyof typeof errors)) {
          setTimeout(() => {
            open_snack.dismiss();
            this.openSnackBar(errors[data.message[0] as keyof typeof errors] + this.endpoint,'Close','red-snackbar');
            this.openDialog();
          }, 200);
        }
        else {
          open_snack.dismiss();
          this.openSnackBar('Failed to connect to ' + this.endpoint,'Close','red-snackbar');
          this.openDialog();
        }
      }
      else if (data.status == 'Ok') {
        open_snack.dismiss();
        this.openSnackBar('Connected to ' + this.endpoint,'Close','green-snackbar');
        this.buckets = data.message;
        if (this.buckets.length === 1) {
          this.bucket = this.buckets[0];
        }
        this.appService.getBucket.subscribe(bucket => {
          this.bucket = bucket;
        });
        this.appService.setBuckets(this.buckets);
      }
    });
  }

  openDialog(): void {
    if (this.buckets.length === 0) {
      const dialogRef = this.dialog.open(CredentialsDialogComponent, {
        width: '30%',
        data: {endpoint: this.endpoint, access_key: this.access_key, secret_key: this.secret_key}
      });

      dialogRef.afterClosed().subscribe((result: DialogData) => {
        if (result === undefined) {
          console.log('The dialog was closed');
          this.openDialog();
        }
        else if (result.endpoint === '' || result.access_key === '' || result.secret_key === '') {
          this.openSnackBar('Endpoint, Access Key and Secret Key are required','Close','red-snackbar');
          this.openDialog();
        }
        else {
          this.endpoint = result.endpoint;
          this.access_key = result.access_key;
          this.secret_key = result.secret_key;
          this.connect();
        }
      });
    }
  }

  openSnackBar(message: string, action: string, className: string) {
    return this.snackBar.open(message, action, {
     duration: 10000,
     verticalPosition: 'bottom',
     horizontalPosition: 'start',
     panelClass: [className],
     });
  }
  
  ngOnInit(): void {
    this.backendService.getBuckets()
    .subscribe( data  => {
      console.log('data:', data)
      if (data.status == 'Error') {
        this.openDialog();
      }
      else {
        this.buckets = data.message;
        this.appService.setBuckets(this.buckets);
      }
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

}
