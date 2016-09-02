'use strict';

var PromiseA = require('bluebird');
var colors = require('colors/safe');
var stripAnsi = require('strip-ansi');

// https://www.novell.com/documentation/extend5/Docs/help/Composer/books/TelnetAppendixB.html
var BKSP = String.fromCharCode(127);
var WIN_BKSP = "\u0008";
var ENTER = "\u0004";           // 13 // '\u001B[0m'
var CRLF = "\r\n";
var LF = "\n";
var CTRL_C = "\u0003";
var TAB = '\x09';
var ARROW_UP = '\u001b[A';      // 38
var ARROW_DOWN = '\u001b[B';    // 40
var ARROW_RIGHT = '\u001b[C';   // 39
var ARROW_LEFT = '\u001b[D';    // 37
// "\033[2J\033[;H" CLS // "\x1b[2J\x1b[1;1H"
// \033[0m RESET

var form = {
  createWs: function (rrs, rws) {
    // the user just hit enter to run a program, so the terminal is at x position 0,
    // however, we have no idea where y is, so we just make it really really negative
    var startY = -65537;
    // TODO update state on resize
    //console.log('');
    var ws = {
      _x: 0
    , _y: startY
    , _rows: rws.rows
    , _columns: rws.columns
    , _prompt: ''
    , _input: []
    , _inputIndex: 0
    , cursorTo: function (x, y) {
        if ('number' !== typeof x || (0 !== x && !x)) {
          throw new Error('cursorTo(x[, y]): x is not optional and must be a number');
        }
        ws._x = x;
        if ('number' === typeof y) {
          // TODO
          // Enter Full Screen Mode
          // if the developer is modifying the (absolute) y position,
          // then it should be expected that we are going
          // into full-screen mode, as there is no way
          // to read the current cursor position to get back
          // to a known line location.
          ws._y = y;
        }
        rws.cursorTo(x, y);
      }
    , write: function (str) {
        var rows = stripAnsi(str).split(/\r\n|\n|\r/g);
        var len = rows[0].replace(/\t/g, '    ').length;
        var x;

        switch (str) {
          case BKSP:
          case WIN_BKSP:
          form.setStatus(rrs, ws, colors.dim(
            "inputIndex: " + ws._inputIndex
          + " input:" + ws._input.join('')
          + " x:" + ws._x
          ));
            x = ws._x;
            if (0 !== ws._inputIndex) {
              ws._inputIndex -= 1;
              x -= 1;
            }
            ws._input.splice(ws._inputIndex, 1);
            ws.clearLine();
            //ws.cursorTo(0, col);
            ws.cursorTo(0);
            ws.clearLine();
            ws.write(ws._prompt);
            ws.write(ws._input.join(''));
            ws.cursorTo(x);
            return;

          case ARROW_RIGHT:
          form.setStatus(rrs, ws, colors.dim(
            "inputIndex: " + ws._inputIndex
          + " input:" + ws._input.join('')
          + " x:" + ws._x
          ));
          if (ws._x === ws._prompt.length + ws._input.length) {
            return;
          }
          ws._inputIndex += 1;
          ws._x = ws._prompt.length + ws._inputIndex;
          rws.write(str);
          return;

          case ARROW_LEFT:
          form.setStatus(rrs, ws, colors.dim(
            "inputIndex: " + ws._inputIndex
          + " input:" + ws._input.join('')
          + " x:" + ws._x
          ));
          if (0 === ws._inputIndex) {
            return;
          }
          ws._inputIndex = Math.max(0, ws._inputIndex - 1);
          //ws._x = Math.max(0, ws._x - 1);
          ws._x = Math.max(0, ws._x - 1);
          rws.write(str);
          return;
        }

        if (rows.length > 1) {
          ws._x = 0;
        }

        if (ws._x + len > ws._columns) {
          ws._x = (ws._x + len) % ws._columns;
        }
        else {
          ws._x += len;
        }

        rws.write(str);
      }
    , moveCursor: function (dx, dy) {
        if ('number' !== typeof dx || (0 !== dx && !dx)) {
          throw new Error('cursorTo(x[, y]): x is not optional and must be a number');
        }
        ws._x = Math.max(0, Math.min(ws._columns, ws._x + dx));
        if ('number' === typeof dy) {
          ws._y = Math.max(startY, Math.min(ws._rows, ws._y + dy));
        }

        rws.moveCursor(dx, dy);
      }
    , clearLine: function() {
        ws._x = 0;
        rws.clearLine();
      }
    };

    return ws;
  }

, ask: function (rrs, ws, prompt, cbs) {
    ws._prompt = prompt;

    return new PromiseA(function (resolve) {
      var ch;

      rrs.setRawMode(true);
      rrs.setEncoding('utf8');
      rrs.resume();

      ws.cursorTo(0);
      ws.write(ws._prompt);
      //ws.cursorTo(0, ws._prompt.length);

      var debouncer = {
        set: function () {
          if (!cbs.onDebounce) {
            return;
          }

          clearTimeout(debouncer._timeout);

          if ('function' !== typeof fn) {
            return;
          }

          debouncer._timeout = setTimeout(function () {
            rrs.pause();
            return cbs.onDebounce(ws._input.join(''), ch).then(function () {
              rrs.resume();
            }, function (err) {
              var errmsg = colors.red(err.message);
              form.setStatus(rrs, ws, errmsg);
              // resume input
              rrs.resume();
            });
          }, cbs.debounceTimeout || 300);
        }
      };

      function callback() {
        clearTimeout(debouncer._timeout);
        rrs.removeListener('data', onData);

        rrs.pause();

        cbs.onReturnAsync(rrs, ws, ws._input.join(''), ch).then(function () {
          ws.write('\n');
          rrs.setRawMode(false);

          resolve({ input: ws._input.join('') });
        }, function (err) {
          rrs.on('data', onData);

          var errmsg = colors.red(err.message);
          form.setStatus(rrs, ws, errmsg);

          rrs.resume();
        });
      }

      function onData(chunk) {
        var x;
        ch = chunk.toString('utf8');
        debouncer.set();

        if (CTRL_C === ch) {
          console.log("");
          console.log("received CTRL+C and quit");
          process.exit(0);
          callback(new Error("cancelled"));
        }

        switch (ch) {
        case ENTER:
        case CRLF:
        case LF:
        case "\n\r":
        case "\r":
          callback();
          break;
        case BKSP:
        case WIN_BKSP:
        case ARROW_LEFT:
        case ARROW_RIGHT:
          ws.write(ch);
          break;
        case ARROW_UP: // TODO history, show pass
          break;
        case ARROW_DOWN: // TODO history, hide pass
          break;
        case TAB:
          // TODO auto-complete
          break;
        default:
          form.setStatus(rrs, ws, colors.dim(
            "inputIndex: " + ws._inputIndex
          + " input:" + ws._input.join('')
          + " x:" + ws._x
          ));
          x = ws._x;
          ws._input.splice(ws._inputIndex, 0, ch);
          ws.write(ws._input.slice(ws._inputIndex).join(''));
          ws._inputIndex += 1;
          ws.cursorTo(x + 1);
          break;
        }
      }

      rrs.on('data', onData);
    });
  }
, setStatus: function (rrs, ws, msg) {
    //var errlen = (' ' + err.message).length;
    var x = ws._x;
    // down one, start of line
    // TODO write newline?
    //ws.moveCursor(0, 1);
    ws.write('\n');
    ws.clearLine();
    ws.cursorTo(0);
    // write from beginning of line
    ws.write(msg);
    // restore position
    ws.cursorTo(x);
    ws.moveCursor(0, -1);
  }
};

var inputs = {
  email: {
    onReturnAsync: function (rrs, ws, str) {
      str = str.trim();
      var dns = PromiseA.promisifyAll(require('dns'));
      var parts = str.split(/@/g);

      if (2 !== parts.length || /\s+|\//.test(str)) {
        return PromiseA.reject(new Error("[X] That doesn't look like an email address"));
      }

      rrs.pause();
      form.setStatus(rrs, ws, colors.blue("testing `dig mx '" + parts[1] + "'` ... "));

      return dns.resolveMxAsync(parts[1]).then(function () {
        return;
      }, function () {
        return PromiseA.reject(new Error("[X] '" + parts[1] + "' is not a valid email domain"));
      });
    }
  }
};

module.exports.inputs = inputs;
module.exports.form = form;
module.exports.create = function (rrs, rws) {
  var ws = form.createWs(rrs, rws);
  var f = {};

  Object.keys(form).forEach(function (key) {
    if ('function' !== typeof form[key]) {
      f[key] = form[key];
      return;
    }

    f[key] = function () {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(ws);
      args.unshift(rrs);
      return form[key].apply(null, args);
    };
  });

  f.inputs = inputs;
  f.ws = ws;
  f.rrs = rrs;

  return f;

};
