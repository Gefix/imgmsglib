import * as base64 from 'base64-arraybuffer';

import * as ImgMsg from './imgmsg/imgmsg';

type Caption = {
	text: string,
	x: number,
	y: number,
	font?: string,
	style?: string,
	align?: "left" | "right" | "center" | "start" | "end",
	baseline?: "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom"
}

type OnDrawCallback = (canvasContext: CanvasRenderingContext2D, webglContext: WebGLRenderingContext) => Promise<void>;

export class ImgMsgCodec {
	webgl: HTMLCanvasElement;
	canvas: HTMLCanvasElement;
	template: HTMLImageElement;
	maxScale: number;

	imgMsg: {
		copyToClipboard: () => Promise<void>;
		clearCanvas: () => void;
		drawImageOnCanvas: (img: any, scale?: number, captions?: Caption[], onDraw?: OnDrawCallback) => Promise<void>;
		browseImage: (e: any) => void;
		compressAndEncrypt: (msg: string, pwd: string) => Promise<Uint8Array>;
		decryptAndUncompress: (msg: Uint8Array, pwd: string) => Promise<string>;
		encode: (message: any, key: any) => Promise<HTMLCanvasElement>;
		decode: (key: any) => Promise<string>;
	};

	constructor(template: HTMLImageElement, maxScale: number = 16, ecc = true, gaussian = false, difficulty = 256) {
		this.template = template;
		this.maxScale = maxScale;

		this.webgl = document.createElement('canvas');
		this.webgl.width = 256;
		this.webgl.height = 256;

		this.canvas = document.createElement('canvas');
		this.canvas.width = 256;
		this.canvas.height = 256;

		this.imgMsg = ImgMsg(this.webgl, this.canvas, ecc, gaussian, difficulty);
	}

	async encode(message: string, key: string, captions?: Caption[], onDraw?: OnDrawCallback): Promise<HTMLCanvasElement | string> {
		let scale = 1;

		const encryptedMessage = await this.imgMsg.compressAndEncrypt(message, key);

		do {
			try {
				await this.imgMsg.drawImageOnCanvas(this.template, scale, captions, onDraw);
				return await this.imgMsg.encode(encryptedMessage, key);
			} catch (err) {
				if (err.code === 1 && this.canvas.width === this.template.width * scale) {
					const encodedSize = err.data.encodedSize;
					const availableSize = err.data.availableSize;

					scale = Math.max(scale + 1, Math.ceil(scale * Math.sqrt(encodedSize / availableSize)));

					if (scale > this.maxScale) {
						break;
					}
				} else {
					break;
				}
			}
		} while (true);

		return base64.encode(encryptedMessage);
	}

	async decode(file: File | Blob | string, key: string): Promise<string> {
		if (typeof file === 'string' && !this.stringIsImage(file)) {
			const buffer = new Uint8Array(base64.decode(file));
			const message = await this.imgMsg.decryptAndUncompress(buffer, key);
			return message;
		} else {
			await this.loadImageFile(file);
			const message = await this.imgMsg.decode(key);
			return message;
		}
	}

	async encodeToClipboard(message: string, key: string, captions?: Caption[], onDraw?: OnDrawCallback) {
		const data = await this.encode(message, key, captions, onDraw);
		if (typeof data === 'string') {
			await navigator.clipboard.writeText(data);
		} else {
			await this.copyToClipboard();
		}

		this.clearCanvas();
	}

	async decodeFromClipboard(key: string, event?: ClipboardEvent): Promise<string> {
		let el: any = event?.clipboardData?.getData('text/plain') || null;

		if (el && !this.stringIsImage(el)) {
			el = null;
		}

		let file: File | Blob = event?.clipboardData?.files[0] || null;

		if (el === null && file === null) {
			const clipboardItems: Array<ClipboardItem> = await (window as any).navigator?.clipboard?.read?.() || [];

			for (const clipboardItem of clipboardItems) {
				for (const type of clipboardItem.types) {
					if (type.startsWith('text/')) {
						el = await (await clipboardItem.getType(type)).text();
					}
					if (type.startsWith('image/')) {
						file = await clipboardItem.getType(type);
						break;
					}
				}
				if (file !== null) {
					break;
				}
			}
		}

		if (file !== null) {
			el = file;
		}

		if (!el) {
			throw ("Could not read clipboard.");
		}

		const message = await this.decode(el, key);

		this.clearCanvas();

		return message;
	}

	async copyToClipboard() {
		await this.imgMsg.copyToClipboard();
	}

	clearCanvas() {
		this.imgMsg.clearCanvas();
	}

	private stringIsImage(str: string) {
		return str.startsWith('data:image/png;base64,') || str.startsWith('data:image/bmp;base64,') || str.startsWith('http://') || str.startsWith('https://');
	}

	private loadImage(src): Promise<void> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.style.background = 'none!important';
			img.crossOrigin = 'anonymous';
			img.onerror = () => {
				reject('Could not load image.');
			};
			img.onload = async () => {
				await this.imgMsg.drawImageOnCanvas(img);
				resolve();
			}
			img.src = src;
		});
	}

	private loadImageFile(image: File | Blob | string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (typeof image === 'string') {
				this.loadImage(image).then(resolve).catch(reject);
			} else {
				const reader = new FileReader();
				reader.onload = (event) => {
					this.loadImage(`${event.target.result}`).then(resolve).catch(reject);
				};
				reader.readAsDataURL(image);
			}
		});
	};
}

