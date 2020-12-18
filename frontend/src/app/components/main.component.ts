import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticationService } from '../authentication.service';
import {CameraService} from '../camera.service';
import { ShareService } from '../share.service';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {

	imagePath = '/assets/cactus.png'

	shareForm: FormGroup;
	hasImage = false;
	username = '';
	password = '';

	constructor(
		private cameraSvc: CameraService,
		private loginServ: AuthenticationService,
		private shareServ: ShareService,
		private fb: FormBuilder,
		private router: Router
	) {}

	ngOnInit(): void {
	  if (this.cameraSvc.hasImage()) {
		  const img = this.cameraSvc.getImage()
		  this.imagePath = img.imageAsDataUrl
	  }

	  this.hasImage = this.cameraSvc.hasImage();

	  this.username = this.loginServ.getUsername();
	  this.password = this.loginServ.getPassword();

	  this.shareForm = this.fb.group({
		  title: this.fb.control('', [ Validators.required ]),
		  comments: this.fb.control('', [ Validators.required ])
	  });
	}

	clear() {
		this.imagePath = '/assets/cactus.png';
		this.cameraSvc.clear();
		this.hasImage = this.cameraSvc.hasImage();

		this.shareForm = this.fb.group({
			title: this.fb.control('', [ Validators.required ]),
			comments: this.fb.control('', [ Validators.required ])
		});
	}

	async onShare() {
		const formData = new FormData();
		formData.set('username', this.username);
		formData.set('password', this.password);
		formData.set('title', this.shareForm.get('title').value);
		formData.set('comments', this.shareForm.get('comments').value);
		formData.set('image', this.cameraSvc.getImage().imageData);
		
		const response = await this.shareServ.shareArticle(formData);

		if(response.status === 200) {
			console.info(`[INFO] Article is shared successfully.`);
			console.info(`[INFO] Inserted id: ${response['insertedId']}`);
			this.clear();
		} else if(response.status  === 401) {
			console.error(`[ERROR]: Not authorized. Redirecting to login page...`);
			this.clear();
			this.router.navigate(['/']);
		} else {
			console.error(`[ERROR]: Failed to share articles.`);
			console.error(`[ERROR]: `, response);
		}
	}
}
