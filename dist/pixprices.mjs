#!/usr/bin/env node
import sade from 'sade';
import { format } from 'util';
import { cyan, green, yellow, blue, magenta, red } from 'kleur/colors';
import cheerio from 'cheerio';
import { get } from 'httpie';

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

const debug$8 = log.prefix('googlejs:datastore:').colour().level(5);

class Table$1 {
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
    debug$8('%d records loaded from %s', entities.length, this.kind);
    return entities
  }

  async insert (rows) {
    const datastore = await getDatastoreAPI();
    const { kind } = this;
    for (const entities of getEntities(rows, { kind, datastore })) {
      await datastore.insert(entities);
      debug$8('%d records inserted to %s', entities.length, this.kind);
    }
  }

  async update (rows) {
    const datastore = await getDatastoreAPI();
    const { kind } = this;
    for (const entities of getEntities(rows, { kind, datastore })) {
      await datastore.update(entities);
      debug$8('%d records updated to %s', entities.length, this.kind);
    }
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

const KEY = Symbol('rowKey');
const PREV = Symbol('prev');

class Row {
  constructor (entity, datastore) {
    Object.assign(this, clone(entity));
    Object.defineProperties(this, {
      [KEY]: { value: entity[datastore.KEY], configurable: true },
      [PREV]: { value: clone(entity), configurable: true }
    });
  }

  get _key () {
    return this[KEY]
  }

  _changed () {
    // unwrap from class before comparing
    return !equal({ ...this }, this[PREV])
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
  let batch = [];
  for (const row of arrify(arr)) {
    if (row instanceof Row && !row._changed()) continue
    batch.push({
      key: row instanceof Row ? row._key : datastore.key([kind]),
      data: clone(row)
    });
    if (batch.length === group) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) {
    yield batch;
  }
}

function * getKeys (arr, { group = 400 } = {}) {
  let batch = [];
  for (const row of arrify(arr)) {
    if (!(row instanceof Row)) continue
    batch.push(row._key);
    if (batch.length === group) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) {
    yield batch;
  }
}

const debug$7 = log
  .prefix('portfolio:')
  .colour()
  .level(2);

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

class Table {
  constructor (name) {
    this.name = name;
    this._table = new Table$1(name);
  }

  async load () {
    const rows = await this._table.select({ factory: this.factory });
    if (this.order) rows.sort(this.order);
    this._rows = new Set(rows);
    this._prevRows = new Set(rows);
    this._changed = new Set();
    debug$7('loaded %d rows from %s', rows.length, this.name);
  }

  async save () {
    const changed = [...this._changed];
    const deleted = [...this._prevRows].filter(row => !this._rows.has(row));
    if (changed.length) {
      await this._table.upsert(changed);
      debug$7('upserted %d rows in %s', changed.length, this.name);
    }

    if (deleted.length) {
      await this._table.delete(deleted);
      debug$7('deleted %d rows in %s', deleted.length, this.name);
    }
  }

  * find (fn) {
    for (const row of this._rows) {
      if (fn(row)) yield row;
    }
  }

  set (data) {
    const key = this.key(data);
    const fn = row => equal(this.key(row), key);
    const [row] = [...this.find(fn)];
    if (row) {
      Object.assign(row, data);
      this._changed.add(row);
      return row
    } else {
      const row = { ...data };
      this._rows.add(row);
      this._changed.add(row);
      return row
    }
  }

  delete (data) {
    const key = this.key(data);
    const fn = row => equal(this.key(row), key);
    const [row] = [...this.find(fn)];
    if (!row) return
    this._rows.delete(row);
    this._changed.delete(row);
    return row
  }

  values () {
    return this._rows.values()
  }
}

class Stocks extends Table {
  constructor () {
    super('Stock');
    this.factory = Stock;
    this.order = sortBy('ticker');
    this.key = ({ ticker }) => ({ ticker });
  }

  get (ticker) {
    const fn = row => row.ticker === ticker;
    return this.find(fn).next().value
  }
}

class Stock extends Row {}

class Positions extends Table {
  constructor () {
    super('Position');
    this.factory = Position;
    this.order = sortBy('ticker')
      .thenBy('who')
      .thenBy('account');
    this.key = ({ ticker, who, account }) => ({ ticker, who, account });
  }
}

class Position extends Row {}

class Trades extends Table {
  constructor () {
    super('Trade');
    this.factory = Trade;
    this.order = sortBy('who')
      .thenBy('account')
      .thenBy('ticker')
      .thenBy('seq');
    this.key = ({ who, account, ticker, seq }) => ({
      who,
      account,
      ticker,
      seq
    });
  }

  setTrades (data) {
    const getKey = ({ who, account, ticker }) => ({ who, account, ticker });
    const key = getKey(data[0]);
    const fn = row => equal(getKey(row), key);
    const existing = [...this.find(fn)];
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
    const item = { ticker };
    if (!div || typeof div !== 'number') {
      item.dividend = undefined;
    } else {
      item.dividend = Math.round(div * 1e5) / 1e3;
    }
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
    tickerColumn = DEFAULT_TICKER_COLUMN,
    accountStartColumn = DEFAULT_ACCOUNT_COLUMN,
    accountList = DEFAULT_ACCOUNT_LIST
  } = options;

  const accounts = accountList.split(';').map(code => {
    const [who, account] = code.split(',');
    return { who, account }
  });

  for (const row of rangeData) {
    const ticker = row[tickerColumn];
    if (!ticker) continue

    const qtys = row.slice(
      accountStartColumn,
      accountStartColumn + accounts.length
    );
    for (const [i, qty] of qtys.entries()) {
      if (!qty || typeof qty !== 'number') continue

      yield { ...accounts[i], ticker, qty };
    }
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

function updateTrades (trades, source) {
  source = rawTrades(source);
  source = sortTrades$1(source);
  source = groupTrades(source);
  source = addCosts(source);

  let nGroups = 0;
  let nTrades = 0;

  for (const group of source) {
    if (!group.length) continue
    nGroups++;
    nTrades += group.length;
    trades.setTrades(group);
  }

  debug$4('Updated %d positions with %d trades', nGroups, nTrades);
}

function * addCosts (source) {
  for (const trades of source) {
    const pos = { cost: 0, qty: 0 };
    for (const trade of trades) {
      if (trade.qty && trade.cost && trade.qty > 0) {
        pos.qty += trade.qty;
        pos.cost += trade.cost;
      } else if (trade.qty && trade.cost && trade.qty < 0) {
        const prevPos = { ...pos };
        pos.qty += trade.qty;
        pos.cost = prevPos.qty
          ? Math.round((prevPos.cost * pos.qty) / prevPos.qty)
          : 0;
        const proceeds = -trade.cost;
        trade.cost = pos.cost - prevPos.cost;
        trade.gain = proceeds + trade.cost;
      } else if (trade.qty) {
        pos.qty += trade.qty;
      } else if (trade.cost) {
        pos.cost += trade.cost;
      }
    }
    yield trades;
  }
}

function * groupTrades (source) {
  const getKey = ({ who, account, ticker }) => ({ who, account, ticker });
  let currkey;
  let trades = [];
  for (const trade of source) {
    const key = getKey(trade);
    if (!equal(key, currkey)) {
      if (trades.length) yield trades;
      currkey = key;
      trades = [];
    }
    trades.push(trade);
  }
  if (trades.length) yield trades;
}

function * sortTrades$1 (source) {
  const trades = [...source];
  // add sequence to ensure stable sort
  trades.forEach((trade, seq) => Object.assign(trade, { seq }));
  const fn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq');
  trades.sort(fn);
  // strip sequence out
  for (const { seq, ...trade } of trades) {
    yield trade;
  }
}

function * rawTrades (rows) {
  const account = 'Dealing';
  let who;
  let ticker;
  for (const row of rows) {
    const [who_, ticker_, date_, qty, cost, notes] = row;
    if (who_) who = who_;
    if (ticker_) ticker = ticker_;
    if (typeof date_ !== 'number') continue
    if (qty && typeof qty !== 'number') continue
    if (cost && typeof cost !== 'number') continue
    if (!qty && !cost) continue
    const date = toDate(date_);
    yield clean({
      who,
      ticker,
      account,
      date,
      qty,
      cost: Math.round(cost * 100),
      notes
    });
  }
}

function clean (obj) {
  const ret = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) ret[k] = v;
  }
  return ret
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
  ['alternative-investment-instruments', fetchSector]
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
  const rows = positionRows(getPositions(portfolio));
  const fn = sortBy(0)
    .thenBy(1)
    .thenBy(2);
  return [...rows].sort(fn)
}

function * getPositions ({ positions, stocks }) {
  for (const position of positions.values()) {
    if (!position.qty) continue
    const stock = stocks.get(position.ticker);
    yield { stock, position };
  }
}

function * positionRows (source) {
  for (const { position, stock } of source) {
    const { who, account, ticker, qty } = position;
    const { dividend, price } = stock;
    yield [
      ticker,
      who,
      account,
      qty,
      price || '',
      dividend || '',
      dividend && price ? dividend / price : '',
      Math.round(qty * price) / 100 || '',
      dividend ? Math.round(qty * dividend) / 100 : ''
    ];
  }
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
  let source = trades.values();
  source = sortTrades(source);
  source = makeRows(source);
  return [...source]
}

function * sortTrades (source) {
  const fn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq');
  const rows = [...source];
  rows.sort(fn);
  yield * rows;
}

function * makeRows (source) {
  for (const trade of source) {
    const { who, account, ticker, date, qty, cost, gain } = trade;
    yield [
      who,
      account,
      ticker,
      date,
      qty || '',
      cost ? cost / 100 : '',
      gain ? gain / 100 : ''
    ];
  }
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

const version = '1.2.4';

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
