node-ddns-client
=======

A commandline Dynamic DNS client for Node DDNS

Commandline
===========

```bash
npm install --global ddns-cli
```

```bash
ddns example.com \
  --answer 127.0.0.1 \
  --type A \
  --token token.txt \
  ns1.foo-dns-service.com ns2.foo-dns-service.com
```

free domains for testing
--------

Get a randomly assigned domain:

```bash
ddns-testing \
  --answer 127.0.0.1 \
  --type A
```

multiple devices
--------

** The `--device` option**

In the real world you probably have several servers with several IP addresses
that all respond to the same domain.

The `device` option allows you to specify a different device which will add an ip record rather than
overwrite an existing ip record.

```bash
ddns example.com \
  --answer 127.0.0.1 \
  --device server-3
  --type A \
  --token token.txt \
  ns1.foo-dns-service.com ns2.foo-dns-service.com
```

API
===

* `ddns.update({ servers, pathname, ddns })`

NOTE: the API will change in a future version (currently there are some bad naming conventions),
but I'll keep backwards compatibility.

```javascript
var ddns = require('ddns-cli');

ddns.update({
  servers: [
    'ns1.example.net'
  , 'ns2.example.net'
  , 'ns3.example.net'
  , 'ns4.example.net'
  ]
, pathname: '/api/com.daplie.dns/ddns'
, ddns: [
    { "name": "example.com"
    , "value": "127.0.0.1"
    , "type": "A"
    , "priority": undefined
    , "token": "ef13...."   // jwt token
    , "ttl": 600            // 10 minutes
    , "device": "server-7"
    }
  , { "name": "example.com"
    , "value": "::1"
    , "type": "AAAA"
    , "priority": undefined
    , "token": "ef13...."   // jwt token
    , "ttl": 600            // 10 minutes
    , "device": "server-7"
    }
  ]
});
```

curl
----

For the curious curlers who would like to implement this in another language:

```
JWT="xyz.abc.xyz"
IP="127.0.0.1"
HOSTNAME="example.com"
DEVICE="foo"

curl -X POST https://ns1.example.net/api/com.daplie.dns/ddns \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '[
    { "name": "'$HOSTNAME'", "value": "'$IP'", "type": "A", "token": "'$JWT'", "ttl": 600, "device": "'$DEVICE'" }
  ]'
```

Note: the API may change to accept an array of tokens and an array of domains separately,
but it will probably still need an Authorization Bearer token.

LICENSE
=======

Dual-licensed MIT and Apache-2.0

See LICENSE
