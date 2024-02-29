import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CredentialsDialogComponent } from './credentials-dialog.component';

describe('CredentialsDialogComponent', () => {
  let component: CredentialsDialogComponent;
  let fixture: ComponentFixture<CredentialsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CredentialsDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CredentialsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
