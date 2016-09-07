'use strict';

var PromiseA = require('bluebird');
var Oauth3 = require('oauth3-cli');
var DDNS = module.exports;

DDNS.notRegistered = function (err, options) {
  var info = err.info;
  var fullSld = info.sld && (info.sld + '.' + info.tld) || undefined;
  var valid = info.valid;
  var available = info.available;
  var msg;

  // complementary domain
  if (available && valid && 0 === info.amount) {
    console.warn("");
    console.warn("'" + fullSld + "' is not registered to this account.");
    console.warn("You can claim it by adding --agree-tos and --email EMAIL"
      .replace(/EMAIL/, options.email || '<<your email>>'));
    console.warn("");

    return PromiseA.reject(err);
  }

  msg = "'"
    + (fullSld || options.name)
    + "' is not registered to this account, but "
    ;

  if (available) {
    msg += "it is available for purchase for $" + Math.ceil(info.amount / 100).toFixed(2);
  }
  else if (valid) {
    msg += "if you already own it you can transfer it for $" + Math.ceil(info.amount / 100).toFixed(2);
  }
  else {
    msg += "it appears to be an invalid domain";
  }

  if (available || valid) {
    msg += "\n\nHere's how to get it:"
      + "\n"
      + "\n\t# Install Daplie Tools from npm"
      + "\n\tnpm install --global daplie-tools"
      + "\n\t"
      + "\n\t# Purchase the domain (requires credit card)"
      + "\n\tdaplie domains:search --domains " + fullSld
      + "\n"
      ;
  }

  console.warn("");
  console.warn(msg);
  console.warn("");

  return PromiseA.reject(err);
};

DDNS.update = function (options, cli) {
  function log() {
    if (options.debug || cli.debug) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[ddns.js]');
      console.log.apply(console, args);
    }
  }

  //var CLI2 = require('oauth3-cli/lib/cli.js');
  var Domains = require('daplie-domains').create({
    Oauth3: Oauth3
  , PromiseA: PromiseA
  //, CLI: CLI2
  //, tldsCacheDir: '/tmp'
  }).Domains;
  require('daplie-dns').create({
    Domains: Domains
  , Oauth3: Oauth3
  , PromiseA: PromiseA
  });
  var form = require('./cli').create(process.stdin, process.stdout);
  var CLI = {
    init: function (/*rs, ws, state, options*/) {
      // noop
    }
  , readCredentialIdAsync: function (state) {
      // state = { ws, username }
      form.ask("Enter your email address: ", form.inputs.email).then(function (obj) {
        // TODO auto-clear line below
        //ws.cursorTo(0);
        form.ws.clearLine(); // person just hit enter, they are on the next line
        state.username = obj.input;
      });
    }
  , readCredentialOtpAsync: function (state) {
      form.ws.write('\n');
      form.ws.write('Check your email. You should receive an authorization code.\n');
      return form.ask("Enter your auth code: ", {
        onReturnAsync: function (rrs, ws, str) {
          if (!/[\w-]{4,}/.test(str)) {
            return PromiseA.reject(new Error("[X] That doesn't look like an authorization code."));
          }

          return PromiseA.resolve();
        }
      }).then(function (obj) {
        state.otpCode = obj.input;
      });
    }
  , readProviderUrl: function (state) {
      return form.ask("Enter your ddns provider: ", form.inputs.url).then(function (obj) {
        state.providerUrl = obj.input;
      });
    }
  /*
  , readTotpToken: function () {
    }
  , printQr: function () {
    }
  , verifyQr: function () {
    }
  , readCredentialSecret: function () {
    }
  , readNewCredentialSecret: function () {
    }
  */
  };
  var oauth3 = Oauth3.create({
    device: { hostname: options.device }
  , providerUrl: options.oauth3
  , CLI: CLI

  , debug: cli.debug
  });
  var login = {
    username: options.email
  , usertype: 'email'
  , refreshToken: options.refreshToken
  };
  // TODO detect type by answer/value
  var type = (options.type||'A').toUpperCase();

  function setRecord() {
    log('setRecord');

    var priority = '';
    var p;

    if (options.device) {
      return PromiseA.reject(new Error("devices can only be set to A and AAAA records"));
    }
    if (!options.name) {
      return PromiseA.reject(new Error("must have a name for which to set records"));
    }

    options.ttl = options.ttl || 600;
    if ('MX' === type) {
      options.priority = options.priority || 10;
      priority = ' ' + options.priority;
    }
    var params = {
      domainname: options.name
    , type: type
    , value: options.value
    , ttl: options.ttl || 600
    , priority: 'MX' === type && options.priority || undefined
    };

    if (cli.remove) {
      params.confirm = true;
      p = Oauth3.Dns.destroy(oauth3, params);
    }
    else {
      p = Oauth3.Dns.set(oauth3, params);
    }

    return p.then(function () {
      console.info('');
      if (cli.remove) {
        console.info('Record set:');
      }
      else {
        console.info('Record removed:');
      }
      console.info('');
      console.info(
       '\t' +  options.name
      + " \t" + type + priority
      + " \"" + options.value + "\""
      + " ttl " + options.ttl
      );
      console.info('');
      console.info('Test it:');
      console.info('');
      console.info("\tdig " + type + " " + options.name);
      console.info('');
    });
  }

  function setDevice() {
    log('setDevice');

    var device = options.device = oauth3.device.hostname;
    var addresses = options.value/*.split(',').filter(Boolean)*/ || undefined;

    if (-1 === [ 'A', 'AAAA' ].indexOf(type)) {
      return PromiseA.reject("only A, AAAA records supported right now");
    }

    // list devices
    // TODO list by device with Dns.all() or list by domain with Devices.all()
    var allDomains = {};
    var domainRecords = [];
    return Oauth3.Dns.all(oauth3).then(function (records) {
      var isAttached;
      var allDevices = {};
      var deviceMap = {};
      var domainMap = {};

      records = records.records || records;

      records.forEach(function (record) {
        if (!allDomains[record.name]) {
          allDomains[record.name] = {};
        }
        allDomains[record.name][record.device + record.type] = record;

        if (!allDevices[record.device + record.type]) {
          allDevices[record.device + record.type] = {};
        }
        allDevices[record.device + record.type][record.name] = record.device;
      });

      Object.keys(allDomains).forEach(function (recordname) {
        allDomains[recordname] = Object.keys(allDomains[recordname]).map(function (devicenametype) {
          var r = allDomains[recordname][devicenametype];
          return r.device + ' (' + r.value + ')';
        });
      });
      Object.keys(allDevices).forEach(function (recordname) {
        allDevices[recordname] = Object.keys(allDevices[recordname]);
      });

      records.forEach(function (record) {
        if (record.device === device) {
          domainMap[record.name] = true;
          domainRecords.push(record);
        }

        if (record.name !== options.name) {
          return;
        }

        if (record.device === device) {
          isAttached = true;
          return;
        }

        deviceMap[record.device] = true;
      });

      if (options.name && !domainMap[options.name]) {
        domainRecords.push({
          name: options.name
        });
      }

      // TODO detect ipv4,ipv6, invalid
      return Oauth3.Devices.set(oauth3, {
        devicename: device
      , addresses: addresses
      }).then(function () {
        if (!options.name || isAttached) {
          return;
        }

        return Oauth3.Devices.attach(oauth3, {
          devicename: device
        , domainname: options.name
        }).then(function () {
          // update
          if (!options.name || options.multi) {
            return;
          }

          return PromiseA.all(Object.keys(deviceMap).map(function (devicename) {
            return Oauth3.Devices.detach(oauth3, {
              devicename: devicename
            , domainname: options.name
            });
          }));
        });
      });
    }).then(function () {
      return Oauth3.Devices.token(oauth3, {
        devicename: device
      }).then(function (result) {
        console.info('');
        console.info("Updated device '" + device + "' with address '" + addresses + "'");
        console.info('');
        //console.info(deviceMap);
        //console.info(domainMap);
        //console.info(domainRecords);
        console.info("Affected domains:\n\n" + domainRecords.map(function (d) {
          return '\t' + d.name + ' - ' + allDomains[d.name].join(', ') + '\n';
        }).join(''));
        console.info('');
        console.info("You can also update this device from routers that support DDNS URLs:");
        console.info('');
        console.info('https://oauth3.org/api/com.daplie.domains/ddns?token=' + result.token);
        console.info('');
        console.info('You only need one url per device. All domains attached to this device will be updated');
        console.info('with the source ip address whenever the device ip address is updated.');
        console.info('');
      });
    });
  }


  return Oauth3.checkSession(oauth3, login).then(function () {
    log('checkSession complete');
    if (!oauth3.session) {
      oauth3.requestOtp = true;
      return Oauth3.authenticate(oauth3).then(function () {
        log('refresh_token:');
        log(oauth3.session.refreshToken);
      });
    }
    return;
  }).then(function () {

    // TODO read in hostname
    //var hostname = options.name;
    return Oauth3.Domains.all(oauth3).then(function (results) {
      var names = results.map(function (r) {
        return r.domain;
      }).sort(function (a, b) {
        return b.length - a.length;
      });

      if (!names.some(function (domain) {
        if ((new RegExp(domain.replace(/\./, '\\.') + '$')).test(options.name)) {
          return true;
        }
      })) {
        return Oauth3.Domains.search(oauth3, {
          domainname: options.name
        }).then(function (result) {
          var info = result && result[0] || { sld: '', tld: '' };
          var fullSld = info.sld && (info.sld + '.' + info.tld) || undefined;
          var valid = info.valid;
          var available = info.available;

          if (available && valid && 0 === info.amount) {
            if (cli.email && cli.agreeTos) {
              return Oauth3.Domains.register(oauth3, {
                domains: [ { name: fullSld } ]
              });
            }
          }

          var err = new Error("domain not registered to account");
          err.code = "E_NOT_REGISTERED";
          err.info = info;

          return PromiseA.reject(err);
        });
      }
    }).then(function () {
      var p;

      // Set Device
      if (type && -1 === ['A', 'AAAA'].indexOf(type)) {
        return setRecord();
      }

      if (options.value) {
        p = PromiseA.resolve(options.value);
      }
      else {
        p = PromiseA.promisify(require('ipify'))();
      }

      return p.then(function (ip) {
        options.value = ip;
        return setDevice();
      });
    });
  });
};

DDNS.run = function (options, cli/*, rc*/) {
  return DDNS.update(options, cli).then(function () {}, function (err) {
    if ("E_NOT_REGISTERED" === err.code) {
      DDNS.notRegistered(err, options, cli).then(function () {}, function () {});
      return;
    }

    console.error();
    console.error();
    console.error(err.message);
    console.error(err.stack.split('\n').slice(0, 4).join('\n'));
    console.error();
  });
};
