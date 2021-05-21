#!/usr/bin/env node
import sade from 'sade';
import { format } from 'util';
import { cyan, green, yellow, blue, magenta, red } from 'kleur/colors';
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

function SyncEvent () {
  const queue = [];
  let isSet = false;
  return {
    async wait () {
      if (!isSet) return new Promise(resolve => queue.push(resolve))
      isSet = false;
    },

    set () {
      if (!isSet && queue.length) return queue.shift()()
      isSet = true;
    },

    get isSet () {
      return isSet
    }
  }
}

function Pipe (length = 100) {
  const queue = [];
  const hasData = new SyncEvent();
  const hasRoom = new SyncEvent();
  hasRoom.set();

  const reader = (async function * () {
    while (true) {
      await hasData.wait();
      const { value, done, error } = queue.shift();
      if (error) throw error
      if (done) return
      setEvents();
      yield value;
    }
  })();

  const writer = {
    async write (value) {
      if (writer.closed) throw new PipeClosed()
      await _write({ value });
    },

    async throw (error) {
      if (writer.closed) throw new PipeClosed()
      writer.closed = true;
      await _write({ error });
    },

    async close () {
      if (writer.closed) return
      writer.closed = true;
      await _write({ done: true });
    }
  };

  async function _write (item) {
    await hasRoom.wait();
    queue.push(item);
    setEvents();
  }

  function setEvents () {
    if (queue.length && !hasData.isSet) hasData.set();
    if (queue.length < length && !hasRoom.isSet) hasRoom.set();
  }

  return [reader, writer]
}

class PipeClosed extends Error {
  constructor () {
    super('Pipe closed');
  }
}

Pipe.PipeClosed = PipeClosed;

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
function returnThis () {
  return this
}

class Teme {
  static from (src) {
    if (src instanceof Teme) return src
    const t = new Teme();
    const it = src[AITER]();
    async function next () {
      const item = await it.next();
      Object.assign(this, item);
      return item
    }
    Object.defineProperties(t, {
      [AITER]: { value: returnThis, configurable: true },
      next: { value: next, configurable: true }
    });
    return t
  }

  constructor (src) {
    this.done = undefined;
    this.value = undefined;
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

  map (fn, ctx) {
    return Teme.from(gen(this))
    async function * gen (src) {
      for await (const v of src) yield await fn(v, ctx);
    }
  }

  filter (fn) {
    return Teme.from(gen(this))
    async function * gen (src) {
      for await (const v of src) {
        if (fn(v)) yield v;
      }
    }
  }

  async collect () {
    const arr = [];
    for await (const v of this) arr.push(v);
    return arr
  }

  sort (fn) {
    return Teme.from(gen(this))
    async function * gen (src) {
      const arr = await src.collect();
      yield * arr.sort(fn);
    }
  }

  each (fn) {
    return this.map(async v => {
      await fn(v);
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
    return Teme.from(gen(this))
    async function * gen (src) {
      let tgt = EMPTY;
      let key = EMPTY;
      let item = {};
      while (!item.done) {
        while (equal(key, tgt)) {
          item = await src.next();
          if (item.done) return
          key = fn(item.value);
        }
        tgt = key;
        yield [key, Teme.from(grouper())];
      }
      async function * grouper () {
        while (equal(key, tgt)) {
          yield item.value;
          item = await src.next();
          if (item.done) return
          key = fn(item.value);
        }
      }
    }
  }

  batch (size) {
    let n = 0;
    const addCtx = value => ({ value, seq: (n++ / size) | 0 });
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

  async consume () {
    while (true) {
      const { done } = await this.next();
      if (done) return
    }
  }

  tee (fn, size) {
    const [reader, writer] = new Pipe(size);
    fn(Teme.from(reader));
    async function * gen (src) {
      for await (const v of src) {
        await writer.write(v);
        yield v;
      }
      await writer.close();
    }
    return Teme.from(gen(this))
  }
}

class TemeSync extends Teme {
  static from (src) {
    if (src instanceof Teme) return src
    const t = new TemeSync();
    const it = src[SITER]();
    function next () {
      const item = it.next();
      Object.assign(this, item);
      return item
    }
    Object.defineProperties(t, {
      [SITER]: { value: returnThis, configurable: true },
      next: { value: next, configurable: true }
    });
    return t
  }

  get isSync () {
    return true
  }

  toAsync () {
    return Teme.from(gen(this))
    async function * gen (src) {
      yield * src;
    }
  }

  map (fn, ctx) {
    return TemeSync.from(gen(this))
    function * gen (src) {
      for (const v of src) yield fn(v, ctx);
    }
  }

  filter (fn) {
    return TemeSync.from(gen(this))
    function * gen (src) {
      for (const v of src) {
        if (fn(v)) yield v;
      }
    }
  }

  collect () {
    return [...this]
  }

  sort (fn) {
    return TemeSync.from(this.collect().sort(fn))
  }

  each (fn) {
    return this.map(v => {
      fn(v);
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
    return TemeSync.from(gen(this))
    function * gen (src) {
      let tgt = EMPTY;
      let key = EMPTY;
      let item = {};
      while (!item.done) {
        while (equal(key, tgt)) {
          item = src.next();
          if (item.done) return
          key = fn(item.value);
        }
        tgt = key;
        yield [key, TemeSync.from(grouper())];
      }
      function * grouper () {
        while (equal(key, tgt)) {
          yield item.value;
          item = src.next();
          if (item.done) return
          key = fn(item.value);
        }
      }
    }
  }

  consume () {
    while (true) {
      const { done } = this.next();
      if (done) return
    }
  }

  tee (fn) {
    return this.toAsync().tee(fn)
  }
}

function teme (s) {
  if (typeof s[SITER] === 'function') return TemeSync.from(s)
  if (typeof s[AITER] === 'function') return Teme.from(s)
  throw new Error('Not iterable')
}

teme.join = function join (...sources) {
  const [reader, writer] = new Pipe();
  sources.forEach(feed);
  let open = sources.length;
  if (!open) writer.close();
  return Teme.from(reader)

  async function feed (stream, index) {
    try {
      for await (const value of stream) {
        if (writer.closed) return
        await writer.write([value, index]);
      }
      if (!--open) await writer.close();
    } catch (error) {
      writer.throw(Object.assign(error, { index }));
    }
  }
};

teme.isTeme = function isTeme (t) {
  return t instanceof Teme
};

const colourFuncs = { cyan, green, yellow, blue, magenta, red };
const colours = Object.keys(colourFuncs);
const CLEAR_LINE = '\r\x1b[0K';
const RE_DECOLOR = /(^|[^\x1b]*)((?:\x1b\[\d*m)|$)/g; // eslint-disable-line no-control-regex

const state = {
  dirty: false,
  width: process.stdout && process.stdout.columns,
  level: process.env.LOGLEVEL,
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
  if (colour && colour in colourFuncs) string = colourFuncs[colour](string);
  if (limitWidth) string = truncate(string, state.width);
  if (newline) string = string + '\n';
  if (state.dirty) string = CLEAR_LINE + string;
  state.dirty = !newline && !!msg;
  state.write(string);
}

function truncate (string, max) {
  max -= 2; // leave two chars at end
  if (string.length <= max) return string
  const parts = [];
  let w = 0
  ;[...string.matchAll(RE_DECOLOR)].forEach(([, txt, clr]) => {
    parts.push(txt.slice(0, max - w), clr);
    w = Math.min(w + txt.length, max);
  });
  return parts.join('')
}

function merge (old, new_) {
  const prefix = (old.prefix || '') + (new_.prefix || '');
  return { ...old, ...new_, prefix }
}

function logger (options) {
  return Object.defineProperties((...args) => _log(args, options), {
    _preset: { value: options, configurable: true },
    _state: { value: state, configurable: true },
    name: { value: 'log', configurable: true }
  })
}

function nextColour () {
  const clr = colours.shift();
  colours.push(clr);
  return clr
}

function fixup (log) {
  const p = log._preset;
  Object.assign(log, {
    status: logger(merge(p, { newline: false, limitWidth: true })),
    level: level => fixup(logger(merge(p, { level }))),
    colour: colour =>
      fixup(logger(merge(p, { colour: colour || nextColour() }))),
    prefix: prefix => fixup(logger(merge(p, { prefix }))),
    ...colourFuncs
  });
  return log
}

const log = fixup(logger({}));

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
      pos.qty += trade.qty;
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
  '<![CDATA[': { rgx: /]]>/, start: 9, end: 3, handler: 'onCData' },
  '<!--': { rgx: /-->/, start: 4, end: 3 },
  '<script': { rgx: /<\/script>/, start: 7, end: 9 }
};
const CHUNK = 1024;

function parseDoc (hooks = {}) {
  return Object.assign(new Parser(), hooks)
}

class Parser {
  constructor () {
    this.buff = '';
    this.special = false;
  }

  write (s) {
    this.buff += s;
    if (this.special) {
      this.handleSpecial();
    } else {
      this.handle();
    }
  }

  close () {
    this.handle();
    this.buff = '';
  }

  handle () {
    rgxMain.lastIndex = undefined;
    let consumed = 0;
    while (true) {
      const m = rgxMain.exec(this.buff);
      if (!m) break
      const [, text, special, tag] = m;
      if (text) {
        consumed = m.index + text.length;
        this.onText(text);
      } else if (tag) {
        consumed = m.index + tag.length + 2;
        this.onTag(tag);
      } else if (special) {
        this.special = special;
        const { start } = specials[special];
        consumed = m.index + start;
        this.buff = this.buff.slice(consumed);
        return this.handleSpecial()
      }
    }
    this.buff = this.buff.slice(consumed);
  }

  handleSpecial () {
    const { rgx, end, handler } = specials[this.special];
    const match = rgx.exec(this.buff);
    if (match) {
      const data = this.buff.slice(0, match.index);
      this.buff = this.buff.slice(match.index + end);
      if (handler && this[handler]) {
        if (data.length) this[handler](data);
      }
      this.special = false;
      return this.handle()
    }
    if (this.buff.length > CHUNK) {
      const data = this.buff.slice(0, CHUNK);
      this.buff = this.buff.slice(CHUNK);
      if (handler && this[handler]) this[handler](data);
    }
  }
}

/* c8 ignore next */
function nothing () {}

Parser.prototype.onText = nothing;
Parser.prototype.onTag = nothing;

const rgx = /^(\/?)(\S+)|(\S+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))|(\/)\s*$/g;
/*           <---tag---> <--------------attr---------------------> <------>
 *                       <--->       <-------------------------->   selfClose
 *                      name             <-dq-->   <-sq-->  <--->
 *                                                           nq
 */

function parseTag (s) {
  if (s.startsWith('!') || s.startsWith('?')) return { text: s }
  const out = { type: '' };
  rgx.lastIndex = undefined;
  while (true) {
    const m = rgx.exec(s);
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

class Scrapie {
  constructor () {
    this.path = [];
    this._parser = parseDoc({
      onTag: s => this._onTag(s),
      onText: s => this._onText(s)
    });
    this.write = this._parser.write.bind(this._parser);
    this.close = this._parser.close.bind(this._parser);
    this._hooks = new Set();
  }

  get depth () {
    return this.path.length
  }

  _onTag (string) {
    const tag = parseTag(string);
    const { type, close, selfClose } = tag;
    if (!type) {
      if (this.onSpecial) this.onSpecial(string);
      return
    }

    if (!close) {
      this.path.push(type);
      this._callHooks({ tag });
      if (selfClose) this.path.pop();
    } else {
      while (this.depth && this.path[this.depth - 1] !== type) {
        this.path.pop();
      }
      this._callHooks({ tag });
      this.path.pop();
    }
  }

  _onText (text) {
    this._callHooks({ text });
  }

  _callHooks (data) {
    for (const hook of [...this._hooks]) {
      if (hook.fn(data, hook.ctx) === false) this._hooks.delete(hook);
    }
  }

  hook (fn, ctx) {
    this._hooks.add({ fn, ctx });
  }

  when (fn) {
    const h = new Hook(this, fn);
    this._hooks.add(h);
    return h
  }
}

class Hook {
  constructor (scrapie, fn) {
    this.scrapie = scrapie;
    this.depth = scrapie.depth;
    if (typeof fn === 'string') {
      const t = fn;
      fn = ({ type }) => type === t;
    }
    this.fnWhen = fn;
    return this
  }

  onTag (fn) {
    this.fnTag = fn;
    return this
  }

  atEnd (fn) {
    this.fnEnd = fn;
    return this
  }

  onText (fn) {
    this.fnText = fn;
    return this
  }

  fn ({ tag }) {
    if (this.scrapie.depth < this.depth) return false
    if (!tag || tag.close) return undefined
    if (!this.fnWhen(tag)) return undefined
    const ctx = {};
    if (this.fnTag && this.fnTag(tag, ctx) === false) return false
    if (this.fnEnd) {
      this.scrapie.hook(({ tag }, depth) => {
        if (!tag) return
        const currDepth = this.scrapie.depth;
        if (currDepth < depth) return false
        if (currDepth > depth) return undefined
        if (tag.close) this.fnEnd(ctx);
        return false
      }, this.scrapie.depth);
    }

    if (this.fnText) {
      this.scrapie.hook(({ text }, depth) => {
        if (!text) return
        if (this.scrapie.depth < depth) return false
        return this.fnText(text, ctx)
      }, this.scrapie.depth);
    }
  }
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

  const scrapie = new Scrapie();
  scrapie.when('table').onTag(({ attrs }) => {
    if (!attrs.class.includes(collClass)) return
    scrapie
      .when('tr')
      .onTag((tag, ctx) => {
        ctx.data = [];
      })
      .onText((text, ctx) => {
        if (!scrapie.path.includes('td')) return undefined
        if (ctx.data.push(text) === 2) return false
      })
      .atEnd(ctx => {
        if (ctx.data.length === 2) addItem(ctx.data);
      });
  });

  const source = await get(url);
  source.setEncoding('utf8');

  for await (const chunk of source) {
    scrapie.write(chunk);
    count += items.length;
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

  const whenTitle = ({ type, attrs }) =>
    type === 'h1' && attrs.class.includes('title__title');
  const whenBid = ({ type, attrs }) =>
    type === 'span' && attrs['data-field'] === 'BID';

  scrapie.when(whenTitle).onText(t => {
    item.name = t.replace(/ Share Price.*/, '');
    return false
  });

  scrapie.when(whenBid).onText(t => {
    item.price = extractNumber(t);
    return false
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
    s.price || '',
    s.dividend || '',
    s.dividend && s.price ? s.dividend / s.price : '',
    Math.round(p.qty * s.price) / 100 || '',
    s.dividend ? Math.round(p.qty * s.dividend) / 100 : ''
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
    qty || '',
    cost ? cost / 100 : '',
    gain ? gain / 100 : ''
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
  return [ticker, incomeType, name, price, dividend, notes]
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

const version = '2.4.2';

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
