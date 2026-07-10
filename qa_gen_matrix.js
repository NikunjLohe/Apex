import { RANKS } from './src/data/ranks.js'

let rates = [8, 10, 12, 14, 16, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
let matrix = {}
RANKS.forEach((r, i) => {
  matrix[r.code] = rates[i]
})
console.log(JSON.stringify(matrix))
