/* Checks to see if the network is up (Checks DNS and then HTTP).
 * Should it fail, logs to sqlite3 database.
 *
 * On each run, it checks to see if there are any entries in the DB that haven't been processed,
 * and sends a push notification via Boxcar or Push.co to my mobile device.
 */

 // Dependencies
var dns = require('dns');
var sqlite3 = require('sqlite3').verbose();
var http = require('http');
var boxcar = require('boxcar');
var provider = new boxcar.Provider('YOUR_BOXCAR_KEY_HERE', 'YOUR_BOXCAR_SECRET_HERE');

// Database
var db;

// HTTP Options
var httpOptions = {
	host: "www.google.com",
	path: "/"
};

function openDb() {
    db = new sqlite3.Database('comcast_check.sqlite3', createTable);
}

function createTable() {
    db.run("CREATE TABLE IF NOT EXISTS downtimes (date DATETIME, info TEXT, type TEXT, pushed INTEGER)");
}

function saveDowntime(date,info,type) {
    console.info("Writing to DB.");
    db.run("INSERT INTO downtimes (date, info, type, pushed) VALUES (?,?,?,0)", [date, info, type]);
}

function closeDb() {
	console.info("Closing DB.")
    db.close();
}

function checkHttp(callback) {
	var request = http.request(httpOptions, function(req) {
    	console.log("HTTP is good.");
    	callback.call();
	});
    request.on("error", function(err) {
    	saveDowntime(new Date(), "Unable to access " + httpOptions.host, "HTTP");
    });
    request.end();
}

function checkDb() {
	db.all("SELECT rowid AS id, date as theDate, type as theType FROM downtimes WHERE pushed=0", function(err, rows) {
		if (rows.length > 1) {
			var dns_issues = 0;
			var http_issues = 0;
			rows.forEach(function(row) {
				if (row.theType == "DNS") dns_issues++;
				if (row.theType == "HTTP") http_issues++;
			});
			var firstDate = new Date(parseFloat(rows[0].theDate)).toLocaleString();
			var lastDate = new Date(parseFloat(rows[rows.length-1].theDate)).toLocaleString();

			var msg = "There were " + rows.length + " instances of network unavailability from " +
				 firstDate + " to " + lastDate + "\n\nDNS: " + dns_issues + "\nHTTP: " + http_issues;

			console.log("Pushing multiple downtimes to Boxcar.");
			provider.broadcast(msg, "Comcast Check");
		}
		else if (rows.length == 1) {
			var date = new Date(parseFloat(rows[0].theDate)).toLocaleString();
			console.log("Pushing one downtime to Boxcar.");
			provider.broadcast("There was an instance of " + rows[0].theType + " network unavailability at " + date, "Comcast Check");
		}
		else {
			console.log("No downtime found, not pushing to Boxcar.");
			return;
		}
		db.run("UPDATE downtimes SET pushed=1 WHERE pushed=0");
    });
}

openDb();

// Resolve Google.com
dns.resolve(httpOptions.host, function(err) {
	if (err) {
    	console.log("Not connected. Logging to DB...");
		saveDowntime(new Date(), "DNS failure", "DNS");
	}
	else {
		console.log("DNS is good, checking HTTP.");
		checkHttp(checkDb);

	}
});



