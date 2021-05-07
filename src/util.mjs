export function matches (part, obj) {
  for (const k in part) {
    if (obj[k] !== part[k]) return false
  }
  return true
}
