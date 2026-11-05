'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadRouter() {
  const middleware = [];
  const router = {
    use: (_paths, handler) => middleware.push(handler),
    get() {}, post() {}, put() {}
  };
  const original = Module._load;
  const modulePath = require.resolve('../backend/r2.js');
  delete require.cache[modulePath];
  try {
    Module._load = function(request) {
      if (request === 'express') return {Router: () => router};
      return original.apply(this, arguments);
    };
    return {createRouter: require(modulePath), router, middleware};
  } finally {
    Module._load = original;
  }
}

test('normal startup constructs R2 router and exports the pending schema promise for R3', async () => {
  const previous = process.env.SKIP_SCHEMA_INIT;
  delete process.env.SKIP_SCHEMA_INIT;
  try {
    const {createRouter, router, middleware} = loadRouter();
    const queries = [];
    let finish;
    const ready = new Promise(resolve => {finish = resolve;});
    const pool = {query(sql) {queries.push(sql); return ready;}};
    assert.equal(createRouter(pool), router);
    assert.equal(createRouter.schemaReady, ready);
    assert.equal(queries.length, 1);
    assert.match(queries[0], /CREATE TABLE IF NOT EXISTS r3_projects/);
    let nextCalls = 0;
    middleware[0]({}, {}, error => {assert.ifError(error); nextCalls++;});
    await Promise.resolve();
    assert.equal(nextCalls, 0, 'requests wait until schema initialization finishes');
    finish({rows: []});
    await ready;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nextCalls, 1);
  } finally {
    if (previous === undefined) delete process.env.SKIP_SCHEMA_INIT;
    else process.env.SKIP_SCHEMA_INIT = previous;
  }
});

test('pre-migrated startup performs only a connectivity check and forwards database failures', async () => {
  const previous = process.env.SKIP_SCHEMA_INIT;
  process.env.SKIP_SCHEMA_INIT = '1';
  try {
    const {createRouter, middleware} = loadRouter();
    const queries = [];
    let fail;
    const ready = new Promise((_resolve, reject) => {fail = reject;});
    createRouter({query(sql) {queries.push(sql); return ready;}});
    assert.equal(createRouter.schemaReady, ready);
    assert.deepEqual(queries, ['SELECT 1']);
    const observed = new Promise(resolve => middleware[0]({}, {}, resolve));
    const error = new Error('database unavailable');
    fail(error);
    assert.equal(await observed, error);
  } finally {
    if (previous === undefined) delete process.env.SKIP_SCHEMA_INIT;
    else process.env.SKIP_SCHEMA_INIT = previous;
  }
});
