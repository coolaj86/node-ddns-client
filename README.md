ddns
====

A command line Dynamic DNS client for node.js

  * Single device IP update can update multiple domains
  * Each domain may have multiple device records (for scaling, mirroring, or redundancy)
  * Generate Token URL for other DDNS clients

Commandline
===========

```bash
npm install --global ddns-cli
```

Usage
=====

There are two types of usage:

  * High-Level Daplie DNS API (via daplie.me)
  * Low-Level Dynamic DNS API (running your own instance of [ddnsd](https://github.com/Daplie/node-ddns-server))

Daplie DNS
==========

Daplie DNS works with most tlds (.com, .org, .net, etc).

You can use subdomains of `daplie.me` or use with your own domain
by purchasing a new domain or transfering one you already own.

<!-- Name / Host / Alias -->
<!-- Record Type -->
<!-- Priority -->
<!-- Value / Answer / Destination -->

**Simple Example** with your own domain on a Digital Ocean server

```bash
ddns --name example.com --device ubuntu-512mb-nyc1-01
```

#### Dapiel DNS vs Traditional DNS

For all practical purposes Daplie DNS functions exactly the same as traditional DNS.

However, where traditional DNS only understands the concept of an IP address,
Daplie DNS is designed for today's networks with dynamic IP addresses and ephemeral servers
so that it can support full automation of dynamic environments.

**Any time a device's ip address is updated, all associated domains are also updated**

Register Account
----------------

You will create an account using your email address,
agree to the terms of service (i.e. don't do bad things),
and select your first daplie.me subdomain and add a device
to your account.

```
ddns \
  --email john@example.com \
  --agree-tos \
  --name example.daplie.me
  --device $(hostname)
```

```bash
dig A +noall +answer example.daplie.me
```

A, AAAA, & ANAME (Device IP Records)
----------------

Daplie DNS uses a concept similar to ANAME records in that
it does not use A (IPv4) and AAAA (IPv6) records directly,
rather synchronizes these with a device IP address.

#### Automatic A record

```bash
ddns \
  --device rpi.local
  --name example.daplie.me \
```

```bash
dig A +noall +answer example.daplie.me
```

What happens:

  * You will be asked to enter and verify your email address
    * (this becomes your Daplie DNS account)
  * `rpi.local` is set to current external ip address
    * (this means that all domains currently synchronized to `rpi.local` are updated)
  * `example.daplie.me` is synchronized to `rpi.local`
    * (`example.daplie.me` must be registered to your account)

#### Manual A record

```bash
ddns \
  --device rpi.local \
  --name example.com \
  --type A \
  --value 127.0.0.1 \
  --ttl 600
```

```bash
dig A +noall +answer example.com
```

#### Manual AAAA record

```bash
ddns \
  --device rpi.local \
  --name example.com \
  --type AAAA \
  --value ::1 \
  --ttl 600
```

```bash
dig AAAA +noall +answer example.com
```

#### Manual ANAME record

An ANAME is a record psuedo-type which allows a user to specify a CNAME as the value for an SLD,
but for the purpose of responding to A and AAAA queries with the resolution of that CNAME.

True ANAME records are not yet supported,
however, since
The way Daplie DNS synchronizes A and AAAA record updates to device updates
is conceptionally very similar to ANAMEs, however proper ANAMES are not yet supported.

We do plan to support traditional ANAMEs
so bug us if you need it and we'll consider adding support sooner rather than later.

MX, SPF, and Tracking (Email Records)
---------------------

If you're using a service like google domains, mailgun, mandrill, mailchimp, etc
for mail acceptannce and deliver, you'll probably need to set up these kinds of things

#### MX records - for receiving mail:

```
ddns \
  --name example.daplie.me \
  --type MX \
  --priority 10 \
  --value 'mxa.mailgun.org' \
  --ttl 3600

ddns \
  --name example.daplie.me \
  --type MX \
  --priority 10 \
  --value 'mxb.mailgun.org' \
  --ttl 3600
```

```bash
dig MX +noall +answer example.daplie.me
```

#### Domain Key - for validating email signatures

```
ddns \
  --name smtp._domainkey.example.daplie.me \
  --type TXT \
  --value 'k=rsa; p=MIGfMA0GCSqGSIb3D...' \
  --ttl 3600
```

```bash
dig TXT +noall +answer smtp._domainkey.example.daplie.me
```

#### SPF Record - for validating sender authority

```
ddns \
  --name example.daplie.me \
  --type TXT \
  --value 'v=spf1 include:mailgun.org include:spf.mandrillapp.com include:_spf.google.com include:servers.mcsv.net ~all' \
  --ttl 3600
```

```bash
dig TXT +noall +answer example.daplie.me
```

#### CNAME record - for branded analytics tracking

```
ddns \
  --name email.example.daplie.me \
  --type CNAME \
  --value 'mxb.mailgun.org' \
  --ttl 3600
```

```bash
dig CNAME +noall +answer example.daplie.me

dig +noall +answer example.daplie.me
```

CNAME & TXT (Aliases, Analytics, & Verification)
----------

CNAME records use a domain name instead of an IP address and can be used on subdomains,
but not directly on SLDs. Common uses include:

  * domain owner verification - Google Analytics, Google Apps, etc
  * brand aliases - using mailgun or mailchimp tracking links with your own domain
  * device aliases - being able to update one ip address and affect many domains (which we already do with our A records)

TXT records allow arbitrary text to be associated with a domain or subdomain. Common uses include:

  * domain owner verification - Let's Encrypt, Google Apps, etc
  * domain keys - Email sender verification

#### CNAME as Alias

As mentioned above, aliases are commonly used for branding (which still makes sense with Daplie DNS)
or reducing the number of records that need to be tracked and updated when an ephemeral IP address changes
(which is completely solved by Daplie DNS with device records).

A potential downside to a CNAME rather than an A or AAAA record
is that it requires a second lookup (for the A record of the domain).

```bash
ddns \
  --device rpi.local \
  --name www.example.daplie.me \
  --type CNAME \
  --value example.daplie.me \
  --ttl 3600
```

```bash
dig CNAME +noall +answer www.example.daplie.me

dig +noall +answer www.example.daplie.me
```

Another use for CNAME records is

SRV
---

I'm not really sure what these records are most commonly used for

Low-Level DNS
=============

If you're running your own instance of `ddnsd` you can use `ddns`
to directly set records however you like.

Instead of using the registered account you must specify `--token`, `--services`,
and optionally `--port` and `--pathname`

```bash
ddns \
  --raw \
  --name example.com \
  --value 127.0.0.1 \
  --device server-3
  --type A \
  --token token.txt \
  --services ns1.foo-dns-service.com,ns2.foo-dns-service.com
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

See [ddnsd](https://github.com/Daplie/node-ddns-server)

LICENSE
=======

Dual-licensed MIT and Apache-2.0

See LICENSE
