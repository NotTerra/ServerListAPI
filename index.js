/*

Some foreword:
This code is a mess, I know, but it works. Eventually I'll clean it up, probably in some big rewrite.
That in itself is pretty ironic, considering this could be used for some sort of server browser, where reliability is key, but I digress.

I'll try to comment it as best as I can, but I'm not the best at explaining things.

- Chris Chrome

*/


const Steam = require("steam-server-query")
const express = require('express');
const rateLimit = require('express-rate-limit');
const colors = require("colors");
const semver = require("semver");
const childProcess = require('child_process');
const app = express();
const port = 3004;
const config = require("./config.json");
const fs = require("fs")
// Define objects (Need to finish moving objects up here)

var masterList = {
	lastUpdated: new Date(),
	servers: []
};

var serverList = {
	serviceStarted: new Date(),
	serverCount: 0,
	highestVersion: "v0.0.0",
	lowestVersion: "v999.999.999",
	outdatedServers: 0,
	versions: {},
	erroredCount: 0,
	lastUpdated: new Date(),
	servers: {},
	errored: {},
	offline: {}
}

const DLCs = [
	"Weapons",
	"Arid",
	"Space",
	"Unknown", // For future proofing
];

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

// Make DLC bitfield from dlc array, same outputs as splitKeyword in reverse, inputs in an array are 1 = Weapons, 2 = Arid, 3 = Space, figure out the output based on an array of inputs, so an input if [3] would be "6" and so on
function calculateDLCNumber(array) {
	array = array.map((number) => {
		// 1 -> 1, 2 -> 2, 3 -> 4
		return Math.pow(2, parseInt(number) - 1)
	});
	// Or all bitflags, producing the final number
	return array.reduce((a, b) => a | b, 0);
}

// Keyword split to version, dlcs, tps
function splitKeyword(keyword) {
	data = keyword.split("-")
	let dlcFlags = parseInt(data[1]);
	let dlcComponents = DLCs.filter((name, idx) => {
		// no need to subtract 1, as idx is 0 based
		// idx 0 -> flag 1 -> Weapons
		// idx 2 -> flag 4 -> Space
		return Math.pow(2, idx) & dlcFlags
	});
	if (dlcComponents.length === 0) {
		dlcComponents.push("None");
	}
	let dlcString = dlcComponents.join(" + ");
	// if (data[0] >= "v1.3.0") {
	// 	return {
	// 		"version": data[0],
	// 		dlcString,
	// 		dlc: data[1],
	// 		"tps": data[2]
	// 	}
	// } else { // For older versions
	// 	console.log(`${colors.magenta(`[DEBUG ${new Date()}]`)} Absolutely ancient server found, ${data}`);
	// 	return {
	// 		"version": data[0],
	// 		"tps": data[1]
	// 	}
	// }
	// Lets redo this to actually work with v1.10.0 and above, still gotta check because versions older than 1.3 dont have DLC, and wont have the right number of fields
	switch (data.length) {
		case 1:
			return {
				"version": data[0]
			}
			break;
		case 2: // Only version and DLC
			return {
				"version": data[0],
				dlcString,
				dlc: data[1]
			}
			break;
		case 3: // Version, DLC and TPS
			return {
				"version": data[0],
				dlcString,
				dlc: data[1],
				"tps": data[2]
			}
			break;
		default:
			break;
	}
};

// Do not use this function, it's broken for some reason
function countdown(seconds, start, end) {
	return new Promise((resolve, reject) => {
		var i = seconds;
		var interval = setInterval(() => {
			process.stdout.clearLine();
			process.stdout.cursorTo(0);
			// send newline on first iteration
			if (i == seconds) {
				process.stdout.write(`${start}${i}${end}\n`);
			} else if (i < 0) {
				process.stdout.write(`${start}${i}${end}\n`);
				clearInterval(interval);
				resolve();
			} else {
				process.stdout.write(`${start}${i}${end}`);
			}

			i--;
		}, 1000);
	});
}

function getGitCommitDetails() {
	try {
		// Use child_process.execSync to run the `git log -1 --format=%H%x09%an%x09%ae%x09%ad%x09%s` command
		// and return the output as a string
		const stdout = childProcess.execSync('git log -1 --format=%H%x09%an%x09%ae%x09%ad%x09%s').toString();
		const origin = childProcess.execSync('git config --get remote.origin.url').toString().trim().replace(/\.git$/, '');
		// Split the output string into an array of fields
		const fields = stdout.split('\t');

		// Return the commit details as a JSON object
		return {
			commit: {
				hash: fields[0].substring(0, 7),
				fullHash: fields[0],
				author: fields[1],
				email: fields[2],
				timestamp: fields[3],
				subject: fields[4]
			},
			origin
		}
	} catch (error) {
		console.error(error);
	}
}

function objectLength(object) {
	var length = 0;
	for (var key in object) {
		if (object.hasOwnProperty(key)) {
			++length;
		}
	}
	return length;
};

// Gets a server list entry for a bad server
function getBadServer(address, reason) {
	let [ip_address, port] = address.split(":")
	return {
		"error": reason,
		"name": "Unknown",
		"address": ip_address,
		"port": port,
		"version": "Unknown",
		"dlc": 0,
		"dlcString": "Unknown",
		"tps": 0,
		"players": 0,
		"maxPlayers": 0,
		"map": "Unknown",
		"gameId": "573090"
	};
}

// checkServer function
function checkServer(address) {
	return Steam.queryGameServerInfo(address).then(data => {
		if (data.gameId != "573090") {
			return getBadServer(address, "Not a Stormworks server");
		}
		let [ip_address, port] = address.split(":");
		let serverInfo = splitKeyword(data.keywords);
		// Calculate outdated status, cant use less than anymore because of the way semver works and 1.10.0 appears as less than 1.9.9
		let outdated = semver.lt(serverInfo.version, serverList.highestVersion);
		return {
			"name": data.name,
			"address": ip_address,
			"port": port,
			"password": data.visibility == 1,
			"version": serverInfo.version,
			"outdated": outdated,
			"dlc": serverInfo.dlc,
			"dlcString": serverInfo.dlcString,
			"tps": serverInfo.tps,
			"players": data.bots,
			"maxPlayers": data.maxPlayers,
			"map": data.map,
			"gameId": data.gameId,
			"lastUpdated": new Date()
		};
	}).catch((err) => {
		return getBadServer(address, "Could not connect to server");
	}).then((entry) => {
		delete serverList.offline[address];
		//console.log(address, JSON.stringify(entry))
		if ('error' in entry) {
			delete serverList.servers[address];
			serverList.errored[address] = entry;
		} else {
			delete serverList.errored[address];
			serverList.servers[address] = entry;
		}
		return entry
	});;
}

var highestVersion = "v0.0.0";

// findHighestVersion function
function findHighestVersion() {
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Finding highest version...`);
	for (const key in serverList.servers) {
		if (serverList.servers.hasOwnProperty(key)) {
			const currentVersion = serverList.servers[key].version;
			if (semver.valid(currentVersion)) { // check if currentVersion is a valid semver string
				if (semver.gt(currentVersion, highestVersion)) {
					highestVersion = currentVersion;
				}
			}
		}
	}
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Highest version is ${highestVersion}`);
	return highestVersion;
}

var lowestVersion = 'v999.999.999';

// findLowestVersion function
function findLowestVersion() {
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Finding lowest version...`);
	for (const key in serverList.servers) {
		if (serverList.servers.hasOwnProperty(key)) {
			const currentVersion = serverList.servers[key].version;
			if (semver.valid(currentVersion)) { // check if currentVersion is a valid semver string
				if (semver.lt(currentVersion, lowestVersion)) {
					lowestVersion = currentVersion;
				}
			}
		}
	}
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Lowest version is ${lowestVersion}`);
	return lowestVersion;
}

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
	const versions = {};
	for (const key in serverList.servers) {
		const server = serverList.servers[key];
		versions[server.version] = (versions[server.version] || 0) + 1;
	}
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} ${Object.keys(versions).length} versions found!`);
	return versions;
}

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
	for (let address of masterList.servers) {
		// Get server info
		checkServer(address);
		serverList.lastUpdated = new Date();
	}
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Got server list!`);
	setTimeout(() => {
		purgeDeadServers();
		serverList.serverCount = objectLength(serverList.servers);
		serverList.highestVersion = findHighestVersion();
		serverList.lowestVersion = findLowestVersion();
		serverList.outdatedServers = countOutdatedServers();
		serverList.versions = countVersions();
		serverList.erroredCount = objectLength(serverList.errored);
	}, 1500);
};

// purgeDeadServers function, moves dead servers to offline list
function purgeDeadServers() {
	let counter = 0;
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Purging dead servers...`);
	for (var key in serverList.servers) {
		if (serverList.servers.hasOwnProperty(key)) {
			if (serverList.servers[key].lastUpdated < new Date(new Date().getTime() - 60000)) {
				serverList.offline[key] = serverList.servers[key];
				delete serverList.servers[key];
				console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Server ${key} is offline!`);
				// If server somehow got into errored list, remove it
				if (serverList.errored[key]) {
					delete serverList.errored[key];
				}
				counter++;
			}
		}
	}
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Purged ${counter} dead servers!`);
}

// Startup messages
console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Starting Stormworks Server List...`);
console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Config: ${JSON.stringify(config)}`);
console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Commit: ${getGitCommitDetails().hash}`);

// Update master list every 1 minute
setInterval(() => {
	updateMasterList();
}, config.updateInterval * 1000);
updateMasterList();
setTimeout(() => {
	updateServerList(); // Hacky fix for outdated server check
}, 5000);
if (config.rateLimiterEnabled) {
	const rateLimiterWarnings = new Set();

	app.use(rateLimit({
		windowMs: config.rateLimitWindow * 60 * 1000, // X minutes
		max: config.rateLimitMax, // limit each IP to X requests per windowMs.
		keyGenerator: function (req) {
			return config.behindProxy ? req.headers['x-real-ip'] : req.ip;
		},
		skipFailedRequests: true,
		handler: function (req, res /*, next*/) {
			const ip = config.behindProxy ? req.headers['x-real-ip'] : req.ip;
			const remainingTime = Math.round((req.rateLimit.resetTime - Date.now()) / 1000);
			res.status(429).json({
				error: 'Too Many Requests',
				message: `You have exceeded the rate limit. Please try again in ${remainingTime} seconds.`,
				remainingTime: remainingTime
			});
			if (req.rateLimit.remaining === 0 && !rateLimiterWarnings.has(ip)) {
				rateLimiterWarnings.add(ip);
				console.log(`${colors.red(`[ERROR ${new Date()}]`)} ${req.headers["user-agent"]}@${ip} exceeded rate limit!`);
				setTimeout(() => rateLimiterWarnings.delete(ip), req.rateLimit.resetTime - Date.now());
			}
		}
	}));
}


app.get('/check', (req, res) => {
	// Check that all required parameters are present
	if (!req.query.address) {
		res.send({
			"error": "Missing required parameter: address"
		});
		return;
	}
	// Regex for IP address : port
	// Note: this regex may match invalid addresses, like 999.999.999.999:99999
	const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]{1,5}/;
	// Check ip argument is valid
	if (ipRegex.test(req.query.address)) {
		console.log(`${colors.cyan(`[INFO ${new Date()}]`)} ${req.headers["user-agent"]}@${req.ip} requested check server ${req.query.address}`);
		console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Checking server ${req.query.address}`);
		checkServer(req.query.address).then((data) => {
			if ("error" in data) {
				res.status(500).send({
					"error": data.error
				})
			} else {
				res.setHeader("Content-Type", "application/json").send(JSON.stringify(data));
			}
		});
	} else {
		res.status(400).send("Invalid Server Address, must be in the format IP:PORT")
	}
});

// Commented out because it could be abused, not that the serverList API couldnt be abused anyway
// app.get('/masterList', (req, res) => {
// 	res.setHeader("Content-Type", "application/json").send(JSON.stringify(masterList));
// });

// Filter elements from an object, based on a closure
function filterObject(object, filter) {
	for (const key in object) {
		if (!filter(object[key])) {
			delete object[key];
		}
	}
}

app.get('/serverList', (req, res) => {
	// check if ?filter is present, if so filter servers with other variables like ?uptodate=true or ?version=v1.10.0
	// make the output variable a copy of serverList, not serverList itself, as to not modify the original object
	output = JSON.parse(JSON.stringify(serverList));

	filters = req.query;
	// valid filters, uptodate, outdated, version, dlc
	// valid values for version, v1.10.0, v1.9.9, etc

	// valid values for dlc, 0, 1, 2, 3, 1|2, 1|3, 2|3, 1|2|3
	// uptodate and outdated are just there, but cannot be used together
	// version and dlc can be used together

	// Do the filters
	if (filters.uptodate && filters.outdated) {
		res.status(400).json({
			"error": "Cannot use uptodate and outdated filters together"
		})
		return;
	}
	// If version is present, split by = and check if it's a valid version
	if (filters.version) {
		let versionFilter = filters.version;
		if (!semver.valid(versionFilter) || !versionFilter.startsWith('v')) {
			res.status(400).json({
				"error": "Invalid version"
			})
			return;
		}
		console.log(versionFilter);
		filterObject(output.servers, (server) => server.version === versionFilter);
	}
	// If dlc is present, split by = and check if it's a valid dlc
	if (filters.dlc) {
		let dlcFilter = filters.dlc;
		if (!dlcFilter.match(/^(0|1|2|3|1\|2|1\|3|2\|3|1\|2\|3)$/)) {
			res.status(400).json({
				"error": "Invalid dlc"
			})
			return;
		}
		let DLCNumber = calculateDLCNumber(dlcFilter.split("|")) + "";
		filterObject(output.servers, (server) => server.dlc === DLCNumber);
	}
	// For all filters, remember that output.servers is an object, so .filter wont work
	if (filters.uptodate) {
		filterObject(output.servers, (server) => !server.outdated);
	}
	// If outdated is present, filter out uptodate servers
	if (filters.outdated) {
		filterObject(output.servers, (server) => server.outdated);
	}

	// Return filtered servers
	output.filteredCount = objectLength(output.servers);
	if (output.filteredCount == output.serverCount) delete output.filteredCount;
	res.setHeader("Content-Type", "application/json").send(JSON.stringify(output));
});



app.get('/docs', (req, res) => {
	res.sendFile(__dirname + '/docs.html');
});
app.get('/', (req, res) => {
	// Send list of all endpoints
	res.setHeader("Content-Type", "application/json").send(JSON.stringify({
		"endpoints": [
			"/check?address=IP:PORT",
			"/serverList",
			"/docs"
		],
		"about": {
			"author": "Chris Chrome",
			// Get repo 
			"repo": getGitCommitDetails()
		},
		// Rate limit X requests per Y minutes per IP, as a string
		"rateLimit": `${config.rateLimitMax} requests per ${config.rateLimitWindow} minutes`,
		"debug": {
			// "yourIP" Either the IP of the user, or the IP of the proxy if one is used, proxy IP header is x-real-ip
			"yourIP": req.headers["x-real-ip"] || req.ip,
			"yourUserAgent": req.headers["user-agent"],
		}
	}));
});

// Basic robots.txt, deny all
app.get('/robots.txt', (req, res) => {
	res.send("User-agent: *\nDisallow: /");
});

app.listen(port, () => {
	console.log(`${colors.cyan(`[INFO ${new Date()}]`)} Server started on port ${port}`);
});
