import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AppService {
  private buckets = new BehaviorSubject<string[]>([]);
  private bucket = new BehaviorSubject<string>('');
  getBuckets = this.buckets.asObservable();
  getBucket = this.bucket.asObservable();

  constructor() { }
  
  setBuckets(buckets: string[]) {
    this.buckets.next(buckets);
  }

  setBucket(bucket: string) {
    this.bucket.next(bucket);
  }

}
