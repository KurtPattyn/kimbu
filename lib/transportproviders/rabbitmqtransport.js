"use strict";

var MessageBusTransport = require("../transport");
var amqp = require("amqplib/callback_api");
var utils = require("../utils");
var DispatchChannel = require("../channel").DispatchChannel;
var ConsumeChannel = require("../channel").ConsumeChannel;
var Message = require("../message");
var util = require("util");
var assert = require("assert");
var konsol = require("konsol")("kimbu");

/**
 * Removes the SIGINT handler from the current process.
 * This method takes into account the different versions of node.
 * In earlier versions of node, the listenerCount needs to be fetched through the EventEmitter
 * object, while in later versions this count can be directly fetched from the event emitter object
 * itself.
 *
 * @param {!Function} handler - a previously registered SIGINT handler.
 * @private
 */
function _removeSIGINTHandler(handler) {
  if (handler) {
    var listenerCount = 0;

    if (!process.listenerCount) {
      var EventEmitter = require("events").EventEmitter;

      listenerCount = EventEmitter.listenerCount(process, "SIGINT");
    } else {
      listenerCount = process.listenerCount("SIGINT");
    }
    if (listenerCount > 0) {
      process.removeListener("SIGINT", handler);
    }
  }
}

/**
 * The default options to connect to RabbitMQ.
 *
 * @type {Object}
 * @property {String} host - The hostname to connect to
 * @property {Number} port - The port to connect to
 * @property {String} vhost - The virtual host to connect to
 * @property {Number} heartbeatSeconds - The interval in seconds to send a heartbeat to the server. If 0, no heartbeat is sent.
 * @property {String} user - The name of the user used to connect to RabbitMQ
 * @property {String} password - The password to use to connect to RabbitMQ
 * @property {Boolean} noDelay - When true enables the TCP_NODELAY option on the underlying TCP connection
 *
 * @readonly
 * @private
*/
var defaultRabbitMQOptions = {
  host: "localhost",
  port: 5672,
  vhost: "",
  heartbeatSeconds: 30,
  user: "guest",
  password: "guest",
  noDelay: true
};

/**
 * The default queue options.
 *
 * @type {Object}
 *
 * @readonly
 * @private
*/
var defaultQueueOptions = {
  durable: true,      //queue will survive service broker restarts, modulo the effect of autoDelete
  noAck: false,       //when true messages will be auto-acked when fetched from the queue
  autoDelete: false,  //queue will be autodeleted when number of consumers drops to zero
  exclusive: false,    //scopes the queue to the connection; only the current connection can access the queue
  messageTtl: undefined,  //expire messages in this queue after messageTtl milliseconds
  deadLetterExchange: null  //name of the exchange to which messages discarded from the queue will be resent.
                            //A message is discarded when it expires or is rejected or nacked, or the queue limit is reached.
};

/**
 * The default message options.
 *
 * @type {Object}
 *
 * @readonly
 * @private
*/
var defaultMessageOptions = {
  expiration: undefined,  //the message will be discarded from a queue once it's been there longer than the given number of milliseconds
  mandatory: true, //if true, the message will be returned if it is not routed to a queue (i.e., if there are no bindings that match its routing key).
  persistent: true, //If truthy, the message will survive broker restarts provided it's in a queue that also survives restarts.

  //not used by RabbitMQ (but may be useful for applications)
  contentType: "application/json", //MIME type for the message content
  contentEncoding: undefined,  //MIME encoding for the message content
  headers: {},    //application specific headers to be carried along with the message content
  correlationId: undefined,  //usually used to match replies to requests, or similar
  replyTo: undefined,        //often used to name a queue to which the receiving application must send replies, in an RPC scenario (many libraries assume this pattern)
  messageId: undefined,      //arbitrary application-specific identifier for the message
  timestamp: undefined,      //timestamp
  type: undefined,           //an arbitrary application-specific type for the message
  appId: undefined           //an arbitrary identifier for the originating application
};

var consumeOptions = {
  priority: 1
};
/**
 * @external RabbitMQMessage
 * @see http://www.squaremobius.net/amqp.node/doc/channel_api.html
 */

/**
 * Converts a RabbitMQ message to a generic {@link Message}.
 *
 * @param {!RabbitMQMessage} rmqMessage - a RabbitMQ message.
 * @returns {?Message}
 * @private
 */
function _rabbitMQMessageToMessage(rmqMessage) {
  var options = {};

  /* istanbul ignore else  */
  if (rmqMessage.properties.hasOwnProperty("expiration")) {
    options.expiration = rmqMessage.properties.expiration;
  }
  /* istanbul ignore else  */
  if (rmqMessage.properties.hasOwnProperty("correlationId")) {
    options.correlationId = rmqMessage.properties.correlationId;
  }
  /* istanbul ignore else  */
  if (rmqMessage.properties.hasOwnProperty("replyTo")) {
    options.replyTo = rmqMessage.properties.replyTo;
  }
  /* istanbul ignore else  */
  if (rmqMessage.properties.hasOwnProperty("messageId")) {
    options.messageId = rmqMessage.properties.messageId;
  }
  /* istanbul ignore else  */
  if (rmqMessage.properties.hasOwnProperty("timestamp")) {
    options.timestamp = rmqMessage.properties.timestamp;
  }
  /* istanbul ignore else  */
  if (rmqMessage.properties.hasOwnProperty("type")) {
    options.type = rmqMessage.properties.type;
  }
  /* istanbul ignore else  */
  if (rmqMessage.properties.hasOwnProperty("appId")) {
    options.appId = rmqMessage.properties.appId;
  }
  /* istanbul ignore else  */
  if (rmqMessage.properties.hasOwnProperty("headers")) {
    options.headers = rmqMessage.properties.headers;
  }
  var parameters = null;

  //else path coverage is ignored, because message content that is not a buffer should not happen
  /* istanbul ignore else  */
  if (util.isBuffer(rmqMessage.content)) {
    //check content length to avoid a JSON parse error on empty content
    if (rmqMessage.content.length > 0) {
      try {
        parameters = JSON.parse(rmqMessage.content);
      } catch (err) {
        //should not happen if message was put on the queue by our library
        /* istanbul ignore next */
        konsol.warn("Error parsing '" + rmqMessage.content + "':", err);
        /* istanbul ignore next */
        return null;
      }
    }
  } else {
    //should not happen; let's handle this in a safe way by ignoring the content
    konsol.warn("RabbitMQ message ignored because it is not a Buffer:", rmqMessage.content);
    parameters = {};
  }
  if (rmqMessage.properties.messageId && util.isString(rmqMessage.properties.messageId) &&
      rmqMessage.properties.messageId.length > 0) {
    return new Message(rmqMessage.properties.messageId, parameters, options);
  } else {
    konsol.warn("Invalid message id detected in message:", rmqMessage.properties.messageId);
    return null;
  }
}

/**
 * Converts a the options of a generic {@link Message} to a Rabbit MQ options.
 *
 * @param {!Message} msg - The generic message containing the options to convert.
 * @returns {Object}
 * @private
 */
function _messageOptionsToRabbitMQMessageOptions(msg) {
  assert(msg instanceof Message);

  var rmqOptions = {};
  var msgOptions = msg.options || {};

  rmqOptions.expiration = msgOptions.expiration || defaultMessageOptions.expiration;
  rmqOptions.correlationId = msgOptions.correlationId || defaultMessageOptions.correlationId;
  rmqOptions.replyTo = msgOptions.replyTo || defaultMessageOptions.replyTo;
  rmqOptions.messageId = msg.name;
  rmqOptions.timestamp = msgOptions.timestamp || defaultMessageOptions.timestamp;
  rmqOptions.type = msgOptions.type || defaultMessageOptions.type;
  rmqOptions.appId = msgOptions.appId || defaultMessageOptions.appId;
  rmqOptions.headers = msgOptions.headers || {};

  rmqOptions = utils.extend(rmqOptions, defaultMessageOptions);

  return rmqOptions;
}

/**
 * RabbitMQTransport implements a physical message bus transport using Rabbit MQ.
 *
 * @class
 * @param {Object=} options - Optional options object; when not specified the {defaultRabbitMQOptions} are used.
 * @param {String} options.host - The hostname to connect to
 * @param {Number} options.port - The port to connect to
 * @param {String} options.vhost - The virtual host to connect to
 * @param {Number} options.heartbeatSeconds - The interval in seconds to send a heartbeat to the server. If 0, no heartbeat is sent.
 * @param {String} options.user - The name of the user used to connect to RabbitMQ
 * @param {String} options.password - The password to use to connect to RabbitMQ
 * @param {Boolean} options.noDelay - When true enables the TCP_NODELAY option on the underlying TCP connection
 *
 * @extends {Transport}
 * @public
*/
function RabbitMQTransport(options) {
  MessageBusTransport.call(this, utils.extend(options || {}, defaultRabbitMQOptions));

  /** @private */
  this._connection = null;
  /** @private */
  this._channel = null;
  /** @private */
  this._messageSequenceNumber = 0;

  this._returnedMessages = [];
}

util.inherits(RabbitMQTransport, MessageBusTransport);

/**
  * @override
  * @inheritDoc
  * @private
*/
RabbitMQTransport.prototype._doConnect = function(callback) {
  //Transport.connect() guarantees that it doesn't call _doConnect if there is already
  //a valid connection
  assert(!this._connection);
  /** @constant
   * @type {Object}
   */
  var self = this;

  /** @constant */
  var options = this.options();
  /** @constant
   * @type {String}
   */
  var amqpUser = options.user;
  /** @constant
   * @type {String}
   */
  var amqpPassword = options.password;
  /** @constant
   * @type {String}
   */
  var amqpHost = options.host;
  /** @constant
   * @type {Number}
   */
  var amqpPort = options.port;
  /** @constant
   * @type {String}
   */
  var amqpVhost = require("querystring").escape(options.vhost);
  /** @constant
   * @type {Number}
   */
  var ampqHeartbeatSecs = options.heartbeatSeconds;
  /** @constant
   * @type {Boolean}
   */
  var amqpNoDelay = options.noDelay;

  /** @constant
   * @type {String}
   */
  var amqpURI = "amqp://" + amqpUser + ":" + amqpPassword + "@" + amqpHost + ":" + amqpPort +
                "/" + amqpVhost + "/?heartbeat=" + ampqHeartbeatSecs;

  konsol.info("Connecting to RabbitMQ host @ %s:%d (URI: %s).", amqpHost, amqpPort, amqpURI);

  //will throw exception when a malformed URI is detected
// jscs:disable jsDoc
  amqp.connect(amqpURI, { noDelay: amqpNoDelay }, function rabbitMQConnectCallback(err, conn) {
// jscs:enable jsDoc
    if (err) {
      callback(err);
    } else {
      //amqplib does not emit an event when the connection is opened
      utils.forwardEvent(conn, "close", self, "disconnected");
      utils.forwardEvent(conn, "error", self, "error");
      utils.forwardEvent(conn, "blocked", self, "blocked");
      utils.forwardEvent(conn, "unblocked", self, "unblocked");

      konsol.info("Connected to RabbitMQ host @ %s:%d.", amqpHost, amqpPort);

      /* istanbul ignore next  */

      //close the connection when the process is interrupted
      self._sigintHandler = self._doDisconnect.bind(self, function() {});
      process.once("SIGINT", self._sigintHandler);  //ignore errors as we are going away anyway

      konsol.info("Creating AMQP channel.");

      //conn.createChannel(function createChannelCallback(err, channel) {
// jscs:disable jsDoc
      conn.createConfirmChannel(function createChannelCallback(err, channel) {
// jscs:enable jsDoc
        /* istanbul ignore next */
        if (err) {
          self._doDisconnect(function(ignore) {
            callback(err);
          });
        } else {
          konsol.info("Created AMQP channel.");
          self._connection = conn;
          self._channel = channel;

          self._channel.prefetch(20);

          //the 'return' event is emitted when a message having the mandatory flag cannot be routed.
          self._channel.on("return", function(msg) {
            if (msg.properties.headers && msg.properties.headers.hasOwnProperty("sequenceNumber")) {
              self._returnedMessages.push(msg.properties.headers.sequenceNumber);
            }
          });

          //the channel will not emit an 'error' event if the connection closes with an error
          //the 'error' event emitted is specific for the channel; so, it is perfectly fine to forward these also without
          //the risk to receive double 'error' events
          utils.forwardEvent(channel, "error", self, "error");

          //we do not redirect the 'close' event as it is already emitted when the connection closes

          callback(null, self);
        }
      });
    }
  });
};

/**
  * @override
  * @inheritDoc
*/
RabbitMQTransport.prototype._doIsConnected = function() {
  return this._connection && this._channel;
};

/**
  * @override
  * @inheritDoc
*/
RabbitMQTransport.prototype._doDisconnect = function(callback) {
  //Transport.disconnect() guarantees that it doesn't call _doDisconnect if the
  //connection is already closed
  assert(this._connection);
  konsol.info("Closing RabbitMQ connection.");

  /** @constant
   * @type {Object}
   */
  var self = this;

  _removeSIGINTHandler(self._sigintHandler);

  self._connection.close(function(err) {
    /* istanbul ignore else  */
    if (!err) {
      self._connection = null;
      self._channel = null;
    }
    konsol.info("RabbitMQ connection closed.");
    callback(err);
  });
};

/**
  * @override
  * @inheritDoc
*/
RabbitMQTransport.prototype._doGetDispatchChannel = function(dispatchChannelName, opts, callback) {
  var self = this;
  var options = {
    durable: true,
    autoDelete: false
  };

  konsol.info("Creating dispatch channel %s on RabbitMQ server.", dispatchChannelName);
  this._channel.assertExchange(dispatchChannelName, "topic", options, function(err, ignore) {
    /* istanbul ignore else */
    if (!err) {
      var queueOptions = {
        exclusive: true,
        autoDelete: true,
        durable: false
      };

      self._channel.assertQueue("", queueOptions, function(err, replyQueue) {
        /* istanbul ignore else */
        if (!err) {
          callback(null, new DispatchChannel(dispatchChannelName, replyQueue.queue, self));
        } else {
          callback(err);
        }
      });
    } else {
      callback(err);
    }
  });
};

/**
 * @override
 * @private
 * @inheritDoc
 */
RabbitMQTransport.prototype._doGetConsumeChannel = function(consumeChannelName,
                                                            dispatchChannelName,
                                                            opts,
                                                            callback) {
  var self = this;

  this._channel.assertQueue(consumeChannelName, {}, function(err, ignore) {
    /* istanbul ignore else */
    if (!err) {
      callback(null, new ConsumeChannel(consumeChannelName, dispatchChannelName, self));
    } else {
      callback(err);
    }
  });
};

/**
  * @override
  * @inheritDoc
  * @private
*/
RabbitMQTransport.prototype._doPublish = function(exchangeName, msg, routingKey, callback) {
  var self = this;
  var rmqOptions = _messageOptionsToRabbitMQMessageOptions(msg);

  rmqOptions.headers.sequenceNumber = self._messageSequenceNumber++;

  konsol.info("Publishing message %j to %s.", msg, exchangeName.length === 0 ? routingKey :
                                                                                exchangeName);
  try {
    //TODO: should reconnect channel when it is disconnected by a publish error
    this.once("error", callback);
    this._channel.publish(exchangeName, routingKey,
                          new Buffer(JSON.stringify(msg.parameters)), rmqOptions, function(err) {
      self.removeListener("error", callback);
      var error = err;
      var idx = self._returnedMessages.indexOf(rmqOptions.headers.sequenceNumber);

      if (idx > -1) {
        self._returnedMessages.splice(idx, 1);
        /* istanbul ignore else */
        if (!error) {
          error = new Error("unroutable message");
        }
      }
      if (error) {
        callback(new Error(util.format("Failed to deliver %j to exchange %s (%s)", msg,
                                                                                   exchangeName,
                                                                                   error.message)));
      } else {
        callback();
      }
    });
  } catch(err) {
    /* istanbul ignore next */
    callback(err);
  }
};

/**
 * @override
 * @inheritDoc
 * @private
 */
RabbitMQTransport.prototype._doPurge = function(queueName, callback) {
  try {
    this._channel.purgeQueue(queueName, function(err, reply) {
      /* istanbul ignore else */
      if (!err) {
        konsol.info("Purged %d messages from queue %s", reply.messageCount, queueName);
      }
      callback(err);
    });
  } catch(err) {
    callback(err);
  }
};

/**
  * @override
  * @inheritDoc
  * @private
*/
RabbitMQTransport.prototype._doConsume = function(queueName, options, callback, successCallback) {
  var self = this;

  konsol.info("Consuming from queue %s.", queueName);
  this._channel.consume(queueName, function(msg) {
    /* istanbul ignore else  */
    if (msg) {
      var message = _rabbitMQMessageToMessage(msg);

      /* istanbul ignore else */
      if (message) {
        callback.call(self, message, function() {
          self._channel.ack(msg);
        });
      } else {
        self._channel.ack(msg);
      }
    }
  }, options, successCallback);
};

/**
 * @override
 * @inheritDoc
 * @private
 */
RabbitMQTransport.prototype._doCancelConsume = function(subscriptionId, callback) {
  var self = this;

  konsol.info("Unsubscribing from subscription %s.", subscriptionId);
  this._channel.cancel(subscriptionId, function(err, ok) {
    callback(err);
  });
};

/**
 * @override
 * @inheritDoc
 * @private
 */
RabbitMQTransport.prototype._doBind = function(consumerName, publisherName, bindingKey, callback) {
  this._channel.bindQueue(consumerName, publisherName, bindingKey, {}, callback);
};

/**
 * @override
 * @inheritDoc
 * @private
 */
RabbitMQTransport.prototype._doUnbind = function(consumerName,
                                                 publisherName,
                                                 bindingKey,
                                                 callback) {
  this._channel.unbindQueue(consumerName, publisherName, bindingKey, {}, callback);
};

module.exports = RabbitMQTransport;
