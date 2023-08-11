const os = require('os');
const express = require('express');
const fs = require('fs');
const path = require('path');

const publicDirectory = 'site';
const defaultPage = 'index.htm';
const gameboardGenOffset = 2;
const saveFile = '/data/saved_board.json';
const gameboardMinScale = 5;
const gameboardMaxScale = 10;
const port = 3000;
const app = express();
var gameboardDictionary = {};

function createGameboard(date, width, height) {
	const gameboard = {
		server: {
			data: new Array(height)
		},
		client: {
			date: date,
			width: width,
			height: height,
			hints: null
		}
	};
	gameboard.client.date.setHours(0, 0, 0, 0);
	
	do {
		var rebuildBoard = false;
		
		for (var y = 0; y < height; y++) {
			if (gameboard.server.data[y] === undefined)
				gameboard.server.data[y] = new Array(width);
			for (var x = 0; x < width; x++) {
				const value = Math.round(Math.random());
				gameboard.server.data[y][x] = value;
			}
		}

		const hints = findGroupSizes(gameboard.server.data);;
		gameboard.client.hints = hints;
		
		// Adjacent 1s increase the odds of having an unsolvable board, so rebuild if we find any
		for (var rowIndex = 1; rowIndex < height; rowIndex++) {
			const indexOffset = hints.rows[rowIndex - 1].length - hints.rows[rowIndex].length;
			
			for (var groupIndex = 0; groupIndex < hints.rows[rowIndex].length; groupIndex++) {
				const currentGroupValue = hints.rows[rowIndex][groupIndex];
				if (currentGroupValue > 1)
					continue;
				
				for (var previousGroupIndex = -1; previousGroupIndex <= 1; previousGroupIndex++) {
					if (hints.rows[rowIndex - 1][previousGroupIndex] === currentGroupValue) {
						rebuildBoard = true;
						break;
					}
				}
				if (rebuildBoard)
					break;
			}
			if (rebuildBoard)
				break;
		}
		if (!rebuildBoard) {
			for (var columnIndex = 1; columnIndex < width; columnIndex++) {
				const indexOffset = hints.columns[columnIndex - 1].length - hints.columns[columnIndex].length;
				
				for (var groupIndex = 0; groupIndex < hints.columns[columnIndex].length; groupIndex++) {
					const currentGroupValue = hints.columns[columnIndex][groupIndex];
					if (currentGroupValue > 1)
						continue;
					
					for (var previousGroupIndex = -1; previousGroupIndex <= 1; previousGroupIndex++) {
						if (hints.columns[columnIndex - 1][previousGroupIndex] === currentGroupValue) {
							rebuildBoard = true;
							break;
						}
					}
					if (rebuildBoard)
						break;
				}
				if (rebuildBoard)
					break;
			}
		}
	} while (rebuildBoard);

	return gameboard;
}

function findGroupSizes(data) {
	const height = data.length;
	const width = data[0].length;
	const rows = new Array(height);
	const columns = new Array(width);
	const columnHintGroupIndex = new Array(width).fill(0);

	for (var y = 0; y < height; y++) {
		rows[y] = [0];
		var rowHintGroupIndex = 0;

		for (var x = 0; x < width; x++) {
			const value = data[y][x];
			
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
				if (x > 0 && data[y][x - 1] === 1)
					rowHintGroupIndex++;
				if (y > 0 && data[y - 1][x] === 1)
					columnHintGroupIndex[x]++;
			}
		}
	}	
	return { rows: rows, columns: columns };
}

function formatDateWithoutTime(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${month}/${day}/${year}`;
}

function generateGameboardCollection(date, beforeOffset, afterOffset) {
	const collection = {};
	
	for (var i = -beforeOffset; i <= afterOffset; i++) {
		const scale = randomRangeInt(gameboardMinScale, gameboardMaxScale + 1);
		const offsetDate = new Date(date.getTime());
		offsetDate.setHours(0, 0, 0, 0);
		offsetDate.setDate(offsetDate.getDate() + i);
		collection[formatDateWithoutTime(offsetDate)] = createGameboard(offsetDate, scale, scale);
	}
	return collection;
}

function getGameboard(date) {
	date.setHours(0, 0, 0, 0);
	return gameboardDictionary[date];
}

function getIpAddress() {
    const interfaces = os.networkInterfaces();
    
    for (const interfaceName in interfaces) {
        const iface = interfaces[interfaceName];
	    
        for (const ifaceEntry of iface) {
	  	    if (ifaceEntry.family === 'IPv4' && !ifaceEntry.internal) {
	  	    	return ifaceEntry.address;
	  	    }
        }
    }
    return '127.0.0.1';
}

function parseUnlocalizedDate(str) {
	const months = {
		Jan: '01',
		Feb: '02',
		Mar: '03',
		Apr: '04',
		May: '05',
		Jun: '06',
		Jul: '07',
		Aug: '08',
		Sep: '09',
		Oct: '10',
		Nov: '11',
		Dec: '12'
	};
	const dateStart = 4, dateEnd = 15;
	const dateSubstr = str.substring(dateStart, dateEnd);
	const elements = dateSubstr.split(' ');
	const month = months[elements[0]];
	const day = elements[1];
	const year = elements[2];
	
	return `${month}/${day}/${year}`;
}

function randomRangeInt(min, max) {
	return Math.floor(Math.random() * (max - min) + min);
}

function responseSendFile(res, file) {
	const filePath = path.join(__dirname, publicDirectory, file);
	
	res.sendFile(filePath, (err) => {
		if (err) {
			console.error(`Error sending ${filePath}: ${err}`);
			res.status(err.status || 500).send('Something went wrong.');
		}
	});
}

function saveGameboards() {
	const saveData = JSON.stringify(gameboardDictionary);
	try {
		fs.writeFileSync(saveFile, saveData);
		console.log('Gameboards saved');
	} catch (err) {
		console.log(`Failed to save gameboard: ${err}`);
	}
}

app.use(express.json());

app.use((err, req, res, next) => {
	console.error(`An Express error has occurred: ${err}`);
	res.status(500).send('Something went wrong.');
});

app.route('/api/gameboards/')
	.get((req, res) => {
		try {
			const serverDate = new Date();
			serverDate.setHours(0, 0, 0, 0);
			const lateServerDate = new Date(serverDate.getTime());
			lateServerDate.setDate(lateServerDate.getDate() + gameboardGenOffset);
			const clientDateKey = parseUnlocalizedDate(req.query.date);
			const serverDateKey = formatDateWithoutTime(serverDate);
			const lateServerDateKey = formatDateWithoutTime(lateServerDate);

			console.log(`GET request for date ${clientDateKey}, server is ${serverDateKey}`);
			if (gameboardDictionary[lateServerDateKey] === undefined) {
				console.log(`Generating new collection for ${serverDate}`);
				const newCollection = generateGameboardCollection(serverDate, gameboardGenOffset, gameboardGenOffset);
				for (const key of Object.keys(newCollection)) {
					if (gameboardDictionary[key] !== undefined)
						newCollection[key] = gameboardDictionary[key];
				}
				gameboardDictionary = newCollection;
				saveGameboards();
			}
			const gameboardToSend = gameboardDictionary[gameboardDictionary[clientDateKey] !== undefined ? clientDateKey : serverDateKey];
			res.set('Content-Type', 'application/json');
			res.send(JSON.stringify(gameboardToSend.client));
		} catch (err) {
			console.error(`An error has occurred during pixels GET: ${err}`);
			res.status(500).send('Something went wrong.');
		}
	})
	.post((req, res) => {
		try {
			const groupSizesClient = findGroupSizes(req.body.data);
			const clientDateKey = parseUnlocalizedDate(req.body.date);
			const responseJSON = {
				correctSolution: gameboardDictionary[clientDateKey] !== undefined ? JSON.stringify(groupSizesClient) === JSON.stringify(gameboardDictionary[clientDateKey].client.hints) : false
			};
			
			console.log(`POST request for date ${clientDateKey}`);
			res.set('Content-Type', 'text/json');
			res.send(responseJSON);
		} catch (err) {
			console.error(`An error has occurred during pixels POST: ${err}`);
			res.status(500).send('Something went wrong.');
		}
	});
	
app.get('/', (req, res) => {
	responseSendFile(res, defaultPage);
});

app.get('/:filePath(*)', (req, res) => {
	const requestedFile = req.params.filePath;
	responseSendFile(res, requestedFile);
});

const server = app.listen(port, getIpAddress(), () => {
	console.log('Starting server');
	const host = server.address().address;
	const port = server.address().port;
	
	try {
		const data = fs.readFileSync(saveFile, { encoding: 'utf8', flag: 'r' });
		gameboardDictionary = JSON.parse(data);
		for (const key of Object.keys(gameboardDictionary)) {
			// JSON.parse keeps dates as strings, so turn it back into a date
			gameboardDictionary[key].client.date = new Date(gameboardDictionary[key].client.date);
		}
		console.log('Gameboards loaded');
	} catch (err) {
		console.error(`Failed to load save file: ${err}`);
		const date = new Date();
		gameboardDictionary = generateGameboardCollection(date, gameboardGenOffset, gameboardGenOffset);
		saveGameboards();
	}
	
	console.log(`Server running at http://${host}:${port}/`);
});