import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field'; // Import MatFormFieldModule from the appropriate package
import {
  MatDialog,
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';

export interface DialogData {
  endpoint: string;
  access_key: string;
  secret_key: string;
}

@Component({
  selector: 'app-credentials-dialog',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, 
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatInputModule],
  templateUrl: './credentials-dialog.component.html',
  styleUrl: './credentials-dialog.component.css'
})

export class CredentialsDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<CredentialsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData) {}

  onNoClick(): void {
    this.dialogRef.close();
  }

}