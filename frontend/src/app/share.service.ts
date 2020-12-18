import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

@Injectable()
export class ShareService {

    constructor(
        private http: HttpClient
    ) {}
    
    async shareArticle(formData: FormData): Promise<any> {
        try {
            return await this.http.post('/share', formData).toPromise();
        } catch(error) {
            return error;
        }
    }

}