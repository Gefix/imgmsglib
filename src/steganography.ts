import * as ImgMsg from './imgmsg/imgmsg';

export class ImgMsgCodec {
	webgl: HTMLCanvasElement;
	canvas: HTMLCanvasElement;
	image: HTMLImageElement;
	template: HTMLImageElement;

	imgMsg: {
		copyToClipboard: () => Promise<void>;
		drawImageOnCanvas: (img: any) => Promise<void>;
		browseImage: (e: any) => void;
		encode: (message: any, key: any) => Promise<HTMLCanvasElement>;
		decode: (key: any) => Promise<string>;
	};

	constructor(template: HTMLImageElement) {
		this.template = template;

		this.webgl = document.createElement('canvas');
		this.webgl.width = 256;
		this.webgl.height = 256;

		this.canvas = document.createElement('canvas');
		this.canvas.width = 256;
		this.canvas.height = 256;

		this.image = document.createElement('img');
		this.image.style.visibility = 'hidden';

		this.imgMsg = ImgMsg(this.webgl, this.canvas, this.image);
	}

	async encode(message: string, key: string): Promise<HTMLCanvasElement> {
		await this.imgMsg.drawImageOnCanvas(this.template);
		return await this.imgMsg.encode(message, key);
		// await this.imgMsg.copyToClipboard();
	}

	async decode(file: File | Blob | string, key: string): Promise<string> {
		await this.loadImageFile(file);
		const message = await this.imgMsg.decode(key);

		return Promise.resolve(message);
	}

	private loadImageFile(image: File | Blob | string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (typeof image === 'string') {
				const img = new Image();
				img.crossOrigin = 'anonymous';
				img.onerror = () => {
					throw ('could not load image');
				};
				img.onload = async () => {
					await this.imgMsg.drawImageOnCanvas(img);
					resolve();
				}
				img.src = image;
			} else {
				const reader = new FileReader();
				reader.onload = (event) => {
					const img = new Image();

					img.style.background = 'none!important';

					img.onload = async () => {
						await this.imgMsg.drawImageOnCanvas(img);
						resolve();
					};

					img.src = `${event.target.result}`;
				};
				reader.readAsDataURL(image);
			}
		});
	};
}

