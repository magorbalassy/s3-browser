import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Reply {
  status: string;
  message: string[];
}

@Injectable({
  providedIn: 'root'
})
export class BackendService {

  private url = 'http://localhost:5001/';

  constructor(private http: HttpClient) { }

  getBuckets(): Observable<Reply> {
    return this.http.get<Reply>(this.url);  
  }

  getObject(bucket: string, key: string=''): Observable<Reply> {
    return this.http.get<Reply>(this.url + bucket + '/' + key);
  }

  connect(endpoint: string, key: string, secret: string): Observable<Reply> {
    const headers = { 'content-type': 'application/json'};
    console.log('connect', {"endpoint" : endpoint, "key":key, "secret":secret});
    return this.http.post<Reply>(this.url,
      {"endpoint" : endpoint, "key":key, "secret":secret},
      {headers});
  }
}
