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

cli.main(function (args, cli) {
  var options = {};
  var rc = {};

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
    require('../lib/ddns').run(args, options, cli, rc);
  }
  else {
    require('../lib/raw').set(rc, options, cli);
  }
});
