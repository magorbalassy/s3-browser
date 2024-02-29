import { Component } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar'; // Import MatToolbarModule from the appropriate package
import { MatFormFieldModule } from '@angular/material/form-field'; // Import MatFormFieldModule from the appropriate package
import {MatSelectModule} from '@angular/material/select';

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

}
