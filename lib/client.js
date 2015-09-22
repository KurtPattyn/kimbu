"use strict";

var Transport = require("./transport");
var util = require("util");
var assert = require("assert");

/**
 * @const
 * @private
 */
var dispatchChannelName = "distributionXch";

/**
 * Client is a client for a generalised message bus that supports request-response and
 * publish-subscribe styles of messaging.
 *
 * @param {!String} clientName - name of the client; must be unique within the messaging system
 * @param {!Transport} transport - the transport used to connect to the backend messaging fabric.
 * Must implement the {@link Transport} interface.
 * @param {!Function} callback - called when the Client is initialised. The callback takes
 * an Error argument to indicate potential initialisation errors.
 *
 * @class
 * @public
 */
function Client(clientName, transport, callback) {
  assert.ok(util.isString(clientName), "clientName must be a valid string");
  assert.ok(transport instanceof Transport);

  this._transport = transport;
  this._name = clientName;
  var self = this;

  //noinspection JSCheckFunctionSignatures
  this._transport.connect(function(err) {
    if (err) {
      callback(err);
    }
  });
  this._transport.on("connected", function() {
    //noinspection JSCheckFunctionSignatures
    self._transport.dispatchChannel(dispatchChannelName, function(err, dispatchChannel) {
      if (err) {
        callback(err);
      } else {
        self._dispatchChannel = dispatchChannel;
        self._transport.consumeChannel(self._name + "Q", dispatchChannelName,
          function(err, consumeChannel) {
            if (err) {
              callback(err);
            } else {
              self._consumeChannel = consumeChannel;
              callback(null);
            }
          });
      }
    });
  });
}

/**
 * Instructs the client to start consuming and sending messages to the message bus.
 *
 * @param {!Function} callback - called when the client has started. The callback takes an Error
 * parameter to indicate potential errors while starting the client.
 *
 * @public
 */
Client.prototype.start = function(callback) {
  var self = this;

  self._consumeChannel.start(function() {
    self._dispatchChannel.start(function() {
      callback(null);
    });
  });
};

/**
 * This callback is supplied by the message bus infrastructure and must be called when a message
 * has been processed successfully or not. If an error occurred during processing, an Error should
 * be returned. Depending on the configuration of the message bus, this may put the message back
 * in the queue for later reprocessing.
 *
 * @callback CommandNextCallback
 * @param {Object|String|Array|Number|Date|Error} [result] - Result of processing the message. If
 * there was an error, then you must supply an Error object. If no results should be returned,
 * then just call `next` with no parameters.
 * @public
 * @alias Client.CommandNextCallback
 * @memberOf Client
 * @see Client.SubscriptionCallback
 */

/**
 * This callback is supplied by the message bus infrastructure and must be called when a message
 * has been processed.
 *
 * @callback EventNextCallback
 * @public
 * @alias Client.EventNextCallback
 * @memberOf Client
 * @see Client.SubscriptionCallback
 */

/**
 * Called when a message is received.
 *
 * @callback SubscriptionCallback
 * @param {!Object|String|Array|Number|Date} parameters - the parameters that were supplied when the message was sent.
 * @param {!Client.CommandNextCallback|MessageBusClient.EventNextCallback} next - the callback to call when finished processing the message.
 * @public
 * @alias Client.SubscriptionCallback
 * @memberOf Client
 *
 * @example
 * //processing command
 * client.on("makeSum", function(parameters, next) {
 *   var result = parameters.reduce(function(prevVal, curVal) {
 *     return prevVal + curVal;
 *   });
 *   next(result);
 * });
 *
 * //processing event
 * client.on("somethingInterestingHappened", function(parameters, next) {
 *   //do something with the parameters, and then ...
 *   next();
 * });
 *
 * @see Client.on
*/

/**
 * Subscribes the client to messages with the given name. When a message with the given name is received,
 * the supplied callback is called with the original parameters.
 *
 * @param {!String} msgName - name of the messages to subscribe to.
 * @param {!Client.SubscriptionCallback} callback - called when a message with the given `msgName` arrives; the callback
 * is called with the following arguments: parameters and a next callback.
 *
 * @public
 */
Client.prototype.on = function(msgName, callback) {
  this._consumeChannel.on(msgName, callback);
};

/**
 * Sends out the given `cmd` with the supplied `parameters` and `options` to backend message bus.
 * When an error occurs or a reply is received, the given `callback` is called. This is an
 * RPC-style method call.
 *
 * @param {!String} cmd - the command to execute
 * @param {!Object|String|Array|Number|Date} parameters - the parameters that go with the command
 * @param {!Object} options - Options that refer to priority, TTL, and so. TBD
 * @param {!RequestCallback} callback - called when the command has been executed or when an error occurred.
 *
 * @public
 *
 * @example
 * client.request("makeSum", [ 1, 2, 3, 4, 5], {}, function(err, reply) {
 *   if (err) {
 *     console.error("Error sending request makeSum:", err);
 *   } else {
 *     console.info("The sum of 1, 2, 3, 4 and 5 is", reply);
 *   }
 * });
 */
Client.prototype.request = function(cmd, parameters, options, callback) {
  this._dispatchChannel.request(cmd, parameters, options, callback);
};

/**
 * Sends out the given `event` with the supplied `parameters` and `options` to backend message bus.
 * When an error occurs, the given optional `callback` is called. This is a publish-subscribe style
 * method call.
 *
 * @param {!String} event - the event to publish
 * @param {!Object|String|Array|Number|Date} parameters - the parameters that go with the event
 * @param {!Object} options - Options that refer to priority, TTL, and so. TBD
 * @param {PublishCallback=} callback - called when the event has been published.
 *
 * @public
 *
 * @example
 * client.publish("processingFinished", { result: "ok" }, {}, function(err) {
 *   if (!err) {
 *     console.log("Event successfully published.");
 *   }
 * });
 */
Client.prototype.publish = function(event, parameters, options, callback) {
  this._dispatchChannel.publish(event, parameters, options, callback);
};

module.exports = Client;
