#!/usr/bin/env node
import sade from 'sade';
import Debug from 'debug';
import cheerio from 'cheerio';
import { get } from 'httpie';

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

function jsDateToSerialDate (dt) {
  const ms = dt.getTime();
  const localMs = ms - dt.getTimezoneOffset() * 60 * 1000;
  const localDays = localMs / (1000 * 24 * 60 * 60);
  const epochStart = 25569;
  return epochStart + localDays
}

let KEY;

class Table$1 {
  constructor (kind) {
    this.kind = kind;
  }

  async * fetch () {
    const datastore = await getDatastoreAPI();
    const query = datastore.createQuery(this.kind);
    for await (const entity of query.runStream()) {
      yield entity;
    }
  }

  async fetchAll (options) {
    const entities = [];
    for await (const entity of this.fetch(options)) {
      entities.push(entity);
    }
    return entities
  }

  async insert (entities) {
    const datastore = await getDatastoreAPI();
    entities = verifyEntities(entities, { kind: this.kind, datastore });
    await datastore.insert(entities);
  }

  async upsert (entities) {
    const datastore = await getDatastoreAPI();
    entities = verifyEntities(entities, { kind: this.kind, datastore });
    await datastore.upsert(entities);
  }

  async delete (entities) {
    const datastore = await getDatastoreAPI();
    entities = verifyEntities(entities, { kind: this.kind, datastore });
    await datastore.delete(entities.map(e => e[datastore.KEY]));
  }
}

function getEntityKey (entity) {
  return entity[KEY]
}

const getDatastoreAPI = once$1(async function getDatastoreAPI ({
  credentials = 'credentials.json'
} = {}) {
  const { Datastore } = await import('@google-cloud/datastore');
  if (credentials) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentials;
  }

  const datastore = new Datastore();
  KEY = datastore.KEY;
  return datastore
});

function verifyEntities (arr, { kind, datastore }) {
  if (!Array.isArray(arr)) arr = [arr];
  for (const entity of arr) {
    if (!(datastore.KEY in entity)) {
      if ('id' in entity) {
        entity[datastore.KEY] = datastore.key([kind, entity.id]);
        delete entity.id;
      } else {
        entity[datastore.KEY] = datastore.key([kind]);
      }
    }
  }
  return arr
}

const debug$4 = Debug('pixprices:portfolio');

class Portfolio {
  constructor () {
    this.stocks = new Stocks();
    this.positions = new Positions();
  }

  async load () {
    await Promise.all([this.stocks.load(), this.positions.load()]);
  }

  async save () {
    await Promise.all([this.stocks.save(), this.positions.save()]);
  }
}

class Table {
  constructor (name) {
    this.name = name;
    this._table = new Table$1(name);
    this._map = new Map();
  }

  async load () {
    const entities = await this._table.fetchAll();
    debug$4('loaded %d entities from %s', entities.length, this.name);
    this._map = new Map(entities.map(entity => [this.getKey(entity), entity]));
    this._prevEntities = new Map(
      entities.map(entity => [getEntityKey(entity), entity])
    );
  }

  async save () {
    if (this._map.size) {
      await this._table.upsert(Array.from(this._map.values()));
      debug$4('upserted %d values in %s', this._map.size, this.name);
    }

    // build a list of old entities to delete
    this._map.forEach(entity => this._prevEntities.delete(getEntityKey(entity)));
    if (this._prevEntities.size) {
      await this._table.delete(Array.from(this._prevEntities.values()));
      debug$4('deleted %d values in %s', this._prevEntities.size, this.name);
      this._prevEntities.clear();
    }
  }

  get (keyData, Factory) {
    // returns an exsiting entity, or creates a new one
    const key = this.getKey(keyData);
    let entity = this._map.get(key);
    if (entity) return entity
    entity = Object.assign(Factory ? new Factory() : {}, keyData);
    this._map.set(key, entity);
    return entity
  }

  delete (keyData) {
    const key = this.getKey(keyData);
    this._map.delete(key);
  }

  values () {
    return this._map.values()
  }
}

class Stocks extends Table {
  constructor () {
    super('Stock');
  }

  getKey ({ ticker }) {
    return ticker
  }

  get (keyData) {
    return super.get(keyData, Stock)
  }
}

class Stock {}

class Positions extends Table {
  constructor () {
    super('Position');
  }

  getKey ({ who, account, ticker }) {
    return `${who}_${account}_${ticker}`
  }

  get (keyData) {
    return super.get(keyData, Position)
  }
}

class Position {}

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

const getSheetAPI = once$1(async function getSheetAPI ({
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

const getDriveAPI = once$1(async function getDriveAPI ({
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

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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

const debug$3 = Debug('pixprices:sheets');

const INVESTMENTS_FOLDER = '0B_zDokw1k2L7VjBGcExJeUxLSlE';

async function getPortfolioSheet () {
  const data = await getSheetData('Portfolio', 'Investments!A:AM');
  debug$3('Portfolio data retrieved');
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
  debug$3('Positions data updated');
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

const debug$2 = Debug('pixprices:import');

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
    const stock = stocks.get(item);
    notSeen.delete(stock);
    Object.assign(stock, item);
    count++;
  }
  notSeen.forEach(stock => stocks.delete(stock));
  debug$2(
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
    const position = positions.get(item);
    notSeen.delete(position);
    Object.assign(position, item);
    count++;
  }
  notSeen.forEach(position => positions.delete(position));
  debug$2(
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

const debug$1 = Debug('pixprices:fetch-lse');

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
        priceUpdated: now,
        priceSource: source
      });
    });
  debug$1('Read %d items from %s', items.length, source);
  return items
}

async function fetchPrice (ticker) {
  await delay(1000);
  ticker = ticker.padEnd(3, '.');

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

  debug$1('fetched %s from lse:share', ticker);

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

const debug = Debug('pixprices:fetch');

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
    for (const { ticker, ...data } of items) {
      if (!neededTickers.has(ticker)) continue
      const stock = stocks.get({ ticker });
      neededTickers.delete(ticker);
      count++;
      Object.assign(stock, data);
    }
    debug('%d prices from %s', count, name);
    if (!neededTickers.size) break
  }

  // now pick up the remaining ones
  for (const ticker of neededTickers) {
    const item = await fetchPrice(ticker);
    const stock = stocks.get({ ticker });
    Object.assign(stock, item);
  }

  if (neededTickers) {
    debug(
      '%d prices individually: %s',
      neededTickers.size,
      [...neededTickers].join(', ')
    );
  }
}

async function exportPositions (portfolio) {
  return updatePositionsSheet(getPositionsSheet(portfolio))
}

function getPositionsSheet (portfolio) {
  const rows = [];

  for (const { stock, position } of getPositions(portfolio)) {
    rows.push(makePositionRow({ stock, position }));
  }

  rows.sort((x, y) => {
    if (x.ticker < y.ticker) return -1
    if (x.ticker > y.ticker) return 1
    if (x.who < y.who) return -1
    if (x.who > y.who) return 1
    if (x.account < y.account) return -1
    if (x.account > y.account) return 1
    return 0
  });

  return rows
}

function * getPositions ({ positions, stocks }) {
  for (const position of positions.values()) {
    if (!position.qty) continue
    const stock = stocks.get({ ticker: position.ticker });
    yield { stock, position };
  }
}

function makePositionRow ({ position, stock }) {
  const { who, account, ticker, qty } = position;
  const { dividend, price } = stock;
  return [
    ticker,
    who,
    account,
    qty,
    price,
    dividend,
    Math.round(qty * price) / 100,
    dividend ? Math.round(qty * dividend) / 100 : undefined
  ]
}

async function update (options) {
  const portfolio = new Portfolio();
  await portfolio.load();

  if (options['get-portfolio']) {
    await importFromPortfolioSheet(portfolio);
  }

  if (options['fetch-prices']) {
    await fetchPrices(portfolio.stocks);
  }

  await portfolio.save();

  if (options['update-positions']) {
    await exportPositions(portfolio);
  }
}

const version = '1.1.0';

const prog = sade('pixprices');

prog.version(version);

prog
  .command('update', 'update data')
  .option('--get-portfolio', 'update from portfolio sheet')
  .option('--fetch-prices', 'fetch prices from LSE')
  .option('--update-positions', 'update positions sheet')
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
