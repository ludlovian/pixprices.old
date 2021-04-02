'use strict'

import Debug from 'debug'

import { getAll } from './db'
import { writeFile, unlink } from 'fs/promises'
import { upload } from 's3js'

const debug = Debug('pixprices:publish')

export async function publishPrices (opts) {
  const { tempfile, s3file } = opts
  const items = await getAll(opts)
  const data = items.reduce((data, rec) => {
    const { _id, code, time, ...rest } = rec
    data[code] = { code, ...rest, time: +time }
    return data
  }, {})

  await writeFile(tempfile, JSON.stringify(data), 'utf8')
  await upload(tempfile, s3file)
  await unlink(tempfile)
  debug('%d prices uploaded to %s', items.length, s3file)
}
