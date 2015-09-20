"use strict";

var Message = require("../lib/message");
var assert = require("assert");
var util = require("util");

describe("Message", function() {
  beforeEach(function () {
  });

  afterEach(function () {
  });

  describe("constructor", function () {
    var parameters = {
      a: 1,
      b: 2
    };
    var options = {
      option1: 3
    };

    it("should fill in the supplied parameters correctly", function (done) {
      var msg = new Message("mymessage", parameters, options);

      assert.equal(msg.name, "mymessage");
      assert.ok(util.isObject(msg.parameters));
      assert.equal(JSON.stringify(msg.parameters), JSON.stringify(parameters));
      assert.equal(JSON.stringify(msg.options), JSON.stringify(options));
      done();
    });

    it("should support parameters of type Array", function (done) {
      var msg = new Message("mymessage", [parameters], options);

      assert.equal(msg.name, "mymessage");
      assert.ok(util.isArray(msg.parameters));
      assert.equal(JSON.stringify(msg.parameters), JSON.stringify([parameters]));
      assert.equal(JSON.stringify(msg.options), JSON.stringify(options));
      done();
    });

    it("should support parameters of type String", function (done) {
      var msg = new Message("mymessage", "parameters", options);

      assert.equal(msg.name, "mymessage");
      assert.ok(util.isString(msg.parameters));
      assert.strictEqual(msg.parameters, "parameters");
      assert.equal(JSON.stringify(msg.options), JSON.stringify(options));
      done();
    });

    it("should support parameters of type Number", function (done) {
      var msg = new Message("mymessage", 3, options);

      assert.equal(msg.name, "mymessage");
      assert.ok(util.isNumber(msg.parameters));
      assert.strictEqual(msg.parameters, 3);
      assert.equal(JSON.stringify(msg.options), JSON.stringify(options));
      done();
    });

    it("should support parameters of type Date", function (done) {
      var date = new Date();
      var msg = new Message("mymessage", date, options);

      assert.equal(msg.name, "mymessage");
      assert.ok(util.isDate(msg.parameters));
      assert.strictEqual(msg.parameters, date);
      assert.equal(JSON.stringify(msg.options), JSON.stringify(options));
      done();
    });

    it("should support an empty options hash", function (done) {
      var msg = new Message("mymessage", parameters, {});

      assert.equal(msg.name, "mymessage");
      assert.equal(JSON.stringify(msg.parameters), JSON.stringify(parameters));
      assert.equal(JSON.stringify(msg.options), JSON.stringify({}));
      done();
    });

    it("should support a null options hash", function (done) {
      var msg = new Message("mymessage", parameters, null);

      assert.equal(msg.name, "mymessage");
      assert.equal(JSON.stringify(msg.parameters), JSON.stringify(parameters));
      assert.ok(util.isNull(msg.options));
      done();
    });

    it("should support an undefined options hash", function (done) {
      var msg = new Message("mymessage", parameters);

      assert.equal(msg.name, "mymessage");
      assert.equal(JSON.stringify(msg.parameters), JSON.stringify(parameters));
      assert.ok(util.isUndefined(msg.options));
      done();
    });

    it("should throw an assertion failure with a non-String messageName", function(done) {
      assert.throws(function() {
        new Message({a: 1}, parameters, options);
      }, /AssertionError/,
      "Should throw an AssertionError");
      done();
    });

    it("should throw an assertion failure with a zero-length messageName", function(done) {
      assert.throws(function() {
          new Message("", parameters, options);
        }, /AssertionError/,
        "Should throw an AssertionError");
      done();
    });

    it("should throw an assertion failure with a null messageName", function(done) {
      assert.throws(function() {
          new Message(null, parameters, options);
        }, /AssertionError/,
        "Should throw an AssertionError");
      done();
    });

    it("should throw an assertion failure with a non-Object options hash", function(done) {
      assert.throws(function() {
          new Message(null, parameters, "String options");
        }, /AssertionError/,
        "Should throw an AssertionError");
      done();
    });
  });
});
