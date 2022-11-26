const Steam = require("steam-server-query")
const express = require('express');
const colors = require("colors");
const app = express();
const port = 3004;

BigInt.prototype.toJSON = function () {
	return this.toString()
}

var removeDuplicates = function (nums) {
	let length = nums.length;
	for (let i = length - 1; i >= 0; i--) {
		for (let j = i - 1; j >= 0; j--) {
			if (nums[i] == nums[j]) {
				nums.splice(j, 1);
			}
		}
	}
	return nums;
};
servers = [];

// Keyword split to version, dlcs, tps
function splitKeyword(keyword) {
	data = keyword.split("-")
	switch (data[1]) {
		case "0":
			dlcString = "None"
			break;
		case "1":
			dlcString = "Weapons"
			break;
		case "2":
			dlcString = "Arid"
			break;
		case "3":
			dlcString = "Both"
			break;
		default:
			break;
	}
	if (data[0] >= "v1.3.0") {
		return {
			"version": data[0],
			dlcString,
			dlc: data[1],
			"tps": data[2]
		}
	} else { // For older versions
		console.log(`${colors.magenta(`[DEBUG ${new Date()}]`)} Absolutely ancient server found, ${data}`);
		return {
			"version": data[0],
			"tps": data[1]
		}
	}
};

function objectLength(object) {
	var length = 0;
	for (var key in object) {
		if (object.hasOwnProperty(key)) {
			++length;
		}
	}
	return length;
};

// checkServer function
function checkServer(address) {
	Steam.queryGameServerInfo(address).then(data => {
		data.keywords.split("-")
		data.address = address.split(":");
		data.serverInfo = splitKeyword(data.keywords);

		output = {
			"name": data.name,
			"address": data.address[0],
			"port": data.address[1],
			"version": data.serverInfo.version,
			"dlc": data.serverInfo.dlc,
			"dlcString": data.serverInfo.dlcString,
			"tps": data.serverInfo.tps,
			"players": data.bots,
			"maxPlayers": data.maxPlayers,
			"map": data.map,
			"gameId": data.gameId,
			"lastUpdated": new Date()
		}
		serverList.servers[address] = output;
		return output;
	}).catch((err) => {
		output = {
			"error": "Could not connect to server",
			"name": "Unknown",
			"address": address.split(":")[0],
			"port": address.split(":")[1],
			"version": "Unknown",
			"dlc": null,
			"dlcString": "Unknown",
			"tps": 0,
			"players": 0,
			"maxPlayers": 0,
			"map": "Unknown",
			"gameId": "573090"
		}
		serverList.errored[address] = output;
		return output;
	});
}


var masterList = {
	lastUpdated: new Date(),
	servers: []
};

var serverList = {
	lastUpdated: new Date(),
	servers: {},
	errored: {}
}

var highestVersion = "v0.0.0";

// findHighestVersion function
function findHighestVersion() {
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Finding highest version...`);
	for (var key in serverList.servers) {
		if (serverList.servers.hasOwnProperty(key)) {
			if (serverList.servers[key].version > highestVersion) {
				highestVersion = serverList.servers[key].version;
			}
		}
	}
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Highest version is ${highestVersion}`);
	return highestVersion;
};

var outdatedServers = 0;

// countOutdatedServers function, counts servers that are outdated
function countOutdatedServers() {
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Counting outdated servers, latest version is ${highestVersion}`);
	outdatedServers = 0;
	for (var key in serverList.servers) {
		if (serverList.servers.hasOwnProperty(key)) {
			if (serverList.servers[key].version != highestVersion) {
				outdatedServers++;
			}
		}
	}
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} ${outdatedServers} servers are outdated!`);
	return outdatedServers;
};


var versions = {};

// Track server versions
function countVersions() {
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Counting server versions...`);
	versions = {};
	for (var key in serverList.servers) {
		if (serverList.servers.hasOwnProperty(key)) {
			if (versions[serverList.servers[key].version] == undefined) {
				versions[serverList.servers[key].version] = 1;
			} else {
				versions[serverList.servers[key].version] += 1;
			}
		}
	}
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} ${objectLength(versions)} versions found!`);
	return versions;
};

// updateMasterList function
function updateMasterList() {
	// Get master list
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Getting master list...`);
	Steam.queryMasterServer('hl2master.steampowered.com:27011', Steam.REGIONS.ALL, {
		appid: 573090,
		game: "Stormworks",
	}, 1000, 400).then(servers => {
		servers = removeDuplicates(servers);
		console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Got master list!`);
		masterList.servers = servers;
		masterList.lastUpdated = new Date();
		updateServerList();
	}).catch((err) => {
		console.log(`${colors.red(`[ERROR ${new Date()}]`)} Error updating master list: ${err}`);
	});
}

// updateServerList function
function updateServerList() {
	// Get every server in master list
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Getting server list...`);
	for (let i = 0; i < masterList.servers.length; i++) {
		// Get server info
		checkServer(masterList.servers[i]);
		serverList.lastUpdated = new Date();
	}
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Got server list!`);
	setTimeout(findHighestVersion, 1000);
	setTimeout(countVersions, 1000);
	setTimeout(countOutdatedServers, 1000);
};

// Update master list every 5 minutes
setInterval(updateMasterList, 60 * 1000);
updateMasterList();

app.get('/check', (req, res) => {
	// Check that all required parameters are present
	if (!req.query.address) {
		res.send({
			"error": "Missing required parameter: address"
		});
		return;
	};
	// Regex for IP address : port
	const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]{1,5}/;
	// Check ip argument is valid
	if (ipRegex.test(req.query.address)) {
		console.log(`${colors.cyan(`[INFO ${new Date()}]`)} ${req.headers["user-agent"]}@${req.ip} requested check server ${req.query.address}`);
		console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Checking server ${req.query.address}`);
		Steam.queryGameServerInfo(req.query.address).then(data => {
			// Check if server is not running Stormworks, in which case, someone is trying to be funny
			if (data.appid != 573090) {
				res.status(418).send({
					"error": "A server was found, but it is not running Stormworks"
				});
				return;
			}
			data.keywords.split("-")
			data.address = req.query.address.split(":");
			data.serverInfo = splitKeyword(data.keywords);

			output = {
				"name": data.name,
				"address": data.address[0],
				"port": data.address[1],
				"version": data.serverInfo.version,
				"dlc": data.serverInfo.dlc,
				"dlcString": data.serverInfo.dlcString,
				"tps": data.serverInfo.tps,
				"players": data.bots,
				"maxPlayers": data.maxPlayers,
				"map": data.map,
				"gameId": data.gameId,
				"lastUpdated": new Date()
			}
			serverList.servers[req.query.address] = output;
			res.setHeader("Content-Type", "application/json").send(JSON.stringify(output));
		}).catch(err => {
			console.log(err)
			res.status(500).send(`Could not query server: ${err}`);
		});
	} else {
		res.status(400).send("Invalid Server Address, must be in the format IP:PORT")
	}
});

// Commented out because it could be abused, not that the serverList API couldnt be abused anyway
// app.get('/masterList', (req, res) => {
// 	res.setHeader("Content-Type", "application/json").send(JSON.stringify(masterList));
// });

app.get('/serverList', (req, res) => {
	serverList.serverCount = objectLength(serverList.servers);
	serverList.highestVersion = findHighestVersion();
	serverList.outdatedServers = countOutdatedServers();
	serverList.versions = countVersions();
	serverList.erroredCount = objectLength(serverList.errored);
	res.setHeader("Content-Type", "application/json").send(JSON.stringify(serverList));
});

app.get('/', (req, res) => {
	// Send list of all endpoints
	res.setHeader("Content-Type", "application/json").send(JSON.stringify({
		"endpoints": [
			"/check?address=IP:PORT",
			"/serverList"
		]
	}));
});


app.listen(port, () => {
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Server started on port ${port}`);
});