#!/usr/bin/env node
import sade from 'sade';
import { format } from 'util';
import tinydate from 'tinydate';
import { get as get$1 } from 'https';
import { stat, writeFile, unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
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
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clone(v)]))
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
      key = item.done ? EMPTY : fn(item.value);
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
      key = item.done ? EMPTY : fn(item.value);
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

function clean$1 (obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  )
}

const debug$8 = log
  .prefix('googlejs:datastore:')
  .colour()
  .level(5);

const PREV = Symbol('prev');
const KEY = Symbol('key');

class Table$1 {
  constructor (kind) {
    this.kind = kind;
  }

  async * fetch ({ where, order, factory, ...rest } = {}) {
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
    for await (const entity of query.runStream()) {
      yield createRowfromEntity(entity, datastore, factory);
    }
  }

  async select (options) {
    const entities = await teme(this.fetch(options)).collect();
    debug$8('%d records loaded from %s', entities.length, this.kind);
    return entities
  }

  async upsert (rows) {
    const datastore = await getDatastoreAPI();
    const { kind } = this;
    for (const entities of getEntities(rows, { kind, datastore })) {
      await datastore.upsert(entities);
      debug$8('%d records upserted to %s', entities.length, this.kind);
    }
  }

  async delete (rows) {
    const datastore = await getDatastoreAPI();
    for (const keys of getKeys(rows)) {
      await datastore.delete(keys);
      debug$8('%d records deleted from %s', keys.length, this.kind);
    }
  }
}

Table$1.getKey = o => o[KEY];
Table$1.getPrev = o => o[PREV];

function createRowfromEntity (entity, datastore, factory) {
  const Factory = factory || Object;
  const row = new Factory();
  setPrivate(row, { key: entity[datastore.KEY], prev: clone(entity) });
  if (row.deserialize) row.deserialize(clone(entity));
  else Object.assign(row, clone(entity));
  return row
}

function * getEntities (arr, { kind, datastore, size = 400 }) {
  const batch = [];
  for (const row of arrify(arr)) {
    const data = row.serialize ? row.serialize() : clean$1(row);
    if (row[PREV] && equal(row[PREV], data)) continue
    if (!row[KEY]) setPrivate(row, { key: datastore.key([kind]) });
    const entity = { key: row[KEY], data };
    setPrivate(row, { prev: clone(data) });
    if (batch.push(entity) >= size) yield batch.splice(0);
  }
  if (batch.length) yield batch;
}

function * getKeys (arr, { size = 400 } = {}) {
  const batch = [];
  for (const row of arrify(arr)) {
    if (!row[KEY]) continue
    if (batch.push(row[KEY]) >= size) yield batch.splice(0);
    setPrivate(row, { key: undefined, prev: undefined });
  }
  if (batch.length) yield batch;
}

function setPrivate (row, data) {
  const defs = {};
  if ('prev' in data) {
    defs[PREV] = { value: data.prev, configurable: true };
  }
  if ('key' in data) {
    defs[KEY] = { value: data.key, configurable: true };
  }
  return Object.defineProperties(row, defs)
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

class Table {
  constructor ({ onsave, main, factory } = {}) {
    this._data = new Set();
    this._changed = new Set();
    this._deleted = new Set();
    this._ix = {};
    if (onsave) this.onsave = onsave;
    if (factory) this.factory = factory;
    if (main) this.addUniqueIndex('main', main);
  }

  load (source) {
    this._data.clear();
    this._changed.clear();
    this._deleted.clear();
    for (const k in this._ix) this._ix[k].clear();
    for (const row of source) {
      this._data.add(row);
      for (const k in this._ix) this._ix[k].add(row);
    }
  }

  addIndex (k, fn) {
    const ix = (this._ix[k] = new Index(fn));
    for (const row of this._data) ix.add(row);
  }

  addUniqueIndex (k, fn) {
    const ix = (this._ix[k] = new UniqueIndex(fn));
    for (const row of this._data) ix.add(row);
  }

  get (data, k = 'main') {
    const ix = this._ix[k];
    if (!ix) throw new Error('No such index: ' + k)
    return ix.get(data)
  }

  upsert (data) {
    if (data[Symbol.iterator]) {
      return [...data].map(d => this.upsert(d))
    }

    if (this._ix.main) {
      const row = this._ix.main.get(data);
      if (row) {
        for (const k in this._ix) this._ix[k].delete(row);
        Object.assign(row, data);
        for (const k in this._ix) this._ix[k].add(row);
        this._changed.add(row);
        return row
      }
    }
    const Factory = this.factory || Object;
    const row = new Factory();
    Object.assign(row, data);
    this._data.add(row);
    this._changed.add(row);
    for (const k in this._ix) this._ix[k].add(row);
    return row
  }

  delete (data) {
    if (data[Symbol.iterator]) {
      return [...data].map(d => this.delete(d))
    }

    if (this._ix.main) {
      const row = this._ix.main.get(data);
      if (row) {
        for (const k in this._ix) this._ix[k].delete(row);
        this._data.delete(row);
        this._changed.delete(row);
        this._deleted.add(row);
        return row
      }
    }
  }

  save () {
    const changed = new Set(this._changed);
    const deleted = new Set(this._deleted);
    this._changed.clear();
    this._deleted.clear();
    if (this.onsave) return this.onsave(changed, deleted)
  }

  all () {
    return this._data.values()
  }
}

class Index {
  constructor (fn) {
    this.fn = fn;
    this.map = new Map();
  }

  clear () {
    this.map.clear();
  }

  add (row) {
    const key = this.fn(row);
    const entry = this.map.get(key);
    if (entry) entry.add(row);
    else this.map.set(key, new Set([row]));
  }

  delete (row) {
    const key = this.fn(row);
    const entry = this.map.get(key);
    entry.delete(row);
    if (!entry.size) this.map.delete(key);
  }

  get (data) {
    const key = this.fn(data);
    return this.map.get(key) || new Set()
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

class PortfolioTable extends Table {
  constructor (kind, factory, main) {
    super({ factory, main });
    this.kind = kind;
    this.store = new Table$1(kind);
  }

  async load () {
    const rows = await this.store.select({ factory: this.factory });
    super.load(rows.sort(this.order));
  }

  onsave (updated, deleted) {
    return Promise.all([
      this.store.upsert([...updated]),
      this.store.delete([...deleted])
    ])
  }

  set (data) {
    return this.upsert(data)
  }
}

const factors = Array(13)
  .fill()
  .map((_, n) => Math.pow(10, n));

const inspect = Symbol.for('nodejs.util.inspect.custom');
const DIG = Symbol('digits');
const EXP = Symbol('exponent');
const FAC = Symbol('factor');

function decimal (number, opts = {}) {
  if (number instanceof Decimal) return number
  if (Array.isArray(number)) return new Decimal(...number)
  const { minPrecision = 0, maxPrecision = 12 } = opts;
  const [d, x] = parseNumber(number, minPrecision, maxPrecision);
  return new Decimal(d, x)
}

class Decimal {
  constructor (dig, exp) {
    Object.freeze(
      Object.defineProperties(this, {
        [DIG]: { value: Math.round(dig) },
        [EXP]: { value: exp },
        [FAC]: { value: factors[exp] }
      })
    );
  }

  [inspect] (depth, opts) {
    /* c8 ignore next */
    if (depth < 0) return opts.stylize('[Decimal]', 'number')
    return `Decimal { ${opts.stylize(this.toString(), 'number')} }`
  }

  get tuple () {
    return [this[DIG], this[EXP]]
  }

  get number () {
    return this[DIG] / this[FAC]
  }

  toString () {
    const neg = this[DIG] < 0;
    const e = this[EXP];
    let s = Math.abs(this[DIG])
      .toString()
      .padStart(e + 1, '0');
    if (e) s = s.slice(0, -e) + '.' + s.slice(-e);
    return neg ? '-' + s : s
  }

  toJSON () {
    return this.toString()
  }

  precision (p) {
    if (this[EXP] === p) return this
    if (!(p in factors)) throw new TypeError('Unsupported precision')
    if (p > this[EXP]) {
      const f = factors[p - this[EXP]];
      return new Decimal(this[DIG] * f, p)
    } else {
      const f = factors[this[EXP] - p];
      return new Decimal(this[DIG] / f, p)
    }
  }

  add (other) {
    const x = this;
    const y = decimal(other);
    const exp = Math.max(x[EXP], y[EXP]);
    return new Decimal(x.precision(exp)[DIG] + y.precision(exp)[DIG], exp)
  }

  sub (other) {
    other = decimal(other);
    return this.add(decimal(other).neg())
  }

  mul (x) {
    x = decimal(x).number;
    return new Decimal(this[DIG] * x, this[EXP])
  }

  div (x) {
    x = decimal(x).number;
    if (!x) throw new Error('Cannot divide by zero')
    return new Decimal(this[DIG] / x, this[EXP])
  }

  abs () {
    return new Decimal(Math.abs(this[DIG]), this[EXP])
  }

  neg () {
    return new Decimal(-this[DIG], this[EXP])
  }
}

const rgx = /^-?\d+(?:\.\d+)?$/;
function parseNumber (n, minp, maxp) {
  let s;
  if (typeof n === 'number') {
    s = n.toString();
  } else if (typeof n === 'string') {
    s = n;
    n = parseFloat(s);
  } else {
    throw new TypeError('Invalid number: ' + n)
  }
  if (!rgx.test(s)) throw new TypeError('Invalid number: ' + s)
  const p = Math.min(Math.max((s.split('.')[1] || '').length, minp), maxp);
  if (!(p in factors)) throw new TypeError('Unsupported precision')
  const d = Math.round(n * factors[p]);
  return [d, p]
}

function clean (x) {
  return Object.fromEntries(
    Object.entries(x).filter(([, v]) => v !== undefined)
  )
}

function readDecimal (x, prec) {
  if (x == null) return undefined
  const d = decimal(x);
  if (prec != null) return d.precision(prec)
  return d
}

function writeDecimal (x) {
  return x ? x.number : undefined
}

const asPlainDate = tinydate('{YYYY}-{MM}-{DD}');

function readDate (x) {
  return x instanceof Date ? asPlainDate(x) : x
}

class Stocks extends PortfolioTable {
  constructor () {
    super('Stock', Stock, x => x.ticker);
    this.order = sortBy('ticker');
  }
}

class Stock {
  deserialize (data) {
    const { price, dividend, ...rest } = data;
    Object.assign(this, {
      ...rest,
      price: readDecimal(price),
      dividend: readDecimal(dividend)
    });
  }

  serialize () {
    return clean({
      ...this,
      price: writeDecimal(this.price),
      dividend: writeDecimal(this.dividend)
    })
  }
}

class Positions extends PortfolioTable {
  constructor () {
    super('Position', Position, x => `${x.ticker}_${x.who}_${x.account}`);
    this.order = sortBy('ticker')
      .thenBy('who')
      .thenBy('account');
  }
}

class Position {
  deserialize (data) {
    const { qty, ...rest } = data;
    Object.assign(this, {
      ...rest,
      qty: readDecimal(qty, 0)
    });
  }

  serialize () {
    const { qty } = this;
    return clean({ ...this, qty: writeDecimal(qty) })
  }
}

class Trades extends PortfolioTable {
  constructor () {
    super('Trade', Trade, x => `${x.who}_${x.account}_${x.ticker}_${x.seq}`);
    this.order = sortBy('who')
      .thenBy('account')
      .thenBy('ticker')
      .thenBy('seq');

    this.addIndex('position', x => `${x.who}_${x.account}_${x.ticker}`);
  }

  getTrades (data) {
    return this.get(data, 'position')
  }

  setTrades (data) {
    const old = this.get(data[0], 'position');
    let seq = 1;
    const updated = new Set();
    for (const trade of data) {
      const row = this.set({ ...trade, seq });
      updated.add(row);
      old.delete(row);
      seq++;
    }
    for (const row of old) this.delete(row);
    return updated
  }
}

class Trade {
  deserialize (data) {
    const { cost, gain, qty, date, ...rest } = data;
    Object.assign(this, {
      ...rest,
      date: readDate(date),
      qty: readDecimal(qty, 0),
      cost: readDecimal(cost, 2),
      gain: readDecimal(gain, 2)
    });
  }

  serialize () {
    const { qty, cost, gain } = this;
    return clean({
      ...this,
      qty: writeDecimal(qty),
      cost: writeDecimal(cost),
      gain: writeDecimal(gain)
    })
  }
}

const epochStartInSerial = 25569;
const msInDay = 24 * 60 * 60 * 1000;
const msInMinute = 60 * 1000;

class SerialDate {
  static fromSerial (n) {
    return new SerialDate(n)
  }

  static fromUTCms (ms) {
    return SerialDate.fromSerial(ms / msInDay + epochStartInSerial)
  }

  static fromUTCDate (d) {
    return SerialDate.fromUTCms(d.getTime())
  }

  static fromParts (parts) {
    parts = [...parts, 0, 0, 0, 0, 0, 0, 0].slice(0, 7);
    parts[1]--;
    return SerialDate.fromUTCms(Date.UTC(...parts))
  }

  static fromLocalDate (d) {
    return SerialDate.fromUTCms(
      d.getTime() - d.getTimezoneOffset() * msInMinute
    )
  }

  constructor (serial) {
    this.serial = serial;
    Object.freeze(this);
  }

  utcMs () {
    return Math.round((this.serial - epochStartInSerial) * msInDay)
  }

  utcDate () {
    return new Date(this.utcMs())
  }

  parts () {
    const d = this.utcDate();
    return [
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds()
    ]
  }

  localDate () {
    const parts = this.parts();
    parts[1]--;
    return new Date(...parts)
  }
}

const SCOPES$1 = {
  rw: ['https://www.googleapis.com/auth/spreadsheets'],
  ro: ['https://www.googleapis.com/auth/spreadsheets.readonly']
};

const scopes = SCOPES$1;
const toDate = s => SerialDate.fromSerial(s).localDate();
const toSerial = d => SerialDate.fromLocalDate(d).serial;

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

const INVESTMENTS_FOLDER = '0B_zDokw1k2L7VjBGcExJeUxLSlE';

const locateSheets = once(async function locateSheets () {
  const m = new Map();
  const files = list({ folder: INVESTMENTS_FOLDER });
  for await (const file of files) {
    m.set(file.name, file);
  }
  return m
});

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

async function overwriteSheetData (sheetName, range, data) {
  const currData = await getSheetData(sheetName, range);
  while (data.length < currData.length) {
    data.push(data[0].map(() => ''));
  }

  const newRange = range.replace(/\d+$/, '') + (data.length + 1);
  await putSheetData(sheetName, newRange, data);
}

const debug$7 = log
  .prefix('import:stocks:')
  .colour()
  .level(2);

const source$1 = {
  name: 'Stocks',
  range: 'Stocks!A:D'
};

async function importStocks ({ stocks }) {
  const rows = await getSheetData(source$1.name, source$1.range);

  const attrs = rows.shift();
  const validRow = row => !!row[0];
  const rowAttribs = row => attrs.map((k, ix) => [k, row[ix]]);
  const validAttribs = kvs => kvs.filter(([k]) => !!k);
  const makeObject = kvs => Object.fromEntries(kvs);

  const data = rows
    .filter(validRow)
    .map(rowAttribs)
    .map(validAttribs)
    .map(makeObject);

  for (const stock of data) {
    stocks.set(stock);
  }

  debug$7('Loaded %d records from stocks', data.length);
}

function importDecimal (x, prec) {
  if (x == null || x === '') return undefined
  const d = decimal(x);
  if (prec != null) return d.precision(prec)
  return d
}

const plainDateString = tinydate('{YYYY}-{MM}-{DD}');

function importDate (x) {
  return typeof x === 'number' ? plainDateString(toDate(x)) : undefined
}

const debug$6 = log
  .prefix('import:portfolio:')
  .colour()
  .level(2);

const SOURCE = {
  name: 'Portfolio',
  range: 'Investments!A:AM'
};

const TICKER_COLUMN = 10; // column K
const ACCOUNT_COLUMN = 0; // column A
const ACCOUNT_LIST =
  'AJL,ISA;RSGG,ISA;AJL,Dealing;RSGG,Dealing;AJL,SIPP;RSGG,SIPP;RSGG,SIPP2';
const DIV_COLUMN = 26; // column AA

async function importPortfolio ({ stocks, positions }) {
  const rangeData = await getSheetData(SOURCE.name, SOURCE.range);

  updateDividends(stocks, rangeData);
  updatePositions(positions, rangeData);
}

function updateDividends (stocks, rangeData) {
  const notSeen = new Set(stocks.all());
  let count = 0;
  for (const item of getDividendData(rangeData)) {
    const stock = stocks.set(item);
    notSeen.delete(stock);
    count++;
  }
  notSeen.forEach(clearDividend);
  debug$6(
    'Updated %d and cleared %d dividends from portfolio sheet',
    count,
    notSeen.size
  );

  function clearDividend ({ ticker }) {
    stocks.set({ ticker, dividend: undefined });
  }
}

function getDividendData (rangeData) {
  const extractData = row => [row[TICKER_COLUMN], row[DIV_COLUMN]];
  const validTicker = ([ticker]) => !!ticker;
  const makeObj = ([ticker, dividend]) => ({
    ticker,
    dividend: importDecimal(dividend)
  });

  return rangeData
    .map(extractData)
    .filter(validTicker)
    .map(makeObj)
}

function updatePositions (positions, rangeData) {
  const notSeen = new Set(positions.all());
  let count = 0;
  for (const item of getPositionData(rangeData)) {
    const position = positions.set(item);
    notSeen.delete(position);
    count++;
  }
  notSeen.forEach(position => positions.delete(position));
  debug$6(
    'Updated %d and removed %d positions from portfolio sheet',
    count,
    notSeen.size
  );
}

function * getPositionData (rangeData) {
  const accts = ACCOUNT_LIST.split(';')
    .map(code => code.split(','))
    .map(([who, account]) => ({ who, account }));

  const extractRow = row => [
    row[TICKER_COLUMN],
    accts,
    row.slice(ACCOUNT_COLUMN, ACCOUNT_COLUMN + accts.length)
  ];
  const validRow = ([ticker]) => !!ticker;

  const rows = rangeData.map(extractRow).filter(validRow);

  for (const [ticker, accts, qtys] of rows) {
    yield * getPositionsFromRow(ticker, accts, qtys);
  }
}

function * getPositionsFromRow (ticker, accts, qtys) {
  const makePos = (qty, i) => ({
    ticker,
    ...accts[i],
    qty: importDecimal(qty, 0)
  });
  const validPos = x => !!x.qty;

  const positions = qtys.map(makePos).filter(validPos);

  yield * positions;
}

const debug$5 = log
  .prefix('import:trades:')
  .colour()
  .level(2);

const source = {
  name: 'Trades',
  range: 'Trades!A2:F'
};

async function importTrades ({ trades }) {
  const rangeData = await getSheetData(source.name, source.range);
  const old = new Set(trades.all());

  let nGroups = 0;
  let nTrades = 0;

  for (const group of getTradeGroups(rangeData)) {
    if (!group.length) continue
    nGroups++;
    nTrades += group.length;
    const updated = trades.setTrades(group);
    for (const row of updated) old.delete(row);
  }

  debug$5('Updated %d positions with %d trades', nGroups, nTrades);
  if (old.size) {
    trades.delete([...old]);
    debug$5('Removed %d old trades', old.size);
  }
}

function getTradeGroups (rows) {
  const rawTrades = readTrades(rows);
  const sortedTrades = sortTrades(rawTrades);
  const groups = groupTrades(sortedTrades);
  addCosts(groups);

  return groups
}

function readTrades (rows) {
  const account = 'Dealing';
  let who;
  let ticker;
  const rowToObject = row => {
    const [who_, ticker_, date, qty, cost, notes] = row;
    return {
      who: (who = who_ || who),
      account,
      ticker: (ticker = ticker_ || ticker),
      date: importDate(date),
      qty: importDecimal(qty, 0),
      cost: importDecimal(cost, 2),
      notes
    }
  };

  const validTrade = t => t.who && t.ticker && t.date && (t.qty || t.cost);

  return rows.map(rowToObject).filter(validTrade)
}

function sortTrades (trades) {
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('date');

  return trades.sort(sortFn)
}

function groupTrades (trades) {
  const key = t => `${t.who}_${t.account}_${t.ticker}`;
  const groups = [];
  let prev;
  let group;
  for (const trade of trades) {
    const k = key(trade);
    if (k !== prev) {
      prev = k;
      group = [];
      groups.push(group);
    }
    group.push(trade);
  }
  return groups
}

function addCosts (groups) {
  groups.forEach(group => group.forEach(buildPosition()));
}

function buildPosition () {
  const pos = { qty: decimal(0), cost: decimal('0.00') };
  return trade => {
    const { qty, cost } = trade;
    if (qty && cost && qty.number > 0) {
      // buy
      pos.qty = pos.qty.add(qty);
      pos.cost = pos.cost.add(cost);
    } else if (qty && cost && qty.number < 0) {
      const prev = { ...pos };
      const proceeds = cost.abs();
      pos.qty = pos.qty.add(qty);
      const remain = prev.qty.number ? pos.qty.number / prev.qty.number : 0;
      pos.cost = prev.cost.mul(remain);
      trade.cost = prev.cost.sub(pos.cost).neg();
      trade.gain = proceeds.sub(trade.cost.abs());
    } else if (qty) {
      pos.qty = pos.qty.add(qty);
    } else if (cost) {
      pos.cost = pos.cost.add(cost);
    }
  }
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

const toISODateTime = tinydate(
  '{YYYY}-{MM}-{DD}T{HH}:{mm}:{ss}.{fff}{TZ}',
  { TZ: getTZString }
);

function getTZString (d) {
  const o = d.getTimezoneOffset();
  const a = Math.abs(o);
  const s = o < 0 ? '+' : '-';
  const h = ('0' + Math.floor(a / 60)).slice(-2);
  const m = ('0' + (a % 60)).slice(-2);
  return s + h + ':' + m
}

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
  .prefix('fetch:lse:')
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

  const priceUpdated = toISODateTime(new Date());
  let count = 0;
  const items = [];
  const addItem = data => {
    const { name, ticker } = extractNameAndTicker(data[0]);
    const price = decimal(extractNumber(data[1]) / 100);
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
    price: undefined,
    priceUpdated: toISODateTime(new Date()),
    priceSource: 'lse:share'
  };

  const scrapie = new Scrapie();

  const whenBid = ({ type, attrs }) =>
    type === 'span' && attrs && attrs['data-field'] === 'BID';

  scrapie.when('h1.title__title').on('text', t => {
    item.name = item.name || t.replace(/ Share Price.*/, '');
  });

  scrapie.when(whenBid).on('text', t => {
    item.price = item.price || decimal(extractNumber(t) / 100);
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

async function fetchPrices ({ stocks, positions }) {
  // we fetch prices for anything that we have a position in, or where
  // we have manually caught dividends
  const needed = new Set(
    uniq(
      [...positions.all()].map(p => p.ticker),
      [...stocks.all()].filter(s => s.dividend).map(s => s.ticker)
    )
  );

  const unneeded = new Set(
    [...stocks.all()].map(s => s.ticker).filter(t => !needed.has(t))
  );

  const prices = getPrices(needed);
  for await (const item of prices) {
    const s = stocks.get({ ticker: item.ticker });
    stocks.set({
      ...item,
      name: s ? s.name || item.name : item.name
    });
  }

  for (const ticker of unneeded) {
    stocks.set({
      ticker,
      price: undefined,
      priceSource: undefined,
      priceUpdated: undefined
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

function exportDecimal (x) {
  return x ? x.number : 0
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

function exportDate (x) {
  if (typeof x !== 'string') return x
  const m = /^(\d\d\d\d)-(\d\d)-(\d\d)/.exec(x);
  if (!m) return x
  const parts = m.slice(1).map(x => Number(x));
  return SerialDate.fromParts(parts).serial
}

const debug$2 = log
  .prefix('export:positions:')
  .colour()
  .level(2);

const positions = { name: 'Positions', range: 'Positions!A2:I' };
const timestamp = { name: 'Positions', range: 'Positions!K1' };

async function exportPositions (portfolio) {
  const data = getPositionsSheet(portfolio);

  await overwriteSheetData(positions.name, positions.range, data);
  await putSheetData(timestamp.name, timestamp.range, [[new Date()]]);

  debug$2('position sheet updated');
}

function getPositionsSheet ({ stocks, positions }) {
  const sortFn = sortBy('ticker')
    .thenBy('who')
    .thenBy('account');

  return [...positions.all()]
    .filter(pos => pos.qty && pos.qty.number)
    .sort(sortFn)
    .map(addStock(stocks))
    .map(addDerived)
    .map(makePositionRow)
}

function addStock (stocks) {
  return position => ({
    position,
    stock: stocks.get({ ticker: position.ticker })
  })
}

function addDerived (data) {
  const { position: p, stock: s } = data;
  if (s.price && s.dividend) {
    data.yield = s.dividend
      .precision(6)
      .div(s.price)
      .precision(3);
  }
  if (p.qty && s.price) {
    data.value = s.price.mul(p.qty).precision(2);
  }
  if (p.qty && s.dividend) {
    data.income = s.dividend.mul(p.qty).precision(2);
  }
  return data
}

function makePositionRow (data) {
  const { position: p, stock: s } = data;
  return [
    p.ticker,
    p.who,
    p.account,
    exportDecimal(p.qty),
    exportDecimal(s.price),
    exportDecimal(s.dividend),
    exportDecimal(data.yield),
    exportDecimal(data.value),
    exportDecimal(data.income)
  ]
}

const debug$1 = log
  .prefix('export:trades:')
  .colour()
  .level(2);

const trades = { name: 'Positions', range: 'Trades!A2:G' };

async function exportTrades (portfolio) {
  const data = getTradesSheet(portfolio);

  await overwriteSheetData(trades.name, trades.range, data);
  debug$1('trades sheet updated');
}

function getTradesSheet ({ trades }) {
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq');

  return [...trades.all()].sort(sortFn).map(makeTradeRow)
}

function makeTradeRow (t) {
  return [
    t.who,
    t.account,
    t.ticker,
    exportDate(t.date),
    exportDecimal(t.qty),
    exportDecimal(t.cost),
    exportDecimal(t.gain)
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

  await pipeline(
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
  .prefix('export:stocks:')
  .colour()
  .level(2);

const STOCKS_URI = 'gs://finance-readersludlow/stocks.csv';
const TEMPFILE = '/tmp/stocks.csv';

async function exportStocks ({ stocks }) {
  const data = [...stocks.all()]
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
  return [
    ticker,
    incomeType,
    name,
    exportDecimal(price),
    exportDecimal(dividend),
    notes
  ]
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

  importStocks () {
    return importStocks(this)
  }

  importPortfolio () {
    return importPortfolio(this)
  }

  importTrades () {
    return importTrades(this)
  }

  fetchPrices () {
    return fetchPrices(this)
  }

  exportPositions () {
    return exportPositions(this)
  }

  exportTrades () {
    return exportTrades(this)
  }

  exportStocks () {
    return exportStocks(this)
  }
}

async function update (options) {
  const portfolio = new Portfolio();
  await portfolio.load();

  if (options['import-portfolio']) {
    await portfolio.importPortfolio();
  }

  if (options['import-trades']) {
    await portfolio.importTrades();
  }

  if (options['import-stocks']) {
    await portfolio.importStocks();
  }

  if (options['fetch-prices']) {
    await portfolio.fetchPrices();
  }

  await portfolio.save();

  if (options['export-positions']) {
    await portfolio.exportPositions();
  }
  if (options['export-trades']) {
    await portfolio.exportTrades();
  }

  if (options['export-stocks']) {
    await portfolio.exportStocks();
  }
}

const version = '3.0.0';

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
