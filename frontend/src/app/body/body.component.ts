import { Component, OnInit } from '@angular/core';
import { BackendService } from '../backend.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field'; // Import MatFormFieldModule from the appropriate package
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { CredentialsDialogComponent, DialogData } from '../credentials-dialog/credentials-dialog.component';

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
  endpoint : string='';
  bucket : string='';
  access_key : string='';
  secret_key : string='';

  constructor(private backendService: BackendService, 
    private snackBar: MatSnackBar,
    public dialog: MatDialog) {  }
  
  connect() {
    let errors = {
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
      if (errors.hasOwnProperty(data[0])) {
        setTimeout(() => {
          open_snack.dismiss();
          this.openSnackBar(errors[data[0] as keyof typeof errors] + this.endpoint,'Close','red-snackbar');
          this.openDialog();
        }, 200);
      }

      else {
        open_snack.dismiss();
        this.openSnackBar('Failed to connect to ' + this.endpoint,'Close','red-snackbar');
      }
    });
  }

  openDialog(): void {
    if (this.buckets.length === 0) {
      const dialogRef = this.dialog.open(CredentialsDialogComponent, {
        width: '450px',
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
      if (data.length == 0) {
        this.openDialog();
      }
      else {
        this.buckets = data;
      }
    });
  }

}
