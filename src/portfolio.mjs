import Debug from 'debug'
import { Table as DatastoreTable, getEntityKey } from 'googlejs/datastore'

const debug = Debug('pixprices:portfolio')

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
    const entities = await this._table.fetchAll()
    debug('loaded %d entities from %s', entities.length, this.name)
    this._map = new Map(entities.map(entity => [this.getKey(entity), entity]))
    this._prevEntities = new Map(
      entities.map(entity => [getEntityKey(entity), entity])
    )
  }

  async save () {
    if (this._map.size) {
      await this._table.upsert(Array.from(this._map.values()))
      debug('upserted %d values in %s', this._map.size, this.name)
    }

    // build a list of old entities to delete
    this._map.forEach(entity => this._prevEntities.delete(getEntityKey(entity)))
    if (this._prevEntities.size) {
      await this._table.delete(Array.from(this._prevEntities.values()))
      debug('deleted %d values in %s', this._prevEntities.size, this.name)
      this._prevEntities.clear()
    }
  }

  get (keyData, Factory) {
    // returns an exsiting entity, or creates a new one
    const key = this.getKey(keyData)
    let entity = this._map.get(key)
    if (entity) return entity
    entity = Object.assign(Factory ? new Factory() : {}, keyData)
    this._map.set(key, entity)
    return entity
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
    super('Position')
  }

  getKey ({ who, account, ticker }) {
    return `${who}_${account}_${ticker}`
  }

  get (keyData) {
    return super.get(keyData, Position)
  }
}

class Position {}
