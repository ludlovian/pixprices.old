#!/usr/bin/env node
import sade from 'sade';
import { format } from 'util';
import { get as get$1 } from 'https';
import { stat, writeFile, unlink } from 'fs/promises';
import { pipeline as pipeline$1 } from 'stream/promises';
import { createReadStream } from 'fs';
import { extname } from 'path';
import mime from 'mime/lite.js';
import { createHash } from 'crypto';

function sortBy (name, desc) {
  const fn = typeof name === 'function' ? name : x => x[name];
  const parent = typeof this === 'function' ? this : null;
  const direction = desc ? -1 : 1;
  sortFunc.thenBy = sortBy;
  return sortFunc

  function sortFunc (a, b) {
    return (parent && parent(a, b)) || direction * compare(a, b, fn)
  }

  function compare (a, b, fn) {
    const va = fn(a);
    const vb = fn(b);
    return va < vb ? -1 : va > vb ? 1 : 0
  }
}

function once (fn) {
  function f (...args) {
    if (f.called) return f.value
    f.value = fn(...args);
    f.called = true;
    return f.value
  }

  if (fn.name) {
    Object.defineProperty(f, 'name', { value: fn.name, configurable: true });
  }

  return f
}

function arrify (x) {
  return Array.isArray(x) ? x : [x]
}

function clone (o) {
  if (!o || typeof o !== 'object') return o
  if (o instanceof Date) return new Date(o)
  if (Array.isArray(o)) return o.map(clone)
  return Object.entries(o).reduce((o, [k, v]) => {
    o[k] = clone(v);
    return o
  }, {})
}

const kNext$1 = Symbol('next');
const kChain$1 = Symbol('chain');

class Chain {
  constructor (hooks = {}) {
    this.tail = new Link(this, {});
    Object.assign(this, hooks);
  }

  add (data, end) {
    const newLink = new Link(this, data);
    if (end) newLink[kNext$1] = newLink;
    this.tail[kNext$1] = newLink;
    return (this.tail = newLink)
  }

  atEnd () {}
}

class Link {
  constructor (chain, data) {
    Object.defineProperties(this, {
      [kChain$1]: { value: chain, configurable: true },
      [kNext$1]: { configurable: true, writable: true }
    });
    return Object.assign(this, data)
  }

  next () {
    return this[kNext$1] ? this[kNext$1] : (this[kNext$1] = this[kChain$1].atEnd())
  }
}

function Pipe () {
  const chain = new Chain({
    atEnd: () => new Promise(resolve => (chain.tail.resolve = resolve))
  });
  let curr = chain.tail;
  return [
    { [Symbol.asyncIterator]: () => ({ next }) },
    {
      write: value => write({ value }),
      close: _ => write({ done: true }),
      throw: error => write({ error })
    }
  ]

  function write (item) {
    const prev = chain.tail;
    if (prev.done) return
    item = chain.add(item, item.done);
    if (prev.resolve) prev.resolve(item);
  }

  async function next () {
    const { value, done, error } = (curr = await curr.next());
    if (error) {
      curr = chain.add({ done: true }, true);
      throw error
    }
    return { value, done }
  }
}

const has = Object.prototype.hasOwnProperty;

function equal (a, b) {
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a.constructor !== b.constructor
  ) {
    return a === b
  }
  if (a instanceof Date) return +a === +b
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!equal(a[i], b[i])) return false
    }
    return true
  }
  for (const k of Object.keys(a)) {
    if (!has.call(b, k) || !equal(a[k], b[k])) return false
  }
  return Object.keys(a).length === Object.keys(b).length
}

const AITER = Symbol.asyncIterator;
const SITER = Symbol.iterator;
/* c8 ignore next */
const EMPTY = () => {};
const kIter = Symbol('iterator');
const kChain = Symbol('chain');
const kRead = Symbol('read');
const kNext = Symbol('next');

class Teme {
  static fromIterable (iterable) {
    return Teme.fromIterator(iterable[AITER]())
  }

  static fromIterator (iter) {
    const t = new Teme();
    return Object.defineProperties(t, {
      [kNext]: { value: () => iter.next(), configurable: true },
      [AITER]: { value: () => t[kIter](), configurable: true }
    })
  }

  constructor () {
    const chain = new Chain({ atEnd: () => this[kRead]() });
    Object.defineProperty(this, kChain, { value: chain, configurable: true });
  }

  [kIter] () {
    let curr = this[kChain].tail;
    return { next: async () => (curr = await curr.next()) }
  }

  async [kRead] () {
    const chain = this[kChain];
    try {
      const item = await this[kNext]();
      return chain.add(item, !!item.done)
    } catch (error) {
      chain.add({ done: true }, true);
      throw error
    }
  }

  get current () {
    const { value, done } = this[kChain].tail;
    return { value, done }
  }

  get isSync () {
    return false
  }

  get isAsync () {
    return !this.isSync
  }

  toAsync () {
    return this
  }

  copy () {
    return Teme.fromIterator(this[AITER]())
  }

  map (fn, ctx) {
    const it = this[AITER]();
    return Teme.fromIterator({
      async next () {
        const { value, done } = await it.next();
        if (done) return { done }
        return { value: await fn(value, ctx) }
      }
    })
  }

  filter (fn) {
    const it = this[AITER]();
    return Teme.fromIterator({
      async next () {
        while (true) {
          const { value, done } = await it.next();
          if (done) return { done }
          if (await fn(value)) return { value }
        }
      }
    })
  }

  async collect () {
    const arr = [];
    for await (const v of this) arr.push(v);
    return arr
  }

  sort (fn) {
    let it;
    const c = this.copy();
    return Teme.fromIterator({
      async next () {
        if (!it) {
          const arr = await c.collect();
          it = arr.sort(fn)[SITER]();
        }
        return it.next()
      }
    })
  }

  each (fn, ctx) {
    return this.map(async v => {
      await fn(v, ctx);
      return v
    })
  }

  scan (fn, accum) {
    return this.map(async v => {
      accum = await fn(accum, v);
      return accum
    })
  }

  group (fn) {
    const it = this[AITER]();
    let tgt = EMPTY;
    let key = EMPTY;
    let item = {};

    return Teme.fromIterator({ next })

    async function next () {
      if (item.done) return item
      while (equal(key, tgt)) {
        item = await it.next();
        if (item.done) return item
        key = fn(item.value);
      }
      tgt = key;
      const grouper = Teme.fromIterator({ next: gnext });
      const value = [key, grouper];
      return { value }
    }

    async function gnext () {
      if (!equal(key, tgt)) return { done: true }
      const _item = item;
      item = await it.next();
      if (!item.done) key = fn(item.value);
      return _item
    }
  }

  batch (size) {
    let n = 0;
    const addCtx = value => ({ value, seq: Math.floor(n++ / size) });
    const remCtx = ({ value }) => value;
    const seqKey = ({ seq }) => seq;
    const pullGroup = ([, group]) => group.map(remCtx);
    return this.map(addCtx)
      .group(seqKey)
      .map(pullGroup)
  }

  dedupe (fn = equal) {
    let prev = EMPTY;
    return this.filter(v => {
      if (fn(prev, v)) return false
      prev = v;
      return true
    })
  }

  consume () {
    return this.on(() => undefined)
  }

  async on (fn, ctx) {
    for await (const v of this) {
      await fn(v, ctx);
    }
  }
}

class TemeSync extends Teme {
  static fromIterable (iterable) {
    return TemeSync.fromIterator(iterable[SITER]())
  }

  static fromIterator (iter) {
    const t = new TemeSync();
    return Object.defineProperties(t, {
      [kNext]: { value: () => iter.next(), configurable: true },
      [SITER]: { value: () => t[kIter](), configurable: true }
    })
  }

  [kIter] () {
    let curr = this[kChain].tail;
    return { next: () => (curr = curr.next()) }
  }

  [kRead] () {
    const chain = this[kChain];
    try {
      const item = this[kNext]();
      return chain.add(item, !!item.done)
    } catch (error) {
      chain.add({ done: true }, true);
      throw error
    }
  }

  get isSync () {
    return true
  }

  toAsync () {
    const it = this[SITER]();
    return Teme.fromIterator({
      next: () => Promise.resolve(it.next())
    })
  }

  copy () {
    return TemeSync.fromIterator(this[SITER]())
  }

  map (fn, ctx) {
    const it = this[SITER]();
    return TemeSync.fromIterator({
      next () {
        const { value, done } = it.next();
        if (done) return { done }
        return { value: fn(value, ctx) }
      }
    })
  }

  filter (fn) {
    const it = this[SITER]();
    return TemeSync.fromIterator({
      next () {
        while (true) {
          const { value, done } = it.next();
          if (done) return { done }
          if (fn(value)) return { value }
        }
      }
    })
  }

  collect () {
    return [...this]
  }

  sort (fn) {
    let it;
    const c = this.copy();
    return TemeSync.fromIterator({
      next () {
        if (!it) {
          const arr = c.collect();
          it = arr.sort(fn)[SITER]();
        }
        return it.next()
      }
    })
  }

  each (fn, ctx) {
    return this.map(v => {
      fn(v, ctx);
      return v
    })
  }

  scan (fn, accum) {
    return this.map(v => {
      accum = fn(accum, v);
      return accum
    })
  }

  group (fn) {
    const it = this[SITER]();
    let tgt = EMPTY;
    let key = EMPTY;
    let item = {};

    return TemeSync.fromIterator({ next })

    function next () {
      if (item.done) return item
      while (equal(key, tgt)) {
        item = it.next();
        if (item.done) return item
        key = fn(item.value);
      }
      tgt = key;
      const grouper = TemeSync.fromIterator({ next: gnext });
      const value = [key, grouper];
      return { value }
    }

    function gnext () {
      if (!equal(key, tgt)) return { done: true }
      const _item = item;
      item = it.next();
      if (!item.done) key = fn(item.value);
      return _item
    }
  }

  on (fn, ctx) {
    for (const v of this) {
      fn(v, ctx);
    }
  }
}

function join (...sources) {
  const iters = sources.map(makeIter);
  const nexts = iters.map(makeNext);

  return Teme.fromIterator({ next })

  async function next () {
    while (true) {
      if (!nexts.some(Boolean)) return { done: true }
      const [item, ix] = await Promise.race(nexts.filter(Boolean));
      const { done, value } = item;
      if (done) {
        nexts[ix] = null;
      } else {
        nexts[ix] = makeNext(iters[ix], ix);
        return { value: [value, ix] }
      }
    }
  }

  function makeIter (src) {
    if (src[AITER]) return src[AITER]()
    const it = src[SITER]();
    return { next: async () => it.next() }
  }

  function makeNext (iter, index) {
    return Promise.resolve(iter.next())
      .then(item => [item, index])
      .catch(err => {
        nexts.splice(0);
        throw Object.assign(err, { index })
      })
  }
}

function teme (s) {
  if (s instanceof Teme) return s
  if (typeof s[SITER] === 'function') return TemeSync.fromIterable(s)
  if (typeof s[AITER] === 'function') return Teme.fromIterable(s)
  throw new Error('Not iterable')
}

teme.join = join;

teme.pipe = function pipe () {
  const [reader, writer] = new Pipe();
  return Object.assign(Teme.fromIterable(reader), writer)
};

teme.isTeme = function isTeme (t) {
  return t instanceof Teme
};

const allColours = (
  '20,21,26,27,32,33,38,39,40,41,42,43,44,45,56,57,62,63,68,69,74,75,76,' +
  '77,78,79,80,81,92,93,98,99,112,113,128,129,134,135,148,149,160,161,' +
  '162,163,164,165,166,167,168,169,170,171,172,173,178,179,184,185,196,' +
  '197,198,199,200,201,202,203,204,205,206,207,208,209,214,215,220,221'
)
  .split(',')
  .map(x => parseInt(x, 10));

const painters = [];

function makePainter (n) {
  const CSI = '\x1b[';
  const set = CSI + (n < 8 ? n + 30 + ';22' : '38;5;' + n + ';1') + 'm';
  const reset = CSI + '39;22m';
  return s => {
    if (!s.includes(CSI)) return set + s + reset
    return removeExcess(set + s.replaceAll(reset, reset + set) + reset)
  }
}

function painter (n) {
  if (painters[n]) return painters[n]
  painters[n] = makePainter(n);
  return painters[n]
}

// eslint-disable-next-line no-control-regex
const rgxDecolour = /(^|[^\x1b]*)((?:\x1b\[[0-9;]+m)|$)/g;
function truncate (string, max) {
  max -= 2; // leave two chars at end
  if (string.length <= max) return string
  const parts = [];
  let w = 0;
  for (const [, txt, clr] of string.matchAll(rgxDecolour)) {
    parts.push(txt.slice(0, max - w), clr);
    w = Math.min(w + txt.length, max);
  }
  return removeExcess(parts.join(''))
}

// eslint-disable-next-line no-control-regex
const rgxSerialColours = /(?:\x1b\[[0-9;]+m)+(\x1b\[[0-9;]+m)/g;
function removeExcess (string) {
  return string.replaceAll(rgxSerialColours, '$1')
}

function randomColour () {
  const n = Math.floor(Math.random() * allColours.length);
  return allColours[n]
}

const colours = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7
};

const CLEAR_LINE = '\r\x1b[0K';

const state = {
  dirty: false,
  width: process.stdout && process.stdout.columns,
  /* c8 ignore next */
  level: process.env.LOGLEVEL ? parseInt(process.env.LOGLEVEL, 10) : undefined,
  write: process.stdout.write.bind(process.stdout)
};

process.stdout &&
  process.stdout.on('resize', () => (state.width = process.stdout.columns));

function _log (
  args,
  { newline = true, limitWidth, prefix = '', level, colour }
) {
  if (level && (!state.level || state.level < level)) return
  const msg = format(...args);
  let string = prefix + msg;
  if (colour != null) string = painter(colour)(string);
  if (limitWidth) string = truncate(string, state.width);
  if (newline) string = string + '\n';
  if (state.dirty) string = CLEAR_LINE + string;
  state.dirty = !newline && !!msg;
  state.write(string);
}

function makeLogger (base, changes = {}) {
  const baseOptions = base ? base._preset : {};
  const options = {
    ...baseOptions,
    ...changes,
    prefix: (baseOptions.prefix || '') + (changes.prefix || '')
  };
  const configurable = true;
  const fn = (...args) => _log(args, options);
  const addLevel = level => makeLogger(fn, { level });
  const addColour = c =>
    makeLogger(fn, { colour: c in colours ? colours[c] : randomColour() });
  const addPrefix = prefix => makeLogger(fn, { prefix });
  const status = () => makeLogger(fn, { newline: false, limitWidth: true });

  const colourFuncs = Object.fromEntries(
    Object.entries(colours).map(([name, n]) => [
      name,
      { value: painter(n), configurable }
    ])
  );

  return Object.defineProperties(fn, {
    _preset: { value: options, configurable },
    _state: { value: state, configurable },
    name: { value: 'log', configurable },
    level: { value: addLevel, configurable },
    colour: { value: addColour, configurable },
    prefix: { value: addPrefix, configurable },
    status: { get: status, configurable },
    ...colourFuncs
  })
}

const log = makeLogger();

function toSerial (dt) {
  const ms = dt.getTime();
  const localMs = ms - dt.getTimezoneOffset() * 60 * 1000;
  const localDays = localMs / (1000 * 24 * 60 * 60);
  const epochStart = 25569;
  return epochStart + localDays
}

function toDate (serial) {
  const epochStart = 25569;
  const ms = (serial - epochStart) * 24 * 60 * 60 * 1000;
  const tryDate = new Date(ms);
  const offset = tryDate.getTimezoneOffset() * 60 * 1000;
  return new Date(ms + offset)
}

function clean (obj) {
  const ret = {};
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    if (v !== undefined) ret[k] = v;
  }
  return ret
}

const debug$9 = log
  .prefix('googlejs:datastore:')
  .colour()
  .level(5);

class Table {
  constructor (kind) {
    this.kind = kind;
  }

  async * fetch ({ where, order, factory, ...rest } = {}) {
    if (factory && !(factory.prototype instanceof Row)) {
      throw new Error('Factory for new rows must subclass Row')
    }
    const datastore = await getDatastoreAPI(rest);
    let query = datastore.createQuery(this.kind);
    if (where && typeof where === 'object') {
      if (!Array.isArray(where)) where = Object.entries(where);
      for (const args of where) {
        query = query.filter(...args);
      }
    }
    if (Array.isArray(order)) {
      for (const args of order) {
        query = query.order(...arrify(args));
      }
    }
    const Factory = factory || Row;
    for await (const entity of query.runStream()) {
      yield new Factory(entity, datastore);
    }
  }

  async select (options) {
    const entities = await teme(this.fetch(options)).collect();
    debug$9('%d records loaded from %s', entities.length, this.kind);
    return entities
  }

  async insert (rows) {
    const datastore = await getDatastoreAPI();
    const { kind } = this;
    for (const entities of getEntities(rows, { kind, datastore })) {
      await datastore.insert(entities);
      debug$9('%d records inserted to %s', entities.length, this.kind);
    }
  }

  async update (rows) {
    const datastore = await getDatastoreAPI();
    const { kind } = this;
    for (const entities of getEntities(rows, { kind, datastore })) {
      await datastore.update(entities);
      debug$9('%d records updated to %s', entities.length, this.kind);
    }
  }

  async upsert (rows) {
    const datastore = await getDatastoreAPI();
    const { kind } = this;
    for (const entities of getEntities(rows, { kind, datastore })) {
      await datastore.upsert(entities);
      debug$9('%d records upserted to %s', entities.length, this.kind);
    }
  }

  async delete (rows) {
    const datastore = await getDatastoreAPI();
    for (const keys of getKeys(rows)) {
      await datastore.delete(keys);
      debug$9('%d records deleted from %s', keys.length, this.kind);
    }
  }
}

const KEY = Symbol('rowKey');
const PREV = Symbol('prev');

class Row {
  constructor (entity, datastore) {
    Object.assign(this, clone(clean(entity)));
    Object.defineProperties(this, {
      [KEY]: { value: entity[datastore.KEY], configurable: true },
      [PREV]: { value: clone(entity), configurable: true }
    });
  }

  get _key () {
    return this[KEY]
  }

  _changed () {
    // unwrap from class and clean before comparing
    return !equal(clean(this), this[PREV])
  }
}

const getDatastoreAPI = once(async function getDatastoreAPI ({
  credentials = 'credentials.json'
} = {}) {
  const { Datastore } = await import('@google-cloud/datastore');
  if (credentials) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentials;
  }

  const datastore = new Datastore();
  return datastore
});

function getEntities (arr, { kind, datastore, size = 400 }) {
  return teme(arrify(arr))
    .filter(row => !(row instanceof Row) || row._changed())
    .map(row => ({
      key: row._key || datastore.key([kind]),
      data: clone(row)
    }))
    .batch(size)
    .map(group => group.collect())
}

function getKeys (arr, { size = 400 } = {}) {
  return teme(arrify(arr))
    .filter(row => row instanceof Row)
    .map(row => row._key)
    .batch(size)
    .map(group => group.collect())
}

class IndexedTable extends Table {
  constructor (name) {
    super(name);
    this.name = name;
    this.ix = {};
  }

  async load () {
    const rows = await super.select({ factory: this.factory });
    if (this.order) rows.sort(this.order);
    for (const k in this.ix) this.ix[k].rebuild(rows);
    this._changed = new Set();
    this._deleted = new Set();
  }

  async save () {
    const changed = [...this._changed];
    const deleted = [...this._deleted];
    if (changed.length) {
      await super.upsert(changed);
    }

    if (deleted.length) {
      await super.delete(deleted);
    }
  }

  set (data) {
    const row = this.ix.main.get(data);
    if (row) {
      Object.assign(row, data);
      this._changed.add(row);
      return row
    } else {
      const row = { ...data };
      for (const k in this.ix) this.ix[k].add(row);
      this._changed.add(row);
      return row
    }
  }

  delete (data) {
    const row = this.ix.main.get(data);
    if (!row) return
    for (const k in this.ix) this.ix[k].delete(row);
    this._deleted.add(row);
    return row
  }

  values () {
    return this.ix.main ? this.ix.main.map.values() : []
  }
}

class Index {
  constructor (fn) {
    this.fn = fn;
    this.map = new Map();
  }

  rebuild (rows) {
    this.map.clear();
    for (const row of rows) {
      this.add(row);
    }
  }

  add (row) {
    const key = this.fn(row);
    const entry = this.map.get(key);
    if (entry) {
      entry.add(row);
    } else {
      this.map.set(key, new Set([row]));
    }
  }

  delete (row) {
    const key = this.fn(row);
    const entry = this.map.get(key);
    if (!entry) return
    entry.delete(row);
    if (!entry.size) this.map.delete(key);
  }

  get (data) {
    const key = this.fn(data);
    return this.map.get(key) || []
  }
}

class UniqueIndex extends Index {
  add (row) {
    const key = this.fn(row);
    this.map.set(key, row);
  }

  delete (row) {
    const key = this.fn(row);
    this.map.delete(key);
  }

  get (data) {
    const key = this.fn(data);
    return this.map.get(key)
  }
}

class Portfolio {
  constructor () {
    this.stocks = new Stocks();
    this.positions = new Positions();
    this.trades = new Trades();
  }

  async load () {
    await Promise.all([
      this.stocks.load(),
      this.positions.load(),
      this.trades.load()
    ]);
  }

  async save () {
    await Promise.all([
      this.stocks.save(),
      this.positions.save(),
      this.trades.save()
    ]);
  }
}

class Stocks extends IndexedTable {
  constructor () {
    super('Stock');
    this.factory = Stock;
    this.order = sortBy('ticker');
    this.ix.main = new UniqueIndex(({ ticker }) => ticker);
  }

  get (ticker) {
    return this.ix.main.get({ ticker })
  }
}

class Stock extends Row {}

class Positions extends IndexedTable {
  constructor () {
    super('Position');
    this.factory = Position;
    this.order = sortBy('ticker')
      .thenBy('who')
      .thenBy('account');
    this.ix.main = new UniqueIndex(
      ({ ticker, who, account }) => `${ticker}_${who}_${account}`
    );
  }
}

class Position extends Row {}

class Trades extends IndexedTable {
  constructor () {
    super('Trade');
    this.factory = Trade;
    this.order = sortBy('who')
      .thenBy('account')
      .thenBy('ticker')
      .thenBy('seq');
    this.ix.main = new UniqueIndex(
      ({ who, account, ticker, seq }) => `${who}_${account}_${ticker}_${seq}`
    );

    this.ix.position = new Index(
      ({ who, account, ticker }) => `${who}_${account}_${ticker}`
    );
  }

  setTrades (data) {
    const existing = [...this.ix.position.get(data[0])];
    existing.sort(sortBy('seq'));
    let seq = 1;
    for (const row of data) {
      this.set({ ...row, seq });
      seq++;
    }
    for (const row of existing.slice(data.length)) {
      this.delete(row);
    }
  }
}

class Trade extends Row {}

const SCOPES$1 = {
  rw: ['https://www.googleapis.com/auth/spreadsheets'],
  ro: ['https://www.googleapis.com/auth/spreadsheets.readonly']
};

const scopes = SCOPES$1;

async function getRange ({ sheet, range, ...options }) {
  const sheets = await getSheetAPI(options);

  const query = {
    spreadsheetId: sheet,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE'
  };

  const response = await sheets.spreadsheets.values.get(query);

  if (response.status !== 200) {
    throw Object.assign(Error('Failed to read sheet'), { response })
  }
  return response.data.values
}

async function updateRange ({ sheet, range, data, ...options }) {
  const sheets = await getSheetAPI(options);

  data = data.map(row =>
    row.map(val => (val instanceof Date ? toSerial(val) : val))
  );

  const query = {
    spreadsheetId: sheet,
    range,
    valueInputOption: 'RAW',
    resource: {
      range,
      majorDimension: 'ROWS',
      values: data
    }
  };
  const response = await sheets.spreadsheets.values.update(query);

  if (response.status !== 200) {
    throw Object.assign(Error('Failed to update sheet'), { response })
  }
}

const getSheetAPI = once(async function getSheetAPI ({
  credentials = 'credentials.json',
  scopes = SCOPES$1.ro
} = {}) {
  const sheetsApi = await import('@googleapis/sheets');
  if (credentials) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentials;
  }

  const auth = new sheetsApi.auth.GoogleAuth({ scopes });
  const authClient = await auth.getClient();
  return sheetsApi.sheets({ version: 'v4', auth: authClient })
});

const SCOPES = {
  rw: ['https://www.googleapis.com/auth/drive'],
  ro: ['https://www.googleapis.com/auth/drive.readonly']
};

async function * list ({ folder, ...options }) {
  const drive = await getDriveAPI(options);
  const query = {
    fields: 'nextPageToken, files(id, name, mimeType, parents)'
  };

  if (folder) query.q = `'${folder}' in parents`;

  let pResponse = drive.files.list(query);

  while (pResponse) {
    const response = await pResponse;
    const { status, data } = response;
    if (status !== 200) {
      throw Object.assign(new Error('Bad result reading folder'), { response })
    }

    // fetch the next one if there is more
    if (data.nextPageToken) {
      query.pageToken = data.nextPageToken;
      pResponse = drive.files.list(query);
    } else {
      pResponse = null;
    }

    for (const file of data.files) {
      yield file;
    }
  }
}

const getDriveAPI = once(async function getDriveAPI ({
  credentials = 'credentials.json',
  scopes = SCOPES.ro
} = {}) {
  const driveApi = await import('@googleapis/drive');
  if (credentials) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentials;
  }

  const auth = new driveApi.auth.GoogleAuth({ scopes });
  const authClient = await auth.getClient();
  return driveApi.drive({ version: 'v3', auth: authClient })
});

const debug$8 = log
  .prefix('sheets:')
  .colour()
  .level(3);

const INVESTMENTS_FOLDER = '0B_zDokw1k2L7VjBGcExJeUxLSlE';

async function getPortfolioSheet () {
  const data = await getSheetData('Portfolio', 'Investments!A:AM');
  debug$8('Portfolio data retrieved');
  return data
}

async function getTradesSheet$1 () {
  const data = await getSheetData('Trades', 'Trades!A2:F');
  debug$8('Trade data retrieved');
  return data
}

async function getStocksSheet () {
  const data = await getSheetData('Stocks', 'Stocks!A:D');
  debug$8('Stocks data retrieved');
  return data
}

async function updatePositionsSheet (data) {
  await overwriteSheetData('Positions', 'Positions!A2:I', data);
  await putSheetData('Positions', 'Positions!K1', [[new Date()]]);
  debug$8('Positions data updated');
}

async function updateTradesSheet (data) {
  await overwriteSheetData('Positions', 'Trades!A2:G', data);
  debug$8('Trades data updated');
}

async function overwriteSheetData (sheetName, range, data) {
  const currData = await getSheetData(sheetName, range);
  const lastRow = findLastRow(currData || [[]]);
  const firstRow = data[0];
  while (data.length < lastRow + 1) {
    data.push(firstRow.map(() => ''));
  }

  const newRange = range.replace(/\d+$/, '') + (data.length + 1);
  await putSheetData(sheetName, newRange, data);
}

async function getSheetData (sheetName, range) {
  const sheetList = await locateSheets();
  const sheet = sheetList.get(sheetName).id;

  return getRange({ sheet, range, scopes: scopes.rw })
}

async function putSheetData (sheetName, range, data) {
  const sheetList = await locateSheets();
  const sheet = sheetList.get(sheetName).id;

  await updateRange({ sheet, range, data, scopes: scopes.rw });
}

const locateSheets = once(async function locateSheets () {
  const m = new Map();
  const files = list({ folder: INVESTMENTS_FOLDER });
  for await (const file of files) {
    m.set(file.name, file);
  }
  return m
});

function findLastRow (rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].some(Boolean)) {
      return i
    }
  }
  return -1
}

const debug$7 = log
  .prefix('import-portfolio:')
  .colour()
  .level(2);

const DEFAULT_TICKER_COLUMN = 10; // column K
const DEFAULT_ACCOUNT_COLUMN = 0; // column A
const DEFAULT_ACCOUNT_LIST =
  'AJL,ISA;RSGG,ISA;AJL,Dealing;RSGG,Dealing;AJL,SIPP;RSGG,SIPP;RSGG,SIPP2';
const DEFAULT_DIV_COLUMN = 26; // column AA

async function importFromPortfolioSheet (portfolio) {
  const rangeData = await getPortfolioSheet();

  updateStocks(portfolio.stocks, rangeData);
  updatePositions(portfolio.positions, rangeData);
}

function updateStocks (stocks, rangeData, options) {
  const notSeen = new Set(stocks.values());
  let count = 0;
  for (const item of getStockData(rangeData, options)) {
    const stock = stocks.set(item);
    notSeen.delete(stock);
    count++;
  }
  notSeen.forEach(clearDividend);
  debug$7(
    'Updated %d and removed %d dividends from portfolio sheet',
    count,
    notSeen.size
  );

  function clearDividend ({ ticker }) {
    stocks.set({ ticker, dividend: undefined });
  }
}

function * getStockData (rangeData, options = {}) {
  const {
    tickerColumn = DEFAULT_TICKER_COLUMN,
    divColumn = DEFAULT_DIV_COLUMN
  } = options;

  for (const row of rangeData) {
    const ticker = row[tickerColumn];
    if (!ticker) continue
    const div = row[divColumn];
    const item = {
      ticker,
      dividend:
        div && typeof div === 'number' ? Math.round(div * 1e5) / 1e3 : undefined
    };
    yield item;
  }
}

function updatePositions (positions, rangeData, options) {
  const notSeen = new Set(positions.values());
  let count = 0;
  for (const item of getPositionData(rangeData, options)) {
    const position = positions.set(item);
    notSeen.delete(position);
    count++;
  }
  notSeen.forEach(position => positions.delete(position));
  debug$7(
    'Updated %d and removed %d positions from portfolio sheet',
    count,
    notSeen.size
  );
}

function * getPositionData (rangeData, options = {}) {
  const {
    tickerCol = DEFAULT_TICKER_COLUMN,
    accountCol = DEFAULT_ACCOUNT_COLUMN,
    accounts = DEFAULT_ACCOUNT_LIST
  } = options;

  const accts = accounts
    .split(';')
    .map(code => code.split(','))
    .map(([who, account]) => ({ who, account }));

  for (const row of rangeData) {
    const ticker = row[tickerCol];
    if (!ticker) continue

    const positions = row
      .slice(accountCol, accountCol + accts.length)
      .map((qty, i) => ({ ...accts[i], ticker, qty }))
      .filter(({ qty }) => qty && typeof qty === 'number');

    yield * positions;
  }
}

function pipeline (...fns) {
  const src = typeof fns[0] !== 'function' ? fns.shift() : null;
  const composed = obj => fns.reduce((o, fn) => fn(o), obj);
  return src === null ? composed : composed(src)
}

const debug$6 = log
  .prefix('import-trades:')
  .colour()
  .level(2);

async function importFromTradesSheet ({ trades }) {
  const rangeData = await getTradesSheet$1();

  let nGroups = 0;
  let nTrades = 0;

  for (const group of getTradeGroups(rangeData)) {
    if (!group.length) continue
    nGroups++;
    nTrades += group.length;
    trades.setTrades(group);
  }

  debug$6('Updated %d positions with %d trades', nGroups, nTrades);
}

function getTradeGroups (rows) {
  return pipeline(teme(rows), readTrades, sortTrades, groupTrades, addCosts)
}

function readTrades (rows) {
  return rows
    .map(rowToTrade())
    .filter(validTrade)
    .map(cleanTrade)
}

function rowToTrade () {
  const account = 'Dealing';
  let who;
  let ticker;
  return ([who_, ticker_, date, qty, cost, notes]) => {
    who = who_ || who;
    ticker = ticker_ || ticker;
    return { who, account, ticker, date, qty, cost, notes }
  }
}

function validTrade ({ who, ticker, date, qty, cost }) {
  if (!who || !ticker || typeof date !== 'number') return false
  if (qty && typeof qty !== 'number') return false
  if (cost && typeof cost !== 'number') return false
  return qty || cost
}

function cleanTrade ({ date, cost, ...rest }) {
  return {
    ...rest,
    date: toDate(date),
    cost: cost ? Math.round(cost * 100) : cost
  }
}

function sortTrades (trades) {
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq');

  let seq = 0;

  return trades
    .map(trade => ({ ...trade, seq: seq++ }))
    .sort(sortFn)
    .map(({ seq, ...trade }) => trade)
}

function groupTrades (trades) {
  return trades
    .group(({ who, account, ticker }) => ({ who, account, ticker }))
    .map(([, group]) => group)
}

function addCosts (groups) {
  return groups.map(group => group.each(buildPosition()).collect())
}

function buildPosition () {
  const pos = { qty: 0, cost: 0 };
  return trade => {
    const { qty, cost } = trade;
    if (qty && cost && qty > 0) {
      // buy
      pos.qty += qty;
      pos.cost += cost;
    } else if (qty && cost && qty < 0) {
      const prev = { ...pos };
      const proceeds = -cost;
      pos.qty += qty;
      const remain = prev.qty ? pos.qty / prev.qty : 0;
      pos.cost = Math.round(remain * prev.cost);
      trade.cost = pos.cost - prev.cost;
      trade.gain = proceeds + trade.cost;
    } else if (qty) {
      pos.qty += qty;
    } else if (cost) {
      pos.cost += cost;
    }
  }
}

const debug$5 = log
  .prefix('import-stocks:')
  .colour()
  .level(2);

async function importFromStocksSheet ({ stocks }) {
  const rows = await getStocksSheet();
  const attrs = rows.shift();

  const data = rows
    .filter(([x]) => x)
    .map(row => row.reduce((o, v, i) => ({ ...o, [attrs[i]]: v }), {}));

  for (const stock of data) {
    stocks.set(stock);
  }

  debug$5('Loaded %d records from stocks', data.length);
}

function uniq (...values) {
  return [...new Set([].concat(...values))]
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const rgxMain = (() => {
  const textElement = '(?<=^|>)' + '([^<]+)' + '(?=<)';
  const cdata = '<!\\[CDATA\\[';
  const comment = '<!--';
  const script = '<script(?= |>)';
  const specialElement = '(' + cdata + '|' + script + '|' + comment + ')';
  const tagElement = '(?:<)' + '([^>]*)' + '(?:>)';
  return new RegExp(textElement + '|' + specialElement + '|' + tagElement, 'g')
})();

const specials = {
  '<![CDATA[': { rgx: /]]>/, start: 9, end: 3, emit: 'cdata' },
  '<!--': { rgx: /-->/, start: 4, end: 3 },
  '<script': { rgx: /<\/script>/, start: 7, end: 9 }
};

const CHUNK = 1024;

const rgxTag = (() => {
  const maybeClose = '(\\/?)';
  const typeName = '(\\S+)';
  const elementType = `^${maybeClose}${typeName}`;
  const attrName = '(\\S+)';
  const attrValueDQ = '"([^"]*)"';
  const attrValueSQ = "'([^']*)'";
  const attrValueNQ = '(\\S+)';
  const attrValue = `(?:${attrValueDQ}|${attrValueSQ}|${attrValueNQ})`;
  const attr = `${attrName}\\s*=\\s*${attrValue}`;
  const selfClose = '(\\/)\\s*$';
  return new RegExp(`${elementType}|${attr}|${selfClose}`, 'g')
})();

class Parser {
  constructor (handler) {
    this.buffer = '';
    this.special = false;
    this.handler = handler;
  }

  write (text) {
    this.buffer += text;
    if (this.special) handleSpecial(this);
    else handle(this);
  }
}

function handle (p) {
  rgxMain.lastIndex = undefined;
  let consumed = 0;
  while (true) {
    const m = rgxMain.exec(p.buffer);
    if (!m) break
    const [, text, special, tag] = m;
    if (text) {
      consumed = m.index + text.length;
      p.handler({ text });
    } else if (tag) {
      consumed = m.index + tag.length + 2;
      p.handler(parseTag(tag));
    } else if (special) {
      p.special = special;
      const { start } = specials[special];
      consumed = m.index + start;
      p.buffer = p.buffer.slice(consumed);
      return handleSpecial(p)
    }
  }
  p.buffer = p.buffer.slice(consumed);
}

function handleSpecial (p) {
  const { rgx, end, emit } = specials[p.special];
  const match = rgx.exec(p.buffer);
  if (match) {
    const data = p.buffer.slice(0, match.index);
    p.buffer = p.buffer.slice(match.index + end);
    if (emit && data.length) p.handler({ [emit]: data });
    p.special = false;
    return handle(p)
  }
  if (p.buffer.length > CHUNK) {
    const data = p.buffer.slice(0, CHUNK);
    p.buffer = p.buffer.slice(CHUNK);
    if (emit) p.handler({ [emit]: data });
  }
}

function parseTag (tag) {
  if (tag.startsWith('!') || tag.startsWith('?')) return { meta: tag }
  const out = { type: '' };
  rgxTag.lastIndex = undefined;
  while (true) {
    const m = rgxTag.exec(tag);
    if (!m) return out
    const [, close, type, name, dq, sq, nq, selfClose] = m;
    if (type) {
      out.type = type;
      if (close) {
        out.close = true;
      } else {
        out.attrs = {};
      }
    } else if (name) {
      out.attrs[name] = dq || sq || nq;
    } else if (selfClose) {
      out.selfClose = true;
    }
  }
}

function ClosingParser (handler) {
  const parser = new Parser(ondata);
  const path = [];
  const write = parser.write.bind(parser);
  let depth = 0;

  return { write, path }

  function ondata (data) {
    data.depth = depth;
    const { type, close, selfClose, ...rest } = data;
    if (type && !close) {
      handler({ type, ...rest });
      if (selfClose) {
        handler({ type, close: true, depth });
      } else {
        path.push(type);
        depth++;
      }
    } else if (type && close) {
      while (path.length && path[path.length - 1] !== type) {
        const type = path.pop();
        depth--;
        handler({ type, close: true, depth });
      }
      if (depth) {
        path.pop();
        depth--;
      }
      handler({ type, close, depth });
    } else {
      handler(data);
    }
  }
}

class Scrapie {
  constructor (isChild) {
    if (!this.isChild) {
      const parser = new ClosingParser(this._ondata.bind(this));
      this.write = parser.write.bind(parser);
    }
    this._hooks = {};
  }

  on (event, callback) {
    if (event === 'text') {
      event = 'data';
      const cb = callback;
      callback = ({ text }) => text && cb(text);
    }
    const list = this._hooks[event];
    if (list) list.push(callback);
    else this._hooks[event] = [callback];
    return this
  }

  _emit (event, data) {
    const list = this._hooks[event];
    if (!list) return undefined
    for (let i = 0; i < list.length; i++) {
      list[i](data);
    }
  }

  _ondata (data) {
    this._emit('data', data);
  }

  when (fn) {
    if (typeof fn === 'string') fn = makeCondition(fn);
    return new SubScrapie(this, fn)
  }
}

class SubScrapie extends Scrapie {
  constructor (parent, condition) {
    super(true);
    parent.on('data', this._ondata.bind(this));
    this.write = parent.write;
    this._active = false;
    this._condition = condition;
  }

  _ondata (data) {
    if (this._active) {
      if (data.depth < this._activeDepth) {
        this._emit('exit', data);
        this._active = false;
      } else {
        this._emit('data', data);
      }
    } else {
      if (this._condition(data)) {
        this._emit('enter', data);
        this._active = true;
        this._activeDepth = data.depth + 1;
      }
    }
  }
}

function makeCondition (string) {
  if (string.includes('.')) {
    const [t, cls] = string.split('.');
    return ({ type, attrs }) =>
      type === t && attrs && attrs.class && attrs.class.includes(cls)
  }
  const t = string;
  return ({ type }) => type === t
}

const USER_AGENT =
  'Mozilla/5.0 (X11; CrOS x86_64 13729.56.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.95 Safari/537.36';

function get (url) {
  return new Promise((resolve, reject) => {
    const req = get$1(url, { headers: { 'User-Agent': USER_AGENT } }, res => {
      const { statusCode } = res;
      if (statusCode >= 400) {
        const { statusMessage, headers } = res;
        return reject(
          Object.assign(new Error(res.statusMessage), {
            statusMessage,
            statusCode,
            headers,
            url
          })
        )
      }
      resolve(res);
    });
    req.on('error', reject);
  })
}

const debug$4 = log
  .prefix('lse:')
  .colour()
  .level(3);

function fetchIndex (indexName) {
  // ftse-all-share
  // ftse-aim-all-share
  const url = `https://www.lse.co.uk/share-prices/indices/${indexName}/constituents.html`;
  return fetchCollection(
    url,
    'sp-constituents__table',
    `lse:index:${indexName}`
  )
}

function fetchSector (sectorName) {
  // alternative-investment-instruments
  const url = `https://www.lse.co.uk/share-prices/sectors/${sectorName}/constituents.html`;
  return fetchCollection(url, 'sp-sectors__table', `lse:sector:${sectorName}`)
}

async function * fetchCollection (url, collClass, priceSource) {
  await sleep(500);

  const priceUpdated = new Date();
  let count = 0;
  const items = [];
  const addItem = data => {
    const { name, ticker } = extractNameAndTicker(data[0]);
    const price = extractNumber(data[1]);
    items.push({ ticker, name, price, priceUpdated, priceSource });
    count++;
  };

  let row;

  const scrapie = new Scrapie();
  scrapie
    .when('table.' + collClass)
    .when('tr')
    .on('enter', () => (row = []))
    .on('exit', () => row.length >= 2 && addItem(row))
    .when('td')
    .on('text', t => row.push(t));

  const source = await get(url);
  source.setEncoding('utf8');

  for await (const chunk of source) {
    scrapie.write(chunk);
    yield * items.splice(0);
  }

  debug$4('Read %d items from %s', count, priceSource);
}

async function fetchPrice (ticker) {
  await sleep(500);

  const url = [
    'https://www.lse.co.uk/SharePrice.asp',
    `?shareprice=${ticker.padEnd('.', 3)}`
  ].join('');

  const item = {
    ticker,
    name: '',
    price: null,
    priceUpdated: new Date(),
    priceSource: 'lse:share'
  };

  const scrapie = new Scrapie();

  const whenBid = ({ type, attrs }) =>
    type === 'span' && attrs && attrs['data-field'] === 'BID';

  scrapie.when('h1.title__title').on('text', t => {
    item.name = item.name || t.replace(/ Share Price.*/, '');
  });

  scrapie.when(whenBid).on('text', t => {
    item.price = item.price || extractNumber(t);
  });

  const source = await get(url);
  source.setEncoding('utf8');

  for await (const chunk of source) {
    scrapie.write(chunk);
  }

  debug$4('fetched %s from lse:share', ticker);

  return item
}

function extractNameAndTicker (text) {
  const re = /(.*)\s+\(([A-Z0-9.]{2,4})\)$/;
  const m = re.exec(text);
  if (!m) return {}
  const [, name, ticker] = m;
  return { name, ticker: ticker.replace(/\.+$/, '') }
}

function extractNumber (text) {
  return parseFloat(text.replace(/,/g, ''))
}

const debug$3 = log
  .prefix('fetch:')
  .colour()
  .level(2);

// first try to load prices via collections - indices and sectors
const attempts = [
  ['ftse-all-share', fetchIndex],
  ['ftse-aim-all-share', fetchIndex],
  ['closed-end-investments', fetchSector]
];

async function updatePrices ({ stocks, positions }) {
  const tickers = uniq([...positions.values()].map(({ ticker }) => ticker));
  const prices = getPrices(tickers);
  for await (const item of prices) {
    const s = stocks.get(item.ticker);
    stocks.set({
      ...item,
      name: s ? s.name || item.name : item.name
    });
  }
}

async function * getPrices (tickers) {
  const needed = new Set(tickers);
  const isNeeded = ({ ticker }) => needed.delete(ticker);

  for (const [name, fetchFunc] of attempts) {
    let n = 0;
    const prices = teme(fetchFunc(name))
      .filter(isNeeded)
      .each(() => n++);
    yield * prices;
    debug$3('%d prices from %s', n, name);

    if (!needed.size) return
  }

  // now pick up the remaining ones
  for (const ticker of needed) {
    yield await fetchPrice(ticker);
  }
  debug$3('%d prices individually: %s', needed.size, [...needed].join(', '));
}

const debug$2 = log
  .prefix('export-positions:')
  .colour()
  .level(2);

async function exportPositions (portfolio) {
  await updatePositionsSheet(getPositionsSheet(portfolio));
  debug$2('position sheet updated');
}

function getPositionsSheet ({ stocks, positions }) {
  const sortFn = sortBy('ticker')
    .thenBy('who')
    .thenBy('account');

  return teme(positions.values())
    .filter(({ qty }) => qty)
    .map(addStock(stocks))
    .sort(sortFn)
    .map(makePositionRow)
    .collect()
}

function addStock (stocks) {
  return position => ({
    position,
    stock: stocks.get(position.ticker)
  })
}

function makePositionRow ({ position: p, stock: s }) {
  return [
    p.ticker,
    p.who,
    p.account,
    p.qty,
    s.price || 0,
    s.dividend || 0,
    s.dividend && s.price ? s.dividend / s.price : 0,
    Math.round(p.qty * s.price) / 100 || 0,
    s.dividend ? Math.round(p.qty * s.dividend) / 100 : 0
  ]
}

const debug$1 = log
  .prefix('export-trades:')
  .colour()
  .level(2);

async function exportTrades (portfolio) {
  await updateTradesSheet(getTradesSheet(portfolio));
  debug$1('trades sheet updated');
}

function getTradesSheet ({ trades }) {
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq');

  return teme(trades.values())
    .sort(sortFn)
    .map(makeTradeRow)
    .collect()
}

function makeTradeRow ({ who, account, ticker, date, qty, cost, gain }) {
  return [
    who,
    account,
    ticker,
    date,
    qty || 0,
    cost ? cost / 100 : 0,
    gain ? gain / 100 : 0
  ]
}

function speedo ({
  total,
  interval = 250,
  windowSize = 40
} = {}) {
  let readings;
  let start;
  return Object.assign(transform, { current: 0, total, update, done: false })

  async function * transform (source) {
    start = Date.now();
    readings = [[start, 0]];
    const int = setInterval(update, interval);
    try {
      for await (const chunk of source) {
        transform.current += chunk.length;
        yield chunk;
      }
      transform.total = transform.current;
      update(true);
    } finally {
      clearInterval(int);
    }
  }

  function update (done = false) {
    if (transform.done) return
    const { current, total } = transform;
    const now = Date.now();
    const taken = now - start;
    readings = [...readings, [now, current]].slice(-windowSize);
    const first = readings[0];
    const wl = current - first[1];
    const wt = now - first[0];
    const rate = 1e3 * (done ? total / taken : wl / wt);
    const percent = Math.round((100 * current) / total);
    const eta = done || !total ? 0 : (1e3 * (total - current)) / rate;
    Object.assign(transform, { done, taken, rate, percent, eta });
  }
}

// import assert from 'assert/strict'
function throttle (options) {
  if (typeof options !== 'object') options = { rate: options };
  const { chunkTime = 100, windowSize = 30 } = options;
  const rate = getRate(options.rate);
  return async function * throttle (source) {
    let window = [[0, Date.now()]];
    let bytes = 0;
    let chunkBytes = 0;
    const chunkSize = Math.max(1, Math.ceil((rate * chunkTime) / 1e3));
    for await (let data of source) {
      while (data.length) {
        const chunk = data.slice(0, chunkSize - chunkBytes);
        data = data.slice(chunk.length);
        chunkBytes += chunk.length;
        if (chunkBytes < chunkSize) {
          // assert.equal(data.length, 0)
          yield chunk;
          continue
        }
        bytes += chunkSize;
        // assert.equal(chunkBytes, chunkSize)
        chunkBytes = 0;
        const now = Date.now();
        const first = window[0];
        const eta = first[1] + (1e3 * (bytes - first[0])) / rate;
        window = [...window, [bytes, Math.max(now, eta)]].slice(-windowSize);
        if (now < eta) {
          await delay(eta - now);
        }
        yield chunk;
      }
    }
  }
}

function getRate (val) {
  const n = (val + '').toLowerCase();
  if (!/^\d+[mk]?$/.test(n)) throw new Error(`Invalid rate: ${val}`)
  const m = n.endsWith('m') ? 1024 * 1024 : n.endsWith('k') ? 1024 : 1;
  return parseInt(n) * m
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function progressStream ({
  onProgress,
  interval = 1000,
  ...rest
} = {}) {
  return async function * transform (source) {
    const int = setInterval(report, interval);
    let bytes = 0;
    let done = false;
    try {
      for await (const chunk of source) {
        bytes += chunk.length;
        yield chunk;
      }
      done = true;
      report();
    } finally {
      clearInterval(int);
    }

    function report () {
      onProgress && onProgress({ bytes, done, ...rest });
    }
  }
}

async function hashFile (filename, { algo = 'md5', enc = 'hex' } = {}) {
  const hasher = createHash(algo);
  for await (const chunk of createReadStream(filename)) {
    hasher.update(chunk);
  }
  return hasher.digest(enc)
}

function parse (uri) {
  const u = new URL(uri);
  if (u.protocol !== 'gs:') throw new Error('Invalid protocol')
  const bucket = u.hostname;
  const file = u.pathname.replace(/^\//, '');
  return { bucket, file }
}

async function upload (src, dest, options = {}) {
  const { onProgress, progressInterval = 1000, rateLimit, acl } = options;
  const { bucket: bucketName, file: fileName } = parse(dest);
  const { contentType, ...metadata } = await getLocalMetadata(src);
  const storage = await getStorageAPI();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  const speedo$1 = speedo({ total: metadata.size });
  const writeOptions = {
    public: acl === 'public',
    private: acl === 'private',
    resumable: metadata.size > 5e6,
    metadata: {
      contentType: metadata.contentType,
      metadata: packMetadata(metadata)
    }
  };

  await pipeline$1(
    ...[
      createReadStream(src),
      rateLimit && throttle(rateLimit),
      onProgress && speedo$1,
      onProgress &&
        progressStream({ onProgress, interval: progressInterval, speedo: speedo$1 }),
      file.createWriteStream(writeOptions)
    ].filter(Boolean)
  );
}

async function getLocalMetadata (file) {
  const { mtimeMs, ctimeMs, atimeMs, size, mode } = await stat(file);
  const md5 = await hashFile(file);
  const contentType = mime.getType(extname(file));
  const defaults = { uid: 1000, gid: 1000, uname: 'alan', gname: 'alan' };
  return {
    ...defaults,
    mtime: Math.floor(mtimeMs),
    ctime: Math.floor(ctimeMs),
    atime: Math.floor(atimeMs),
    size,
    mode,
    md5,
    contentType
  }
}

function packMetadata (obj, key = 'gsjs') {
  return {
    [key]: Object.keys(obj)
      .sort()
      .map(k => [k, obj[k]])
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}:${v}`)
      .join('/')
  }
}

const getStorageAPI = once(async function getStorageAPI ({
  credentials = 'credentials.json'
} = {}) {
  const { Storage } = await import('@google-cloud/storage');
  if (credentials) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentials;
  }

  const storage = new Storage();
  return storage
});

const debug = log
  .prefix('export-stocks:')
  .colour()
  .level(2);

const STOCKS_URI = 'gs://finance-readersludlow/stocks.csv';
const TEMPFILE = '/tmp/stocks.csv';

async function exportStocks ({ stocks }) {
  const data = [...stocks.values()]
    .sort(sortBy('ticker'))
    .map(stockToRow)
    .map(makeCSV)
    .join('');

  await writeFile(TEMPFILE, data);
  await upload(TEMPFILE, STOCKS_URI, { acl: 'public' });
  await unlink(TEMPFILE);
  debug('stocks written to %s', STOCKS_URI);
}

function stockToRow (row) {
  const { ticker, incomeType, name, price, dividend, notes } = row;
  return [ticker, incomeType, name, price || 0, dividend || 0, notes]
}

function makeCSV (arr) {
  return (
    arr
      .map(v => {
        if (typeof v === 'number') return v.toString()
        if (v == null) return ''
        return '"' + v.toString().replaceAll('"', '""') + '"'
      })
      .join(',') + '\n'
  )
}

async function update (options) {
  const portfolio = new Portfolio();
  await portfolio.load();

  if (options['import-portfolio']) {
    await importFromPortfolioSheet(portfolio);
  }

  if (options['import-trades']) {
    await importFromTradesSheet(portfolio);
  }

  if (options['import-stocks']) {
    await importFromStocksSheet(portfolio);
  }

  if (options['fetch-prices']) {
    await updatePrices(portfolio);
  }

  await portfolio.save();

  if (options['export-positions']) {
    await exportPositions(portfolio);
  }
  if (options['export-trades']) {
    await exportTrades(portfolio);
  }

  if (options['export-stocks']) {
    await exportStocks(portfolio);
  }
}

const version = '2.6.1';

const prog = sade('pixprices');

prog.version(version);

prog
  .command('update', 'update data')
  .option('--import-portfolio', 'read portfolio sheet')
  .option('--import-trades', 'read trades sheet')
  .option('--import-stocks', 'read stocks sheet')
  .option('--fetch-prices', 'fetch prices from LSE')
  .option('--export-positions', 'update the positions sheet')
  .option('--export-trades', 'update the trades sheet')
  .option('--export-stocks', 'write the stocks CSV')
  .action(update);

const parsed = prog.parse(process.argv, {
  lazy: true
});

if (parsed) {
  const { handler, args } = parsed;
  handler(...args).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
