// jscs:disable jsDoc
var utils = require("../lib/utils");
var assert = require("assert");
var util = require("util");

describe("utils", function() {
  beforeEach(function () {
  });

  afterEach(function () {
  });

  describe(".extend", function () {
    it("should merge two objects with the left-most having highest priority", function (done) {
      var object1 = {
        a: 1,
        b: 2
      };
      var object2 = {
        a: 3,
        c: 5
      };

      var target = utils.extend(object1, object2);

      assert.ok(!util.isNullOrUndefined(target));
      assert.equal(target.a, 1);
      assert.equal(target.b, 2);
      assert.equal(target.c, 5);
      assert.ok(Object.getOwnPropertyNames(target).length, 3);

      done();
    });

    it("should merge one object to the same object", function (done) {
      var object1 = {a: 1};
      var target = utils.extend(object1);

      assert.ok(!util.isNullOrUndefined(target));
      assert.ok(Object.getOwnPropertyNames(target).length, 1);
      assert.equal(target.a, 1);

      done();
    });

    it("should not change the objects", function (done) {
      var object1 = {
        a: 1,
        b: 2
      };
      var object2 = {
        a: 3,
        c: 5
      };

      utils.extend(object1, object2);

      assert.equal(object1.a, 1);
      assert.equal(object1.b, 2);
      assert.ok(Object.getOwnPropertyNames(object1).length, 2);
      assert.equal(object2.a, 3);
      assert.equal(object2.c, 5);
      assert.ok(Object.getOwnPropertyNames(object2).length, 2);

      done();
    });
  });

  describe(".callLater", function() {
    it("should not immediately call the function to be called later", function(done) {
      var count = 0;

      function checkCount() {
        assert.equal(count, 1);
        done();
      }

      utils.callLater(checkCount);
      ++count;
    });
  });

  describe(".endsWith", function() {
    it("should return true when the substring is present at the indicated position", function(done) {
      var string = "hoplahopla";
      var searchString = "hopla";

      assert.ok(utils.endsWith(string, searchString));
      assert.ok(utils.endsWith(string, searchString, searchString.length));
      assert.ok(utils.endsWith(string, searchString, string.length));
      done();
    });
    it("should return false when the substring is not present at the indicated position", function(done) {
      var string = "hoplahopla";
      var searchString = "hopla";

      for (var i = 1; i < searchString.length; ++i) {
        assert.ok(!utils.endsWith(string, searchString, string.length - i));
        assert.ok(!utils.endsWith(string, searchString, searchString.length - i));
      }
      done();
    });
  });

  describe(".findModulesSync", function() {
    it("should find exactly one EventEmitter module", function (done) {
      var EventEmitter = require("events").EventEmitter;
      var path = require("path");
      var modulePath = path.join(path.dirname(module.filename), "./testmodules");
      var modules = utils.findModulesSync(modulePath, EventEmitter);

      assert.equal(Object.getOwnPropertyNames(modules).length, 1);
      assert.ok(modules.hasOwnProperty("TestModule"));
      var testModule = new modules.TestModule();

      var TestModule = require("./testmodules/testmodule");

      assert.ok(!util.isNullOrUndefined(testModule));
      assert.ok(testModule instanceof TestModule);
      done();
    });

    it("should not find a stream.Readable module", function (done) {
      var Readable = require("stream").Readable;
      var path = require("path");
      var modulePath = path.join(path.dirname(module.filename), "./testmodules");
      var modules = utils.findModulesSync(modulePath, Readable);

      assert.equal(Object.getOwnPropertyNames(modules).length, 0);
      done();
    });
  });

  describe(".findModules", function() {
    it("should asynchronously find exactly one EventEmitter module", function (done) {
      var EventEmitter = require("events").EventEmitter;
      var path = require("path");
      var modulePath = path.join(path.dirname(module.filename), "./testmodules");
      var count = 0;

      utils.findModules(modulePath, EventEmitter, function(modules) {
        assert.equal(Object.getOwnPropertyNames(modules).length, 1);
        assert.ok(modules.hasOwnProperty("TestModule"));
        var testModule = new modules.TestModule();

        var TestModule = require("./testmodules/testmodule");

        assert.ok(!util.isNullOrUndefined(testModule));
        assert.ok(testModule instanceof TestModule);

        //check that ++count was called before this callback
        assert.equal(count, 1);
        done();
      });

      ++count;
    });

    it("should not find a stream.Readable module asynchronously", function (done) {
      var Readable = require("stream").Readable;
      var path = require("path");
      var modulePath = path.join(path.dirname(module.filename), "./testmodules");
      var count = 0;

      utils.findModules(modulePath, Readable, function(modules) {
        assert.equal(Object.getOwnPropertyNames(modules).length, 0);

        //check that ++count was called before this callback
        assert.equal(count, 1);
        done();
      });

      ++count;
    });
  });

  describe(".forwardEvent", function() {
    it("should forward an event from one eventemitter to another one under a different name", function (done) {
      var TestModule = require("./testmodules/testmodule");
      var obj1 = new TestModule;
      var obj2 = new TestModule;

      utils.forwardEvent(obj1, "testEvent", obj2, "forwardedEvent");

      obj2.on("forwardedEvent", function() {
        done();
      });
      obj1.on("forwardedEvent", function() {
        throw new Error("'forwardedEvent' should not be thrown from the first object");
      });
      obj2.on("testEvent", function() {
        throw new Error("'testEvent' should not be thrown from the second object");
      });
      obj1.emit("testEvent");
    });

    it("should forward an event from one eventemitter to the same one under a different name", function (done) {
      var TestModule = require("./testmodules/testmodule");
      var obj1 = new TestModule;

      utils.forwardEvent(obj1, "testEvent", obj1, "forwardedEvent");

      obj1.on("forwardedEvent", function() {
        done();
      });
      obj1.emit("testEvent");
    });
  });
});
