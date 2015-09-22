# kimbu
  [![License][license-image]][license-url]
  [![NPM Package][npm-image]][npm-url]
  [![NPM Downloads][npm-downloads-image]][npm-downloads-url]
  [![Build Status][travis-image]][travis-url]
  [![Test Coverage][coveralls-image]][coveralls-url]
  [![Code Climate][codeclimate-image]][codeclimate-url]
  [![Dependency Status][david-image]][david-url]
  [![devDependency Status][david-dev-image]][david-dev-url]

  [![Stories in Ready][waffle-image]][waffle-url]

##### Author: [Kurt Pattyn](https://github.com/kurtpattyn).

Kimbu is a message bus framework that implements publish-subscribe and request-response messaging patterns.
It abstracts away from the underlying message transport by using pluggable messaging transport providers.
Currently, only a RabbitMQ messaging transport provider has been implemented.

## Motivation
Implementing publish-subscribe and request-response messaging patterns using existing transports
(e.g. AMQP, WebSockets), requires some extensive boilerplate code.
Using RabbitMQ for instance, to implement a publish-subscribe messaging pattern one needs to setup a
fanout exchange and bind the consumers via queues to that exchange.
For the request-response style of messaging, a reply queue needs to be set up and messages must be
tagged with a `correlation-id` and `replyTo` field. When messages return they must be matched to the
request using the `correlation-id`.
Although not difficult, this requires a lot of boilerplate code.

## Installation

```bashp
$ npm install kimbu
```

or

```bashp
$ npm install kimbu --production
```
for a production only installation (no tests, documentation, ...).

## Usage
``` js
  var Client = require("kimbu").Client;
  var Transport = require("kimbu").Transport;
  var RabbitMQTransport = Transport.providers.RabbitMQTransport;

  var rmq = new RabbitMQTransport();  //use default options
  var client = new Client("client1", rmq, function(err) {
    client.on("calculator.add", function(parameters, next) {
      var result = parameters.reduce(function(prevVal, curVal) {
        return prevVal + curVal;
      });
      next(result);
    });
    client.on("buttonPushed", function(parameters, next) {
      console.log("Button %s pushed.", parameters);
      next();
    });
    client.start(function(err) {
      client.request("calculator.add", [1, 2, 3, 4, 5], function(err, reply) {
        console.log("The sum of 1, 2, 3, 4 and 5 is", reply);
      });
      client.publish("buttonPushed", "Enter");
    });
  });
```

## Tests

#### Unit Tests

```bashp
$ npm test
```

#### Unit Tests with Code Coverage

```bashp
$ npm run test-cov
```

This will generate a folder `coverage` containing coverage information and a folder `coverage/lcov-report` containing an HTML report with the coverage results.

```bashp
$ npm run test-ci
```
will create a folder `coverage` containing `lcov` formatted coverage information to be consumed by a 3rd party coverage analysis tool. This script is typically used on a continuous integration server.

#### Benchmarks

```bashp
$ npm run benchmark
```

#### Checkstyle

Executing

```bashp
$ npm run check-style
```

will run the `jscs` stylechecker against the code.

#### Static Code Analysis

Executing

```bashp
$ npm run code-analysis
```

will run `jshint` to analyse the code.

#### Code Documentation

Executing

```bashp
$ npm run make-docs
```

will run `jsdoc` to create documentation.

## License

  [MIT](LICENSE)

[npm-image]: https://badge.fury.io/js/kimbu.svg
[npm-url]: https://www.npmjs.com/package/kimbu
[npm-downloads-image]: https://img.shields.io/npm/dm/kimbu.svg?style=flat
[npm-downloads-url]: https://www.npmjs.org/package/kimbu
[coveralls-image]: https://coveralls.io/repos/KurtPattyn/kimbu/badge.svg?branch=master&service=github
[coveralls-url]: https://coveralls.io/github/KurtPattyn/kimbu?branch=master
[travis-image]: https://travis-ci.org/KurtPattyn/kimbu.svg?branch=master
[travis-url]: https://travis-ci.org/KurtPattyn/kimbu
[codeclimate-image]: https://codeclimate.com/github/KurtPattyn/kimbu/badges/gpa.svg
[codeclimate-url]: https://codeclimate.com/github/KurtPattyn/kimbu
[david-image]: https://david-dm.org/kurtpattyn/kimbu.svg
[david-url]: https://david-dm.org/kurtpattyn/kimbu
[david-dev-image]: https://david-dm.org/kurtpattyn/kimbu/dev-status.svg
[david-dev-url]: https://david-dm.org/kurtpattyn/kimbu#info=devDependencies
[license-image]: http://img.shields.io/badge/license-MIT-blue.svg?style=flat
[license-url]: LICENSE
[waffle-image]: https://badge.waffle.io/KurtPattyn/kimbu.svg?label=ready&title=Ready
[waffle-url]: http://waffle.io/KurtPattyn/kimbu
