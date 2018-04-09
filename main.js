const {electron, app, BrowserWindow, ipcMain, dialog} = require("electron");
const path = require("path");
const url = require("url");
const walkdir = require("walkdir");
const fs = require("fs-extra");

let mainWindow, htmlDirectory, destinationDirectory, banners = [], fallbacks = [], saveInBanner, bannerWindow;


function createWindow() {
	// Create main window
	mainWindow = new BrowserWindow({width: 800, height: 600});

	// and load the index.html of the app.
	mainWindow.loadURL(url.format({
		pathname: path.join(__dirname, 'index.html'),
		protocol: 'file:',
		slashes: true
	}));

	// Emitted when the window is closed
	mainWindow.on('closed', () => {
		mainWindow = null;
	});

	ipcMain.on("load-project", (event, prevDirectory = "") => {
		htmlDirectory = dialog.showOpenDialog({title: 'Select html directory', defaultPath: prevDirectory, properties: ['openDirectory', 'createDirectory']})[0];

		// tell renderer that project is selected
		event.sender.send("project-loaded", htmlDirectory);
	});

	ipcMain.on("set-destination", (event, prevDirectory = "") => {
		destinationDirectory = dialog.showOpenDialog({title: 'Select destination directory', defaultPath: prevDirectory, properties: ['openDirectory', 'createDirectory']})[0];

		// tell renderer that destination is selected
		event.sender.send("destination-set", destinationDirectory);
	});

	ipcMain.on("generate-fallbacks", (event, arg) => {

		// if fallbacks should be saved within banner folders
		saveInBanner = arg;

		// empty banners array
		banners = [];

		// start walking through the directory and collect banners
		let emitter = walkdir(htmlDirectory);

		emitter.on("file", collectHTMLBanner);

		emitter.on("end", allBannersCollected);
	});

	ipcMain.on("capture-screen", (event) => {
		event.sender.once("paint", onWebContentsPaint);
	});
}

function onWebContentsPaint(event, dirty, nativeImage) {
	let browserWindow = BrowserWindow.fromWebContents(event.sender);
	let size = browserWindow.getSize();
	let name = browserWindow.bannerName;

	let image = nativeImage.resize({width: size[0], height: size[1]});
	let jpg = image.toJPEG(100);

	let dest = saveInBanner ? path.join(destinationDirectory, name) : destinationDirectory;
	let fallback = path.join(dest, `${name}.jpg`);

	// save fallback
	fs.outputFile(fallback, jpg, () => {
		fallbacks.push(fallback);

		// remove first element in banner array
		banners.shift();
		generateFallbacks();
	});
}

function collectHTMLBanner(filename) {
	if (filename.substr(filename.indexOf(".")) == ".html") {
		banners.push(filename);
	}
}

function allBannersCollected() {

	// create window to display banners in
	bannerWindow = new BrowserWindow({
		width: 100,
		height: 100,
		resizable: true,
		allowRunningInsecureContent: true,
		webPreferences: {
			offscreen: true,
			preload: path.join(__dirname, "preload.js")
		}
	});

	generateFallbacks();
}

function generateFallbacks() {
	if (banners.length == 0) {
		finishedHandler();
		return;
	}

	let bannerPath = banners[0];
	let size = bannerPath.match(/[0-9]+x[0-9]+/g)[0].split("x").map(value => { return parseInt(value); });
	let parts = bannerPath.split("/");
	let name = parts[parts.length - 2]; // get the next last part of the path
	bannerWindow.bannerName = name;

	bannerWindow.setSize(size[0], size[1]);

	// load banner
	bannerWindow.loadURL(url.format({
		pathname: bannerPath,
		protocol: "file:",
		slashes: true
	}));
}

function finishedHandler() {
	bannerWindow.destroy();
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// EVENT LISTENERS
// ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
app.on("ready", createWindow);
app.on("window-all-closed", () => {
	app.quit();
});
