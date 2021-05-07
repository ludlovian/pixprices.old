import log from 'logjs'
import sortBy from 'sortby'
import equal from 'pixutil/equal'
import { Table as DatastoreTable, Row } from 'googlejs/datastore'

const debug = log
  .prefix('portfolio:')
  .colour()
  .level(2)

export default class Portfolio {
  constructor () {
    this.stocks = new Stocks()
    this.positions = new Positions()
    this.trades = new Trades()
  }

  async load () {
    await Promise.all([
      this.stocks.load(),
      this.positions.load(),
      this.trades.load()
    ])
  }

  async save () {
    await Promise.all([
      this.stocks.save(),
      this.positions.save(),
      this.trades.save()
    ])
  }
}

class Table {
  constructor (name) {
    this.name = name
    this._table = new DatastoreTable(name)
  }

  async load () {
    const rows = await this._table.select({ factory: this.factory })
    if (this.order) rows.sort(this.order)
    this._rows = new Set(rows)
    this._prevRows = new Set(rows)
    this._changed = new Set()
    debug('loaded %d rows from %s', rows.length, this.name)
  }

  async save () {
    const changed = [...this._changed]
    const deleted = [...this._prevRows].filter(row => !this._rows.has(row))
    if (changed.length) {
      await this._table.upsert(changed)
      debug('upserted %d rows in %s', changed.length, this.name)
    }

    if (deleted.length) {
      await this._table.delete(deleted)
      debug('deleted %d rows in %s', deleted.length, this.name)
    }
  }

  * find (fn) {
    for (const row of this._rows) {
      if (fn(row)) yield row
    }
  }

  set (data) {
    const key = this.key(data)
    const fn = row => equal(this.key(row), key)
    const [row] = [...this.find(fn)]
    if (row) {
      Object.assign(row, data)
      this._changed.add(row)
      return row
    } else {
      const row = { ...data }
      this._rows.add(row)
      this._changed.add(row)
      return row
    }
  }

  delete (data) {
    const key = this.key(data)
    const fn = row => equal(this.key(row), key)
    const [row] = [...this.find(fn)]
    if (!row) return
    this._rows.delete(row)
    this._changed.delete(row)
    return row
  }

  values () {
    return this._rows.values()
  }
}

class Stocks extends Table {
  constructor () {
    super('Stock')
    this.factory = Stock
    this.order = sortBy('ticker')
    this.key = ({ ticker }) => ({ ticker })
  }

  get (ticker) {
    const fn = row => row.ticker === ticker
    return this.find(fn).next().value
  }
}

class Stock extends Row {}

class Positions extends Table {
  constructor () {
    super('Position')
    this.factory = Position
    this.order = sortBy('ticker')
      .thenBy('who')
      .thenBy('account')
    this.key = ({ ticker, who, account }) => ({ ticker, who, account })
  }
}

class Position extends Row {}

class Trades extends Table {
  constructor () {
    super('Trade')
    this.factory = Trade
    this.order = sortBy('who')
      .thenBy('account')
      .thenBy('ticker')
      .thenBy('seq')
    this.key = ({ who, account, ticker, seq }) => ({
      who,
      account,
      ticker,
      seq
    })
  }

  setTrades (data) {
    const getKey = ({ who, account, ticker }) => ({ who, account, ticker })
    const key = getKey(data[0])
    const fn = row => equal(getKey(row), key)
    const existing = [...this.find(fn)]
    let seq = 1
    for (const row of data) {
      this.set({ ...row, seq })
      seq++
    }
    for (const row of existing.slice(data.length)) {
      this.delete(row)
    }
  }
}

class Trade extends Row {}
