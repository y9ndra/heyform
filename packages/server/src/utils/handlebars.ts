// @ts-ignore
import hbs from 'hbs'

const h = hbs as any

h.registerHelper('json', (v1: any) =>
  JSON.stringify(v1)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
)
h.registerHelper('eq', (v1, v2) => v1 === v2)
h.registerHelper('ne', (v1, v2) => v1 !== v2)

export default h
