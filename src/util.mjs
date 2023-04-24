import tinydate from 'tinydate'

const stamp = tinydate('{DDD} {DD} {MMM} {HH}:{mm}:{ss}', {
  DDD: d => d.toLocaleString('default', { weekday: 'short' }),
  MMM: d => d.toLocaleString('default', { month: 'short' })
})

export function log (txt) {
  console.log(stamp() + ' ' + txt)
}
