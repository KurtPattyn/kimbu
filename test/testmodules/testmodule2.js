"use strict";

var EventEmitter = require("events").EventEmitter;
var util = require("util");

function TestModule2() {
  EventEmitter.call(this);
}
util.inherits(TestModule2, EventEmitter);

module.exports = TestModule2;
