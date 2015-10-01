"use strict";

var RabbitMQTransport = require("../lib/transportproviders/rabbitmqtransport.js");
var assert = require("assert");
var util = require("util");
var Message = require("../lib/message");

describe("RabbitMQTransport", function() {
  beforeEach(function () {
  });

  afterEach(function () {
  });

  describe("constructor", function () {
    var defaultRabbitMQOptions = {
      host: "localhost",
      port: 5672,
      vhost: "",
      heartbeatSeconds: 30,
      user: "guest",
      password: "guest",
      noDelay: true
    };

    it("should not connect on construction", function (done) {
      var rmq = new RabbitMQTransport();

      assert.ok(!rmq.isConnected());
      done();
    });

    it("should correctly initialize the options", function (done) {
      var rmq = new RabbitMQTransport(defaultRabbitMQOptions);

      assert.ok(!rmq.isConnected());
      const propertyNames = Object.getOwnPropertyNames(defaultRabbitMQOptions);
      const options = rmq.options();
      assert.equal(propertyNames.length,
                   Object.getOwnPropertyNames(options).length);
      propertyNames.forEach(function(prop) {
        assert(prop in options);
        assert.equal(defaultRabbitMQOptions[prop], options[prop]);
      });
      done();
    });

    it("should accept no options (and revert to default)", function (done) {
      var rmq = new RabbitMQTransport();

      assert.ok(!util.isNullOrUndefined(rmq.options()));
      assert.strictEqual(rmq.options().host, defaultRabbitMQOptions.host);
      assert.strictEqual(rmq.options().port, defaultRabbitMQOptions.port);
      assert.strictEqual(rmq.options().vhost, defaultRabbitMQOptions.vhost);
      assert.strictEqual(rmq.options().heartbeatSeconds, defaultRabbitMQOptions.heartbeatSeconds);
      assert.strictEqual(rmq.options().user, defaultRabbitMQOptions.user);
      assert.strictEqual(rmq.options().password, defaultRabbitMQOptions.password);
      assert.strictEqual(rmq.options().noDelay, defaultRabbitMQOptions.noDelay);
      done();
    });

    it("should prefer own options above default options", function (done) {
      var rabbitMQOptions = {
        noDelay: false,
        vhost: "/vhost"
      };
      var rmq = new RabbitMQTransport(rabbitMQOptions);

      assert.ok(!util.isNullOrUndefined(rmq.options()));
      assert.strictEqual(rmq.options().host, defaultRabbitMQOptions.host);
      assert.strictEqual(rmq.options().port, defaultRabbitMQOptions.port);
      assert.strictEqual(rmq.options().vhost, rabbitMQOptions.vhost);
      assert.strictEqual(rmq.options().heartbeatSeconds, defaultRabbitMQOptions.heartbeatSeconds);
      assert.strictEqual(rmq.options().user, defaultRabbitMQOptions.user);
      assert.strictEqual(rmq.options().password, defaultRabbitMQOptions.password);
      assert.strictEqual(rmq.options().noDelay, rabbitMQOptions.noDelay);

      done();
    });
  });

  describe(".connect", function() {
    it("should connect successfully to localhost", function(done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert(rmq.isConnected());
        rmq.disconnect();
        done();
      });
    });

    it("should emit a connected event on succesful connection", function(done) {
      var rmq = new RabbitMQTransport();

      rmq.on("connected", function() {
        assert(rmq.isConnected());
        rmq.disconnect();
        done();
      });

      rmq.connect();
    });

    it("should return an error when connecting to an unknown host", function(done) {
      var rmq = new RabbitMQTransport({ host: "dummyThing" });

      rmq.connect(function(err) {
        assert(util.isError(err));
        assert(!rmq.isConnected());
        rmq.disconnect();
        done();
      });
    });

    it("should not emit a connected event when calling connect twice", function(done) {
      var rmq = new RabbitMQTransport();
      var numConnectionEvents = 0;

      rmq.on("connected", function() {
        ++numConnectionEvents;
      });

      rmq.connect();
      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        process.nextTick(function() {
          assert.equal(numConnectionEvents, 1);
          assert(rmq.isConnected());
          rmq.disconnect();
          done();
        });
      });
    });

    it("should also return an error for a second connection attempt to an unknown host", function(done) {
      var rmq = new RabbitMQTransport({ host: "dummyThing" });

      rmq.connect(function(err) {
        assert(util.isError(err));
        assert(!rmq.isConnected());
      });
      rmq.connect(function(err) {
        assert(util.isError(err));
        assert(!rmq.isConnected());
        done();
      });
    });

    it("should return successful on a second call to connect after a first successful connection", function(done) {
      var rmq = new RabbitMQTransport();

      rmq.on("connected", function() {
        assert(rmq.isConnected());
        rmq.connect(function(err) {
          assert(util.isNullOrUndefined(err));
          assert(rmq.isConnected());
          rmq.disconnect();
          done();
        });
      });

      rmq.connect();
    });
  });

  describe(".disconnect", function() {
    it("should disconnect successfully if not connected", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.disconnect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert(!rmq.isConnected());
        done();
      });
    });

    it("should disconnect successfully if already disconnected", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));

        rmq.disconnect(function(err) {
          assert(util.isNullOrUndefined(err));
          assert(!rmq.isConnected());
        });
        rmq.disconnect(function(err) {
          assert(util.isNullOrUndefined(err));
          assert(!rmq.isConnected());
          done();
        });
      });
    });

    it("doesn't require a callback", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.disconnect();
      done();
    });

    it("doesn't require a callback on a second disconnect call", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.disconnect();
      rmq.disconnect();
      done();
    });

    it("doesn't require a callback on a second disconnect call if connected", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.disconnect();
        rmq.disconnect();
        done();
      });
    });

    it("should emit a disconnected event on succesful disconnection", function(done) {
      var rmq = new RabbitMQTransport();

      rmq.on("disconnected", function() {
        assert(!rmq.isConnected());
        done();
      });

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.disconnect();
      });
    });

    it("should not emit a second disconnected event when calling disconnect twice", function(done) {
      var rmq = new RabbitMQTransport();
      var numDisconnectionEvents = 0;

      rmq.on("disconnected", function() {
        ++numDisconnectionEvents;
      });

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.disconnect(function() {
          assert(!rmq.isConnected());
          rmq.disconnect(function() {
            process.nextTick(function() {
              assert.equal(numDisconnectionEvents, 1);
              assert(!rmq.isConnected());
              done();
            });
          });
        });
      });
    });

    //it("should be called on a SIGINT signal", function(done) {
    //  var rmq = new RabbitMQTransport();
    //
    //  process.on("SIGINT", function() {
    //    console.log("Received SIGINT");
    //  });
    //
    //  rmq.on("disconnected", function() {
    //    done();
    //  });
    //
    //  rmq.connect(function(err) {
    //    process.kill(process.pid, "SIGINT");
    //  });
    //});
  });

  describe(".dispatchChannel", function() {
    it("should throw an assertion error when not connected", function (done) {
      var rmq = new RabbitMQTransport();

      assert.throws(function() {
        rmq.dispatchChannel("someName", function (/* err, channel */) {
        });
      }, /AssertionError/,
      "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a non-string channel name", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.dispatchChannel({ a: 1}, function (/* err, channel */) {
            });
          }, /AssertionError/,
          "Should throw an AssertionError");
        rmq.disconnect();
      });

      done();
    });

    it("should throw an assertion error with a null channel name", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.dispatchChannel(null, function (/* err, channel */) {
            });
          }, /AssertionError/,
          "Should throw an AssertionError");
        rmq.disconnect();
        done();
      });
    });

    it("should throw an assertion error with an empty channel name", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.dispatchChannel("", function (/* err, channel */) {
            });
          }, /AssertionError/,
          "Should throw an AssertionError");
        rmq.disconnect();
        done();
      });
    });

    it("should throw an assertion error when no callback is supplied", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.dispatchChannel("testChannel");
          }, /AssertionError/,
          "Should throw an AssertionError");
        rmq.disconnect();
        done();
      });
    });

    it("should return a valid channel with the given name", function (done) {
      var DispatchChannel = require("../lib/dispatch_channel");
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.dispatchChannel("testChannel", function(err, channel) {
          assert(util.isNullOrUndefined(err));
          assert(!util.isNullOrUndefined(channel));
          assert(channel instanceof DispatchChannel);
          rmq.disconnect();
          done();
        });
      });
    });
  });

  describe(".consumeChannel", function() {
    before(function(done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.dispatchChannel("testChannel", function (err, channel) {
          assert(util.isNullOrUndefined(err));
          assert(!util.isNullOrUndefined(channel));
          rmq.disconnect();
          done();
        });
      });
    });

    it("should throw an assertion error when not connected", function (done) {
      var rmq = new RabbitMQTransport();

      assert.throws(function() {
          rmq.consumeChannel("someName", "testChannel", function (/* err, channel */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a non-string consume channel name", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.consumeChannel({ a: 1}, "testChannel", function (/* err, channel */) {
            });
          }, /AssertionError/,
          "Should throw an AssertionError");
        rmq.disconnect();
        done();
      });
    });

    it("should throw an assertion error with a null consume channel name", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.consumeChannel(null, "testChannel", function (/* err, channel */) {
            });
          }, /AssertionError/,
          "Should throw an AssertionError");
        rmq.disconnect();
        done();
      });
    });

    it("should throw an assertion error with an empty consume channel name", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.consumeChannel("", "testChannel", function (/* err, channel */) {
            });
          }, /AssertionError/,
          "Should throw an AssertionError");
        rmq.disconnect();
        done();
      });
    });

    it("should throw an assertion error with a non-string dispatch channel name", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.consumeChannel("consumer", { a: 2 }, function (/* err, channel */) {
            });
          }, /AssertionError/,
          "Should throw an AssertionError");
        rmq.disconnect();
      });

      done();
    });

    it("should throw an assertion error with a null dispatch channel name", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.consumeChannel("consumer", null, function (/* err, channel */) {
            });
          }, /AssertionError/,
          "Should throw an AssertionError");
        rmq.disconnect();
        done();
      });
    });

    it("should throw an assertion error when no callback is supplied", function (done) {
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.consumeChannel("consumer", "testChannel");
          }, /AssertionError/,
          "Should throw an AssertionError");
        rmq.disconnect();
        done();
      });
    });

    it("should return a valid channel with the given name", function (done) {
      var ConsumeChannel = require("../lib/consume_channel");
      var rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.consumeChannel("consumer", "testChannel", function(err, channel) {
          assert(util.isNullOrUndefined(err));
          assert(!util.isNullOrUndefined(channel));
          assert(channel instanceof ConsumeChannel);
          rmq.disconnect();
          done();
        });
      });
    });
  });

  describe(".publish", function() {
    var dispatchChannel = null;
    var consumeChannel = null;
    var rmq = null;
    var distributorName = "testChannel";
    var recipientName = "consumer";

    beforeEach(function(done) {
      rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.dispatchChannel(distributorName, function (err, channel) {
          assert(util.isNullOrUndefined(err));
          dispatchChannel = channel;
          rmq.consumeChannel(recipientName, distributorName, function(err, channel) {
            assert(util.isNullOrUndefined(err));
            consumeChannel = channel;
            dispatchChannel.purge(function(err) {
              assert(util.isNullOrUndefined(err));
              consumeChannel.purge(function(err) {
                assert(util.isNullOrUndefined(err));
                done();
              });
            });
          });
        });
      });
    });

    afterEach(function(done) {
      if (rmq.isConnected()) {
        dispatchChannel.purge(function (/* err */) {
          consumeChannel.purge(function (/* err */) {
            rmq.disconnect(function (/* err */) {
              rmq = null;
              consumeChannel = null;
              dispatchChannel = null;
              done();
            });
          });
        });
      } else {
        done();
      }
    });

    it("should throw an assertion error with a non-Message type message", function (done) {
      assert.throws(function() {
        rmq.publish(distributorName, "some message", "x", function (/* err */) {
        });
      }, /AssertionError/,
      "Should throw an AssertionError");

      done();
    });

    it("should return an error when publishing to a non-existing exchange", function (done) {
      rmq.publish("SomeNonExistingExchange", new Message("some message", {}), "x", function (err) {
        assert(util.isError(err));
        done();
      });
    });

    it("should return an error when message is not routable", function (done) {
      rmq.publish(distributorName, new Message("some message", {}), "pathLeadingToNowhere", function (err) {
        assert(util.isError(err));
        done();
      });
    });

    it("should deliver a message directly to a queue", function(done) {
      var messageToSend = "Hello Beautiful World!";
      var messageName = "hello.world";

      rmq.bind(recipientName, distributorName, messageName, function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.consume(recipientName, {}, function(msg, next) {
          assert.strictEqual(msg.name, messageName);
          assert.strictEqual(msg.parameters, messageToSend);
          next();
          rmq.unbind(recipientName, distributorName, messageName, function(/* err */) {
            done();
          });
        }, function(err) {
          assert(util.isNullOrUndefined(err));
        });

        //publish directly to the queue
        rmq.publish("", new Message(messageName, messageToSend), recipientName,
          function(err) {
            assert(util.isNullOrUndefined(err));
          });
      });
    });

    it("should deliver a message to the right recipient", function(done) {
      var messageToSend = "Hello Beautiful World!";

      rmq.bind(recipientName, distributorName, "hello.world", function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.consume(recipientName, {}, function(msg, next) {
          assert.strictEqual(msg.name, "hello.world");
          assert.strictEqual(msg.parameters, messageToSend);
          next();
          rmq.unbind(recipientName, distributorName, "hello.world", function(/* err */) {
            done();
          });
        }, function(err) {
          assert(util.isNullOrUndefined(err));
        });
        rmq.publish(distributorName, new Message("hello.world", messageToSend), "hello.world",
          function(err) {
            console.error(err);
            assert(util.isNullOrUndefined(err));
          });
      });
    });

    it("should deliver a message to all recipients", function(done) {
      var messageToSend = "Hello World!";
      var eventsReceived = 0;

      rmq.consumeChannel("consumer2", distributorName, function(err, channel) {
        assert(util.isNullOrUndefined(err));
        rmq.bind(recipientName, distributorName, "hello.world.bis", function(err) {
          assert(util.isNullOrUndefined(err));
          rmq.bind("consumer2", distributorName, "hello.world.bis", function(err) {
            assert(util.isNullOrUndefined(err));
            rmq.consume("consumer2", {}, function(msg, next) {
              assert.strictEqual(msg.name, "hello.world.bis");
              assert.strictEqual(msg.parameters, messageToSend);
              ++eventsReceived;
              rmq.unbind("consumer2", distributorName, "hello.world.bis", function(/* err */) {
                next();
              });
            }, function(err) {
              assert(util.isNullOrUndefined(err));
            });
            rmq.consume(recipientName, {}, function(msg, next) {
              assert.strictEqual(msg.name, "hello.world.bis");
              assert.strictEqual(msg.parameters, messageToSend);
              ++eventsReceived;
              rmq.unbind(recipientName, distributorName, "hello.world.bis", function(/* err */) {
                next();
              });
            });
            rmq.publish(distributorName, new Message("hello.world.bis", messageToSend),
                        "hello.world.bis", function(err) {
              assert(util.isNullOrUndefined(err));
              setTimeout(function() {
                assert.equal(eventsReceived, 2);
                done();
              }, 0);
            });
          });
        });
      });
    });
  });

  describe(".unbind", function() {
    var dispatchChannel = null;
    var consumeChannel = null;
    var rmq = null;

    beforeEach(function (done) {
      rmq = new RabbitMQTransport();

      rmq.connect(function (err) {
        assert(util.isNullOrUndefined(err));
        rmq.dispatchChannel("testChannel", function (err, channel) {
          assert(util.isNullOrUndefined(err));
          dispatchChannel = channel;
          rmq.consumeChannel("consumer", "testChannel", function (err, channel) {
            assert(util.isNullOrUndefined(err));
            consumeChannel = channel;
            done();
          });
        });
      });
    });

    afterEach(function () {
      rmq.disconnect();
      rmq = null;
      consumeChannel = null;
      dispatchChannel = null;
    });

    it("should throw an assertion error with a non-String consume channel name", function (done) {
      assert.throws(function() {
          rmq.unbind({ a: "someName" }, "testChannel", "hello.world", function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a null consume channel name", function (done) {
      assert.throws(function() {
          rmq.unbind(null, "testChannel", "hello.world", function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a non-String dispatcher channel name", function (done) {
      assert.throws(function() {
          rmq.unbind("consumer", { a: "testChannel" }, "hello.world", function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a null dispatcher channel name", function (done) {
      assert.throws(function() {
          rmq.unbind("consumer", null, "hello.world", function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a non-String binding key", function (done) {
      assert.throws(function() {
          rmq.unbind("consumer", "testChannel", { a: "hello.world" }, function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a null binding key", function (done) {
      assert.throws(function() {
          rmq.unbind("consumer", "testChannel", null, function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with an invalid callback", function (done) {
      assert.throws(function() {
          rmq.unbind("consumer", "testChannel", "hello.world", "invalidCallback");
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a missing callback", function (done) {
      assert.throws(function() {
          rmq.unbind("consumer", "testChannel", "hello.world");
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error when there is no connection", function (done) {
      rmq.disconnect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.unbind("consumer", "testChannel", "hello.world", function(/* err */) {});
          }, /AssertionError/,
          "Should throw an AssertionError");

        done();
      });
    });

    it("should not return an error when called twice", function (done) {
      rmq.unbind("consumer", "testChannel", "hello.world", function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.unbind("consumer", "testChannel", "hello.world", function(err) {
          assert(util.isNullOrUndefined(err));
          done();
        });
      });
    });

    it("should unsubscribe from receiving messages", function (done) {
      var messageToSend = "Hello World!";
      var messagesReceived = 0;

      rmq.bind("consumer", "testChannel", "hello.world", function (err) {
        assert(util.isNullOrUndefined(err));
        rmq.consume("consumer", {}, function(msg, next) {
          //check that the message is received only once
          assert.strictEqual(msg.name, "hello.world");
          assert.strictEqual(msg.parameters, messageToSend);
          ++messagesReceived;
          next();
          setTimeout(function() {
            rmq.unbind("consumer", "testChannel", "hello.world", function (err) {
              assert(util.isNullOrUndefined(err));
              rmq.publish("testChannel", new Message("hello.world", messageToSend),
                "hello.world", function(err) {
                  assert(err.message.indexOf("Failed to deliver") === 0);
                  rmq.purge("consumer");
                  setTimeout(function() {
                    assert.equal(messagesReceived, 1);
                    done();
                  }, 0);
                });
            });
          }, 0);
        });
        rmq.publish("testChannel", new Message("hello.world", messageToSend),
                    "hello.world", function(err) {
          assert(util.isNullOrUndefined(err));
        });
      });
    });
  });


  describe(".bind", function() {
    var dispatchChannel = null;
    var consumeChannel = null;
    var rmq = null;

    beforeEach(function(done) {
      rmq = new RabbitMQTransport();

      rmq.connect(function (err) {
        assert(util.isNullOrUndefined(err));
        rmq.dispatchChannel("testChannel", function (err, channel) {
          assert(util.isNullOrUndefined(err));
          dispatchChannel = channel;
          rmq.consumeChannel("consumer", "testChannel", function (err, channel) {
            assert(util.isNullOrUndefined(err));
            consumeChannel = channel;
            dispatchChannel.purge(function(err) {
              assert(util.isNullOrUndefined(err));
              consumeChannel.purge(function(err) {
                assert(util.isNullOrUndefined(err));
                done();
              });
            });
          });
        });
      });
    });

    afterEach(function(done) {
      if (rmq.isConnected()) {
        dispatchChannel.purge(function (err) {
          assert(util.isNullOrUndefined(err));
          consumeChannel.purge(function (err) {
            assert(util.isNullOrUndefined(err));
            rmq.disconnect(function (err) {
              assert(util.isNullOrUndefined(err));
              rmq = null;
              consumeChannel = null;
              dispatchChannel = null;
              done();
            });
          });
        });
      } else {
        done();
      }
    });

    it("should throw an assertion error with a non-String consume channel name", function (done) {
      assert.throws(function() {
          rmq.bind({ a: "someName" }, "testChannel", "hello.world", function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a null consume channel name", function (done) {
      assert.throws(function() {
          rmq.bind(null, "testChannel", "hello.world", function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a non-String dispatcher channel name", function (done) {
      assert.throws(function() {
          rmq.bind("consumer", { a: "testChannel" }, "hello.world", function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a null dispatcher channel name", function (done) {
      assert.throws(function() {
          rmq.bind("consumer", null, "hello.world", function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a non-String binding key", function (done) {
      assert.throws(function() {
          rmq.bind("consumer", "testChannel", { a: "hello.world" }, function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a null binding key", function (done) {
      assert.throws(function() {
          rmq.bind("consumer", "testChannel", null, function (/* err */) {
          });
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with an invalid callback", function (done) {
      assert.throws(function() {
          rmq.bind("consumer", "testChannel", "hello.world", "invalidCallback");
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error with a missing callback", function (done) {
      assert.throws(function() {
          rmq.bind("consumer", "testChannel", "hello.world");
        }, /AssertionError/,
        "Should throw an AssertionError");

      done();
    });

    it("should throw an assertion error when there is no connection", function (done) {
      rmq.disconnect(function(err) {
        assert(util.isNullOrUndefined(err));
        assert.throws(function() {
            rmq.bind("consumer", "testChannel", "hello.world", function(/* err */) {});
          }, /AssertionError/,
          "Should throw an AssertionError");

        done();
      });
    });

    it("should not return an error when called twice", function (done) {
      rmq.bind("consumer", "testChannel", "hello.world", function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.bind("consumer", "testChannel", "hello.world", function(err) {
          assert(util.isNullOrUndefined(err));
          rmq.unbind("consumer", "testChannel", "hello.world", function(/* err */) {
            done();
          });
        });
      });
    });

    it("should subscribe to receiving messages with the given routing key", function (done) {
      var messageToSend = "Hello World!";
      var messagesReceived = 0;

      rmq.bind("consumer", "testChannel", "hello.world", function (err) {
        assert(util.isNullOrUndefined(err));
        rmq.consume("consumer", {}, function(msg, next) {
          //check that the message is received only once
          assert.strictEqual(msg.name, "hello.world");
          assert.strictEqual(msg.parameters, messageToSend);
          ++messagesReceived;
          next();
          rmq.unbind("consumer", "testChannel", "hello.world", function (/* err */) {
          });
        });
        rmq.publish("testChannel", new Message("hello.world", messageToSend),
          "hello.world", function(err) {
            assert(util.isNullOrUndefined(err));
            setTimeout(function() {
              assert.equal(messagesReceived, 1);
              done();
            }, 10);
          });
      });
    });
  });
});
