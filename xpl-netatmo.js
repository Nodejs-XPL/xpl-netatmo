/*jslint node: true, vars: true, nomen: true */
'use strict';

var Xpl = require("xpl-api");
var commander = require('commander');
var Netatmo = require("netatmo");
var os = require('os');
var util = require('util');
var async = require('async');
var debug = require('debug')('xpl-netatmo');

commander.version(require("./package.json").version);
commander.option("-u, --username <username>", "Netatmo username");
commander.option("-p, --password <password>", "Netatmo password");
commander.option("--client_id <client_id>", "Netatmo client Id");
commander.option("--client_secret <client_secret>", "Netatmo client secret");
commander.option("-a, --deviceAliases <aliases>", "Devices aliases");

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

            setInterval(updateDatas.bind(xpl, xpl, netatmo, devices,
                commander.deviceAliases), 1000 * 60);
            updateDatas(xpl, netatmo, devices, commander.deviceAliases);

            xpl.on("xpl:xpl-cmnd", function(message) {
              if (message.bodyName !== "sensor.request" ||
                  body.command !== "request") {
                return;
              }

              var modifs = [];

              for ( var deviceKey in devices) {
                for ( var currentKey in devices[deviceKey]) {
                  if (/Date$/.exec(currentKey)) {
                    continue;
                  }

                  modifs.push({
                    device : deviceKey,
                    type : refs[currentKey].name,
                    current : currentValues[currentKey],
                    date : currentValues[currentKey + "Date"].toISOString(),
                    unit : refs[currentKey].unit
                  });
                }
              }

              async.eachSeries(modifs, function(body, callback) {
                xpl.sendXplStat(body, "sensor.basic", callback);

              }, function(error) {
                if (error) {
                  console.error(error);
                }
              });

            });

          });
        });

var refs = {
  Temperature : {
    name : "temp",
    unit : "c"
  },
  CO2 : {
    name : "CO2",
    unit : "ppm"
  },
  Humidity : {
    name : "humidity",
    unit : "%"
  },
  Noise : {
    name : "noise",
    unit : "db"
  },
  Pressure : {
    name : "pressure",
    unit : "mbar"
  },
  AbsolutePressure : {
    name : "absolutePressure",
    unit : "mbar"
  },
  Rain : {
    name : "rain",
    unit : "mm"
  },
  WindAngle : {
    name : "windAngle",
    unit : "°"
  },
  WindStrength : {
    name : "windStrength",
    unit : "km/h"
  },
  GustAngle : {
    name : "gustAngle",
    unit : "°"
  },
  GustStrength : {
    name : "gustStrength",
    unit : "km/h"
  },
  Battery : {
    name : "battery",
    unit : "%"
  }
};

function scanDevice(device, devices, modifs, aliases) {
  var key = device._id;
  if (aliases && aliases[key]) {
    key = aliases[key];
  }

  var currentValues = devices[key];
  if (!currentValues) {
    currentValues = {};
    devices[key] = currentValues;
  }

  var battery = device.battery_vp;
  if (battery) {
    var min = -1;
    var max = 6000;
    switch (device.type) {
    case "NAMain":
    case "NAModule4":
    case "NAPlug":
    case "NATherm1":
      min = 4200;
      break;
    case "NAModule1":
    case "NAModule3":
      min = 3600;
      break;
    case "NAModule2":
      min = 3950;
      break;
    }

    if (min >= 0) {
      var b = ((battery - min) / (max - min));

      b = Math.floor(b * 100);
      if (currentValues.Battery !== b) {
        currentValues.Battery = b;
        currentValues.BatteryDate = new Date();

        modifs.push({
          device : key,
          type : "battery",
          current : b,
          unit : '%',
          date : currentValues.BatteryDate.toISOString()
        });
      }
    }
  }

  var dd = device.dashboard_data;
  device.data_type.forEach(function(dt) {
    if (!refs[dt]) {
      return;
    }

    var date = new Date(dd.time_utc * 1000);

    if (!dd[dt] || currentValues[dt] === dd[dt]) {
      return;
    }

    currentValues[dt] = dd[dt];
    currentValues[dt + "Date"] = date;

    modifs.push({
      device : key,
      type : refs[dt].name,
      current : currentValues[dt],
      unit : refs[dt].unit,
      date : currentValues[dt + "Date"].toISOString()
    });
  });

}

function updateDatas(xpl, netatmo, devices, aliases, callback) {
  if (!callback) {
    callback = function(error) {
      if (error) {
        console.error(error);
      }
    }
  }
  netatmo.getStationsData(function(error, list) {
    if (error) {
      console.error(error);
      return;
    }

    if (false && debug.enabled) {
      debug("devices=" + util.inspect(list, {
        depth : null
      }));
    }

    var modifs = [];

    list.devices.forEach(function(device) {

      scanDevice(device, devices, modifs, aliases);

      if (device.modules) {
        device.modules.forEach(function(mod) {
          scanDevice(mod, devices, modifs, aliases);
        });
      }
    });

    if (!modifs.length) {
      return callback();
    }

    debug("Send modifs", modifs);

    async.eachSeries(modifs, function(body, callback) {
      xpl.sendXplStat(body, "sensor.basic", callback);
    }, callback);
  });
}

commander.parse(process.argv);

if (commander.heapDump) {
  var heapdump = require("heapdump");
  console.log("***** HEAPDUMP enabled **************");
}
