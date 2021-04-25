#!/usr/bin/env node
import sade from 'sade';
import Debug from 'debug';
import { request } from 'http';
import 'net';
import cheerio from 'cheerio';
import { get } from 'httpie';

function deserialize (obj) {
  if (Array.isArray(obj)) return Object.freeze(obj.map(deserialize))
  if (obj === null || typeof obj !== 'object') return obj
  if ('$$date$$' in obj) return Object.freeze(new Date(obj.$$date$$))
  if ('$$undefined$$' in obj) return undefined
  return Object.freeze(
    Object.entries(obj).reduce(
      (o, [k, v]) => ({ ...o, [k]: deserialize(v) }),
      {}
    )
  )
}

function serialize (obj) {
  if (Array.isArray(obj)) return obj.map(serialize)
  if (obj === undefined) return { $$undefined$$: true }
  if (obj instanceof Date) return { $$date$$: obj.getTime() }
  if (obj === null || typeof obj !== 'object') return obj
  return Object.entries(obj).reduce(
    (o, [k, v]) => ({ ...o, [k]: serialize(v) }),
    {}
  )
}

const jsonrpc = '2.0';

const knownErrors = {};

class RpcClient {
  constructor (options) {
    this.options = options;
  }

  async call (method, ...params) {
    const body = JSON.stringify({
      jsonrpc,
      method,
      params: serialize(params)
    });

    const options = {
      ...this.options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        Connection: 'keep-alive'
      }
    };
    const res = await makeRequest(options, body);
    const data = await readResponse(res);

    if (data.error) {
      const errDetails = deserialize(data.error);
      const Factory = RpcClient.error(errDetails.name);
      throw new Factory(errDetails)
    }

    return deserialize(data.result)
  }

  static error (name) {
    let constructor = knownErrors[name];
    if (constructor) return constructor
    constructor = makeErrorClass(name);
    knownErrors[name] = constructor;
    return constructor
  }
}

function makeRequest (options, body) {
  return new Promise((resolve, reject) => {
    const req = request(options, resolve);
    req.once('error', reject);
    req.write(body);
    req.end();
  })
}

async function readResponse (res) {
  res.setEncoding('utf8');
  let data = '';
  for await (const chunk of res) {
    data += chunk;
  }
  return JSON.parse(data)
}

function makeErrorClass (name) {
  function fn (data) {
    const { name, ...rest } = data;
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);
    Object.assign(this, rest);
  }

  // reset the name of the constructor
  Object.defineProperties(fn, {
    name: { value: name, configurable: true }
  });

  // make it inherit from error
  fn.prototype = Object.create(Error.prototype, {
    name: { value: name, configurable: true },
    constructor: { value: fn, configurable: true }
  });

  return fn
}

const jsdbMethods = new Set([
  'ensureIndex',
  'deleteIndex',
  'insert',
  'update',
  'upsert',
  'delete',
  'find',
  'findOne',
  'getAll',
  'compact',
  'reload'
]);

const jsdbErrors = new Set(['KeyViolation', 'NotExists', 'NoIndex']);

let client;

const staticMethods = ['status', 'housekeep', 'clear', 'shutdown'];

class Database {
  constructor (opts) {
    /* c8 ignore next 2 */
    if (typeof opts === 'string') opts = { filename: opts };
    const { port = 39720, ...options } = opts;
    this.options = options;
    if (!client) {
      client = new RpcClient({ port });
      for (const method of staticMethods) {
        Database[method] = client.call.bind(client, method);
      }
    }
    const { filename } = this.options;
    for (const method of jsdbMethods.values()) {
      this[method] = client.call.bind(client, 'dispatch', filename, method);
    }
  }

  async check () {
    try {
      await client.call('status');
      /* c8 ignore next 6 */
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        throw new NoServer(err)
      } else {
        throw err
      }
    }
  }

  static _reset () {
    client = undefined;
  }
}

class NoServer extends Error {
  constructor (err) {
    super('Could not find jsdbd');
    Object.assign(this, err, { client });
  }
}

Database.NoServer = NoServer;

jsdbErrors.forEach(name => {
  Database[name] = RpcClient.error(name);
});

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function wrap (fn) {
  return (...args) =>
    Promise.resolve(fn(...args)).catch(err => {
      console.error(err);
      process.exit(1);
    })
}

function once$1 (fn) {
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

const debug$2 = Debug('pixprices:fetch-lse');

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
  await delay(1000);

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
        time: now,
        source
      });
    });
  debug$2('Read %d items from %s', items.length, source);
  return items
}

async function fetchPrice (ticker) {
  await delay(1000);

  const url = `https://www.lse.co.uk/SharePrice.asp?shareprice=${ticker}`;
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
    time: now,
    source: 'lse:share'
  };

  item.name = $('h1.title__title')
    .text()
    .replace(/ Share Price.*/, '');
  item.price = extractNumber(
    $('span[data-field="BID"]')
      .first()
      .text()
  );

  debug$2('fetched %s from lse:share', ticker);

  return item
}

function extractNameAndTicker (text) {
  const re = /(.*)\s+\(([A-Z0-9.]{2,4})\)$/;
  const m = re.exec(text);
  if (!m) return {}
  const [, name, ticker] = m;
  return { name, ticker }
}

function extractNumber (text) {
  return parseFloat(text.replace(/,/g, ''))
}

const debug$1 = Debug('pixprices:portfolio');

const DEFAULT_TICKER_COLUMN = 10; // column K
const DEFAULT_ACCOUNT_COLUMN = 0; // column A
const DEFAULT_ACCOUNT_LIST =
  'AJL,ISA;RSGG,ISA;AJL,Dealing;RSGG,Dealing;AJL,SIPP;RSGG,SIPP;RSGG,SIPP2';
const DEFAULT_DIV_COLUMN = 26; // column AA

class Portfolio {
  constructor () {
    this.stocks = new Stocks();
    this.positions = new Positions();
  }

  static async deserialize () {
    const p = new Portfolio();
    {
      const db = new Database('stocks.db');
      for (const stock of await db.getAll()) {
        Object.assign(p.stocks.get(stock.ticker), stock);
      }
    }
    {
      const db = new Database('positions.db');
      for (const pos of await db.getAll()) {
        Object.assign(p.positions.get(pos), pos);
      }
    }

    debug$1('portfolio loaded from database');
    return p
  }

  async serialize () {
    {
      const db = new Database('stocks.db');
      await db.ensureIndex({ fieldName: 'ticker', unique: true });

      const { insert, update, remove } = getChanges(
        await db.getAll(),
        Array.from(this.stocks.values()),
        x => x.ticker
      );
      await db.insert(insert);
      await db.update(update);
      await db.delete(remove);
      await db.compact();
      debug$1(
        'stocks wrtten to db (I:%d, U:%d, D:%d)',
        insert.length,
        update.length,
        remove.length
      );
    }

    {
      const db = new Database('positions.db');
      await db.ensureIndex({ fieldName: 'who' });
      await db.ensureIndex({ fieldName: 'account' });
      await db.ensureIndex({ fieldName: 'ticker' });
      const { insert, update, remove } = getChanges(
        await db.getAll(),
        Array.from(this.positions.values()),
        keyToString
      );

      await db.insert(insert);
      await db.update(update);
      await db.delete(remove);
      await db.compact();
      debug$1(
        'positions wrtten to db (I:%d, U:%d, D:%d)',
        insert.length,
        update.length,
        remove.length
      );
    }
  }

  loadStocksFromSheet (rangeData, options = {}) {
    const {
      tickerColumn = DEFAULT_TICKER_COLUMN,
      divColumn = DEFAULT_DIV_COLUMN
    } = options;

    const old = new Set(this.stocks.values());

    for (const row of rangeData) {
      const ticker = row[tickerColumn];
      if (!ticker) continue
      const stock = this.stocks.get(ticker);
      old.delete(stock);
      const div = row[divColumn];
      if (!div || typeof div !== 'number') {
        stock.dividend = undefined;
      } else {
        stock.dividend = Math.round(div * 1e5) / 1e5;
      }
    }

    for (const stock of old.values()) {
      this.stocks.delete(stock.ticker);
    }

    debug$1('stocks refreshed from piggy sheet');
  }

  loadPositionsFromSheet (rangeData, options = {}) {
    const {
      tickerColumn = DEFAULT_TICKER_COLUMN,
      accountStartColumn = DEFAULT_ACCOUNT_COLUMN,
      accountList = DEFAULT_ACCOUNT_LIST
    } = options;

    const accounts = accountList.split(';').map(code => {
      const [who, account] = code.split(',');
      return { who, account }
    });

    const old = new Set(this.positions.values());

    for (const row of rangeData) {
      const ticker = row[tickerColumn];
      if (!ticker) continue
      const qtys = row.slice(
        accountStartColumn,
        accountStartColumn + accounts.length
      );
      for (const [i, qty] of qtys.entries()) {
        if (!qty || typeof qty !== 'number') continue
        const pos = this.positions.get({ ...accounts[i], ticker });
        pos.qty = qty;
        old.delete(pos);
      }
    }

    for (const pos of old) {
      this.positions.delete(pos);
    }

    debug$1('positions refreshed from piggy sheet');
  }

  async fetchPrices () {
    const need = new Map(
      Array.from(this.stocks.values()).map(stock => [stock.ticker, stock])
    );

    // first try to load prices via collections - indices and sectors

    const attempts = [
      ['ftse-all-share', fetchIndex],
      ['ftse-aim-all-share', fetchIndex],
      ['alternative-investment-instruments', fetchSector]
    ];

    for (const [name, fetchFunc] of attempts) {
      const items = await fetchFunc(name);
      let count = 0;
      for (const item of items) {
        const ticker = item.ticker.replace(/\.+$/, '');
        const stock = need.get(ticker);
        if (!stock) continue
        need.delete(ticker);
        count++;
        Object.assign(stock, {
          name: item.name,
          price: {
            value: item.price,
            source: item.source,
            time: item.time
          }
        });
      }
      debug$1('%d prices from %s', count, name);
      if (!need.size) break
    }

    // now pick up the remaining ones
    for (const stock of need.values()) {
      const item = await fetchPrice(stock.ticker.padEnd(3, '.'));
      Object.assign(stock, {
        name: item.name,
        price: {
          value: item.price,
          source: item.source,
          time: item.time
        }
      });
    }

    if (need.size) {
      debug$1(
        '%d prices individually: %s',
        need.size,
        Array.from(need.values())
          .map(s => s.ticker)
          .join(', ')
      );
    }
  }

  getPositionsSheet () {
    const rows = [];
    for (const pos of this.positions.values()) {
      const { who, account, ticker, qty } = pos;
      if (!qty) continue

      const stock = this.stocks.get(ticker);
      const {
        dividend,
        price: { value: price }
      } = stock;
      rows.push([
        ticker,
        who,
        account,
        qty,
        price,
        dividend,
        Math.round(qty * price) / 100,
        dividend ? Math.round(qty * dividend * 100) / 100 : undefined
      ]);
    }

    return rows
  }
}

class Stocks {
  constructor () {
    this._map = new Map();
  }

  get (key) {
    let s = this._map.get(key);
    if (s) return s
    s = Object.assign(new Stock(), { ticker: key });
    this._map.set(key, s);
    return s
  }

  delete (key) {
    this._map.delete(key);
  }

  values () {
    return this._map.values()
  }
}

class Positions {
  constructor () {
    this._map = new Map();
  }

  get (key) {
    const s = keyToString(key);

    let pos = this._map.get(s);
    if (pos) return pos

    pos = Object.assign(new Position(), { ...key, qty: 0 });
    this._map.set(s, pos);
    return pos
  }

  delete (key) {
    this._map.delete(keyToString(key));
  }

  values () {
    return this._map.values()
  }
}

class Position {}
class Stock {}

function keyToString ({ who, account, ticker }) {
  return `${who}_${account}_${ticker}`
}

function getChanges (fromList, toList, keyFunc) {
  const prevEntries = new Map(fromList.map(item => [keyFunc(item), item]));

  const insert = [];
  const update = [];

  for (const item of toList) {
    const key = keyFunc(item);
    if (prevEntries.has(key)) {
      update.push(item);
      prevEntries.delete(key);
    } else {
      insert.push(item);
    }
  }

  const remove = Array.from(prevEntries.values());

  return { insert, update, remove }
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

function jsDateToSerialDate (dt) {
  const ms = dt.getTime();
  const localMs = ms - dt.getTimezoneOffset() * 60 * 1000;
  const localDays = localMs / (1000 * 24 * 60 * 60);
  const epochStart = 25569;
  return epochStart + localDays
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
    row.map(val => (val instanceof Date ? jsDateToSerialDate(val) : val))
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

const debug = Debug('pixprices:sheets');

const INVESTMENTS_FOLDER = '0B_zDokw1k2L7VjBGcExJeUxLSlE';

async function getPortfolioSheet () {
  const data = await getSheetData('Portfolio', 'Investments!A:AM');
  debug('Portfolio data retrieved');
  return data
}

async function updatePositionsSheet (data) {
  const currData = await getSheetData('Positions', 'Positions!A2:H');
  const lastRow = findLastRow(currData);
  const firstRow = data[0];
  while (data.length < lastRow + 1) {
    data.push(firstRow.map(x => ''));
  }

  const range = `Positions!A2:H${data.length + 1}`;
  await putSheetData('Positions', range, data);
  await putSheetData('Positions', 'Positions!J1', [[new Date()]]);
  debug('Positions data updated');
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

const locateSheets = once$1(async function locateSheets () {
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

const version = '1.1.0';

const prog = sade('pixprices');

prog.version(version);

prog
  .command('update', 'update data')
  .option('--get-portfolio', 'update from portfolio sheet')
  .option('--fetch-prices', 'fetch prices from LSE')
  .option('--update-positions', 'update positions sheet')
  .action(wrap(update));

prog.parse(process.argv);

async function update (options) {
  const portfolio = await Portfolio.deserialize();

  if (options['get-portfolio']) {
    const sheet = await getPortfolioSheet();
    portfolio.loadStocksFromSheet(sheet);
    portfolio.loadPositionsFromSheet(sheet);
  }

  if (options['fetch-prices']) {
    await portfolio.fetchPrices();
  }

  await portfolio.serialize();

  if (options['update-positions']) {
    await updatePositionsSheet(portfolio.getPositionsSheet());
  }
}
