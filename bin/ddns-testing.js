#!/usr/bin/env node
'use strict';

// dig -p 53 @redirect-www.org pi.nadal.daplie.com A
var fs = require('fs');
var path = require('path');
var cli = require('cli');
var hri = require('human-readable-ids').hri;
var ddns = require('../lib/ddns-client.js');
var configPath = path.join(require('os').homedir(), '.ddnsrc-testing.json');
var testingTokenPath = path.join(__dirname, '..', 'tests', 'testing.letssecure.org.jwt');
var config = {};

try {
  config = require(configPath);
} catch(e) {

}

cli.parse({
  service: [ 's', 'The service to use for updates i.e. ns1.example.org', 'string' ]
, hostname: [ 'h', "Pick your own subdomain of 'testing.letssecure.org' (anyone can overwrite this)", 'string', config.hostname ]
, pathname: [ false, 'The api route to which to POST i.e. /api/ddns', 'string', '/api/com.daplie.dns/ddns' ]
, device: [ false, '(i.e. jobberwocky) use this if you have multiple devices that will all respond to this domain (i.e. dns round-robin)', 'string' ]
, type: [ 't', 'The record type i.e. A, AAAA, MX, CNAME, ANAME, FWD, etc', 'string', 'A' ]
, priority: [ 'p', 'The priority (for MX and other records)', 'string' ]
, port: [ false, 'The port (default https/443)', 'number', 443 ]
, insecure: [ false, '(deprecated) allow insecure non-https connections', 'boolean' ]
, cacert: [ false, 'specify a CA for "self-signed" https certificates', 'string' ]
, answer: [ 'a', 'The answer', 'string' ]
, token: [ false, 'Token', 'string', testingTokenPath ]
, config: [ false, 'path to config file', 'string', configPath ]
});

cli.main(function (args, opts) {
  var options = {};
  var answers;

  if (configPath !== opts.config) {
    config = require(configPath);
  }

  config.token = (config.token || fs.readFileSync(testingTokenPath, 'ascii') || '').trim();
  config.hostname = config.hostname || (hri.random() + '.testing.letssecure.org');

  // XXX get le certs for ns1, ns2
  if (null === opts.insecure) {
    opts.insecure = true;
  }

  Object.keys(opts).forEach(function (key) {
    options[key] = opts[key];
  });

  if (!opts.hostname) {
    options.hostname = args[0] || config.hostname;
    args.splice(0, 1);
  }

  if (!opts.service) {
    options.services = config.services || ['ns1.redirect-www.org', 'ns2.redirect-www.org'];
  } else {
    options.services = [opts.service].filter(function (s) { return s; });
  }

  if (options.insecure) {
    //console.error('--insecure is not supported. You must use secure connections.');
    //return;
    options.cacert = false;
  }

  // TODO read services and token from config
  // if (!fs.existsSync('~/.node-ddns')) {
  //   console.error('You must login first: ddns login');
  //   // TODO prompt email, password, one-time
  //   // TODO npm install --save qrcode-terminal
  //   return;
  // }

  if (!options.hostname || !options.services.length || !options.token) {
    console.error('Usage: ddns <HOSTNAME> -a <ANSWER> --token <STRING_OR_FILENAME> <NAMESERVER_1> [NAMESERVER_2] [...]');
    console.error('Example: ddns example.com -a 127.0.0.1 --token token.txt ns1.redirect-www.org ns2.redirect-www.org');
    console.error('\nNote: if you omit ANSWER, it is assumed that the dyndns service will use the request ip');
    console.error('You may also wish to use an external service, such as $(curl https://api.ipify.org)');
    return;
  }

  if (options.token) {
    try {
      options.token = require('fs').readFileSync(options.token, 'ascii').trim();
    } catch(e) {
      if (options.token.length < 384) {
        console.error("Could not read token file '" + options.token + "'");
        return;
      }
    }
  }

  answers = [
    { "name": options.hostname
    , "value": options.answer
    , "type": options.type
    , "priority": options.priority
    , "token": options.token // device should go here?
    , "ttl": options.ttl || undefined
    , "device": options.device || undefined
    }
  ];

  return ddns.update({
    servers: options.services
  , port: options.port
  , cacert: options.cacert
  , pathname: options.pathname || '/api/com.daplie.dns/ddns' // TODO dns -> ddns ?
  , token: options.token
  , ddns: answers
  }).then(function (data) {
    var line;

    if (!data.every(function (records) {
      return Array.isArray(records) && records.every(function (r) {
        return r && r.value;
      });
    })) {
      console.error('[Error DDNS]:');
      console.error(data);
      return;
    }

    if (!Array.isArray(data)) {
      console.error('[Error] unexpected data');
      console.error(JSON.stringify(data, null, '  '));
      return;
    }

    line = 'Hostname: ' + options.hostname;
    console.log('');
    console.log(line.replace(/./g, '-'));
    console.log(line);
    // TODO fix weird double array bug
    console.log('IP Address: ' + data[0][0].value);
    console.log(line.replace(/./g, '-'));
    console.log("config saved to '" + configPath + "'");
    console.log('\n');
    console.log('Test with');
    console.log('dig ' + options.hostname + ' ' + (options.type || ''));
    console.log('\n');
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, '  '), 'ascii');
    } catch(e) {
      // ignore
      console.warn("Could not write configuration file '" + configPath + "'");
    }
  }, function (err) {
    console.error('[Error] ddns-cli:');
    console.error(err.stack);
    console.error(err.data);
  });
});
