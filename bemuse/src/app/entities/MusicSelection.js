import u from 'updeep'
import _ from 'lodash'

export const initialState = {
  selectedSongId: null,
  selectedChartId: null,
  selectedChartLevel: 1,
}

// Queries
export const selectedSongGivenSongs = (songs) => (state) => {
  const song = _.find(songs, { id: state.selectedSongId })
  if (song) return song
  return songs[0]
}
export const selectedChartGivenCharts = (charts) => (state) => {
  charts = charts || []
  const chart = _.find(charts, { file: state.selectedChartId })
  if (chart) return chart
  return _.minBy(charts, (chart) =>
    Math.abs(getChartLevel(chart) - state.selectedChartLevel)
  )
}

// Updater
export const selectSong = (songId) =>
  u({
    selectedSongId: songId,
  })
export const selectChart = (songId, chartId, chartLevel) =>
  u({
    selectedSongId: songId,
    selectedChartId: chartId,
    selectedChartLevel: chartLevel,
  })

// Utilities
export function getChartLevel(chart) {
  return chart.info.level + (chart.info.difficulty === 5 ? 1000 : 0)
}
