'use strict'

import ms from 'ms'
import Debug from 'debug'

import Database from 'jsdbd'

const debug = Debug('pixprices:db')

export async function writePrices (items, opts) {
  const db = await getDB(opts)
  const recs = await db.getAll()
  const inserts = []
  const updates = []
  items.forEach(item => {
    const prev = recs.find(rec => rec.code === item.code)
    if (prev) {
      updates.push({ ...prev, ...item })
    } else {
      inserts.push(item)
    }
  })
  if (inserts.length) {
    await db.insert(inserts)
  }

  if (updates.length) {
    await db.update(updates)
  }

  debug('wrote %d records', items.length)
}

export async function purgeOldPrices (timeSpec, opts) {
  const db = await getDB(opts)
  const cutoff = Date.now() - ms(timeSpec + '')
  const recs = await db.getAll()
  const old = recs.filter(({ time }) => time < cutoff)
  if (old.length) {
    await db.delete(old)
    await db.compact()
    debug('%d records were older than %s', old.length, timeSpec)
  }
}

export async function getAll (opts) {
  const db = await getDB(opts)
  return db.getAll()
}

async function getDB ({ database: dbFile }) {
  const db = new Database(dbFile)
  await db.ensureIndex({ fieldName: 'code', unique: true })
  return db
}
