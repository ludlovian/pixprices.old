import once from 'pixutil/once'

import * as sheets from 'googlejs/sheets'
import * as drive from 'googlejs/drive'

const INVESTMENTS_FOLDER = '0B_zDokw1k2L7VjBGcExJeUxLSlE'

const locateSheets = once(async function locateSheets () {
  const m = new Map()
  const files = drive.list({ folder: INVESTMENTS_FOLDER })
  for await (const file of files) {
    m.set(file.name, file)
  }
  return m
})

export async function getSheetData (sheetName, range) {
  const sheetList = await locateSheets()
  const sheet = sheetList.get(sheetName).id

  return sheets.getRange({ sheet, range, scopes: sheets.scopes.rw })
}

export async function putSheetData (sheetName, range, data) {
  const sheetList = await locateSheets()
  const sheet = sheetList.get(sheetName).id

  await sheets.updateRange({ sheet, range, data, scopes: sheets.scopes.rw })
}

export async function overwriteSheetData (sheetName, range, data) {
  const currData = await getSheetData(sheetName, range)
  while (data.length < currData.length) {
    data.push(data[0].map(() => ''))
  }

  const newRange = range.replace(/\d+$/, '') + (data.length + 1)
  await putSheetData(sheetName, newRange, data)
}
