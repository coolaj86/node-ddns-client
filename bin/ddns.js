#!/usr/bin/env node
'use strict';

// dig -p 53 @ns1.redirect-www.org aj.daplie.me A

var PromiseA = require('bluebird');

var cli = require('cli');
var hri = require('human-readable-ids').hri;
var freedomain = 'daplie.me';

var path = require('path');
var configPath = path.join(require('homedir')(), '.ddnsrc.json');


cli.parse({
  agree: [ false, "You agree to use Daplie DNS for good, not evil. You will not try to break stuff, hurt people, etc (we will notify you via email when more official legal terms become available on our website).", 'boolean', false ]
  //agree: [ false, 'Agree to the Daplie DNS terms of service. They are very friendly and available at https://daplie.com/dns#terms', 'boolean', false ]
, config: [ false, 'path to config file', 'string', configPath ]
, device: [ false, "name of device or server to update. Multiple devices may be set to a single domain. Defaults to os.hostname (i.e. rpi.local)", 'string' ]
, email: [ false, 'we will keep your email safe and use it contact you when authenticated domain registration is available', 'email' ]
, oauth3: [ false, 'oauth3 ddns server to use for token (defaults to oauth3.org)', 'string', 'oauth3.org' ]
, multi: [ 'm', "Add multiple devices on a single domain", 'boolean' ]


, hostname: [ 'h', "the domain to update - either of those you own or a subdomain of '" + freedomain + "'", 'string' ]
, answer: [ 'a', 'the value of the dns record - such as ip address, CNAME, text, etc', 'string' ]
, priority: [ 'p', 'The priority (for MX and other records)', 'string' ]
, type: [ 't', 'The record type i.e. A, AAAA, MX, CNAME, ANAME, FWD, etc', 'string', 'A' ]
, random: [ false, "get a randomly assigned hostname such as 'rubber-duck-42." + freedomain + "'", 'boolean' ]


, pathname: [ false, 'The api route to which to POST i.e. /api/ddns', 'string', '/api/com.daplie.dns/ddns' ]
, port: [ false, 'The port (default https/443)', 'number', 443 ]
, services: [ 's', 'The service to use for updates i.e. ns1.example.org,ns2.example.org', 'string' ]
, token: [ false, 'Token', 'string' ]


, debug: [ false, 'print extra debug statements', 'boolean' ]
});

function oauth3ify(args, options, cli/*, rc*/) {
  var Oauth3 = require('oauth3-cli');
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
    device: { hostname: (options.device || cli.device) }
  , providerUrl: options.oauth3 || cli.oauth3
  , CLI: CLI

  , debug: cli.debug
  });
  var login = {
    username: options.email || cli.email
  , usertype: 'email'
  };
  var type = (options.type||cli.type||'A').toUpperCase();


  function setRecord() {
    if (options.device) {
      return PromiseA.reject(new Error("devices can only be set to A and AAAA records"));
    }

    return oauth3.Dns.set(oauth3, {
      domainname: options.hostname
    , priority: options.priority
    , ttl: options.ttl || 600
    , type: type
    , value: options.answer
    });
  }

  function setDevice() {
    var device = options.device = oauth3.device.hostname;
    var addresses = options.answer/*.split(',').filter(Boolean)*/ || undefined;

    if (-1 === [ 'A', 'AAAA' ].indexOf(type)) {
      return PromiseA.reject("only A, AAAA records supported right now");
    }

    // list devices
    // TODO list by device with Dns.all() or list by domain with Devices.all()
    return Oauth3.Dns.all(oauth3).then(function (records) {
      var isAttached;
      var allDomains = {};
      var allDevices = {};
      var deviceMap = {};
      var domainMap = {};
      var domainRecords = [];

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

        if (record.name !== options.hostname) {
          return;
        }

        if (record.device === device) {
          isAttached = true;
          return;
        }

        deviceMap[record.device] = true;
      });

      if (options.hostname && !domainMap[options.hostname]) {
        domainRecords.push({
          name: options.hostname
        });
      }

      // TODO detect ipv4,ipv6, invalid
      return Oauth3.Devices.set(oauth3, {
        devicename: device
      , addresses: addresses
      }).then(function () {
        if (isAttached) {
          return;
        }

        return Oauth3.Devices.attach(oauth3, {
          devicename: device
        , domainname: options.hostname || cli.hostname
        });
      }).then(function () {
        // update
        if (options.multi) {
          return;
        }

        return PromiseA.all(Object.keys(deviceMap).map(function (devicename) {
          return Oauth3.Devices.detach(oauth3, {
            devicename: devicename
          , domainname: options.hostname
          });
        }));
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
    });
  }


  return Oauth3.checkSession(oauth3, login).then(function () {
    if (!oauth3.session) {
      oauth3.requestOtp = true;
      return Oauth3.authenticate(oauth3);
    }
    return;
  }).then(function () {

    // TODO read in hostname
    //var hostname = options.hostname;
    return Oauth3.Domains.all(oauth3).then(function (results) {
      var names = results.map(function (r) {
        return r.domain;
      }).sort(function (a, b) {
        return b.length - a.length;
      });

      if (!names.some(function (domain) {
        if ((new RegExp(domain.replace(/\./, '\\.') + '$')).test(options.hostname)) {
          return true;
        }
      })) {
        return Oauth3.Domains.search(oauth3, {
          domainname: options.hostname
        }).then(function (result) {
          var info = result && result[0] || {};
          var valid = info.valid;
          var available = info.available;
          var msg = "'"
            + ((result && (info.sld + "." + info.tld)) || options.hostname)
            + "' is not registered to this account, but ";

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
              + "\n\tdaplie domains:search --domains " + info.sld + '.' + info.tld
              + "\n"
              ;
          }
          return PromiseA.reject(new Error(msg));
        });
      }
    }).then(function () {
      // Set Device
      if (!type || -1 !== ['A', 'AAAA'].indexOf(type)) {
        return setDevice();
      }
      else {
        return setRecord();
      }
    });
  }).then(function () {}, function (err) {
    console.error();
    console.error();
    console.error(err.message);
    console.error();
  });
}

cli.main(function (args, cli) {
  var options = {};
  var rc = {};
  var p;

  try {
    rc = require(cli.config || configPath);
  } catch(e) {
    if (!cli.config) {
      console.error("Config file '" + configPath + "' could not be parsed.");
      return;
    }
  }
  rc.freedomain = rc.freedomain || freedomain;
  rc.configPath = cli.config || rc.configPath || configPath;

  Object.keys(cli).forEach(function (key) {
    options[key] = cli[key];
  });

  if (!cli.hostname) {
    cli.hostname = args[0];
    args.splice(0, 1);
  }
  if (cli.hostname && cli.random) {
    console.error("You may specify --hostname 'somedomain.example.com' or --random, but not both");
    return;
  }
  if (!(cli.hostname || cli.random || rc.hostname)) {
    console.error("You must specify either --hostname 'somedomain.example.com' or --random");
    return;
  }
  if (cli.random) {
    if (rc.hostname) {
      console.error("[error] cannot use --random because you already have a domain in '" + configPath + "'");
      return;
    }
  }
  options.hostname = cli.hostname || rc.hostname || hri.random();

  if (!/\./.test(options.hostname)) {
    options.hostname += '.' + freedomain.replace(/^\*/, '').replace(/^\./, '');
  }

  options.email = options.email || rc.email;
  if (!cli.raw) {
    // !cli.token && !rc.token
    options.answer = options.answer || cli.answer;
    if (options.answer) {
      p = PromiseA.resolve(options.answer);
    }
    else {
      p = PromiseA.promisify(require('ipify'))();
    }
    p.then(function (ip) {
      options.answer = ip;
      oauth3ify(args, options, cli, rc);
    });
  }
  else {
    require('../lib/raw').set(rc, options, cli);
  }
});
