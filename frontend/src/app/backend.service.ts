import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Object } from './models';

export interface Reply {
  status: string;
  message: string[];
}

export interface Session {
  status: string;
  bucket: string;
  buckets: string[];
}

@Injectable({
  providedIn: 'root'
})
export class BackendService {

  private url = 'http://localhost:5001/';

  constructor(private http: HttpClient) { }

  setBucket(bucket: string): Observable<Reply> {
    return this.http.post<Reply>(this.url + 'bucket',
      {'bucket': bucket},
      {withCredentials: true});
  }

  getObjects(prefix: string=''): Observable<Object[]> {
    let params = new HttpParams()
      .set('prefix', prefix);
    return this.http.get<Object[]>(this.url + 'objects', 
                      {params:params, withCredentials: true}); 
  }

  getSession(): Observable<Session> {
    console.log('getSession');
    return this.http.get<Session>(this.url, {withCredentials: true});
  }

  connect(endpoint: string, key: string, secret: string): Observable<Reply> {
    const headers = { 'content-type': 'application/json'};
    console.log('connect', {"endpoint" : endpoint, "key":key, "secret":secret});
    return this.http.post<Reply>(this.url,
      {"endpoint" : endpoint, "key":key, "secret":secret},
      {withCredentials: true, headers: headers});
  }

}
