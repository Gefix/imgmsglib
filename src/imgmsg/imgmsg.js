// Copyright (c) 2020 Dimitar Blagoev (Gef[r]ix)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const ImgMsgCodec = require('./imgmsg_codec')

var ImgMsg = function (webgl, canvas, optECC = true, optGN = false, hashCycles = 256) {
    const maxDim = 1024;

    const context = canvas.getContext('2d');
    const gl = webgl.getContext("webgl", {
        preserveDrawingBuffer: true,
        premultipliedAlpha: false,
        alpha: true,
        antialias: false,
        depth: false
    });

    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    function numberWithCommas(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    async function drawImageOnCanvas(img, scale = 1) {
        let width = img.naturalWidth * scale;
        let height = img.naturalHeight * scale;

        if (width > height) {
            if (width > maxDim) {
                height = (height * maxDim / width) | 0;
                width = maxDim;
            }
        } else {
            if (height > maxDim) {
                width = (width * maxDim / height) | 0;
                height = maxDim;
            }
        }

        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);

        try {
            if (width == img.naturalWidth && height == img.naturalHeight) {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                const data = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);

                const imgdata = new ImageData(width, height);
                imgdata.data.set(new Uint8ClampedArray(data));

                context.putImageData(imgdata, 0, 0);
            } else {
                const bitmap = await createImageBitmap(img, 0, 0, img.naturalWidth, img.naturalHeight,
                    {
                        premultiplyAlpha: 'none',
                        colorSpaceConversion: 'none',
                        resizeQuality: 'pixelated'
                    });
                context.drawImage(bitmap, 0, 0, width, height);
            }
        } catch {
            context.drawImage(img, 0, 0, width, height);
        }
    }

    const codec = ImgMsgCodec(hashCycles);

    const ImgMsg = {
        copyToClipboard: async function () {
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'clipboard-write' });
                if (permissionStatus.state === 'granted') {
                    canvas.toBlob(async function (blob) {
                        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                    }, 'image/png');
                }
            } catch {
                try {
                    await navigator.clipboard.writeText(canvas.toDataURL('image/png', 1));
                } catch { }
            }
        },

        clearCanvas: function () {
            context.clearRect(0, 0, context.canvas.width, context.canvas.height);
        },

        drawImageOnCanvas: drawImageOnCanvas,

        browseImage: function (e) {
            let reader = new FileReader();

            reader.onload = function (event) {
                let img = new Image();

                img.onload = async function () {
                    await drawImageOnCanvas(img);
                }
                img.src = event.target.result;
            }
            reader.readAsDataURL(e.target.files[0]);
            e.target.value = null;
        },

        compressAndEncrypt: async function (message, key) {
            return codec.compressAndEncrypt(message, key);
        },
        decryptAndUncompress: async function (message, key) {
            return codec.decryptAndUncompress(message, key);
        },

        encode: async function (message, key) {
            const width = canvas.width;
            const height = canvas.height;

            let logo = context.getImageData(0, 0, width, height);
            let img = new ImageData(width, height);
            img.data.set(new Uint8ClampedArray(logo.data));

            try {
                const type = (optECC ? '1' : '0') + (optGN ? '3' : '2');
                await codec.encode(img, message, key, type);
                context.putImageData(img, 0, 0);
            } catch (err) {
                if (err.code == 1) {
                    err.message = `Encoded message of ${numberWithCommas(err.data.encodedSize)} bytes is too large.\nThe current image size is ${img.width} x ${img.height} pixels and can store ${numberWithCommas(err.data.availableSize)} bytes in the selected code type.\nTransparent pixels cannot store hidden data.\nMaximum supported image size is ${maxDim} x ${maxDim} pixels.`;
                    throw err;
                } else {
                    throw ('Could not encode message: ' + err.toString());
                }
            }

            return canvas;
        },

        decode: async function (key) {
            let message = "";

            const width = canvas.width;
            const height = canvas.height;

            let logo = context.getImageData(0, 0, width, height);
            let img = new ImageData(width, height);
            img.data.set(new Uint8ClampedArray(logo.data));

            try {
                const [msg, opts] = await codec.decode(img, key)
                message = msg;
            } catch (err) {
                throw ("Incorrect key or image.");
            }

            return message;
        }
    }

    return ImgMsg;
}

module.exports = ImgMsg;