/*jslint node: true, vars: true, nomen: true */
'use strict';

var Xpl = require("xpl-api");
var commander = require('commander');
var Netatmo = require("netatmo");
var os = require('os');
var util = require('util');

commander.version(require("./package.json").version);
commander.option("-u, --username <username>", "Netatmo username");
commander.option("-p, --password <password>", "Netatmo password");
commander.option("--client_id <client_id>", "Netatmo client Id");
commander.option("--client_secret <client_secret>", "Netatmo client secret");
Xpl.fillCommander(commander);

commander.option("--heapDump", "Enable heap dump (require heapdump)");

commander.command('start').description("Start processing Netatmo datas")
    .action(
        function() {
          console.log("Start");

          commander.deviceAliases = Xpl
              .loadDeviceAliases(commander.deviceAliases);

          if (!commander.xplSource) {
            var hostName = os.hostname();
            if (hostName.indexOf('.') > 0) {
              hostName = hostName.substring(0, hostName.indexOf('.'));
            }

            commander.xplSource = "netatmo." + hostName;
          }

          var xpl = new Xpl(commander);

          xpl.on("error", function(error) {
            console.log("XPL error", error);
          });

          xpl.bind(function(error) {
            if (error) {
              console.log("Can not open xpl bridge ", error);
              process.exit(2);
              return;
            }

            console.log("Xpl bind succeed ");

            var devices = {};

            var netatmo = new Netatmo(commander);

            setInterval(updateDatas.bind(xpl, xpl, netatmo, devices),
                1000 * 60 * 10);
            updateDatas(xpl, netatmo, devices);
          });
        });

function updateDatas(xpl, netatmo, devices) {
  netatmo.getStationsData(function(error, list) {
    if (error) {
      console.error(error);
      return;
    }

    console.log("devices=" + util.inspect(list, {
      depth : null
    }));
  });
}

commander.parse(process.argv);

if (commander.heapDump) {
  var heapdump = require("heapdump");
  console.log("***** HEAPDUMP enabled **************");
}
