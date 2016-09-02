#!/usr/bin/env node
'use strict';

// dig -p 53 @ns1.redirect-www.org aj.daplie.me A

var PromiseA = require('bluebird');
var Oauth3 = require('oauth3-cli');
var Domains = require('daplie-domains').create({
  Oauth3: Oauth3
, PromiseA: PromiseA
//, tldsCacheDir: '/tmp'
}).Domains;
require('daplie-dns').create({
  Domains: Domains
, Oauth3: Oauth3
, PromiseA: PromiseA
});

var cli = require('cli');
var hri = require('human-readable-ids').hri;
var freedomain = 'daplie.me';

var path = require('path');
var configPath = path.join(require('homedir')(), '.ddnsrc.json');

cli.parse({
  agree: [ false, "You agree to use Daplie DNS for good, not evil. You will not try to break stuff, hurt people, etc (we will notify you via email when more official legal terms become available on our website).", 'boolean', false ]
  //agree: [ false, 'Agree to the Daplie DNS terms of service. They are very friendly and available at https://daplie.com/dns#terms', 'boolean', false ]
, answer: [ 'a', 'The answer', 'string' ]
, cacert: [ false, 'specify a CA for "self-signed" https certificates', 'string' ]
, config: [ false, 'path to config file', 'string', configPath ]
, device: [ false, '(i.e. jobberwocky) use this if you have multiple devices that will all respond to this domain (i.e. dns round-robin)', 'string' ]
, email: [ false, 'we will keep your email safe and use it contact you when authenticated domain registration is available', 'email' ]
, oauth3: [ false, 'oauth3 ddns server to use for token (defaults to oauth3.org)', 'string', 'oauth3.org' ]
, hostname: [ 'h', "Pick your own subdomain of '" + freedomain + "' (note that unregistered domains can be claimed by anyone)", 'string' ]
, pathname: [ false, 'The api route to which to POST i.e. /api/ddns', 'string', '/api/com.daplie.dns/ddns' ]
, port: [ false, 'The port (default https/443)', 'number', 443 ]
, priority: [ 'p', 'The priority (for MX and other records)', 'string' ]
, random: [ false, "get a randomly assigned hostname such as 'rubber-duck-42." + freedomain + "'", 'boolean' ]
, services: [ 's', 'The service to use for updates i.e. ns1.example.org,ns2.example.org', 'string' ]
, token: [ false, 'Token', 'string' ]
, type: [ 't', 'The record type i.e. A, AAAA, MX, CNAME, ANAME, FWD, etc', 'string', 'A' ]
});

function oauth3ify(opts) {
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
          if (!/\w{4}-\w{4}-\w{4}/.test(str)) {
            return PromiseA.reject(new Error("[X] That doesn't look like an authorization code."));
          }

          return PromiseA.resolve();
        }
      }).then(function (obj) {
        state.otpCode = obj.input;
      });
    }
  /*
  , readProviderUrl: function () {
    }
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
  var oauth3 = Oauth3.create({ providerUrl: opts.oauth3, CLI: CLI });
  var login = {
    username: opts.email
  , usertype: 'email'
  };

  Oauth3.checkSession(oauth3, login).then(function () {
    if (!oauth3.session) {
      oauth3.requestOtp = true;
      return Oauth3.authenticate(oauth3);
    }
    return;
  });
}

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

  options.services = (cli.services||cli.service||'').split(',').filter(function (s) { return s; });
  if (!options.services.length) {
    options.services = rc.services || [];
  }

  if (!options.services.length) {
    options.services = [ 'ns1.redirect-www.org', 'ns2.redirect-www.org' ];
  }

  // XXX get le certs for ns1, ns2
  if ('ns1.redirect-www.org,ns2.redirect-www.org' === options.services.join(',')) {
    options.cacert = false;
  }

  options.email = options.email || rc.email;
  if (!cli.token && !rc.token) {
    oauth3ify(args, cli, rc);
  }
  else {
    require('../lib/raw').set(rc, options, cli);
  }
});
