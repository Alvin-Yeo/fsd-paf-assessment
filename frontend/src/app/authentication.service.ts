import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

@Injectable()
export class AuthenticationService {

    constructor(
        private http: HttpClient
    ) {}
    
    async authenticateUser(body: {}): Promise<number> {
        let statusCode = 0;

        try {
            const response = await this.http.post('/authenticate', body).toPromise();
            statusCode = response['status'];
        } catch(error) {
            statusCode = error.status;
        }

        return statusCode;
    }
}