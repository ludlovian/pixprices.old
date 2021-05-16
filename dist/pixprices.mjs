#!/usr/bin/env node
import sade from 'sade';
import { format } from 'util';
import { cyan, green, yellow, blue, magenta, red } from 'kleur/colors';
import cheerio from 'cheerio';
import { get } from 'httpie';

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

function batch (size) {
  return function * (source) {
    let batch = [];
    for (const item of source) {
      batch.push(item);
      if (batch.length === size) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
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

const debug$7 = log
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
    const entities = [];
    for await (const entity of this.fetch(options)) {
      entities.push(entity);
    }
    debug$7('%d records loaded from %s', entities.length, this.kind);
    return entities
  }

  async insert (rows) {
    const datastore = await getDatastoreAPI();
    const { kind } = this;
    for (const entities of getEntities(rows, { kind, datastore })) {
      await datastore.insert(entities);
      debug$7('%d records inserted to %s', entities.length, this.kind);
    }
  }

  async update (rows) {
    const datastore = await getDatastoreAPI();
    const { kind } = this;
    for (const entities of getEntities(rows, { kind, datastore })) {
      await datastore.update(entities);
      debug$7('%d records updated to %s', entities.length, this.kind);
    }
  }

  async upsert (rows) {
    const datastore = await getDatastoreAPI();
    const { kind } = this;
    for (const entities of getEntities(rows, { kind, datastore })) {
      await datastore.upsert(entities);
      debug$7('%d records upserted to %s', entities.length, this.kind);
    }
  }

  async delete (rows) {
    const datastore = await getDatastoreAPI();
    for (const keys of getKeys(rows)) {
      await datastore.delete(keys);
      debug$7('%d records deleted from %s', keys.length, this.kind);
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

function * getEntities (arr, { kind, datastore, group = 400 }) {
  const entities = arrify(arr)
    .filter(row => !(row instanceof Row) || row._changed())
    .map(row => ({
      key: row._key || datastore.key([kind]),
      data: clone(row)
    }));

  yield * batch(group)(entities);
}

function * getKeys (arr, { group = 400 } = {}) {
  const keys = arrify(arr)
    .filter(row => row instanceof Row)
    .map(row => row._key);

  yield * batch(group)(keys);
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

const debug$6 = log
  .prefix('sheets:')
  .colour()
  .level(3);

const INVESTMENTS_FOLDER = '0B_zDokw1k2L7VjBGcExJeUxLSlE';

async function getPortfolioSheet () {
  const data = await getSheetData('Portfolio', 'Investments!A:AM');
  debug$6('Portfolio data retrieved');
  return data
}

async function getTradesSheet$1 () {
  const data = await getSheetData('Trades', 'Trades!A2:F');
  debug$6('Trade data retrieved');
  return data
}

async function updatePositionsSheet (data) {
  await overwriteSheetData('Positions', 'Positions!A2:I', data);
  await putSheetData('Positions', 'Positions!K1', [[new Date()]]);
  debug$6('Positions data updated');
}

async function updateTradesSheet (data) {
  await overwriteSheetData('Positions', 'Trades!A2:G', data);
  debug$6('Trades data updated');
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

const debug$5 = log
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
  notSeen.forEach(stock => stocks.delete(stock));
  debug$5(
    'Updated %d and removed %d stocks from portfolio sheet',
    count,
    notSeen.size
  );
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
  debug$5(
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

function group (fn) {
  return function * (src) {
    let prev = Symbol('null');
    let group = [];
    for (const item of src) {
      const curr = fn(item);
      if (!equal(curr, prev)) {
        if (group.length) yield [prev, group];
        group = [];
        prev = curr;
      }
      group.push(item);
    }
    if (group.length) yield [prev, group];
  }
}

function filter (fn) {
  return function * filter (src) {
    for (const item of src) {
      if (fn(item)) yield item;
    }
  }
}

function map (fn) {
  return function * map (src) {
    for (const item of src) {
      yield fn(item);
    }
  }
}

function pipeline (...xforms) {
  return src => xforms.reduce((s, xform) => xform(s), src)
}

function sort (fn) {
  return function * (source) {
    const data = [...source];
    yield * data.sort(fn);
  }
}

const debug$4 = log
  .prefix('import-trades:')
  .colour()
  .level(2);

async function importFromTradesSheet (portfolio) {
  const rangeData = await getTradesSheet$1();

  updateTrades(portfolio.trades, rangeData);
}

function updateTrades (trades, rangeData) {
  const groups = makeExtractor()(rangeData);

  let nGroups = 0;
  let nTrades = 0;

  for (const group of groups) {
    if (!group.length) continue
    nGroups++;
    nTrades += group.length;
    trades.setTrades(group);
  }

  debug$4('Updated %d positions with %d trades', nGroups, nTrades);
}

function makeExtractor () {
  let seq = 0;
  const addSeq = trade => ({ ...trade, seq: seq++ });
  const removeSeq = ({ seq, ...trade }) => trade;
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq');
  const groupFn = ({ who, account, ticker }) => ({ who, account, ticker });

  return pipeline(
    readTrades(),
    map(addSeq),
    sort(sortFn),
    map(removeSeq),
    group(groupFn),
    map(([key, trades]) => addCosts(trades))
  )
}

function addCosts (trades) {
  const pos = { cost: 0, qty: 0 };

  const isBuy = ({ qty, cost }) => qty && cost && qty > 0;
  const isSell = ({ qty, cost }) => qty && cost && qty < 0;
  const adjQty = trade => {
    pos.qty += trade.qty;
    return trade
  };
  const adjCost = trade => {
    pos.cost += trade.cost;
    return trade
  };
  const buy = trade => adjQty(adjCost(trade));
  const sell = trade => {
    const prev = { ...pos };
    const proceeds = -trade.cost;
    pos.qty += trade.qty;
    const portionLeft = prev.qty ? pos.qty / prev.qty : 0;
    pos.cost = Math.round(portionLeft * prev.cost);
    trade.cost = pos.cost - prev.cost;
    trade.gain = proceeds + trade.cost;
    return trade
  };

  trades = trades.map(trade => {
    if (isBuy(trade)) return buy(trade)
    if (isSell(trade)) return sell(trade)
    if (trade.qty) return adjQty(trade)
    if (trade.cost) return adjCost(trade)
    return trade
  });
  return trades
}

function readTrades () {
  const account = 'Dealing';
  let who;
  let ticker;

  return pipeline(map(rowToTrade), filter(validTrade), map(cleanTrade))

  function rowToTrade ([who_, ticker_, date, qty, cost, notes]) {
    who = who_ || who;
    ticker = ticker_ || ticker;
    return { who, account, ticker, date, qty, cost, notes }
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
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const debug$3 = log
  .prefix('lse:')
  .colour()
  .level(3);

const USER_AGENT =
  'Mozilla/5.0 (X11; CrOS x86_64 13729.56.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.95 Safari/537.36';

async function fetchIndex (indexName) {
  // ftse-all-share
  // ftse-aim-all-share
  const url = `https://www.lse.co.uk/share-prices/indices/${indexName}/constituents.html`;
  return fetchCollection(
    url,
    'sp-constituents__table',
    `lse:index:${indexName}`
  )
}

async function fetchSector (sectorName) {
  // alternative-investment-instruments
  const url = `https://www.lse.co.uk/share-prices/sectors/${sectorName}/constituents.html`;
  return fetchCollection(url, 'sp-sectors__table', `lse:sector:${sectorName}`)
}

async function fetchCollection (url, collClass, source) {
  await sleep(1000);

  const now = new Date();
  const fetchOpts = {
    headers: {
      'User-Agent': USER_AGENT
    }
  };
  const { data: html } = await get(url, fetchOpts);
  const $ = cheerio.load(html);
  const items = [];
  $(`table.${collClass} tr`)
    .has('td')
    .each((i, tr) => {
      const values = [];
      $('td', tr).each((j, td) => {
        values.push($(td).text());
      });

      const { name, ticker } = extractNameAndTicker(values[0]);
      const price = extractNumber(values[1]);
      items.push({
        ticker,
        name,
        price,
        priceUpdated: now,
        priceSource: source
      });
    });
  debug$3('Read %d items from %s', items.length, source);
  return items
}

async function fetchPrice (ticker) {
  await sleep(1000);

  const url = [
    'https://www.lse.co.uk/SharePrice.asp',
    `?shareprice=${ticker.padEnd('.', 3)}`
  ].join('');

  const now = new Date();
  const fetchOpts = {
    headers: {
      'User-Agent': USER_AGENT
    }
  };
  const { data: html } = await get(url, fetchOpts);
  const $ = cheerio.load(html);

  const item = {
    ticker,
    name: $('h1.title__title')
      .text()
      .replace(/ Share Price.*/, ''),
    price: extractNumber(
      $('span[data-field="BID"]')
        .first()
        .text()
    ),
    priceUpdated: now,
    priceSource: 'lse:share'
  };

  debug$3('fetched %s from lse:share', ticker);

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

const debug$2 = log
  .prefix('fetch:')
  .colour()
  .level(2);

// first try to load prices via collections - indices and sectors
const attempts = [
  ['ftse-all-share', fetchIndex],
  ['ftse-aim-all-share', fetchIndex],
  ['closed-end-investments', fetchSector]
];

async function fetchPrices (stocks) {
  const neededTickers = new Set([...stocks.values()].map(s => s.ticker));

  for (const [name, fetchFunc] of attempts) {
    const items = await fetchFunc(name);
    let count = 0;
    for (const item of items) {
      if (!neededTickers.has(item.ticker)) continue
      stocks.set(item);
      neededTickers.delete(item.ticker);
      count++;
    }
    debug$2('%d prices from %s', count, name);
    if (!neededTickers.size) break
  }

  // now pick up the remaining ones
  for (const ticker of neededTickers) {
    const item = await fetchPrice(ticker);
    stocks.set(item);
  }

  if (neededTickers) {
    debug$2(
      '%d prices individually: %s',
      neededTickers.size,
      [...neededTickers].join(', ')
    );
  }
}

const debug$1 = log
  .prefix('export-positions:')
  .colour()
  .level(2);

async function exportPositions (portfolio) {
  updatePositionsSheet(getPositionsSheet(portfolio));
  debug$1('position sheet updated');
}

function getPositionsSheet (portfolio) {
  const { stocks, positions } = portfolio;

  const hasQty = pos => !!pos.qty;
  const addStock = position => ({
    position,
    stock: stocks.get(position.ticker)
  });
  const sortFn = sortBy('ticker')
    .thenBy('who')
    .thenBy('account');
  const makeRow = ({ position: p, stock: s }) => [
    p.ticker,
    p.who,
    p.account,
    p.qty,
    s.price || '',
    s.dividend || '',
    s.dividend && s.price ? s.dividend / s.price : '',
    Math.round(p.qty * s.price) / 100 || '',
    s.dividend ? Math.round(p.qty * s.dividend) / 100 : ''
  ];

  const xform = pipeline(
    filter(hasQty),
    sort(sortFn),
    map(addStock),
    map(makeRow)
  );

  return [...xform(positions.values())]
}

const debug = log
  .prefix('export-trades:')
  .colour()
  .level(2);

async function exportTrades (portfolio) {
  updateTradesSheet(getTradesSheet(portfolio));
  debug('trades sheet updated');
}

function getTradesSheet ({ trades }) {
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq');
  const makeRow = ({ who, account, ticker, date, qty, cost, gain }) => [
    who,
    account,
    ticker,
    date,
    qty || '',
    cost ? cost / 100 : '',
    gain ? gain / 100 : ''
  ];

  const xform = pipeline(sort(sortFn), map(makeRow));

  return [...xform(trades.values())]
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

  if (options['fetch-prices']) {
    await fetchPrices(portfolio.stocks);
  }

  await portfolio.save();

  if (options['export-positions']) {
    await exportPositions(portfolio);
  }
  if (options['export-trades']) {
    await exportTrades(portfolio);
  }
}

const version = '2.1.0';

const prog = sade('pixprices');

prog.version(version);

prog
  .command('update', 'update data')
  .option('--import-portfolio', 'read portfolio sheet')
  .option('--import-trades', 'read trades sheet')
  .option('--fetch-prices', 'fetch prices from LSE')
  .option('--export-positions', 'update the positions sheet')
  .option('--export-trades', 'update the trades sheet')
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
