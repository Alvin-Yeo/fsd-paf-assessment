import {Injectable} from "@angular/core";
import {CameraImage} from './models';

@Injectable()
export class CameraService {

	image: CameraImage  = null

	clear() {
		this.image = null
	}

	getImage(): CameraImage {
		return this.image
	}

	hasImage(): boolean {
		return (this.image != null)
	}
}
