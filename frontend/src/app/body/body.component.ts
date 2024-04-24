import { AfterViewInit, Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BackendService } from '../backend.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field'; // Import MatFormFieldModule from the appropriate package
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { CredentialsDialogComponent, DialogData } from '../credentials-dialog/credentials-dialog.component';
import { AppService } from '../app.service';
import { Subscription, catchError, of } from 'rxjs';
import { Object } from '../models';

@Component({
  selector: 'app-body',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, 
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatTableModule, MatPaginatorModule, CredentialsDialogComponent ],
  templateUrl: './body.component.html',
  styleUrl: './body.component.css'
})
export class BodyComponent implements OnInit, OnDestroy, AfterViewInit{
  title = 'S3 Browser';
  buckets : string[] = [];
  endpoint : string='http://192.168.10.5:9000';
  bucket : string='';
  access_key : string='rTtWbGeGvCWI0j6fACjE';
  secret_key : string='NI9XvLcC08RWJWMIUOyMlgB3FTELbKJktie3HdpC';
  subscription: Subscription;
  objects : Object[] = [];
  displayedColumns: string[] = ['key', 'size', 'last_modified'];
  dataSource = new MatTableDataSource<Object>(this.objects);
  dataLoaded = false;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(private appService: AppService,
    private backendService: BackendService, 
    private snackBar: MatSnackBar,
    public dialog: MatDialog) 
  { 
    let update = false;
    this.subscription = appService.getBucket.subscribe(bucket => {
      if (bucket) {
        if (this.bucket != bucket){
          this.bucket = bucket;
          update = true;
        };
        console.log('Setting bucket:', this.bucket);
        backendService.setBucket(this.bucket)
          .subscribe( data  => {
            console.log('Setbucket reply from API:', data);
            if (data.status == 'Error') {
              this.openSnackBar('Failed to set bucket ' + this.bucket,'Close','red-snackbar');
            }
            else if (data.status == 'Ok') {
              this.openSnackBar('Set bucket to ' + this.bucket,'Close','green-snackbar');
            }
            if (update) {
              this.getObjects('');
            }
          });
      }
    });

  }
  
  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  connect() {
    let errors : object = {
      'ClientError': 'Client access error for ',
      'AccessError': 'Invalid access or secret key for ',
      "ConnectionError": "Is the port open ? Failed to connect to ",
      'EndpointConnectionError': 'Failed to connect to ',
      'EndpointResolutionError': 'Failed to resolve endpoint for ',
      'BucketError': 'Bucket name should not be specified in the URI for ',
      'UnknownError': 'Unknown error occurred when trying to connect to ',
      'APIError': 'Error connecting to the API to create the connection for '
    }
    console.log('connect', this.endpoint, this.bucket, this.access_key, this.secret_key);
    var open_snack = this.openSnackBar('Connecting to ' + this.endpoint,'Close','green-snackbar');
    this.backendService.connect(this.endpoint,this.access_key,this.secret_key)
    // .pipe(
    //   catchError(error => {
    //     console.log('Caught a non 200 reply: ', error);
    //     return of({'status': 'Error', 'message': ['APIError']}); // Return an Observable with a null value
    //   })
    // )
    .subscribe( data  => { 
      console.log('data:', data)
      if (data.status == 'Error') {
        if (errors.hasOwnProperty(data.message as keyof typeof errors)) {
          setTimeout(() => {
            open_snack.dismiss();
            this.openSnackBar(errors[data.message as keyof typeof errors] + this.endpoint,'Close','red-snackbar');
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

  getObjects(prefix: string='') {
    console.log('getObjects', this.bucket, prefix);
    this.backendService.getObjects(prefix)
    .subscribe( data  => {
      console.log('getObjects reply from API:', data);
      this.objects = data;
      console.log('Objects:', this.objects);
      this.dataSource = new MatTableDataSource<Object>(this.objects);
      this.dataSource.paginator = this.paginator;
      this.dataLoaded = true;
    });
  }

  getSizeOfFolder(prefix: string) {
    console.log('getSizeOfFolder', this.bucket, prefix);
    this.backendService.getSizeOfFolder(prefix)
    .pipe( catchError(error => {
        console.log('No size ? ', error);
        return of(null) // Return an Observable with a null value
    }))
    .subscribe( data  => {
      console.log('getSizeOfFolder reply from API:', data);
      if (data == null) {
        this.openSnackBar('Failed to get size of folder ' + prefix, 'Close', 'red-snackbar');
      }
      else {
        this.openSnackBar('Size of folder ' + prefix + ' is ' + data.size.toString(),  'Close', 'green-snackbar');
        this.objects = this.objects.map(obj => 
          obj.key === prefix
          ? {...obj, size: data.size} 
          : obj
      );
      console.log('Objects after size:', this.objects);
      this.dataSource = new MatTableDataSource<Object>(this.objects);
      }
      //this.openSnackBar('Size of folder ' + prefix + ' is ' + data.size,'Close','green-snackbar');
    });
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
    this.backendService.getSession()
    .pipe( catchError(error => {
        console.log('No session ? ', error);
        this.openDialog();
        return of({'status': 'None', 'bucket': '', 'buckets': []}) // Return an Observable with a null value
    }))    
    .subscribe( data  => {
      console.log('Session reply from API:', data);
      this.openSnackBar('Reconnected to the API','Close','green-snackbar');
      this.buckets = data.buckets;
      this.bucket = data.bucket;
      this.appService.setBuckets(this.buckets);
      this.appService.setBucket(this.bucket);
      if (this.bucket) {
        this.getObjects('');
      }
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

}


