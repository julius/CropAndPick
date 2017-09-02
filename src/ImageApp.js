const fs = require("fs");
const path = require("path");
const remote = require('electron').remote;
const {dialog} = require('electron').remote;
const {Menu, MenuItem} = require('electron').remote;
const {clipboard} = require('electron')
const {nativeImage} = require('electron')

const MODE_CROP = 0;
const MODE_COLOR_PICK = 1;

class ImageApp {
    constructor() {
        this.elemMain = $(".main");
        this.elemPickedColor = $(".pickedColor");
        this.elemColorPickerModal = $(".colorPickerModal");

        this.setupColorPicker();
        this.setupMenu();
        this.registerKeyboardAndMouseEvents();
        this.setupDragDropHandler();
        this.openImageFromClipboardOnStartup();
        this.setMode(MODE_CROP)
    }

    setMode(mode) {
        this.mode = mode;
        if (mode == MODE_COLOR_PICK) {
            if (this.cropper) {
                this.cropper.clear();
                this.cropper.setDragMode("none");
            }
            this.elemPickedColor.show();
        }
        if (mode == MODE_CROP) {
            if (this.cropper) {
                this.cropper.clear();
                this.cropper.setDragMode("crop");
            }
            this.elemColorPickerModal.modal("hide");
            this.elemPickedColor.hide();
        }
    }

    registerKeyboardAndMouseEvents() {
        $(document).keydown((ev) => {
            ev.ctrlKey && ev.key.toLowerCase() === 'c' && this.copyToClipboard();
            ev.ctrlKey && ev.key.toLowerCase() === 'v' && this.pasteFromClipboard();
            
            if (this.cropper && ev.key === " ") {
                this.cropper.setDragMode("move");
                this.cropper.clear();
            }
        })
        $(document).keyup((ev) => {
            if (this.cropper && ev.key === " ") {
                if (this.mode == MODE_CROP) {
                    this.cropper.setDragMode("crop");
                }
                if (this.mode == MODE_COLOR_PICK) {
                    this.cropper.setDragMode("none");
                }
            }
        })
        $(document).mousemove((e) => {
            this.handleMouseMove(e);
        })
        $(document).mousedown((e) => {
            if (this.mode == MODE_COLOR_PICK && !this.elemColorPickerModal.hasClass("in")) {
                this.elemColorPickerModal.modal("show");
                this.colorPicker.setRgb(this.pickedRgbColor);
            }
        })
    }

    setupColorPicker() {
        this.colorPicker = ColorPicker(this.elemColorPickerModal.find(".colorPicker")[0], (hex, hsv, rgb) => {
            this.elemColorPickerModal.find(".colorHex input").val(hex);
            this.elemColorPickerModal.find(".colorRgb input").val("rgba("+rgb.r+","+rgb.g+","+rgb.b+",1)");
            this.elemColorPickerModal.find(".colorDisplay").css("backgroundColor", hex);
        })
        this.colorPicker.setRgb({r: 255, g: 0, b: 0})
    }

    invalidateCanvasCache() {
        this.canvasCache = null;
        this.canvasCtxCache = null;
    }

    handleMouseMove(e) {
        if (this.mode !== MODE_COLOR_PICK) return;
        if (!this.cropper) return;
        if (this.elemColorPickerModal.hasClass("in")) return;

        if (!this.canvasCache) {
            this.canvasCache = this.cropper.getCroppedCanvas();
            this.canvasCtxCache = this.canvasCache.getContext("2d");
        }

        const data = this.cropper.getCanvasData();

        const scaleX = data.naturalWidth / data.width;
        const scaleY = data.naturalHeight / data.height;
        
        const canvasX = Math.floor((e.pageX-data.left) * scaleX);
        const canvasY = Math.floor((e.pageY-data.top) * scaleY);

        const canvas = this.canvasCache;
        const ctx = this.canvasCtxCache;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const pixelRedIndex = ((canvasY - 1) * (imageData.width * 4)) + ((canvasX - 1) * 4);
        const pixelcolor = "rgba("+pixels[pixelRedIndex]+", "+pixels[pixelRedIndex+1]+", "+pixels[pixelRedIndex+2]+", "+pixels[pixelRedIndex+3]+")";

        this.pickedRgbColor = {r: pixels[pixelRedIndex], g: pixels[pixelRedIndex+1], b: pixels[pixelRedIndex+2]};
        this.elemPickedColor.css("backgroundColor", pixelcolor);
    }

    setupMenu() {
        const menu = Menu.buildFromTemplate([
            {
                label: "File",
                submenu: [
                    {
                        label: "Open Image-File",
                        accelerator: "Ctrl+O",
                        click: () => this.handleButtonOpen(),
                    },
                    {
                        label: "Save as Image-File",
                        accelerator: "Ctrl+S",
                        click: () => this.handleButtonSave(),
                    },
                    {
                        label: "Copy Image to Clipboard",
                        accelerator: "Ctrl+C",
                        click: () => this.copyToClipboard(),
                    },
                    {
                        label: "Paste Image from Clipboard",
                        accelerator: "Ctrl+V",
                        click: () => this.pasteFromClipboard(),
                    },
                    {type: 'separator'},
                    { 
                        label: "Exit",
                        click: () => remote.getCurrentWindow().close(),
                    },
                ]
            },
            {
                label: "Tools",
                submenu: [
                    {
                        label: "Clear Selection",
                        accelerator: "ESC",
                        click: () => this.setMode(MODE_CROP),
                    },
                    {
                        label: "Mode: Image Cropping",
                        accelerator: "M",
                        click: () => this.setMode(MODE_CROP),
                    },
                    {
                        label: "Mode: Color Picking",
                        accelerator: "I",
                        click: () => this.setMode(MODE_COLOR_PICK),
                    },
                    {type: 'separator'},
                    {
                        label: "Crop Image",
                        accelerator: "Enter",
                        click: () => this.applyCrop(),
                    },
                    {type: 'separator'},
                    {
                        label: "Rotate Image 90° right",
                        accelerator: "Ctrl+Right",
                        click: () => this.rotateImage(90),
                    },
                    {
                        label: "Rotate Image 90° left",
                        accelerator: "Ctrl+Left",
                        click: () => this.rotateImage(-90),
                    },
                ]
            },
            {
                label: 'Dev',
                submenu: [
                    {role: 'reload'},
                    {role: 'forcereload'},
                    {role: 'toggledevtools'},
                    {type: 'separator'},
                    {role: 'resetzoom'},
                    {role: 'zoomin'},
                    {role: 'zoomout'},
                    {type: 'separator'},
                    {role: 'togglefullscreen'}
                ]
            },
        ])
        Menu.setApplicationMenu(menu);
    }

    handleButtonOpen() {
        const filePaths = dialog.showOpenDialog({properties: ['openFile', 'createDirectory']});
        if (!filePaths) {
            return;
        }
        this.openFile(filePaths[0])
    }

    handleButtonSave() {
        const filePath = dialog.showSaveDialog({
            filters: [
                {name: "JPEG Image", extensions: ["jpg"]}, 
                {name: "PNG Image", extensions: ["png"]},
            ],
        });
        if (!filePath) {
            return;
        }
        const croppedCanvas = this.cropper.getCroppedCanvas({
            imageSmoothingEnabled: false,
            imageSmoothingQuality: 'high',
        });
        const image = nativeImage.createFromDataURL(croppedCanvas.toDataURL());
        if (path.extname(filePath).toLowerCase() == ".jpg") {
            fs.writeFileSync(filePath, image.toJPEG(80));
        } else if (path.extname(filePath).toLowerCase() == ".png") {
            fs.writeFileSync(filePath, image.toPNG());
        } else {
            console.log("COULD NOT SAVE ", filePath);
        }
    }

    getImageInClipboard() {
        const image = clipboard.readImage();
        if (image.isEmpty()) {
            // TODO find a way to paste image-files, which have been copied in Explorer
            return null;
        }
        return image;
    }

    pasteFromClipboard() {
        const image = this.getImageInClipboard();
        if (!image) {
            alert("No image in clipboard");
            return;
        }
        this.setImage(image);
    }

    copyToClipboard() {
        const croppedCanvas = this.cropper.getCroppedCanvas({
            imageSmoothingEnabled: false,
            imageSmoothingQuality: 'high',
        });
        const image = nativeImage.createFromDataURL(croppedCanvas.toDataURL());
        clipboard.writeImage(image);
    }

    openImageFromClipboardOnStartup() {
        const image = this.getImageInClipboard();
        if (!image) {
            return;
        }
        this.setImage(image);
    }

    openFile(filePath) {
        const title = path.basename(filePath);
        const image = nativeImage.createFromPath(filePath);
        if (!image || image.isEmpty()) {
            alert("Failed to load image from path: " + filePath);
            return;
        }
        this.setImage(image);
    }

    setupDragDropHandler() {
        document.body.ondragover = (ev) => {
            return false;
        }
        document.body.ondragleave = (ev) => {
            return false;
        }
        document.body.ondragend = (ev) => {
            return false;
        }
        document.body.ondrop = (ev) => {
            ev.preventDefault();
            for (let f of ev.dataTransfer.files) this.openFile(f.path);
        }
    }

    rotateImage(degrees) {
        this.cropper && this.cropper.rotate(degrees);
        this.invalidateCanvasCache();
    }

    applyCrop() {
        if (!this.cropper) return;
        const croppedCanvas = this.cropper.getCroppedCanvas({
            imageSmoothingEnabled: false,
            imageSmoothingQuality: 'high',
        });
        const image = nativeImage.createFromDataURL(croppedCanvas.toDataURL());
        this.setImage(image);
    }

    setImage(nativeImage) {
        // cleanup old cropper
        if (this.cropper) {
            this.cropper.destroy();
        }

        // create <img>
        this.image = nativeImage;
        this.imageElem = $("<img class='mainImage' src='"+nativeImage.toDataURL()+"'>");
        this.elemMain.html("").append(this.imageElem);

        // initialise new cropper
        this.cropper = new Cropper(this.imageElem[0], {
            viewMode: 0,
        });
        this.setMode(MODE_CROP);

        // for color picker
        this.invalidateCanvasCache();
    }
}

exports.ImageApp = ImageApp;