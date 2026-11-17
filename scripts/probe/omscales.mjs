// Probe: the colour scales the Open-Meteo map layer ships for the variables we overlay.
import { COLOR_SCALES } from '@openmeteo/mapbox-layer'
console.log('scale keys:', Object.keys(COLOR_SCALES).join(', '))
for (const key of ['precipitation', 'snowfall', 'snowfall_water_equivalent', 'temperature', 'temperature_2m', 'snow_depth', 'cloud_cover', 'wind']) {
  const s = COLOR_SCALES[key]
  if (!s) {
    console.log(key, '-> none')
    continue
  }
  const colors = Array.isArray(s.colors) ? s.colors : s.colors.light
  console.log(key, '->', s.type, s.unit, 'min', s.min, 'max', s.max, 'breakpoints', JSON.stringify(s.breakpoints), 'colors', colors.length, JSON.stringify(colors.slice(0, 3)))
}
