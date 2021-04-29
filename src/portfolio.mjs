import log from 'logjs'
import { Table as DatastoreTable, Row } from 'googlejs/datastore'

const debug = log
  .prefix('portfolio:')
  .colour()
  .level(2)

export default class Portfolio {
  constructor () {
    this.stocks = new Stocks()
    this.positions = new Positions()
  }

  async load () {
    await Promise.all([this.stocks.load(), this.positions.load()])
  }

  async save () {
    await Promise.all([this.stocks.save(), this.positions.save()])
  }
}

class Table {
  constructor (name) {
    this.name = name
    this._table = new DatastoreTable(name)
    this._map = new Map()
  }

  async load () {
    const rows = await this._table.select({ factory: this.factory })
    debug('loaded %d rows from %s', rows.length, this.name)
    this._map = new Map(rows.map(row => [this.getKey(row), row]))
    this._prevRows = new Set(rows)
  }

  async save () {
    if (this._map.size) {
      await this._table.upsert(Array.from(this._map.values()))
      debug('upserted %d rows in %s', this._map.size, this.name)
    }

    // build a list of old entities to delete
    this._map.forEach(row => this._prevRows.delete(row))
    if (this._prevRows.size) {
      await this._table.delete([...this._prevRows])
      debug('deleted %d rows in %s', this._prevRows.size, this.name)
      this._prevRows.clear()
    }
  }

  get (keyData) {
    // returns an exsiting item, or creates a new one
    const key = this.getKey(keyData)
    let item = this._map.get(key)
    if (item) return item
    item = { ...keyData }
    this._map.set(key, item)
    return item
  }

  delete (keyData) {
    const key = this.getKey(keyData)
    this._map.delete(key)
  }

  values () {
    return this._map.values()
  }
}

class Stocks extends Table {
  constructor () {
    super('Stock')
    this.factory = Stock
  }

  getKey ({ ticker }) {
    return ticker
  }
}

class Stock extends Row {}

class Positions extends Table {
  constructor () {
    super('Position')
    this.factory = Position
  }

  getKey ({ who, account, ticker }) {
    return `${who}_${account}_${ticker}`
  }
}

class Position extends Row {}
