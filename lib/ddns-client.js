#!/usr/bin/env node
'use strict';

var PromiseA = require('bluebird').Promise;
var https = require('https');
var fs = PromiseA.promisifyAll(require('fs'));

module.exports.update = function (opts) {
  if (!Array.isArray(opts.servers) && opts.updaters.length) {
    throw new Error('Please specify a DDNS host as opts.servers');
  }

  var servers = opts.servers.slice();
  var results = [];

  function update(server) {
    return new PromiseA(function (resolve, reject) {
      var options;
      var hostname = server;
      var port = opts.port;
      var pathname = opts.pathname;
      var req;

      if (!hostname) {
        throw new Error('Please specify a DDNS host as opts.hostname');
      }
      if (!pathname) {
        throw new Error('Please specify the api route as opts.pathname');
      }

      options = {
        host: hostname
      , port: port || 443
      , method: 'POST'
      , headers: {
          'Content-Type': 'application/json'
        }
      , path: pathname
      //, auth: opts.auth || 'admin:secret'
      };

      if (opts.cacert) {
        if (!Array.isArray(opts.cacert)) {
          opts.cacert = [opts.cacert];
        }
        options.ca = opts.cacert;
      }

      if (opts.token || opts.jwt) {
        options.headers.Authorization = 'Bearer ' + (opts.token || opts.jwt);
      }

      if (false === opts.cacert) {
        options.rejectUnauthorized = false;
      }

      options.ca = (options.ca||[]).map(function (str) {
        if ('string' === typeof str && str.length < 1000) {
          str = fs.readFileAsync(str);
        }
        return str;
      });

      return PromiseA.all(options.ca).then(function (cas) {
        options.ca = cas;
        options.agent = new https.Agent(options);

        req = https.request(options, function(res) {
          var textData = '';

          res.on('error', function (err) {
            reject(err);
          });
          res.on('data', function (chunk) {
            textData += chunk.toString();
            // console.log(chunk.toString());
          });
          res.on('end', function () {
            var err;
            try {
              resolve(JSON.parse(textData));
            } catch(e) {
              err = new Error("Unparsable Server Response");
              err.code = 'E_INVALID_SERVER_RESPONSE';
              err.data = textData;
              reject(err);
            }
          });
        });

        req.on('error', function (err) {
          reject(err);
        });

        req.end(JSON.stringify(opts.ddns, null, '  '));
      }, reject);
    });
  }

  return new PromiseA(function (resolve, reject) {
    function nextServer() {
      var server = servers.shift();

      if (!server) {
        resolve(results);
        return;
      }

      update(server).then(function (result) {
        results.push(result);
        nextServer();
      }, function (err) {
        reject(err);
        return;
      });
    }

    nextServer();
  });

};
