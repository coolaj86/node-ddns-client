'use strict';

var PromiseA = require('bluebird');
var colors = require('colors/safe');
var stripAnsi = require('strip-ansi');
var rs = process.stdin;
var ws = process.stdout;

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

function statusMessage(ws, msg) {
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

function ask(stdin, rws, q, cbs) {
  return new PromiseA(function (resolve) {
    var input = [];
    var inputIndex = 0;
    var ch;
    // the user just hit enter to run a program, so the terminal is at x position 0,
    // however, we have no idea where y is, so we just make it really really negative
    var startY = -65537;
    // TODO update state on resize
    //console.log('');

    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();

    var ws = {
      _x: 0
    , _y: startY
    , _rows: rws.rows
    , _columns: rws.columns
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
          statusMessage(ws, colors.dim(
            "inputIndex: " + inputIndex
          + " input:" + input.join('')
          + " x:" + ws._x
          ));
            x = ws._x;
            if (0 !== inputIndex) {
              inputIndex -= 1;
              x -= 1;
            }
            input.splice(inputIndex, 1);
            ws.clearLine();
            //ws.cursorTo(0, col);
            ws.cursorTo(0);
            ws.clearLine();
            ws.write(q);
            ws.write(input.join(''));
            ws.cursorTo(x);
            return;

          case ARROW_RIGHT:
          statusMessage(ws, colors.dim(
            "inputIndex: " + inputIndex
          + " input:" + input.join('')
          + " x:" + ws._x
          ));
          if (ws._x === q.length + input.length) {
            return;
          }
          inputIndex += 1;
          ws._x = q.length + inputIndex;
          rws.write(str);
          return;

          case ARROW_LEFT:
          statusMessage(ws, colors.dim(
            "inputIndex: " + inputIndex
          + " input:" + input.join('')
          + " x:" + ws._x
          ));
          if (0 === inputIndex) {
            return;
          }
          inputIndex = Math.max(0, inputIndex - 1);
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

    ws.cursorTo(0);
    ws.write(q);
    //ws.cursorTo(0, q.length);

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
          stdin.pause();
          return cbs.onDebounce(input.join(''), ch).then(function () {
            stdin.resume();
          }, function (err) {
            var errmsg = colors.red(err.message);
            statusMessage(ws, errmsg);
            // resume input
            stdin.resume();
          });
        }, cbs.debounceTimeout || 300);
      }
    };

    function callback() {
      clearTimeout(debouncer._timeout);
      stdin.removeListener('data', onData);

      stdin.pause();

      cbs.onReturnAsync(input.join(''), ch).then(function () {
        ws.write('\n');
        stdin.setRawMode(false);

        resolve({ input: input.join('') });
      }, function (err) {
        stdin.on('data', onData);

        var errmsg = colors.red(err.message);
        statusMessage(ws, errmsg);

        stdin.resume();
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
        statusMessage(ws, colors.dim(
          "inputIndex: " + inputIndex
        + " input:" + input.join('')
        + " x:" + ws._x
        ));
        x = ws._x;
        input.splice(inputIndex, 0, ch);
        ws.write(input.slice(inputIndex).join(''));
        inputIndex += 1;
        ws.cursorTo(x + 1);
        break;
      }
    }

    stdin.on('data', onData);
  });
}

ask(rs, ws, "Enter your email address: ", {
  onReturnAsync: function (str) {
    str = str.trim();
    var dns = PromiseA.promisifyAll(require('dns'));
    var parts = str.split(/@/g);

    if (2 !== parts.length || /\s+|\//.test(str)) {
      return PromiseA.reject(new Error("[X] That doesn't look like an email address"));
    }

    process.stdin.pause();
    statusMessage(ws, colors.blue("testing `dig mx '" + parts[1] + "'` ... "));
    return dns.resolveMxAsync(parts[1]);
  }
}).then(function (/*obj*/) {
  // TODO auto-clear line below
  //ws.cursorTo(0);
  ws.clearLine(); // person just hit enter, they are on the next line
  ws.write('\n');
  ws.write('Check your email. You should receive an authorization code.\n');
  return ask(rs, ws, "Enter your auth code: ", {
    onReturnAsync: function (str) {
      if (!/-/.test(str)) {
        return PromiseA.reject(new Error("[X] That doesn't look like an authorization code."));
      }
      return PromiseA.resolve();
    }
  }).then(function (obj) {
    console.log(obj);
  });
});
