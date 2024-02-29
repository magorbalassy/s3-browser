import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class BackendService {

  private url = 'http://localhost:5001/';

  constructor(private http: HttpClient) { }

  getBuckets(): Observable<string[]> {
    return this.http.get<string[]>(this.url);  
  }

  connect(endpoint: string, key: string, secret: string): Observable<string[]> {
    const headers = { 'content-type': 'application/json'};
    console.log('connect', {"endpoint" : endpoint, "key":key, "secret":secret});
    return this.http.post<string[]>(this.url,
      {"endpoint" : endpoint, "key":key, "secret":secret},
      {headers});
  }
}
