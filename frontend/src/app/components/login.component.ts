import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticationService } from '../authentication.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {

  loginForm: FormGroup;

	errorMessage = ''

	constructor(
    private fb: FormBuilder,
    private loginServ: AuthenticationService,
    private router: Router
  ) {}

	ngOnInit(): void { 
    this.loginForm = this.fb.group({
      username: this.fb.control('', [ Validators.required ]),
      password: this.fb.control('', [ Validators.required ])
    });
  }

  async onLogin() {
    const username = this.loginForm.get('username').value;
    const password = this.loginForm.get('password').value;

    const statusCode = await this.loginServ.authenticateUser({ username, password });

    if(statusCode === 200) {
      this.loginServ.setUsername(username);
      this.loginServ.setPassword(password);
      this.router.navigate(['/main']);
    } else {
      this.errorMessage = 'Authentication failed. Please make sure the username and password are correct.';
    }
  }
}
