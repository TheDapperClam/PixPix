function getFilenameWithoutExtension(path) {
	const start = path.lastIndexOf('/') + 1;
	const end = path.lastIndexOf('.');
	return path.slice(start, end);
}

const app = Vue.createApp({
	template:  `
		<h2>Daily {{ gameboard.width }}x{{ gameboard.height }}</h2>
		<canvas id="gameboardCanvas" ref="gameboardCanvas" width="1000" height="1000" @mousemove="gameboardMouseMove($event)" @click="gameboardClicked($event)"></canvas>
		<div id="controls" ref="controls" :class="{ 'd-none': completed }">
			<button class="selected" @click="setClickValue($event, 1)"><img src="./images/solid_simple.svg" alt="Solid button"/></button>
			<button @click="setClickValue($event, 2)"><img src="./images/cross_simple.svg" alt="Cross button" /></button>
			<button @click="setClickValue($event, 3)"><img src="./images/unknown_simple.svg" alt="Unknown button" /></button>
			<button class="mt-4" @click="undo()"><img src="./images/undo.svg" alt="Undo button" /></button>
			<button class="clear mt-4" @click="clearGameboard(this.gameboard)"><img src="./images/clear.svg" alt="Clear button"/></button>
		</div>
		<div id="victory"><h2>Well done!</h2></div>
		<div id="consent" class="position-fixed left-0 bottom-0 w-100 bg-dark zindex-popover text-light p-3 align-items-center" :style="{ display: showConsent ? 'flex' : 'none' } ">
			<h3>Would you like to allow PixPix to use cookies to save board progress and other game data?</h3>
			<button class="w-50" @click="acceptCookies()">Yes</button>
			<button class="w-50" @click="declineCookies()">No</button>
		</div>`,
	
	data() {
		return {
			images: {},
			undos: [],
			canClick: true,
			completed: false,
			clickValue: 1,
			gameboard: null,
			cookieConsent: false,
			showConsent: true
		};
	},
	
	methods: {
		acceptCookies() {
			this.cookieConsent = true;
			this.showConsent = false;
		},
		
		clearGameboard(gameboard) {
			if (!this.canClick || !confirm('Are you sure you would like to clear the board?'))
				return;
			this.saveUndoPoint(gameboard);
			for (var y = 0; y < gameboard.data.length; y++) {
				for (var x = 0; x < gameboard.data[y].length; x++) {
					gameboard.data[y][x] = 0;
				}
			}
		},
		
		createGameboard(date, width, height, hints) {
			const data = new Array(height);
			for (var i = 0; i < height; i++)
				data[i] = new Array(width);
			
			return { 
				mousePosition: { x: -1, y: -1 },
				data: data,
				date: date,
				formattedDate: this.formatDate(date),
				x: 0,
				y: 0,
				cellSize: 0,
				width: width,
				height: height,
				hints: hints
			};
		},
		
		declineCookies() {
			this.cookieConsent = false;
			this.showConsent = false;
		},
		
		findGroupSizes(gameboard) {
			var rows = new Array(gameboard.height);
			var columns = new Array(gameboard.width).fill(0).map(() => []);
			var columnHintGroupIndex = new Array(gameboard.width).fill(0);

			for (var y = 0; y < gameboard.height; y++) {
				rows[y] = [0];
				var rowHintGroupIndex = 0;

				for (var x = 0; x < gameboard.width; x++) {
					const value = gameboard.data[y][x];
					
					if (y === 0)
						columns[x] = [0];

					if (value === 1) {
						if (rowHintGroupIndex >= rows[y].length)
							rows[y].push(0);
						if (columnHintGroupIndex[x] >= columns[x].length)
							columns[x].push(0);
						rows[y][rowHintGroupIndex]++;
						columns[x][columnHintGroupIndex[x]]++;
					} else {
						if (x > 0 && gameboard.data[y][x - 1] === 1)
							rowHintGroupIndex++;
						if (y > 0 && gameboard.data[y - 1][x] === 1)
							columnHintGroupIndex[x]++;
					}
				}
			}	
			return { rows: rows, columns: columns };
		},
		
		formatDate(dateStr) {
			const date = new Date(dateStr);
			const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			const day = date.getDate();
			const month = monthNames[date.getMonth()];
			const year = date.getFullYear();
			return `${month} ${day+1}, ${year}`;
		},
		
		gameboardClicked(event) {
			if (!this.canClick)
				return;
			const gameboardClickPosition = this.positionToGameboard(event.clientX, event.clientY, this.gameboard);
			if (this.completed || gameboardClickPosition.x >= this.gameboard.width || gameboardClickPosition.x < 0 || gameboardClickPosition.y >= this.gameboard.height || gameboardClickPosition.y < 0)
				return;
			
			const currentCellValue = this.gameboard.data[gameboardClickPosition.y][gameboardClickPosition.x];
			const newCellValue = currentCellValue > 0 ? 0 : this.clickValue;
			this.saveUndoPoint(this.gameboard);
			this.gameboard.data[gameboardClickPosition.y][gameboardClickPosition.x] = newCellValue;
			const groups = this.findGroupSizes(this.gameboard);
			
			// Submit our solution for approval after changing, and when all row and group conditions are met
			if (JSON.stringify(groups) === JSON.stringify(this.gameboard.hints))
				this.submitGameboard(this.gameboard);
		},
		
		gameboardMouseMove(event) {
			// We don't want the gameboard to render every moment the mouse is moving
			const mouseGameboardPos = this.positionToGameboard(event.clientX, event.clientY, this.gameboard);
			if ( mouseGameboardPos.x !== this.gameboard.mousePosition.x || mouseGameboardPos.y !== this.gameboard.mousePosition.y )
				this.gameboard.mousePosition = mouseGameboardPos;
		},
		
		getCookie(name) {
			const cookie = document.cookie;
			if (cookie) {
				const elements = cookie.split(';');
				for (const element of elements) {
					if (!element.includes(name))
						continue;
					const valueStart = element.indexOf('=') + 1;
					return element.slice(valueStart, element.length);
				}
			}
			return null;
		},
		
		getGameboard(date) {
			return new Promise((resolve, reject) => {
				const request = new XMLHttpRequest();

				request.onreadystatechange = () => {
					if (request.readyState === 4) {
						if (request.status === 200) {
							const response = JSON.parse(request.responseText);
							const gameboard = this.createGameboard(response.date, response.width, response.height, response.hints);
							resolve(gameboard);
						} else {
							reject(new Error(`Request failed with status: ${request.status}`));
						}
					}
				};
				
				request.open('GET', `/api/gameboards?date=${date}`, true);
				request.setRequestHeader('Content-Type', 'application/json');
				request.send();
			});
		},
		
		loadProgress() {
			const cookie = document.cookie;
			if (!cookie)
				return null;
			return JSON.parse(this.getCookie('gameboard'));
		},
		
		loadImages() {
			const urls = ['./images/back.svg', './images/cross.svg', './images/solid.svg', './images/unknown.svg'];
			const promises = urls.map((url) => this.loadImage(url, this.images));
			return Promise.all(promises);
		},
		
		loadImage(url, container = undefined) {
			return new Promise((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve();
				image.onerror =() => reject();
				image.src = url;
				
				if (container !== undefined) {
					const name = getFilenameWithoutExtension(url);
					container[name] = image;
				}
			});
		},
		
		positionToGameboard(x, y, gameboard) {
			return { x: Math.floor((x - gameboard.x) / gameboard.cellSize), y: Math.floor((y - gameboard.y) / gameboard.cellSize)};
		},
		
		renderGameboard(gameboard, groups = null) {
			const canvas = this.$refs.gameboardCanvas;
			if (canvas === null)
				return;
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			const ctx = canvas.getContext('2d');
			const fontSizeMax = 40;
			const cellSizeMax = 120;
			const cellSizeFactor = 5;
			const screenSizeFactor = 900;
			const textSpacing = 8;
			const cellScaleMultiple = cellSizeFactor / Math.max(gameboard.width, gameboard.height);
			const screenScaleMultiple = Math.min(window.innerHeight, window.innerWidth) / screenSizeFactor;
			const fontSize = fontSizeMax * cellScaleMultiple * screenScaleMultiple;
			gameboard.cellSize = cellSizeMax * cellScaleMultiple * screenScaleMultiple;
			gameboard.x = canvas.width / 2 - gameboard.width * gameboard.cellSize / 2;
			gameboard.y = canvas.height / 2 - gameboard.height * gameboard.cellSize / 2;
			if (groups === null)
				groups = this.findGroupSizes(gameboard);
			
			ctx.beginPath();
			ctx.clearRect(gameboard.x, gameboard.x, gameboard.width * gameboard.cellSize, gameboard.height * gameboard.cellSize);
			for (var y = 0; y < gameboard.height; y++) {
				const rectY = y * gameboard.cellSize + gameboard.y;
				
				for (var x = 0; x < gameboard.width; x++) {
					const rectX = x * gameboard.cellSize + gameboard.x;
					
					ctx.fillStyle = 'white';
					ctx.globalAlpha = gameboard.mousePosition.x === x && gameboard.mousePosition.y === y ? 0.5 : 1.0;
					switch(gameboard.data[y][x]) {
						default:
							ctx.drawImage(this.images.back, rectX, rectY, gameboard.cellSize, gameboard.cellSize);
							break;
						case 1:
							ctx.drawImage(this.images.solid, rectX, rectY, gameboard.cellSize, gameboard.cellSize);
							break;
						case 2:
							ctx.drawImage(this.images.cross, rectX, rectY, gameboard.cellSize, gameboard.cellSize);
							break;
						case 3:
							ctx.drawImage(this.images.unknown, rectX, rectY, gameboard.cellSize, gameboard.cellSize);
							break;
					}
				}
			}
			// Draw row hints
			ctx.globalAlpha = 1.0;
			ctx.fillStyle = 'black';
			ctx.font = `${fontSize}px Arial Narrow`;
			ctx.textAlign = 'right';
			ctx.textBaseline = 'center';
			for (var rowIndex = 0; rowIndex < gameboard.height; rowIndex++) {
				var xOffset = gameboard.x - textSpacing;

				for (var groupIndex = gameboard.hints.rows[rowIndex].length - 1; groupIndex >= 0; groupIndex--) {
					const text = gameboard.hints.rows[rowIndex][groupIndex].toString();
					const textMeasurement = ctx.measureText(text);
					const textHeight = textMeasurement.actualBoundingBoxAscent + textMeasurement.actualBoundingBoxDescent;
					const yOffset = rowIndex * gameboard.cellSize + gameboard.y + gameboard.cellSize / 2 + textHeight / 2;
					ctx.fillStyle = groups.rows[rowIndex][groupIndex] === gameboard.hints.rows[rowIndex][groupIndex] ? 'silver' : 'black'
					
					ctx.fillText(text, xOffset, yOffset);
					xOffset -= textMeasurement.width + textSpacing;
				}
			}
			// Draw column hints
			ctx.textAlign = 'center';
			ctx.textBaseline = 'bottom';
			for (var columnIndex = 0; columnIndex < gameboard.width; columnIndex++) {
				var xOffset = columnIndex * gameboard.cellSize + gameboard.x + gameboard.cellSize / 2;
				var yOffset = gameboard.y - textSpacing;
				
				for (var groupIndex = gameboard.hints.columns[columnIndex].length - 1; groupIndex >= 0; groupIndex--) {
					const text = gameboard.hints.columns[columnIndex][groupIndex].toString();
					const textMeasurement = ctx.measureText(text);
					const textHeight = textMeasurement.actualBoundingBoxAscent + textMeasurement.actualBoundingBoxDescent;
					ctx.fillStyle = groups.columns[columnIndex][groupIndex] === gameboard.hints.columns[columnIndex][groupIndex] ? 'silver' : 'black'
					
					ctx.fillText(text, xOffset, yOffset);
					yOffset -= textHeight + textSpacing;
				}
			}
			ctx.stroke();
		},
		
		setClickValue(event, value) {
			const selectedElements = document.getElementsByClassName('selected');
			
			for (const element of selectedElements) {
				element.classList.remove('selected');
			}
			event.target.classList.add('selected');
			this.clickValue = value;
		},
		
		saveProgress(gameboard) {
			if (!this.cookieConsent)
				return;
			const value = JSON.stringify({data: gameboard.data, date: gameboard.date, completed: this.completed});
			const expires = new Date();
			expires.setDate(expires.getDate() + 7);
			expires.setHours(0, 0, 0, 0);
			const cookie = `gameboard=${value}; path=/; expires=${expires.toUTCString()};`;
			document.cookie = cookie;
		},
		
		saveUndoPoint(gameboard) {
			const undoPoint = new Array(gameboard.height);
			for (var y = 0; y < gameboard.height; y++) {
				undoPoint[y] = new Array(gameboard.width);
				
				for (var x = 0; x < gameboard.width; x++) {
					undoPoint[y][x] = gameboard.data[y][x];
				}
			}
			
			this.undos.push(undoPoint);
		},
		
		submitGameboard(gameboard) {
			const date = new Date();
			const request = new XMLHttpRequest();
			const requestJson = {
				data: gameboard.data,
				date: date.toString()
			};

			request.onreadystatechange = () => {
				if (request.readyState === 4) {
					this.canClick = true;
					
					if (request.status === 200) {
						const response = JSON.parse(request.responseText);
						const victoryScreen = document.getElementById('victory');
						
						if (response.correctSolution && victoryScreen !== null ) {
							this.completed = true;
							this.saveProgress(gameboard);
							victoryScreen.classList.add('slideInOut');
						}
					}
				}
			};
			
			this.canClick = false;
			request.open('POST', '/api/gameboards/', true);
			request.setRequestHeader('Content-Type', 'application/json');
			request.send(JSON.stringify(requestJson));
		},
		
		undo() {
			const undoValue = this.undos.pop();
			if (!this.canClick || undoValue === undefined)
				return;
			this.gameboard.data = undoValue;
		},
		
		windowResized(event) {
			this.renderGameboard(this.gameboard);
		}
	},

	async mounted() {
		const app = document.getElementById('app');
		const date = new Date();
		this.gameboard = await this.getGameboard(date);
		await this.loadImages();
		
		const savedProgress = this.loadProgress();
		if (savedProgress !== null) {
			this.acceptCookies();
			if (savedProgress.date === this.gameboard.date) {
				this.gameboard.data = savedProgress.data;
				this.completed = savedProgress.completed;
			}
		}
		
		window.addEventListener('resize', this.windowResized);
		this.renderGameboard(this.gameboard);
		app.style.opacity = '1';
	},
	
	watch: {
		gameboard: {
			deep: true,
			handler(newValue, oldValue) {
				this.renderGameboard(newValue);
			}
		},
		
		'gameboard.data': {
			deep: true,
			handler(newValue, oldValue) {
				this.saveProgress(this.gameboard);
			}
		}
	}
});
app.mount('#app');