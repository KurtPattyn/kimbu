"use strict";

var Message = require("../lib/message");
var ConsumeChannel = require("../lib/channel").ConsumeChannel;
var DispatchChannel = require("../lib/channel").DispatchChannel;
var RabbitMQTransport = require("../lib/transportproviders/rabbitmqtransport.js");
var assert = require("assert");
var util = require("util");

describe("Channel", function() {
  beforeEach(function() {
  });

  afterEach(function() {
  });

  describe("ConsumeChannel", function() {
    describe("constructor", function () {
      it("should fill in the supplied parameters correctly", function(done) {
        var rmq = new RabbitMQTransport();
        var recipientName = "consumer";
        var distributorName = "testChannel";
        var channel = new ConsumeChannel(recipientName, distributorName, rmq);

        assert.strictEqual(channel._consumeQueue._name, recipientName);
        assert.strictEqual(channel._dispatchQueue._name, distributorName);
        assert.equal(channel._consumeQueue._provider, rmq);
        assert.equal(channel._dispatchQueue._provider, rmq);

        done();
      });

      it("should throw an assertion failure with a non-String recipientName", function(done) {
        var rmq = new RabbitMQTransport();
        var recipientName = { a: "consumer" };
        var distributorName = "testChannel";

        assert.throws(function() {
            new ConsumeChannel(recipientName, distributorName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a non-String distributor name", function(done) {
        var rmq = new RabbitMQTransport();
        var recipientName = "consumer";
        var distributorName = { a: "testChannel" };

        assert.throws(function() {
            new ConsumeChannel(recipientName, distributorName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a non-MessageTransport provider", function(done) {
        var rmq = new Date();
        var recipientName = "consumer";
        var distributorName = "testChannel";

        assert.throws(function() {
            new ConsumeChannel(recipientName, distributorName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null recipientName", function(done) {
        var rmq = new RabbitMQTransport();
        var recipientName = null;
        var distributorName = "testChannel";

        assert.throws(function() {
            new ConsumeChannel(recipientName, distributorName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null distributor name", function(done) {
        var rmq = new RabbitMQTransport();
        var recipientName = "consumer";
        var distributorName = null;

        assert.throws(function() {
            new ConsumeChannel(recipientName, distributorName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null provider", function(done) {
        var rmq = null;
        var recipientName = "consumer";
        var distributorName = "testChannel";

        assert.throws(function() {
            new ConsumeChannel(recipientName, distributorName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });
    });

    describe(".start", function() {
      it("should start successfully", function(done) {
        var rmq = new RabbitMQTransport();
        var recipientName = "consumer";
        var distributorName = "testChannel";
        var channel = new ConsumeChannel(recipientName, distributorName, rmq);

        rmq.connect(function(err) {
          assert(util.isNullOrUndefined(err));

          //create the consume queue first
          rmq.consumeChannel(recipientName, distributorName, function (err, ch) {
            assert(util.isNullOrUndefined(err));
            assert(!util.isNullOrUndefined(ch));
            channel.start(function (err) {
              assert(util.isNullOrUndefined(err));
              rmq.disconnect();
              done();
            });
          });
        });
      });
    });

    describe(".stop", function() {
      it("should stop successfully when not connected", function (done) {
        var rmq = new RabbitMQTransport();
        var recipientName = "consumer";
        var distributorName = "testChannel";
        var channel = new ConsumeChannel(recipientName, distributorName, rmq);

        channel.stop(function(err) {
          assert(util.isNullOrUndefined(err));
          done();
        });
      });

      it("should cancel consumation successfully when not connected", function (done) {
        var rmq = new RabbitMQTransport();
        var recipientName = "consumer";
        var distributorName = "testChannel";
        var channel = new ConsumeChannel(recipientName, distributorName, rmq);

        channel._consumeQueue.cancelConsume(function(err) {
          assert(util.isNullOrUndefined(err));
          done();
        });
      });
    });

    describe(".on", function() {
      var channel = null;
      var rmq = null;

      before(function(done) {
        var recipientName = "consumer3";
        var distributorName = "testChannel";

        rmq = new RabbitMQTransport();

        rmq.connect(function(err) {
          assert(util.isNullOrUndefined(err));

          //make sure that a distributor endpoint is created
          rmq.dispatchChannel(distributorName, function (err, ch) {
            assert(util.isNullOrUndefined(err));
            assert(!util.isNullOrUndefined(ch));

            //make sure that a recipient endpoint is created
            rmq.consumeChannel(recipientName, distributorName, function (err, ch) {
              assert(util.isNullOrUndefined(err));
              assert(!util.isNullOrUndefined(ch));

              channel = new ConsumeChannel(recipientName, distributorName, rmq);
              channel.start(function (err) {
                assert(util.isNullOrUndefined(err));
                done();
              });
            });
          });
        });
      });

      after(function(done) {
        rmq.disconnect(function(err) {
          assert(util.isNullOrUndefined(err));
          rmq = null;
          channel = null;
          done();
        });
      });

      it("should receive messages with the given name", function(done) {
        var msgToSend = "Some Message!";
        var msgName = "some.test.message";

        channel.on(msgName, function(parameters, next) {
          assert.strictEqual(parameters, msgToSend);
          assert(util.isFunction(next));
          next();
          channel.off(msgName);
          done();
        });
        channel._consumeQueue.publish(new Message(msgName, msgToSend, { type: "event"}), function(err) {
          assert(util.isNullOrUndefined(err));
        });
      });

      it("should not receive messages with the given name if the channel is stopped", function(done) {
        var msgToSend = "Some Message!";
        var msgName = "some.test.message";

        channel.on(msgName, function(parameters, next) {
          next();
          channel.off(msgName);
          assert(false, "Should not be called");
        });
        rmq.consumeChannel("dummyRecipient", "testChannel", function (err, ch) {
          assert(util.isNullOrUndefined(err));
          assert(!util.isNullOrUndefined(ch));

          var dummyChannel = new ConsumeChannel("dummyRecipient", "testChannel", rmq);
          dummyChannel.start(function (err) {
            assert(util.isNullOrUndefined(err));

            channel.stop(function (err) {
              assert(util.isNullOrUndefined(err));
              dummyChannel._consumeQueue.publish(new Message(msgName, msgToSend, {type: "event"}), function (err) {
                assert(util.isNullOrUndefined(err));
                setTimeout(function () {
                  channel.off(msgName);
                  done();
                }, 0);
              });
            });
          });
        });
      });
    });
  });

  describe("DispatchChannel", function() {
    describe("constructor", function () {
      it("should fill in the supplied parameters correctly", function(done) {
        var rmq = new RabbitMQTransport();
        var replyRecipientName = "consumer";
        var distributorName = "testChannel";
        var channel = new DispatchChannel(distributorName, replyRecipientName, rmq);

        assert.strictEqual(channel._replyQueue._name, replyRecipientName);
        assert.strictEqual(channel._dispatchQueue._name, distributorName);
        assert.equal(channel._replyQueue._provider, rmq);
        assert.equal(channel._dispatchQueue._provider, rmq);

        done();
      });

      it("should throw an assertion failure with a non-String reply recipientName", function(done) {
        var rmq = new RabbitMQTransport();
        var replyRecipientName = {a: "consumer" };
        var distributorName = "testChannel";

        assert.throws(function() {
            new DispatchChannel(distributorName, replyRecipientName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a non-String distributor name", function(done) {
        var rmq = new RabbitMQTransport();
        var replyRecipientName = "consumer";
        var distributorName = {a: "testChannel" };

        assert.throws(function() {
            new DispatchChannel(distributorName, replyRecipientName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a non-MessageTransport provider", function(done) {
        var rmq = new Date();
        var replyRecipientName = "consumer";
        var distributorName = "testChannel";

        assert.throws(function() {
            new DispatchChannel(distributorName, replyRecipientName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null reply recipientName", function(done) {
        var rmq = new RabbitMQTransport();
        var replyRecipientName = null;
        var distributorName = "testChannel";

        assert.throws(function() {
            new DispatchChannel(distributorName, replyRecipientName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null distributor name", function(done) {
        var rmq = new RabbitMQTransport();
        var replyRecipientName = "consumer";
        var distributorName = null;

        assert.throws(function() {
            new DispatchChannel(distributorName, replyRecipientName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null provider", function(done) {
        var rmq = null;
        var replyRecipientName = "consumer";
        var distributorName = "testChannel";

        assert.throws(function() {
            new DispatchChannel(distributorName, replyRecipientName, rmq);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });
    });

    describe(".start", function() {
      it("should start successfully", function(done) {
        var rmq = new RabbitMQTransport();
        var replyRecipientName = "consumer";
        var distributorName = "testChannel";
        var channel = new DispatchChannel(distributorName, replyRecipientName, rmq);

        rmq.connect(function(err) {
          assert(util.isNullOrUndefined(err));
          rmq.dispatchChannel(distributorName, function(err, channel) {
            assert(util.isNullOrUndefined(err));
            channel.start(function (err) {
              assert(util.isNullOrUndefined(err));
              rmq.disconnect();
              done();
            });
          });
        });
      });
    });

    describe(".publish", function() {
      var rmq = null;
      var dispatchChannel = null;
      var distributorName = "testChannel";

      beforeEach(function(done) {
        rmq = new RabbitMQTransport();

        rmq.connect(function(err) {
          assert(util.isNullOrUndefined(err));
          rmq.dispatchChannel(distributorName, function(err, channel) {
            assert(util.isNullOrUndefined(err));
            dispatchChannel = channel;
            dispatchChannel.purge(function(/* err */) {
              dispatchChannel.start(function (/* err */) {
                assert(util.isNullOrUndefined(err));
                done();
              });
            });
          });
        });
      });

      afterEach(function(done) {
        dispatchChannel.purge(function(/* err */) {
          rmq.disconnect();
          done();
        });
      });

      it("should throw an assertion failure with a non-String event name", function(done) {
        assert.throws(function() {
            dispatchChannel.publish({ a: 1 }, "payload", {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null event name", function(done) {
        assert.throws(function() {
            dispatchChannel.publish(null, "payload", {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a zero-length event name", function(done) {
        assert.throws(function() {
            dispatchChannel.publish("", "payload", {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null parameters argument", function(done) {
        assert.throws(function() {
            dispatchChannel.publish("some.message", null, {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null options argument", function(done) {
        assert.throws(function() {
            dispatchChannel.publish("some.message", {}, null);
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with no options argument", function(done) {
        assert.throws(function() {
            dispatchChannel.publish("some.message", {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with an invalid callback", function(done) {
        assert.throws(function() {
            dispatchChannel.publish("some.message", {}, {}, "invalidcallback");
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });
    });

    describe(".request", function() {
      var rmq = null;
      var dispatchChannel = null;

      before(function(done) {
        rmq = new RabbitMQTransport();
        var distributorName = "testChannel";

        rmq.connect(function(err) {
          assert(util.isNullOrUndefined(err));
          rmq.dispatchChannel(distributorName, function(err, channel) {
            assert(util.isNullOrUndefined(err));
            dispatchChannel = channel;
            dispatchChannel.purge(function(/* err */) {
              dispatchChannel.start(function (err) {
                assert(util.isNullOrUndefined(err));
                done();
              });
            });
          });
        });
      });

      after(function(done) {
        dispatchChannel.purge(function(/* err */) {
          rmq.disconnect();
          done();
        });
      });

      it("should throw an assertion failure with a non-String cmd name", function(done) {
        assert.throws(function() {
            dispatchChannel.request({ a: 1 }, "payload", {}, function() {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null cmd name", function(done) {
        assert.throws(function() {
            dispatchChannel.request(null, "payload", {}, function() {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a zero-length cmd name", function(done) {
        assert.throws(function() {
            dispatchChannel.request("", "payload", {}, function() {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null parameters argument", function(done) {
        assert.throws(function() {
            dispatchChannel.request("some.command", null, {}, function() {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with a null options argument", function(done) {
        assert.throws(function() {
            dispatchChannel.request("some.command", "payload", null, function() {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with no callback argument", function(done) {
        assert.throws(function() {
            dispatchChannel.request("some.command", "payload", {});
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should throw an assertion failure with an invalid callback", function(done) {
        assert.throws(function() {
            dispatchChannel.request("some.command", {}, {}, "invalidcallback");
          }, /AssertionError/,
          "Should throw an AssertionError");
        done();
      });

      it("should return an error when the channel is stopped", function(done) {
        dispatchChannel.stop(function(err) {
          assert(util.isNullOrUndefined(err));
          dispatchChannel.request("some.command", "payload", {}, function(err, reply) {
            assert(!util.isNullOrUndefined(err));
            assert(util.isNullOrUndefined(reply));
            assert.equal(err.message, "Publishing is stopped.");
            done();
          });
        });
      });
    });
  });

  describe("MessagingPatterns", function() {
    var rmq = null;
    var dispatchChannel = null;
    var consumeChannel = null;
    var distributorName = "testChannel";

    beforeEach(function(done) {
      rmq = new RabbitMQTransport();

      rmq.connect(function(err) {
        assert(util.isNullOrUndefined(err));
        rmq.dispatchChannel(distributorName, function(err, channel) {
          assert(util.isNullOrUndefined(err));
          dispatchChannel = channel;
          rmq.consumeChannel("consumer", distributorName, function(err, channel) {
            assert(util.isNullOrUndefined(err));
            consumeChannel = channel;
            consumeChannel.purge(function(/* err */) {
              dispatchChannel.purge(function(/* err */) {
                dispatchChannel.start(function (err) {
                  assert(util.isNullOrUndefined(err));
                  consumeChannel.start(function(err) {
                    assert(util.isNullOrUndefined(err));
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });

    afterEach(function(done) {
      dispatchChannel.purge(function(/* err */) {
        consumeChannel.purge(function(/* err */) {
          rmq.disconnect();
          done();
        });
      });
    });

    describe("pub/sub", function() {
      it("should deliver an event to the correct consumer", function(done) {
        var messageName = "lights.turnedon";
        var message = "And then there was light.";

        consumeChannel.on(messageName, function(parameters, next) {
          assert.strictEqual(parameters, message);
          next();
          consumeChannel.off(messageName);
          done();
        });
        dispatchChannel.publish(messageName, message, {});
      });

      it("should deliver an event to all consumers", function(done) {
        var messageName = "lights.turnedon";
        var message = "And then there was light.";
        var numEvents = 0;

        consumeChannel.on(messageName, function(parameters, next) {
          assert.strictEqual(parameters, message);
          ++numEvents;
          next();
          consumeChannel.off(messageName);
        });

        rmq.consumeChannel("consumer2", distributorName, function(err, channel) {
          assert(util.isNullOrUndefined(err));
          channel.start(function(err) {
            assert(util.isNullOrUndefined(err));
            channel.on(messageName, function(parameters, next) {
              assert.strictEqual(parameters, message);
              ++numEvents;
              next();
              channel.off(messageName);
            });
            dispatchChannel.publish(messageName, message, {}, function(err) {
              assert(util.isNullOrUndefined(err));
              setTimeout(function() {
                assert.equal(numEvents, 2);
                done();
              }, 0);
            });
          });
        });
      });
    });

    describe("request/reply", function() {
      it("should return the reply of a request correctly", function(done) {
        var messageName = "calculator.add";
        var message = [1, 2, 3, 4, 5];
        var result = message.reduce(function(prevVal, curVal) {
          return prevVal + curVal;
        });

        consumeChannel.on(messageName, function(parameters, next) {
          assert.equal(typeof parameters, typeof message);
          assert.equal(parameters.length, message.length);
          next(1 + 2 + 3 + 4 + 5);
        });

        dispatchChannel.request(messageName, message, {}, function(err, reply) {
          assert(util.isNullOrUndefined(err));
          assert.equal(reply, result);
          done();
        });
      });

      it("should return the error reply of a request correctly", function(done) {
        var messageName = "calculator.add";
        var message = [1, 2, 3, 4, 5];
        var errorResult = new Error("Not good.");

        consumeChannel.on(messageName, function(parameters, next) {
          assert.equal(typeof parameters, typeof message);
          assert.equal(parameters.length, message.length);
          next(errorResult);
        });

        dispatchChannel.request(messageName, message, {}, function(err, reply) {
          assert(util.isNullOrUndefined(reply));
          assert(!util.isNullOrUndefined(err));
          assert(err instanceof Error);
          assert.equal(err.message, errorResult.message);
          done();
        });
      });

      it("should return an error reply if there is no command handler", function(done) {
        var messageName = "calculator.add";
        var message = [1, 2, 3, 4, 5];

        function onMessage(parameters, next) {
          assert(false, "Should never come here");
          next();
        }

        consumeChannel.on(messageName, onMessage);

        //remove the listener through EventEmitter interface
        consumeChannel.removeListener(messageName, onMessage);

        dispatchChannel.request(messageName, message, {}, function(err, reply) {
          assert(util.isNullOrUndefined(reply));
          assert(!util.isNullOrUndefined(err));
          assert(err instanceof Error);
          assert.equal(err.message, "Message could not be handled by receiver");
          done();
        });
      });
    });
  });
});
