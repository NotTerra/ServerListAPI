const Steam = require("steam-server-query")
const colors = require("colors");
const fs = require('fs');

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
	return {"version": data[0], dlcString, dlc: data[1] ,"tps": data[2]}
};

const latestVer ="v1.6.7"

// Check version and set console log color if outdated
function checkVersion(version) {
	if (version == latestVer) {
		return colors.green(version)
	} else {
		return colors.red(version)
	}
};

// Color Server TPS
function colorTPS(tps) {
	if (tps < 45) {
		return colors.red(tps)
	} else if (tps > 40 && tps < 60) {
		return colors.yellow(tps)
	} else if (tps > 65) {
		return colors.magenta(tps)
	} else {
		return colors.green(tps)
	}
};

Steam.queryMasterServer('hl2master.steampowered.com:27011', Steam.REGIONS.ALL, {
	appid: 573090,
	game: "Stormworks",
}, 1000, 400).then(servers => {
	servers = removeDuplicates(servers);
	for (let i = 0; i < servers.length; i++) {
		Steam.queryGameServerInfo(servers[i]).then(data => {
			if(!data.name.includes("SetSail")) return;
			// console.log(data); //Debug

			data.keywords.split("-")
			console.log(`${data.name} @ ${servers[i]} - DLC: ${splitKeyword(data.keywords).dlcString} - TPS: ${colorTPS(splitKeyword(data.keywords).tps)} - Version: ${checkVersion(splitKeyword(data.keywords).version)}`)
			servers.push(data);
		}).catch(err => {
			console.log(`Couldn't connect to ${servers[i]}`);
		});
	}
	//sortServers();
}).catch((err) => {});

function sortServers() {
	servers.forEach(server => {
		Steam.queryGameServerInfo
	});
}

